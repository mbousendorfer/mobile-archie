// The right panel's Sources mode: the session's sources, the live connectors
// above them (flag connectors), and one source row. Moved out of right-panel.js, unchanged;
// the panel shell (open / close / resize / URL state / delegated listeners)
// stays there.

import { getSources as getStreamSources } from "../../sources-stream.js?v=1820";
import { isFlagOn } from "../../feature-flags.js?v=1820";
import { getConnectedConnectors } from "../../connectors-store.js?v=1820";
import { escapeAttr, escapeText } from "../../utils.js?v=1820";
import { renderConnectorLogo } from "../../connectors-view.js?v=1820";
import { renderTopPostEcho } from "../top-post-card.js?v=1820";
import { RPANEL_CLOSE_INLINE, activeSessionId, sessionIdeas } from "../right-panel.js?v=1820";

// Sources mode view — list of source rows for the active session + a
// trailing "+ Attach" button. Each row carries kind icon, filename,
// signal/idea-count meta, and per-row Open + Detach actions. The list
// reads from sources-stream's per-session map and re-renders on every
// notify from the session's sources subscription bound at init time.
export function renderSourcesView() {
  const sid = activeSessionId();
  if (!sid) {
    return `
      <div class="rpanel-sources">
        <div class="app-right-panel__empty">
          <div class="app-right-panel__empty-icon"><i class="ap-icon-file"></i></div>
          <div class="app-right-panel__empty-title">Open a chat</div>
          <div class="app-right-panel__empty-sub">Sources attach to a chat. Start or open one to manage its sources.</div>
        </div>
      </div>
    `;
  }
  const sources = getStreamSources(sid);
  const rows = sources.map((src) => renderSourceRow(src)).join("");
  const head = `
    <div class="rpanel-sources__head">
      <div class="rpanel-sources__head-text">
        <div class="rpanel-sources__count">${sources.length} source${sources.length === 1 ? "" : "s"} in this chat</div>
        <div class="rpanel-sources__sub muted">These sources feed this chat's ideas.</div>
      </div>
      ${renderAttachMenu("stroked grey", "Attach source")}
      ${RPANEL_CLOSE_INLINE}
    </div>
  `;
  const liveBlock = renderLiveConnectors();
  if (sources.length === 0) {
    return `
      <div class="rpanel-sources">
        ${head}
        ${liveBlock}
        <div class="app-right-panel__empty rpanel-sources__empty">
          <div class="app-right-panel__empty-icon"><i class="ap-icon-file"></i></div>
          <div class="app-right-panel__empty-title">No sources yet</div>
          <div class="app-right-panel__empty-sub">Attach a file or pick from a connector to start.</div>
          <div class="app-right-panel__empty-action">
            ${renderAttachMenu("primary orange", "Attach a source")}
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="rpanel-sources">
      ${head}
      ${liveBlock}
      <div class="rpanel-sources__list">${rows}</div>
    </div>
  `;
}

// Connected connectors surface as LIVE sources at the top of the Sources view:
// nothing is imported — clicking Ask queries the connector live in chat
// (simulated MCP, see connector-ask.js). Distinct from the frozen file sources
// listed below.
function renderLiveConnectors() {
  // Gated behind the connectors feature flag (default OFF).
  if (!isFlagOn("connectors")) return "";
  const connected = getConnectedConnectors();
  const rows = connected
    .map(
      (c) => `
      <div class="rpanel-sources__row rpanel-live-connector" data-connector-id="${escapeAttr(c.id)}">
        <div class="rpanel-sources__card-head">
          <span class="rpanel-live-connector__logo" aria-hidden="true">${renderConnectorLogo(c, 24)}</span>
          <div class="rpanel-sources__row-name" title="${escapeAttr(c.name)}">${escapeText(c.name)}</div>
          <span class="ap-tag blue rpanel-live-connector__badge">Live</span>
          <button
            type="button"
            class="ap-button ghost blue rpanel-sources__row-mention"
            data-rpanel-ask-connector="${escapeAttr(c.id)}"
            aria-label="Start a chat with ${escapeAttr(c.name)}"
            title="Start a chat"
          >
            <i class="ap-icon-single-chat-bubble"></i>
            <span>Start a chat</span>
          </button>
        </div>
      </div>`,
    )
    .join("");
  // Always rendered (even with 0 connected) so the "Connect" entry point is
  // available right here — opens the connectors modal scoped to this chat.
  const body = connected.length
    ? `<div class="rpanel-sources__list rpanel-live-connectors__list">${rows}</div>`
    : `<div class="rpanel-live-connectors__empty muted">Connect a tool to query its content live in chat.</div>`;
  return `
    <div class="rpanel-live-connectors">
      <div class="rpanel-live-connectors__head">
        <span class="rpanel-live-connectors__title">Live connectors</span>
        ${connected.length ? `<span class="ap-counter normal grey">${connected.length}</span>` : ""}
        <button type="button" class="ap-button ghost blue rpanel-live-connectors__manage" data-rpanel-open-connectors>
          <i class="ap-icon-plus"></i><span>Connect</span>
        </button>
      </div>
      ${body}
    </div>`;
}

const SOURCE_KIND_ICON = {
  PDF: "ap-icon-file--pdf",
  Word: "ap-icon-file--text",
  Text: "ap-icon-file--text",
  Video: "ap-icon-file--video",
  Audio: "ap-icon-file",
  Image: "ap-icon-file--image",
  URL: "ap-icon-link",
};

// Close every open source-card kebab dropdown (except `except`), resetting the
// trigger's aria-expanded. One menu open at a time.
export function closeAllSourceMenus(except) {
  document.querySelectorAll(".rpanel-sources__more-menu:not([hidden])").forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
}

function renderSourceRow(src) {
  // Explicit iconClass wins (e.g. a repurposed post's network logo), else map
  // by kind, else the generic file glyph.
  const icon = src.iconClass || SOURCE_KIND_ICON[src.kind] || "ap-icon-file";
  const isProcessing = src.status !== "Processed";
  // Only surface a status pill while the source is in-flight. Once
  // Processed, the card stays uncluttered. Mermaid-tinted pill mirrors
  // source-card's processing chip so the "AI is working" cue stays
  // consistent across surfaces.
  const stageLabel = isProcessing ? src.stage || "Processing" : "";
  const statusEl = isProcessing
    ? `<span class="source-card__processing-pill rpanel-sources__row-status" role="status">
         <i class="ap-icon-archie-official"></i>
         <span class="source-card__processing-pill-label">${escapeText(stageLabel)}…</span>
       </span>`
    : "";

  // Ideas this source produced — each title is a link into the Outputs ›
  // Ideas tab (focuses + pulses that card). Resolved from the same list the
  // Ideas tab renders, so every link has a live target. Mirrors
  // the idea/clip card grammar (card content → footer actions).
  const sourceIdeas = sessionIdeas().filter((i) => Array.isArray(i.sourceIds) && i.sourceIds.includes(src.id));
  const ideasList =
    !isProcessing && sourceIdeas.length
      ? `<ul class="rpanel-sources__ideas">
          ${sourceIdeas
            .map(
              (i) => `
              <li>
                <button type="button" class="rpanel-sources__idea-link" data-rpanel-source-idea="${escapeAttr(i.id)}" title="${escapeAttr(i.title)}">
                  <i class="ap-icon-archie-official rpanel-sources__idea-icon" aria-hidden="true"></i>
                  <span class="rpanel-sources__idea-title">${escapeText(i.title)}</span>
                  ${i.kind ? `<span class="rpanel-sources__idea-kind muted">${escapeText(i.kind)}</span>` : ""}
                  <i class="ap-icon-chevron-right rpanel-sources__idea-chevron" aria-hidden="true"></i>
                </button>
              </li>`,
            )
            .join("")}
        </ul>`
      : "";

  const mentionBtn = !isProcessing
    ? `<button
        type="button"
        class="ap-button ghost blue rpanel-sources__row-mention"
        data-rpanel-mention-source="${src.id}"
        aria-label="Reference ${escapeAttr(src.filename)} in composer"
        title="Reference"
      >
        <i class="ap-icon-at"></i>
        <span>Reference</span>
      </button>`
    : "";
  // Kebab menu (…) on the head row, to the right of Mention. DS
  // .ap-action-dropdown; one menu open at a time (see closeAllSourceMenus +
  // the document listeners in init). Always available — even while
  // processing.
  const menuId = `src-more-${src.id}`;
  // Video sources expose a "View clips" entry that opens the Video Clips modal
  // (browse mode) — every clip cut from this video, plus the "Add clip" CTA to
  // create one manually. Count surfaced when clips already exist.
  const isVideo = src.kind === "Video";
  const clipCount = Array.isArray(src.clips) ? src.clips.length : 0;
  const viewClipsItem = isVideo
    ? `<button type="button" role="menuitem" class="ap-action-dropdown-item" data-rpanel-source-clips="${src.id}">
          <i class="ap-icon-video"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">View clips${clipCount ? ` (${clipCount})` : ""}</span>
            </div>
          </div>
        </button>`
    : "";
  const moreMenu = `
    <div class="rpanel-sources__more-wrap">
      <button
        type="button"
        class="ap-icon-button transparent rpanel-sources__row-more"
        data-rpanel-source-more="${src.id}"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="${menuId}"
        aria-label="More actions for ${escapeAttr(src.filename)}"
        title="More actions"
      >
        <i class="ap-icon-more"></i>
      </button>
      <div id="${menuId}" class="ap-action-dropdown rpanel-sources__more-menu" role="menu" hidden>
        ${viewClipsItem}
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-rpanel-source-rename="${src.id}">
          <i class="ap-icon-pen"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Edit name</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-rpanel-source-reanalyze="${src.id}">
          <i class="ap-icon-refresh"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Reanalyze</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item red-mode" data-rpanel-sources-detach="${src.id}">
          <i class="ap-icon-trash"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Delete source</span>
            </div>
          </div>
        </button>
      </div>
    </div>`;

  // A repurposed top post renders the real winner card (renderTopPostEcho) in
  // place of the generic icon + name + preview, so its Sources row matches the
  // card the user picked it from.
  const headMain = src.topPost
    ? `<div class="rpanel-sources__toppost">${renderTopPostEcho(src.topPost)}</div>`
    : `<span class="rpanel-sources__row-icon" aria-hidden="true">${
        src.serviceLogo
          ? `<img class="rpanel-sources__row-logo" src="${escapeAttr(src.serviceLogo)}" alt="" />`
          : `<i class="${icon}"></i>`
      }</span>
        <div class="rpanel-sources__row-text">
          <div class="rpanel-sources__row-name" title="${escapeAttr(src.filename)}">${escapeText(src.filename)}</div>
          ${src.preview ? `<div class="rpanel-sources__row-preview" title="${escapeAttr(src.preview)}">${escapeText(src.preview)}</div>` : ""}
        </div>`;

  // A repurposed top post is a real stream source, so it gets the same card
  // frame and Reference / kebab actions as a file source. The rich winner echo
  // sits flush as the card body (its own border/shadow stripped in CSS) and the
  // actions live in a footer bar below it — "content → footer actions", the same
  // grammar as the idea/clip cards. No ideas list: it produced drafts, not
  // extracted ideas (sourceIdeas is empty for it anyway).
  if (src.topPost) {
    return `
      <div class="rpanel-sources__row rpanel-sources__row--toppost" data-source-id="${src.id}">
        ${headMain}
        <div class="rpanel-sources__toppost-foot">
          ${statusEl}
          ${mentionBtn}
          ${moreMenu}
        </div>
      </div>
    `;
  }

  return `
    <div class="rpanel-sources__row" data-source-id="${src.id}">
      <div class="rpanel-sources__card-head">
        ${headMain}
        ${statusEl}
        ${mentionBtn}
        ${moreMenu}
      </div>
      ${ideasList}
    </div>
  `;
}

// "Attach source" trigger — a DS <details> menu offering the three add
// methods (Upload / URL / Paste text). Each item opens its own dedicated,
// single-purpose add-source modal; there's no longer a tabbed picker.
function renderAttachMenu(btnClass, label) {
  return `
    <details class="ap-select rpanel-sources__attach">
      <summary class="ap-button ${btnClass} rpanel-sources__attach-trigger">
        <i class="ap-icon-plus" aria-hidden="true"></i><span>${label}</span>
      </summary>
      <div class="ap-select-dropdown" role="menu" aria-label="Add a source">
        <div class="ap-select-options">
          <div class="ap-select-option" data-rpanel-attach-method="upload" role="menuitem">
            <i class="ap-icon-upload" aria-hidden="true"></i><span class="ap-select-option-text">Upload a file</span>
          </div>
          <div class="ap-select-option" data-rpanel-attach-method="url" role="menuitem">
            <i class="ap-icon-link" aria-hidden="true"></i><span class="ap-select-option-text">Add a URL</span>
          </div>
          <div class="ap-select-option" data-rpanel-attach-method="pasteText" role="menuitem">
            <i class="ap-icon-pen" aria-hidden="true"></i><span class="ap-select-option-text">Paste text</span>
          </div>
        </div>
      </div>
    </details>`;
}
