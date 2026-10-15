// The account home's hero (flag playbookWorkspace): the prompt, its Add menu,
// the Playbook picker and the workflow starters. Reads the page state home.js
// owns. Moved out of home.js, unchanged.

import { usableContexts } from "../../playbook-access.js?v=1818";
import { getActivePlaybookId } from "../../active-playbook.js?v=1818";
import { isFlagOn } from "../../feature-flags.js?v=1818";
import { getConnectedConnectors } from "../../connectors-store.js?v=1818";
import { escapeAttr, escapeText } from "../../utils.js?v=1818";
import { renderConnectorLogo } from "../../connectors-view.js?v=1818";
import { renderStarterCards } from "../../components/starter-card.js?v=1818";
import { pageState } from "../home.js?v=1818";

// ── The hero — the reason this page exists ────────────────────────────────
//
// Type, pick the brand, Enter. It is the one thing the catalogue could not do:
// manage, yes; start, no.
//
// ⚠️ NOT `.empty-chat`, which is the chat's own hero: `.app-shell:has(.empty-chat)`
// in layout.css HIDES the app topbar, and here the topbar carries the only way
// back into the work. Its own classes, its own stylesheet.
//
// No wordmark either — this page is reached by clicking the wordmark, and
// printing it again is the click's own echo.
export function renderHomeHero() {
  const options = usableContexts();
  // Nothing to pick from → no hero. A dead composer over an empty picker is
  // exactly the "greyed-out field the reader has to rule out" that the six
  // in-flow pickers were deleted for. The Playbooks tab's own empty state
  // already carries the one useful move, and it should say it once.
  if (options.length === 0) return "";
  const picked = pickedPlaybook();
  return `
    <section class="home-hero">
      <h1 class="home-hero__title">What are we working on?</h1>
      <p class="home-hero__sub">Pick a Playbook, tell me what you need, and I'll open a chat on it.</p>

      <div class="home-hero__card">
        <textarea
          class="home-hero__input"
          rows="3"
          placeholder="Tell me what you need…"
          aria-label="Tell me what you need"
          data-home-prompt
        ></textarea>
        <div class="home-hero__toolbar">
          ${renderHomeAdd()} ${renderHeroPicker(picked, options)}
          <button
            type="button"
            class="ap-button primary orange home-hero__send"
            data-home-send
            aria-label="Send"
            title="Send"
            disabled
          >
            <i class="ap-icon-arrow-up"></i>
          </button>
        </div>
      </div>
    </section>
  `;
}

// The brand this chat will run on. `usableContexts()`, not visibleContexts():
// a fiche you may read is not necessarily one you may write under.
export function pickedPlaybook() {
  const options = usableContexts();
  const wanted = pageState.pickedPlaybookId;
  return (
    (wanted && options.find((c) => c.id === wanted)) ||
    options.find((c) => c.id === getActivePlaybookId()) ||
    options[0] ||
    null
  );
}

// ── The hero's Add menu ───────────────────────────────────────────────────
//
// The same offer the chat composer makes — a PDF, a video, a URL, pasted text,
// your top posts, a Topic, a connected source. It cannot DO any of it here: the
// intake machinery is per-session (uploads, processing, replay), and there is no
// session on this page.
//
// So the home doesn't stage, it LAUNCHES: picking an item switches to the
// chosen brand, mints the chat, and hands the intent across in
// `pendingHomeAdd`, which session.js dispatches to the very same functions the
// composer's own menu calls. One key, one switch — three keys for three flows
// would be three rows in the handoff table that all mean "the home asked".
//
// FLAT, with dividers: the ADS ships no nested dropdown, so the composer's
// "Connected sources ▸" flyout is not reproduced — the connected sources are a
// third section instead.
function renderHomeAdd() {
  const item = (hook, icon, label) => `
    <button type="button" role="menuitem" class="ap-action-dropdown-item" ${hook}>
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${label}</span>
        </div>
      </div>
    </button>
  `;
  const divider = `<div class="ap-action-dropdown-divider" role="separator"></div>`;

  const topics = item('data-home-add="topic"', "ap-icon-antenna", "Pick from the Topic Feed");

  let connectors = "";
  if (isFlagOn("connectors")) {
    const connected = getConnectedConnectors();
    const rows = connected.length
      ? connected
          .map(
            (c) => `
            <button type="button" role="menuitem" class="ap-action-dropdown-item home-hero__connector" data-home-add-connector="${escapeAttr(c.id)}">
              <span class="home-hero__connector-logo">${renderConnectorLogo(c, 18)}</span>
              <div class="ap-action-dropdown-item-text">
                <div class="ap-action-dropdown-item-label-container">
                  <span class="ap-action-dropdown-item-label">${escapeText(c.name)}</span>
                </div>
              </div>
            </button>`,
          )
          .join("")
      : `<div class="home-hero__menu-label">No sources connected yet</div>`;
    connectors = `
      ${divider}
      <div class="home-hero__menu-label">Connected sources</div>
      ${rows}
      ${item('data-home-add="connectors"', "ap-icon-view-grid", "Browse connectors")}
    `;
  }

  return `
    <div class="home-hero__add">
      <button
        type="button"
        class="ap-button stroked grey"
        data-home-add-toggle
        aria-haspopup="menu"
        aria-expanded="false"
      >
        <i class="ap-icon-plus"></i>
        <span>Add</span>
      </button>
      <div class="ap-action-dropdown home-hero__add-menu" data-home-add-menu role="menu" hidden>
        ${item('data-home-add="pdf"', "ap-icon-file--pdf", "Add PDF")}
        ${item('data-home-add="video"', "ap-icon-file--video", "Add video")}
        ${item('data-home-add="url"', "ap-icon-link", "Add URL")}
        ${item('data-home-add="text"', "ap-icon-file--text", "Paste text")}
        ${divider}
        ${item('data-home-add="top-posts"', "ap-icon-feature-analytics", "Top performing posts")}
        ${topics}
        ${connectors}
      </div>
    </div>
  `;
}

// Same DS select as the rail's switcher, deliberately: it is the same question
// about the same object, so it should be the same control. Minus the footer —
// "All playbooks" IS this page, and the surface already carries two doors to
// creating one (the toolbar button and the grid's ghost card).
export function renderHeroPicker(picked, options) {
  const rows = options
    .map((c) => {
      const on = picked && c.id === picked.id;
      return `
        <div
          class="ap-select-option${on ? " selected" : ""}"
          data-home-pb-pick="${escapeAttr(c.id)}"
          role="option"
          aria-selected="${on ? "true" : "false"}"
        >
          <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(c.color || "grey")}" aria-hidden="true"></span>
          <span class="ap-select-option-text">${escapeText(c.name)}</span>
          ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");
  return `
    <details class="ap-select home-hero__pb" data-home-pb>
      <summary class="ap-select-trigger" title="Playbook: ${escapeAttr(picked?.name || "")} — the brand this chat runs on">
        <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(picked?.color || "grey")}" aria-hidden="true"></span>
        <span class="ap-select-inline-label">Playbook</span>
        <span class="ap-select-value">${escapeText(picked?.name || "Select a Playbook")}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a Playbook">
        <div class="ap-select-options">${rows}</div>
      </div>
    </details>
  `;
}

// ── The three workflows ───────────────────────────────────────────────────
//
// The same cards the new chat's hero carries, from the same renderer
// (components/starter-card.js). They belong here for the reason the hero has
// them: the composer answers "I know what I want to say", these answer "I have
// a source / a video / a winning post and want a batch out of it" — and on the
// home you also get to say WHICH brand it lands in before it starts.
//
// Only the dispatch differs: the chat runs the flow in place, the home switches
// brand and mints the session the flow needs (see startFromStarter).
//
// Full page width, unlike the hero's 720px column: the cards then share their
// left and right edges with the list under them, so the page reads as one
// centred prompt over two full-width blocks rather than three widths stacked.
export function renderHomeWorkflows() {
  // Nothing to start a workflow IN yet. Same rule as the hero.
  if (usableContexts().length === 0) return "";
  return `
    <section class="home-workflows">
      <h2 class="home-workflows__label" id="homeStarterLabel">Jump into a workflow</h2>
      <div class="starter-grid" role="group" aria-labelledby="homeStarterLabel">${renderStarterCards()}</div>
    </section>
  `;
}
