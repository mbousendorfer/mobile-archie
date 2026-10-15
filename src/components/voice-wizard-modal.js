// voice-wizard-modal — "Optimize your Instagram voice" (flag networkVoices).
//
// Every Optimize on the Voice tab opens it: the parts of a network voice, one
// step each (Opens with · Closes with · Formatting · Emoji & casing …), then a
// review. A step: on the left, Leave as default (the part follows the base
// voice) or Make it {network}'s, then the choices:
// for lines, Archie's suggestions and your own in ONE list you order by
// preference (drag by the grip — the shared drag-reorder.js — or ↑ ↓ on it) — the checked lines, in that
// order, are the value; for a single-value part, Archie's pick · another way ·
// your own. On the right, what the network itself recommends for that part —
// the reason behind Archie's picks. (2026-10-15: a live sample post stood
// there — "ça n'a pas de sens".)
// The progress ring in the header is the one on the Voice tab.
//
// A STAGED draft (the objective modal's pattern): nothing reaches the Playbook
// until Save; the host gets the four final values and writes them. Leaving with
// changes asks — in here, never through confirm-modal (requestOpen would close
// this dialog to open it).
//
// Public API: init() · open({ data, network, part?, onSave(result) }) · close()
//   result = { values: { [field]: value | undefined }, drafted: boolean }
//   undefined = the part follows the base voice.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1809";
import { bindReorder } from "../drag-reorder.js?v=1809";
import { escapeHtml as esc } from "../utils.js?v=1809";
import { networkVoiceOptions, networkGuidance, networkGuidanceUrl } from "../context-mock-analysis.js?v=1809";
import {
  networkFields,
  isNewPart,
  networkLabel,
  networkIcon,
  baseNetwork,
  networkEntry,
  resolvedVoice,
  progressRingHtml,
} from "../network-voice.js?v=1809";

const MODAL_ID = "voiceWizard";

const PARTS = {
  signatureHooks: {
    title: "Opens with",
    list: true,
    ask: (n) => `How do your posts open on ${n}?`,
    add: "Write your own opening line…",
  },
  closingPatterns: {
    title: "Closes with",
    list: true,
    ask: (n) => `How do your posts end on ${n}?`,
    add: "Write your own closing line…",
  },
  formattingStyle: {
    title: "Formatting",
    list: false,
    ask: (n) => `How should a post be laid out on ${n}?`,
    add: "How posts are structured on this network…",
  },
  hashtagStyle: {
    title: "Hashtags",
    list: false,
    ask: (n) => `How do you use hashtags on ${n}?`,
    add: "How many, where, which kind…",
  },
  visualStyle: {
    title: "Emoji & casing",
    list: false,
    ask: (n) => `Emoji, casing and hashtags on ${n}?`,
    add: "Emoji, capitalisation, hashtags, links…",
  },
};

let backdrop = null;
let panel = null;
let headEl = null;
let bodyEl = null;
let footLeftEl = null;
let footRightEl = null;
let initialized = false;

// { data, net, base, opts, fields, step, parts: { [field]: part }, initial, startParts, leaving, onSave }
//   list part: { keep, order: string[], picked: string[] } — order = every line
//     (Archie's + yours) in preference order; picked = the checked ones
//   text part: { choice: 0 | 1 | "keep" | "own", own, prev } — prev = the choice
//     to come back to when you leave "default"
let w = null;

// The step after the parts: the review.
const review = () => w.fields.length;

const SHELL = `
<div class="app-modal-backdrop vw__backdrop" id="vwBackdrop" hidden>
  <aside class="ap-dialog vw" id="vwModal" role="dialog" aria-modal="true" aria-labelledby="vwTitle" tabindex="-1">
    <div class="ap-dialog-header vw__header" id="vwHead"></div>
    <button type="button" class="ap-dialog-close" data-vw-close aria-label="Close"><i class="ap-icon-close"></i></button>
    <div class="ap-dialog-content vw__content" id="vwBody"></div>
    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left" id="vwFootLeft"></div>
      <div class="ap-dialog-footer-right" id="vwFootRight"></div>
    </div>
  </aside>
</div>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  backdrop = document.getElementById("vwBackdrop");
  panel = document.getElementById("vwModal");
  headEl = document.getElementById("vwHead");
  bodyEl = document.getElementById("vwBody");
  footLeftEl = document.getElementById("vwFootLeft");
  footRightEl = document.getElementById("vwFootRight");
  panel.addEventListener("click", onClick);
  panel.addEventListener("change", onChange);
  panel.addEventListener("input", onInput);
  panel.addEventListener("keydown", onKeydown);
  // Reorder the lines by their grip — the app's shared drag (drag-reorder.js).
  bindReorder(panel, (from, to) => {
    if (w) moveLine(w.fields[w.step], from, to);
    paint();
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) requestClose();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && w && !backdrop.hidden) {
      e.preventDefault();
      requestClose();
    }
  });
  // A navigation is not a choice to discard — but the page under is gone.
  window.addEventListener("hashchange", () => close());
  initialized = true;
}

export function open({ data, network, part = null, onSave }) {
  init();
  const opts = networkVoiceOptions(network);
  if (!data || !opts) return;
  requestOpen(MODAL_ID, close);
  const entry = networkEntry(data, network) || {};
  const parts = {};
  // The parts on screen when it opens (a flag can add one — voiceParts()).
  const fields = networkFields().filter((f) => opts[f]);
  for (const field of fields) parts[field] = initialPart(field, entry[field], opts[field]);
  const firstLeft = fields.findIndex((f) => entry[f] === undefined);
  const asked = part ? fields.indexOf(part) : -1;
  w = {
    data,
    net: network,
    base: baseNetwork(data),
    opts,
    fields,
    parts,
    step: asked >= 0 ? asked : firstLeft >= 0 ? firstLeft : 0,
    leaving: false,
    onSave,
  };
  w.initial = snapshot();
  w.startParts = Object.fromEntries(w.fields.map((f) => [f, JSON.stringify(parts[f])]));
  paint();
  backdrop.hidden = false;
  document.body.classList.add("has-modal");
  focusFirst();
}

export function close() {
  if (!backdrop || backdrop.hidden) return;
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  w = null;
  headEl.innerHTML = bodyEl.innerHTML = footLeftEl.innerHTML = footRightEl.innerHTML = "";
  notifyClose(MODAL_ID);
}

function requestClose() {
  if (!w) return;
  if (snapshot() === w.initial || w.leaving) {
    close();
    return;
  }
  w.leaving = true;
  paint();
}

// ── The draft ────────────────────────────────────────────────────────────────

// What a part starts as: its own value when the network already has one,
// Archie's picks otherwise (the first two lines, the first option).
function initialPart(field, value, options) {
  if (PARTS[field].list) {
    if (value === undefined) return { keep: false, order: [...options], picked: options.slice(0, 2) };
    // The saved order first, then Archie's other options to pick from.
    return { keep: false, order: [...value, ...options.filter((o) => !value.includes(o))], picked: [...value] };
  }
  if (value === undefined) return { choice: 0, own: "" };
  const i = options.indexOf(value);
  return i >= 0 ? { choice: i, own: "" } : { choice: "own", own: value };
}

// A part's final value — undefined = it follows the base voice.
function valueOf(field) {
  const p = w.parts[field];
  if (PARTS[field].list) {
    if (p.keep) return undefined;
    const lines = p.order.filter((l) => p.picked.includes(l));
    return lines.length ? lines : undefined;
  }
  if (p.choice === "keep") return undefined;
  if (p.choice === "own") return p.own.trim() || undefined;
  return w.opts[field][p.choice];
}

function isArchieDefault(field) {
  const p = w.parts[field];
  if (PARTS[field].list) return !p.keep && (valueOf(field) || []).join("\n") === w.opts[field].slice(0, 2).join("\n");
  return p.choice === 0;
}

function snapshot() {
  return JSON.stringify(w.fields.map(valueOf));
}

// Archie's picks for every part nobody has made their own — not the ones the
// network already had, not the ones changed in this wizard.
function archieAll() {
  for (const field of w.fields) {
    if (networkEntry(w.data, w.net)?.[field] !== undefined) continue;
    if (JSON.stringify(w.parts[field]) !== w.startParts[field]) continue;
    w.parts[field] = initialPart(field, undefined, w.opts[field]);
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function paint() {
  if (!w) return;
  const label = networkLabel(w.net);
  const onPart = w.step < review();
  const done = w.fields.map((f) => valueOf(f) !== undefined);
  headEl.innerHTML = `
    ${progressRingHtml(w.net, {
      done,
      current: onPart ? w.step : -1,
      // A part the product just added, still on the base in the draft: orange.
      attention: w.fields.map((f) => isNewPart(f) && valueOf(f) === undefined),
      size: 48,
    })}
    <div class="vw__titles">
      <span class="ap-dialog-title" id="vwTitle">Optimize your ${esc(label)} voice</span>
      <span class="ap-dialog-subtitle">${
        onPart ? `${esc(PARTS[w.fields[w.step]].title)} · ${w.step + 1} of ${review()}` : "Review your choices"
      }</span>
    </div>`;
  // Right column: what the network itself recommends for this step's part.
  // The review has none — it spans the dialog.
  const guide = onPart ? renderGuidance(w.fields[w.step]) : "";
  bodyEl.classList.toggle("vw__content--single", !guide);
  bodyEl.innerHTML = `
    <div class="vw__main">${onPart ? renderPart(w.fields[w.step]) : renderReview()}</div>
    ${guide}`;
  paintFooter();
}

function paintFooter() {
  const label = networkLabel(w.net);
  if (w.leaving) {
    footLeftEl.innerHTML = `<span class="vw__leave">Your choices aren't saved yet.</span>`;
    footRightEl.innerHTML = `
      <button type="button" class="ap-button ghost grey" data-vw-discard>Discard changes</button>
      <button type="button" class="ap-button primary blue" data-vw-stay>Keep editing</button>`;
    return;
  }
  const onPart = w.step < review();
  // Left: the one-click way, kept — every part at Archie's pick, then review.
  footLeftEl.innerHTML = onPart
    ? `<button type="button" class="ap-button ghost grey" data-vw-archie><i class="ap-icon-sparkles" aria-hidden="true"></i><span>Use all of Archie's picks</span></button>`
    : "";
  footRightEl.innerHTML = `
    ${w.step > 0 ? `<button type="button" class="ap-button stroked grey" data-vw-back><i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back</span></button>` : ""}
    ${onPart ? `<button type="button" class="ap-button ghost grey" data-vw-skip>Skip</button>` : ""}
    ${
      onPart
        ? `<button type="button" class="ap-button primary blue" data-vw-next>Next</button>`
        : `<button type="button" class="ap-button primary orange" data-vw-save><span>Save ${esc(label)} voice</span></button>`
    }`;
}

// The base's version of a part, shortened for one line.
function baseSummary(field) {
  const v = baseValue(field);
  if (Array.isArray(v)) {
    const list = v.filter((x) => x && !/\[[^\]]*\]/.test(x));
    if (!list.length) return "Nothing set yet";
    return `“${list[0]}”${list.length > 1 ? ` and ${list.length - 1} more` : ""}`;
  }
  return v || "Nothing set yet";
}

function baseValue(field) {
  if (field === "signatureHooks" || field === "closingPatterns") return resolvedVoice(w.data, w.base)[field];
  return w.data[field] || "";
}

const ARCHIE_MARK = `<span class="vw-option__archie" title="Archie's pick"><i class="ap-icon-sparkles" aria-hidden="true"></i></span>`;

// What the network itself recommends for this part — the reason behind
// Archie's picks, in the right column beside the choices.
function renderGuidance(field) {
  const lines = networkGuidance(w.net, field);
  if (!lines.length) return "";
  // The source, one click away — a new tab, the draft stays open here.
  const url = networkGuidanceUrl(w.net);
  return `<aside class="vw__aside" aria-label="What ${esc(networkLabel(w.net))} says">
      <p class="vw__aside-title"><i class="${networkIcon(w.net)}" aria-hidden="true"></i>What ${esc(networkLabel(w.net))} says</p>
      <ul class="vw-guide">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      ${
        url
          ? `<a class="ap-link standalone small vw-guide__link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span>Read ${esc(networkLabel(w.net))}'s guidelines</span><i class="ap-icon-external-link" aria-hidden="true"></i></a>`
          : ""
      }
    </aside>`;
}

// Leave as default (the part follows the base voice) or make it the network's.
function renderMode(field, isDefault) {
  const label = networkLabel(w.net);
  const card = (value, title, text, on) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-mode" data-vw-mode="${value}" ${on ? "checked" : ""} />
      <div class="vw-radio__body">
        <span class="ap-radio-card-title">${esc(title)}</span>
        <span class="vw-radio__text">${esc(text)}</span>
      </div>
    </label>`;
  return `<div class="vw-mode" role="radiogroup" aria-label="${esc(PARTS[field].title)}">
      ${card("default", "Leave as default", `Same as your ${networkLabel(w.base)} voice: ${baseSummary(field)}`, isDefault)}
      ${card("own", `Make it ${label}'s`, PARTS[field].list ? "Pick, write and order the lines." : "Pick one, or write your own.", !isDefault)}
    </div>`;
}

function renderPart(field) {
  const P = PARTS[field];
  const p = w.parts[field];
  const isDefault = P.list ? p.keep : p.choice === "keep";
  const head = `<h3 class="vw__ask">${esc(P.ask(networkLabel(w.net)))}${
    isNewPart(field) ? ` <span class="ap-status orange vw__new">New in your voice</span>` : ""
  }</h3>
    ${renderMode(field, isDefault)}`;
  if (isDefault) return head;
  if (P.list) {
    const n = p.order.length;
    const rows = p.order
      .map((line, i) => {
        const own = !w.opts[field].includes(line);
        const archie = w.opts[field].slice(0, 2).includes(line);
        return `<div class="vw-option vw-line app-reorder__item">
          <button type="button" class="app-reorder__grip" data-vw-handle="${i}" title="Drag to reorder" aria-label="${esc(`Move “${line}” — ${i + 1} of ${n}. Use the up and down arrow keys.`)}"><i class="ap-icon-move"></i></button>
          <label class="ap-checkbox-container vw-line__check">
            <input type="checkbox" data-vw-pick="${i}" ${p.picked.includes(line) ? "checked" : ""} />
            <i aria-hidden="true"></i>
            <span class="vw-option__text">“${esc(line)}”</span>
          </label>
          ${
            own
              ? `<button type="button" class="ap-icon-button transparent grey" data-vw-unadd="${i}" aria-label="Remove this line"><i class="ap-icon-close"></i></button>`
              : archie
                ? ARCHIE_MARK
                : ""
          }
        </div>`;
      })
      .join("");
    return `${head}
      <div class="vw-list-head"><span class="vw-list-head__title">Suggestions</span><span class="vw-list-head__hint">Drag to order by preference</span></div>
      <div class="vw-options app-reorder">${rows}</div>
      <div class="vw-add">
        <div class="ap-input-group"><input type="text" data-vw-add placeholder="${esc(P.add)}" aria-label="${esc(P.add)}" /></div>
        <button type="button" class="ap-button stroked blue" data-vw-add-btn><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>
      </div>`;
  }
  const radio = (value, title, text, archie = false) => `
    <label class="ap-radio-card card vw-radio">
      <input type="radio" name="vw-choice" data-vw-choice="${value}" ${String(p.choice) === String(value) ? "checked" : ""} />
      <div class="vw-radio__body">
        <span class="ap-radio-card-title">${esc(title)}${archie ? ARCHIE_MARK : ""}</span>
        ${text ? `<span class="vw-radio__text">${esc(text)}</span>` : ""}
      </div>
    </label>`;
  return `${head}
    <div class="vw-list-head"><span class="vw-list-head__title">Suggestions</span></div>
    <div class="vw-options">
      ${radio(0, "Archie's pick", w.opts[field][0], true)}
      ${radio(1, "Another way", w.opts[field][1])}
      ${radio("own", "Write my own", "")}
      ${
        p.choice === "own"
          ? `<div class="ap-textarea-field resizable vw-own"><textarea data-vw-own rows="3" placeholder="${esc(P.add)}" aria-label="${esc(P.add)}">${esc(p.own)}</textarea></div>`
          : ""
      }
    </div>`;
}

function renderReview() {
  const label = networkLabel(w.net);
  const baseLabel = networkLabel(w.base);
  const rows = w.fields
    .map((field, i) => {
      const v = valueOf(field);
      const shown =
        v === undefined
          ? baseSummary(field)
          : Array.isArray(v)
            ? `“${v[0]}”${v.length > 1 ? ` and ${v.length - 1} more` : ""}`
            : v;
      return `<li class="pb2-nv-row vw-review__row">
      <span class="pb2-nv-row__name">${esc(PARTS[field].title)}</span>
      <span class="vw-review__value">
        ${v === undefined ? `<span class="ap-status grey">Same as ${esc(baseLabel)}</span>` : `<span class="ap-status green">Optimized</span>`}
        <span class="vw-review__text">${esc(shown)}</span>
      </span>
      <span class="pb2-nv-row__action"><button type="button" class="ap-button ghost blue" data-vw-goto="${i}">Change</button></span>
    </li>`;
    })
    .join("");
  const n = w.fields.filter((f) => valueOf(f) !== undefined).length;
  return `<h3 class="vw__ask">Your ${esc(label)} voice</h3>
    <p class="vw__hint">${n} of ${review()} parts optimized for ${esc(label)}. The others follow your ${esc(baseLabel)} voice.</p>
    <ul class="pb2-nv-rows vw-review">${rows}</ul>`;
}

// ── Events ───────────────────────────────────────────────────────────────────

function go(step) {
  w.step = Math.max(0, Math.min(review(), step));
  paint();
  focusFirst();
}

function focusFirst() {
  (bodyEl.querySelector(".vw__main input:not([disabled]), .vw__main button") || panel)?.focus?.({
    preventScroll: true,
  });
}

// A line you write goes to the end of the list, checked.
function addLine(field) {
  const input = bodyEl.querySelector("[data-vw-add]");
  const text = (input?.value || "").trim();
  if (!text) return;
  const p = w.parts[field];
  if (!p.order.includes(text)) p.order.push(text);
  if (!p.picked.includes(text)) p.picked.push(text);
  paint();
  bodyEl.querySelector("[data-vw-add]")?.focus();
}

// Preference order: move one line, by drag or by ↑ ↓ on its handle.
function moveLine(field, from, to) {
  const order = w.parts[field].order;
  if (to < 0 || to >= order.length || from === to) return false;
  const [line] = order.splice(from, 1);
  order.splice(to, 0, line);
  return true;
}

function onClick(event) {
  if (!w) return;
  const t = event.target;
  const field = w.fields[w.step];
  if (t.closest("[data-vw-close]")) return requestClose();
  if (t.closest("[data-vw-discard]")) return close();
  if (t.closest("[data-vw-stay]")) {
    w.leaving = false;
    return paint();
  }
  if (t.closest("[data-vw-next]")) return go(w.step + 1);
  if (t.closest("[data-vw-back]")) return go(w.step - 1);
  if (t.closest("[data-vw-skip]")) {
    // Skip = this part keeps following the base voice.
    if (PARTS[field].list) w.parts[field].keep = true;
    else w.parts[field].choice = "keep";
    return go(w.step + 1);
  }
  if (t.closest("[data-vw-archie]")) {
    archieAll();
    return go(review());
  }
  const gotoBtn = t.closest("[data-vw-goto]");
  if (gotoBtn) return go(Number(gotoBtn.dataset.vwGoto));
  if (t.closest("[data-vw-add-btn]")) return addLine(field);
  const unadd = t.closest("[data-vw-unadd]");
  if (unadd) {
    const p = w.parts[field];
    const [line] = p.order.splice(Number(unadd.dataset.vwUnadd), 1);
    p.picked = p.picked.filter((l) => l !== line);
    return paint();
  }
  if (t.closest("[data-vw-save]")) {
    const values = {};
    for (const f of w.fields) values[f] = valueOf(f);
    const defined = w.fields.filter((f) => values[f] !== undefined);
    const drafted = defined.length > 0 && defined.every((f) => isArchieDefault(f));
    const onSave = w.onSave;
    close();
    onSave?.({ values, drafted });
  }
}

function onChange(event) {
  if (!w) return;
  const t = event.target;
  const field = w.fields[w.step];
  const p = w.parts[field];
  if (t.matches("[data-vw-pick]")) {
    const line = p.order[Number(t.dataset.vwPick)];
    p.picked = t.checked ? [...p.picked, line] : p.picked.filter((l) => l !== line);
    return paint();
  }
  if (t.matches("[data-vw-mode]")) {
    const toDefault = t.dataset.vwMode === "default";
    if (PARTS[field].list) p.keep = toDefault;
    else if (toDefault) {
      if (p.choice !== "keep") p.prev = p.choice;
      p.choice = "keep";
    } else p.choice = p.prev ?? 0;
    return paint();
  }
  if (t.matches("[data-vw-choice]")) {
    const v = t.dataset.vwChoice;
    p.choice = v === "keep" || v === "own" ? v : Number(v);
    paint();
    if (v === "own") bodyEl.querySelector("[data-vw-own]")?.focus();
  }
}

// Typing in "Write my own" keeps the draft current without repainting the field.
function onInput(event) {
  if (!w || !event.target.matches("[data-vw-own]")) return;
  w.parts[w.fields[w.step]].own = event.target.value;
}

function onKeydown(event) {
  if (!w) return;
  if (event.key === "Enter" && event.target.matches("[data-vw-add]")) {
    event.preventDefault();
    addLine(w.fields[w.step]);
  }
  // ↑ ↓ on a row's handle: the keyboard way to reorder; focus follows the line.
  const handle = event.target.closest?.("[data-vw-handle]");
  if (handle && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    const from = Number(handle.dataset.vwHandle);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (!moveLine(w.fields[w.step], from, to)) return;
    paint();
    bodyEl.querySelector(`[data-vw-handle="${to}"]`)?.focus();
  }
}
