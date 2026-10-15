// A new chat's hero: the greeting, the workflow starters, and the "Fresh
// topics to review" grid (flag topicFeed). Moved out of session.js, unchanged.

import { getFeedForPlaybook } from "../../topic-feeds-store.js?v=1838";
import { getFreshTopics, countFresh } from "../../topics-store.js?v=1838";
import { getContextById } from "../../contexts-store.js?v=1838";
import { isWorkspaceMode } from "../../active-playbook.js?v=1838";
import { renderTopicCard } from "../../components/topic-card.js?v=1838";
import { findTopicSource } from "../../topics-catalog.js?v=1838";
import { html, raw } from "../../utils.js?v=1838";
import { getSources as getStreamSources } from "../../sources-stream.js?v=1838";
import { renderStarterCards } from "../../components/starter-card.js?v=1838";

// Composer "Add" menu — "Connected sources" is a nested submenu (Codex-style
// "Modules d'extension ▸" flyout), not a first-level list. The flyout lists the
// connected connectors as live sources you can query in chat (logo + name →
// ask), and the only place to connect new ones — "Browse connectors" — sits at
// the very bottom of that flyout.
// ── The composer's way into the Topic Feed ─────────────────────────────────
// A flat row in the Add menu, above the connectors submenu. Not a submenu of its
// own: ADS ships no nested dropdown, and this is one destination, not a set. No
// divider before it — it sits directly under "Top performing posts" as one more
// source to pull in, not a separate group.
export function renderTopicPickerRow() {
  return `
    <button type="button" class="ap-action-dropdown-item" data-add-source="topic" role="menuitem">
      <i class="ap-icon-antenna"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">Pick from the Topic Feed</span>
        </div>
      </div>
    </button>
  `;
}

// ── "Fresh topics to review" ───────────────────────────────────────────────
// The freshest to-review Topics from THIS chat's Playbook, at most six, BELOW the
// workflow starters and in the same 3-column grid.
//
// ⚠️ It was a stack of full-width rows ABOVE the starters, on the argument that
// proposals should come before verbs. Both halves were wrong in practice: six
// rows ran ~500px tall and pushed all three workflow cards off the fold, so the
// "proposal" buried the things it was supposed to precede. As a 3x2 grid of the
// SAME card the feed uses, it takes two rows instead of six and the starters stay
// visible.
//
// The card's body opens the Topic's article — reading comes before deciding — and
// `withUse` adds the verb on the card face for the reader who already knows,
// because a card sitting beside three workflow cards you click to start
// something has to be actionable the same way.
//
// NO Playbook chip per row. Every Topic here belongs to the chat's own Playbook,
// so a chip repeated identically six times, under a composer that already names
// the same Playbook, labels nothing. The section header carries the scope once,
// and only when the chat actually has a Playbook to name.
//
// The footer's total is every Topic under a week old WHATEVER its status, so it
// describes the week rather than a to-do list: triaging a row moves N down and
// leaves M where it was.
//
// Renders nothing at all when there is nothing to say, so a hero with no Topics
// is byte-for-byte the hero this app has always had.
function renderFreshTopics(session) {
  const pbId = session?.contextId || null;
  const feed = pbId ? getFeedForPlaybook(pbId) : null;
  if (!feed) return "";
  const topics = getFreshTopics(feed.id);
  if (!topics.length) return "";
  const total = countFresh(feed.id);
  const pb = getContextById(pbId);
  const scopeHref = isWorkspaceMode() ? "#/topics" : `#/topics?pb=${encodeURIComponent(pbId)}`;

  const cards = topics
    .map((t) => renderTopicCard(t, { source: findTopicSource(t.sourceId), variant: "picker", withUse: true }))
    .join("");

  return html`
    <h2 class="empty-chat__starter-label" id="freshTopicsLabel">
      <span>Fresh topics to review</span>
      ${raw(pb ? html`<span class="empty-chat__topics-scope">· ${pb.name}</span>` : "")}
    </h2>
    <div class="empty-chat__topics" role="group" aria-labelledby="freshTopicsLabel">
      <div class="empty-chat__topics-grid">${raw(cards)}</div>
      <footer class="empty-chat__topics-foot">
        <span class="empty-chat__topics-count">${topics.length} out of ${total} shown</span>
        <a class="ap-link standalone small" href="${raw(scopeHref)}"
          >See more in your feed<i class="ap-icon-arrow-right" aria-hidden="true"></i
        ></a>
      </footer>
    </div>
  `;
}

// Empty-state hero — shown inside the assistant thread region when the user
// hasn't sent a first message yet. Mirrors the handoff (Chat.jsx empty state):
// hero question + sub-line + 2x2 grid of starter cards. Cards click → prefill
// the composer textarea (handler in bindSession via [data-starter]).
//
// FIND-A4: the raw prompts in mocks.chatStarters use a `{{source}}` placeholder
// that the previous version dropped into the textarea verbatim. Resolve it at
// render time: if a source is attached we name it; otherwise we fall back to
// "your source" so the prompt still reads cleanly for first-run users.
//
// Context decision: handled entirely by the composer picker (visible
// inline inside this hero). The previous inline AI question flow
// ("Quick — which context?") was removed — the composer picker is now
// the single, always-visible context affordance.
export function renderEmptyHero(sessionId, composerMarkup = "", session = null) {
  const sources = getStreamSources(sessionId);
  const firstSource = sources.find((s) => s.status !== "Processing") || sources[0] || null;
  const sourceLabel = firstSource ? `"${firstSource.filename}"` : "your source";
  // `{{video-source}}` resolves to the first processed video source so the
  // "Extract video clips" starter reads naturally even when the first
  // overall source is a PDF.
  const firstVideo = sources.find(
    (s) => (s.kind || "").toLowerCase() === "video" && s.status === "Processed" && typeof s.durationSec === "number",
  );
  const videoLabel = firstVideo ? `"${firstVideo.filename}"` : "your video";
  // The three cards come from components/starter-card.js — the home renders the
  // same ones, so there is one renderer and two hosts.
  const cards = renderStarterCards({ sourceLabel, videoLabel });
  return html`
    <div class="empty-chat" data-empty-chat>
      <span class="empty-chat__logo" role="img" aria-label="Archie">
        <img class="empty-chat__logo-word empty-chat__logo-word--a" src="assets/logos/archie-wordmark.svg" alt="" />
        <img class="empty-chat__logo-mono" src="assets/logos/archie-mono.svg" alt="" />
        <img class="empty-chat__logo-word empty-chat__logo-word--b" src="assets/logos/archie-alt-wordmark.svg" alt="" />
      </span>
      <div class="empty-chat__sub">
        Drop a source — I'll turn it into a batch of ready-to-schedule posts, all from one chat.
      </div>
      ${raw(composerMarkup)}
      <!-- Starters first, proposals second. The other way round was tried on the
           argument that "what should I post today?" is the question someone
           opening a blank chat actually has — true, but six full-width Topic rows
           pushed all three workflow cards below the fold, so the proposal buried
           the features it was meant to introduce. Both are card grids now, so the
           Topics cost two rows instead of six and nothing is hidden. -->
      <h2 class="empty-chat__starter-label" id="starterGridLabel">Jump into a workflow</h2>
      <div class="starter-grid" role="group" aria-labelledby="starterGridLabel">${raw(cards)}</div>
      ${raw(renderFreshTopics(session))}
    </div>
  `;
}
