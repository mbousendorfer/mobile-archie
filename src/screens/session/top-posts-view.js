// The Top posts repurpose screen as the session hosts it: its steps, the
// winners picker, and its Playbook control. Moved out of session.js, unchanged.

import { isWorkspaceMode } from "../../active-playbook.js?v=1803";
import { usableContexts } from "../../playbook-access.js?v=1803";
import { escapeHtml, html, raw } from "../../utils.js?v=1803";
import * as topPostsFlow from "../../top-posts-flow.js?v=1803";
import { renderEmptyState } from "../../components/empty-state.js?v=1803";
import { profileForNetwork } from "../../social-profiles.js?v=1803";
import { renderPicker } from "../_analyse-common.js?v=1803";
import * as inlineQuestion from "../../inline-question.js?v=1803";
import { getContextById } from "../../contexts-store.js?v=1803";
import { buildWorkflowFlow } from "./workflow-flow.js?v=1803";
import { TOP_POSTS_LIMIT, renderTopPostsBoard } from "../../components/top-post-card.js?v=1803";
import { dotColorVar } from "../session.js?v=1803";

// Playbook picker for the top-posts step 1 (account screen) — the chosen
// Playbook governs the voice of the repurposed drafts. Mirrors the batch / clip
// playbook controls; routes through the `data-topposts-playbook-pick` delegate.
function renderTopPostsPlaybookControl(ctx) {
  if (isWorkspaceMode()) return "";
  const playbooks = usableContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div class="ap-select-option${isSel ? " selected" : ""}" data-topposts-playbook-pick="${escapeHtml(c.id)}" role="option" aria-selected="${isSel ? "true" : "false"}">
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
    <details class="ap-select studio-commit__playbook" data-topposts-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for these drafts">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>`;
}

// Top-posts winner-selection screen — Archie's intro turn above a visual grid
// of top-post cards (renderTopPostsGrid). Reuses the wizard chat shell so the
// thread subscriber + scroll-pin + drag rebind in wireAssistantPanel keep
// working; the grid sits in the scrollable chat area (no sticky picker bar —
// clicking a card advances straight to the reuse-mode step).
// Workflow header steps — mirrors the Batch / Clip studio intros so the
// milker reads as a first-class workflow, not a bare grid.
const TOP_POSTS_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-feature-analytics",
    title: "Pick an account",
    text: "Choose a connected account to pull your best-performing posts from.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "See the winners",
    text: "I rank its posts by engagement — pick one and a fresh angle.",
  },
  {
    tone: "out",
    icon: "ap-icon-stack",
    title: "Reuse into drafts",
    text: "I write fresh versions in your playbook's voice — ready to review and schedule.",
  },
];

export function renderTopPostsPickerScreen(session) {
  const state = topPostsFlow.getPickerState(session.id);
  if (!state) return "";
  // No published history yet (new user) — the studio opens straight onto a
  // dedicated empty state instead of the account chooser. A single "Back to
  // chat" affordance (also Esc) is the only way out since there's nothing to
  // pick.
  if (state.stage === "empty") {
    return html`
      <aside
        class="session__assistant session__assistant--wizard session__assistant--board"
        aria-label="Assistant panel"
      >
        <div class="analyse__chat session__assistant-board-chat">
          <div class="analyse__chat-inner session__assistant-board-inner">
            <div class="top-posts-intro">
              <span class="top-posts-intro__badge"
                ><i class="ap-icon-feature-analytics" aria-hidden="true"></i>Top posts</span
              >
            </div>
            ${raw(
              renderEmptyState({
                icon: "ap-icon-feature-analytics",
                title: "No top posts to reuse yet",
                body: "Once your posts start performing, I'll surface your winners here so you can spin fresh drafts out of what already works. Publish a few and come back.",
                actionHtml:
                  '<button type="button" class="ap-button stroked" data-topposts-exit><span>Back to chat</span></button>',
              }),
            )}
          </div>
        </div>
      </aside>
    `;
  }
  // A studio-style screen (like Batch / Clip): a centered intro header, then a
  // stage-dependent body — profile chooser (step 1) → loading beat → winner
  // board. Distinct container classes (not #inlineQuestionChat / wizard-chat) so
  // the chat scroll-pin in wireAssistantPanel doesn't yank it to the bottom.
  const account = state.profile ? profileForNetwork(state.profile) : null;
  const profileName = account?.handle || "";

  let intro;
  let body;
  if (state.stage === "profile") {
    // Step 1 — pick which connected account to mine. This is the *exact* in-chat
    // picker component (inlineQuestion.ask, armed by top-posts-flow when the
    // profile stage opens): we render its chrome (handler "inline-question")
    // inside the studio framing (workflow roadmap + a keyboard hint bar), so it
    // reads — and behaves — like every other in-chat pick. Single-select:
    // clicking a row (or pressing its digit) routes through the shared
    // inline-question delegate → inlineQuestion.pick → chooseProfile.
    intro =
      "Pick a connected account and I'll surface its best-performing posts — reuse any into fresh drafts in your playbook's voice.";
    const picker = renderPicker(inlineQuestion.renderChrome(session.id)?.picker);
    // The Playbook whose voice the repurposed drafts will follow, chosen here on
    // step 1 (defaults to the workspace default; persists through to generation).
    const playbookCtx = getContextById(topPostsFlow.getContextId(session.id));
    // The account is highlighted (not advanced) on click; "Next" confirms the
    // account + Playbook together. Disabled until an account is selected.
    const selectedAccount = inlineQuestion.getSelected(session.id);
    body = html`
      ${raw(buildWorkflowFlow(TOP_POSTS_STEPS))}
      <div class="top-posts-account-picker">
        ${raw(picker)}
        <div class="studio-commit">
          <div class="studio-commit__row">
            ${raw(renderTopPostsPlaybookControl(playbookCtx))}
            <button
              type="button"
              class="ap-button primary blue studio-commit__cta"
              data-topposts-next
              ${selectedAccount ? "" : "disabled"}
            >
              <span>Show my ${TOP_POSTS_LIMIT} top posts</span>
            </button>
          </div>
          <p class="studio-commit__hint muted">I'll write the fresh drafts in this playbook's voice.</p>
        </div>
      </div>
    `;
  } else if (state.stage === "loading") {
    intro = profileName ? `Loading your top posts from ${profileName}…` : "Loading your top posts…";
    body = html`
      <div class="top-posts-loading" role="status" aria-live="polite">
        <span class="archie-loader" style="--archie-loader-size: 44px"></span>
        <span class="top-posts-loading__label">Pulling ${profileName || "your"} winners…</span>
      </div>
    `;
  } else {
    intro = profileName
      ? `Your top-performing posts on ${profileName} — pick one to spin fresh angles.`
      : "Pick one of your best-performing posts to spin fresh angles.";
    body = html`
      ${raw(buildWorkflowFlow(TOP_POSTS_STEPS))}
      ${raw(
        renderTopPostsBoard({
          posts: state.posts,
          sort: state.sort,
          profile: state.profile,
          period: state.period,
        }),
      )}
    `;
  }

  return html`
    <aside class="session__assistant session__assistant--wizard session__assistant--board" aria-label="Assistant panel">
      <div class="analyse__chat session__assistant-board-chat">
        <div class="analyse__chat-inner session__assistant-board-inner">
          <div class="top-posts-intro">
            <span class="top-posts-intro__badge"
              ><i class="ap-icon-feature-analytics" aria-hidden="true"></i>Top posts</span
            >
            <h1 class="top-posts-intro__title">Reuse your best-performing posts</h1>
            <p class="top-posts-intro__sub">${intro}</p>
          </div>
          ${raw(body)}
        </div>
      </div>
    </aside>
  `;
}
