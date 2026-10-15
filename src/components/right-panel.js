import { html, raw } from "../utils.js?v=1851";
import { subscribe as subscribeThread } from "../assistant.js?v=1851";
import { isFlagOn } from "../feature-flags.js?v=1851";
import { getPath, navigate } from "../router.js?v=1851";
import { parseHashParams, setHashQuery } from "../url-state.js?v=1851";
import {
  getPosts,
  attachImageToDraft,
  updatePostClip,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=1851";
import { onFeedbackClick } from "./feedback-control.js?v=1851";
// Shared compact idea card — same component the standalone Ideas page uses.
import { open as openVideoClipsModal } from "./video-clips-modal.js?v=1851";
import { isSidebarCollapsed, setSidebarCollapsed, isAutoCollapsed } from "./sidebar.js?v=1851";
import {
  getSources as getStreamSources,
  subscribeSources,
  updateSourceClips,
  removeSources,
  renameSource,
} from "../sources-stream.js?v=1851";
import { open as openAddSourceModal } from "./add-source-modal.js?v=1851";
import { open as openRenameModal } from "./rename-modal.js?v=1851";
import { askConnector } from "../connector-ask.js?v=1851";
import { open as openConnectorsModal } from "./connectors-modal.js?v=1851";
import { addMention as addComposerMention } from "../composer-mentions.js?v=1851";
import { getIdeas, removeIdeasForSources } from "../library.js?v=1851";

// The ideas of the chat the panel is looking at.
//
// This used to be `mocks.ideas` — a flat union of EVERY session's ideas — so a
// chat's Ideas tab listed other chats' ideas, and its counts were the account's,
// not the conversation's. Ideas belong to the session that produced them
// (docs/reference/CONCEPTS.md §3), so the panel reads them from that session.
// Resolved per call rather than cached: the panel outlives any single route,
// and `activeSessionId()` is what tells it which chat is on screen. First-time
// mode needs no special case — library.js seeds empty there.
export function sessionIdeas() {
  const sid = activeSessionId();
  return sid ? getIdeas(sid) : [];
}
import { open as openConfirmModal } from "./confirm-modal.js?v=1851";
import { showToast } from "./toast.js?v=1851";
import { closeAllSourceMenus, renderSourcesView } from "./right-panel/sources-view.js?v=1851";
import {
  collectAllClips,
  renderIdeasView,
  toggleClipWhyInPlace,
  toggleIdeaFeedback,
  toggleWhyOpen,
} from "./right-panel/ideas-view.js?v=1851";
import {
  cancelEdit,
  closeAllRewriteMenus,
  commitEdit,
  cssEscape,
  editingPostId,
  onPostDelete,
  onPostImage,
  onPostImageRemove,
  onPostImageUpload,
  onPostMention,
  onPostRewrite,
  onPostSaveAsDraft,
  onPostSchedule,
  onPostStudio,
  onSectionDelete,
  onSectionSave,
  onSectionSchedule,
  renderDraftsView,
  selectedDraftIds,
  setDraftsFilter,
  setDraftsNetwork,
  setNetworkSelection,
  startEdit,
  visibleNetworkPosts,
} from "./right-panel/drafts-view.js?v=1851";

// Global Right Panel — slides in from the right edge of the viewport, overlays
// the session workspace, hosts two modes:
//   • 'drafts' — the AI's batch result (editable BatchCards, network-grouped,
//                Schedule N posts CTA).
//   • 'ideas'  — compact searchable Ideas library that injects a chosen idea
//                into the chat (Lot 5).
//
// State lives module-local; subscribers (the in-thread Drafts summary card,
// any future topbar pills, the assistant bubble) notify on transitions.
//
// Lot 4.2 — DraftsView renders network-grouped BatchCards from the active
// batch's assistant message. Selection state lives in this module and
// resets per batch. The Schedule button is wired but the modal lands in
// Lot 9; until then it shows a toast.

const PANEL_ID = "rightPanel";

// Resize-handle bounds. The width is now driven by the (viewport −
// sidebar) / 2 formula in layout.css ; the runtime override is only
// set transiently while the user drags the handle and is reset on
// every panel open so the formula reasserts as the canonical default.
const PANEL_MIN_WIDTH = 380;
const PANEL_MAX_RIGHT_GAP = 400; // leave at least this much for sidebar+content
const DRAFT_INLINE_EDIT_FLAG = "draftInlineEdit";

// Ideas-mode local UI state — filter chip + search query + sort axis +
// the id of the single card currently expanded (accordion: only one open
// at a time). Survives across renderPanel() calls but is reset when the
// panel re-opens in a fresh session via renderIdeasBodyOnly().
export let ideasFilter = "all";

// Outputs sub-view inside Ideas mode — "ideas" or "clips". Unifies the
// two AI-extracted output types of a source under one persistent surface
// so users keep their workflow continuity (PDF 06.B flow). When the
// session's sources gain clips for the first time, the panel auto-flips
// to the Clips tab so the result feels surfaced rather than buried.
export let outputsView = "ideas";

// Per-clip selection inside the Clips tab — Set<clipId>. Multi-select
// drives the sticky footer "Draft posts from N clips" CTA.
export let clipSelection = new Set();

let state = {
  mode: null, // 'drafts' | 'ideas' | 'sources' | null
  activeBatchRef: null, // { sessionId, messageId } | null
};

// ── URL persistence ───────────────────────────────────────────────────
// The user-facing panel modes (drafts / ideas / sources) are encoded in
// the hash query as `?panel=<mode>` so the panel re-opens on reload and
// deep-links work.
const VALID_URL_MODES = new Set(["drafts", "ideas", "sources"]);

function writeUrlPanel(mode) {
  const params = parseHashParams();
  if (mode && VALID_URL_MODES.has(mode)) {
    params.set("panel", mode);
  } else {
    params.delete("panel");
  }
  setHashQuery(getPath(), Object.fromEntries(params));
}

function readUrlPanel() {
  const m = parseHashParams().get("panel");
  return VALID_URL_MODES.has(m) ? m : null;
}

// Sync internal state to the URL `panel` param. Called on boot AND on
// hashchange so back/forward buttons work. No-op when state already
// matches (avoids infinite write → hashchange → write loops).
// Skipped off-session — the panel is a session-scoped affordance, so a
// stray `?panel=drafts` on /contexts shouldn't pop the panel.
function syncFromUrl() {
  if (!/^\/session\//.test(getPath())) {
    // The panel is a session-scoped affordance — close it when navigating
    // off a session (Playbooks, Settings, Dashboard…). skipUrl so we don't
    // rewrite the new route's hash.
    if (state.mode) closePanel({ skipUrl: true });
    return;
  }
  const urlMode = readUrlPanel();
  if (urlMode === state.mode) return;
  if (urlMode === "drafts") openDrafts(null);
  else if (urlMode === "ideas") openIdeas();
  else if (urlMode === "sources") openSources();
  else if (state.mode && VALID_URL_MODES.has(state.mode)) closePanel();
}

// Per-batch selection — Map<"sessionId::messageId", Set<postId>>. Defaults
// to all-selected the first time a batch is shown so the Schedule CTA is
// active out of the box.
// Subscriber bookkeeping — when the panel is open in Drafts mode we listen
// to the assistant thread so the panel re-renders when the batch's status
// changes (e.g. additional drafts land).
let unsubscribeActiveThread = null;
const subs = new Set();

function notify() {
  for (const fn of subs) fn(state);
}

export function canDraftInlineEdit() {
  return isFlagOn(DRAFT_INLINE_EDIT_FLAG);
}

export function getMode() {
  return state.mode;
}

export function getActiveBatchRef() {
  return state.activeBatchRef;
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Minimum comfortable width for the chat column. Only when opening the
// panel alongside an expanded sidebar would squeeze the conversation below
// this floor do we auto-collapse the sidebar to claw back room. On a wide
// viewport there's plenty of space, so the sidebar stays put.
const CHAT_MIN_WIDTH_PX = 560;
// Floor of the panel-width formula in layout.css (max(610px, …)). Mirrored
// here so the predicted chat width matches the rendered grid.
const PANEL_FORMULA_FLOOR_PX = 610;

// Predict the chat column's width *if the sidebar were to stay expanded*
// while the panel is open, mirroring the layout.css grid formula:
//   chat = viewport − sidebar(expanded) − panel
// where panel = the user's drag override if set, else
//   max(PANEL_FORMULA_FLOOR, (viewport − sidebar) / 3).
// Computed (not measured) so it's immune to the grid-template-columns
// transition still being mid-flight when we're called on open.
function predictedChatWidthWithSidebarExpanded() {
  const shell = document.getElementById("appShell");
  const vw = window.innerWidth;
  const css = getComputedStyle(document.documentElement);
  const sidebar = parseFloat(css.getPropertyValue("--app-sidebar-width")) || 260;
  const override = shell?.style.getPropertyValue("--app-right-panel-width-runtime");
  const panel = override ? parseFloat(override) : Math.max(PANEL_FORMULA_FLOOR_PX, (vw - sidebar) / 3);
  return vw - sidebar - panel;
}

// Auto-collapse the sidebar only when the chat column would otherwise dip
// below CHAT_MIN_WIDTH_PX. Marked `auto` so a later widen can undo it (see
// syncSidebarToWidth). We don't run on mode swaps inside an already-open
// panel — only on the closed → open transition (and on resize).
function maybeCollapseSidebar() {
  if (!state.mode) return;
  if (isSidebarCollapsed()) return;
  if (predictedChatWidthWithSidebarExpanded() >= CHAT_MIN_WIDTH_PX) return;
  setSidebarCollapsed(true, { auto: true });
}

// Keep the sidebar in step with the viewport while a panel is open: collapse
// when the chat would get cramped, and re-expand when there's room again —
// but only if *we* collapsed it (isAutoCollapsed). A sidebar the user closed
// by hand stays closed. Closing the panel deliberately doesn't restore here
// (the user re-opens manually), so this is a no-op without an open panel.
function syncSidebarToWidth() {
  if (!state.mode) return;
  const roomy = predictedChatWidthWithSidebarExpanded() >= CHAT_MIN_WIDTH_PX;
  if (!roomy) {
    maybeCollapseSidebar();
  } else if (isAutoCollapsed()) {
    setSidebarCollapsed(false, { auto: true });
  }
}

function maybeCollapseSidebarOnOpen(prevMode) {
  if (prevMode !== null) return; // mode swap, not an open
  maybeCollapseSidebar();
}

// Track the element that had focus when the panel opened so we can
// return focus to it on close. Only captured on a fresh open (prev=null);
// mode swaps reuse the original snapshot.
let lastFocusBeforeOpen = null;

function snapshotFocusOnOpen(prevMode) {
  if (prevMode !== null) return;
  const active = document.activeElement;
  lastFocusBeforeOpen = active instanceof HTMLElement ? active : null;
}

function restoreFocusOnClose() {
  const target = lastFocusBeforeOpen;
  lastFocusBeforeOpen = null;
  if (!target || typeof target.focus !== "function") return;
  if (!document.body.contains(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    // ignore — element may have been removed mid-frame
  }
}

// Open in Drafts mode pinned to a specific assistant message in a session.
// Called by the in-thread Drafts summary card (Lot 4.3).
export function openDrafts(activeBatchRef) {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { mode: "drafts", activeBatchRef: activeBatchRef || state.activeBatchRef };
  maybeCollapseSidebarOnOpen(prev);
  rebindThread();
  renderPanel();
  notify();
  writeUrlPanel("drafts");
}

export function openIdeas() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "ideas" };
  outputsView = "ideas";
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("ideas");
}

// Same surface as openIdeas (mode: "ideas"), but lands the user on the
// Clips sub-tab. Used by the source-intake bubble's "M clips" pill so
// the user goes directly to the clips view for the source they just
// attached.
export function openClips() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "ideas" };
  outputsView = "clips";
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("ideas");
}

// Sources mode — shows the list of sources currently attached to the
// active session. Distinct surface from Outputs (Ideas/Clips) since a
// source is an INPUT to the conversation, not an AI-generated output.
// An inline reference in Archie's message (chat-refs.js) was clicked: open the
// panel on the object's own surface, then pulse + scroll to its card.
const FOCUS_ATTR = { post: "data-post-id", idea: "data-idea-id", source: "data-source-id" };
export function focusInPanel(kind, id) {
  if (!FOCUS_ATTR[kind]) return;
  if (kind === "post") openDrafts();
  else if (kind === "idea") openIdeas();
  else openSources();
  pulseInPanel(`[${FOCUS_ATTR[kind]}="${CSS.escape(id)}"]`);
}

// Wait for the panel re-render, then pulse the target card (`.is-focused`).
function pulseInPanel(selector) {
  requestAnimationFrame(() => {
    const card = document.querySelector(".app-right-panel")?.querySelector(selector);
    if (!card) return;
    card.classList.remove("is-focused");
    void card.offsetWidth;
    card.classList.add("is-focused");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

export function openSources() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "sources" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("sources");
}

export function closePanel({ skipUrl = false } = {}) {
  const wasUserMode = VALID_URL_MODES.has(state.mode);
  state = { ...state, mode: null };
  if (unsubscribeActiveThread) {
    unsubscribeActiveThread();
    unsubscribeActiveThread = null;
  }
  renderPanel();
  notify();
  // Only clear the `panel` URL param if we were in a user-toggleable mode.
  // `skipUrl` is used when closing as a side-effect of navigating off a
  // session — the new route owns the URL, we mustn't rewrite it.
  if (wasUserMode && !skipUrl) writeUrlPanel(null);
  // Return focus to the element that had it before the panel opened so
  // keyboard users don't get marooned. Modal-coordinator does this
  // automatically for modals; the right-panel is a push panel so we
  // mirror the pattern here.
  restoreFocusOnClose();
}

function setMode(mode) {
  if (mode !== "drafts" && mode !== "ideas") return;
  state = { ...state, mode };
  rebindThread();
  renderPanel();
  notify();
}

// Subscribe to the active session's thread so the panel reflects late-
// landing batch changes. Tear down + re-create on every mode flip / batch
// switch so we never leak listeners across sessions.
function rebindThread() {
  if (unsubscribeActiveThread) {
    unsubscribeActiveThread();
    unsubscribeActiveThread = null;
  }
  if (state.mode !== "drafts" || !state.activeBatchRef?.sessionId) return;
  unsubscribeActiveThread = subscribeThread(state.activeBatchRef.sessionId, () => {
    if (state.mode === "drafts") renderPanel();
  });
}

export function init() {
  let el = document.getElementById(PANEL_ID);
  if (!el) {
    el = document.createElement("aside");
    el.id = PANEL_ID;
    el.className = "app-right-panel";
    // The aria-label is updated per mode in renderPanel() below — this
    // is just the initial value for when the panel is hidden.
    el.setAttribute("aria-label", "Side panel");
    el.hidden = true;
    // Lot 17.d — mount inside #appShell so the panel becomes a grid cell
    // (row 2, column 3). Falls back to <body> if the shell isn't there yet
    // (shouldn't happen in normal boot order, but defensive).
    const shell = document.getElementById("appShell") || document.body;
    shell.appendChild(el);
  }
  // Drop any leftover persisted width from the pre-formula era so the
  // (viewport − sidebar) / 2 default takes hold on first paint.
  resetPanelWidthOverride();

  // Resize handle — mousedown begins drag, document-level mousemove +
  // mouseup tracks until release.
  el.addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-rpanel-resize]")) {
      startResizeDrag(event);
    }
  });

  // Drag & drop an image straight onto a draft's empty media slot.
  //
  // Delegated on the panel root so it survives every re-render, and DRAG EVENTS
  // ONLY — `bindDropzone` is deliberately not used here because its click
  // handler fires the file input for any click inside the zone, which would make
  // pressing Generate open a file picker.
  //
  // dragenter/dragover must both preventDefault or the browser refuses the drop
  // and navigates to the file instead. `dragleave` fires when moving onto a
  // CHILD, so it only clears the highlight once the pointer has actually left
  // the slot's box (relatedTarget check).
  const dropSlot = (event) => event.target.closest?.("[data-post-drop]");
  const overDrag = (event) => {
    const slot = dropSlot(event);
    if (!slot) return;
    event.preventDefault();
    slot.classList.add("is-dragover");
  };
  el.addEventListener("dragenter", overDrag);
  el.addEventListener("dragover", overDrag);
  el.addEventListener("dragleave", (event) => {
    const slot = dropSlot(event);
    if (!slot) return;
    if (event.relatedTarget && slot.contains(event.relatedTarget)) return;
    slot.classList.remove("is-dragover");
  });
  el.addEventListener("drop", (event) => {
    const slot = dropSlot(event);
    if (!slot) return;
    event.preventDefault();
    slot.classList.remove("is-dragover");
    const sid = activeSessionId();
    const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith("image/"));
    if (!sid || !file) return;
    // Same throwaway object URL as the file-picker path (onPostImageUpload):
    // never revoked, because the card keeps rendering it as its src.
    attachImageToDraft(sid, slot.dataset.postDrop, URL.createObjectURL(file));
    renderPanel();
  });

  el.addEventListener("click", (event) => {
    // Auto-commit any in-progress edit when the click lands outside the
    // current editor + its Save/Cancel buttons. Falls through so a click
    // on another card's pen icon (or any other action) still routes
    // through the normal handlers below.
    if (canDraftInlineEdit() && editingPostId) {
      const insideCurrent = event.target.closest(
        `[data-post-editor="${editingPostId}"], [data-post-edit-save="${editingPostId}"], [data-post-edit-cancel="${editingPostId}"]`,
      );
      if (!insideCurrent) commitEdit(editingPostId);
    }
    // Dismiss any open regenerate dropdown (#14) on an outside click.
    if (!event.target.closest("[data-post-rewrite-menu], .posts__rewrite-menu")) {
      closeAllRewriteMenus();
    }
    // Shared "how's this?" feedback control (drafts + clip thumbs/reasons).
    // Handled first so the thumb/chip/Send clicks update in place and bail
    // before the per-card action handlers below.
    if (onFeedbackClick(event)) return;
    if (event.target.closest("[data-rpanel-close]")) {
      closePanel();
      return;
    }
    const tab = event.target.closest("[data-rpanel-tab]");
    if (tab) {
      setMode(tab.dataset.rpanelTab);
      return;
    }
    // Drafts filter chips — status + network.
    const filterChip = event.target.closest("[data-rpanel-drafts-filter]");
    if (filterChip) {
      setDraftsFilter(filterChip.dataset.rpanelDraftsFilter);
      renderPanel();
      return;
    }
    const networkChip = event.target.closest("[data-rpanel-drafts-network]");
    if (networkChip) {
      setDraftsNetwork(networkChip.dataset.rpanelDraftsNetwork);
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-drafts-clear]")) {
      setDraftsFilter("all");
      setDraftsNetwork("all");
      renderPanel();
      return;
    }
    // Per-network section bulk actions (live in each section header).
    const sectionSaveBtn = event.target.closest("[data-rpanel-section-save]");
    if (sectionSaveBtn) {
      onSectionSave(sectionSaveBtn.dataset.rpanelSectionSave);
      return;
    }
    const sectionScheduleBtn = event.target.closest("[data-rpanel-section-schedule]");
    if (sectionScheduleBtn) {
      onSectionSchedule(sectionScheduleBtn.dataset.rpanelSectionSchedule);
      return;
    }
    const sectionDeleteBtn = event.target.closest("[data-rpanel-section-delete]");
    if (sectionDeleteBtn) {
      onSectionDelete(sectionDeleteBtn.dataset.rpanelSectionDelete);
      return;
    }
    // Click anywhere on a section band (the separator) toggles select-all
    // for that network — except on the checkbox itself (its native change
    // event owns that) or on a bulk-action button.
    const sectionBand = event.target.closest("[data-rpanel-drafts-band]");
    if (sectionBand && !event.target.closest(".ap-checkbox-container") && !event.target.closest("button")) {
      const network = sectionBand.dataset.rpanelDraftsBand;
      const visible = visibleNetworkPosts(network);
      const allSelected = visible.length > 0 && visible.every((p) => selectedDraftIds.has(p.id));
      setNetworkSelection(network, !allSelected);
      return;
    }
    // Per-card actions on a single draft (Lot 21 rich PostCard).
    const editBtn = event.target.closest("[data-post-edit]");
    if (canDraftInlineEdit() && editBtn) {
      startEdit(editBtn.dataset.postEdit);
      return;
    }
    const saveBtn = event.target.closest("[data-post-edit-save]");
    if (canDraftInlineEdit() && saveBtn) {
      commitEdit(saveBtn.dataset.postEditSave);
      return;
    }
    const cancelBtn = event.target.closest("[data-post-edit-cancel]");
    if (canDraftInlineEdit() && cancelBtn) {
      cancelEdit(cancelBtn.dataset.postEditCancel);
      return;
    }
    const mentionBtn = event.target.closest("[data-post-mention]");
    if (mentionBtn) {
      onPostMention(mentionBtn.dataset.postMention);
      return;
    }
    // Regenerate dropdown (#14) — the sparkles button toggles a menu of
    // rewrite intents (shorter / longer / warmer / more formal / regenerate).
    const rewriteMenuBtn = event.target.closest("[data-post-rewrite-menu]");
    if (rewriteMenuBtn) {
      const id = rewriteMenuBtn.dataset.postRewriteMenu;
      const menu = document.querySelector(`[data-post-rewrite-menu-for="${cssEscape(id)}"]`);
      const willOpen = menu && menu.hidden;
      closeAllRewriteMenus();
      if (menu && willOpen) {
        menu.hidden = false;
        rewriteMenuBtn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const rewriteIntentBtn = event.target.closest("[data-post-rewrite-intent]");
    if (rewriteIntentBtn) {
      closeAllRewriteMenus();
      onPostRewrite(rewriteIntentBtn.dataset.postId, rewriteIntentBtn.dataset.postRewriteIntent);
      return;
    }
    const saveDraftBtn = event.target.closest("[data-post-save-draft]");
    if (saveDraftBtn) {
      onPostSaveAsDraft(saveDraftBtn.dataset.postSaveDraft);
      return;
    }
    const scheduleBtn = event.target.closest("[data-post-schedule]");
    if (scheduleBtn) {
      // The Edit affordance on the scheduled status-card renders as an
      // <a href="#"> per DS pattern — swallow the default so the URL
      // hash doesn't get dirtied when it's clicked.
      if (scheduleBtn.tagName === "A") event.preventDefault();
      onPostSchedule(scheduleBtn.dataset.postSchedule);
      return;
    }
    const delBtn = event.target.closest("[data-post-delete]");
    if (delBtn) {
      onPostDelete(delBtn.dataset.postDelete);
      return;
    }
    const imageBtn = event.target.closest("[data-post-image]");
    if (imageBtn) {
      onPostImage(imageBtn.dataset.postImage);
      return;
    }
    const imageEditBtn = event.target.closest("[data-post-image-edit]");
    if (imageEditBtn) {
      onPostStudio(imageEditBtn.dataset.postImageEdit);
      return;
    }
    const studioBtn = event.target.closest("[data-post-studio]");
    if (studioBtn) {
      onPostStudio(studioBtn.dataset.postStudio);
      return;
    }
    const imageUploadBtn = event.target.closest("[data-post-image-upload]");
    if (imageUploadBtn) {
      onPostImageUpload(imageUploadBtn.dataset.postImageUpload);
      return;
    }
    // The draft's image preset is a Playbook setting: Change opens where it is set.
    const presetBtn = event.target.closest("[data-post-image-preset]");
    if (presetBtn) {
      navigate(`/playbook/${presetBtn.dataset.postImagePreset}?tab=images`);
      return;
    }
    const gapBtn = event.target.closest("[data-post-playbook-gap]");
    if (gapBtn) {
      navigate(`/playbook/${gapBtn.dataset.postPlaybookGap}`);
      return;
    }
    const imageRemoveBtn = event.target.closest("[data-post-image-remove]");
    if (imageRemoveBtn) {
      onPostImageRemove(imageRemoveBtn.dataset.postImageRemove);
      return;
    }
    // "Edit clip" on a draft generated from a video clip — reopen the source
    // clip in the Video Clips modal (single-clip, subtitles tab). Saving
    // persists to the source AND re-syncs this draft's PIP (trim / format /
    // subtitle style) so the card reflects the edit.
    const postClipEditBtn = event.target.closest("[data-post-clip-edit]");
    if (postClipEditBtn) {
      const pid = postClipEditBtn.dataset.postClipEdit;
      const sid = activeSessionId();
      if (!sid) return;
      const post = getPosts(sid).find((p) => p.id === pid);
      const ref = post && post.clipRef;
      if (!ref || !ref.sourceId || !ref.clipId) return;
      const source = getStreamSources(sid).find((s) => s.id === ref.sourceId);
      if (!source) return;
      openVideoClipsModal(source, {
        editingClipId: ref.clipId,
        captionsTab: true,
        clipOverrides: { format: post.format },
        onSaveClips: (srcId, nextClips) => {
          updateSourceClips(srcId, nextClips);
          const edited = (nextClips || []).find((c) => c.id === ref.clipId);
          if (!edited) return;
          updatePostClip(sid, pid, {
            start: edited.start,
            end: edited.end,
            format: edited.format || null,
            subtitleStyle: edited.captionsOn ? edited.captionStyle : "none",
          });
        },
      });
      return;
    }
    // Sources mode — "Attach source" is a 3-method menu; each item opens
    // its own dedicated add-source modal (upload / url / paste text)
    // scoped to the active session. The upload pipeline creates sources
    // directly in this session's list, and the source-stream subscription
    // below repaints the panel.
    const attachMethod = event.target.closest("[data-rpanel-attach-method]");
    if (attachMethod) {
      const sid = activeSessionId();
      if (!sid) return;
      attachMethod.closest("details")?.removeAttribute("open");
      openAddSourceModal({
        tab: attachMethod.dataset.rpanelAttachMethod,
        currentSessionId: sid,
      });
      return;
    }
    // "Connect" in the Live connectors head — open the connectors modal scoped
    // to this chat (Try-in-chat will ask here, no navigation).
    if (event.target.closest("[data-rpanel-open-connectors]")) {
      openConnectorsModal({ currentSessionId: activeSessionId() });
      return;
    }
    // Live connector "Ask" — a connected connector is a queryable live source.
    // Launch the in-chat ask flow and close the panel so the chat is visible.
    const askConnBtn = event.target.closest("[data-rpanel-ask-connector]");
    if (askConnBtn) {
      const sid = activeSessionId();
      const id = askConnBtn.dataset.rpanelAskConnector;
      if (sid && id) {
        askConnector(sid, id);
        closePanel();
      }
      return;
    }
    // Source card kebab (…) — toggle its dropdown, one open at a time.
    const sourceMoreBtn = event.target.closest("[data-rpanel-source-more]");
    if (sourceMoreBtn) {
      const menu = document.getElementById(sourceMoreBtn.getAttribute("aria-controls"));
      const willOpen = !!menu && menu.hidden;
      closeAllSourceMenus(willOpen ? menu : null);
      if (menu) {
        menu.hidden = !willOpen;
        sourceMoreBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      }
      return;
    }
    // Kebab → View clips — open the Video Clips modal in browse mode for this
    // source: every clip cut from the video + "Add clip" to create one
    // manually. Saving persists to the source; "Draft posts" hands the picked
    // clips to the conversational draft flow (ratio → subtitles → profiles).
    const sourceClipsBtn = event.target.closest("[data-rpanel-source-clips]");
    if (sourceClipsBtn) {
      const sid = activeSessionId();
      closeAllSourceMenus();
      if (!sid) return;
      const src = getStreamSources(sid).find((s) => s.id === sourceClipsBtn.dataset.rpanelSourceClips);
      if (!src) return;
      openVideoClipsModal(src, {
        onSaveClips: (id, nextClips) => updateSourceClips(id, nextClips),
        onUseClips: (selectedClips, source) => {
          import("../screens/session/clip-draft-flow.js?v=1851").then(({ startClipDraftFlow }) => {
            startClipDraftFlow(
              sid,
              selectedClips.map((clip) => ({ clip, sourceName: source.filename, sourceId: source.id })),
            );
          });
        },
      });
      return;
    }
    // Kebab → Reanalyze (prototype stub — confirms via toast).
    const reanalyzeBtn = event.target.closest("[data-rpanel-source-reanalyze]");
    if (reanalyzeBtn) {
      const sid = activeSessionId();
      closeAllSourceMenus();
      if (!sid) return;
      const src = getStreamSources(sid).find((s) => s.id === reanalyzeBtn.dataset.rpanelSourceReanalyze);
      showToast(`Reanalyzing ${src?.filename || "source"}…`, { duration: 2600 });
      return;
    }
    // Kebab → Edit name (rename the source via the shared rename modal —
    // the same one used to rename a chat).
    const renameBtn = event.target.closest("[data-rpanel-source-rename]");
    if (renameBtn) {
      const sid = activeSessionId();
      closeAllSourceMenus();
      if (!sid) return;
      const id = renameBtn.dataset.rpanelSourceRename;
      const src = getStreamSources(sid).find((s) => s.id === id);
      openRenameModal({
        title: "Rename source",
        initialName: src?.filename || "",
        placeholder: "Source name",
        confirmLabel: "Save name",
        onSubmit: (name) => renameSource(sid, id, name),
      });
      return;
    }
    // Delete source — destructive: it also removes the ideas derived from
    // this source, so gate it behind a confirm modal with an explicit
    // warning before cascading the removal.
    const sourcesDetachBtn = event.target.closest("[data-rpanel-sources-detach]");
    if (sourcesDetachBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      closeAllSourceMenus();
      const id = sourcesDetachBtn.dataset.rpanelSourcesDetach;
      const src = getStreamSources(sid).find((s) => s.id === id);
      const ideaN = sessionIdeas().filter((i) => Array.isArray(i.sourceIds) && i.sourceIds.includes(id)).length;
      const ideaWarning =
        ideaN > 0 ? ` Its ${ideaN} associated idea${ideaN === 1 ? "" : "s"} will be deleted too.` : "";
      openConfirmModal({
        title: "Delete this source?",
        body: `“${src?.filename || "This source"}” will be removed from this chat.${ideaWarning} This can’t be undone.`,
        confirmLabel: "Delete source",
        danger: true,
        onConfirm: () => {
          // Cascade — drop the ideas derived from this source first, then the
          // source itself (whose removal notifies + repaints the panel). The
          // store owns the cascade: it keeps an idea that ALSO came from another
          // source, which hand-splicing the list here did not.
          removeIdeasForSources(sid, [id]);
          removeSources([id], sid);
        },
      });
      return;
    }
    // Idea link on a source card → switch the panel to Outputs (Ideas tab)
    // and pulse + scroll to that specific idea card so the user lands on it.
    const sourceIdeaLink = event.target.closest("[data-rpanel-source-idea]");
    if (sourceIdeaLink) {
      const ideaId = sourceIdeaLink.dataset.rpanelSourceIdea;
      outputsView = "ideas";
      state = { ...state, mode: "ideas" };
      renderPanel();
      pulseInPanel(`[data-idea-id="${CSS.escape(ideaId)}"]`);
      notify();
      return;
    }
    // Outputs sub-view tab — Ideas | Clips.
    const outputsTab = event.target.closest("[data-rpanel-outputs-tab]");
    if (outputsTab) {
      const next = outputsTab.dataset.rpanelOutputsTab;
      if (next !== outputsView) {
        outputsView = next;
        clipSelection = new Set();
        renderPanel();
      }
      return;
    }
    // Ideas filter chip.
    const chip = event.target.closest("[data-rpanel-ideas-filter]");
    if (chip) {
      ideasFilter = chip.dataset.rpanelIdeasFilter;
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-ideas-clear]")) {
      ideasFilter = "all";
      renderPanel();
      return;
    }
    // Clip selection toggle is a DS checkbox — handled in the `change`
    // delegate below (mirrors the Drafts per-card checkbox), not on click.
    // Clip-card "Edit" affordance (kebab menu item or thumbnail click).
    // Opens the video-clips modal pre-positioned on the target clip so
    // the user lands directly on the trim/preview surface.
    const clipEditBtn = event.target.closest("[data-clip-edit]");
    if (clipEditBtn) {
      const cid = clipEditBtn.getAttribute("data-clip-edit");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (entry && sid) {
        const source = getStreamSources(sid).find((s) => s.id === entry.sourceId);
        if (source) {
          openVideoClipsModal(source, {
            editingClipId: cid,
            onSaveClips: (id, nextClips) => updateSourceClips(id, nextClips),
          });
        }
      }
      return;
    }
    // Clip-card "Remove clip" kebab item — mutates the parent source's
    // clips array via sources-stream. The auto-subscribe in this panel
    // re-renders on the resulting notify.
    const clipRemoveBtn = event.target.closest("[data-clip-remove]");
    if (clipRemoveBtn) {
      const cid = clipRemoveBtn.getAttribute("data-clip-remove");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (entry && sid) {
        const source = getStreamSources(sid).find((s) => s.id === entry.sourceId);
        if (source && Array.isArray(source.clips)) {
          const nextClips = source.clips.filter((c) => c.id !== cid);
          updateSourceClips(source.id, nextClips);
          clipSelection.delete(cid);
        }
      }
      return;
    }
    // (Clip thumbs/reasons feedback is handled by onFeedbackClick above.)
    // "Why this clip" panel — collapse / expand. Toggle the section in
    // place so the user's scroll position survives.
    const clipWhyBtn = event.target.closest("[data-rpanel-clip-why-toggle]");
    if (clipWhyBtn) {
      event.preventDefault();
      toggleClipWhyInPlace(clipWhyBtn.dataset.rpanelClipWhyToggle, clipWhyBtn);
      return;
    }
    // Per-card "Mention" — adds the clip to the composer mention pills
    // for the active session. Same funnel as source/idea mentions so the
    // user can cite a specific clip in their next prompt.
    const clipMentionBtn = event.target.closest("[data-clip-mention]");
    if (clipMentionBtn) {
      const cid = clipMentionBtn.getAttribute("data-clip-mention");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (sid && entry) addComposerMention(sid, entry.clip.title);
      return;
    }
    // Per-card "Draft Post" — kicks off the 3-step quick-picker flow
    // (accounts → aspect ratio → subtitle style) in the session assistant,
    // which then generates one draft per chosen account.
    const clipDraftBtn = event.target.closest("[data-clip-draft]");
    if (clipDraftBtn) {
      const cid = clipDraftBtn.getAttribute("data-clip-draft");
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      const sid = activeSessionId();
      if (!sid || !entry) return;
      const { clip, sourceName, sourceId } = entry;
      import("../screens/session/clip-draft-flow.js?v=1851").then(({ startClipDraftFlow }) => {
        startClipDraftFlow(sid, [{ clip, sourceName, sourceId }]);
      });
      return;
    }
    // Footer CTA — draft posts from the selected clips. Hands the selection to
    // the conversational clip-draft flow (ratio → subtitles → accounts), the
    // same flow the per-card "Draft" button uses, so multi-clip drafting goes
    // through one canonical path that asks the export options once.
    if (event.target.closest("[data-rpanel-clips-draft]")) {
      const sid = activeSessionId();
      if (!sid) return;
      const picked = collectAllClips()
        .filter(({ clip }) => clipSelection.has(clip.id))
        .map(({ clip, sourceName, sourceId }) => ({ clip, sourceName, sourceId }));
      if (picked.length === 0) return;
      clipSelection = new Set();
      renderPanel();
      import("../screens/session/clip-draft-flow.js?v=1851").then(({ startClipDraftFlow }) => {
        startClipDraftFlow(sid, picked);
      });
      return;
    }
    // Bulk delete — destructive, so gate behind the confirm modal (like the
    // drafts section delete), then drop the selected clips from their sources
    // with an Undo toast that restores each source's prior clips array.
    if (event.target.closest("[data-rpanel-clips-delete]")) {
      const sid = activeSessionId();
      if (!sid) return;
      const picked = collectAllClips().filter(({ clip }) => clipSelection.has(clip.id));
      const count = picked.length;
      if (count === 0) return;
      const clipWord = count === 1 ? "clip" : "clips";
      const idsBySource = new Map();
      for (const { clip, sourceId } of picked) {
        if (!idsBySource.has(sourceId)) idsBySource.set(sourceId, new Set());
        idsBySource.get(sourceId).add(clip.id);
      }
      // Snapshot each affected source's full clips array so Undo restores order.
      const snapshot = [...idsBySource.keys()].map((srcId) => {
        const source = getStreamSources(sid).find((s) => s.id === srcId);
        return { srcId, clips: source && Array.isArray(source.clips) ? [...source.clips] : [] };
      });
      openConfirmModal({
        title: `Delete ${count} ${clipWord}?`,
        body: `${count === 1 ? "This clip" : `These ${count} clips`} will be removed from the session. You can undo right after.`,
        confirmLabel: `Delete ${count} ${clipWord}`,
        danger: true,
        onConfirm: () => {
          for (const [srcId, ids] of idsBySource) {
            const source = getStreamSources(sid).find((s) => s.id === srcId);
            if (source && Array.isArray(source.clips)) {
              updateSourceClips(
                srcId,
                source.clips.filter((c) => !ids.has(c.id)),
              );
            }
          }
          clipSelection = new Set();
          renderPanel();
          showToast(`${count} ${clipWord} deleted`, {
            action: {
              label: "Undo",
              onClick: () => {
                for (const { srcId, clips } of snapshot) updateSourceClips(srcId, clips);
                renderPanel();
              },
            },
          });
        },
      });
      return;
    }
    // Mention this idea in the composer.
    const mentionIdeaBtn = event.target.closest("[data-rpanel-mention-idea]");
    if (mentionIdeaBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      const idea = sessionIdeas().find((i) => i.id === mentionIdeaBtn.dataset.rpanelMentionIdea);
      if (idea) addComposerMention(sid, idea.title);
      return;
    }
    // Mention this source in the composer.
    const mentionSourceBtn = event.target.closest("[data-rpanel-mention-source]");
    if (mentionSourceBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      const src = getStreamSources(sid).find((s) => s.id === mentionSourceBtn.dataset.rpanelMentionSource);
      if (src) addComposerMention(sid, src.filename);
      return;
    }
    // Use this idea → opens the count + profile picker flow.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      useIdea(useBtn.dataset.rpanelUseIdea);
      return;
    }
    // Thumbs-up / thumbs-down feedback on an idea card.
    const feedbackBtn = event.target.closest("[data-rpanel-ideas-feedback]");
    if (feedbackBtn) {
      const id = feedbackBtn.dataset.rpanelIdeasFeedback;
      const verdict = feedbackBtn.dataset.verdict;
      toggleIdeaFeedback(id, verdict);
      return;
    }
    // "Why this idea" panel — collapse / expand.
    const whyBtn = event.target.closest("[data-rpanel-idea-why-toggle]");
    if (whyBtn) {
      event.preventDefault();
      toggleWhyOpen(whyBtn.dataset.rpanelIdeaWhyToggle);
      return;
    }
  });
  el.addEventListener("change", (event) => {
    // Per-card multi-select checkbox.
    if (event.target.matches("[data-post-select]")) {
      const id = event.target.dataset.postSelect;
      if (event.target.checked) selectedDraftIds.add(id);
      else selectedDraftIds.delete(id);
      renderPanel();
      return;
    }
    // Per-network "Select all" in a group header — flips every visible
    // draft of that network on or off depending on the new checked state.
    const selectNetworkBox = event.target.matches("[data-rpanel-drafts-select-network]") ? event.target : null;
    if (selectNetworkBox) {
      setNetworkSelection(selectNetworkBox.dataset.rpanelDraftsSelectNetwork, event.target.checked);
      return;
    }
    // Per-clip multi-select checkbox (Clips tab).
    if (event.target.matches("[data-clip-select]")) {
      const cid = event.target.dataset.clipSelect;
      if (event.target.checked) clipSelection.add(cid);
      else clipSelection.delete(cid);
      renderPanel();
      return;
    }
    // Clips "Select all" — toggle every clip in/out of the selection.
    if (event.target.matches("[data-rpanel-clips-select-all]")) {
      const all = collectAllClips().map(({ clip }) => clip.id);
      clipSelection = event.target.checked ? new Set(all) : new Set();
      renderPanel();
      return;
    }
  });
  // Inline-edit shortcuts — scoped to the active editor.
  // Esc cancels (and stops propagation so the document handler below
  // doesn't also close the panel) ; Cmd/Ctrl+Enter saves.
  el.addEventListener("keydown", (event) => {
    if (!canDraftInlineEdit() || !editingPostId) return;
    const editor = event.target.closest(`[data-post-editor="${editingPostId}"]`);
    if (!editor) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit(editingPostId);
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitEdit(editingPostId);
    }
  });
  // Focus moving outside the panel (Tab, click on topbar, etc.) commits
  // any in-progress edit.
  document.addEventListener("focusin", (event) => {
    if (!canDraftInlineEdit() || !editingPostId) return;
    if (el.contains(event.target)) return;
    commitEdit(editingPostId);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Escape first dismisses an open source kebab menu; only closes the
    // panel if no menu is open.
    if (document.querySelector(".rpanel-sources__more-menu:not([hidden])")) {
      closeAllSourceMenus();
      return;
    }
    if (state.mode) closePanel();
  });
  // Click anywhere outside an open source kebab menu closes it.
  document.addEventListener("click", (event) => {
    if (event.target.closest(".rpanel-sources__more-wrap")) return;
    closeAllSourceMenus();
  });

  // Lot 21 — re-render the Drafts view when the active session's posts
  // store mutates (per-card save as draft / delete / image attach). The
  // store's subscribe is per-session, so we re-bind whenever the active
  // session changes via `rebindPostsStore()`.
  rebindPostsStore();
  window.addEventListener("hashchange", rebindPostsStore);

  // Sources stream — sources are now per-session, so we re-bind the
  // subscription whenever the active session changes. The subscriber
  // covers both Sources mode (renders the per-session source list) and
  // the Ideas/Clips Outputs mode (Clips tab + auto-switch on first
  // clip batch).
  let unsubscribeSources = null;
  let lastSourcesSessionId = null;
  let lastClipCount = 0;
  function rebindSourcesSubscription() {
    const sid = activeSessionId();
    if (sid === lastSourcesSessionId) return;
    if (unsubscribeSources) {
      unsubscribeSources();
      unsubscribeSources = null;
    }
    lastSourcesSessionId = sid;
    lastClipCount = sid ? collectAllClips().length : 0;
    if (sid) {
      unsubscribeSources = subscribeSources(sid, () => {
        if (state.mode === "sources" || state.mode === "ideas") {
          const next = collectAllClips().length;
          if (state.mode === "ideas" && next > lastClipCount && lastClipCount === 0) {
            outputsView = "clips";
          }
          lastClipCount = next;
          renderPanel();
        }
      });
    }
    // Re-paint immediately on session change so the panel reflects the
    // new conversation's sources without waiting for the next mutation.
    if (state.mode === "sources" || state.mode === "ideas") {
      renderPanel();
    }
  }
  rebindSourcesSubscription();
  window.addEventListener("hashchange", rebindSourcesSubscription);

  // Keep the sidebar in step with the viewport: collapse when the chat column
  // would dip below CHAT_MIN_WIDTH_PX, re-expand when it widens back (if we
  // were the ones who collapsed it). rAF-debounced so a continuous drag
  // doesn't thrash setSidebarCollapsed.
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncSidebarToWidth();
    });
  });

  // Restore panel mode from the URL hash (`?panel=drafts|ideas|sources`)
  // on boot, and re-sync on every hashchange so back/forward buttons +
  // session navigation honor the URL. The no-op guard in syncFromUrl()
  // breaks the write → hashchange → write loop.
  syncFromUrl();
  window.addEventListener("hashchange", syncFromUrl);
}

// Inline close button — placed as the last item of a mode's first control
// row so it aligns with the tabs / select on the row's flex baseline (no
// absolute positioning, no custom surface — a plain DS icon-button).
export const RPANEL_CLOSE_INLINE = `
  <button
    type="button"
    class="ap-icon-button transparent rpanel-row-close"
    data-rpanel-close
    aria-label="Close panel"
    title="Close panel (Esc)"
  ><i class="ap-icon-close"></i></button>
`;

export function renderPanel() {
  const el = document.getElementById(PANEL_ID);
  if (!el) return;
  // Lot 17.c — toggle the .is-right-panel-open class on the app shell so
  // the main content column reserves space for the panel instead of
  // sitting underneath it. CSS in components/right-panel.css handles the
  // padding-right transition.
  const shell = document.getElementById("appShell");
  if (shell) {
    shell.classList.toggle("is-right-panel-open", !!state.mode);
  }
  if (!state.mode) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  // No standalone title bar — the active mode is already named by the
  // highlighted topbar pill (and, inside the panel, by each mode's own
  // tabs/header row). We only compute a label here to keep the panel
  // landmark's accessible name in sync. The close affordance is a single
  // floating control pinned to the panel's top-right corner across modes.
  let titleText = "Ideas";
  if (state.mode === "drafts") {
    titleText = "Drafts";
  } else if (state.mode === "sources") {
    titleText = "Sources";
  }

  const bodyHtml = `<div class="app-right-panel__body">${
    state.mode === "drafts" ? renderDraftsView() : state.mode === "sources" ? renderSourcesView() : renderIdeasView()
  }</div>`;

  // Preserve scrollTop across re-renders so flipping a filter chip or
  // selecting a draft doesn't yank the user back to the top of a long
  // list. The actual scroll container differs by mode: the Drafts view
  // scrolls on its inner `.rpanel-drafts__feed` (the root keeps a fixed
  // header + footer), while the others scroll on the
  // `.app-right-panel__body` wrapper — capture from whichever is
  // actually scrolled. Keyed by mode so each tab keeps its own position;
  // switching modes restarts at the top.
  const previousBody = el.querySelector(".app-right-panel__body");
  const previousScroller = previousBody?.querySelector(".rpanel-drafts__feed") || previousBody;
  const previousScroll = previousScroller?.scrollTop || 0;
  const previousMode = el.dataset.rpanelLastMode;

  el.dataset.rpanelLastMode = state.mode;
  // Keep the aside's accessible name in sync with the active mode so
  // screen reader users can identify the panel from the landmark list.
  el.setAttribute("aria-label", `${titleText} panel`);
  el.innerHTML = html`
    <div
      class="app-right-panel__resize"
      data-rpanel-resize
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize"
    ></div>
    ${raw(bodyHtml)}
  `;

  if (previousMode === state.mode && previousScroll > 0) {
    const nextBody = el.querySelector(".app-right-panel__body");
    const nextScroller = nextBody?.querySelector(".rpanel-drafts__feed") || nextBody;
    if (nextScroller) {
      requestAnimationFrame(() => {
        nextScroller.scrollTop = previousScroll;
      });
    }
  }
}

// --- Resize handle -----------------------------------------------------

// Drop any inline runtime override on the shell so the next render
// resolves the grid column through the formula default. Called on
// every "fresh open" (state.mode transition from null → something).
// The mode-swap path (e.g. Ideas → Drafts) intentionally keeps the
// override so a user's in-session resize survives the swap.
function resetPanelWidthOverride() {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  shell.style.removeProperty("--app-right-panel-width-runtime");
}

// Drag-to-resize handler bound on the panel root. Tracks mousemove on
// document (not on the handle) so the cursor can leave the 4px strip
// without dropping the drag — same pattern as standard split-pane
// implementations.
let resizeDragging = false;
function startResizeDrag(event) {
  event.preventDefault();
  resizeDragging = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onResizeDrag);
  document.addEventListener("mouseup", endResizeDrag);
}

function onResizeDrag(event) {
  if (!resizeDragging) return;
  const shell = document.getElementById("appShell");
  if (!shell) return;
  const next = Math.round(window.innerWidth - event.clientX);
  const max = Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_MAX_RIGHT_GAP);
  const clamped = Math.min(max, Math.max(PANEL_MIN_WIDTH, next));
  shell.style.setProperty("--app-right-panel-width-runtime", `${clamped}px`);
}

function endResizeDrag() {
  if (!resizeDragging) return;
  resizeDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.removeEventListener("mousemove", onResizeDrag);
  document.removeEventListener("mouseup", endResizeDrag);
  // No persistence — the override lives on shell.style until the panel
  // closes and reopens, at which point the formula reasserts.
}

// --- Drafts mode (Lot 21 — rich PostCard feed) -------------------------
//
// Source-of-truth shifted from the per-batch `message.drafts` payload to
// the durable per-session `posts-store`. Every post the user has ever
// drafted in a session lives there ; the panel reads + filters that list
// and renders rich PostCards (cf. `post-card.js`). Per-card actions
// (rewrite / save as draft / schedule / delete / generate image) wire
// directly to posts-store mutations + the relevant modals.

// Resolve the active session's id from the URL — the right-panel always
// reflects the route, regardless of which assistant message kicked it
// open. Falls back to the activeBatchRef session when the URL doesn't
// match a session route.
export function activeSessionId() {
  const m = /^\/session\/([^/?]+)/.exec(getPath());
  if (m) return m[1];
  return state.activeBatchRef?.sessionId || null;
}

// Re-bind posts-store subscription when the active session changes
// (route hashchange) or on first init. Keeps the panel reactive without
// leaking listeners across sessions.
let unsubscribePosts = null;
let lastPostsSubscriptionSessionId = null;
function rebindPostsStore() {
  const sid = activeSessionId();
  if (sid === lastPostsSubscriptionSessionId) return;
  if (unsubscribePosts) {
    unsubscribePosts();
    unsubscribePosts = null;
  }
  lastPostsSubscriptionSessionId = sid;
  if (sid) {
    unsubscribePosts = subscribePostsStore(sid, () => {
      if (state.mode === "drafts") renderPanel();
    });
  }
}

// Closes the panel and hands off to the session screen's inline-question
// picker: "How many drafts from this idea?". The picked count drives the
// usual draft-flow pipeline, so the user lands back on the chat surface
// with the picker mounted and ready to answer.
function useIdea(ideaId) {
  const idea = sessionIdeas().find((i) => i.id === ideaId);
  if (!idea) return;
  const sid = activeSessionId();
  if (!sid) return;
  import("../screens/session/draft-questions.js?v=1851").then(({ askAngleQuestion }) => {
    askAngleQuestion(sid, ideaId);
  });
}
