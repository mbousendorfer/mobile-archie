// The chat composer's markup: the card, its Add menu (connected sources
// submenu, Topic Feed entry), the connector chip, and the status banner that
// animates above it while drafts / ideas are being produced. Moved out of
// session.js, unchanged; the mention picker stays there, since bindSession
// writes its highlight state.

import { isFlagOn } from "../../feature-flags.js?v=1829";
import { getConnectedConnectors, findConnector } from "../../connectors-store.js?v=1829";
import { escapeHtml, html, raw, escapeAttr as escapeHtmlAttr } from "../../utils.js?v=1829";
import { renderConnectorLogo } from "../../connectors-view.js?v=1829";
import { getSources, getIdeas } from "../../library.js?v=1829";
import * as clipStudio from "../../clip-studio.js?v=1829";
import { getThread } from "../../assistant.js?v=1829";
import { revokedContextFor } from "../../playbook-access.js?v=1829";
import { getSessionById } from "../../sessions-store.js?v=1829";
import { catalogueRoute } from "../../active-playbook.js?v=1829";
import { getActiveConnector } from "../../composer-connector.js?v=1829";
import { COMPOSER_DEFAULT_PLACEHOLDER, renderPlaybookControl } from "../session.js?v=1829";
import { renderTopicPickerRow } from "./empty-hero.js?v=1829";
import { renderChatGallery } from "./chat-gallery.js?v=1829";

function renderConnectorsSubmenu() {
  // Connectors are gated behind a feature flag (default OFF) — when off, the
  // composer Add menu is just the file/URL quick-actions.
  if (!isFlagOn("connectors")) return "";
  const connected = getConnectedConnectors();
  const items = connected.length
    ? connected
        .map(
          (c) => `
          <button type="button" class="ap-action-dropdown-item assistant-attach__connector" data-attach-connector="${escapeHtml(
            c.id,
          )}" role="menuitem">
            <span class="assistant-attach__connector-logo">${renderConnectorLogo(c, 18)}</span>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">${escapeHtml(c.name)}</span>
              </div>
            </div>
          </button>`,
        )
        .join("")
    : `<div class="assistant-attach__menu-label">No sources connected yet</div>`;
  return `
    <div class="ap-action-dropdown-divider" role="separator"></div>
    <div class="assistant-attach__submenu-wrap">
      <button
        type="button"
        class="ap-action-dropdown-item assistant-attach__submenu-trigger"
        aria-haspopup="menu"
        role="menuitem"
      >
        <i class="ap-icon-stack"></i>
        <div class="ap-action-dropdown-item-text">
          <div class="ap-action-dropdown-item-label-container">
            <span class="ap-action-dropdown-item-label">Connected sources</span>
          </div>
        </div>
        <i class="ap-icon-chevron-right" aria-hidden="true"></i>
      </button>
      <div class="ap-action-dropdown assistant-attach__submenu" role="menu">
        ${items}
        <div class="ap-action-dropdown-divider" role="separator"></div>
        <button type="button" class="ap-action-dropdown-item" data-open-connectors role="menuitem">
          <i class="ap-icon-view-grid"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Browse connectors</span>
            </div>
          </div>
        </button>
      </div>
    </div>`;
}

// "Ready" status bars (DS .ap-status-card) glued to the top of the composer,
// shown in addition to the transient snackbar when a batch lands. Keyed per-
// session in module scope so they survive aside re-renders and screen re-mounts;
// each is cleared when its panel opens (lifecycle: "until reviewed"). When both
// are pending the most recent (by `at`) wins the single slot.
//   draftBanners: sessionId → { batchId, count, at }  — cleared on Drafts panel
//   ideaBanners:  sessionId → { count, at }            — cleared on Ideas panel
export const draftBanners = new Map();

export const ideaBanners = new Map();

export function draftBannerFlowInner(count) {
  return `<span>${count} draft${count === 1 ? "" : "s"} ready</span> to review`;
}

export function ideaBannerFlowInner(count) {
  return `<span>${count} idea${count === 1 ? "" : "s"} ready</span>`;
}

function withEllipsis(s) {
  return /…$/.test(s) ? s : `${s}…`;
}

// In-progress label for a loading thread message (adapted from the rule in
// conversation-status-card.js; duplicated to keep the version cascade small).
// Returns null for messages that aren't a distinct user-facing task. source-
// intake is handled by the sources signal in computeComposerStatus (skipped
// there) to avoid a double-count.
function humanizeLoadingMessage(m) {
  // The hidden assistant answer placeholder is the same operation as its
  // reasoning pill — count the pill, not the empty answer slot, so a single
  // reply reads "Thinking…" rather than "2 tasks running…".
  if (m.hidden) return null;
  if (m.role === "idea-extraction") return `Extracting ideas from ${m.filename || "source"}…`;
  if (m.role === "clip-extraction") return `Extracting clips from ${m.filename || "source"}…`;
  if (m.role === "assistant") return withEllipsis(m.meta && m.meta !== "Archie" ? m.meta : "Thinking");
  if (m.role === "system" || m.role === "system-notice") {
    return withEllipsis(m.meta && m.meta !== "System" ? m.meta : m.text || "Working");
  }
  // Generic busy marker (startPending) — drafts/ideas flows pass a meta label
  // ("Extracting ideas from content…", "Generating post drafts…"); fall back to "Working".
  if (m.role === "pending") return withEllipsis(m.meta || "Working");
  return "Working…";
}

// One unified descriptor for the composer status slot. `shape` drives the
// reconcile (same shape → in-place text update; different → markup swap):
//   { shape:"grey",   variant:"grey",  label, key }  — background work running
//   { shape:"drafts", variant:"green", count, key }  — drafts ready
//   { shape:"ideas",  variant:"green", count, key }  — ideas ready
//   null                                             — idle
// Grey (in-progress) wins over the green "ready" bars; among the two ready bars
// the most recent (by `at`) wins the single slot, then yields to the other when
// its panel is opened.
export function computeComposerStatus(sessionId) {
  const labels = [];
  // Sources analysing — the canonical background action and the source of
  // truth (the matching source-intake thread turns are skipped below).
  for (const s of getSources(sessionId)) {
    if (s.status === "Processing") labels.push(`Analyzing ${s.filename || "source"}…`);
  }
  // Video clip extraction (when a normal composer is present).
  const clip = clipStudio.getState(sessionId);
  if (clip && clip.stage === "analyzing") {
    labels.push(clip._stageLabel ? `${clip._stageLabel}…` : "Analyzing video…");
  }
  // Other loading thread turns: idea/clip extraction, draft generation, replies.
  for (const m of getThread(sessionId)) {
    if (m.status !== "loading") continue;
    if (m.role === "source-intake") continue; // counted via getSources above
    const label = humanizeLoadingMessage(m);
    if (label) labels.push(label);
  }
  if (labels.length > 0) {
    const label = labels.length === 1 ? labels[0] : `${labels.length} tasks running…`;
    return { shape: "grey", variant: "grey", labels, label, key: `grey|${label}` };
  }
  const draft = draftBanners.get(sessionId);
  const idea = ideaBanners.get(sessionId);
  const draftDesc = draft && { shape: "drafts", variant: "green", count: draft.count, key: `drafts|${draft.count}` };
  const ideaDesc = idea && { shape: "ideas", variant: "green", count: idea.count, key: `ideas|${idea.count}` };
  if (draft && idea) return idea.at > draft.at ? ideaDesc : draftDesc;
  return draftDesc || ideaDesc || null;
}

export function renderComposerStatus(sessionId) {
  // Losing the Playbook outranks every other banner: it's the reason the
  // composer below is dead, and it has to be the thing you read first.
  const revoked = revokedContextFor(getSessionById(sessionId));
  if (revoked) {
    return html`
      <div class="ap-status-card red session__composer-status" data-status-key="revoked" role="status">
        <div class="upper">
          <i class="ap-icon-lock-on" aria-hidden="true"></i>
          <div class="flow">
            <span
              >I can't write anything new here — this chat runs on <strong>${revoked.name}</strong>, and
              ${revoked.ownerName} stopped sharing it. The drafts already in this chat are still yours to save or
              schedule.</span
            >
          </div>
        </div>
      </div>
    `;
  }
  const status = computeComposerStatus(sessionId);
  if (!status) return "";
  if (status.shape === "drafts") {
    return html`
      <div
        class="ap-status-card green session__composer-status"
        data-status-key="${status.key}"
        data-status-shape="drafts"
        role="status"
      >
        <div class="upper">
          <i class="ap-icon-file" aria-hidden="true"></i>
          <div class="flow">${raw(draftBannerFlowInner(status.count))}</div>
          <button type="button" class="ap-link small standalone" data-draft-banner-review>Review</button>
        </div>
      </div>
    `;
  }
  if (status.shape === "ideas") {
    return html`
      <div
        class="ap-status-card green session__composer-status"
        data-status-key="${status.key}"
        data-status-shape="ideas"
        role="status"
      >
        <div class="upper">
          <i class="ap-icon-archie-official" aria-hidden="true"></i>
          <div class="flow">${raw(ideaBannerFlowInner(status.count))}</div>
          <button type="button" class="ap-link small standalone" data-idea-banner-view>View ideas</button>
        </div>
      </div>
    `;
  }
  // Grey in-progress. The .ap-loader's branded SVG is auto-injected by
  // archie-loader.js's observer on insert; ds-patches.css recolours it grey for
  // this bar (the default would be orange).
  return html`
    <div
      class="ap-status-card grey session__composer-status"
      data-status-key="${status.key}"
      data-status-shape="grey"
      role="status"
      aria-live="polite"
    >
      <div class="upper">
        <span class="ap-loader grey size-16" aria-hidden="true"
          ><svg>
            <circle></circle>
            <circle></circle></svg
        ></span>
        <div class="flow" data-status-label>${status.label}</div>
      </div>
    </div>
  `;
}

// Enter animation for a freshly-inserted banner: collapse-reveal synced to the
// element's real height (--status-h kills the max-height "dead time"), plus fade
// + a short rise. Measured + class added in the same tick (before paint) so
// there's no full-height flash. The reduced-motion guard in base.css collapses
// it to instant. The class is self-removing so a later full-aside rebuild (which
// re-renders the banner statically) doesn't replay the entrance.
export function animateBannerIn(el) {
  if (!el) return;
  el.style.setProperty("--status-h", `${el.offsetHeight}px`);
  el.classList.add("is-entering");
  const clear = () => el.classList.remove("is-entering");
  el.addEventListener("animationend", clear, { once: true });
  setTimeout(clear, 500);
}

// Exit animation: reverse the reveal (faster, accelerating), THEN remove the
// node and run `done`. Callers that open the Drafts panel pass the open as
// `done` so the panel opens only after the banner has left — opening writes the
// URL hash, which can re-render the route and would otherwise cut the animation.
export function animateBannerOut(el, done) {
  if (!el) {
    if (done) done();
    return;
  }
  if (el.classList.contains("is-leaving")) return;
  el.style.setProperty("--status-h", `${el.offsetHeight}px`);
  el.classList.remove("is-entering");
  void el.offsetHeight; // reflow so an interrupted enter restarts cleanly
  el.classList.add("is-leaving");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.remove();
    if (done) done();
  };
  el.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 500);
}

// Composer markup — extracted so it can be rendered either at the bottom
// of the assistant panel (default) or inline inside the empty hero (when
// the conversation hasn't started yet). The click handlers in bindSession
// are delegated on #app, so the same markup works in both positions
// without re-wiring.
export function renderComposer(attachedContext, session, selectable) {
  // Nothing to @mention until the session has at least one ready source or
  // extracted idea — disable the trigger so it doesn't open an empty picker.
  const hasMentionable =
    getSources(session.id).some((s) => s.status !== "Processing") || getIdeas(session.id).length > 0;
  // No Playbook, no generation. The composer is the main affordance, so it says
  // so plainly rather than swallowing the keystroke.
  const revoked = revokedContextFor(session);
  return `
    <div class="session__composer">
      <div class="session__composer-inner">
        ${renderComposerStatus(session.id)}
        <div class="session__composer-card">
          <div
            class="composer-mention-picker"
            id="composerMentionPicker"
            data-composer-mention-picker
            role="listbox"
            aria-label="Reference a source or idea"
            hidden
          ></div>
          <div
            class="session__composer-mentions"
            data-composer-mentions
            hidden
          ></div>
          <div class="session__composer-input-row">
            <div
              class="session__composer-connector"
              data-composer-connector
              hidden
            ></div>
            <textarea
              class="session__composer-input-field"
              id="assistantInput"
              aria-label="Message Archie"
              placeholder="${revoked ? "This chat can't generate any more" : COMPOSER_DEFAULT_PLACEHOLDER}"
              rows="2"
              ${revoked ? "readonly" : ""}
            ></textarea>
          </div>
          <div class="session__composer-toolbar">
            <div class="assistant-attach">
              <button
                type="button"
                class="ap-button stroked grey assistant-attach__trigger"
                aria-label="Add a source"
                data-assistant-attach-toggle
              >
                <i class="ap-icon-plus"></i>
                <span>Add</span>
              </button>
              <div class="ap-action-dropdown assistant-attach__menu" data-assistant-attach-menu hidden role="menu">
                <button type="button" class="ap-action-dropdown-item" data-add-source="pdf" role="menuitem">
                  <i class="ap-icon-file--pdf"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add PDF</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="video" role="menuitem">
                  <i class="ap-icon-file--video"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add video</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="url" role="menuitem">
                  <i class="ap-icon-link"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add URL</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="text" role="menuitem">
                  <i class="ap-icon-file--text"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Paste text</span>
                    </div>
                  </div>
                </button>
                <div class="ap-action-dropdown-divider" aria-hidden="true"></div>
                <button type="button" class="ap-action-dropdown-item" data-add-source="top-posts" role="menuitem">
                  <i class="ap-icon-feature-analytics"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Top performing posts</span>
                    </div>
                  </div>
                </button>
                ${renderTopicPickerRow()}
                ${renderConnectorsSubmenu()}
              </div>
            </div>
            <button
              type="button"
              class="ap-button stroked grey composer-mention-trigger"
              aria-label="Reference a source or idea"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="composerMentionPicker"
              data-composer-mention-trigger
              ${hasMentionable ? "" : 'disabled title="Add a source or extract an idea first"'}
            >
              <i class="ap-icon-at"></i>
              <span>Reference</span>
            </button>
            ${renderPlaybookControl(attachedContext, selectable)}
            <button
              type="button"
              class="ap-button primary orange session__composer-send"
              aria-label="Send"
              data-assistant-send
              ${revoked ? "disabled" : ""}
            >
              <i class="ap-icon-arrow-up"></i>
            </button>
          </div>
        </div>
        <div class="session__composer-hint">
          ${
            revoked
              ? `Save or schedule the drafts above, or <a class="ap-link" href="#${catalogueRoute()}">pick a Playbook you have access to</a>.`
              : `<kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line · Drop a file to attach a source · ${renderChatGallery()}`
          }
        </div>
      </div>
    </div>
  `;
}

// ── Composer connector chip ───────────────────────────────────────────
// When a connected connector is "asked", it's attached to the composer as a
// chip (logo + name + ×). The next message is routed to the connector (live
// MCP) by submitInput(). Rendering the chip also swaps the textarea placeholder
// to "Ask {name} anything…" and (on attach) focuses the input.
export function renderComposerConnector(root, sessionId, { focus = false } = {}) {
  const container = root.querySelector("[data-composer-connector]");
  if (!container) return;
  const input = root.querySelector("#assistantInput");
  const id = getActiveConnector(sessionId);
  const connector = id ? findConnector(id) : null;
  if (!connector) {
    container.innerHTML = "";
    container.hidden = true;
    if (input) input.placeholder = COMPOSER_DEFAULT_PLACEHOLDER;
    return;
  }
  container.hidden = false;
  // Same chip family as the @ mention pills: a DS .ap-tag with the
  // connector logo as a 16px .ap-tag-avatar + an auto-styled close button.
  container.innerHTML = `
    <span class="ap-tag grey composer-mention composer-connector-chip">
      <span class="ap-tag-avatar">${renderConnectorLogo(connector, 16)}</span>
      <span class="composer-mention__label">${escapeHtmlAttr(connector.name)}</span>
      <button
        type="button"
        class="composer-mention__remove"
        data-composer-connector-remove
        aria-label="Remove ${escapeHtmlAttr(connector.name)}"
        title="Remove connector"
      >
        <i class="ap-icon-close"></i>
      </button>
    </span>`;
  if (input) {
    input.placeholder = `Ask ${connector.name} anything…`;
    if (focus) input.focus();
  }
}
