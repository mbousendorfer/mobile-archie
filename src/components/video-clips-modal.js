// Video Clips modal — AI-suggested clips for a video source.
//
// Ported from the standalone React handoff at
// /Users/matthieu.bousendorfer/sources/video-clips-handoff to vanilla JS,
// matching the archie modal pattern (init / open / close + module-level state,
// event delegation, no framework).
//
// Public API:
//   init()                         — call once at app bootstrap; injects DOM
//   open(source, { onUseClips,     — show the modal for a video source
//                  onSaveClips })  — onSaveClips fires on every edit (sourceId, clips)
//                                  — onUseClips fires on "Draft posts from N clips"
//                                    (selectedClips, source) → host wires drafts
//   close()                        — hide, reset ephemeral state
//
// The modal has three states:
//   - Browse: 2-col grid of clip cards. Toggle selection, edit, add manually.
//   - Edit  : sticky cinematic editor pane (preview + form + pro trim) above
//             the grid, source card dimmed.
//   - Add   : a new 30s clip is inserted in the next gap and opened in edit.

import { escapeHtml, formatClock } from "../utils.js?v=1902";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1902";
import { FORMATS, NETWORK_FORMATS, ratioValue } from "../clip-formats.js?v=1902";
import { iconFor } from "../file-kinds.js?v=1902";
import { DEFAULT_PRESET, buildCaptions, videoForClip } from "../clip-captions.js?v=1902";
import { editorPaneHTML, optionsHTML } from "./video-clips-modal/editor-pane.js?v=1902";

const MODAL_ID = "videoClips";
const MIN_CLIP = 5;
const MAX_CLIP = 300;

// Backfill the format on a clip draft: keep any valid value, else fall back to
// the recommended format for its network. The Ratio panel offers all five
// ratios, so a deliberate pick must survive a reopen even when it isn't the
// recommended one for the clip's network — only a missing/unknown format is
// replaced. (`clipOverrides.format` still wins, applied after this in `open`.)
function ensureDraftFormat(d) {
  if (!d) return;
  if (d.format && FORMATS[d.format]) return;
  d.format = (NETWORK_FORMATS[d.network] || ["16:9"])[0];
}

// Backfill caption state on a clip draft. Captions are auto-generated lazily
// (the "auto-generated subtitles" narrative) the first time a clip is edited,
// then persisted on the clip. Clone existing emph ranges so editing the draft
// never mutates the committed clip in place.
function ensureDraftCaptions(d) {
  if (!d) return;
  if (!Array.isArray(d.captions)) d.captions = buildCaptions(d);
  else d.captions = d.captions.map((s) => ({ ...s, emph: (s.emph || []).map((r) => r.slice()) }));
  if (typeof d.captionsOn !== "boolean") d.captionsOn = true;
  if (!d.captionStyle) d.captionStyle = DEFAULT_PRESET;
}

// ── Module state ─────────────────────────────────────────────────────

let backdrop;
let modal;
let bodyEl;
let timelineEl;
let footEl;
let initialized = false;

export let currentSource = null;
let clips = []; // [{ id, start, end, title, summary, why, network, tags, hue }, …]
let selected = new Set(); // clip ids
let editingId = null; // clip id currently in edit mode, or null
let addingNewClip = false; // editing a brand-new, not-yet-saved clip (drives the "Add clip" head title)

// When the modal is opened with a specific `editingClipId`, we run in
// single-clip mode: the body shows only that clip's editor pane (no
// browse list, no timeline, no bulk-action footer), and the modal
// closes automatically after Save / Cancel / Delete. Set in `open()`
// from `callbacks.editingClipId`, cleared in `close()`.
let singleClipMode = false;

// Edit-mode draft (live values while the user is editing — committed on Save).
export let draft = null;
export let draftPlayhead = 0;

// Editor tab — "clip" (preview / form / trim), "ratio" (output aspect ratio) or
// "subtitles" (the embedded caption editor). Tabs keep subtitle editing inside
// the modal instead of a separate surface.
export let editorTab = "clip";
// Which sub-panel the Subtitles options show — "style" (Presets/Font/Effects)
// or "transcript". The stage + timeline stay put; only this panel swaps.
export let optionsSubtab = "style";
let captionMounted = false;
// The mounted caption-editor module (for playback seek/fraction queries from
// the timeline scrubber). Set in syncCaptionMount.
let capMod = null;
// Fullscreen toggle — expands the modal to near-viewport for more real estate.
let expanded = false;
// Trim mode — the In/Out handles + steppers are hidden until the user opts in
// via the Trim button; the timeline reads as a clean scrub track by default.
export let trimMode = false;

// Drag state for the pro trimmer (null when not dragging).
let dragState = null;

// Host callbacks (set by open()).
let onUseCallback = null;
let onSaveCallback = null;

// ── Time helpers ─────────────────────────────────────────────────────

export const fmtTime = (sec) => formatClock(sec, { round: true });

function parseTime(str) {
  if (!str) return null;
  const m = String(str)
    .trim()
    .match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (secs >= 60) return null;
  return mins * 60 + secs;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortName(name) {
  if (!name) return "video";
  return name.length > 40 ? name.slice(0, 37) + "…" : name;
}

// ── HTML shell (injected once) ───────────────────────────────────────

const SHELL_HTML = `
<div class="app-modal-backdrop" id="videoClipsBackdrop" hidden></div>
<aside class="ap-dialog app-dialog--full video-clips-modal" id="videoClipsModal" role="dialog" aria-modal="true"
       aria-labelledby="videoClipsTitle" aria-hidden="true">
  <div class="ap-dialog-header video-clips-modal__head">
    <div class="video-clips-modal__head-info">
      <span class="ap-dialog-title" id="videoClipsTitle">Suggested clips</span>
      <span class="ap-dialog-subtitle" id="videoClipsSub"></span>
    </div>
  </div>

  <div class="video-clips-modal__timeline" id="videoClipsTimeline">
    <div class="vc-timeline">
      <div class="vc-timeline__bar" id="videoClipsTimelineBar"></div>
      <div class="vc-timeline__ticks" id="videoClipsTimelineTicks"></div>
    </div>
  </div>

  <div class="ap-dialog-content video-clips-modal__body" id="videoClipsBody"></div>

  <div class="ap-dialog-footer video-clips-modal__foot" id="videoClipsFoot"></div>

  <button type="button" class="ap-dialog-close video-clips-modal__expand" id="videoClipsExpand" aria-label="Expand to fullscreen" title="Expand">
    <i class="ap-icon-maximize"></i>
  </button>
  <button type="button" class="ap-dialog-close" id="videoClipsClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
</aside>`;

// ── Render: strip timeline ───────────────────────────────────────────

function renderTimeline() {
  const duration = currentSource?.durationSec || 1;
  const barHTML = clips
    .map((c) => {
      const left = (c.start / duration) * 100;
      const width = ((c.end - c.start) / duration) * 100;
      const on = selected.has(c.id);
      const editing = c.id === editingId;
      const cls = "vc-timeline__seg" + (on ? " is-on" : "") + (editing ? " is-editing" : "");
      const title = `${fmtTime(c.start)}–${fmtTime(c.end)} · ${c.title || "Untitled clip"}`;
      return `<div class="${cls}" style="left: ${left}%; width: ${Math.max(width, 1.5)}%" title="${escapeHtml(title)}"></div>`;
    })
    .join("");

  const bar = document.getElementById("videoClipsTimelineBar");
  if (bar) bar.innerHTML = barHTML;

  const ticksEl = document.getElementById("videoClipsTimelineTicks");
  if (ticksEl) {
    ticksEl.innerHTML = `
      <span>0:00</span>
      <span>${fmtTime(duration / 4)}</span>
      <span>${fmtTime(duration / 2)}</span>
      <span>${fmtTime((3 * duration) / 4)}</span>
      <span>${fmtTime(duration)}</span>
    `;
  }
}

// ── Render: footer ───────────────────────────────────────────────────

function renderFooter() {
  if (!footEl) return;
  const total = clips.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + (c.end - c.start), 0);
  const n = selected.size;
  const ctaLabel = n === 1 ? "Draft post from 1 clip" : `Draft posts from ${n} clips`;
  footEl.innerHTML = `
    <div class="ap-dialog-footer-left">
      <button type="button" class="ap-button stroked grey video-clips-modal__add-clip" data-vc-action="add-clip">
        <i class="ap-icon-plus"></i>
        <span>Add clip</span>
      </button>
      <div class="video-clips-modal__foot-stats">
        <strong>${n}</strong> clip${n === 1 ? "" : "s"} selected${n > 0 ? `<span class="video-clips-modal__foot-meta"> · ${fmtTime(total)} of video</span>` : ""}
      </div>
    </div>
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button ghost grey" data-vc-action="cancel">Cancel</button>
      <button type="button" class="ap-button primary orange" data-vc-action="use-clips" ${n === 0 || editingId ? "disabled" : ""} title="${editingId ? "Finish editing the clip first" : ""}">
        <i class="ap-icon-archie-official"></i>
        <span>${ctaLabel}</span>
      </button>
    </div>
  `;
}

// Single-clip mode footer — Delete on the left, Cancel + Save on the
// right. Same data-vc-action hooks the editor header used to expose,
// so existing handlers keep working unchanged.
function renderFooterEdit() {
  if (!footEl) return;
  footEl.innerHTML = `
    <div class="ap-dialog-footer-left">
      <button type="button" class="ap-button ghost red" data-vc-action="delete-clip" title="Delete this clip">
        <i class="ap-icon-trash"></i>
        <span>Delete</span>
      </button>
    </div>
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button ghost grey" data-vc-action="cancel-edit">Cancel</button>
      <button type="button" class="ap-button primary orange" data-vc-action="save-edit">
        <i class="ap-icon-check"></i>
        <span>Save changes</span>
      </button>
    </div>
  `;
}

// ── Render: a single browse-mode clip card ───────────────────────────

function clipCardHTML(clip) {
  const isSelected = selected.has(clip.id);
  const isEditingThis = editingId === clip.id;
  const cls = "vc-row" + (isSelected ? " is-on" : "") + (isEditingThis ? " is-editing" : "");
  const tags = (clip.tags || []).map((t) => `<span class="vc-row__tag">#${escapeHtml(t)}</span>`).join("");
  return `
    <div class="${cls}" data-vc-clip="${clip.id}">
      <label class="vc-row__check-wrap">
        <input type="checkbox" class="vc-row__check" ${isSelected ? "checked" : ""} data-vc-action="toggle" data-vc-clip="${clip.id}" />
        <span class="vc-row__check-box" aria-hidden="true">
          <i class="ap-icon-check"></i>
        </span>
      </label>
      <div class="vc-thumb">
        <div class="vc-thumb__crop" data-vc-thumb-crop style="aspect-ratio: ${ratioValue(clip.format)}">
          <video class="vc-thumb__video" src="${videoForClip(clip)}#t=1" muted playsinline preload="metadata"></video>
        </div>
        ${clip.captionsOn && (clip.captions || []).length ? `<div class="vc-thumb__cc" title="Subtitles on">CC</div>` : ""}
        <div class="vc-thumb__play"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></div>
        <div class="vc-thumb__time">${fmtTime(clip.end - clip.start)}</div>
      </div>
      <div class="vc-row__body">
        <div class="vc-row__head">
          <div class="vc-row__head-text">
            <span class="vc-row__time">${fmtTime(clip.start)} – ${fmtTime(clip.end)}</span>
            <span class="vc-row__title">${escapeHtml(clip.title || "Untitled clip")}</span>
          </div>
          <button class="ap-button stroked grey vc-row__edit-btn" data-vc-action="edit" data-vc-clip="${clip.id}" title="Edit clip">
            <i class="ap-icon-pen"></i>
            <span>Edit</span>
          </button>
        </div>
        <div class="vc-row__summary">${escapeHtml(clip.summary || "")}</div>
        <div class="vc-row__why">
          <i class="ap-icon-archie-official"></i>
          <span>${escapeHtml(clip.why || "")}</span>
        </div>
        <div class="vc-row__tags">${tags}</div>
      </div>
    </div>
  `;
}

// ── Render: editor pane (full surface, replaces the card while editing) ─

// ── Render: full body ────────────────────────────────────────────────

function renderBody() {
  if (!bodyEl) return;

  // While editing (either tab), the persistent VEED editor takes over the whole
  // body so the rail · stage · timeline get full height. No browse grid — you
  // edit one clip at a time. The embedded caption editor renders into this same
  // shell (its caption box on the shared preview, controls in the left panel).
  if (editingId) {
    bodyEl.innerHTML = `<div class="vc-rows__cell vc-rows__cell--captions vc-rows__cell--solo is-editing" data-vc-floating>${editorPaneHTML()}</div>`;
    return;
  }

  // Single-clip mode with no active edit: nothing to browse.
  if (singleClipMode) {
    bodyEl.innerHTML = "";
    return;
  }

  // Browse grid of clip cards.
  const cards = clips.map((c) => `<div class="vc-rows__cell" data-vc-cell="${c.id}">${clipCardHTML(c)}</div>`).join("");
  bodyEl.innerHTML = `<div class="vc-rows">${cards}</div>`;
}

// Head title + subtitle. Recomputed on every render so the clip count stays
// live as the user adds / deletes clips. The title flips to "Add clip" /
// "Edit clip" in single-clip mode; the subtitle carries the file tag plus the
// "N clips worth posting · M of footage" meta in browse mode.
function renderHeadInfo() {
  if (!currentSource) return;
  const titleEl = document.getElementById("videoClipsTitle");
  if (titleEl) titleEl.textContent = addingNewClip ? "Add clip" : singleClipMode ? "Edit clip" : "Suggested clips";
  const subEl = document.getElementById("videoClipsSub");
  if (!subEl) return;
  // The source name reads as a file tag — same `.ap-tag.mini` pill the composer
  // uses for a mentioned file, with the file-kind glyph.
  const fileTag = `<span class="ap-tag mini blue video-clips-modal__file-tag"><i class="${iconFor(currentSource.kind)}" aria-hidden="true"></i><span>${escapeHtml(shortName(currentSource.filename || "video"))}</span></span>`;
  if (singleClipMode) {
    subEl.innerHTML = fileTag;
  } else {
    const total = currentSource.durationSec || 0;
    subEl.innerHTML = `${fileTag}<span class="video-clips-modal__sub-meta"> · ${clips.length} ${clips.length === 1 ? "clip" : "clips"} worth posting · ${fmtTime(total)} of footage</span>`;
  }
}

function render() {
  // While editing (single or multi-clip, either tab), the VEED editor carries
  // its own bottom timeline, so the multi-clip strip timeline is hidden and the
  // footer shows the edit CTAs (Delete / Cancel / Save) rather than the bulk
  // action. The body flex-fills so the editor grid gets a height.
  const editing = !!editingId;
  const wrapTimeline = document.getElementById("videoClipsTimeline");
  if (wrapTimeline) wrapTimeline.hidden = singleClipMode || editing;
  if (bodyEl) bodyEl.classList.toggle("is-captions", editing);
  if (footEl) footEl.hidden = false;
  if (editing) renderFooterEdit();
  else {
    renderTimeline();
    renderFooter();
  }
  renderBody();
  renderHeadInfo();
  syncCaptionMount();
}

// Swap ONLY the left options panel + rail highlight when changing tabs — the
// rail, stage (preview) and bottom timeline stay mounted, so the video keeps
// playing in place. The caption editor itself stays mounted across tabs (it
// owns the shared preview); switching to Subtitles just (re)populates its
// controls into the freshly-rendered panel.
function renderOptions() {
  if (!bodyEl) return;
  const editor = bodyEl.querySelector("[data-vc-editor]");
  const panel = bodyEl.querySelector("[data-vc-options]");
  if (!editor || !panel) return;
  panel.innerHTML = optionsHTML();
  editor.classList.toggle("vc-editor--subtitles", editorTab === "subtitles");
  editor.querySelectorAll(".vc-rail__item").forEach((b) => {
    const on = b.dataset.vcAction === `tab-${editorTab}`;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", String(on));
  });
  if (editorTab === "subtitles") {
    import("../caption-editor.js?v=1902").then(({ refreshControls }) => refreshControls());
  }
}

// Mount the embedded caption editor on the persistent editor shell for the
// whole edit session (both tabs). It renders its caption box on the shared
// preview and, when the Subtitles options are present, its controls into them.
// onChange folds edits into the draft so Save persists them and Cancel discards.
function syncCaptionMount() {
  const want = !!editingId;
  import("../caption-editor.js?v=1902").then((mod) => {
    capMod = mod;
    if (want) {
      const shell = bodyEl && bodyEl.querySelector("[data-vc-editor]");
      if (shell) {
        mod.mount(shell, draft, currentSource, {
          onChange: (patch) => {
            if (draft) Object.assign(draft, patch);
          },
        });
        captionMounted = true;
      }
    } else if (captionMounted) {
      mod.unmount();
      captionMounted = false;
    }
  });
}

// ── Event delegation ─────────────────────────────────────────────────

function onModalClick(event) {
  // Subtitles options sub-tab (Style / Transcript) — a light toggle that only
  // shows/hides the two sub-panels, keeping the caption-editor hooks intact.
  const subtabEl = event.target.closest("[data-vc-subtab]");
  if (subtabEl) {
    const v = subtabEl.dataset.vcSubtab;
    if (optionsSubtab !== v) {
      optionsSubtab = v;
      const panel = bodyEl && bodyEl.querySelector("[data-vc-options]");
      if (panel) {
        panel.querySelectorAll(".vc-subtab").forEach((b) => {
          const on = b.dataset.vcSubtab === v;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-selected", String(on));
        });
        const styleP = panel.querySelector(".vc-subpanel--style");
        const transP = panel.querySelector(".vc-subpanel--transcript");
        if (styleP) styleP.hidden = v !== "style";
        if (transP) transP.hidden = v !== "transcript";
      }
    }
    return;
  }

  // Export-ratio tile. Repaints the panel (pressed state) and resizes the
  // preview's viewfinder in place — no full render, so playback and the caption
  // mount survive the change.
  const ratioEl = event.target.closest("[data-vc-ratio]");
  if (ratioEl) {
    if (!draft) return;
    const next = ratioEl.dataset.vcRatio;
    if (draft.format !== next && FORMATS[next]) {
      draft.format = next;
      renderOptions();
      syncRatioFrame();
      // The caption box is sized off the stage width, which just changed.
      if (capMod) capMod.repaintStage();
    }
    return;
  }

  const actionEl = event.target.closest("[data-vc-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.vcAction;
  const clipId = actionEl.dataset.vcClip;

  if (action === "toggle") {
    if (selected.has(clipId)) selected.delete(clipId);
    else selected.add(clipId);
    // Toggling doesn't affect the editor pane, so a single render is fine
    // even if the user is in edit mode (the editor lives outside the grid).
    render();
    return;
  }

  if (action === "edit") {
    enterEdit(clipId);
    return;
  }

  if (action === "add-clip") {
    addClip();
    return;
  }

  if (action === "save-edit") {
    saveEdit();
    return;
  }

  if (action === "cancel-edit") {
    cancelEdit();
    return;
  }

  if (action === "delete-clip") {
    // Editor state isn't externally persisted, so a destructive delete
    // without a confirm has no recovery path. Gate on confirm-modal —
    // same pattern as bulk-delete drafts in right-panel.
    const id = editingId;
    import("./confirm-modal.js?v=1902").then(({ open }) => {
      open({
        title: "Delete this clip?",
        body: "This removes the clip from the editor. You'll need to re-extract or re-create it manually.",
        confirmLabel: "Delete clip",
        cancelLabel: "Keep editing",
        danger: true,
        onConfirm: () => deleteClip(id),
      });
    });
    return;
  }

  if (action === "toggle-trim") {
    trimMode = !trimMode;
    const ed = bodyEl && bodyEl.querySelector("[data-vc-editor]");
    if (ed) ed.classList.toggle("is-trimming", trimMode);
    actionEl.setAttribute("aria-pressed", String(trimMode));
    return;
  }

  if (action === "set-in") {
    if (!draft) return;
    // Use the live playhead (it advances during playback).
    if (capMod) draftPlayhead = capMod.getFraction() * (currentSource?.durationSec || 0);
    draft.start = Math.min(draft.end - MIN_CLIP, draftPlayhead);
    syncEditorAfterDrag();
    return;
  }
  if (action === "set-out") {
    if (!draft) return;
    if (capMod) draftPlayhead = capMod.getFraction() * (currentSource?.durationSec || 0);
    draft.end = Math.max(draft.start + MIN_CLIP, draftPlayhead);
    syncEditorAfterDrag();
    return;
  }
  if (action === "seek-start") {
    if (!draft) return;
    draftPlayhead = draft.start;
    syncEditorAfterDrag();
    return;
  }
  if (action === "seek-end") {
    if (!draft) return;
    draftPlayhead = draft.end;
    syncEditorAfterDrag();
    return;
  }

  if (action === "tab-clip") {
    if (editorTab !== "clip") {
      editorTab = "clip";
      renderOptions();
    }
    return;
  }

  if (action === "tab-ratio") {
    if (editorTab !== "ratio") {
      editorTab = "ratio";
      renderOptions();
    }
    return;
  }

  if (action === "tab-subtitles") {
    if (editorTab !== "subtitles") {
      editorTab = "subtitles";
      renderOptions();
    }
    return;
  }

  if (action === "use-clips") {
    if (selected.size === 0 || editingId) return;
    if (typeof onUseCallback === "function") {
      const selectedClips = clips.filter((c) => selected.has(c.id));
      onUseCallback(selectedClips, currentSource);
    }
    close();
    return;
  }

  if (action === "cancel") {
    close();
    return;
  }
}

// ── InlineEdit (contenteditable) ─────────────────────────────────────

function onModalInput(event) {
  const field = event.target.closest("[data-vc-edit-field]");
  if (field && draft) {
    const key = field.dataset.vcEditField;
    draft[key] = field.textContent;
    if (key === "title") {
      // Title also lives in the strip timeline tooltip — keep it in sync.
      renderTimeline();
    }
    return;
  }
}

function onModalKeydown(event) {
  // contenteditable: Enter on the single-line title commits & blurs.
  const field = event.target.closest("[data-vc-edit-field]");
  if (field && event.key === "Enter" && field.dataset.vcEditField === "title") {
    event.preventDefault();
    field.blur();
    return;
  }

  // Stepper arrows.
  const stepper = event.target.closest("[data-vc-stepper]");
  if (stepper && draft) {
    if (event.key === "Enter") {
      event.preventDefault();
      stepper.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 1 : -1;
      const which = stepper.dataset.vcStepper; // "start" or "end"
      stepDraft(which, delta);
    }
  }
}

function onStepperBlur(event) {
  const stepper = event.target.closest("[data-vc-stepper]");
  if (!stepper || !draft) return;
  const which = stepper.dataset.vcStepper;
  const parsed = parseTime(stepper.value);
  if (parsed == null) {
    stepper.value = fmtTime(draft[which]);
    return;
  }
  if (which === "start") {
    draft.start = clamp(parsed, 0, draft.end - MIN_CLIP);
  } else {
    draft.end = clamp(parsed, draft.start + MIN_CLIP, currentSource?.durationSec || parsed);
  }
  syncEditorAfterDrag();
}

function stepDraft(which, delta) {
  if (!draft) return;
  const duration = currentSource?.durationSec || 0;
  if (which === "start") {
    draft.start = clamp(draft.start + delta, 0, draft.end - MIN_CLIP);
  } else {
    draft.end = clamp(draft.end + delta, draft.start + MIN_CLIP, duration);
  }
  syncEditorAfterDrag();
}

// ── Drag (pro trimmer) ───────────────────────────────────────────────
// Pointer Events unify mouse + touch + pen so the handles work on
// tablets and touch laptops. Naming kept as Mousedown/Mousemove/Mouseup
// for git-blame stability; the underlying events are pointer*.

function onProtrimMousedown(event) {
  const dragEl = event.target.closest("[data-vc-drag]");
  if (!dragEl || !draft) return;
  event.preventDefault();
  event.stopPropagation();
  const kind = dragEl.dataset.vcDrag; // "start" | "end" | "window" | "playhead"
  const track = document.querySelector("[data-vc-protrim-track]");
  if (!track) return;
  const rect = track.getBoundingClientRect();
  dragState = {
    kind,
    startX: event.clientX,
    anchorStart: draft.start,
    anchorEnd: draft.end,
    anchorPlayhead: draftPlayhead,
    trackWidth: rect.width,
    rectLeft: rect.left,
  };
  document.querySelector("[data-vc-protrim]")?.classList.add("is-dragging", `is-dragging--${kind}`);
  window.addEventListener("pointermove", onProtrimMousemove);
  window.addEventListener("pointerup", onProtrimMouseup);
  window.addEventListener("pointercancel", onProtrimMouseup);
}

function onProtrimTrackClick(event) {
  // Click on empty track (not on a handle/window/playhead) → move playhead.
  if (!draft) return;
  if (dragState) return;
  if (event.target.closest("[data-vc-drag]")) return;
  if (event.target.closest("[data-vc-protrim-window]")) return;
  const track = event.currentTarget;
  const rect = track.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const duration = currentSource?.durationSec || 0;
  draftPlayhead = ratio * duration;
  // Drive playback so the transport scrub + preview follow the timeline.
  if (capMod) capMod.seekFraction(ratio);
  syncEditorAfterDrag();
}

function onProtrimMousemove(event) {
  if (!dragState || !draft) return;
  const duration = currentSource?.durationSec || 0;
  const dx = event.clientX - dragState.startX;
  const dt = (dx / dragState.trackWidth) * duration;

  if (dragState.kind === "start") {
    let s = clamp(dragState.anchorStart + dt, 0, dragState.anchorEnd - MIN_CLIP);
    let e = dragState.anchorEnd;
    if (e - s > MAX_CLIP) s = e - MAX_CLIP;
    draft.start = s;
    draft.end = e;
  } else if (dragState.kind === "end") {
    let s = dragState.anchorStart;
    let e = clamp(dragState.anchorEnd + dt, dragState.anchorStart + MIN_CLIP, duration);
    if (e - s > MAX_CLIP) e = s + MAX_CLIP;
    draft.start = s;
    draft.end = e;
  } else if (dragState.kind === "window") {
    const len = dragState.anchorEnd - dragState.anchorStart;
    const s = clamp(dragState.anchorStart + dt, 0, duration - len);
    draft.start = s;
    draft.end = s + len;
  } else if (dragState.kind === "playhead") {
    draftPlayhead = clamp(dragState.anchorPlayhead + dt, 0, duration);
    if (capMod && duration) capMod.seekFraction(draftPlayhead / duration);
  }

  syncEditorAfterDrag();
}

function onProtrimMouseup() {
  if (!dragState) return;
  dragState = null;
  document
    .querySelector("[data-vc-protrim]")
    ?.classList.remove(
      "is-dragging",
      "is-dragging--start",
      "is-dragging--end",
      "is-dragging--window",
      "is-dragging--playhead",
    );
  window.removeEventListener("pointermove", onProtrimMousemove);
  window.removeEventListener("pointerup", onProtrimMouseup);
  window.removeEventListener("pointercancel", onProtrimMouseup);
}

// Resizes the preview's viewfinder to the picked output ratio, and the edited
// row's thumbnail window with it (visible behind the editor in browse mode).
// Patched in place — same "no full re-render" rule as the trimmer, so the
// contenteditable fields and the playing video keep their state.
function syncRatioFrame() {
  if (!draft) return;
  const ratio = ratioValue(draft.format);

  const frame = document.querySelector("[data-vc-crop-frame]");
  if (frame) frame.style.aspectRatio = ratio;

  const thumbWin = document.querySelector(`[data-vc-cell="${draft.id}"] [data-vc-thumb-crop]`);
  if (thumbWin) thumbWin.style.aspectRatio = ratio;
}

// Patches the in-editor DOM after a drag/seek so the contenteditable cursor
// doesn't get blown away by a full re-render. Mirrors what React would
// reconcile, but explicitly.
function syncEditorAfterDrag() {
  if (!draft) return;
  const duration = currentSource?.durationSec || 1;
  const leftPct = (draft.start / duration) * 100;
  const widthPct = ((draft.end - draft.start) / duration) * 100;
  const playheadPct = (draftPlayhead / duration) * 100;

  // The window carries the handles (CSS-anchored to its edges), so positioning
  // it positions them too — no per-handle left update needed.
  const win = document.querySelector("[data-vc-protrim-window]");
  if (win) {
    win.style.left = `${leftPct}%`;
    win.style.width = `${widthPct}%`;
  }
  const dimL = document.querySelector("[data-vc-protrim-dim-l]");
  if (dimL) dimL.style.width = `${leftPct}%`;
  const dimR = document.querySelector("[data-vc-protrim-dim-r]");
  if (dimR) dimR.style.left = `${leftPct + widthPct}%`;
  const playhead = document.querySelector("[data-vc-protrim-playhead]");
  if (playhead) playhead.style.left = `${playheadPct}%`;

  const labelL = document.querySelector("[data-vc-protrim-label-l]");
  if (labelL) labelL.textContent = fmtTime(draft.start);
  const labelR = document.querySelector("[data-vc-protrim-label-r]");
  if (labelR) labelR.textContent = fmtTime(draft.end);
  const labelC = document.querySelector("[data-vc-protrim-label-c]");
  if (labelC) labelC.textContent = fmtTime(draft.end - draft.start);

  const stepStart = document.querySelector('[data-vc-stepper="start"]');
  if (stepStart && document.activeElement !== stepStart) stepStart.value = fmtTime(draft.start);
  const stepEnd = document.querySelector('[data-vc-stepper="end"]');
  if (stepEnd && document.activeElement !== stepEnd) stepEnd.value = fmtTime(draft.end);

  // Strip timeline at the top reflects the live window too.
  renderTimeline();
}

// ── Edit flow ────────────────────────────────────────────────────────

function enterEdit(clipId) {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return;
  addingNewClip = false;
  editingId = clipId;
  draft = { ...clip };
  ensureDraftFormat(draft);
  ensureDraftCaptions(draft);
  draftPlayhead = clip.start;
  editorTab = "clip";
  optionsSubtab = "style";
  trimMode = false;
  render();
  // Reset the body's scroll position so the sticky editor sits at the top
  // of the visible area. NOT scrollIntoView — that bubbles up the ancestor
  // chain and scrolls the modal itself (yes, even with overflow: hidden),
  // which pushes the modal header offscreen and leaves dead space below
  // the footer.
  if (bodyEl) bodyEl.scrollTop = 0;
}

function saveEdit() {
  if (!draft) return;
  const idx = clips.findIndex((c) => c.id === draft.id);
  if (idx !== -1) {
    clips[idx] = { ...draft };
  } else {
    // New clip added via addClip() — wasn't in the array yet.
    clips.push({ ...draft });
    selected.add(draft.id);
  }
  notifySave();
  editingId = null;
  draft = null;
  addingNewClip = false;
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

// Add a brand-new clip: a ~30s window in the next gap after the last clip,
// opened straight into the editor so the user trims + titles it. Persisted on
// save via saveEdit (which pushes it because it's not yet in `clips`).
function addClip() {
  if (!currentSource) return;
  const duration = currentSource.durationSec || 1458;
  const lastEnd = clips.reduce((m, c) => Math.max(m, c.end || 0), 0);
  let start = Math.min(lastEnd, Math.max(0, duration - MIN_CLIP));
  let end = Math.min(start + 30, duration);
  if (end - start < MIN_CLIP) {
    start = Math.max(0, duration - 30);
    end = duration;
  }
  const newClip = {
    id: `clip_${currentSource.id}_new_${Date.now().toString(36)}`,
    start,
    end,
    hue: (clips.length * 57) % 360,
    title: "New clip",
    summary: "",
    why: "",
    network: "instagram",
    tags: [],
  };
  addingNewClip = true;
  editingId = newClip.id;
  draft = { ...newClip };
  ensureDraftFormat(draft);
  ensureDraftCaptions(draft);
  draftPlayhead = start;
  editorTab = "clip";
  render();
  if (bodyEl) bodyEl.scrollTop = 0;
}

function cancelEdit() {
  editingId = null;
  draft = null;
  addingNewClip = false;
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

function deleteClip(clipId) {
  clips = clips.filter((c) => c.id !== clipId);
  selected.delete(clipId);
  editingId = null;
  draft = null;
  addingNewClip = false;
  notifySave();
  if (singleClipMode) {
    close();
    return;
  }
  render();
}

function notifySave() {
  if (typeof onSaveCallback === "function" && currentSource) {
    onSaveCallback(
      currentSource.id,
      clips.map((c) => ({ ...c })),
    );
  }
}

// ── Keyboard ─────────────────────────────────────────────────────────

function onKeydownGlobal(event) {
  if (!modal?.classList.contains("open")) return;
  if (event.key === "Escape") {
    if (editingId) {
      cancelEdit();
    } else {
      close();
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", SHELL_HTML);

  backdrop = document.getElementById("videoClipsBackdrop");
  modal = document.getElementById("videoClipsModal");
  bodyEl = document.getElementById("videoClipsBody");
  timelineEl = document.getElementById("videoClipsTimelineBar");
  footEl = document.getElementById("videoClipsFoot");

  document.getElementById("videoClipsClose").addEventListener("click", () => close());
  document.getElementById("videoClipsExpand").addEventListener("click", () => toggleExpand());
  backdrop.addEventListener("click", () => {
    // Backdrop click ignored while editing — protects in-progress edits.
    if (!editingId) close();
  });
  modal.addEventListener("click", onModalClick);
  modal.addEventListener("input", onModalInput);
  modal.addEventListener("keydown", onModalKeydown);
  modal.addEventListener("blur", onStepperBlur, true);
  // Drag is wired at the protrim level so handles + window + playhead are
  // all caught. Track click (for scrub) lives on the track wrapper.
  modal.addEventListener("pointerdown", (event) => {
    const trackClick = event.target.closest("[data-vc-protrim-track]");
    if (trackClick && !event.target.closest("[data-vc-drag]")) {
      // We intentionally don't call onProtrimMousedown — the click handler
      // moves the playhead instead. pointerdown on the track itself is the
      // scrub gesture.
      onProtrimTrackClick({ currentTarget: trackClick, clientX: event.clientX, target: event.target });
      return;
    }
    onProtrimMousedown(event);
  });
  document.addEventListener("keydown", onKeydownGlobal);
}

export function open(source, callbacks = {}) {
  if (!source) return;
  if (!initialized) init();
  requestOpen(MODAL_ID, close);

  currentSource = source;
  clips = (source.clips || []).map((c) => ({ ...c }));
  selected = new Set(clips.map((c) => c.id));
  editingId = null;
  draft = null;
  draftPlayhead = 0;
  singleClipMode = false;
  editorTab = callbacks.captionsTab ? "subtitles" : "clip";
  optionsSubtab = "style";
  expanded = false;
  trimMode = false;
  onUseCallback = typeof callbacks.onUseClips === "function" ? callbacks.onUseClips : null;
  onSaveCallback = typeof callbacks.onSaveClips === "function" ? callbacks.onSaveClips : null;

  // Optional pre-positioning into edit mode for a specific clip — used by
  // the right-panel clip-card's Edit affordance. Activates single-clip
  // mode so the modal hides every multi-clip surface (browse grid,
  // timeline, bulk toolbar, bulk footer) and only shows the editor pane
  // for the target clip.
  if (callbacks.editingClipId) {
    const target = clips.find((c) => c.id === callbacks.editingClipId);
    if (target) {
      singleClipMode = true;
      editingId = target.id;
      draft = { ...target };
      ensureDraftFormat(draft);
      ensureDraftCaptions(draft);
      // When opened from a post, seed the crop ratio from the post's chosen
      // export format (passed via clipOverrides) so the preview + deadzones
      // match what that post will actually publish — not the clip's default.
      const ovFormat = callbacks.clipOverrides && callbacks.clipOverrides.format;
      if (ovFormat && FORMATS[ovFormat]) draft.format = ovFormat;
      draftPlayhead = target.start || 0;
    }
  } else if (callbacks.startAddClip) {
    // Add-a-clip entry — single-clip editor on a fresh clip (see addClip()).
    singleClipMode = true;
  }

  addingNewClip = !!callbacks.startAddClip;
  renderHeadInfo();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.classList.toggle("is-single-clip", singleClipMode);
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  applyExpanded();

  if (callbacks.startAddClip) {
    addClip(); // sets draft on a fresh clip + renders the editor
  } else {
    render();
  }
}

// Toggle the modal between its default sizing and a near-fullscreen surface.
function toggleExpand() {
  expanded = !expanded;
  applyExpanded();
}

function applyExpanded() {
  if (!modal) return;
  modal.classList.toggle("is-expanded", expanded);
  const btn = document.getElementById("videoClipsExpand");
  if (btn) {
    const icon = btn.querySelector("i");
    if (icon) icon.className = expanded ? "ap-icon-minimize" : "ap-icon-maximize";
    const label = expanded ? "Exit fullscreen" : "Expand to fullscreen";
    btn.setAttribute("aria-label", label);
    btn.title = expanded ? "Collapse" : "Expand";
  }
}

function close() {
  if (!initialized || !modal?.classList.contains("open")) return;
  // Tear down the embedded caption editor if it's mounted.
  if (captionMounted) {
    import("../caption-editor.js?v=1902").then(({ unmount }) => unmount());
    captionMounted = false;
  }
  modal.classList.remove("open");
  modal.classList.remove("is-single-clip");
  modal.classList.remove("is-expanded");
  expanded = false;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");

  // Reset ephemeral state.
  currentSource = null;
  clips = [];
  selected = new Set();
  editingId = null;
  draft = null;
  draftPlayhead = 0;
  dragState = null;
  singleClipMode = false;
  addingNewClip = false;
  editorTab = "clip";
  onUseCallback = null;
  onSaveCallback = null;

  // Restore the multi-clip surfaces that single-clip mode hid so the next
  // open() in normal mode shows them.
  const wrapTimeline = document.getElementById("videoClipsTimeline");
  if (wrapTimeline) wrapTimeline.hidden = false;
  if (footEl) footEl.hidden = false;

  notifyClose(MODAL_ID);
}
