import { html, raw, escapeHtml, escapeAttr as escapeHtmlAttr } from "../utils.js?v=1809";
import { navigate } from "../router.js?v=1809";
import { renderTopbar } from "../components/topbar.js?v=1809";
import { connectorDocs } from "../mocks.js?v=1809";
import { getConnectedProfiles } from "../social-profiles.js?v=1809";
import { getSessionById, getSessions } from "../sessions-store.js?v=1809";
import { getContextById, getContexts, updateContext } from "../contexts-store.js?v=1809";
import { playbookForNewWork, isWorkspaceMode } from "../active-playbook.js?v=1809";
import { revokedContextFor, usableContexts, canView } from "../playbook-access.js?v=1809";
import { isNewUser } from "../user-mode.js?v=1809";
import {
  getThread,
  sendMessage,
  postAssistantMessage,
  postUserTurn,
  postSelectionEcho,
  postSchedulePlan,
  setSchedulePlanStatus,
  subscribe,
  submitAssistantChoice,
  sendConnectorMessage,
  markConnectPromptResolved,
  retryFailedTurn,
  refreshThread,
  toggleTopPostsWidgetPick,
  answerTopPostsWidget,
  toggleTopicsWidgetPick,
  answerTopicsWidget,
} from "../assistant.js?v=1809";
import {
  accept as acceptVoiceSuggestion,
  dismiss as dismissVoiceSuggestion,
  undo as undoVoiceSuggestion,
  getSuggestion as getVoiceSuggestion,
} from "../voice-coach-store.js?v=1809";
import { rewriteDraftsWithRule } from "../voice-coach.js?v=1809";
import { iconFor as fileIconForKind } from "../file-kinds.js?v=1809";
import { getSources, getIdeas, appendExtractedIdeas } from "../library.js?v=1809";
import { wireLibraryActions, renderSourcesBulkBar, renderIdeasBulkBar } from "../library-actions.js?v=1809";
import {
  renderInto as renderComposerMentions,
  removeMention as removeComposerMention,
  subscribe as subscribeComposerMentions,
  addMention as addComposerMention,
} from "../composer-mentions.js?v=1809";
import { setSubtitleStyle, getPosts, removePost } from "../posts-store.js?v=1809";
import { executeDraft } from "../draft-flow.js?v=1809";
import * as topPostsFlow from "../top-posts-flow.js?v=1809";
import { renderTopPostsBoard } from "../components/top-post-card.js?v=1809";
import * as sidebarWizard from "../sidebar-wizard.js?v=1809";
import * as inlineQuestion from "../inline-question.js?v=1809";
import { planSlots, defaultStrategy, CADENCES, queueEntries } from "../schedule-engine.js?v=1809";
import { addToQueue } from "../schedule-store.js?v=1809";
import { refLabel } from "../chat-refs.js?v=1809";
import { networkLabel, networkIcon } from "../network-voice.js?v=1809";
import { openScheduleForPosts, onPostImage } from "../components/right-panel/drafts-view.js?v=1809";
import { accountIdsForNetwork } from "../connect-profiles-flow.js?v=1809";
import { open as openConnectAccountModal } from "../components/connect-account-modal.js?v=1809";
import * as clipStudio from "../clip-studio.js?v=1809";
import * as batchStudio from "../batch-studio.js?v=1809";
import { askConnector } from "../connector-ask.js?v=1809";
import { getConnectedConnectors, findConnector, setConnectorStatus } from "../connectors-store.js?v=1809";
import { renderConnectorLogo } from "../connectors-view.js?v=1809";
import {
  getActiveConnector,
  clearActiveConnector,
  subscribe as subscribeComposerConnector,
} from "../composer-connector.js?v=1809";
import { isFlagOn } from "../feature-flags.js?v=1809";
import { onChatGalleryClick } from "./session/chat-gallery.js?v=1809";
import * as contextBuilder from "../context-builder.js?v=1809";
import { renderPicker } from "./_analyse-common.js?v=1809";
import { contentState, rerenderContentWorkspaceBody } from "../components/content-workspace.js?v=1809";
import { open as openChatPickerModal } from "../components/chat-picker-modal.js?v=1809";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=1809";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=1809";
import {
  classifyFile,
  startFileUpload,
  startUrlImport,
  getSources as getStreamSources,
  subscribeUploads,
  pushScriptedSource,
  completeScriptedSource,
  updateSourceClips,
} from "../sources-stream.js?v=1809";
import { onFeedbackClick } from "../components/feedback-control.js?v=1809";
import { showToast } from "../components/toast.js?v=1809";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  focusInPanel,
  openClips as openClipsPanel,
  getMode as getRightPanelMode,
  subscribe as subscribeRightPanel,
} from "../components/right-panel.js?v=1809";
import { setHandoff, consumeHandoff } from "../handoff.js?v=1809";
import { attachTopicToChat, useTopicInChat, startTopicPickerInline, TOPIC_CHAT_HANDOFF } from "../topic-flow.js?v=1809";
import { startObjectiveChat, OBJECTIVE_CHAT_HANDOFF } from "../objective-flow.js?v=1809";
import { getTopicById, markUsed, subscribe as subscribeTopics } from "../topics-store.js?v=1809";
import { openTopicArticle } from "../components/topic-picker-modal.js?v=1809";
import { parseHashParams, setHashQuery } from "../url-state.js?v=1809";
import { updateLoadingWatchdog, stopThinkingTimer } from "./session/thinking-chip.js?v=1809";
import { startIntakeLifecycle } from "./session/intake-lifecycle.js?v=1809";
import { rebindWizardKeyboard } from "./session/wizard-keyboard.js?v=1809";
// Pure thread-turn renderers — shared with the component handoff gallery so
// the previews there never drift from the app (handoff/components.html).
import { SWITCH_SKELETON_HTML } from "./session/thread-turns.js?v=1809";
import {
  clipsToChat,
  finalizeClipStudio,
  handleClipStudioFile,
  handleClipStudioUrl,
  openClipStudioEditor,
  renderClipStudio,
} from "./session/clip-studio-view.js?v=1809";
import {
  handleBatchFiles,
  renderBatchStudio,
  repaintBatchRest,
  replayBatchSources,
  startBatchChat,
} from "./session/batch-studio-view.js?v=1809";
import {
  askRepurposeProfiles,
  askVideoIntake,
  startIdeaDraft,
  startRepurposeFlow,
} from "./session/draft-questions.js?v=1809";
import {
  extractionVerdict,
  extractionWhyOpen,
  findExtractionIdea,
  renderThread,
  repaintExtractionCard,
} from "./session/thread-render.js?v=1809";
import {
  animateBannerIn,
  animateBannerOut,
  computeComposerStatus,
  draftBannerFlowInner,
  draftBanners,
  ideaBannerFlowInner,
  ideaBanners,
  renderComposer,
  renderComposerConnector,
  renderComposerStatus,
} from "./session/composer.js?v=1809";
import { renderTopPostsPickerScreen } from "./session/top-posts-view.js?v=1809";
import { renderEmptyHero } from "./session/empty-hero.js?v=1809";

// Default composer placeholder — restored whenever no connector is attached.
// A connected connector swaps it for "Ask {name} anything…".
export const COMPOSER_DEFAULT_PLACEHOLDER = "Ask a follow-up, or refine a draft…";

// Session screen — persistent assistant panel on the left, workspace with
// tabs on the right.
//
// URL:   #/session/:id?tab=posts|library|ideas|context
//
// For a real session id (e.g. s-acme-launch) in returning-user mode, the
// tabs render populated views; otherwise they render empty states.

function readQuery() {
  const params = parseHashParams();
  // Posts tab dropped at Lot 4.4 (Q4). Legacy `?tab=posts` URLs land on
  // Content + auto-open the right panel Drafts in renderSession below.
  const rawTab = params.get("tab");
  const tab = !rawTab || rawTab === "posts" ? "content" : rawTab;
  return {
    tab,
    populated: params.get("populated") === "1" || params.get("populated") === "true",
    title: params.get("title") || "",
    contextId: params.get("contextId") || "",
    postsFilter: params.get("postsFilter") || "all",
    postsNetwork: params.get("postsNetwork") || "all",
    focusIdea: params.get("focusIdea") || "",
    focusPost: params.get("focusPost") || "",
    focusSource: params.get("focusSource") || "",
    view: params.get("view") || "sources",
  };
}

// Search query + sort live in the shared content-workspace module — same
// state in the dashboard's start screen and the in-session Content tab.

function setQuery(next) {
  const merged = { ...readQuery(), ...next };
  Object.keys(merged).forEach((key) => {
    if (merged[key] == null || merged[key] === "" || merged[key] === false) delete merged[key];
  });
  setHashQuery(`/session/${getActiveSessionIdFromHash()}`, merged);
}

function getActiveSessionIdFromHash() {
  const m = /^#\/session\/([^/?]+)/.exec(window.location.hash);
  return m ? m[1] : "new";
}

// Library selection — module-local Sets, mutated in place by
// library-actions.js. One Set per kind (sources / ideas) so the matching
// bulk bar shows up only when its view is active. Cleared whenever the
// user navigates to a different session id; persists across tab + view
// switches within the same session.
const sourceSelection = new Set();
const ideaSelection = new Set();
let previousSessionId = null;
function clearSelection() {
  sourceSelection.clear();
  ideaSelection.clear();
}

// Unsubscribe fn for the assistant thread + library subscriptions.
let currentUnsubscribe = null;

// Controller used to abort the click/keydown listeners that bindSession
// attaches to the stable #app element. Each renderSession call aborts the
// previous batch and hands bindSession a fresh controller — otherwise tab
// switches stack listeners and `[data-add-source]` fires N times per click.
let currentListenerController = null;

export function renderSession(params, target) {
  const mockedSession = getSessionById(params.id);
  const isRealSession = !!mockedSession && !isNewUser();
  const q = readQuery();

  const session = mockedSession || {
    id: params.id,
    name: q.title || (params.id === "new" ? "Untitled session" : "Session"),
    // New Chat starts pre-bound to the default playbook so the composer pill
    // shows a real selection (and the first send uses it instead of
    // auto-launching the create-a-playbook wizard). The user can swap it via
    // the composer pill before sending. Creation flows (welcome-alt-*,
    // new-ctx-*) never hit this "new" branch.
    // A chat always needs a Playbook — pre-bind the default one whenever
    // we land on a fresh `/session/new` or `/session/new-<id>`. The
    // user can still swap it via the composer pill before the first send.
    contextId:
      q.contextId || (params.id === "new" || params.id.startsWith("new-") ? playbookForNewWork()?.id || null : null),
  };
  // Reset selection when switching to a different chat. Tab + URL-param
  // changes within the same session keep the selection intact.
  const isSessionSwitch = previousSessionId !== session.id;
  if (isSessionSwitch) {
    clearSelection();
    previousSessionId = session.id;
  }

  // Clip Studio — a dedicated full-page "Extract video clips" flow runs in its
  // own `clip-studio-*` session. Start the upload stage SYNCHRONOUSLY here (on
  // first render, before innerHTML below) so the upload box paints with zero
  // flicker. GATE on the one-shot handoff so a re-render AFTER the flow exits
  // (e.g. openDrafts writing a URL param → router re-runs renderSession) does
  // NOT relaunch the studio.
  if (session.id.startsWith("clip-studio-") && !clipStudio.isActive(session.id)) {
    if (consumeHandoff("pendingStartClipStudio"))
      clipStudio.start(session.id, { contextId: playbookForNewWork()?.id || null });
  }

  // Batch Studio — dedicated "Batch from a source" intake in its own `batch-*`
  // session. Same one-shot-handoff gate as Clip Studio so a re-render after the
  // user navigates away doesn't relaunch it. Pre-selects the default Playbook.
  if (session.id.startsWith("batch-") && !batchStudio.isActive(session.id)) {
    if (consumeHandoff("pendingStartBatch"))
      batchStudio.start(session.id, { contextId: playbookForNewWork()?.id || null });
  }

  renderTopbar({ crumb: session.name });

  // Resolution priority — URL state wins over the mock seed so wizard-
  // driven changes (save as new global) take effect immediately without
  // needing to mutate the mock object. Every chat references a single
  // global context (the local-context concept was removed):
  //  1. URL contextId       → getContextById (wizard "save as global", or
  //                                            initial nav with explicit param)
  //  2. session.contextId   → mock seed (initial state for s-acme-launch etc.)
  //  3. URL populated=1     → first global (legacy demo flag)
  //  4. null                → transient creation phase (wizard active, no
  //                                            context yet)
  // Filtered through the access layer at the last step: a chat whose Playbook
  // stopped being shared reads as a chat with NO Playbook attached — which is
  // exactly what it now is — rather than naming one it can't open. The chat
  // still knows the id (session.contextId is untouched), so revokedContextFor()
  // can still say what it lost.
  const resolvedContext = q.contextId
    ? getContextById(q.contextId)
    : session.contextId
      ? getContextById(session.contextId)
      : q.populated
        ? getContexts()[0]
        : null;
  const attachedContext = resolvedContext && canView(resolvedContext) ? resolvedContext : null;
  const hasContext = !!attachedContext;

  // Lot 13 — handoff alignment. The session screen is now a chat-only body
  // (full width assistant panel) with the right-panel overlay handling
  // Drafts / Ideas. The previous Content + Context workspace tabs were
  // dropped here: Content is covered by the standalone /sources + /ideas
  // routes (Lots 6 + 7), Context is reachable through the ContextDrawer
  // (Lot 8) — both via the sidebar nav, not as inline session workspace.
  // A chat whose Playbook stopped being shared can still be read, saved and
  // scheduled — it just can't produce anything new. The class dims the
  // generating affordances; the capture-phase guard in bindSession stops them.
  //
  // On <body>, not on the session root: the drafts panel is part of the app
  // shell and lives OUTSIDE #app, so a class on the section would leave every
  // "Generate an image" and "Rewrite" in the panel looking perfectly alive.
  const revoked = revokedContextFor(session);
  document.body.classList.toggle("playbook-revoked", !!revoked);
  target.innerHTML = html`
    <section class="screen session session--solo">${raw(renderAssistantPanel(session, attachedContext))}</section>
  `;

  bindSession(target, session);
  wireAssistantPanel(target, session, attachedContext);

  // Switching to a different chat: briefly show skeleton bubbles where the
  // conversation will land, so the swap reads as "loading this chat" rather
  // than an instant content pop. Only for a started conversation in the normal
  // layout (the helper self-skips the empty hero / wizard / clip-studio).
  if (isSessionSwitch) showSwitchSkeleton(target);

  // FIND-B: return a cleanup so the router tears down per-screen state on
  // route change (and not only on the next session mount). Without this,
  // navigating from /session/:id to /ideas left the assistant subscribers
  // wired against stale DOM nodes for the lifetime of the next route.
  return () => {
    document.body.classList.remove("playbook-revoked");
    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }
    if (currentListenerController) {
      currentListenerController.abort();
      currentListenerController = null;
    }
  };
}

// A conversation has "started" (→ show the thread + bottom composer instead of
// the empty "What are you working on?" hero) once any of these land: a real user
// message, the assistant-choice posted by a starter, a rich assistant variant,
// or a source intake (Batch-from-a-source handoff or an Add-source on a fresh
// chat). Shared by renderAssistantPanel (layout) and the offThread subscription
// (so the empty → started transition triggers a full re-render that adds the
// bottom composer).
function isThreadStarted(messages) {
  return (
    messages.some((m) => m.role === "user") ||
    messages.some((m) => m.role === "assistant-choice") ||
    messages.some((m) => m.role === "assistant" && m.variant) ||
    messages.some((m) => m.role === "source-intake")
  );
}

// Skeleton bubbles shown for a short beat when switching chats. Alternating
// assistant (left) / user (right) placeholders with a shimmer, so the
// conversation area reads as "loading" before the real thread swaps in.
// Render the skeleton into the thread, then restore the real content after a
// short delay. Synchronous innerHTML swap (before the browser paints) means the
// real thread never flashes first. Self-skips when there's no started thread to
// cover (empty hero, wizard, clip-studio — those layouts have no
// `.session__assistant-thread`, or carry the hero instead of a thread).
function showSwitchSkeleton(root) {
  const threadEl = root.querySelector(".session__assistant-thread[data-assistant-thread]");
  if (!threadEl) return;
  if (threadEl.querySelector("[data-empty-chat]")) return; // empty conversation — nothing to load
  const real = threadEl.innerHTML;
  threadEl.innerHTML = SWITCH_SKELETON_HTML;
  threadEl.classList.add("is-switching");
  window.setTimeout(() => {
    // Bail if the user switched again (this node was replaced/detached).
    if (!document.contains(threadEl)) return;
    threadEl.classList.remove("is-switching");
    threadEl.innerHTML = real;
    threadEl.scrollTop = threadEl.scrollHeight;
  }, 340);
}

function renderAssistantPanel(session, attachedContext) {
  const thread = getThread(session.id, { hasContext: !!attachedContext });

  // Clip Studio — dedicated full-page "Extract video clips" flow (upload →
  // analyzing → clips). Must precede the wizard / inline-question branches so
  // it owns the panel while active.
  if (clipStudio.isActive(session.id)) {
    return renderClipStudio(session, attachedContext);
  }
  // Batch Studio — dedicated full-page "Batch from a source" intake (upload 1+
  // sources + pick a Playbook → new chat). Owns the panel while active.
  if (batchStudio.isActive(session.id)) {
    return renderBatchStudio(session);
  }
  // Wizard mode — when sidebar-wizard has state for this session, replace the
  // normal thread + composer with the analyse-style wizard chrome.
  if (sidebarWizard.isActive(session.id)) {
    return renderAssistantPanelWizard(session);
  }
  // Top-posts milker — the winner-selection grid takes over the panel (like
  // Batch / Clip Studio) before any inline-question step kicks in.
  if (topPostsFlow.isPickerActive(session.id)) {
    return renderTopPostsPickerScreen(session);
  }
  // Inline single-question mode — same chrome as the wizard but for one-shot
  // pickers (e.g. "Which profile to draft for?").
  if (inlineQuestion.isActive(session.id)) {
    return renderAssistantPanelQuestion(session);
  }

  // Empty conversation = nothing has happened yet. Hides the empty hero once any
  // rich turn lands (user msg, assistant variant, the assistant-choice posted by
  // a starter, or a source landing) so the in-flight work stays visible across
  // remounts. See isThreadStarted.
  const isEmptyConversation = !isThreadStarted(thread);

  // The composer markup is the same regardless of where it appears — bottom
  // of the panel (default) or inline inside the empty hero. We render it
  // once and place it via `${composerMarkup}` so click handlers (delegated
  // on #app) keep working in both positions.
  const composerMarkup = renderComposer(attachedContext, session, isEmptyConversation);
  return html`
    <aside class="session__assistant" aria-label="Assistant panel">
      <div
        class="session__assistant-thread"
        id="assistantThread"
        data-assistant-thread
        aria-live="polite"
        aria-atomic="false"
      >
        ${isEmptyConversation
          ? raw(renderEmptyHero(session.id, composerMarkup, session))
          : raw(renderThread(thread, session.id))}
      </div>
      ${isEmptyConversation ? "" : raw(composerMarkup)}
    </aside>
  `;
}

// ─── Clip Studio / Batch studio ───────────────────────────────────────────
// Full-page stages rooted on `.session__assistant` (+ a `clip-studio--{stage}`
// modifier) so drag/drop binding and the refreshAssistantAside node-swap keep
// working. The Clip Studio's stages live in session/clip-studio-view.js; its
// state in clip-studio.js.

// context.color → DS color token for the pill dot (blue maps to the
// electric-blue ramp, matching the [data-context-color] pill tints).
const CONTEXT_DOT_TOKEN = { blue: "electric-blue" };
export function dotColorVar(colorName) {
  const token = CONTEXT_DOT_TOKEN[colorName] || colorName || "grey";
  return `var(--ref-color-${token}-100)`;
}

// Playbook control in the composer toolbar — matches the Figma form-select
// inline-label pattern (node 515:367): "Playbook" label + value + chevron,
// inside a .ap-select-trigger.
//   • selectable (New Chat / empty conversation) → a <details> wrapping the
//     .ap-select-trigger + .ap-select-dropdown. Picking a playbook routes
//     through the delegated [data-playbook-pick] handler in bindSession.
//   • static (active conversation) → a non-interactive .ap-select-trigger
//     in disabled state. No dropdown.
//   • workspace mode (flag playbookWorkspace) → nothing at all: the rail's
//     switcher is the one place the brand is named and chosen.
// Returns "" when there are no playbooks at all on a locked chat.
export function renderPlaybookControl(ctx, selectable) {
  // Workspace mode: nothing. The rail names the brand permanently, one row of
  // chrome above this one, so a pill in the composer toolbar would be the same
  // sentence twice — and it could only ever be the disabled half of the
  // control, since the question is answered before the chat exists.
  if (isWorkspaceMode()) return "";
  // Static indicator on active chats — only when a playbook is attached.
  if (!selectable) {
    if (!ctx) return "";
    return `
      <div class="composer-playbook" data-composer-playbook>
        <div
          class="ap-select-trigger disabled composer-playbook__trigger"
          data-context-color="${escapeHtml(ctx.color || "grey")}"
          title="Playbook: ${escapeHtml(ctx.name)}"
        >
          <span class="ap-select-inline-label">Playbook</span>
          <span class="ap-select-value">${escapeHtml(ctx.name)}</span>
        </div>
      </div>
    `;
  }

  // Selectable (New Chat) — always shown, even with no playbooks yet (then
  // the value placeholder reads "Select a playbook" and the dropdown offers
  // to create one).
  const playbooks = usableContexts();
  const items = playbooks
    .map((c) => {
      const cColor = c.color || "grey";
      const isSel = ctx && c.id === ctx.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-playbook-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="composer-context__dot" style="background: ${dotColorVar(cColor)};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select composer-playbook" data-composer-playbook>
      <summary class="ap-select-trigger composer-playbook__trigger" title="Choose the playbook for this chat">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown composer-playbook__dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
        <div class="ap-select-footer">
          <button type="button" class="ap-select-create" data-playbook-create>
            <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
            <span>Create a playbook</span>
          </button>
        </div>
      </div>
    </details>
  `;
}

// ── Composer mention picker ───────────────────────────────────────────
// Popup that floats above the composer card listing the session's
// sources + ideas. Picking one delegates to addComposerMention(name);
// the existing composer-mentions subscriber repaints the pill row.
//
// Triggered by:
//   • Click on the composer "@ Mention" toolbar button
//   • Typing "@" in the textarea
//
// Closed by:
//   • Picking an item
//   • Clicking outside the picker / trigger
//   • Pressing Escape

// Module-local index of the currently-highlighted row in the @mention
// picker — mirrors the search-modal pattern (search-modal.js). Arrow
// keys increment/decrement, Enter selects, mousemove syncs to row
// under the cursor. Reset to 0 every time the picker opens.
let mentionHighlightIndex = 0;

// The picker popup is shared between two modes:
//   • "mention" → "@" lists the session's sources + ideas (context pills).
//   • "command" → "/" lists CONNECTED connectors to ask via MCP.
// Keyboard nav / highlight / positioning are mode-agnostic (they operate
// on [data-mention-row-index] rows), so only the rendered body differs.
let pickerMode = "mention";

function renderMentionPickerInto(container, sessionId, mode = "mention") {
  if (!container) return;
  let cursor = 0;

  // "/" command mode — connectors render as a classic DS action-dropdown
  // (label + description + brand logo). Only connected connectors are
  // live/queryable.
  if (mode === "command") {
    // Compact single-line items (logo + name) — a classic DS dropdown.
    const renderItem = (iconHtml, name, dataAttr) => {
      const index = cursor++;
      return `
    <button
      type="button"
      class="ap-action-dropdown-item"
      role="option"
      tabindex="0"
      aria-selected="false"
      data-mention-row-index="${index}"
      ${dataAttr}
    >
      ${iconHtml}
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${escapeHtmlAttr(name)}</span>
        </div>
      </div>
    </button>
  `;
    };
    const connectors = getConnectedConnectors();
    container.innerHTML =
      connectors.length > 0
        ? `<div class="ap-action-dropdown" role="group">
            ${connectors
              .map((c) =>
                renderItem(renderConnectorLogo(c, 16), c.name, `data-mention-pick-connector="${escapeHtmlAttr(c.id)}"`),
              )
              .join("")}
          </div>`
        : `<div class="composer-mention-picker__empty muted">No connected connectors yet.</div>`;
    return;
  }

  // "@" mention mode — original custom picker (sources + ideas).
  const renderRow = (icon, name, kindLabel, dataAttr) => {
    const index = cursor++;
    return `
    <li
      class="composer-mention-picker__row"
      role="option"
      tabindex="0"
      data-mention-row-index="${index}"
      ${dataAttr}
    >
      <span class="composer-mention-picker__row-icon" aria-hidden="true">
        <i class="${icon}"></i>
      </span>
      <span class="composer-mention-picker__row-name">${escapeHtmlAttr(name)}</span>
      ${kindLabel ? `<span class="composer-mention-picker__row-kind muted">${escapeHtmlAttr(kindLabel)}</span>` : ""}
    </li>
  `;
  };
  const sources = getSources(sessionId).filter((s) => s.status !== "Processing");
  const ideas = getIdeas(sessionId);
  const sourcesSection =
    sources.length > 0
      ? `
        <div class="composer-mention-picker__section">
          <div class="composer-mention-picker__header">Reference a source</div>
          <ul class="composer-mention-picker__list" role="group">
            ${sources
              .map((s) =>
                renderRow(
                  "ap-icon-archie-official",
                  s.filename,
                  s.kind || "",
                  `data-mention-pick-source="${escapeHtmlAttr(s.id)}"`,
                ),
              )
              .join("")}
          </ul>
        </div>
      `
      : "";
  const ideasSection =
    ideas.length > 0
      ? `
        <div class="composer-mention-picker__section">
          <div class="composer-mention-picker__header">Reference an idea</div>
          <ul class="composer-mention-picker__list" role="group">
            ${ideas
              .map((i) =>
                renderRow(
                  "ap-icon-archie-official",
                  i.title,
                  i.kind || "",
                  `data-mention-pick-idea="${escapeHtmlAttr(i.id)}"`,
                ),
              )
              .join("")}
          </ul>
        </div>
      `
      : "";
  container.innerHTML =
    sourcesSection || ideasSection
      ? sourcesSection + ideasSection
      : `<div class="composer-mention-picker__empty muted">No sources or ideas yet.</div>`;
}

function openMentionPicker(root, sessionId, mode = "mention") {
  const picker = root.querySelector("[data-composer-mention-picker]");
  const trigger = root.querySelector("[data-composer-mention-trigger]");
  if (!picker) return;
  pickerMode = mode;
  // Command mode swaps the custom picker chrome for the DS dropdown's own
  // surface — the modifier strips this wrapper's box so they don't double up.
  picker.classList.toggle("composer-mention-picker--command", mode === "command");
  renderMentionPickerInto(picker, sessionId, mode);
  picker.hidden = false;
  mentionHighlightIndex = 0;
  syncMentionHighlight(picker);
  if (trigger) trigger.setAttribute("aria-expanded", "true");
}

function closeMentionPicker(root) {
  const picker = root.querySelector("[data-composer-mention-picker]");
  const trigger = root.querySelector("[data-composer-mention-trigger]");
  if (picker) {
    picker.hidden = true;
    picker.innerHTML = "";
  }
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

function toggleMentionPicker(root, sessionId) {
  const picker = root.querySelector("[data-composer-mention-picker]");
  if (!picker) return;
  if (picker.hidden) openMentionPicker(root, sessionId);
  else closeMentionPicker(root);
}

// Toggle .is-highlighted + aria-selected on the row at the current
// index. Scroll it into view so keyboard nav stays on screen.
function syncMentionHighlight(picker) {
  const rows = picker.querySelectorAll("[data-mention-row-index]");
  if (!rows.length) return;
  if (mentionHighlightIndex < 0) mentionHighlightIndex = rows.length - 1;
  else if (mentionHighlightIndex >= rows.length) mentionHighlightIndex = 0;
  rows.forEach((row) => {
    const idx = Number(row.dataset.mentionRowIndex);
    const active = idx === mentionHighlightIndex;
    // Mention rows use the custom .is-highlighted; the "/" command DS
    // dropdown uses the DS .focused state. Toggle both — each surface
    // only styles its own class, so the other is a harmless no-op.
    row.classList.toggle("is-highlighted", active);
    row.classList.toggle("focused", active);
    row.setAttribute("aria-selected", active ? "true" : "false");
    if (active) row.scrollIntoView({ block: "nearest" });
  });
}

// Click the row at the current highlight — selects + closes the
// picker via the existing pickSource / pickIdea click delegates.
function activateHighlightedMention(picker) {
  const rows = picker.querySelectorAll("[data-mention-row-index]");
  const row = rows[mentionHighlightIndex];
  if (row) row.click();
}

// Strip the "/" command trigger token from the textarea before attaching
// a connector, so the leftover "/" (and anything typed after it) doesn't
// pollute the message routed to the connector. Removes the "/" + the run
// of non-whitespace chars immediately preceding the caret.
function removeSlashToken(input) {
  if (!input) return;
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const stripped = before.replace(/\/\S*$/, "");
  if (stripped === before) return;
  const after = input.value.slice(caret);
  input.value = stripped + after;
  const pos = stripped.length;
  input.setSelectionRange(pos, pos);
}

// (The context pill that used to live here moved to the app header next
// to the chat title — see components/topbar.js → renderContextPill.)

// Wizard chrome — replaces the normal thread + suggestions + composer when
// sidebar-wizard is active. Reuses the analyse-* picker rendering and
// keyboard binding so the UX is identical to the standalone /analyse routes.
function renderAssistantPanelWizard(session) {
  const chrome = sidebarWizard.renderChrome(session.id);
  if (!chrome) return "";
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="sidebarWizardChat">
        <div class="analyse__chat-inner">${raw(chrome.body)}</div>
      </div>
      <div class="analyse__sticky-bar session__assistant-wizard-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(chrome.picker ? renderPicker(chrome.picker) : "")}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </aside>
  `;
}

// Inline question chrome — same shell as the wizard but for one-shot pickers.
function renderAssistantPanelQuestion(session) {
  const chrome = inlineQuestion.renderChrome(session.id);
  if (!chrome) return "";
  // The full assistant thread is rendered above the picker so the
  // wizard reads as a real conversation — each pick / submit posts a
  // user-turn and each AI prompt posts an assistant-turn, all visible
  // and scrollable. `chrome.body` (the current question's intro) is
  // only appended when callers chose to pass `intro:` to
  // inlineQuestion.ask; with the conversational pattern (post the
  // prompt via postAssistantMessage instead) it stays empty.
  const thread = getThread(session.id);
  // The thread container carries `data-assistant-thread` so the assistant
  // subscriber in wireAssistantPanel repaints it on new turns (postUserTurn /
  // postAssistantMessage / postSystemNotice during a wizard step). Without
  // it, new messages would be invisible until the picker state next changes.
  // `chrome.body` (legacy intro) sits in its own sibling div so the
  // subscriber can swap the thread innerHTML without nuking it — most modern
  // callers leave chrome.body empty by passing the prompt through
  // postAssistantMessage instead.
  //
  // First Time User ALT — when the chat is mounted inside a
  // /session/welcome-alt-* route, prepend a marketing hero (eyebrow +
  // headline + paragraph) above the chat thread so the entry feels less
  // bare than the standalone conversational layout. Reuses the
  // `.welcome-hero` block from welcome.css for layout + typography
  // (flex column, gap, 520px reading width); `.welcome-alt-hero` only
  // owns the outer positioning inside the wizard aside (column width
  // matching .analyse__chat-inner + top/bottom padding).
  const isWelcomeAlt = session.id.startsWith("welcome-alt-");
  const heroMarkup = isWelcomeAlt
    ? html`
        <header class="welcome-alt-hero">
          <span class="welcome-alt-hero__orb" aria-hidden="true"></span>
          <div class="welcome-hero welcome-hero--alt">
            <span class="welcome-hero__eyebrow">
              <i class="ap-icon-archie-official" aria-hidden="true"></i>
              Welcome
            </span>
            <h1 class="welcome-hero__title">Let's understand<br />your brand.</h1>
            <p class="welcome-hero__sub">
              Point me at your website and I'll capture what makes your brand yours — then shape it into a Playbook that
              guides every post toward your voice.
            </p>
            <ul class="welcome-alt-hero__chips" aria-hidden="true">
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
                Voice
              </li>
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-multiple-users" aria-hidden="true"></i>
                Audience
              </li>
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-image" aria-hidden="true"></i>
                Brand colors
              </li>
            </ul>
          </div>
        </header>
      `
    : "";
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="inlineQuestionChat">
        ${raw(heroMarkup)}
        <div class="analyse__chat-inner">
          <div data-assistant-thread>${raw(renderThread(thread, session.id))}</div>
          ${raw(chrome.body)}
        </div>
      </div>
      <div class="analyse__sticky-bar session__assistant-wizard-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(chrome.picker ? renderPicker(chrome.picker) : "")}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </aside>
  `;
}

// Build + show the "What would you like to know about this source?" inline
// question. Triggered after the user clicks "Ask" on a source card and
// picks the chat to ask in. Suggested prompts + a free-text custom row.
function askWhatToKnow(sessionId, filename, sourceId = null) {
  // Echo the chosen source as a selection card so the pick stays visible.
  const src = sourceId ? getStreamSources(sessionId).find((s) => s.id === sourceId) : null;
  postSelectionEcho(sessionId, {
    icon: fileIconForKind(src?.kind),
    title: filename || "this source",
    meta: src?.kind ? `${src.kind} source` : "Source",
  });
  postAssistantMessage(
    sessionId,
    `What would you like to know about ${src ? `[[source:${src.id}]]` : escapeHtml(filename || "this source")}?`,
  );
  inlineQuestion.ask(sessionId, {
    title: filename || "About this source",
    stepLabel: "Source",
    items: [
      { value: "What's the main takeaway?", label: "What's the main takeaway?", icon: "ap-icon-archie-official" },
      { value: "Summarize this in 3 bullet points.", label: "Summarize in 3 bullets", icon: "ap-icon-numbered-list" },
      { value: "Find a contrarian angle worth posting.", label: "Find a contrarian angle", icon: "ap-icon-bolden" },
    ],
    customPlaceholder: "Type your own question…",
    onPick: (text) => sendMessage(sessionId, text),
    onCustom: (text) => sendMessage(sessionId, text),
    onSkip: () => {},
  });
}

// "Delete all the drafts" — a destructive, irreversible ask, so I confirm it in
// the chat (Quickpicker) instead of acting on the sentence. Same set the Drafts
// panel shows (scheduled posts have left it). No undo: the confirm is the guard.
const DELETE_DRAFTS = /\b(delete|remove|clear|trash|erase)\b.*\bdrafts?\b/i;

function confirmDeleteDrafts(sessionId, drafts, { all = false } = {}) {
  const n = drafts.length;
  // Every draft: a count says it. A selection: name them, one per line.
  postAssistantMessage(
    sessionId,
    all
      ? `This deletes ${n === 1 ? "the only draft" : `all ${n} drafts`} in this chat. Should I go ahead?`
      : `This deletes ${n === 1 ? "this draft" : `these ${n} drafts`}:${drafts.map((d) => `\n- [[post:${d.id}]]`).join("")}`,
  );
  inlineQuestion.ask(sessionId, {
    title: n === 1 ? "Delete this draft?" : `Delete ${n} drafts?`,
    subtitle: "This can't be undone.",
    stepLabel: "Confirm",
    // No rows — the two answers are the footer's buttons, bottom-right. The
    // delete is red: a destructive answer in the chat reads as one (the DS red
    // button, stroked — there is no filled red to take).
    items: [],
    actions: [
      { value: "keep", label: "Keep them" },
      { value: "delete", label: n === 1 ? "Delete the draft" : `Delete ${n} drafts`, danger: true },
    ],
    onPick: (choice) => {
      // The answer stays visible in the thread, like any pick.
      postUserTurn(
        sessionId,
        choice === "delete" ? (n === 1 ? "Delete the draft" : `Delete ${n} drafts`) : "Keep them",
      );
      if (choice !== "delete") {
        postAssistantMessage(sessionId, "Okay, I kept them.");
        return;
      }
      for (const post of drafts) removePost(sessionId, post.id);
      const label = n === 1 ? "1 draft" : `${n} drafts`;
      postAssistantMessage(sessionId, `Done, I deleted ${label}.`);
    },
  });
}

// "Schedule all the drafts" — I don't schedule on a sentence: I lay out the plan
// in the chat (each draft, the date I'd give it — the schedule modal's engine,
// so the same dates it would open on), then ask. Schedule commits it as the
// Drafts panel does; Adjust dates opens the modal on the same drafts.
const SCHEDULE_DRAFTS = /\bschedule\b.*\bdrafts?\b/i;
const IMAGE_FOR_DRAFT = /\b(add|make|create|generate)\b.*\b(image|visual|picture)\b.*\b(draft|post)\b/i;
// "all" / "every" names the whole set; anything else ("schedule some drafts",
// "delete a draft") is a selection, so I ask which.
const ALL_OF_THEM = /\b(all|every|each)\b/i;

// The drafts asks I handle in the chat instead of the scripted reply. Returns
// true when it took the message.
function routeDraftsAsk(session, text) {
  const intent = DELETE_DRAFTS.test(text)
    ? "delete"
    : SCHEDULE_DRAFTS.test(text)
      ? "schedule"
      : IMAGE_FOR_DRAFT.test(text)
        ? "image"
        : null;
  if (!intent) return false;
  const sessionId = session.id;
  postUserTurn(sessionId, text);
  const drafts = getPosts(sessionId).filter((p) => p.status !== "scheduled");
  if (!drafts.length) {
    postAssistantMessage(
      sessionId,
      `There are no drafts in this chat to ${intent === "image" ? "illustrate" : intent}.`,
    );
    return true;
  }
  const all = ALL_OF_THEM.test(text);
  if (intent === "image") {
    if (drafts.length === 1) imageForDraft(sessionId, drafts[0]);
    else askWhichDrafts(sessionId, drafts, { verb: "image", onPick: ([d]) => imageForDraft(sessionId, d) });
  } else if (all || drafts.length === 1) {
    if (intent === "delete") confirmDeleteDrafts(sessionId, drafts, { all: true });
    else proposeSchedule(session, drafts);
  } else {
    askWhichDrafts(sessionId, drafts, {
      verb: intent,
      onPick: (picked) =>
        intent === "delete" ? confirmDeleteDrafts(sessionId, picked) : proposeSchedule(session, picked),
    });
  }
  return true;
}

// "Which drafts?" — the posts Quickpicker: the drafts as the thread lists them
// (network glyph + reference, previewed on hover), multi for schedule / delete,
// single for an image. Nothing pre-selected.
function askWhichDrafts(sessionId, drafts, { verb, onPick }) {
  const multi = verb !== "image";
  const copy = {
    schedule: { q: "Which drafts should I schedule?", cta: "Schedule", tone: "orange" },
    delete: { q: "Which drafts should I delete?", cta: "Delete" },
    image: { q: "Which draft should I make an image for?", cta: "Continue" },
  }[verb];
  postAssistantMessage(sessionId, copy.q);
  inlineQuestion.ask(sessionId, {
    title: copy.q,
    subtitle: multi ? "Pick one or more." : null,
    stepLabel: "Drafts",
    variant: "posts",
    multi,
    single: !multi,
    items: drafts.map((d) => ({
      value: d.id,
      label: escapeHtml(refLabel("post", d)),
      icon: networkIcon(d.network),
      sessionId,
    })),
    submitLabel: copy.cta,
    submitTone: copy.tone,
    skipLabel: "Not now",
    onPick: (value) => {
      const ids = Array.isArray(value) ? value : [value];
      const picked = drafts.filter((d) => ids.includes(d.id));
      if (!picked.length) return;
      // The pick stays visible as what was picked — one echo card per draft
      // (network glyph, its opening words, "<Network> draft"), not a sentence.
      for (const d of picked) {
        postSelectionEcho(sessionId, {
          icon: networkIcon(d.network),
          title: refLabel("post", d).split(" · ").slice(1).join(" · ") || refLabel("post", d),
          meta: `${networkLabel(d.network)} draft`,
        });
      }
      onPick(picked);
    },
    onSkip: () => postAssistantMessage(sessionId, "Okay, I'll leave them as they are."),
  });
}

// An image for one draft — the Drafts panel's own image action, so the chat
// and the panel make it the same way (the Image Generator's questions under
// sexySquirrel, a one-click image otherwise).
function imageForDraft(sessionId, draft) {
  postAssistantMessage(sessionId, `Let's make an image for [[post:${draft.id}]].`);
  focusInPanel("post", draft.id);
  onPostImage(draft.id);
}

const planDay = (ts) => new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const planTime = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const postsWord = (n) => (n === 1 ? "1 post" : `${n} posts`);

function proposeSchedule(session, drafts) {
  const sessionId = session.id;
  const n = drafts.length;
  const strategy = defaultStrategy(session.contextId);
  const slots = planSlots(drafts, strategy).sort((a, b) => a.when - b.when);
  const first = slots[0].when;
  const last = slots[slots.length - 1].when;

  // How I picked, in one sentence — the modal's closed-settings sentence.
  const nets = [...new Set(drafts.map((p) => networkLabel(p.network)))];
  const best = nets.length === 1 ? `${nets[0]}'s best time` : "each network's best time";
  const cadence = (CADENCES.find((c) => c.id === strategy.cadence) || CADENCES[0]).label.toLowerCase();
  const intro =
    n === 1
      ? `Here's when I'd post it: ${planDay(first)}, at ${best}.`
      : `Here's when I'd post them: ${cadence} from ${planDay(strategy.startFrom)}, each at ${best}, around what's already scheduled.`;
  const days = Math.round((new Date(last).setHours(0, 0, 0, 0) - new Date(first).setHours(0, 0, 0, 0)) / 86400000) + 1;
  const summary =
    n === 1
      ? `<strong>${planDay(first)}</strong> at ${planTime(first)}`
      : `<strong>${postsWord(n)} over ${days} ${days === 1 ? "day" : "days"}</strong> · ${planDay(first)} – ${planDay(last)}`;

  const planId = postSchedulePlan(sessionId, {
    intro,
    summary,
    rows: slots.map((s) => ({
      postId: s.post.id,
      network: s.post.network,
      label: refLabel("post", s.post),
      when: s.when,
    })),
  });

  inlineQuestion.ask(sessionId, {
    title: `Schedule ${postsWord(n)}?`,
    subtitle: "Posts will publish to your connected accounts.",
    stepLabel: "Schedule",
    items: [],
    skipLabel: "Not now",
    actions: [
      { value: "adjust", label: "Adjust dates", stroked: true },
      { value: "schedule", label: `Schedule ${postsWord(n)}`, primary: true, tone: "orange" },
    ],
    onPick: (choice) => {
      postUserTurn(sessionId, choice === "schedule" ? `Schedule ${postsWord(n)}` : "Adjust dates");
      if (choice === "adjust") {
        postAssistantMessage(sessionId, "I opened the planner on the same dates. Change any of them, then schedule.");
        openPlanInModal(sessionId, planId);
        return;
      }
      addToQueue(queueEntries(slots));
      for (const post of drafts) removePost(sessionId, post.id);
      finishSchedulePlan(sessionId, planId, slots);
    },
    onSkip: () => {
      setSchedulePlanStatus(sessionId, planId, "dismissed");
      postAssistantMessage(sessionId, "Okay, they stay in your drafts.");
    },
  });
}

function finishSchedulePlan(sessionId, planId, slots) {
  setSchedulePlanStatus(sessionId, planId, "scheduled");
  const sorted = [...(slots || [])].sort((a, b) => a.when - b.when);
  const firstAt = sorted[0]?.when;
  const n = sorted.length;
  postAssistantMessage(
    sessionId,
    firstAt
      ? `Done, I scheduled ${postsWord(n)}. The first goes out ${planDay(firstAt)} at ${planTime(firstAt)}.`
      : "Done, they're scheduled.",
  );
}

// The plan's drafts in the schedule modal — from "Adjust dates", or straight
// from a date in the plan (the quick way to change one). Scheduling there
// settles the plan, and the plan's question if it's still open.
function openPlanInModal(sessionId, planId) {
  const plan = getThread(sessionId).find((m) => m.id === planId);
  if (!plan) return;
  const posts = plan.rows.map((r) => getPosts(sessionId).find((p) => p.id === r.postId)).filter(Boolean);
  if (!posts.length) return;
  openScheduleForPosts(sessionId, posts, (slots) => {
    if (inlineQuestion.isActive(sessionId)) inlineQuestion.exit(sessionId);
    finishSchedulePlan(sessionId, planId, slots);
  });
}

// Confirm prompt before editing a section of a global context. Contexts
// are now always shared — any edit propagates to every chat using the
// context — so we surface that explicitly before launching the wizard.
// Cancel quietly drops the request; Continue runs the section wizard.
function startEditConfirmPrompt(session, section, ctxId) {
  const sectionTitle = section === "voice" ? "Voice profile" : section === "brief" ? "Brief" : "Branding";
  postAssistantMessage(
    session.id,
    `Editing the ${sectionTitle.toLowerCase()} will apply to every chat using this Playbook.`,
  );
  inlineQuestion.ask(session.id, {
    title: `Edit the ${sectionTitle}?`,
    stepLabel: "Confirm",
    items: [
      {
        value: "continue",
        label: `Yes, edit ${sectionTitle}`,
        caption: "Open the editor. Changes apply to every chat using this Playbook.",
        icon: "ap-icon-check",
      },
      {
        value: "cancel",
        label: "Cancel",
        caption: "Leave the Playbook as is.",
        icon: "ap-icon-close",
      },
    ],
    onPick: (choice) => {
      if (choice === "continue") startSectionEdit(session, section, ctxId);
    },
    onSkip: () => {},
  });
}

// Single-stage wizard for editing one section of an attached context.
// skipMemorize bypasses the save/name prompt — we're editing an existing
// global, not creating a new one. On completion we bump the global's
// updatedAt timestamp so the "Updated …" subline in consumers refreshes.
function startSectionEdit(session, section, contextId) {
  sidebarWizard.startWizard(session.id, {
    stages: [section],
    skipMemorize: true,
    onComplete: () => {
      const sectionTitle = section === "voice" ? "Voice profile" : section === "brief" ? "Brief" : "Branding";
      if (contextId) updateContext(contextId, { updatedAt: "just now" });
      postAssistantMessage(session.id, `${sectionTitle} updated in every chat that uses this Playbook.`);
    },
  });
}

// Triggered from a source card's "Ask" button — routes through the chat
// picker the same way "Draft Post" does, then the chosen session shows
// the askWhatToKnow inline question.
function startAskFlowFromSession(sessionId, sourceId, filename) {
  const handoff = (choice) => {
    if (choice.kind === "existing" && choice.session.id === sessionId) {
      // Already in the picked chat — skip the navigation and ask now.
      askWhatToKnow(sessionId, filename, sourceId);
      return;
    }
    setHandoff("pendingAskSource", { sourceId, filename });
    if (choice.kind === "new") {
      const qs = new URLSearchParams({ tab: "posts", title: defaultChatNameLocal() });
      navigate(`/session/new?${qs.toString()}`);
    } else {
      navigate(`/session/${choice.session.id}?tab=posts`);
    }
  };
  if (getSessions().length === 0) {
    handoff({ kind: "new" });
  } else {
    openChatPickerModal({ onPick: handoff });
  }
}

// Provenance for a draft cut from a video clip → the collapsible "Generation
// context" panel (post-card.js): the clip it was generated from as the
// headline + the source video it was cut out of. Mirrors ideaContext /
// repurposeContext in draft-flow / top-posts-flow.
// Local copy of dashboard's defaultChatName — keeps session.js standalone
// without a circular import for a 5-line helper.
function defaultChatNameLocal() {
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat · ${fmt.format(new Date())}`;
}

// ── The composer's Topic pick lands ────────────────────────────────────────
// The inline "Pick from the Topic Feed" widget was confirmed. Mark the Topic Used
// and attach it as a source to THIS chat — the same attachTopicToChat the handoff
// path runs at mount, so the source-intake card, the Sources panel and every
// downstream verb light up with no special case — then ask what to do with it.
//
// Mirrors the top-posts confirm (data-topposts-widget-confirm) in two ways: no
// echo turn, because the frozen widget already shows the pick and the intake
// card names the Topic again; and the tail is a Quickpicker, the same shape as
// askVideoIntake, because a Topic that has just landed is a source the reader
// has not yet said what to do with.
function finishTopicPick(session, topicId) {
  const topic = topicId ? getTopicById(topicId) : null;
  if (!topic) {
    postAssistantMessage(session.id, "That Topic isn't in the feed anymore.");
    return;
  }
  // The generating hooks' revoked-Playbook refusal is a click-CAPTURE guard on
  // the card buttons; a programmatic tail walks straight past it, so it is
  // repeated here with the same words.
  const revoked = revokedContextFor(session);
  if (revoked) {
    showToast(`I can't — ${revoked.ownerName} stopped sharing ${revoked.name}.`, { variant: "error" });
    return;
  }
  markUsed(topic.id);
  // addReadySource dedupes on the id SILENTLY, so a second pick of the same Topic
  // would look like nothing happened. Say it instead — and still offer the next
  // step, since the source is there either way.
  const already = getStreamSources(session.id).some((s) => s.id === topic.id);
  if (already) showToast("Already in this chat's sources.");
  else attachTopicToChat(session.id, topic.id);

  // The Topic is a source of this chat now, so it's named as one: an inline
  // reference (chat-refs.js), previewed on hover.
  postAssistantMessage(session.id, `[[source:${topic.id}]] is in this chat as a source. What should I do with it?`);
  inlineQuestion.ask(session.id, {
    title: "Next step",
    stepLabel: "Topic",
    skipLabel: "Not now",
    items: [
      {
        value: "extract",
        label: "Extract ideas",
        caption: "Pull the angles worth posting into your Ideas.",
        icon: "ap-icon-sparkles",
      },
      {
        value: "draft",
        label: "Draft a post",
        caption: "Extract the lead idea and draft from it right away.",
        icon: "ap-icon-pen",
      },
      {
        value: "ask",
        label: "Ask about it",
        caption: "Question the Topic before deciding.",
        icon: "ap-icon-single-chat-bubble",
      },
    ],
    onPick: (value) => {
      const src = getStreamSources(session.id).find((s) => s.id === topic.id);
      if (!src) return;
      if (value === "extract") {
        // The source card's own "Extract more ideas", verbatim.
        postUserTurn(session.id, "Extract ideas");
        appendExtractedIdeas(session.id, [src]);
      } else if (value === "draft") {
        // There is no source-level draft entry — drafting starts from an IDEA
        // (startIdeaDraft). One source yields exactly one idea, so extract, then
        // draft from the idea it produced.
        postUserTurn(session.id, "Draft a post");
        appendExtractedIdeas(session.id, [src], (created) => {
          if (created?.[0]) startIdeaDraft(session.id, created[0].id);
        });
      } else if (value === "ask") {
        // askWhatToKnow posts its own selection echo.
        askWhatToKnow(session.id, src.filename, src.id);
      }
    },
    onSkip: () => {},
  });
}

// Drag-and-drop a file anywhere on the assistant panel → kicks off the
// upload pipeline directly (no modal). Matches the handoff "drop a file
// anywhere to add it as a source" hint shown under the composer. Files
// that don't classify (wrong extension, too big) fall back to the Add
// Source modal so the user gets the explicit error UX.
//
// Called from wireAssistantPanel on first mount AND from
// refreshAssistantAside after each wholesale swap of the
// `.session__assistant` element (FIND-A).
function bindDragAndDrop(aside, session) {
  if (!aside) return;
  let dragDepth = 0;
  aside.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    dragDepth += 1;
    aside.classList.add("is-drop-target");
  });
  aside.addEventListener("dragover", (event) => {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  aside.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) aside.classList.remove("is-drop-target");
  });
  aside.addEventListener("drop", (event) => {
    if (!event.dataTransfer || !event.dataTransfer.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    aside.classList.remove("is-drop-target");
    const files = Array.from(event.dataTransfer.files);
    // Clip Studio upload stage — route the dropped video into the studio flow
    // instead of the normal source intake (no "what to do with this video?").
    if (clipStudio.isActive(session.id) && clipStudio.getState(session.id)?.stage === "upload") {
      if (files[0]) handleClipStudioFile(session, files[0]);
      return;
    }
    // Batch Studio upload screen — stage dropped files (multi) instead of the
    // normal in-session source intake.
    if (batchStudio.isActive(session.id)) {
      handleBatchFiles(session, files);
      return;
    }
    let started = 0;
    let firstReject = null;
    for (const file of files) {
      const classification = classifyFile(file);
      if (classification.ok) {
        startFileUpload(file, classification, session.id);
        started += 1;
      } else if (!firstReject) {
        firstReject = classification.reason;
      }
    }
    if (started > 0) {
      showToast(
        started === 1 ? `Uploading "${files[0].name}"…` : `Uploading ${started} file${started === 1 ? "" : "s"}…`,
      );
    }
    if (firstReject) {
      // Fall back to the modal so the user sees the explicit error UX
      // and can retry with a supported file.
      openAddSourceModal({ tab: "upload" });
    }
  });
}

function wireAssistantPanel(root, session, attachedContext) {
  // Tear down any subscriptions attached to the previous render.
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  stopThinkingTimer();

  // The assistant aside (and thread inside it) gets replaced wholesale
  // when sidebarWizard / inlineQuestion subscribers re-render the panel.
  // Querying lazily inside the subscriber keeps writes hitting the live
  // DOM node instead of an orphaned one.
  const getThreadEl = () => root.querySelector("[data-assistant-thread]");
  {
    const thread = getThreadEl();
    if (thread) {
      queueMicrotask(() => {
        thread.scrollTop = thread.scrollHeight;
      });
    }
  }

  // Arm the "taking longer than expected" watchdog for any loading turn carried
  // over from a prior render. The composer status bar itself is painted
  // declaratively by renderComposerStatus on each render, so no imperative sync
  // is needed here.
  updateLoadingWatchdog(session.id);

  // Composer mentions — the floating status card pushes source mentions
  // here via the composer-mentions store. Render once on mount, then
  // re-render on store updates (per-session subscription).
  const mentionsContainer = root.querySelector("[data-composer-mentions]");
  renderComposerMentions(mentionsContainer, session.id);
  const unsubMentions = subscribeComposerMentions(session.id, () => {
    renderComposerMentions(root.querySelector("[data-composer-mentions]"), session.id);
  });

  // Composer connector chip — "Ask a connector" attaches the connector here;
  // render once on mount, then re-render (and focus) when the active connector
  // changes. The submit handler routes the next message to it.
  renderComposerConnector(root, session.id);
  const unsubConnector = subscribeComposerConnector(session.id, () => {
    renderComposerConnector(root, session.id, { focus: true });
  });

  // Subscribe to the assistant thread.
  // When a NEW draft message lands we auto-open the right panel in Drafts
  // mode pinned to that batch — matches the handoff App.jsx "if the reply
  // has a batch, set activeBatchRef and switch to drafts" rule (§ State
  // Management → send transitions).
  //
  // Seed from the existing latest draft so a fresh renderSession (e.g. after
  // a panel-driven URL change) doesn't treat the seeded "drafts ready" turn
  // as new and re-trigger openDraftsPanel → URL write → re-render → loop.
  const seededLatestDraft = [...getThread(session.id)].reverse().find((m) => m.variant === "draft");
  let lastDraftMessageId = seededLatestDraft?.id || null;
  const seededLatestExtraction = [...getThread(session.id)].reverse().find((m) => m.variant === "extraction");
  let lastExtractionMessageId = seededLatestExtraction?.id || null;
  // Track whether we've already crossed the empty → started boundary (see
  // isThreadStarted). The first time we cross it the layout changes shape — the
  // empty hero (with its inline composer) gives way to the thread + a bottom
  // composer — so we must re-render the whole aside, not just repaint the thread
  // in place (which would drop the composer). Covers a first user message AND a
  // source landing (Batch-from-a-source / Add-source on a fresh chat).
  let threadStartedSeen = isThreadStarted(getThread(session.id));
  // Reconcile the single composer status slot (grey in-progress / green ready /
  // none) against the live state, reusing the enter/exit animations. The
  // data-status-key makes per-tick updates cheap and jank-free: same key → no-op
  // (source/clip tickers advance without re-animating); same variant, changed
  // text → in-place update; variant swap (grey↔green) → in-place markup swap, no
  // re-collapse; appear/disappear → animate in/out.
  const syncComposerStatus = () => {
    const inner = root.querySelector(".session__composer-inner");
    if (!inner) return;
    const existing = inner.querySelector(".session__composer-status");
    const status = computeComposerStatus(session.id);
    if (!status) {
      // Re-sync once the exit completes: if a new state became desired while the
      // bar was leaving (e.g. drafts land just as "Thinking…" clears), this
      // re-inserts it — covering the grey→green handoff across two notifies.
      if (existing && !existing.classList.contains("is-leaving")) {
        animateBannerOut(existing, () => syncComposerStatus());
      }
      return;
    }
    if (existing && !existing.classList.contains("is-leaving")) {
      if (existing.dataset.statusKey === status.key) return; // unchanged → no-op
      if (existing.dataset.statusShape === status.shape) {
        // Same shape, new text — update in place, no re-entrance.
        if (status.shape === "drafts") {
          const flow = existing.querySelector(".flow");
          if (flow) flow.innerHTML = draftBannerFlowInner(status.count);
        } else if (status.shape === "ideas") {
          const flow = existing.querySelector(".flow");
          if (flow) flow.innerHTML = ideaBannerFlowInner(status.count);
        } else {
          const label = existing.querySelector("[data-status-label]");
          if (label) label.textContent = status.label;
        }
        existing.dataset.statusKey = status.key;
        return;
      }
      // Shape swap (grey↔drafts↔ideas): replace markup in place, stay visible.
      existing.outerHTML = renderComposerStatus(session.id);
      return;
    }
    if (existing) return; // mid-exit; let it finish (a later tick re-inserts)
    const card = inner.querySelector(".session__composer-card");
    if (!card) return;
    card.insertAdjacentHTML("beforebegin", renderComposerStatus(session.id));
    animateBannerIn(inner.querySelector(".session__composer-status"));
  };
  const offThread = subscribe(session.id, (messages) => {
    const thread = getThreadEl();
    if (thread) {
      thread.innerHTML = renderThread(messages, session.id);
      thread.scrollTop = thread.scrollHeight;
    }
    // In wizard layouts the actual scroll container is the wizard chat
    // wrapper, not the [data-assistant-thread] inner div — scroll it
    // explicitly so newly posted turns stay pinned to the bottom.
    const wizardChat = root.querySelector("#inlineQuestionChat, .session__assistant-wizard-chat");
    if (wizardChat) wizardChat.scrollTop = wizardChat.scrollHeight;
    updateLoadingWatchdog(session.id);
    // In Clip Studio's clips stage the composer is already locked
    // (selectable=false) and a full aside re-render would rebuild the clip
    // grid + thread, fighting this subscription's in-place thread repaint.
    // Skip the first-start refresh there.
    if (!threadStartedSeen && isThreadStarted(messages)) {
      threadStartedSeen = true;
      if (!clipStudio.isActive(session.id)) refreshAssistantAside();
    }
    const latestDraft = [...messages].reverse().find((m) => m.variant === "draft");
    if (latestDraft && latestDraft.id !== lastDraftMessageId) {
      lastDraftMessageId = latestDraft.id;
      // Drafts ready — notify without hijacking the conversation or forcing the
      // panel open. A toast (auto-dismiss) + the persistent topbar Drafts count
      // do the announcing; "Review" opens the panel pinned to this batch.
      const n = latestDraft.count ?? (latestDraft.drafts ? latestDraft.drafts.length : 0);
      showToast(`${n} draft${n === 1 ? "" : "s"} ready to review`, {
        action: {
          label: "Review",
          onClick: () => openDraftsPanel({ sessionId: session.id, messageId: latestDraft.id }),
        },
      });
      // Second, persistent surface (until reviewed): the green DS status bar.
      // Skip it if the user is already in the Drafts panel. The actual bar
      // reconcile happens once below — after draftBanners is set — so a grey
      // in-progress bar swaps straight to green (no flicker).
      if (getRightPanelMode() !== "drafts") {
        draftBanners.set(session.id, { batchId: latestDraft.id, count: n, at: Date.now() });
      }
    }
    // Ideas extracted — mirror the drafts bar: a persistent green "N ideas
    // ready" bar (until the Ideas panel is opened), in addition to the
    // "N ideas ready" snackbar fired centrally by postExtractionResult.
    const latestExtraction = [...messages].reverse().find((m) => m.variant === "extraction");
    if (latestExtraction && latestExtraction.id !== lastExtractionMessageId) {
      lastExtractionMessageId = latestExtraction.id;
      const n = latestExtraction.count ?? (latestExtraction.ideas ? latestExtraction.ideas.length : 0);
      if (getRightPanelMode() !== "ideas") {
        ideaBanners.set(session.id, { count: n, at: Date.now() });
      }
    }
    // Reconcile the composer status bar against the new thread state (grey
    // in-progress / green ready / none) — once per thread change.
    syncComposerStatus();
  });

  // Subscribe to the right-panel state — when the active batch flips or the
  // panel opens/closes, the in-thread Drafts summary card needs to swap its
  // .is-active visual. Cheaper than re-rendering everything: just repaint
  // the thread.
  const offRightPanel = subscribeRightPanel(() => {
    const thread = getThreadEl();
    if (!thread) return;
    const messages = getThread(session.id);
    thread.innerHTML = renderThread(messages, session.id);
    // Drafts panel opened some other way (e.g. topbar pill) while the green bar
    // is up → the batch is being reviewed; drop it and reconcile (the bar exits,
    // or flips to grey if background work is still running). The bar's own Review
    // deletes the entry first, so this is a no-op for that path.
    if (getRightPanelMode() === "drafts" && draftBanners.has(session.id)) {
      draftBanners.delete(session.id);
      syncComposerStatus();
    }
    // Same lifecycle for the ideas bar — opening the Ideas panel clears it.
    if (getRightPanelMode() === "ideas" && ideaBanners.has(session.id)) {
      ideaBanners.delete(session.id);
      syncComposerStatus();
    }
  });

  // The library subscription used to re-render the in-session Content tab.
  // Lot 13 dropped that tab — now /sources, /ideas (standalone routes) own
  // the rendering. Keep a no-op offLibrary so the unsubscribe slot in
  // currentUnsubscribe stays the same shape.
  const offLibrary = () => {};

  // Subscribe to sidebar-wizard state — when state changes, re-render the
  // entire assistant panel (wizard chrome <-> normal thread+composer) and
  // re-bind keyboard nav for the wizard picker.
  const rebindWizardKeyboardIfActive = () => {
    rebindWizardKeyboard(root.querySelector(".session__assistant"), session.id);
  };
  const refreshAssistantAside = () => {
    const aside = root.querySelector(".session__assistant");
    const screen = aside?.parentElement;
    if (screen) {
      // Recompute the attached playbook from the live state so a pill the
      // user picked (which set session.contextId) survives the empty→active
      // re-render — not the stale value captured when the panel first mounted.
      const liveQ = readQuery();
      const liveCtx = liveQ.contextId
        ? getContextById(liveQ.contextId)
        : session.contextId
          ? getContextById(session.contextId)
          : attachedContext;
      const fresh = renderAssistantPanel(session, liveCtx);
      const tmp = document.createElement("div");
      tmp.innerHTML = fresh;
      const newAside = tmp.firstElementChild;
      if (newAside && aside) {
        screen.replaceChild(newAside, aside);
      }
    }
    rebindWizardKeyboardIfActive();
    // The previous aside was swapped wholesale — re-bind drag/drop on the
    // fresh element. Without this, dropping a file after any wizard
    // refresh became a silent no-op (FIND-A).
    bindDragAndDrop(root.querySelector(".session__assistant"), session);
    // Wizard chat (inline-question / sidebar-wizard layouts) renders the
    // full thread above the picker — keep it pinned to the bottom on every
    // re-render so newly posted turns stay in view. Uses queueMicrotask so
    // it runs after the DOM swap above has committed.
    queueMicrotask(() => {
      const wizardChat = root.querySelector("#inlineQuestionChat, .session__assistant-wizard-chat");
      if (wizardChat) wizardChat.scrollTop = wizardChat.scrollHeight;
    });
  };
  // Top-posts board — a filter/sort/selection change only needs the board grid
  // repainted, so swap just the `.top-posts-board` subtree in place. Re-rendering
  // the whole aside (like the wizard subscription) would re-mount the intro +
  // workflow-flow steps and replay their entrance animation on every checkbox
  // toggle. Falls back to a full refresh on first open (board not mounted yet)
  // and when the picker closes (→ swap to the thread).
  const refreshTopPostsBoard = () => {
    const board = root.querySelector(".top-posts-board");
    const state = topPostsFlow.getPickerState(session.id);
    // Only a board-internal change (sort/period/selection) swaps in place; a
    // stage change (→ profile chooser / loading) re-renders the whole screen.
    if (!board || !state || state.stage !== "board") {
      refreshAssistantAside();
      return;
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = renderTopPostsBoard({
      posts: state.posts,
      sort: state.sort,
      profile: state.profile,
      period: state.period,
    });
    const fresh = tmp.firstElementChild;
    if (fresh) board.replaceWith(fresh);
  };
  const offWizard = sidebarWizard.subscribe(session.id, refreshAssistantAside);
  const offInlineQuestion = inlineQuestion.subscribe(session.id, refreshAssistantAside);
  // Triaging a Topic anywhere — the feed, the dialog, this list — has to show up
  // here without a reload. Guarded on the hero actually being mounted so a
  // started conversation never re-renders its whole aside because a Topic moved.
  const offTopics = subscribeTopics(() => {
    if (root.querySelector("[data-empty-chat] .empty-chat__topics")) refreshAssistantAside();
  });
  const offTopPosts = topPostsFlow.subscribePicker(session.id, refreshTopPostsBoard);
  // Clip Studio — every stage transition + analyzing ticker tick re-renders the
  // whole assistant aside (mirrors the wizard subscription).
  const offClipStudio = clipStudio.subscribe(session.id, () => {
    // Analysis finished ("done") → hand the generated clips straight to the
    // conversational chat: no review grid, no profiles screen. clipsToChat
    // exits the studio, so this branch won't re-fire for the same session.
    if (clipStudio.isActive(session.id) && clipStudio.getState(session.id)?.stage === "done") {
      clipsToChat(session);
      return;
    }
    refreshAssistantAside();
  });
  // Batch Studio — re-render the aside on every staged-source / Playbook change.
  // Batch Studio — staging changes repaint only the list + commit (the intake
  // card stays put so the field isn't clobbered mid-typing). start/exit
  // transitions (no [data-batch-rest] yet) fall back to a full aside re-render.
  const offBatchStudio = batchStudio.subscribe(session.id, () => {
    if (root.querySelector("[data-batch-rest]")) repaintBatchRest(root, session);
    else refreshAssistantAside();
  });
  // Initial bind in case the panel was rendered with wizard / question mode on.
  rebindWizardKeyboardIfActive();

  // Posts tab dropped at Lot 4.4 then the workspace itself at Lot 13. The
  // posts-store subscription used to repaint the in-session Posts tab body.
  // No subscriber to wire today; the right-panel Drafts surface listens to
  // assistant.subscribe directly for batch updates.
  const offPosts = () => {};

  // Thread re-paints on source changes so inline clip-extraction cards
  // flip from pending to ready (and pick up clipExtractionStatus + clips
  // count) without an extra notify hop.
  const repaintThreadFromSources = () => {
    const thread = getThreadEl();
    if (!thread) return;
    thread.innerHTML = renderThread(getThread(session.id), session.id);
  };

  // Intake-turn lifecycle (loading → ready) — see intake-lifecycle.js.
  const offComposerSources = startIntakeLifecycle(session.id, {
    onSourcesChange: () => {
      repaintThreadFromSources();
      // Drive the grey "Analyzing …" composer bar as sources enter/leave the
      // Processing state (keyed reconcile → no churn on per-tick progress).
      syncComposerStatus();
    },
    // Clip Studio owns its own video source + UI — never pop the generic
    // "what to do with this video?" intake choice for a studio session.
    onVideoReady: (sourceId, filename) => {
      if (clipStudio.isActive(session.id)) return;
      askVideoIntake(session.id, sourceId, filename);
    },
    // A non-video source extracts its ideas during processing — surface the
    // persistent green "N ideas ready" bar (in addition to the source's
    // completion snackbar), same as the flow-based extractions.
    onSourceReady: (sourceId, src) => {
      const n = src.ideaCount || 0;
      if (n > 0 && getRightPanelMode() !== "ideas") {
        ideaBanners.set(session.id, { count: n, at: Date.now() });
        syncComposerStatus();
      }
    },
  });

  // Uploads → no extra wiring needed: startFileUpload already takes a
  // session.id, so the resulting source lands in this session's list
  // and the source subscription above handles intake + ready flips.
  const offComposerUploads = subscribeUploads(() => {});

  // Batch Studio hand-off — a "Start drafting" press on the batch screen minted
  // this chat and stashed the staged sources in batch-studio's in-memory slot.
  // Replay them now (after the intake lifecycle's baseline is set) so each runs
  // the classic source → idea-extraction workflow in this fresh conversation.
  const pendingBatch = batchStudio.consumePending();
  if (pendingBatch?.sources?.length) {
    setTimeout(() => replayBatchSources(session.id, pendingBatch), 50);
  }

  // Apply idea focus on initial render if ?focusIdea= is present.
  applyIdeaFocus(root);

  // Hand-off from a Topic's "Use in chat", from any of the four surfaces that
  // offer it. Attaching is all it does: intake-lifecycle turns the source into
  // the source-intake card in the thread, so the Topic names itself and the
  // composer is right there. No echoed message and no follow-up question — the
  // card already says which Topic is in the chat.
  // Hand-off from Insights — an objective's "Work on this", or a linked post's
  // "Repurpose". Archie opens on the diagnosis (or on the post, quoted back with
  // what it did) and offers the angles as a question picker, so the chat starts
  // where the reader left off instead of on a blank composer.
  const pendingObjective = consumeHandoff(OBJECTIVE_CHAT_HANDOFF);
  if (pendingObjective?.ctxId) {
    setTimeout(() => startObjectiveChat(session.id, pendingObjective), 150);
  }

  const pendingTopic = consumeHandoff(TOPIC_CHAT_HANDOFF);
  if (pendingTopic?.topicId) {
    setTimeout(() => attachTopicToChat(session.id, pendingTopic.topicId), 100);
  }

  // Hand-off from the account home's hero: the reader typed the first message
  // up there, so post it as if they had typed it here. The Playbook and the
  // chat's name rode in the URL (?contextId= / ?title=) — only the text needed
  // a bridge, and consumeHandoff is single-use, so reloading this URL does not
  // re-post it.
  const pendingHomePrompt = consumeHandoff("pendingHomePrompt");
  if (pendingHomePrompt?.text) {
    setTimeout(() => sendMessage(session.id, pendingHomePrompt.text), 100);
  }

  // Hand-off from the account home's Add menu. The home can't run an intake —
  // uploads, processing and replay are per-session and it has none — so it
  // launches instead: it minted this chat and named the flow it wanted, and the
  // dispatch below calls the SAME functions the composer's own Add menu calls.
  // After the prompt above (150 vs 100 ms) so a message typed on the home lands
  // in the thread before a modal opens over it.
  const pendingAdd = consumeHandoff("pendingHomeAdd");
  if (pendingAdd?.kind) {
    setTimeout(() => {
      const kind = pendingAdd.kind;
      if (kind === "connector" && pendingAdd.connectorId) askConnector(session.id, pendingAdd.connectorId);
      else if (kind === "top-posts") topPostsFlow.startTopPostsInline(session.id);
      // The home's workflow CARD opens the full board, the way the hero's card
      // does; its Add menu's row is the inline variant. Both exist in the chat.
      else if (kind === "top-posts-studio") topPostsFlow.startTopPostsFlow(session.id);
      else if (kind === "topic") startTopicPickerInline(session.id, session);
      else if (kind === "text") openAddSourceModal({ tab: "pasteText", currentSessionId: session.id });
      else if (kind === "url") openAddSourceModal({ tab: "url", currentSessionId: session.id });
      else startPillFromKind(root, session, kind);
    }, 150);
  }

  // Hand-off from a source card's "Ask" button on the dashboard or another
  // session — open the askWhatToKnow inline question in this freshly mounted
  // chat.
  const pendingAsk = consumeHandoff("pendingAskSource");
  if (pendingAsk?.filename) {
    setTimeout(() => askWhatToKnow(session.id, pendingAsk.filename, pendingAsk.sourceId), 150);
  }

  // Hand-off from the Connectors gallery's (or right-panel's) "Try in chat" /
  // "Ask" on a connected connector — launch the live-connector ask flow.
  const pendingAskConnector = consumeHandoff("pendingAskConnector");
  if (pendingAskConnector?.connectorId) {
    setTimeout(() => askConnector(session.id, pendingAskConnector.connectorId), 200);
  }

  // Spawn-session handoff from the /contexts page "New context" button.
  // The page has no chat panel to host the wizard, so it minted this
  // fresh session for us. Launch the inline wizard now; onComplete
  // navigates back to the returnTo path (typically /contexts).
  //
  // The First Time User ALT flow uses the same handoff with two extra
  // payload fields: `prefill` (seeds selectedProfileId + connectedSocials
  // so askSocial can pre-check the platform) and `finishMode:
  // "switch-to-returning"` (flip the admin mode to returning before
  // navigating, so the dashboard renders the populated returning-user
  // state rather than redirecting back to /welcome-alt).
  const pendingCtxBuilder = consumeHandoff("pendingStartContextBuilder");
  if (pendingCtxBuilder) {
    const { returnTo, finishMode, prefilledUrl } = pendingCtxBuilder;
    const onComplete = () => {
      if (finishMode === "switch-to-returning") {
        try {
          window.localStorage.removeItem("archie-user-mode");
        } catch {
          /* ignore */
        }
        // Full reload so all stores re-seed with the returning-user
        // mocks (sessions, contexts, sources, etc.) and the admin
        // chip re-renders with the new "Returning user" label. The
        // hash change positions the landing target; the reload
        // commits the new mode across the whole app.
        if (returnTo) window.location.hash = "#" + returnTo;
        window.location.reload();
        return;
      }
      if (returnTo) navigate(returnTo);
    };
    setTimeout(() => {
      // Conversational 3-question orchestration (URL → profiles → optional
      // documents). Runs full-bleed for first-time onboarding, or integrated
      // in the app shell for a New Playbook (driven by welcomeAltIntegrated).
      contextBuilder.startAlt(session.id, { onComplete, prefilledUrl });
    }, 50);
  }

  bindDragAndDrop(root.querySelector(".session__assistant"), session);

  currentUnsubscribe = () => {
    offThread();
    offRightPanel();
    offLibrary();
    offPosts();
    offWizard();
    offInlineQuestion();
    offTopics();
    offTopPosts();
    offClipStudio();
    offBatchStudio();
    offComposerSources();
    offComposerUploads();
    unsubMentions();
    unsubConnector();
    stopThinkingTimer();
    // NOTE: we deliberately do NOT clipStudio.exit() here. The router re-runs
    // this cleanup on every hashchange (including query-only changes within the
    // same session), so exiting would wipe the flow on, e.g., a Drafts-panel URL
    // write. State persists per session id instead; if the user truly navigates
    // away mid-analyzing, the ticker self-completes and notifies a now-empty
    // subscriber set (harmless no-op).
  };
}

// --- Focused-idea highlight ---------------------------------------------

function applyIdeaFocus(root) {
  const q = readQuery();
  if (!q.focusIdea || q.tab !== "content" || q.view !== "ideas") return;
  const card = root.querySelector(`[data-idea-id="${q.focusIdea}"]`);
  if (!card) return;
  card.classList.add("is-focused");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.classList.remove("is-focused"), 1800);
}

// Thin wrapper around the shared rerenderContentWorkspaceBody — keeps the
// session.js call sites unchanged while the actual rendering lives in the
// shared module. Also threads selection state + bulk bar through so the
// in-place repaint after a checkbox toggle stays consistent with the
// initial render.
function rerenderContentWorkspace(root, session) {
  const q = readQuery();
  if (q.tab !== "content") return;
  const view = q.view === "ideas" ? "ideas" : "sources";
  const sourceSel = view === "sources" ? sourceSelection : null;
  const ideaSel = view === "ideas" ? ideaSelection : null;
  rerenderContentWorkspaceBody(root, {
    sources: getSources(session.id),
    ideas: getIdeas(session.id),
    view,
    sourceSelection: sourceSel,
    sourcesBulkBar: sourceSel && sourceSel.size > 0 ? renderSourcesBulkBar(sourceSel.size) : "",
    ideaSelection: ideaSel,
    ideasBulkBar: ideaSel && ideaSel.size > 0 ? renderIdeasBulkBar(ideaSel.size) : "",
    sessionId: session.id,
  });
}

// ─── Composer side state ─────────────────────────────────────────────────
//
// The legacy per-session composer-pill machinery (composerStates,
// getComposerState, resolveComposerPill, renderComposerPill,
// paintComposerPills, dismissComposerIdeasBadge) was removed when
// sources moved into the right-panel "Sources" mode. Sources now live
// directly in sources-stream's per-session list and render in the
// panel — the composer stays minimal.

// Label map for subtitle preset picks — used by the toast confirmation
// after the user resolves the "Add subtitles?" turn (PDF flow 06.B).
const SUBTITLE_PICK_LABEL = {
  bold: "Bold",
  clean: "Clean",
  caption: "Caption",
};

const SCRIPTED_KINDS = {
  pdf: { kindLabel: "PDF", filename: "Roadmap Q3.pdf" },
  video: { kindLabel: "Video", filename: "Demo replay.mp4" },
  url: { kindLabel: "URL", filename: "blog.example.com/post" },
};

function startPillFromKind(_root, session, kind) {
  const spec = SCRIPTED_KINDS[kind];
  if (!spec) return;
  const sessionId = session.id;
  // Uniform pipeline: push a Processing source, then flip it Processed
  // after ~6s. Clips for Video sources are attached automatically by
  // completeScriptedSource (see sources-stream.attachVideoClips). The
  // chat stays interactive throughout — no follow-up picker, the user
  // can keep typing and only sees the intake bubble + completion toast.
  const sourceId = pushScriptedSource({ filename: spec.filename, kind: spec.kindLabel, sessionId });
  const ideaCount = 3 + Math.floor(Math.random() * 6);
  setTimeout(() => {
    completeScriptedSource(sourceId, {
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount,
    });
  }, 6000);
}

// Everything in a chat that PRODUCES something. When the chat's Playbook is
// gone these all have to stop — while saving, scheduling, reading and the panels
// keep working, which is the whole promise of the degraded state (doc §6.3).
//
// Guarded in one capture-phase listener rather than threaded through five card
// renderers: the cards stay ignorant of sharing, and the reason gets said out
// loud at the click instead of being silently swallowed.
const GENERATE_HOOKS = [
  "[data-bulk-extract]",
  "[data-source-extract-one]",
  "[data-idea-generate]",
  "[data-post-rewrite-menu]",
  "[data-post-rewrite-intent]",
  "[data-post-image]",
  "[data-post-image-edit]",
  "[data-clip-draft]",
  "[data-rpanel-clips-draft]",
  "[data-starter-prompt]",
  "[data-starter-action]",
].join(",");

function bindSession(root, session) {
  // Abort any listeners attached by the previous render so they don't stack
  // on the stable #app element and fire N times per click.
  if (currentListenerController) currentListenerController.abort();
  currentListenerController = new AbortController();
  const { signal } = currentListenerController;

  document.addEventListener(
    "click",
    (event) => {
      const revoked = revokedContextFor(session);
      if (!revoked) return;
      const hook = event.target.closest(GENERATE_HOOKS);
      if (!hook) return;
      event.preventDefault();
      event.stopPropagation();
      // error, not success: this is a refusal, and a green snackbar reads like
      // the click worked.
      showToast(`I can't — ${revoked.ownerName} stopped sharing ${revoked.name}.`, { variant: "error" });
    },
    { capture: true, signal },
  );

  // Library actions (selection toggles, bulk Extract/Delete, per-row "…"
  // menu) are wired through the shared library-actions module so the
  // dashboard and the in-session Content tab behave identically.
  wireLibraryActions(root, {
    sessionId: session.id,
    sourceSelection,
    ideaSelection,
    getSources: () => getSources(session.id),
    onRerender: () => rerenderContentWorkspace(root, session),
    signal,
  });

  const getInput = () => root.querySelector("#assistantInput");

  function submitInput() {
    // Second line of defence behind the disabled send button — Enter, the
    // starter cards and the flows all land here.
    if (revokedContextFor(session)) return;
    const input = getInput();
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    // A connected connector attached to the composer routes the message to the
    // live source (simulated MCP) instead of the normal assistant thread, then
    // detaches itself so the next message is a normal follow-up.
    const activeConnector = getActiveConnector(session.id);
    if (!activeConnector && routeDraftsAsk(session, text)) {
      // handled in the chat: a question, a plan or a confirm
    } else if (activeConnector) {
      sendConnectorMessage(session.id, activeConnector, text);
      clearActiveConnector(session.id);
    } else {
      sendMessage(session.id, text);
    }
    input.value = "";
    // Snap the textarea back to its CSS min-height — without this it
    // keeps the autosized height from the last message.
    autosizeInput(input);
  }

  // Grow the textarea with content. CSS provides min-height (2 lines)
  // and max-height (clamped so the chrome doesn't get pushed off-
  // screen on a long paste); we just keep the height pinned to the
  // current content's scrollHeight.
  function autosizeInput(input) {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }

  // Run the handler for a choice turn (freeze the message + dispatch). Called
  // by both the Submit-button path and the instant chip-click path.
  function dispatchChoiceSubmit(msg, selectedValues) {
    submitAssistantChoice(session.id, msg.id, selectedValues);
    if (msg.handler === "draft-channels" && msg.context?.ideaId) {
      executeDraft(
        session.id,
        msg.context.ideaId,
        selectedValues,
        1,
        msg.context.angle || null,
        msg.context.language || null,
      );
    } else if (msg.handler === "subtitle-style-pick") {
      // PDF flow step 06.B — user picks a subtitle preset (or "none") for
      // the clip-derived drafts. Applies the style to each draft id we
      // stashed in the message context.
      const { draftIds = [] } = msg.context || {};
      const pick = selectedValues[0];
      if (draftIds.length > 0 && pick) {
        setSubtitleStyle(session.id, draftIds, pick);
        const label = pick === "none" ? "No subtitles" : SUBTITLE_PICK_LABEL[pick] || pick;
        const count = draftIds.length;
        const clipWord = count === 1 ? "clip" : "clips";
        const message =
          pick === "none"
            ? `Subtitles removed from ${count} ${clipWord}`
            : `${label} subtitles added to ${count} ${clipWord}`;
        showToast(message, { duration: 3200 });
      }
    }
  }

  root.addEventListener(
    "click",
    (event) => {
      // "ADMIN MODE: DISPLAY IN CHAT" under the composer — the prototype's catalogue of what a
      // chat can display. A typed ask goes through submitInput, like a real one.
      const send = (text) => {
        const input = getInput();
        if (!input) return;
        input.value = text;
        submitInput();
      };
      if (onChatGalleryClick(event, root, session, send)) return;
      // Shared "how's this?" feedback control — wires the clip thumbs/reasons
      // rendered in the Clip Studio review grid (renderClipCard). Handled first
      // so the in-place thumb/chip/Send updates bail before other handlers.
      if (onFeedbackClick(event)) return;
      // Extraction-turn idea cards use the shared compact idea card
      // (renderCompactIdeaCard) — wire its data-rpanel-* hooks to chat-context
      // actions. Scoped to .extraction-turn__detail so they never collide with
      // the right-panel's own delegation. Each toggle repaints just that card.
      const ideaWhy = event.target.closest(".extraction-turn__detail [data-rpanel-idea-why-toggle]");
      if (ideaWhy) {
        event.preventDefault();
        const id = ideaWhy.dataset.rpanelIdeaWhyToggle;
        if (extractionWhyOpen.has(id)) extractionWhyOpen.delete(id);
        else extractionWhyOpen.add(id);
        repaintExtractionCard(root, session, id);
        return;
      }
      const ideaThumb = event.target.closest(".extraction-turn__detail [data-rpanel-ideas-feedback]");
      if (ideaThumb) {
        event.preventDefault();
        const id = ideaThumb.dataset.rpanelIdeasFeedback;
        const verdict = ideaThumb.dataset.verdict;
        if (extractionVerdict.get(id) === verdict) extractionVerdict.delete(id);
        else extractionVerdict.set(id, verdict);
        repaintExtractionCard(root, session, id);
        return;
      }
      const ideaMention = event.target.closest(".extraction-turn__detail [data-rpanel-mention-idea]");
      if (ideaMention) {
        const idea = findExtractionIdea(session.id, ideaMention.dataset.rpanelMentionIdea);
        if (idea) addComposerMention(session.id, idea.title);
        return;
      }
      const ideaUse = event.target.closest(".extraction-turn__detail [data-rpanel-use-idea]");
      if (ideaUse) {
        event.preventDefault();
        startIdeaDraft(session.id, ideaUse.dataset.rpanelUseIdea);
        return;
      }

      // Sidebar wizard option click — single-select advances immediately,
      // multi-select toggles the row and waits for the Submit button.
      const wizardOption = event.target.closest("[data-wizard-answer]");
      if (wizardOption) {
        event.preventDefault();
        const opts = wizardOption.closest(".analyse__options");
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = wizardOption.classList.contains("is-selected");
          wizardOption.classList.toggle("is-selected", !wasSelected);
          wizardOption.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
          // Keep the primary disabled until at least one row is selected.
          const submit = opts.querySelector("[data-wizard-answer-submit]");
          if (submit) submit.disabled = !opts.querySelector("[data-wizard-answer].is-selected");
        } else {
          sidebarWizard.answer(session.id, wizardOption.dataset.wizardAnswer);
        }
        return;
      }

      // Multi-select submit — collect every .is-selected in the picker and
      // hand the array to the wizard as the answer value.
      const wizardSubmitBtn = event.target.closest("[data-wizard-answer-submit]");
      if (wizardSubmitBtn) {
        event.preventDefault();
        const opts = wizardSubmitBtn.closest(".analyse__options");
        const selected = opts
          ? Array.from(opts.querySelectorAll("[data-wizard-answer].is-selected")).map((el) => el.dataset.wizardAnswer)
          : [];
        if (selected.length) sidebarWizard.answer(session.id, selected);
        return;
      }

      // Skip button — bumps the wizard to the next stage's intake (or to
      // the memorize step if this was the last stage).
      if (event.target.closest("[data-wizard-answer-skip]")) {
        event.preventDefault();
        sidebarWizard.skipStage(session.id);
        return;
      }

      // Stepper mode — per-row −/+ adjusts that row's count (and selects it).
      const inlineQuestionStep = event.target.closest("[data-inline-question-step]");
      if (inlineQuestionStep) {
        event.preventDefault();
        const delta = inlineQuestionStep.dataset.inlineQuestionStep === "inc" ? 1 : -1;
        inlineQuestion.stepBump(session.id, inlineQuestionStep.dataset.stepValue, delta);
        return;
      }
      // Stepper mode — "Generate N drafts" submits the selected row + count.
      if (event.target.closest("[data-inline-question-generate]")) {
        event.preventDefault();
        inlineQuestion.stepSubmit(session.id);
        return;
      }
      // Counter-submit — the explicit "Generate N drafts" footer button that
      // commits an inline-counter row (e.g. the repurpose scope "Same profile").
      // Reuses pick(), which passes the counter row's current count to onPick.
      const counterSubmitBtn = event.target.closest("[data-inline-question-counter-submit]");
      if (counterSubmitBtn) {
        event.preventDefault();
        inlineQuestion.pick(session.id, counterSubmitBtn.dataset.inlineQuestionCounterSubmit);
        return;
      }

      // Inline single-question pick / skip / custom-submit / multi-submit.
      const inlineQuestionBtn = event.target.closest("[data-inline-question]");
      if (inlineQuestionBtn) {
        event.preventDefault();
        const opts = inlineQuestionBtn.closest(".analyse__options");
        // A counter row paired with a footer "Generate" button commits via that
        // button — its body click is inert (only the −/+ act, handled above).
        if (
          inlineQuestionBtn.classList.contains("analyse__option--counter") &&
          opts?.querySelector("[data-inline-question-counter-submit]")
        ) {
          return;
        }
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = inlineQuestionBtn.classList.contains("is-selected");
          inlineQuestionBtn.classList.toggle("is-selected", !wasSelected);
          inlineQuestionBtn.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
          // A post-pick row carries the DS checkbox: keep it in step.
          const box = inlineQuestionBtn.querySelector("input[type=checkbox]");
          if (box) {
            box.checked = !wasSelected;
            inlineQuestionBtn.setAttribute("aria-checked", String(!wasSelected));
          }
          // Keep the primary disabled until at least one row is selected.
          const submit = opts.querySelector("[data-inline-question-submit]");
          if (submit) submit.disabled = !opts.querySelector("[data-inline-question].is-selected");
        } else if (opts?.dataset.stepper !== undefined) {
          // Stepper mode — clicking a row selects it (the count drives the
          // generate button); it doesn't pick-and-advance.
          inlineQuestion.stepSelect(session.id, inlineQuestionBtn.dataset.inlineQuestion);
        } else if (opts?.dataset.single !== undefined) {
          // Single-select-with-confirm — highlight the row; a separate submit
          // (e.g. the top-posts "Next" button) confirms it.
          inlineQuestion.singleSelect(session.id, inlineQuestionBtn.dataset.inlineQuestion);
        } else {
          inlineQuestion.pick(session.id, inlineQuestionBtn.dataset.inlineQuestion);
        }
        return;
      }
      // Single-select-with-confirm's own primary (the posts picker): confirm
      // the highlighted row.
      if (event.target.closest("[data-inline-question-single-submit]")) {
        event.preventDefault();
        inlineQuestion.submitSingle(session.id);
        return;
      }
      const inlineQuestionSubmitBtn = event.target.closest("[data-inline-question-submit]");
      if (inlineQuestionSubmitBtn) {
        event.preventDefault();
        const opts = inlineQuestionSubmitBtn.closest(".analyse__options");
        const selected = opts
          ? Array.from(opts.querySelectorAll("[data-inline-question].is-selected")).map(
              (el) => el.dataset.inlineQuestion,
            )
          : [];
        if (selected.length) inlineQuestion.submitMulti(session.id, selected);
        return;
      }
      if (event.target.closest("[data-inline-question-skip]")) {
        event.preventDefault();
        inlineQuestion.skip(session.id);
        return;
      }
      if (event.target.closest("[data-inline-question-back]")) {
        event.preventDefault();
        inlineQuestion.back(session.id);
        return;
      }
      const inlineQuestionCustomSubmit = event.target.closest("[data-inline-question-custom-submit]");
      if (inlineQuestionCustomSubmit) {
        event.preventDefault();
        const input = inlineQuestionCustomSubmit
          .closest(".analyse__options")
          ?.querySelector("[data-inline-question-custom]");
        const value = input?.value?.trim();
        if (value) inlineQuestion.submitCustom(session.id, value);
        return;
      }

      // Choice chip click — instant pickers (msg.instant) fire the handler
      // immediately with the clicked value. Otherwise it's a visual-only
      // toggle and the user submits via the Submit button below.
      const choiceChip = event.target.closest("[data-assistant-choice]");
      if (choiceChip && choiceChip.tagName === "BUTTON") {
        event.preventDefault();
        const msgId = choiceChip.dataset.assistantChoiceMsg;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (msg?.instant) {
          dispatchChoiceSubmit(msg, [choiceChip.dataset.assistantChoice]);
        } else {
          const wasSelected = choiceChip.classList.contains("is-selected");
          choiceChip.classList.toggle("is-selected", !wasSelected);
          choiceChip.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
          // Keep the Submit disabled until at least one chip is selected.
          const bubble = choiceChip.closest(".chat-bubble");
          const submit = bubble?.querySelector("[data-assistant-choice-submit]");
          if (submit) submit.disabled = !bubble.querySelector("button.chat-bubble-choice-chip.is-selected");
        }
        return;
      }

      // "Draft them" / "Continue" submit — freeze the choice + run handler.
      const submitChoiceBtn = event.target.closest("[data-assistant-choice-submit]");
      if (submitChoiceBtn) {
        event.preventDefault();
        const msgId = submitChoiceBtn.dataset.assistantChoiceSubmit;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (!msg) return;
        const bubble = submitChoiceBtn.closest(".chat-bubble");
        const selectedValues = bubble
          ? [...bubble.querySelectorAll("button.chat-bubble-choice-chip.is-selected")]
              .map((c) => c.dataset.assistantChoice)
              .filter(Boolean)
          : [];
        if (selectedValues.length === 0) return; // nothing selected — no-op
        dispatchChoiceSubmit(msg, selectedValues);
        return;
      }

      // Voice proposal (flag networkVoices) — Remember writes the rule into the
      // Playbook's network voice (the explicit gesture), Undo takes it back out,
      // Not now keeps it out for good. The card re-renders in its new state.
      // Rewrite: the kept rule applied to this chat's drafts on its network.
      const voiceRewrite = event.target.closest("[data-voice-rewrite]");
      if (voiceRewrite) {
        event.preventDefault();
        const [ctxId, suggestionId] = voiceRewrite.dataset.voiceRewrite.split("|");
        rewriteDraftsWithRule(session.id, getVoiceSuggestion(ctxId, suggestionId));
        return;
      }
      const voiceBtn = event.target.closest("[data-voice-accept], [data-voice-dismiss], [data-voice-undo]");
      if (voiceBtn) {
        event.preventDefault();
        const { voiceAccept, voiceDismiss, voiceUndo } = voiceBtn.dataset;
        const [ctxId, suggestionId] = (voiceAccept || voiceDismiss || voiceUndo).split("|");
        const act = voiceAccept ? acceptVoiceSuggestion : voiceUndo ? undoVoiceSuggestion : dismissVoiceSuggestion;
        act(ctxId, suggestionId);
        refreshThread(session.id);
        return;
      }

      // Connect-prompt "Connect <service>" — connect the service through the
      // store (so every connectors surface stays in sync), then retry the
      // import that triggered the prompt. The turn collapses to a confirmation.
      const connectPromptBtn = event.target.closest("[data-connect-prompt-connect]");
      if (connectPromptBtn) {
        event.preventDefault();
        const msgId = connectPromptBtn.dataset.connectPromptConnect;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (!msg) return;
        const conn = findConnector(msg.connectorId);
        if (conn) {
          setConnectorStatus(msg.connectorId, {
            status: "connected",
            account: conn.account || "matt@archie.io",
            lastSync: "just now",
          });
        }
        markConnectPromptResolved(session.id, msgId, "connected");
        startUrlImport(msg.url, session.id);
        showToast(`${msg.connectorName} connected — importing your ${msg.noun} now.`);
        return;
      }

      // Failed card "Retry" — the card leaves, the job runs again.
      const failedRetry = event.target.closest("[data-failed-retry]");
      if (failedRetry) {
        event.preventDefault();
        retryFailedTurn(session.id, failedRetry.dataset.failedRetry);
        return;
      }

      // Connect-prompt "Close" — dismiss without connecting (turn is hidden).
      const connectPromptDismiss = event.target.closest("[data-connect-prompt-dismiss]");
      if (connectPromptDismiss) {
        event.preventDefault();
        markConnectPromptResolved(session.id, connectPromptDismiss.dataset.connectPromptDismiss, "dismissed");
        return;
      }

      // Any other [data-go-to-posts] surface (older link patterns) — keep the
      // legacy navigation to the Posts tab until those callers are migrated
      // to the right panel.
      if (event.target.closest("[data-go-to-posts]")) {
        event.preventDefault();
        setQuery({ tab: "posts", postsFilter: "all", postsNetwork: "all" });
        return;
      }

      // Stay-in-conversation policy — uploading / drafting / extracting
      // inside a chat must never redirect the user to a side panel or
      // the now-dead Content tab. We swallow the click events for these
      // legacy chips so the chip render can stay (visual signal) but
      // doesn't navigate. The data attributes are kept for analytics /
      // future re-wiring; the click is just consumed silently.
      if (event.target.closest("[data-focus-idea]")) {
        event.preventDefault();
        return;
      }
      if (event.target.closest("[data-source-view]")) {
        event.preventDefault();
        return;
      }
      if (event.target.closest("[data-content-view]")) {
        event.preventDefault();
        return;
      }

      // "+ Add source" in the Content tab header (mirrors the dashboard's
      // dashboardAddSource button — same modal, same global flow).
      if (event.target.closest("[data-session-add-source]")) {
        openAddSourceModal();
        return;
      }

      // Source / idea selection + bulk + per-row "…" menu actions are all
      // dispatched by library-actions.wireLibraryActions (attached below
      // with the same abort signal) so we don't duplicate the dispatch
      // here. See library-actions.js for the full hook list.

      // "Ask" inside a source card → open the chat picker (same UX as
      // Draft Post), then show the askWhatToKnow inline question in the
      // chosen chat.
      const askBtn = event.target.closest("[data-source-ask]");
      if (askBtn) {
        event.preventDefault();
        const sourceId = askBtn.dataset.sourceAsk;
        const src = getSources(session.id).find((s) => s.id === sourceId);
        if (!src) return;
        startAskFlowFromSession(session.id, sourceId, src.filename);
        return;
      }

      // Idea-card source chips — same stay-in-conversation policy as the
      // other dead Content-tab nav above. Click consumed, no nav.
      if (event.target.closest("[data-source-open]")) {
        event.preventDefault();
        return;
      }

      // Idea-card title click → "Open idea": give the card a visual pulse
      // (dossier view is future work). Pin + more-menu behavior is
      // encapsulated inside src/components/idea-card.js.
      const openBtn = event.target.closest("[data-idea-open]");
      if (openBtn) {
        event.preventDefault();
        const card = openBtn.closest(".idea-card");
        if (card) {
          card.classList.add("is-focused");
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => card.classList.remove("is-focused"), 1600);
        }
        return;
      }

      if (event.target.closest("[data-idea-generate]")) {
        event.preventDefault();
        const btn = event.target.closest("[data-idea-generate]");
        if (btn.disabled) return;
        const ideaId = btn.dataset.ideaGenerate;
        if (ideaId) {
          btn.disabled = true;
          btn.classList.add("is-pending");
          startIdeaDraft(session.id, ideaId);
        }
        return;
      }

      const tab = event.target.closest("[data-session-tab]");
      if (tab) {
        // Clear focus markers on any explicit tab switch — they're scoped to
        // the originating tab, leaving them set leaks pulse highlights when
        // the user comes back.
        setQuery({ tab: tab.dataset.sessionTab, focusIdea: "", focusPost: "", focusSource: "" });
        return;
      }

      const filter = event.target.closest("[data-posts-filter]");
      if (filter) {
        setQuery({ postsFilter: filter.dataset.postsFilter });
        return;
      }

      const network = event.target.closest("[data-posts-network]");
      if (network) {
        setQuery({ postsNetwork: network.dataset.postsNetwork });
        return;
      }

      if (event.target.closest("[data-posts-clear]")) {
        setQuery({ postsFilter: "all", postsNetwork: "all" });
        return;
      }

      // --- Context tab ---
      // Edit a single section (Voice / Brief / Brand) via conversation.
      // Every context is global now — surface a confirm prompt because
      // edits propagate across every chat using the context.
      const editSection = event.target.closest("[data-edit-context-section]");
      if (editSection) {
        const section = editSection.dataset.editContextSection;
        const ctxId = readQuery().contextId || session.contextId || "";
        if (!ctxId) return;
        startEditConfirmPrompt(session, section, ctxId);
        return;
      }

      // --- Assistant panel ---
      // Empty-state starter card click — pre-fills the composer textarea
      // with the starter's prompt text. The `{{source}}` placeholder has
      // already been resolved at render time (cf. renderEmptyHero), so the
      // textarea receives clean text the user can either submit as-is or
      // tweak before sending.
      //
      // Starters can opt into a direct action instead of text injection by
      // setting `action` on the mock. The "open-video-clips" action opens the
      // dedicated Clip Studio in a fresh `clip-studio-*` session (upload →
      // analyzing → clips), mirroring the welcome-alt dedicated-session pattern.
      const starterBtn = event.target.closest("[data-starter]");
      if (starterBtn && starterBtn.dataset.starterAction === "open-video-clips") {
        setHandoff("pendingStartClipStudio", {});
        navigate(`/session/clip-studio-${Date.now().toString(36)}`);
        return;
      }
      // "Batch from a source" — open the dedicated Batch Studio intake screen in
      // a fresh `batch-*` session (upload 1+ sources + pick a Playbook → new chat).
      if (starterBtn && starterBtn.dataset.starterAction === "open-batch") {
        setHandoff("pendingStartBatch", {});
        navigate(`/session/batch-${Date.now().toString(36)}`);
        return;
      }
      // "Use top performing posts" — launch the milker flow inline in this
      // session (winner grid → pick a reuse mode → drafts). startTopPostsFlow
      // opens the grid screen (renderTopPostsPickerScreen below).
      if (starterBtn && starterBtn.dataset.starterAction === "open-top-posts") {
        topPostsFlow.startTopPostsFlow(session.id);
        return;
      }
      // (Step 1's profile chooser is the exact inline-question picker now — its
      // rows route through the shared [data-inline-question] delegate above,
      // in single-select mode: clicking highlights, "Next" confirms.)
      // Step 1 "Next" → confirm the highlighted account + Playbook and load its
      // winners (submitSingle resolves the picker → chooseProfile).
      if (event.target.closest("[data-topposts-next]")) {
        inlineQuestion.submitSingle(session.id);
        return;
      }
      // No-history empty studio → "Back to chat" leaves the picker (→ normal
      // chat). exitPicker notifies, so refreshTopPostsBoard repaints the aside.
      if (event.target.closest("[data-topposts-exit]")) {
        topPostsFlow.exitPicker(session.id);
        return;
      }
      // Inline widget — confirm the selection → freeze the widget, then hand off
      // to the shared profiles step (skip the duplicate echo, since the frozen
      // widget already shows the picks).
      if (event.target.closest("[data-topposts-widget-confirm]")) {
        const ids = answerTopPostsWidget(session.id);
        const valid = topPostsFlow.echoRepurposePicks(session.id, ids, { echo: false });
        if (valid.length) askRepurposeProfiles(session.id, valid);
        return;
      }
      // Inline topics widget — confirm the pick → freeze the widget, then attach
      // the Topic to THIS chat and ask what to do with it (finishTopicPick).
      if (event.target.closest("[data-topics-widget-confirm]")) {
        const [topicId] = answerTopicsWidget(session.id);
        finishTopicPick(session, topicId);
        return;
      }
      // Step 1 Playbook picker → set the voice governing the repurposed drafts.
      const topPostsPlaybook = event.target.closest("[data-topposts-playbook-pick]");
      if (topPostsPlaybook) {
        topPostsFlow.setContext(session.id, topPostsPlaybook.dataset.toppostsPlaybookPick);
        root.querySelector("[data-topposts-playbook]")?.removeAttribute("open");
        return;
      }
      // Winner-board sort chip → re-sort the grid (checked before the card
      // pick since chips sit outside the cards).
      const topPostSort = event.target.closest("[data-top-post-sort]");
      if (topPostSort) {
        topPostsFlow.setSort(session.id, topPostSort.dataset.topPostSort);
        return;
      }
      // Winner-board period chip → narrow the grid to a recency window (checked
      // before the card pick since chips sit outside the cards).
      const topPostPeriod = event.target.closest("[data-top-post-period]");
      if (topPostPeriod) {
        topPostsFlow.setPeriod(session.id, topPostPeriod.dataset.topPostPeriod);
        return;
      }
      // Card "Repurpose" → repurpose that one winner (one post at a time).
      const topPostRepurpose = event.target.closest("[data-top-post-repurpose]");
      if (topPostRepurpose) {
        startRepurposeFlow(session.id, [topPostRepurpose.dataset.topPostRepurpose]);
        return;
      }

      // --- Batch Studio (dedicated source-intake screen) ---
      if (batchStudio.isActive(session.id)) {
        // Additional features — open the add-source modal (staged) for a link or
        // pasted text. Checked before the dropzone so a click on these buttons
        // (which sit inside the upload box) doesn't also open the file picker.
        // Staging callbacks shared across the modal's tabs — whichever tab the
        // user ends on (incl. switching to Upload), the source lands in the
        // batch's staged list instead of the global upload stream.
        const onStageFile = (file, classification) => batchStudio.addFileSource(session.id, file, classification);
        const onStageUrl = (url) => batchStudio.addUrlSource(session.id, url);
        const onStageText = (text) => batchStudio.addTextSource(session.id, text);
        if (event.target.closest("[data-batch-link]")) {
          openAddSourceModal({ tab: "url", onStageUrl, onStageText, onStageFile });
          return;
        }
        if (event.target.closest("[data-batch-paste]")) {
          openAddSourceModal({ tab: "pasteText", onStageUrl, onStageText, onStageFile });
          return;
        }
        // Click the upload box (or Browse) → OS file picker.
        if (event.target.closest("[data-batch-dropzone]")) {
          root.querySelector("[data-batch-file]")?.click();
          return;
        }
        // Remove a staged source (source-card staged-mode remove control).
        const rmBatch = event.target.closest("[data-source-remove]");
        if (rmBatch) {
          batchStudio.removeSource(session.id, rmBatch.dataset.sourceRemove);
          return;
        }
        // Pick the Playbook for the chat.
        const bPlaybook = event.target.closest("[data-batch-playbook-pick]");
        if (bPlaybook) {
          batchStudio.setContext(session.id, bPlaybook.dataset.batchPlaybookPick);
          root.querySelector("[data-batch-playbook]")?.removeAttribute("open");
          return;
        }
        // Stage a doc from a connected source (uses the connector's first doc).
        const bConn = event.target.closest("[data-batch-connector-pick]");
        if (bConn) {
          const connector = findConnector(bConn.dataset.batchConnectorPick);
          const docs = connectorDocs[connector?.id] || [];
          if (connector && docs[0]) batchStudio.addConnectorSource(session.id, connector, docs[0]);
          root.querySelector("[data-batch-connector]")?.removeAttribute("open");
          return;
        }
        // Start drafting → create a new chat bound to the chosen Playbook and
        // replay the staged sources through the classic intake on mount.
        if (event.target.closest("[data-batch-start]")) {
          startBatchChat(session);
          return;
        }
      }

      // --- Clip Studio (dedicated video-clips flow) ---
      if (clipStudio.isActive(session.id)) {
        // Upload stage: open the file picker from the dropzone or Browse button.
        if (event.target.closest("[data-clip-studio-browse]") || event.target.closest("[data-clip-studio-dropzone]")) {
          root.querySelector("[data-clip-studio-file]")?.click();
          return;
        }
        // Pick the Playbook governing the drafts' voice.
        const clipPb = event.target.closest("[data-clip-playbook-pick]");
        if (clipPb) {
          clipStudio.setContext(session.id, clipPb.dataset.clipPlaybookPick);
          root.querySelector("[data-clip-playbook]")?.removeAttribute("open");
          return;
        }
        // Config toggle controls (output-format cards + caption-style cards).
        const cfgBtn = event.target.closest("[data-clip-config][data-value]");
        if (cfgBtn) {
          clipStudio.setConfig(session.id, { [cfgBtn.dataset.clipConfig]: cfgBtn.dataset.value });
          // On the review step the format/caption controls re-bake the clips so
          // the trimmer + resulting drafts reflect the pick (config stays the
          // source of truth either way — see finalizeClipStudio).
          if (clipStudio.getState(session.id)?.stage === "clips") {
            clipStudio.applyConfigToClips(session.id);
          }
          return;
        }
        // "Surprise me" — prefill the instructions field with a canned hint.
        if (event.target.closest("[data-clip-surprise]")) {
          clipStudio.setConfig(session.id, {
            instructions: "Lead with the strongest hook, keep clips punchy, and skip the intro.",
          });
          return;
        }
        // "Create clips" → leave config for the clips grid (or the loader if the
        // background analysis is still running).
        if (event.target.closest("[data-clip-create]")) {
          clipStudio.createClips(session.id);
          return;
        }
        // Reused DS clip card → "Why this clip" collapsible (in-place toggle).
        const csWhy = event.target.closest("[data-rpanel-clip-why-toggle]");
        if (csWhy) {
          event.preventDefault();
          const section = csWhy.closest(".rpanel-ideas__why");
          if (section) {
            const next = section.getAttribute("data-why-open") !== "true";
            section.setAttribute("data-why-open", next ? "true" : "false");
            csWhy.setAttribute("aria-expanded", next ? "true" : "false");
            const body = document.getElementById(csWhy.getAttribute("aria-controls"));
            if (body) body.hidden = !next;
            const chev = csWhy.querySelector(".rpanel-ideas__why-chevron");
            if (chev) {
              chev.classList.toggle("ap-icon-chevron-down", !next);
              chev.classList.toggle("ap-icon-chevron-up", next);
            }
          }
          return;
        }
        // Clips review: edit/recut a clip, or add a new one (trimmer modal).
        // Reused DS clip card → Edit (thumb + kebab) opens the trimmer modal.
        const editClip = event.target.closest("[data-clip-edit]");
        if (editClip) {
          openClipStudioEditor(session, { editingClipId: editClip.dataset.clipEdit });
          return;
        }
        // Reused DS clip card → Remove (kebab) deletes the clip from the source.
        const rmClip = event.target.closest("[data-clip-remove]");
        if (rmClip) {
          const src = clipStudio.currentSource(session.id);
          if (src) {
            updateSourceClips(
              src.id,
              (src.clips || []).filter((c) => c.id !== rmClip.dataset.clipRemove),
            );
            clipStudio.refresh(session.id);
          }
          return;
        }
        if (event.target.closest("[data-clip-add-studio]")) {
          openClipStudioEditor(session, { startAddClip: true });
          return;
        }
        // Back to the config screen (from the extraction loader or clips review).
        if (event.target.closest("[data-clip-back-config]")) {
          clipStudio.backToConfig(session.id);
          return;
        }
        // Continue → seed the profiles step from the config (networks + their
        // chosen formats), then go to it.
        if (event.target.closest("[data-clip-continue]")) {
          const cur = clipStudio.getState(session.id);
          if (!cur.profileSelection) {
            clipStudio.setProfileSelection(
              session.id,
              getConnectedProfiles().map((p) => p.id),
            );
          }
          clipStudio.goToProfiles(session.id);
          return;
        }
        // Connect step (no account yet): a network card opens its dialog; the
        // account it hands back is preselected so Create N drafts lights up.
        const clipConnect = event.target.closest("[data-clip-connect]");
        if (clipConnect) {
          const platform = clipConnect.dataset.clipConnect;
          openConnectAccountModal({
            network: platform,
            preselected: accountIdsForNetwork(platform),
            onConfirm: (accounts) => {
              if (!accounts.length) return;
              clipStudio.setProfileSelection(
                session.id,
                accounts.map((a) => a.id),
              );
            },
          });
          return;
        }
        // Profiles step: back, per-network format override, finalize.
        if (event.target.closest("[data-clip-back]")) {
          clipStudio.backToClips(session.id);
          return;
        }
        const netFmt = event.target.closest("[data-clip-netfmt]");
        if (netFmt) {
          clipStudio.setNetworkFormat(session.id, netFmt.dataset.clipNetfmt, netFmt.dataset.value);
          return;
        }
        if (event.target.closest("[data-clip-finalize]")) {
          finalizeClipStudio(session);
          return;
        }
      }

      // Prompt-injection starters carry a `data-starter-prompt`. Coming-soon
      // teasers are non-interactive (no prompt, aria-disabled) — ignore clicks.
      if (starterBtn && starterBtn.dataset.starterPrompt != null) {
        const input = getInput();
        if (!input) return;
        input.value = starterBtn.dataset.starterPrompt;
        input.focus();
        // Place cursor at end so the user can edit.
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }

      if (event.target.closest("[data-assistant-send]")) {
        submitInput();
        return;
      }

      // Draft-ready status bar "Review" → animate the bar out, THEN open the
      // Drafts panel pinned to the batch (opening writes the URL hash, which can
      // re-render the route — so we defer it until the exit animation finishes).
      if (event.target.closest("[data-draft-banner-review]")) {
        const ref = draftBanners.get(session.id)?.batchId;
        draftBanners.delete(session.id);
        const open = () => openDraftsPanel({ sessionId: session.id, messageId: ref });
        animateBannerOut(root.querySelector(".session__composer-status"), open);
        return;
      }

      // Ideas-ready bar "View ideas" → animate out, then open the Ideas panel.
      if (event.target.closest("[data-idea-banner-view]")) {
        ideaBanners.delete(session.id);
        animateBannerOut(root.querySelector(".session__composer-status"), () => openIdeasPanel());
        return;
      }

      // Detach the composer connector chip (×) — the next message goes back to
      // the normal assistant thread.
      if (event.target.closest("[data-composer-connector-remove]")) {
        clearActiveConnector(session.id);
        getInput()?.focus();
        return;
      }

      const rewritePost = event.target.closest("[data-post-rewrite]");
      if (rewritePost) {
        const input = getInput();
        if (!input) return;
        input.value = "Rewrite this post with a sharper hook and one concrete proof point.";
        input.focus();
        return;
      }

      // Inline clip-extraction card "Open clips" button — after P0
      // unification, the CTA opens the Outputs panel (Clips tab) rather
      // than the modal; the modal is reserved for per-clip trim editing.
      const openClipsBtn = event.target.closest("[data-clip-card-open]");
      if (openClipsBtn) {
        event.preventDefault();
        openClipsPanel();
        return;
      }

      // A date in a schedule plan → the schedule modal on the plan's drafts.
      const planEdit = event.target.closest("[data-schedule-plan-edit]");
      if (planEdit) {
        event.preventDefault();
        openPlanInModal(session.id, planEdit.dataset.schedulePlanEdit);
        return;
      }

      // Inline reference in Archie's message (chat-refs.js) → open that draft,
      // idea or source in the right panel.
      const chatRef = event.target.closest("[data-chat-ref]");
      if (chatRef) {
        event.preventDefault();
        const [kind, id] = chatRef.dataset.chatRef.split(/:(.*)/s);
        focusInPanel(kind, id);
        return;
      }

      // "Ideas ready" result card → open the Ideas panel (same family as the
      // clips / drafts result cards).
      const openIdeasCard = event.target.closest("[data-ideas-card-open]");
      if (openIdeasCard) {
        event.preventDefault();
        openIdeasPanel();
        return;
      }

      // "Processed · N ideas" link inside a source-intake bubble — opens
      // the Outputs panel. Same destination as the topbar Outputs pill;
      // gives users a direct path from the source they just attached to
      // the ideas extracted from it.
      const openIdeasLink = event.target.closest("[data-source-intake-open-ideas]");
      if (openIdeasLink) {
        event.preventDefault();
        event.stopPropagation();
        openIdeasPanel();
        return;
      }

      // "M clips" link inside a video source-intake bubble — opens the
      // Outputs panel on the Clips sub-tab.
      const openClipsLink = event.target.closest("[data-source-intake-open-clips]");
      if (openClipsLink) {
        event.preventDefault();
        event.stopPropagation();
        openClipsPanel();
        return;
      }

      // × on a composer mention pill — remove that source from the
      // session's composer-mentions state.
      const mentionRemove = event.target.closest("[data-composer-mention-remove]");
      if (mentionRemove) {
        event.preventDefault();
        event.stopPropagation();
        removeComposerMention(session.id, mentionRemove.dataset.composerMentionRemove);
        return;
      }

      // Composer "@ Mention" toolbar button — toggles the picker popup.
      const mentionTrigger = event.target.closest("[data-composer-mention-trigger]");
      if (mentionTrigger) {
        event.preventDefault();
        event.stopPropagation();
        toggleMentionPicker(root, session.id);
        return;
      }

      // Pick a source from the picker → add as pill, close the picker,
      // return focus to the textarea so the user can keep typing.
      const pickSource = event.target.closest("[data-mention-pick-source]");
      if (pickSource) {
        event.preventDefault();
        event.stopPropagation();
        const src = getSources(session.id).find((s) => s.id === pickSource.dataset.mentionPickSource);
        if (src) addComposerMention(session.id, src.filename);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Pick an idea from the picker → same flow as sources.
      const pickIdea = event.target.closest("[data-mention-pick-idea]");
      if (pickIdea) {
        event.preventDefault();
        event.stopPropagation();
        const idea = getIdeas(session.id).find((i) => i.id === pickIdea.dataset.mentionPickIdea);
        if (idea) addComposerMention(session.id, idea.title);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Pick a connector from the "/" command dropdown → strip the "/"
      // trigger token, attach the connector chip (askConnector → the
      // composer-connector subscriber paints the chip), then the next
      // message routes via sendConnectorMessage() (the MCP round-trip).
      const pickConnector = event.target.closest("[data-mention-pick-connector]");
      if (pickConnector) {
        event.preventDefault();
        event.stopPropagation();
        removeSlashToken(getInput());
        askConnector(session.id, pickConnector.dataset.mentionPickConnector);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Click anywhere outside the picker / trigger → close it. This
      // runs last so the picks above still fire when clicking a row.
      const picker = root.querySelector("[data-composer-mention-picker]");
      if (picker && !picker.hidden) {
        const insidePicker = event.target.closest("[data-composer-mention-picker]");
        const onTrigger = event.target.closest("[data-composer-mention-trigger]");
        if (!insidePicker && !onTrigger) {
          closeMentionPicker(root);
        }
      }

      // Paper-clip in the composer — toggle the dropdown menu open/closed.
      // The menu offers three scripted "Add PDF/Video/URL" quick-actions.
      if (event.target.closest("[data-assistant-attach-toggle]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = !menu.hidden;
        return;
      }

      // Pick a playbook for this chat — bind it to the session and re-render
      // just the control in place (keeps the textarea + its text). The
      // <details> open/close is owned by the native element; we just need
      // to keep the closing-on-outside-click logic below.
      const pbPick = event.target.closest("[data-playbook-pick]");
      if (pbPick) {
        event.preventDefault();
        // Was this chat locked out? Then picking an accessible Playbook is the
        // way back in, and the whole screen has to come back with it — swapping
        // the control alone would leave a dead composer under a live picker.
        const wasRevoked = !!revokedContextFor(session);
        session.contextId = pbPick.dataset.playbookPick;
        if (wasRevoked) {
          // Through the URL, like startBatchChat does: the router re-runs the
          // handler on a query-only change, so the whole screen comes back with
          // a live composer instead of a dead one under a fresh picker.
          setHashQuery(`/session/${session.id}`, { contextId: session.contextId });
          return;
        }
        // The hero's "Fresh topics" list is scoped to the chat's Playbook, so
        // swapping the Playbook has to swap the list with it — otherwise the
        // reader is looking at another brand's Topics under a control that now
        // names this one. Only when the hero is actually mounted: a started
        // conversation must not re-render its whole aside for a Playbook pick.
        if (root.querySelector("[data-empty-chat] .empty-chat__topics")) {
          refreshAssistantAside();
          return;
        }
        const container = root.querySelector("[data-composer-playbook]");
        if (container) container.outerHTML = renderPlaybookControl(getContextById(session.contextId), true);
        return;
      }

      // "Create a playbook" from the picker — spawn a fresh context-builder
      // session (mirrors the /contexts new-playbook entry) and return to the
      // chat once saved, where the new playbook becomes the default.
      if (event.target.closest("[data-playbook-create]")) {
        event.preventDefault();
        // Same integrated conversational Playbook flow as the /contexts
        // "New Playbook" CTA — runs in the app shell, returns to this chat.
        try {
          window.sessionStorage.setItem("welcomeAltIntegrated", "1");
          window.sessionStorage.setItem("welcomeAltReturnTo", "/");
        } catch {
          /* ignore */
        }
        setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: "/" });
        navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
        return;
      }

      // A connected connector in the paper-clip menu → query it live in this
      // chat (no navigation). Same flow as the right-panel "Ask".
      const attachConn = event.target.closest("[data-attach-connector]");
      if (attachConn) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        askConnector(session.id, attachConn.dataset.attachConnector);
        return;
      }

      // "Browse connectors" (bottom of the menu) → open the connectors gallery
      // modal scoped to this chat. This is the only place connecting is offered
      // from the composer.
      if (event.target.closest("[data-open-connectors]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        openConnectorsModal({ currentSessionId: session.id });
        return;
      }

      // Quick scripted attach items inside the paper-clip menu.
      const addSrcItem = event.target.closest("[data-add-source]");
      if (addSrcItem) {
        event.preventDefault();
        const kind = addSrcItem.dataset.addSource;
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        // "Top performing posts" isn't a source — it launches the repurpose flow
        // INLINE in this conversation (account Quickpicker → in-chat post-selection
        // widget → angle/scope/profile steps), never the full-screen studio.
        if (kind === "top-posts") {
          topPostsFlow.startTopPostsInline(session.id);
          return;
        }
        // Neither is a Topic — and it runs INLINE too, the same shape as top
        // posts: one Archie line and an in-thread widget of the feed's draft-ready
        // Topics, the pick attaching to THIS chat. Scoped to the CHAT'S OWN
        // Playbook — a chat keeps the brand it was created in, so there is no
        // "which Playbook" step first.
        if (kind === "topic") {
          startTopicPickerInline(session.id, session);
          return;
        }
        // URL + Paste text need the modal UI (a URL field / textarea) — open
        // the modal on the matching tab. The URL modal is where link-service
        // detection + the "connect this service first" prompt live, so adding
        // a link from the composer routes through it too. The scripted kinds
        // (pdf / video) still attach a demo source inline.
        if (kind === "text") {
          openAddSourceModal({ tab: "pasteText", currentSessionId: session.id });
        } else if (kind === "url") {
          openAddSourceModal({ tab: "url", currentSessionId: session.id });
        } else {
          startPillFromKind(root, session, kind);
        }
        return;
      }

      // A row in the hero's "Fresh topics" list — opens the article, it does not
      // choose the Topic. Reading comes before deciding, and the dialog's own
      // footer is where the deciding happens.
      // The verb ON a Fresh-topics card. Checked before the body's hook for
      // reading order only — the button is a SIBLING of the body button, so
      // closest() could never confuse the two.
      const freshUse = event.target.closest("[data-topic-use]");
      if (freshUse) {
        useTopicInChat(freshUse.dataset.topicUse);
        return;
      }

      const freshRow = event.target.closest("[data-topic-read]");
      if (freshRow) {
        openTopicArticle(freshRow.dataset.topicRead);
        return;
      }

      // Click outside the paper-clip menu → close it.
      if (!event.target.closest(".assistant-attach")) {
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu && !menu.hidden) menu.hidden = true;
      }

      // Click outside the playbook control → close its picker. The
      // <details> element drives its own open state, so closing means
      // dropping the `open` attribute.
      if (!event.target.closest(".composer-playbook")) {
        const details = root.querySelector("[data-composer-playbook]");
        if (details && details.tagName === "DETAILS" && details.open) {
          details.removeAttribute("open");
        }
      }
    },
    { signal },
  );

  // Auto-grow the composer textarea as the user types — fires on
  // every input event (typing, paste, IME composition end, …) and
  // pegs the height to the current scrollHeight. CSS caps it via
  // max-height so the chrome can't be pushed off-screen.
  root.addEventListener(
    "input",
    (event) => {
      if (!event.target.matches("#assistantInput")) return;
      autosizeInput(event.target);
    },
    { signal },
  );

  // The in-chat selection widgets (top posts, topics) use DS radios — a native
  // single-select group — so a pick arrives as a `change` (click or keyboard).
  // Sync the store, reflect the checked row in place (no whole-thread re-render
  // → no image reload / scroll reset), and enable the confirm CTA. One helper,
  // two widgets.
  const syncWidgetRows = (widget, rowSelector, ctaSelector) => {
    widget?.querySelectorAll(rowSelector).forEach((row) => {
      row.classList.toggle("is-selected", !!row.querySelector("input[type=radio]")?.checked);
    });
    const cta = widget?.querySelector(ctaSelector);
    if (cta) cta.disabled = false;
  };
  root.addEventListener(
    "change",
    (event) => {
      const postRadio = event.target.closest("[data-topposts-widget-radio]");
      if (postRadio && !postRadio.disabled) {
        toggleTopPostsWidgetPick(session.id, postRadio.dataset.toppostsWidgetRadio);
        syncWidgetRows(
          postRadio.closest("[data-topposts-widget]"),
          ".top-posts-widget__row",
          "[data-topposts-widget-confirm]",
        );
        return;
      }
      const topicRadio = event.target.closest("[data-topics-widget-radio]");
      if (topicRadio && !topicRadio.disabled) {
        toggleTopicsWidgetPick(session.id, topicRadio.dataset.topicsWidgetRadio);
        syncWidgetRows(
          topicRadio.closest("[data-topics-widget]"),
          ".topics-widget__row",
          "[data-topics-widget-confirm]",
        );
      }
    },
    { signal },
  );

  root.addEventListener(
    "keydown",
    (event) => {
      if (!event.target.matches("#assistantInput")) return;
      // When the @mention picker is open, arrow keys / Enter / Escape
      // drive the picker instead of the textarea — same pattern as the
      // search modal. Checked first so Enter selects a mention rather
      // than submitting the message.
      const pickerEl = root.querySelector("[data-composer-mention-picker]");
      const pickerOpen = pickerEl && !pickerEl.hidden;
      if (pickerOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          mentionHighlightIndex += 1;
          syncMentionHighlight(pickerEl);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          mentionHighlightIndex -= 1;
          syncMentionHighlight(pickerEl);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          activateHighlightedMention(pickerEl);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMentionPicker(root);
          return;
        }
        // Tab away — close the picker so the textarea behaves like a
        // normal input again. Don't preventDefault: focus should still
        // move to the next composer button.
        if (event.key === "Tab") {
          closeMentionPicker(root);
          return;
        }
      }
      // Cmd/Ctrl+Enter sends from anywhere in the textarea (matches Claude.ai
      // and the handoff README spec). Plain Enter (no shift, no modifier)
      // also sends — preserves the archie default. Shift+Enter newlines.
      const isCmdEnter = event.key === "Enter" && (event.metaKey || event.ctrlKey);
      const isPlainEnter =
        event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isCmdEnter || isPlainEnter) {
        event.preventDefault();
        submitInput();
        return;
      }
      // Typing "@" opens the mention picker. The "@" character itself is
      // still inserted into the textarea (we don't preventDefault) — same
      // behaviour Slack / Linear use. Escape closes the picker.
      if (event.key === "@") {
        openMentionPicker(root, session.id);
        return;
      }
      // Typing "/" opens the connector command picker — but only when the
      // connectors feature is on, at least one connector is connected, and
      // the caret is at start-of-token (input empty or preceded by
      // whitespace), so "/" inside URLs/dates is left alone. The "/" char
      // itself is still inserted (no preventDefault).
      if (event.key === "/" && isFlagOn("connectors") && getConnectedConnectors().length > 0) {
        const el = event.target;
        const caret = el.selectionStart ?? el.value.length;
        const prevChar = caret > 0 ? el.value.charAt(caret - 1) : "";
        if (caret === 0 || /\s/.test(prevChar)) {
          openMentionPicker(root, session.id, "command");
        }
        return;
      }
    },
    { signal },
  );

  // Mouse hover over a picker row updates the highlight, so keyboard
  // + mouse stay in sync (mirrors search-modal.js behaviour).
  root.addEventListener(
    "mousemove",
    (event) => {
      const row = event.target.closest("[data-mention-row-index]");
      if (!row) return;
      const picker = row.closest("[data-composer-mention-picker]");
      if (!picker || picker.hidden) return;
      const idx = Number(row.dataset.mentionRowIndex);
      if (idx === mentionHighlightIndex) return;
      mentionHighlightIndex = idx;
      syncMentionHighlight(picker);
    },
    { signal },
  );

  // Content workspace: live search input + sort dropdown. These update the
  // module-level contentState and re-render just the list body so the input
  // cursor and focus are preserved.
  root.addEventListener(
    "input",
    (event) => {
      if (event.target.matches("[data-content-search]")) {
        contentState.q = event.target.value;
        rerenderContentWorkspace(root, session);
      }
      // Inline-question searchable picker — persist the query (no re-render; the
      // shared _analyse-common delegate filters rows live). Persisting means an
      // interaction-driven re-render (single-select highlight, stepper ±) keeps
      // the filter instead of snapping back to the full list.
      if (event.target.matches("[data-inline-question-search]")) {
        inlineQuestion.setSearch(session.id, event.target.value);
      }
      // Clip Studio — instructions textarea. Store silently (mutate state
      // without notify) so typing doesn't trigger a full aside re-render.
      if (event.target.matches('[data-clip-config="instructions"]')) {
        const cs = clipStudio.getState(session.id);
        if (cs) cs.config.instructions = event.target.value;
      }
      // Clip Studio — profiles-step live search. Filter the rendered rows in
      // place (no re-render → the field keeps focus); persist the query in
      // state so a checkbox-toggle re-render re-applies it.
      if (event.target.matches("[data-clip-profile-search]")) {
        clipStudio.setProfileSearch(session.id, event.target.value);
        const q = event.target.value.trim().toLowerCase();
        const list = root.querySelector(".clip-studio__profiles");
        let visible = 0;
        list?.querySelectorAll("[data-search]").forEach((row) => {
          const match = !q || row.dataset.search.includes(q);
          row.classList.toggle("is-hidden", !match);
          if (match) visible += 1;
        });
        const empty = list?.querySelector(".clip-studio__profiles-empty");
        if (empty) empty.hidden = visible !== 0;
      }
    },
    { signal },
  );
  root.addEventListener(
    "change",
    (event) => {
      if (event.target.matches("[data-content-sort]")) {
        contentState.sort = event.target.value;
        rerenderContentWorkspace(root, session);
      }
      // Clip Studio — a video picked via the upload-stage file input.
      if (event.target.matches("[data-clip-studio-file]") && event.target.files?.length) {
        handleClipStudioFile(session, event.target.files[0]);
      }
      // Batch Studio — one or more files picked via the upload file input.
      if (event.target.matches("[data-batch-file]") && event.target.files?.length) {
        handleBatchFiles(session, event.target.files);
        event.target.value = ""; // allow re-picking the same file
      }
      // Clip Studio — clip duration select.
      if (event.target.matches('[data-clip-config="duration"]')) {
        clipStudio.setConfig(session.id, { duration: event.target.value });
      }
      // Clip Studio — clip selection checkbox (review grid).
      const selCb = event.target.closest("[data-clip-select]");
      if (selCb) {
        clipStudio.toggleClip(session.id, selCb.dataset.clipSelect);
      }
      // Clip Studio — profile selection checkbox (profiles step).
      const profCb = event.target.closest("[data-clip-profile]");
      if (profCb) {
        clipStudio.toggleProfile(session.id, profCb.dataset.clipProfile);
      }
    },
    { signal },
  );

  // Clip Studio — the upload-stage "Paste a URL" form submit.
  root.addEventListener(
    "submit",
    (event) => {
      if (event.target.closest("[data-clip-studio-url-form]")) {
        event.preventDefault();
        const input = root.querySelector("[data-clip-studio-url]");
        const url = (input?.value || "").trim();
        if (url) handleClipStudioUrl(session, url);
      }
    },
    { signal },
  );
}
