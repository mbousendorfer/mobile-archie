// The right panel's Ideas mode: the Ideas / Clips lists, their filters, and
// the per-card feedback and "why this idea" state. Moved out of right-panel.js,
// unchanged; the filter state it reads is owned (and written) by the shell.

import { html, raw } from "../../utils.js?v=1902";
import { getSources as getStreamSources } from "../../sources-stream.js?v=1902";
import { renderClipCard } from "../clip-card.js?v=1902";
import { renderCompactIdeaCard } from "../idea-card-compact.js?v=1902";
import { activeSessionId, clipSelection, ideasFilter, outputsView, sessionIdeas } from "../right-panel.js?v=1902";

// Idea kind taxonomy — handoff Ideas filter rail (§ 2.6). Order is the order
// shown in the chip row. The .kind selector also drives the per-kind tag
// color so each kind reads at a glance.
const IDEA_KINDS = [
  { id: "all", label: "All" },
  { id: "hook", label: "Hooks" },
  { id: "stat", label: "Stats" },
  { id: "quote", label: "Quotes" },
  { id: "story", label: "Stories" },
  { id: "insight", label: "Insights" },
];

export function renderIdeasView() {
  const ideaCount = sessionIdeas().length;
  const clips = collectAllClips();
  const clipCount = clips.length;
  const ideasActive = outputsView === "ideas";

  // Outputs tabs — Ideas | Clips. Always rendered so the user can
  // discover the Clips surface even when empty; the Clips tab carries
  // an empty state on its own when no clips have been extracted yet.
  const tabs = `
    <div class="ap-tabs rpanel-outputs__tabs">
      <div class="ap-tabs-nav">
        <button
          type="button"
          class="ap-tabs-tab ${ideasActive ? "active" : ""}"
          data-rpanel-outputs-tab="ideas"
          role="tab"
          aria-selected="${ideasActive}"
        >
          <span>Ideas</span>
          ${ideaCount > 0 ? `<span class="ap-counter normal ${ideasActive ? "blue" : "grey"}">${ideaCount}</span>` : ""}
        </button>
        <button
          type="button"
          class="ap-tabs-tab ${!ideasActive ? "active" : ""}"
          data-rpanel-outputs-tab="clips"
          role="tab"
          aria-selected="${!ideasActive}"
        >
          <span>Clips</span>
          ${clipCount > 0 ? `<span class="ap-counter normal ${!ideasActive ? "blue" : "grey"}">${clipCount}</span>` : ""}
        </button>
      </div>
    </div>
  `;

  if (!ideasActive) {
    return html`
      <div class="rpanel-ideas">
        ${raw(tabs)}
        <div class="rpanel-ideas__body" data-rpanel-ideas-body>${raw(renderClipsList(clips))}</div>
      </div>
    `;
  }

  // Counts per kind for the filter chips — "All (12)" / "Stats (4)".
  const totalCount = sessionIdeas().length;
  const kindCounts = IDEA_KINDS.reduce((acc, k) => {
    acc[k.id] = k.id === "all" ? totalCount : sessionIdeas().filter((i) => i.kind === k.id).length;
    return acc;
  }, {});

  return html`
    <div class="rpanel-ideas">
      ${raw(tabs)}
      <div class="rpanel-ideas__head">
        <div class="rpanel-ideas__filters" role="group" aria-label="Filter ideas by kind">
          ${raw(
            IDEA_KINDS.map(
              (k) => `
                <button
                  type="button"
                  class="ap-filter-chip"
                  data-rpanel-ideas-filter="${k.id}"
                  aria-pressed="${ideasFilter === k.id}"
                >
                  <span>${k.label}</span>
                  <span class="ap-filter-chip-count">${kindCounts[k.id]}</span>
                </button>
              `,
            ).join(""),
          )}
        </div>
      </div>
      <div class="rpanel-ideas__body" data-rpanel-ideas-body>${raw(renderIdeasList())}</div>
    </div>
  `;
}

// Walk all sources in the workspace and aggregate any attached clips with
// their source attribution so the unified panel knows where each clip
// came from. Returns a flat array of { clip, sourceName, sourceId }.
export function collectAllClips() {
  const sid = activeSessionId();
  if (!sid) return [];
  const sources = getStreamSources(sid);
  const out = [];
  for (const src of sources) {
    if (!Array.isArray(src.clips) || src.clips.length === 0) continue;
    for (const clip of src.clips) {
      out.push({
        clip,
        sourceName: src.filename || "Source",
        sourceKind: src.kind || "Video",
        sourceId: src.id,
      });
    }
  }
  return out;
}

function renderClipsList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return html`
      <div class="app-right-panel__empty rpanel-ideas__no-match">
        <div class="app-right-panel__empty-icon"><i class="ap-icon-file--video"></i></div>
        <div class="app-right-panel__empty-title">No clips yet</div>
        <div class="app-right-panel__empty-sub">
          Drop a video into the chat and pick <strong>Create clips</strong> to extract short segments here.
        </div>
      </div>
    `;
  }

  const sid = activeSessionId();
  const cards = entries
    .map(({ clip, sourceName, sourceKind }) => {
      const selected = clipSelection.has(clip.id);
      // Checkbox in a left gutter OUTSIDE the card (mirrors the Drafts rows),
      // then the clip card.
      return `
        <div class="rpanel-outputs__clip-row${selected ? " is-selected" : ""}">
          <div class="rpanel-outputs__clip-check">
            <label class="ap-checkbox-container" aria-label="Select clip">
              <input type="checkbox" data-clip-select="${clip.id}" ${selected ? "checked" : ""} />
              <i></i>
            </label>
          </div>
          ${renderClipCard(clip, {
            sourceName,
            sourceKind,
            sessionId: sid,
            whyOpen: isClipWhyOpen(clip.id),
            selected,
          })}
        </div>`;
    })
    .join("");

  // Bulk band — mirrors the Drafts group band: a select-all checkbox + count,
  // and (once a selection exists) auto-width actions to draft or delete the
  // selected clips at once. Reuses the .rpanel-drafts__group-* chrome so the two
  // surfaces read the same; no full-width footer button.
  const total = entries.length;
  const selectedCount = entries.filter(({ clip }) => clipSelection.has(clip.id)).length;
  const selecting = selectedCount > 0;
  const allSelected = total > 0 && selectedCount === total;
  const indeterminate = selecting && !allSelected;
  const countLabel = selecting ? `· ${selectedCount} selected` : `· ${total} clip${total > 1 ? "s" : ""}`;
  const actions = selecting
    ? `
        <div class="rpanel-drafts__group-actions">
          <button type="button" class="ap-button stroked blue" data-rpanel-clips-draft>
            <i class="ap-icon-archie-official"></i>
            <span>Draft ${selectedCount > 1 ? "posts" : "post"}</span>
          </button>
          <button type="button" class="ap-icon-button" data-rpanel-clips-delete aria-label="Delete ${selectedCount} selected clip${selectedCount > 1 ? "s" : ""}">
            <i class="ap-icon-trash" aria-hidden="true"></i>
          </button>
        </div>`
    : "";
  const band = `
    <div class="rpanel-drafts__group-header rpanel-outputs__band${selecting ? " is-selecting" : ""}">
      <div class="rpanel-drafts__group-band">
        <label class="ap-checkbox-container ${indeterminate ? "indeterminate" : ""}" aria-label="Select all clips">
          <input type="checkbox" data-rpanel-clips-select-all ${allSelected ? "checked" : ""} />
          <i></i>
        </label>
        <div class="rpanel-drafts__group-identity">
          <i class="ap-icon-file--video rpanel-drafts__group-icon" aria-hidden="true"></i>
          <span class="rpanel-drafts__group-label">Clips</span>
          <span class="rpanel-drafts__group-count">${countLabel}</span>
        </div>
        ${actions}
      </div>
    </div>
  `;

  return `
    ${band}
    <div class="rpanel-outputs__clips">${cards}</div>
  `;
}

function renderIdeasList() {
  // Order matches the seed array (newest-first by convention in mocks);
  // the active kind filter narrows the list.
  const sorted = sessionIdeas().filter((i) => ideasFilter === "all" || i.kind === ideasFilter);
  if (sorted.length === 0) {
    return html`
      <div class="app-right-panel__empty rpanel-ideas__no-match">
        <div class="app-right-panel__empty-icon"><i class="ap-icon-archie-official"></i></div>
        <div class="app-right-panel__empty-title">No ideas match</div>
        <div class="app-right-panel__empty-sub">Switch to a different kind, or pick All to broaden the list.</div>
        <div class="app-right-panel__empty-action">
          <button type="button" class="ap-button stroked grey" data-rpanel-ideas-clear>Clear filters</button>
        </div>
      </div>
    `;
  }

  return `<div class="rpanel-ideas__grid">${sorted.map((i) => renderIdeaCompact(i)).join("")}</div>`;
}

function renderIdeasBodyOnly() {
  const body = document.querySelector("[data-rpanel-ideas-body]");
  if (body) body.innerHTML = renderIdeasList();
}

// ── Card-level helper — thumbs feedback ─────────────────────────────
// The user's reaction per idea, in a module-local Map so it survives renders
// without leaking onto the seeded mock object. Clicking the same verdict again
// clears it (toggle off). ideaId → 'up' | 'down'.
const ideaFeedback = new Map();

function getIdeaFeedback(ideaId) {
  return ideaFeedback.get(ideaId) || null;
}

export function toggleIdeaFeedback(ideaId, verdict) {
  if (verdict !== "up" && verdict !== "down") return;
  const current = ideaFeedback.get(ideaId);
  if (current === verdict) ideaFeedback.delete(ideaId);
  else ideaFeedback.set(ideaId, verdict);
  renderIdeasBodyOnly();
}

// Per-idea collapse state for the "Why this idea" panel. Default
// collapsed so a long list of idea cards stays scannable; the user
// opts in per-card via the head toggle. Toggle persists for the
// lifetime of the module so re-renders don't reset user intent.
const ideaWhyOpen = new Map();

function isWhyOpen(ideaId) {
  const stored = ideaWhyOpen.get(ideaId);
  return stored === undefined ? false : stored;
}

export function toggleWhyOpen(ideaId) {
  ideaWhyOpen.set(ideaId, !isWhyOpen(ideaId));
  renderIdeasBodyOnly();
}

// Per-clip Why-open state — module-local mock (no persistence). The Map
// survives re-renders so a future full repaint reflects the user's choice;
// the in-place toggle helper below mutates the DOM directly to keep the
// clips list's scroll position when the user expands a card mid-list.
// (Clip thumbs/reasons feedback now lives in the shared feedback-store via
// the feedback-control, so there is no clipFeedback Map here anymore.)
const clipWhyOpen = new Map();

function isClipWhyOpen(clipId) {
  const stored = clipWhyOpen.get(clipId);
  return stored === undefined ? false : stored;
}

// In-place "Why this clip" toggle — flips state Map AND mutates the
// section's open attribute, body hidden flag, chevron icon class, and
// aria-expanded. No re-render → scroll stays put.
export function toggleClipWhyInPlace(clipId, headBtn) {
  const next = !isClipWhyOpen(clipId);
  clipWhyOpen.set(clipId, next);

  const section = headBtn.closest(".rpanel-ideas__why");
  if (section) section.setAttribute("data-why-open", next ? "true" : "false");
  headBtn.setAttribute("aria-expanded", next ? "true" : "false");
  const bodyId = headBtn.getAttribute("aria-controls");
  const body = bodyId ? document.getElementById(bodyId) : null;
  if (body) body.hidden = !next;
  const chevron = headBtn.querySelector(".rpanel-ideas__why-chevron");
  if (chevron) {
    chevron.classList.toggle("ap-icon-chevron-down", !next);
    chevron.classList.toggle("ap-icon-chevron-up", next);
  }
}

function renderIdeaCompact(idea) {
  // Resolve linked sources for the current session so the head shows real
  // filenames + per-kind icons. The shared renderer owns the markup; the
  // panel just feeds it the session sources + this card's feedback/why state.
  const sid = activeSessionId();
  const sessionSources = sid ? getStreamSources(sid) : [];
  return renderCompactIdeaCard(idea, sessionSources, {
    verdict: getIdeaFeedback(idea.id),
    whyOpen: isWhyOpen(idea.id),
    showMention: true,
  });
}
