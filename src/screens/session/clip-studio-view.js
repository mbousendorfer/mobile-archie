// The Clip Studio as the session screen hosts it: its steps (upload →
// analysing → clips → profiles), the render of each, and the handlers that
// move it along. Moved out of session.js, unchanged — session.js keeps the one
// delegated listener (bindSession) that calls in here. Stages are rooted on
// `.session__assistant` (+ a `clip-studio--{stage}` modifier) so drag/drop
// binding and the refreshAssistantAside node-swap keep working; state lives in
// clip-studio.js.

import * as clipStudio from "../../clip-studio.js?v=1924";
import { isWorkspaceMode } from "../../active-playbook.js?v=1924";
import { usableContexts } from "../../playbook-access.js?v=1924";
import { escapeHtml, html, raw } from "../../utils.js?v=1924";
import { getContextById } from "../../contexts-store.js?v=1924";
import { dropzoneHTML } from "../../components/dropzone.js?v=1924";
import { renderClipCard } from "../../components/clip-card.js?v=1924";
import { connectableNetworkCards } from "../../connect-profiles-flow.js?v=1924";
import { getConnectedProfiles, PROFILE_SEARCH_THRESHOLD, renderProfileTag } from "../../social-profiles.js?v=1924";
import { defaultFormatFor, formatsForNetwork } from "../../clip-formats.js?v=1924";
import {
  classifyFile,
  pushScriptedSource,
  completeScriptedSource,
  updateSourceClips,
} from "../../sources-stream.js?v=1924";
import { showToast } from "../../components/toast.js?v=1924";
import { open as openVideoClipsModal } from "../../components/video-clips-modal.js?v=1924";
import {
  postAssistantMessage,
  postClipExtractionTurn,
  startPending,
  finishPending,
  GENERATION_TOOLS,
  postDraftResult,
} from "../../assistant.js?v=1924";
import { addPostDraft } from "../../posts-store.js?v=1924";
import { clipContext } from "./clip-draft-flow.js?v=1924";
import { dotColorVar } from "../session.js?v=1924";
import { buildWorkflowFlow } from "./workflow-flow.js?v=1924";

// Config catalogs for the upload/config screen.
const CLIP_CAPTION_STYLES = [
  { value: "none", label: "None" },
  { value: "bold", label: "Bold" },
  { value: "clean", label: "Clean" },
  { value: "caption", label: "Caption" },
];

const CLIP_CAPTION_SAMPLE = "Bring your story to life";

const CLIP_NETWORKS = [
  { id: "tiktok", label: "TikTok", icon: "ap-icon-tiktok-official" },
  { id: "instagram", label: "Instagram", icon: "ap-icon-instagram-official" },
  { id: "linkedin", label: "LinkedIn", icon: "ap-icon-linkedin-official" },
  { id: "x", label: "X", icon: "ap-icon-x-official" },
  { id: "facebook", label: "Facebook", icon: "ap-icon-facebook-official" },
];

const CLIP_NET_ICON = Object.fromEntries(CLIP_NETWORKS.map((n) => [n.id, n.icon]));

// Output format is the real choice; the network icons are just an indication of
// which networks each ratio suits best.
const CLIP_FORMATS_UI = [
  { id: "9:16", label: "Vertical", nets: ["tiktok", "instagram"] },
  { id: "1:1", label: "Square", nets: ["linkedin", "facebook"] },
  { id: "16:9", label: "Landscape", nets: ["x", "linkedin"] },
  { id: "4:5", label: "Portrait", nets: ["instagram", "facebook"] },
];

// Clip duration — same idea: the network icons indicate which networks favour
// that length (network = guidance, not a hard filter).
const CLIP_DURATIONS_UI = [
  { id: "auto", label: "Auto", sub: "Smart pick", nets: [] },
  { id: "short", label: "≤ 30s", sub: "Shorts & Reels", nets: ["tiktok", "instagram"] },
  { id: "medium", label: "30–60s", sub: "Feed clips", nets: ["instagram", "facebook"] },
  { id: "long", label: "60–90s", sub: "Long-form", nets: ["linkedin", "x"] },
];

export function renderClipStudio(session, attachedContext) {
  const st = clipStudio.getState(session.id);
  if (!st) return "";
  if (st.stage === "profiles") return renderClipStudioProfiles(session, st);
  if (st.stage === "clips") return renderClipStudioClips(session, st);
  if (st.stage === "analyzing") return renderClipStudioAnalyzing(st);
  return renderClipStudioUpload(st);
}

// Output-format picker — single choice. Each option shows the networks it
// suits as an indication (the network is guidance, not a target selector).
// Shared between the setup screen and the clips-review screen (the format +
// caption choice now lives on review; see renderClipStudioClips).
function buildClipFormatCards(cfg) {
  return CLIP_FORMATS_UI.map((f) => {
    const on = cfg.format === f.id;
    const nets = f.nets
      .map((id) => `<i class="${CLIP_NET_ICON[id]} clip-studio__fmtcard-net" aria-hidden="true"></i>`)
      .join("");
    return `<button type="button" class="clip-studio__fmtcard${on ? " is-on" : ""}" data-clip-config="format" data-value="${f.id}" aria-pressed="${on}">
      <span class="clip-studio__fmtcard-shape clip-studio__fmtcard-shape--${f.id.replace(":", "-")}"></span>
      <span class="clip-studio__fmtcard-info">
        <span class="clip-studio__fmtcard-ratio">${f.id}</span>
        <span class="clip-studio__fmtcard-label">${f.label}</span>
      </span>
      <span class="clip-studio__fmtcard-nets">${nets}</span>
    </button>`;
  }).join("");
}

function buildClipCaptionCards(cfg) {
  return CLIP_CAPTION_STYLES.map((c) => {
    const on = cfg.captionStyle === c.value;
    const preview =
      c.value === "none"
        ? `<span class="clip-studio__cap-none"><i class="ap-icon-close" aria-hidden="true"></i></span>`
        : `<span class="clip-studio__cap-sample clip-studio__cap-sample--${c.value}">${CLIP_CAPTION_SAMPLE}</span>`;
    return `<button type="button" class="clip-studio__cap-card${on ? " is-on" : ""}" data-clip-config="captionStyle" data-value="${c.value}" aria-pressed="${on}">
      <span class="clip-studio__cap-preview">${preview}</span>
      <span class="clip-studio__cap-label">${c.label}</span>
    </button>`;
  }).join("");
}

// Playbook picker for the clip-studio setup — the chosen Playbook governs the
// voice/audience/CTAs of the drafts created from the clips. Mirrors the batch
// playbook control; routes through the `data-clip-playbook-pick` delegate.
function renderClipPlaybookControl(ctx) {
  if (isWorkspaceMode()) return "";
  const playbooks = usableContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div class="ap-select-option${isSel ? " selected" : ""}" data-clip-playbook-pick="${escapeHtml(c.id)}" role="option" aria-selected="${isSel ? "true" : "false"}">
          <span class="composer-context__dot" style="background: ${dotColorVar(c.color || "grey")};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select clip-studio__select" data-clip-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for these posts">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>`;
}

// Clip Studio "How it works" — same shared flow block as the Batch Studio.
const CLIP_STUDIO_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-file--video",
    title: "Add your video",
    text: "Drop in a video file or paste a YouTube or Google Drive link — even a long one.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "I find the highlights",
    text: "I watch and transcribe the whole thing, then cut the strongest moments to the length you set.",
  },
  {
    tone: "out",
    icon: "ap-icon-closed-captions",
    title: "Post-ready clips",
    text: "Each clip comes captioned and drafted into a post in your playbook's voice — ready to schedule.",
  },
];

function buildClipStudioFlow() {
  return buildWorkflowFlow(CLIP_STUDIO_STEPS);
}

function renderClipStudioUpload(st) {
  const cfg = st.config || {};
  const ctx = st.contextId ? getContextById(st.contextId) : null;
  const uploadState = st.uploadState;
  const name = escapeHtml(st.sourceName || "your video");
  const durLabelFor = (d) => (d.id === "auto" ? "Auto" : `${d.label} · ${d.sub}`);
  const curDuration = CLIP_DURATIONS_UI.find((d) => d.id === cfg.duration) || CLIP_DURATIONS_UI[0];
  const durationItems = CLIP_DURATIONS_UI.map((d) => {
    const isSel = cfg.duration === d.id;
    return `<div class="ap-select-option${isSel ? " selected" : ""}" data-clip-config="duration" data-value="${d.id}" role="option" aria-selected="${isSel ? "true" : "false"}">
      <span class="ap-select-option-text">${durLabelFor(d)}</span>
      ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
    </div>`;
  }).join("");

  // Left panel: idle dropzone, or — once a video is provided — a preview frame.
  // Faux video still (inline SVG presenter scene) so the frame reads as actual
  // video content behind the loader/play.
  const frameArt = `<svg class="clip-studio__frame-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="320" height="180" fill="#26334d"/>
    <rect x="24" y="22" width="56" height="42" rx="6" fill="#33425f"/>
    <circle cx="268" cy="34" r="9" fill="#3a4a6b"/>
    <rect x="244" y="54" width="54" height="50" rx="6" fill="#2f3e5b"/>
    <rect x="96" y="124" width="128" height="78" rx="42" fill="#586a8c"/>
    <ellipse cx="160" cy="76" rx="42" ry="26" fill="#3a2c24"/>
    <circle cx="160" cy="96" r="36" fill="#cda484"/>
  </svg>`;
  const leftPanel = uploadState
    ? `<div class="clip-studio__preview clip-studio__preview--${uploadState}">
         <div class="clip-studio__frame" aria-hidden="true">
           ${frameArt}
           ${
             uploadState === "processing"
               ? `<span class="archie-loader clip-studio__frame-loader" style="--archie-loader-size: 40px"></span>
                  <span class="clip-studio__frame-badge"><span class="clip-studio__frame-dot"></span>Analyzing</span>`
               : `<span class="clip-studio__frame-play"><i class="ap-icon-video"></i></span>`
           }
         </div>
         <div class="clip-studio__preview-foot">
           <span class="clip-studio__preview-name" title="${name}">${name} · ${uploadState === "ready" ? "Analyzed" : "Analyzing…"}</span>
           <button type="button" class="ap-button stroked grey" data-clip-studio-browse>
             <i class="ap-icon-upload" aria-hidden="true"></i><span>Replace file</span>
           </button>
         </div>
         <div class="clip-studio__or"><span>or paste a different link</span></div>
         <form class="clip-studio__url" data-clip-studio-url-form>
           <div class="ap-input-group">
             <i class="ap-icon-link" aria-hidden="true"></i>
             <input type="text" data-clip-studio-url placeholder="Paste a YouTube or Google Drive URL" aria-label="Replace with a video URL" />
           </div>
           <button type="submit" class="ap-button stroked grey">Import</button>
         </form>
       </div>`
    : `${dropzoneHTML({
        lead: "Drag & drop a video here",
        sub: "MP4, MOV or WEBM · up to 100MB",
        large: true,
        withInput: false,
        rootAttrs: "data-clip-studio-dropzone",
        ariaLabel: "Upload a video",
        action: { label: "Browse files", attrs: "data-clip-studio-browse" },
      })}
       <div class="clip-studio__or"><span>or</span></div>
       <form class="clip-studio__url" data-clip-studio-url-form>
         <div class="ap-input-group">
           <i class="ap-icon-link" aria-hidden="true"></i>
           <input type="text" data-clip-studio-url placeholder="Paste a YouTube or Google Drive URL" aria-label="Video URL" />
         </div>
         <button type="submit" class="ap-button stroked grey">Import</button>
       </form>`;

  return html`
    <aside class="session__assistant clip-studio clip-studio--upload" aria-label="Extract video clips">
      <div class="clip-studio__config">
        <header class="clip-studio__intro">
          <span class="clip-studio__ai-badge"
            ><i class="ap-icon-archie-official" aria-hidden="true"></i>Auto Clips</span
          >
          <h1 class="clip-studio__title">Turn a video into post-ready clips</h1>
          <p class="clip-studio__sub">
            Drop in a long video and I'll find the moments worth posting — cut to length and ready to draft in your
            playbook's voice. No editor required.
          </p>
        </header>

        ${raw(buildClipStudioFlow())}

        <input type="file" accept="video/*,.mp4,.mov,.webm" id="clipStudioFileInput" data-clip-studio-file hidden />

        <div class="clip-studio__setup">
          <section class="clip-studio__upload-area" aria-label="Add a video">${raw(leftPanel)}</section>

          <section class="clip-studio__settings" aria-label="Clip settings">
            <div class="clip-studio__field">
              <span class="clip-studio__field-label">Clip duration</span>
              <details class="ap-select clip-studio__select">
                <summary class="ap-select-trigger">
                  <span class="ap-select-value">${durLabelFor(curDuration)}</span>
                  <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
                </summary>
                <div class="ap-select-dropdown" role="listbox" aria-label="Clip duration">
                  <div class="ap-select-options">${raw(durationItems)}</div>
                </div>
              </details>
            </div>

            <div class="clip-studio__field">
              <div class="clip-studio__field-row">
                <label class="clip-studio__field-label" for="clipInstr">Additional instructions</label>
                <button type="button" class="ap-link standalone small" data-clip-surprise>
                  <i class="ap-icon-sparkles" aria-hidden="true"></i>Surprise me
                </button>
              </div>
              <div class="ap-textarea-field">
                <textarea
                  id="clipInstr"
                  rows="2"
                  data-clip-config="instructions"
                  placeholder="e.g. 'Don't include the intro' or 'Focus on the customer story.'"
                >
${cfg.instructions || ""}</textarea
                >
              </div>
            </div>
          </section>
        </div>

        <div class="clip-studio__cta">
          ${raw(renderClipPlaybookControl(ctx))}
          <button
            type="button"
            class="ap-button primary orange clip-studio__generate"
            data-clip-create
            ${st.videoProvided ? "" : "disabled"}
          >
            <i class="ap-icon-archie-official" aria-hidden="true"></i><span>Find clip ideas</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderClipStudioAnalyzing(st) {
  // The loader animates purely in CSS over --extract-ms (kept in sync with
  // EXTRACT_TOTAL_MS in clip-studio.js) so there are NO per-tick re-renders —
  // the shimmer + progress bar stay perfectly smooth.
  return html`
    <aside class="session__assistant clip-studio clip-studio--analyzing" aria-label="Analyzing video">
      <div class="clip-studio__center" style="--extract-ms: 8s">
        <span class="clip-studio__ai-badge"><i class="ap-icon-archie-official" aria-hidden="true"></i>AI analysis</span>
        <h1 class="clip-studio__title">Finding the best clips…</h1>
        <div class="clip-studio__skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="source-card__progress clip-studio__progress" role="progressbar" aria-label="Cutting clips">
          <div class="source-card__progress-fill clip-studio__progress-fill clip-studio__progress-fill--anim"></div>
        </div>
        <p class="clip-studio__stage clip-studio__stage-cycle" aria-live="polite">
          <span>Transcribing audio</span><span>Finding highlights</span><span>Cutting clips</span><span>Polishing</span>
        </p>
        ${st.sourceName ? raw(`<p class="clip-studio__source muted">${escapeHtml(st.sourceName)}</p>`) : ""}
        <button type="button" class="ap-button ghost grey clip-studio__cancel" data-clip-back-config>Cancel</button>
      </div>
    </aside>
  `;
}

// Studio review card = the existing DS clip card (components/clip-card.js)
// wrapped with a selection checkbox. Its kebab Edit/Remove + thumb open the
// trimmer modal; the per-card footer is hidden in the studio (selection +
// Continue replaces per-clip drafting — see clip-studio.css).
function renderStudioClipCard(clip, st, sessionId) {
  const selected = (st.selectedClipIds || []).includes(clip.id);
  return `
    <div class="clip-studio-pick${selected ? " is-selected" : ""}">
      <label class="ap-checkbox-container clip-studio-pick__check">
        <input type="checkbox" data-clip-select="${escapeHtml(clip.id)}" ${selected ? "checked" : ""} aria-label="Select clip" />
        <i aria-hidden="true"></i>
      </label>
      ${renderClipCard(clip, { sourceName: st.sourceName || "your video", sourceKind: "Video", sessionId })}
    </div>
  `;
}

function renderClipStudioClips(session, st) {
  const cfg = st.config || {};
  const clips = clipStudio.getClips(session.id);
  const cards = clips.map((c) => renderStudioClipCard(c, st, session.id)).join("");
  const selCount = (st.selectedClipIds || []).length;
  const formatCards = buildClipFormatCards(cfg);
  const captionCards = buildClipCaptionCards(cfg);
  return html`
    <aside class="session__assistant clip-studio clip-studio--clips" aria-label="Extracted clips">
      <div class="clip-studio__scroll">
        <div class="clip-studio__clips-head">
          <button type="button" class="ap-button ghost grey clip-studio__back" data-clip-back-config>
            <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to setup</span>
          </button>
          <span class="clip-studio__ai-badge"
            ><i class="ap-icon-archie-official" aria-hidden="true"></i>Clips ready</span
          >
          <h1 class="clip-studio__title">${clips.length} clips from ${st.sourceName || "your video"}</h1>
          <p class="clip-studio__sub muted">
            Review and trim clips, pick the ones to keep, then set the format and captions.
          </p>
        </div>
        <div class="clip-studio__review-settings">
          <div class="clip-studio__field">
            <span class="clip-studio__field-label">Output format</span>
            <div class="clip-studio__fmtcards">${raw(formatCards)}</div>
          </div>
          <div class="clip-studio__field">
            <span class="clip-studio__field-label">Caption style</span>
            <div class="clip-studio__cap-grid">${raw(captionCards)}</div>
          </div>
        </div>
        <div class="clip-studio__grid">${raw(cards)}</div>
      </div>
      <div class="clip-studio__bar">
        <button type="button" class="ap-button stroked grey" data-clip-add-studio>
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add clip</span>
        </button>
        <div class="clip-studio__bar-right">
          <span class="clip-studio__bar-count">${selCount} selected</span>
          <button type="button" class="ap-button primary orange" data-clip-continue ${selCount ? "" : "disabled"}>
            <span>Continue</span><i class="ap-icon-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// The account step, when there is none to pick. Same cards as the in-chat
// connect step (network glyph, name, what you connect on it), wearing the
// studio's chrome instead of the Quickpicker's.
function renderClipStudioConnect(session, st) {
  const cards = connectableNetworkCards()
    .map(
      (net, i) => `
        <button type="button" class="analyse__card" data-clip-connect="${escapeHtml(net.value)}">
          <span class="analyse__card-shortcut" aria-hidden="true">${i + 1}</span>
          ${net.preview}
          <span class="analyse__card-text">
            <span class="analyse__card-label">${escapeHtml(net.label)}</span>
            <span class="analyse__card-caption muted">${escapeHtml(net.caption)}</span>
          </span>
        </button>`,
    )
    .join("");
  const selClips = (st.selectedClipIds || []).length;
  return html`
    <aside class="session__assistant clip-studio clip-studio--profiles" aria-label="Connect an account">
      <div class="clip-studio__scroll">
        <div class="clip-studio__clips-head">
          <button type="button" class="ap-button ghost grey clip-studio__back" data-clip-back>
            <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to clips</span>
          </button>
          <h1 class="clip-studio__title">Connect an account to draft these</h1>
          <p class="clip-studio__sub muted">
            Drafts are written for the network they publish on — that's what sets the format and the length. Nothing
            publishes yet.
          </p>
        </div>
        <div class="analyse__options analyse__options--cards clip-studio__connect">
          <div class="analyse__cards" style="--card-cols:4">${raw(cards)}</div>
        </div>
      </div>
      <div class="clip-studio__bar">
        <button type="button" class="ap-button ghost grey" data-clip-back><span>Back</span></button>
        <div class="clip-studio__bar-right">
          <span class="clip-studio__bar-count">${selClips} clips selected</span>
        </div>
      </div>
    </aside>
  `;
}

function renderClipStudioProfiles(session, st) {
  const profiles = getConnectedProfiles();
  // Nothing connected (skipConnectProfiles): this step has no profiles to pick
  // and "Create N drafts" would sit disabled forever. Ask for the account HERE,
  // inside the studio — the same network grid as the in-chat step. Connecting
  // notifies, the studio re-renders, and the normal step below takes over.
  if (profiles.length === 0) return renderClipStudioConnect(session, st);
  const selectedProfiles = st.profileSelection || [];
  const selClips = (st.selectedClipIds || []).length;
  // Long profile lists get a live search box (same threshold as the in-chat
  // profile Quickpickers). The query lives in clip-studio state so it survives
  // the re-render a checkbox toggle triggers.
  const searchable = profiles.length > PROFILE_SEARCH_THRESHOLD;
  const q = (st.profileSearch || "").trim().toLowerCase();
  const rows = profiles
    .map((p) => {
      const on = selectedProfiles.includes(p.id);
      const haystack = [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" ").toLowerCase();
      const hidden = searchable && q && !haystack.includes(q);
      const recId = defaultFormatFor(p.platform);
      // Default each profile to the output format chosen up-front; the network's
      // own recommended format is just marked "Recommended" (overridable).
      const chosen = st.perNetworkFormat?.[p.platform] || st.config?.format || recId;
      const fmts = formatsForNetwork(p.platform)
        .map((f) => {
          const fOn = f.id === chosen;
          const rec = f.id === recId;
          return `<button type="button" class="clip-studio__seg${fOn ? " is-on" : ""}" data-clip-netfmt="${escapeHtml(p.platform)}" data-value="${f.id}" aria-pressed="${fOn}">
            <span class="clip-studio__seg-ratio">${f.tag}</span>${rec ? `<span class="clip-studio__seg-rec">Recommended</span>` : ""}
          </button>`;
        })
        .join("");
      return `
        <div class="clip-studio__profile${on ? " is-on" : ""}${hidden ? " is-hidden" : ""}" data-search="${escapeHtml(haystack)}">
          <label class="ap-checkbox-container clip-studio__profile-pick">
            <input type="checkbox" data-clip-profile="${escapeHtml(p.id)}" ${on ? "checked" : ""} aria-label="Select profile" />
            <i aria-hidden="true"></i>
            ${renderProfileTag(p)}
          </label>
          ${on ? `<div class="clip-studio__profile-fmt"><span class="clip-studio__seg-group" role="group" aria-label="Format for ${escapeHtml(p.platformLabel || p.platform)}">${fmts}</span></div>` : ""}
        </div>
      `;
    })
    .join("");
  const draftCount = selClips * selectedProfiles.length;
  return html`
    <aside class="session__assistant clip-studio clip-studio--profiles" aria-label="Choose profiles">
      <div class="clip-studio__scroll">
        <div class="clip-studio__clips-head">
          <button type="button" class="ap-button ghost grey clip-studio__back" data-clip-back>
            <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to clips</span>
          </button>
          <h1 class="clip-studio__title">Where should I post these?</h1>
          <p class="clip-studio__sub muted">
            Pick the profiles to draft on. I've set the best video format per network — change any if you like.
          </p>
          ${searchable
            ? html`
                <div class="ap-input-group clip-studio__profile-search">
                  <i class="ap-icon-search" aria-hidden="true"></i>
                  <input
                    type="search"
                    data-clip-profile-search
                    placeholder="Search profiles by name, handle or network…"
                    value="${st.profileSearch || ""}"
                    aria-label="Search profiles"
                    autocomplete="off"
                  />
                </div>
              `
            : ""}
        </div>
        <div class="clip-studio__profiles">
          ${raw(rows)}
          <p class="clip-studio__profiles-empty muted" hidden>No profiles match your search.</p>
        </div>
      </div>
      <div class="clip-studio__bar">
        <button type="button" class="ap-button ghost grey" data-clip-back><span>Back</span></button>
        <div class="clip-studio__bar-right">
          <span class="clip-studio__bar-count">${selClips} clips · ${selectedProfiles.length} profiles</span>
          <button type="button" class="ap-button primary orange" data-clip-finalize ${draftCount ? "" : "disabled"}>
            <i class="ap-icon-archie-official" aria-hidden="true"></i
            ><span>Create ${draftCount} draft${draftCount === 1 ? "" : "s"}</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// Clip Studio — upload-stage entry points. Picking a file / dropping / pasting a
// URL starts the upload + analysis in the BACKGROUND right away, but the config
// screen stays visible/editable. The user proceeds to the clips by pressing
// "Create clips" (see the data-clip-create handler).
export function handleClipStudioFile(session, file) {
  const classification = classifyFile(file);
  if (!classification.ok) {
    showToast(classification.reason);
    return;
  }
  beginClipStudioBackground(session, file.name);
}

export function handleClipStudioUrl(session, url) {
  beginClipStudioBackground(session, url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
}

// Create a REAL sources-stream video source (so the trimmer modal, right-panel
// Clips/Drafts and draft creation all share one source) and kick off the
// background analysis. pushScriptedSource + completeScriptedSource don't fire
// the intake-lifecycle "what to do?" choice (that only triggers via
// startFileUpload); the onVideoReady guard in bindSession also skips it while
// the studio is active.
function beginClipStudioBackground(session, sourceName) {
  const name = sourceName || "your video";
  const sourceId = pushScriptedSource({ filename: name, kind: "Video", sessionId: session.id });
  completeScriptedSource(sourceId, { signal: "Medium signal", signalColor: "tagOrange", ideaCount: 0 });
  clipStudio.beginProcessing(session.id, { sourceName: name, sourceId });
}

// Open a clip in the trimmer modal (edit/recut) or add a new clip, both
// persisting back to the studio's real source via updateSourceClips.
export function openClipStudioEditor(session, opts) {
  const src = clipStudio.currentSource(session.id);
  if (!src) return;
  openVideoClipsModal(src, {
    ...opts,
    onSaveClips: (sourceId, clips) => {
      updateSourceClips(sourceId, clips);
      clipStudio.refresh(session.id);
    },
  });
}

// Finalize — batch-create drafts for every selected clip × selected profile,
// then leave the studio and land on the conversational session with the
// classic Drafts panel open.
// Hand the freshly generated clips off to the conversational chat. Skips the
// full-page review grid + profiles screens entirely: the clips are already
// cut and attached to the source, so we post a short Archie intro + the
// standard "Clips ready" card (its "Open clips" CTA opens the right-panel
// Clips surface) and exit the studio, dropping the user into the normal chat.
export function clipsToChat(session) {
  const st = clipStudio.getState(session.id);
  if (!st) return;
  const clips = clipStudio.getClips(session.id) || [];
  const sourceId = st.sourceId;
  const sourceName = st.sourceName || "your video";
  const n = clips.length;
  postAssistantMessage(
    session.id,
    `I cut ${n} ${n === 1 ? "clip" : "clips"} from ${sourceId ? `[[source:${sourceId}]]` : sourceName}. Open them to review and trim, then draft the ones you want to post.`,
  );
  postClipExtractionTurn(session.id, { sourceId, filename: sourceName });
  // Leave the studio last — the session now renders as a normal chat with the
  // turns above already in the thread.
  clipStudio.exit(session.id);
}

export function finalizeClipStudio(session) {
  const st = clipStudio.getState(session.id);
  if (!st) return;
  const clips = clipStudio.getClips(session.id).filter((c) => (st.selectedClipIds || []).includes(c.id));
  const profileIds = st.profileSelection || [];
  const accounts = getConnectedProfiles().filter((p) => profileIds.includes(p.id));
  if (!clips.length || !accounts.length) return;
  const sourceName = st.sourceName || "your video";
  const captionStyle = st.config?.captionStyle === "none" ? null : st.config?.captionStyle || null;
  const perNet = st.perNetworkFormat || {};
  clipStudio.exit(session.id);
  const pendingId = startPending(session.id, "Generating post drafts…", GENERATION_TOOLS);
  setTimeout(() => {
    finishPending(session.id, pendingId);
    const drafts = [];
    for (const clip of clips) {
      for (const a of accounts) {
        const d = addPostDraft(session.id, {
          network: a.platform,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: { start: clip.start, end: clip.end, sourceName, hue: clip.hue },
          format: perNet[a.platform] || st.config?.format || clip.format || "9:16",
          subtitleStyle: captionStyle,
        });
        d.generationContext = clipContext(clip, sourceName);
        drafts.push(d);
      }
    }
    postDraftResult(session.id, { ideaTitle: `Clips from ${sourceName}`, drafts });
  }, 1600);
}
