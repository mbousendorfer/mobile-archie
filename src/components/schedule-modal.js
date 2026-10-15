import { html, raw, escapeText, escapeAttr } from "../utils.js?v=1841";
import { showToast } from "./toast.js?v=1841";
import { getQueueOn, dayKey, addToQueue, subscribe as subscribeQueue } from "../schedule-store.js?v=1841";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=1841";
import {
  renderProfileTag,
  profileForNetwork,
  NETWORK_LABEL,
  NETWORK_ICON_BY_PLATFORM,
  normalizeNetwork,
} from "../social-profiles.js?v=1841";
import { getContextById } from "../contexts-store.js?v=1841";
import { canEdit } from "../playbook-access.js?v=1841";
import { getPreset, savePreset } from "../schedule-presets-store.js?v=1841";
import {
  CADENCES,
  startOfDay,
  defaultStartFrom,
  defaultStrategy,
  networkOf,
  planSlots,
  queueEntries,
  firstLine as extractFirstLine,
} from "../schedule-engine.js?v=1841";

// Schedule modal — one column, result first.
//   • Header   — "Schedule N drafts" + one line saying I already picked.
//   • Rhythm   — ONE sentence summing up how the dates were picked
//                ("Every weekday · from Sat 26 Sep · best time per network")
//                and an "Adjust" disclosure, closed at rest, holding the
//                four settings: rhythm (multi only), start day, time of day,
//                days to skip. Every change re-spreads live.
//   • Timeline — the batch as a posting schedule: ONE bordered list, one row
//                per draft in date order, hairlines between rows. Each row
//                reads WHAT → WHEN: the draft on the left (media thumbnail
//                first, then profile + first lines), its date on the right
//                (a tinted cell — tile, time + pen, why, how busy the day
//                is), and the ✕ in a column of its own.
//   • Footer   — what the batch adds up to ("4 posts over 8 days"), the
//                disclosure line, then Cancel + the one primary.
//
// ⚠️ This replaced a two-mode version (Optimal / Custom radio cards, cadence
// chips, a free-text "describe your own strategy", a "Compute best times"
// gate, a month calendar and a drag-to-reorder list). Every control sat at
// the same level and two primaries competed — Compute unlocked Schedule and
// nothing said so, while the calendar already painted dates that did not
// yet count. Don't bring the gate or the mode picker back: dates are
// proposed on open, and editing one IS the custom mode.
//
// Finding the times TAKES a beat — ~2.5s on open and after every setting
// change, the rows landing one after another. That is a wait, not a gate:
// nothing to click to start it, and a change mid-way simply restarts it.
// Schedule waits for it (a date the user hasn't seen can't be confirmed).
//
// What else is on a suggested day is answered ON the row: a link naming the
// count ("2 other posts that day"), orange and naming the clash when a post on
// the SAME network sits within two hours, which unfolds that day's agenda
// under the row.
//
// The rhythm can be saved PER PLAYBOOK (schedule-presets-store): the modal
// opens on the chat's Playbook preset when there is one. Operational config,
// so a store keyed by Playbook — never a field on the fiche (CONCEPTS §1).
//
// A hand-edited date is PINNED: the settings re-spread every other draft
// around it and never overwrite it, and the row says so ("Set by you") with
// a way back to my suggestion.
//
// The mock end-to-end is the entire scope — confirm pushes new entries
// into schedule-store, fires a toast. Real Publishing API call is the
// replacement point.

const ROOT_ID = "scheduleModal";

// Time-of-day bias. `null` = each network's own best hour.
const TIMES_OF_DAY = [
  { id: null, label: "Best time", short: "best time per network" },
  { id: "morning", label: "Morning", short: "mornings" },
  { id: "afternoon", label: "Afternoon", short: "afternoons" },
  { id: "evening", label: "Evening", short: "evenings" },
];

// Monday-first, the way a work week reads. Values are sunday-first dow.
const WEEKDAYS = [
  { dow: 1, short: "Mon" },
  { dow: 2, short: "Tue" },
  { dow: 3, short: "Wed" },
  { dow: 4, short: "Thu" },
  { dow: 5, short: "Fri" },
  { dow: 6, short: "Sat" },
  { dow: 0, short: "Sun" },
];

function emptyState() {
  return {
    open: false,
    posts: [], // [{id, network, text/preview}]
    slots: [], // [{post, when: epoch ms, pinned: bool}] — one per draft, in post order
    strategy: { cadence: "weekdays", timeOfDay: null, skip: [], startFrom: null },
    adjustOpen: false,
    peekId: null, // the row whose day agenda is unfolded (one at a time)
    playbook: null, // the chat's Playbook — whose rhythm preset we read / save
    onConfirm: null,
    status: "idle", // 'idle' | 'scheduling' | 'error'
    errorMessage: "",
  };
}

let state = emptyState();
let unsubscribeQueue = null;

// The "finding the best times" beat: the first date lands after COMPUTE_MS,
// the last one COMPUTE_STAGGER_MS later — whatever the batch size, so a
// 12-draft batch doesn't take twice as long as a 3-draft one.
const COMPUTE_MS = 2000;
const COMPUTE_STAGGER_MS = 800;
let computeTimers = [];

function cancelCompute() {
  computeTimers.forEach(clearTimeout);
  computeTimers = [];
}

// Re-spread, then hold every freshly-picked date back until its turn.
// Pinned rows are never recomputed, so they never wait.
function compute() {
  cancelCompute();
  respread();
  const pending = state.slots.filter((s) => !s.pinned);
  pending.forEach((slot, i) => {
    slot.pending = true;
    const at = COMPUTE_MS + (pending.length > 1 ? Math.round((i * COMPUTE_STAGGER_MS) / (pending.length - 1)) : 0);
    computeTimers.push(
      setTimeout(() => {
        if (!state.open) return;
        slot.pending = false;
        slot.justLanded = true; // consumed by the next render — plays the landing once
        render();
      }, at),
    );
  });
}

function isComputing() {
  return state.slots.some((s) => s.pending);
}

export function init() {
  let scrim = document.getElementById(`${ROOT_ID}Scrim`);
  let modal = document.getElementById(ROOT_ID);
  if (!modal) {
    scrim = document.createElement("div");
    scrim.id = `${ROOT_ID}Scrim`;
    scrim.className = "schedule-modal__scrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);

    modal = document.createElement("div");
    modal.id = ROOT_ID;
    modal.className = "ap-dialog schedule-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", `${ROOT_ID}Title`);
    modal.hidden = true;
    document.body.appendChild(modal);
  }

  modal.addEventListener("click", onClick);
  modal.addEventListener("change", onChange);
  // Backdrop click + Escape go through the shared coordinator. `state.open`
  // is the canonical isOpen — visibility is driven by .hidden.
  // Escape closes the day popover first; the dialog only on the next press.
  // Capture on document runs before the coordinator's own keydown listener.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !state.open || !state.peekId) return;
      event.stopPropagation();
      closePeek();
    },
    true,
  );
  bindOverlayDismissal({
    modal,
    backdrop: scrim,
    close,
    isOpen: () => state.open,
  });
}

export function open({ posts, onConfirm, playbookId = null }) {
  if (!posts || posts.length === 0) return;
  // Register with the coordinator first so any other overlay currently
  // up gets closed before we paint; it also snapshots the trigger for focus.
  requestOpen(ROOT_ID, close);
  const playbook = playbookId ? getContextById(playbookId) : null;
  state = {
    ...emptyState(),
    open: true,
    posts: [...posts],
    playbook,
    // The Playbook's saved rhythm when it has one — but never its start date:
    // a batch always starts tomorrow.
    strategy: defaultStrategy(playbook?.id),
    onConfirm: typeof onConfirm === "function" ? onConfirm : null,
  };
  // Dates are proposed on open — the user waits for them, never asks for them.
  compute();
  state.entering = true; // first paint staggers the rows in (consumed by render)
  if (!unsubscribeQueue) {
    unsubscribeQueue = subscribeQueue(() => {
      if (state.open) render();
    });
  }
  render();
}

function close() {
  cancelCompute();
  state = emptyState();
  if (unsubscribeQueue) {
    unsubscribeQueue();
    unsubscribeQueue = null;
  }
  render();
  notifyClose(ROOT_ID);
}

// ── The spread ────────────────────────────────────────────────────────
// The engine lives in schedule-engine.js (the chat proposes the same dates).
// Re-spread every draft the user hasn't set by hand; pinned rows keep theirs.
function respread() {
  state.slots = planSlots(state.posts, state.strategy, state.slots);
}

// ── Events ────────────────────────────────────────────────────────────
function onClick(event) {
  // One .ap-select open at a time — a click anywhere else in the dialog
  // closes the others (the <details> doesn't do it on its own).
  event.currentTarget.querySelectorAll("details.ap-select[open]").forEach((d) => {
    if (!d.contains(event.target)) d.open = false;
  });

  // A click anywhere outside the day popover (and its own link) closes it.
  if (state.peekId && !event.target.closest(".schedule-modal__peek") && !event.target.closest("[data-schedule-peek]")) {
    state.peekId = null;
    render();
  }

  if (event.target.closest("[data-schedule-close]")) {
    close();
    return;
  }
  if (event.target.closest("[data-schedule-adjust]")) {
    state.adjustOpen = !state.adjustOpen;
    state.adjustRevealing = state.adjustOpen;
    render();
    return;
  }
  const cadence = event.target.closest("[data-schedule-cadence]");
  if (cadence) {
    state.strategy.cadence = cadence.dataset.scheduleCadence;
    compute();
    render();
    return;
  }
  const tod = event.target.closest("[data-schedule-tod]");
  if (tod) {
    state.strategy.timeOfDay = tod.dataset.scheduleTod || null;
    compute();
    render();
    return;
  }
  // The time on a row is text, not a field: its pen opens the browser's own
  // date-time picker, anchored on a hidden input sitting under the row head.
  const when = event.target.closest("[data-schedule-when]");
  if (when) {
    const input = modal().querySelector(`[data-schedule-slot="${CSS.escape(when.dataset.scheduleWhen)}"]`);
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
    return;
  }
  const skipDay = event.target.closest("[data-schedule-skip-day]");
  if (skipDay) {
    const dow = parseInt(skipDay.dataset.scheduleSkipDay, 10);
    const skip = new Set(state.strategy.skip);
    if (skip.has(dow)) skip.delete(dow);
    else skip.add(dow);
    // Skipping all seven days would leave nowhere to post — refuse the last one.
    if (skip.size === 7) return;
    state.strategy.skip = [...skip];
    compute();
    render();
    return;
  }
  const peek = event.target.closest("[data-schedule-peek]");
  if (peek) {
    state.peekId = state.peekId === peek.dataset.schedulePeek ? null : peek.dataset.schedulePeek;
    render();
    return;
  }
  if (event.target.closest("[data-schedule-restore-preset]")) {
    const saved = state.playbook ? getPreset(state.playbook.id) : null;
    if (!saved) return;
    // Back to the Playbook's rhythm — the start date stays the one chosen.
    state.strategy = { ...saved, startFrom: state.strategy.startFrom };
    compute();
    render();
    return;
  }
  if (event.target.closest("[data-schedule-save-preset]")) {
    if (!state.playbook || !canEdit(state.playbook)) return;
    const { cadence, timeOfDay, skip } = state.strategy;
    savePreset(state.playbook.id, { cadence, timeOfDay, skip });
    render();
    return;
  }
  const reset = event.target.closest("[data-schedule-reset]");
  if (reset) {
    const slot = state.slots.find((s) => s.post.id === reset.dataset.scheduleReset);
    if (slot) slot.pinned = false;
    compute();
    render();
    return;
  }
  const removeBtn = event.target.closest("[data-schedule-remove]");
  if (removeBtn) {
    const id = removeBtn.dataset.scheduleRemove;
    state.posts = state.posts.filter((p) => p.id !== id);
    state.slots = state.slots.filter((s) => s.post.id !== id);
    if (state.posts.length === 0) close();
    else render();
    return;
  }
  if (event.target.closest("[data-schedule-confirm]")) {
    if (state.status === "scheduling" || isComputing()) return;
    confirmSchedule();
  }
}

function onChange(event) {
  if (event.target.matches("[data-schedule-start]")) {
    const ts = new Date(`${event.target.value}T00:00:00`).getTime();
    if (isNaN(ts)) return;
    state.strategy.startFrom = ts;
    compute();
    render();
    return;
  }
  const slotInput = event.target.closest("[data-schedule-slot]");
  if (slotInput) {
    const ts = new Date(slotInput.value).getTime();
    const slot = state.slots.find((s) => s.post.id === slotInput.dataset.scheduleSlot);
    if (!slot || isNaN(ts)) return;
    slot.when = ts;
    slot.pinned = true;
    slot.justLanded = true; // the row moves to its new place in the timeline — say so
    render();
  }
}

function confirmSchedule() {
  state.status = "scheduling";
  state.errorMessage = "";
  render();

  const slots = state.slots.map((s) => ({ postId: s.post.id, when: s.when }));

  // Push into the live schedule queue before onConfirm, which may close the modal.
  addToQueue(queueEntries(state.slots));

  let result;
  try {
    result = state.onConfirm ? state.onConfirm(slots) : undefined;
  } catch (err) {
    onConfirmFailed(err);
    return;
  }

  if (result && typeof result.then === "function") {
    Promise.resolve(result).then(() => onConfirmSucceeded(slots), onConfirmFailed);
  } else {
    onConfirmSucceeded(slots);
  }
}

function onConfirmSucceeded(slots) {
  showToast(`${slots.length} ${slots.length === 1 ? "post" : "posts"} scheduled`);
  close();
}

function onConfirmFailed(err) {
  // eslint-disable-next-line no-console
  console.error("schedule-modal: confirm failed", err);
  state.status = "error";
  state.errorMessage = (err && err.message) || "Couldn't schedule those drafts. Try again.";
  render();
}

// ── Render ────────────────────────────────────────────────────────────
function modal() {
  return document.getElementById(ROOT_ID);
}

function render() {
  const scrim = document.getElementById(`${ROOT_ID}Scrim`);
  const modal = document.getElementById(ROOT_ID);
  if (!scrim || !modal) return;
  if (!state.open) {
    scrim.hidden = true;
    modal.hidden = true;
    modal.innerHTML = "";
    return;
  }
  scrim.hidden = false;
  modal.hidden = false;
  // The reveal re-renders while the user may have a select open — keep it open.
  const openSelect = modal.querySelector("details.ap-select[open]")?.dataset.selectKey;
  modal.innerHTML = renderInner();
  if (state.peekId) {
    placePeek(modal);
    // The popover is pinned to the dialog, not the scroller — scrolling
    // would slide the link out from under it, so a scroll closes it.
    modal.querySelector(".schedule-modal__body")?.addEventListener("scroll", closePeek, { once: true });
  }
  // One-shot animation flags: each plays on exactly one paint, so the
  // re-renders the staggered reveal causes never restart an animation.
  state.entering = false;
  state.adjustRevealing = false;
  state.slots.forEach((slot) => (slot.justLanded = false));
  if (openSelect) {
    const again = modal.querySelector(`details.ap-select[data-select-key="${openSelect}"]`);
    if (again) again.open = true;
  }
}

function renderInner() {
  const n = state.posts.length;
  const busy = state.status === "scheduling";
  const computing = isComputing();
  return html`
    <div class="ap-dialog-header">
      <span class="ap-dialog-title" id="${ROOT_ID}Title">Schedule ${n} ${n === 1 ? "draft" : "drafts"}</span>
      <span class="ap-dialog-subtitle">
        ${computing
          ? n === 1
            ? "I'm finding the best time for this post, around what's already scheduled."
            : "I'm finding the best time for each draft, around what's already scheduled."
          : // Same words as the computing line, one verb apart: the two must wrap
            // the same, or the dialog's height jumps when the times land.
            n === 1
            ? "I picked the best time for this post, around what's already scheduled."
            : "I picked the best time for each draft, around what's already scheduled."}
      </span>
    </div>

    <div class="ap-dialog-content schedule-modal__body">
      ${state.status === "error"
        ? raw(`
            <div class="ap-infobox error" role="alert">
              <i class="ap-icon-error_fill" aria-hidden="true"></i>
              <div class="ap-infobox-content">
                <div class="ap-infobox-texts">
                  <span class="ap-infobox-message">${escapeText(state.errorMessage)}</span>
                </div>
              </div>
            </div>
          `)
        : ""}
      ${raw(renderRhythm())} ${raw(renderTimeline())}
    </div>

    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left schedule-modal__foot">${raw(renderFootSummary())}</div>
      <div class="ap-dialog-footer-right">
        <button type="button" class="ap-button ghost grey" data-schedule-close ${busy ? "disabled" : ""}>Cancel</button>
        <button
          type="button"
          class="ap-button primary orange"
          data-schedule-confirm
          ${busy || computing ? "disabled" : ""}
        >
          ${busy
            ? raw(`<span class="schedule-modal__spinner" aria-hidden="true"></span><span>Scheduling…</span>`)
            : raw(
                `<i class="ap-icon-calendar"></i><span>${state.status === "error" ? "Try again" : `Schedule ${n} ${n === 1 ? "post" : "posts"}`}</span>`,
              )}
        </button>
      </div>
    </div>

    <button type="button" class="ap-dialog-close" data-schedule-close aria-label="Close (Esc)">
      <i class="ap-icon-close"></i>
    </button>
    ${raw(renderPeekPopover())}
  `;
}

// ── Formatting (en-US like the rest of the copy — a French date inside an
// English sentence reads as a bug) ──────────────────────────────────────
function formatDay(ts) {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

function formatShortDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function networkName(network) {
  return NETWORK_LABEL[normalizeNetwork(network)] || network;
}

// ── How I picked ──────────────────────────────────────────────────────
// One sentence, its variable parts in bold — the closed state of the
// settings, so the reasoning is read before a way to change it is offered.
function rhythmSentence() {
  const s = state.strategy;
  const b = (t) => `<strong>${escapeText(t)}</strong>`;
  const tod = TIMES_OF_DAY.find((t) => t.id === s.timeOfDay) || TIMES_OF_DAY[0];
  // One network in the batch (the usual case) → name it; "each network's"
  // only reads right when the batch mixes them.
  const nets = [...new Set(state.posts.map((p) => networkName(networkOf(p))))];
  const best = nets.length === 1 ? `${nets[0]}'s best time` : "each network's best time";
  const at = s.timeOfDay ? `in the ${b(tod.label.toLowerCase())}` : `at ${b(best)}`;
  const skip = s.skip.length
    ? `, never on ${b(
        WEEKDAYS.filter((w) => s.skip.includes(w.dow))
          .map((w) => w.short)
          .join(", "),
      )}`
    : "";
  // Whose rhythm this is, when it's the Playbook's saved one.
  const lead = usingSavedPreset() ? `${b(`${state.playbook.name}'s rhythm`)} — ` : "";
  if (state.posts.length === 1) {
    const name = networkName(networkOf(state.posts[0]));
    const when = s.timeOfDay ? `in the ${b(tod.label.toLowerCase())}` : `at ${b(`${name}'s best time`)}`;
    return `${lead}${lead ? "from" : "From"} ${b(formatDay(s.startFrom))}, ${when}${skip}.`;
  }
  const cadence = CADENCES.find((c) => c.id === s.cadence) || CADENCES[0];
  return `${lead}${b(cadence.label)} from ${b(formatDay(s.startFrom))}, ${at}${skip}.`;
}

function sameRhythm(a, b) {
  return (
    a.cadence === b.cadence &&
    (a.timeOfDay || null) === (b.timeOfDay || null) &&
    [...a.skip].sort().join() === [...b.skip].sort().join()
  );
}

function usingSavedPreset() {
  const saved = state.playbook ? getPreset(state.playbook.id) : null;
  return !!saved && sameRhythm(saved, state.strategy);
}

// Saving the rhythm for the chat's Playbook — a quiet action at the end of
// the skip-days row, not a section of its own: it is the rare gesture of the
// panel, so it takes no height. The Playbook is named in the tooltip; once
// saved, the sentence above names it too ("Acme · Q2 marketing's rhythm —").
// Saving is the owner's call, like editing the fiche.
function renderPresetAction() {
  const ctx = state.playbook;
  if (!ctx) return "";
  const name = ctx.name;
  const owner = canEdit(ctx);
  const saved = getPreset(ctx.id);
  const tip = escapeText(`${name} starts from this rhythm every time you schedule for it.`);
  // 1 — no rhythm saved yet.
  if (!saved) {
    return owner
      ? `<button type="button" class="ap-button ghost blue schedule-modal__preset-save" data-schedule-save-preset data-tooltip="${tip}">
          <i class="ap-icon-bookmark" aria-hidden="true"></i><span>Save for this Playbook</span>
        </button>`
      : `<span class="schedule-modal__preset-note" data-tooltip="${escapeAttr(`Only the owner of ${name} can save its posting rhythm.`)}">Only the owner can save it</span>`;
  }
  // 2 — the settings ARE the Playbook's rhythm.
  if (usingSavedPreset()) {
    return `<span class="schedule-modal__preset-note is-saved" data-tooltip="${tip}"><i class="ap-icon-check" aria-hidden="true"></i>This Playbook's rhythm</span>`;
  }
  // 3 — a rhythm is saved and these settings drift from it: say so, offer the
  // way back to it (anyone), and the way to make this the new one (owner).
  // Changing a setting for one batch must never silently rewrite the brand's.
  return `
    <span class="schedule-modal__preset-note" data-tooltip="${escapeAttr(`${name}'s rhythm: ${rhythmLabel(saved)}`)}">
      Not this Playbook's rhythm ·
      <button type="button" class="ap-link small" data-schedule-restore-preset>Restore</button>
      ${owner ? `· <button type="button" class="ap-link small" data-schedule-save-preset>Update</button>` : ""}
    </span>`;
}

// A saved rhythm in words, for the "Not this Playbook's rhythm" tooltip.
function rhythmLabel(r) {
  const cadence = (CADENCES.find((c) => c.id === r.cadence) || CADENCES[0]).label;
  const tod = r.timeOfDay ? `, in the ${r.timeOfDay}` : ", at each network's best time";
  const skip = r.skip.length
    ? `, never on ${WEEKDAYS.filter((w) => r.skip.includes(w.dow))
        .map((w) => w.short)
        .join(", ")}`
    : "";
  return `${cadence}${tod}${skip}`;
}

function renderRhythm() {
  const open = state.adjustOpen;
  return `
    <section class="schedule-modal__rhythm${open ? " is-open" : ""}" aria-label="How I picked the dates">
      <div class="schedule-modal__rhythm-head">
        <span class="schedule-modal__rhythm-mark" aria-hidden="true">
          ${
            isComputing()
              ? `<span class="ap-loader size-16"></span>`
              : `<i class="ap-icon-sparkles schedule-modal__rhythm-icon"></i>`
          }
        </span>
        <p class="schedule-modal__rhythm-summary">${rhythmSentence()}</p>
        <button
          type="button"
          class="ap-button ghost blue schedule-modal__adjust"
          data-schedule-adjust
          aria-expanded="${open ? "true" : "false"}"
          aria-controls="scheduleAdjust"
        >
          <span>${open ? "Done" : "Adjust"}</span>
          <i class="ap-icon-chevron-down schedule-modal__adjust-arrow" aria-hidden="true"></i>
        </button>
      </div>
      ${open ? renderSettings() : ""}
    </section>
  `;
}

function renderSelect({ label, value, options, attr }) {
  const items = options
    .map(
      (o) => `
      <div class="ap-select-option${o.selected ? " selected" : ""}" ${attr}="${o.id ?? ""}" role="option" aria-selected="${o.selected}">
        <span class="ap-select-option-text">${escapeText(o.label)}</span>
        ${o.selected ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
      </div>`,
    )
    .join("");
  return `
    <details class="ap-select" data-select-key="${attr}">
      <summary class="ap-select-trigger" aria-label="${escapeAttr(label)}">
        <span class="ap-select-value">${escapeText(value)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="${escapeAttr(label)}">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>
  `;
}

function renderSettings() {
  const s = state.strategy;
  const multi = state.posts.length > 1;
  const cadence = CADENCES.find((c) => c.id === s.cadence) || CADENCES[0];
  const tod = TIMES_OF_DAY.find((t) => t.id === s.timeOfDay) || TIMES_OF_DAY[0];
  // Seven toggle chips — pressed = skipped. Half the width of seven labelled
  // checkboxes, which is what lets the preset action share their row.
  const skipBoxes = WEEKDAYS.map(
    (w) => `
      <button
        type="button"
        class="ap-filter-chip"
        data-schedule-skip-day="${w.dow}"
        aria-pressed="${s.skip.includes(w.dow) ? "true" : "false"}"
      >${w.short}</button>`,
  ).join("");
  return `
    <div
      class="schedule-modal__settings${multi ? " schedule-modal__settings--three" : ""}${state.adjustRevealing ? " is-revealing" : ""}"
      id="scheduleAdjust"
    >
      ${
        multi
          ? `<div class="ap-form-field">
        <label>Posting rhythm</label>
        ${renderSelect({
          label: "Posting rhythm",
          value: cadence.label,
          attr: "data-schedule-cadence",
          options: CADENCES.map((c) => ({ id: c.id, label: c.label, selected: c.id === cadence.id })),
        })}
      </div>`
          : ""
      }
      <div class="ap-form-field">
        <label for="scheduleStartFrom">Starting</label>
        <div class="ap-input-group">
          <i class="ap-icon-calendar" aria-hidden="true"></i>
          <input type="date" id="scheduleStartFrom" value="${toDateInput(s.startFrom)}" data-schedule-start />
        </div>
      </div>
      <div class="ap-form-field">
        <label>Time of day</label>
        ${renderSelect({
          label: "Time of day",
          value: tod.label,
          attr: "data-schedule-tod",
          options: TIMES_OF_DAY.map((t) => ({ id: t.id, label: t.label, selected: t.id === tod.id })),
        })}
      </div>
      <div class="schedule-modal__settings-foot">
        <div class="schedule-modal__skip" role="group" aria-labelledby="scheduleSkipLabel">
          <span class="schedule-modal__skip-label" id="scheduleSkipLabel">Skip</span>
          ${skipBoxes}
        </div>
        ${renderPresetAction()}
      </div>
    </div>
  `;
}

// Why I picked THIS time. There is one concept — the network's BEST TIME —
// whatever made it (its best days, the rhythm, a time-of-day bias): the
// badge on the tile says it for every date I picked, and this is its
// tooltip. "Best hour" / "Best window" / "Best morning hour" were three
// words for one idea and got merged.
// No days in the tooltip: the date is the rhythm's, the hour is the network's,
// and naming the network's best days on a date outside them contradicted it.
function reasonFor(slot) {
  const name = networkName(networkOf(slot.post));
  const tod = state.strategy.timeOfDay;
  return tod ? `${name}'s best time in the ${tod}` : `${name}'s best time`;
}

// What else is on the day a draft lands on — the queue plus the other
// drafts of this batch. It replaces the calendar: the one thing the calendar
// was for was "am I stacking on a busy day?", and the answer belongs on the
// row being decided. A CLASH is a post on the same network within two hours
// — the case that actually costs reach, so it's the one that turns orange.
const CLASH_MS = 2 * 60 * 60 * 1000;

const platformOf = normalizeNetwork;

function dayAgenda(slot) {
  const key = dayKey(slot.when);
  const mine = platformOf(networkOf(slot.post));
  const items = [
    ...getQueueOn(slot.when).map((e) => ({
      when: e.when,
      network: platformOf(e.network),
      text: e.text,
      isBatch: false,
    })),
    ...state.slots
      .filter((s) => s !== slot && !s.pending && dayKey(s.when) === key)
      .map((s) => ({
        when: s.when,
        network: platformOf(networkOf(s.post)),
        text: extractFirstLine(s.post),
        isBatch: true,
      })),
  ]
    .map((e) => ({ ...e, clash: e.network === mine && Math.abs(e.when - slot.when) < CLASH_MS }))
    .sort((a, b) => a.when - b.when);
  return { items, clash: items.find((e) => e.clash) || null };
}

function formatGap(ms) {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min === 0) return "same time";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

// The row's note: a link that names what's there and unfolds the day. Short
// on purpose — it lives in the WHEN cell; which post, on which network, is
// one click away in the unfolded agenda.
function renderDayNote(slot, agenda) {
  if (!agenda.items.length) return "";
  const id = escapeText(slot.post.id);
  const open = state.peekId === slot.post.id;
  const n = agenda.items.length;
  const label = agenda.clash
    ? (() => {
        const gap = formatGap(agenda.clash.when - slot.when);
        return gap === "same time" ? "Same time" : `${gap} apart`;
      })()
    : `+${n} ${n === 1 ? "post" : "posts"} that day`;
  return `
    <span class="schedule-modal__when-note${agenda.clash ? " is-clash" : ""}">
      <i class="${agenda.clash ? "ap-icon-warning_fill" : "ap-icon-calendar"}" aria-hidden="true"></i>
      <button
        type="button"
        class="ap-link small"
        data-schedule-peek="${id}"
        aria-expanded="${open ? "true" : "false"}"
        aria-controls="schedulePeek-${id}"
        ${agenda.clash ? `data-tooltip="${escapeAttr(`${networkName(agenda.clash.network)} post at ${formatTime(agenda.clash.when)}`)}"` : ""}
      >${escapeText(label)}</button>
    </span>`;
}

// The day's agenda, unfolded under the row: every post on that day, in
// time order, with this draft's own slot marked so the gap reads at a glance.
function renderPeekPopover() {
  const slot = state.peekId && state.slots.find((s) => s.post.id === state.peekId && !s.pending);
  return slot ? renderPeek(slot, dayAgenda(slot)) : "";
}

// The day's agenda floats over the list, anchored to the link that asked for
// it — a DS .ap-action-dropdown surface, rendered at the dialog root so the
// list's overflow can't clip it. ⚠️ It used to unfold UNDER the row, pushing
// every row below it down: « un peu perturbant ». Positioned in JS, against
// the MODAL's box: the dialog is transform-centred, so it is the containing
// block of anything fixed inside it (share-playbook-modal's placePopover).
function placePeek(modalEl) {
  const pop = modalEl.querySelector(".schedule-modal__peek");
  const trigger = pop && modalEl.querySelector(`[data-schedule-peek="${CSS.escape(state.peekId)}"]`);
  if (!pop || !trigger) return;
  const r = trigger.getBoundingClientRect();
  const host = modalEl.getBoundingClientRect();
  const width = pop.offsetWidth;
  const below = window.innerHeight - r.bottom - 16;
  const flip = below < pop.offsetHeight + 8 && r.top > below;
  // Right-aligned to the link's end when there's no room to its right.
  const left = Math.min(r.left - host.left, host.width - width - 16);
  pop.style.left = `${Math.round(Math.max(16, left))}px`;
  if (flip) {
    pop.style.top = "auto";
    pop.style.bottom = `${Math.round(host.bottom - r.top + 4)}px`;
  } else {
    pop.style.bottom = "auto";
    pop.style.top = `${Math.round(r.bottom - host.top + 4)}px`;
  }
}

function closePeek() {
  if (!state.peekId) return;
  state.peekId = null;
  render();
}

function renderPeek(slot, agenda) {
  const id = escapeText(slot.post.id);
  const entries = [
    ...agenda.items,
    { when: slot.when, network: platformOf(networkOf(slot.post)), text: extractFirstLine(slot.post), isSelf: true },
  ].sort((a, b) => a.when - b.when);
  const rows = entries
    .map(
      (e) => `
      <li class="schedule-modal__peek-item${e.isSelf ? " is-self" : ""}${e.clash ? " is-clash" : ""}">
        <span class="schedule-modal__peek-time">${formatTime(e.when)}</span>
        <i class="${NETWORK_ICON_BY_PLATFORM[e.network] || "ap-icon-megaphone"}" aria-hidden="true"></i>
        <span class="schedule-modal__peek-text">${escapeText(e.text || "")}</span>
        ${
          e.isSelf
            ? `<span class="ap-status blue no-dot">This draft</span>`
            : e.clash
              ? `<span class="ap-status orange no-dot">${formatGap(e.when - slot.when)} apart</span>`
              : e.isBatch
                ? `<span class="ap-status grey no-dot">This batch</span>`
                : ""
        }
      </li>`,
    )
    .join("");
  return `
    <div class="ap-action-dropdown schedule-modal__peek" id="schedulePeek-${id}" role="dialog" aria-label="Also on ${escapeAttr(formatDay(slot.when))}">
      <span class="schedule-modal__peek-head">${escapeText(formatDay(slot.when))}</span>
      <ul class="schedule-modal__peek-list">${rows}</ul>
    </div>`;
}

// The date tile — weekday, the day in large, the month. Static data, so
// grey ink on white: never blue, which is the interactive colour here.
function renderTile(slot) {
  if (slot.pending) {
    return `
      <div class="schedule-modal__tile is-pending" aria-hidden="true">
        <span class="schedule-modal__shimmer schedule-modal__shimmer--sm"></span>
        <span class="schedule-modal__shimmer schedule-modal__shimmer--lg"></span>
        <span class="schedule-modal__shimmer schedule-modal__shimmer--sm"></span>
      </div>`;
  }
  const d = new Date(slot.when);
  // Every date I picked wears my sparkle on its corner — "the network's best
  // time", one treatment for all. A date set by hand has none; its row says
  // "Set by you" instead.
  const reason = slot.pinned ? null : reasonFor(slot);
  const badge = reason
    ? `<span class="schedule-modal__tile-badge" role="img" aria-label="${escapeAttr(reason)}" data-tooltip="${escapeAttr(reason)}">
        <i class="ap-icon-sparkles ap-icon-xs" aria-hidden="true"></i>
      </span>`
    : "";
  return `
    <span class="schedule-modal__tile-wrap" data-schedule-when="${escapeText(slot.post.id)}">
      <div class="schedule-modal__tile" aria-hidden="true">
        <span class="schedule-modal__tile-dow">${d.toLocaleDateString("en-US", { weekday: "short" })}</span>
        <span class="schedule-modal__tile-day">${d.getDate()}</span>
        <span class="schedule-modal__tile-month">${d.toLocaleDateString("en-US", { month: "short" })}</span>
      </div>
      ${badge}
    </span>`;
}

// WHEN — the tile on the rail, the time and its pen, then at most two short
// lines: why this time (or "Set by you"), and whether the day is busy.
function renderWhen(slot) {
  const id = escapeText(slot.post.id);
  if (slot.pending) {
    return `
      <div class="schedule-modal__when">
        ${renderTile(slot)}
        <div class="schedule-modal__when-body">
          <span class="schedule-modal__when-pending" role="status">Finding a time…</span>
        </div>
      </div>`;
  }
  const agenda = dayAgenda(slot);
  return `
    <div class="schedule-modal__when">
      ${renderTile(slot)}
      <div class="schedule-modal__when-body">
        <span class="schedule-modal__when-head">
          <button
            type="button"
            class="schedule-modal__when-time"
            data-schedule-when="${id}"
            aria-label="Change the publish time — ${escapeAttr(formatDay(slot.when))}, ${formatTime(slot.when)}"
          >${formatTime(slot.when)}</button>
          <button
            type="button"
            class="ap-icon-button schedule-modal__when-edit"
            data-schedule-when="${id}"
            aria-label="Change the publish time — ${escapeAttr(formatDay(slot.when))}, ${formatTime(slot.when)}"
            data-tooltip="Change date or time"
            tabindex="-1"
          >
            <i class="ap-icon-pen"></i>
          </button>
          <input
            type="datetime-local"
            class="schedule-modal__when-input"
            value="${toLocalInput(slot.when)}"
            data-schedule-slot="${id}"
            tabindex="-1"
            aria-hidden="true"
          />
        </span>
        ${
          slot.pinned
            ? `<span class="schedule-modal__when-note">Set by you ·
                <button type="button" class="ap-link small" data-schedule-reset="${id}" aria-label="Use my suggestion again">Reset</button></span>`
            : ""
        }
        ${renderDayNote(slot, agenda)}
      </div>
    </div>`;
}

// The draft's media, when it has one — what the post will LOOK like in the
// feed is half of recognising it. Image → the image; carousel → its first
// slide + the slide count; video clip → its hue frame + a play glyph and the
// duration (clips carry no poster image, the same frame post-card draws).
function renderThumb(post) {
  if (post.clipRef) {
    const clip = post.clipRef;
    const h = typeof clip.hue === "number" ? clip.hue : 24;
    const secs = Math.max(1, Math.round(clip.end - clip.start));
    const bg = `linear-gradient(135deg, oklch(0.42 0.12 ${h}) 0%, oklch(0.18 0.06 ${h}) 100%)`;
    return `
      <span class="schedule-modal__thumb is-video" style="background: ${bg}" aria-label="Video clip, ${secs} seconds" role="img">
        <i class="ap-icon-play_fill" aria-hidden="true"></i>
        <span class="schedule-modal__thumb-badge">0:${String(secs).padStart(2, "0")}</span>
      </span>`;
  }
  // A text-only post still fills the column — a neutral tile saying "text"
  // — the quote glyph — so every row's text starts at the same x and
  // nothing floats.
  if (!post.imageUrl) {
    return `
      <span class="schedule-modal__thumb is-text" role="img" aria-label="Text-only post">
        <i class="ap-icon-quote" aria-hidden="true"></i>
      </span>`;
  }
  const count = Array.isArray(post.carousel) ? post.carousel.length : 0;
  return `
    <span class="schedule-modal__thumb">
      <img src="${escapeText(post.imageUrl)}" alt="${count > 1 ? `Carousel, ${count} images` : "Image for this post"}" loading="lazy" />
      ${count > 1 ? `<span class="schedule-modal__thumb-badge">1/${count}</span>` : ""}
    </span>`;
}

// WHAT — the draft itself: who publishes it, what it says, what it shows,
// and its one action (leave it out).
function renderDraft(slot) {
  const post = slot.post;
  const network = networkOf(post);
  return `
    <div class="schedule-modal__draft">
      ${renderThumb(post)}
      <div class="schedule-modal__draft-body">
        ${renderProfileTag(profileForNetwork(network), { network })}
        <p class="schedule-modal__draft-text">${escapeText(extractFirstLine(post))}</p>
      </div>
    </div>`;
}

// Leaving the draft out acts on the DRAFT, so it lives in the draft's
// corner — shown on the row you're on (hover / keyboard focus; always on a
// touch screen). Changing the date acts on the date: its pen is in the date
// cell, beside the time.
function renderRowTools(slot) {
  if (state.posts.length < 2) return "";
  return `
    <div class="schedule-modal__row-tools">
      <button
        type="button"
        class="ap-icon-button"
        data-schedule-remove="${escapeText(slot.post.id)}"
        aria-label="Leave this draft out"
        data-tooltip="Leave this draft out"
      >
        <i class="ap-icon-close"></i>
      </button>
    </div>`;
}

function renderRow(slot, i) {
  const classes = [
    "schedule-modal__row",
    slot.pending ? "is-pending" : "",
    slot.justLanded ? "is-landing" : "",
    state.entering ? "is-entering" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <li class="${classes}" style="--i: ${i}">
      ${renderDraft(slot)}
      ${renderWhen(slot)}
      ${
        // AFTER the date in the DOM, so Tab reaches "change the date" before
        // "leave it out"; CSS puts it back in the draft's corner.
        renderRowTools(slot)
      }
    </li>`;
}

// The batch as a posting timeline: one framed list, rows in date order. A
// hand-edited date moves its row to its new place.
function renderTimeline() {
  const rows = [...state.slots]
    .sort((a, b) => a.when - b.when)
    .map(renderRow)
    .join("");
  return `<ol class="schedule-modal__timeline" aria-label="Drafts and their publish times">${rows}</ol>`;
}

// Footer left: what the batch adds up to, once the dates exist.
function renderFootSummary() {
  const disclosure = `<span class="schedule-modal__foot-disclosure">Posts will publish to your connected accounts.</span>`;
  if (isComputing() || state.slots.length === 0) return disclosure;
  const times = state.slots.map((s) => s.when).sort((a, b) => a - b);
  const first = times[0];
  const last = times[times.length - 1];
  let span;
  if (times.length === 1) {
    span = `<strong>${escapeText(formatDay(first))}</strong> at ${formatTime(first)}`;
  } else {
    const days = Math.round((startOfDay(last) - startOfDay(first)) / 86400000) + 1;
    span = `<strong>${times.length} posts over ${days} ${days === 1 ? "day" : "days"}</strong> · ${escapeText(formatShortDate(first))} – ${escapeText(formatShortDate(last))}`;
  }
  return `<span class="schedule-modal__foot-span">${span}</span>${disclosure}`;
}

function toDateInput(ts) {
  const d = new Date(ts || defaultStartFrom());
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
