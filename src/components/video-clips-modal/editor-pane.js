// The clip editor's markup: the options sheet and the editor pane (timeline,
// trim, captions tab). Pure render — it reads the modal's state, owned and
// written by video-clips-modal.js. Moved out of it, unchanged.

import { CLIP_RATIO_ORDER, FORMATS, ratioNetworksMeta } from "../../clip-formats.js?v=1820";
import { escapeHtml } from "../../utils.js?v=1820";
import {
  currentSource,
  draft,
  draftPlayhead,
  editorTab,
  fmtTime,
  optionsSubtab,
  trimMode,
} from "../video-clips-modal.js?v=1820";

// Left options panel content — the ONLY part of the editor that swaps between
// tabs. Clip → title/summary; Crop → export ratio + framing; Subtitles →
// Style / Transcript sub-tabs. The rail, stage (preview) and bottom timeline
// stay mounted across the switch.
export function optionsHTML() {
  if (!draft) return "";

  if (editorTab === "ratio") {
    // One tile per export ratio, drawn at its true proportions so the shape
    // reads before the label. `ratioNetworksMeta` is the same "Best for +
    // network logos" hint the in-chat aspect-ratio picker uses.
    const tiles = CLIP_RATIO_ORDER.map((id) => FORMATS[id])
      .filter(Boolean)
      .map((f) => {
        const on = draft.format === f.id;
        return `
      <button type="button" class="vc-ratio__tile${on ? " is-on" : ""}" data-vc-ratio="${f.id}"
              aria-pressed="${on}" title="${escapeHtml(f.label)}">
        <span class="vc-ratio__glyph" aria-hidden="true"><span class="vc-ratio__glyph-frame" style="aspect-ratio: ${f.id.replace(":", "/")}"></span></span>
        <span class="vc-ratio__text">
          <span class="vc-ratio__tag">${escapeHtml(f.tag)}</span>
          <span class="vc-ratio__label">${escapeHtml(f.label)}</span>
        </span>
        ${ratioNetworksMeta(f)}
      </button>`;
      })
      .join("");

    return `
      <div class="vc-editor__field">
        <label class="vc-editor__label">Export ratio</label>
        <div class="vc-ratio">${tiles}</div>
      </div>`;
  }

  if (editorTab === "subtitles") {
    return `
      <div class="vc-subtabs" role="tablist">
        <button type="button" class="vc-subtab${optionsSubtab === "style" ? " is-on" : ""}" data-vc-subtab="style" role="tab" aria-selected="${optionsSubtab === "style"}">Style</button>
        <button type="button" class="vc-subtab${optionsSubtab === "transcript" ? " is-on" : ""}" data-vc-subtab="transcript" role="tab" aria-selected="${optionsSubtab === "transcript"}">Transcript</button>
      </div>
      <div class="vc-subpanel vc-subpanel--style"${optionsSubtab === "style" ? "" : " hidden"}>
        <div class="cap-ed__tabs" role="tablist">
          <button type="button" class="cap-ed__tab" data-ce-tab="presets">Presets</button>
          <button type="button" class="cap-ed__tab" data-ce-tab="font">Font</button>
          <button type="button" class="cap-ed__tab" data-ce-tab="effects">Effects</button>
        </div>
        <div class="cap-ed__tabpanel" data-ce-tabpanel></div>
      </div>
      <div class="vc-subpanel vc-subpanel--transcript"${optionsSubtab === "transcript" ? "" : " hidden"}>
        <div class="cap-ed__left-head">
          <span class="cap-ed-group-label">Transcript</span>
          <span class="cap-ed__meta" data-ce-reconcile></span>
        </div>
        <button type="button" class="cap-ed__cleanup-btn" data-ce="open-cleanup" aria-pressed="false">
          <i class="ap-icon-archie-official"></i><span>Speech cleanup</span>
          <span class="cap-ed__cleanup-count" data-ce-cleanup-count></span>
        </button>
        <div class="cap-ed__cleanup-bar" data-ce-cleanup-bar hidden></div>
        <div class="cap-ed__hint" data-ce-hint>Click to seek · double-click to edit</div>
        <div class="cap-ed__transcript" data-ce-transcript></div>
      </div>`;
  }

  // Clip tab — title + summary, then the AI rationale + tags so the panel
  // carries real signal (the live time range stays in the timeline below).
  const tags = (draft.tags || []).map((t) => `<span class="vc-row__tag">#${escapeHtml(t)}</span>`).join("");
  return `
    <div class="vc-editor__field">
      <label class="vc-editor__label">Clip title</label>
      <div class="vc-editor__title-input vc-edit" contenteditable="true" data-vc-edit-field="title" data-placeholder="What this moment is about…">${escapeHtml(draft.title || "")}</div>
    </div>
    <div class="vc-editor__field">
      <label class="vc-editor__label">Summary</label>
      <div class="vc-editor__textarea vc-edit" contenteditable="true" data-vc-edit-field="summary" data-placeholder="What's in this moment — context I should remember when drafting…">${escapeHtml(draft.summary || "")}</div>
    </div>
    ${
      draft.why
        ? `<div class="vc-editor__field">
      <label class="vc-editor__label vc-editor__label--ai"><i class="ap-icon-archie-official" aria-hidden="true"></i> Why I picked this</label>
      <p class="vc-editor__why">${escapeHtml(draft.why)}</p>
    </div>`
        : ""
    }
    ${
      tags
        ? `<div class="vc-editor__field">
      <label class="vc-editor__label">Tags</label>
      <div class="vc-editor__tags">${tags}</div>
    </div>`
        : ""
    }`;
}

export function editorPaneHTML() {
  if (!draft) return "";
  const duration = currentSource?.durationSec || 1;

  // Pro-trim filmstrip — flat dark frames (no gradients). The thin dividers
  // (CSS) read as a scrubber strip; alternating tones come from CSS :nth-child.
  let thumbs = "";
  for (let i = 0; i < 24; i += 1) thumbs += `<span class="vc-protrim__thumb"></span>`;

  // Faux audio waveform under the filmstrip — deterministic bar heights so the
  // shape is stable per render (no real audio analysis in the prototype).
  let waveBars = "";
  for (let i = 0; i < 96; i += 1) {
    const v = Math.abs(Math.sin(i * 0.6) * 0.5 + Math.sin(i * 0.21 + 1.3) * 0.35 + Math.sin(i * 1.7) * 0.15);
    waveBars += `<span class="vc-wave__bar" style="height: ${Math.round(14 + v * 82)}%"></span>`;
  }

  // Ruler ticks (4–12 evenly spaced).
  const tickCount = Math.min(12, Math.max(4, Math.round(duration / 120)));
  let ticks = "";
  for (let i = 0; i <= tickCount; i += 1) {
    const t = (i / tickCount) * duration;
    const pct = (i / tickCount) * 100;
    ticks += `
      <span class="vc-protrim__ruler-tick" style="left: ${pct}%">
        <span class="vc-protrim__ruler-mark"></span>
        <span class="vc-protrim__ruler-label">${fmtTime(t)}</span>
      </span>
    `;
  }

  const leftPct = (draft.start / duration) * 100;
  const widthPct = ((draft.end - draft.start) / duration) * 100;
  const playheadPct = (draftPlayhead / duration) * 100;

  const cropRatio = (FORMATS[draft.format] || FORMATS["16:9"]).ratio;
  // VEED-style vertical tool rail — replaces the old top tabs. Switches the
  // editor between the Clip (trim), Ratio and Subtitles sections.
  const railHTML = `
    <nav class="vc-rail" role="tablist" aria-label="Editor sections">
      <button type="button" class="vc-rail__item${editorTab === "clip" ? " is-on" : ""}" data-vc-action="tab-clip" role="tab" aria-selected="${editorTab === "clip"}">
        <i class="ap-icon-video" aria-hidden="true"></i><span>Clip</span>
      </button>
      <button type="button" class="vc-rail__item${editorTab === "ratio" ? " is-on" : ""}" data-vc-action="tab-ratio" role="tab" aria-selected="${editorTab === "ratio"}">
        <i class="ap-icon-cropper" aria-hidden="true"></i><span>Ratio</span>
      </button>
      <button type="button" class="vc-rail__item${editorTab === "subtitles" ? " is-on" : ""}" data-vc-action="tab-subtitles" role="tab" aria-selected="${editorTab === "subtitles"}">
        <i class="ap-icon-closed-captions" aria-hidden="true"></i><span>Subtitles</span>
      </button>
    </nav>`;

  // Persistent shell — rail · options(swap) · stage(preview) · timeline. Only
  // the [data-vc-options] panel changes between Clip and Subtitles; the rail,
  // stage and bottom timeline stay mounted. The stage carries the caption
  // editor's data-ce-* hooks so the embedded editor renders its caption box on
  // this same preview (no second preview).
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
    .map((d) => `<span class="cap-ed-handle cap-ed-handle--${d}" data-ce-resize="${d}"></span>`)
    .join("");

  return `
    <div class="vc-editor vc-editor--veed${trimMode ? " is-trimming" : ""}" data-vc-editor data-vc-clip="${draft.id}">
      ${railHTML}

      <aside class="vc-panel vc-options" data-vc-options>${optionsHTML()}</aside>

      <main class="vc-stage">
        <div class="vc-preview">
          <video class="vc-preview__video cap-ed__video" data-ce-video muted loop playsinline></video>
          <div class="vc-preview__crop" data-vc-crop data-vc-crop-frame data-ce-stage
               style="aspect-ratio: ${cropRatio}">
            <div class="cap-ed__deadzones" data-ce-deadzones></div>
            <div class="cap-ed__playicon" data-ce-playicon>
              <svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </div>
            <div class="cap-ed-box" data-ce-box></div>
            <div class="cap-ed-frame" data-ce-frame>${handles}</div>
          </div>
        </div>
      </main>

      <div class="vc-editor__timeline">
        <div class="vc-editor__timeline-head">
          <div class="cap-ed__transport vc-timeline__transport">
            <button type="button" class="cap-ed__icon-btn cap-ed__icon-btn--ghost" data-ce="back" aria-label="Back 5 seconds" title="Back 5s">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="cap-ed__icon-btn" data-ce="playpause" aria-label="Play / pause">
              <svg viewBox="0 0 24 24" width="16" height="16" data-ce-playglyph><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="cap-ed__icon-btn cap-ed__icon-btn--ghost" data-ce="fwd" aria-label="Forward 5 seconds" title="Forward 5s">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" fill="currentColor"/></svg>
            </button>
            <span class="cap-ed__time"><span data-ce-cur>0:00</span> / <span data-ce-dur>0:00</span></span>
            <div class="cap-ed__scrub" data-ce-scrub><div class="cap-ed__scrub-fill" data-ce-scrub-fill></div></div>
          </div>
          <div class="vc-editor__timeline-stepper">
            <span class="vc-stepper">
              <span class="vc-stepper__label">In</span>
              <input type="text" class="vc-stepper__input" data-vc-stepper="start" value="${fmtTime(draft.start)}" />
            </span>
            <span class="vc-stepper">
              <span class="vc-stepper__label">Out</span>
              <input type="text" class="vc-stepper__input" data-vc-stepper="end" value="${fmtTime(draft.end)}" />
            </span>
            <span class="vc-editor__timeline-set">
              <button type="button" class="vc-editor__set-btn" data-vc-action="set-in">Set IN</button>
              <button type="button" class="vc-editor__set-btn" data-vc-action="set-out">Set OUT</button>
            </span>
            <span class="vc-editor__timeline-hint">Drag handles to trim</span>
          </div>
          <!-- Label-only: ap-icon-cropper now belongs to the Crop section, and
               the DS has no trim/scissors glyph — one glyph, one meaning. -->
          <button type="button" class="vc-trim-toggle" data-vc-action="toggle-trim" aria-pressed="${trimMode}" title="Trim clip">
            <span>Trim</span>
          </button>
        </div>
        <div class="vc-protrim" data-vc-protrim>
          <div class="vc-protrim__ruler">${ticks}</div>
          <div class="vc-protrim__track" data-vc-protrim-track>
            <div class="vc-protrim__thumbs">${thumbs}</div>
            <div class="vc-protrim__wave" aria-hidden="true"><div class="vc-wave__bars">${waveBars}</div></div>
            <div class="vc-protrim__dim vc-protrim__dim--l" data-vc-protrim-dim-l style="width: ${leftPct}%"></div>
            <div class="vc-protrim__dim vc-protrim__dim--r" data-vc-protrim-dim-r style="left: ${leftPct + widthPct}%; right: 0"></div>
            <div class="vc-protrim__window" data-vc-protrim-window data-vc-drag="window" style="left: ${leftPct}%; width: ${widthPct}%">
              <div class="vc-protrim__handle vc-protrim__handle--l" data-vc-drag="start">
                <span class="vc-protrim__grip"></span>
              </div>
              <div class="vc-protrim__handle vc-protrim__handle--r" data-vc-drag="end">
                <span class="vc-protrim__grip"></span>
              </div>
              <span class="vc-protrim__win-label vc-protrim__win-label--l" data-vc-protrim-label-l>${fmtTime(draft.start)}</span>
              <span class="vc-protrim__win-label vc-protrim__win-label--c" data-vc-protrim-label-c>${fmtTime(draft.end - draft.start)}</span>
              <span class="vc-protrim__win-label vc-protrim__win-label--r" data-vc-protrim-label-r>${fmtTime(draft.end)}</span>
            </div>
            <div class="vc-protrim__playhead" data-vc-drag="playhead" data-vc-protrim-playhead style="left: ${playheadPct}%">
              <span class="vc-protrim__playhead-knob"></span>
              <span class="vc-protrim__playhead-line"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
