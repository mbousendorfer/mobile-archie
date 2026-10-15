// Mocked conversational AI for the session assistant panel.
//
// Per-session thread state lives in a module-local Map (no persistence). Each
// send pushes a user turn + a placeholder AI turn, then resolves the
// placeholder to a scripted reply after a short simulated thinking delay.
//
// Subscribers re-render the thread DOM on any change — no global store.

import { threadsBySession as seedThreadsBySession, connectorDocs } from "./mocks.js?v=1856";
import { findConnector } from "./connectors-store.js?v=1856";
import { createSessionNotifier } from "./store-utils.js?v=1856";
import { addPostDraft } from "./posts-store.js?v=1856";
import { showToast } from "./components/toast.js?v=1856";
import { isFlagOn } from "./feature-flags.js?v=1856";

// How this module reads a session's ideas, injected rather than imported.
//
// The mock replies need to know what THIS chat has extracted, but `library.js`
// already imports this module — importing it back would close a cycle. So the
// dependency stays one-way and library hands its reader over at module init
// (`setIdeasReader(getIdeas)`). Until it does, this answers "no ideas yet",
// which is the honest reading of a chat whose library never loaded.
let readIdeas = () => [];

/** Called once by library.js so mock replies can see the session's ideas. */
export function setIdeasReader(fn) {
  if (typeof fn === "function") readIdeas = fn;
}

function readSessionIdeas(sessionId) {
  if (!sessionId) return [];
  const list = readIdeas(sessionId);
  return Array.isArray(list) ? list : [];
}

const threads = new Map(); // sessionId → messages[]
const notifier = createSessionNotifier("assistant");

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `m-${Date.now().toString(36)}-${idCounter}`;
}

// --- Public API -----------------------------------------------------------

export function getThread(sessionId, { hasContext = false } = {}) {
  if (!threads.has(sessionId)) {
    seedThread(sessionId, { hasContext });
  }
  return threads.get(sessionId);
}

export const subscribe = notifier.subscribe;

// Drop all state for a session — used by the conversation-delete flow in
// the sidebar. Subscribers are flushed too; any DOM still mounted will
// get one last empty-thread notify so it can clean up gracefully.
export function clearSession(sessionId) {
  threads.delete(sessionId);
  notifier.clear(sessionId, []);
}

export function sendMessage(sessionId, text, options = {}) {
  if (!text || !text.trim()) return;
  const thread = getThread(sessionId);

  // System messages (e.g. source intake notices) render inline and don't
  // trigger an AI reply.
  if (options.role === "system") {
    thread.push({
      id: newId(),
      role: "system",
      meta: options.meta || "System",
      variant: options.variant || "grey",
      text: text.trim(),
      open: false,
      status: options.status || "ready",
      createdAt: Date.now(),
    });
    notify(sessionId);
    return;
  }

  // Regular user → AI exchange. We push three messages in order:
  //   1. user turn
  //   2. reasoning system-notice (mermaid-accented "Drafting" block) — open
  //      while loading, collapsed after reply
  //   3. placeholder AI bubble — hidden until the reply lands
  const userId = newId();
  const reasoningId = newId();
  const replyId = newId();

  thread.push({
    id: userId,
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  thread.push({
    id: reasoningId,
    role: "system",
    // Flag newConversationStyles: the prod copy, past tense once done. OFF = Monday.
    meta: isFlagOn("newConversationStyles") ? "Thinking…" : "Thinking",
    variant: "mermaid",
    text: "Analyzing your request and sources…",
    open: false,
    status: "loading",
    createdAt: Date.now(),
  });
  thread.push({
    id: replyId,
    role: "assistant",
    meta: "Archie",
    text: "",
    status: "loading",
    hidden: true,
    createdAt: Date.now(),
  });
  notify(sessionId);

  const delay = 6000;
  setTimeout(() => {
    const reply = mockAiReply({ prompt: text, sessionId });
    const reasoning = thread.find((m) => m.id === reasoningId);
    if (reasoning) {
      reasoning.text = reply.reasoning;
      reasoning.status = "ready";
      // Present tense while working, past tense once done — the same pair as
      // "Extracting" → "Extracted 2 ideas".
      if (reasoning.meta === "Thinking…" && isFlagOn("newConversationStyles"))
        reasoning.meta = `Thought for ${Math.round(delay / 1000)}s`;
      reasoning.open = false; // collapse after the answer lands
    }
    const replyMsg = thread.find((m) => m.id === replyId);
    if (replyMsg) {
      replyMsg.text = reply.text;
      replyMsg.status = "ready";
      replyMsg.hidden = false;
    }
    notify(sessionId);
    // Lot 16 — when the prompt is "batch-y" (matches the keywords below)
    // we follow the AI text bubble with a Drafts summary turn. session.js's
    // wireAssistantPanel detects new draft messages and auto-opens the
    // right-panel Drafts surface (Lot 4.4 wiring), so the user lands on
    // the editable BatchCards without any extra click.
    if (reply.batch?.length) {
      postDraftResult(sessionId, {
        ideaTitle: leadIdeaTitle(),
        drafts: reply.batch,
      });
    }
  }, delay);
}

// Live connector query — simulates an MCP round-trip against a CONNECTED
// connector (Notion, Slite, …). Mirrors sendMessage's three-turn shape, but
// the reasoning notice is framed as a sequence of MCP tool calls and the
// answer is grounded in (and cites) the connector's mock content. This is the
// "connector = live source" model: the user never pre-imports docs — I query
// the workspace live when asked.
export function sendConnectorMessage(sessionId, connectorId, text) {
  if (!text || !text.trim()) return;
  const connector = findConnector(connectorId);
  // Defensive fallback — a disconnected/unknown connector routes to the
  // generic assistant rather than failing silently.
  if (!connector || connector.status !== "connected") {
    sendMessage(sessionId, text);
    return;
  }

  const thread = getThread(sessionId);
  const reasoningId = newId();
  const replyId = newId();

  thread.push({
    id: newId(),
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  thread.push({
    id: reasoningId,
    role: "system",
    meta: `Querying ${connector.name} via MCP`,
    variant: "mermaid",
    text: `Running ${mcpCallTrace(connector)}…`,
    open: true,
    status: "loading",
    createdAt: Date.now(),
  });
  thread.push({
    id: replyId,
    role: "assistant",
    meta: "Archie",
    text: "",
    status: "loading",
    hidden: true,
    createdAt: Date.now(),
  });
  notify(sessionId);

  setTimeout(() => {
    const reply = mockConnectorReply(connector, text);
    const reasoning = thread.find((m) => m.id === reasoningId);
    if (reasoning) {
      reasoning.text = reply.reasoning;
      reasoning.status = "ready";
      if (isFlagOn("newConversationStyles")) reasoning.meta = `Queried ${connector.name} via MCP`;
      reasoning.open = false;
    }
    const replyMsg = thread.find((m) => m.id === replyId);
    if (replyMsg) {
      replyMsg.text = reply.text;
      replyMsg.status = "ready";
      replyMsg.hidden = false;
    }
    notify(sessionId);
  }, 5200);
}

// Push a ready-state AI Copilot turn directly (no user turn, no Drafting
// collapsible). Used by library.js to narrate the outcome of an extraction.
export function postAssistantMessage(sessionId, text, { meta = "Archie" } = {}) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    meta,
    text,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// A job Archie couldn't finish (draft generation threw). With the new
// conversation styles it stays in the thread as a failed card — what failed,
// what it means, Retry — instead of a toast that vanishes after 6s. Retry is a
// closure, so it lives beside the thread, keyed by the turn id.
const failedRetries = new Map();

export function reportDraftFailure(sessionId, err, retry, source = "draft-flow") {
  // eslint-disable-next-line no-console
  console.error(`${source}: draft generation failed`, err);
  if (!isFlagOn("newConversationStyles")) {
    showToast("Couldn't create those drafts. Try again?", {
      variant: "error",
      duration: 6000,
      action: { label: "Retry", onClick: retry },
    });
    return;
  }
  const id = newId();
  failedRetries.set(id, retry);
  getThread(sessionId).push({
    id,
    role: "assistant",
    variant: "failed",
    title: "Couldn't create those drafts",
    text: "Something unexpected happened on my side. Nothing was lost.",
    status: "failed",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Retry from the failed card: the card leaves the thread, the job runs again.
export function retryFailedTurn(sessionId, id) {
  const msg = getThread(sessionId).find((m) => m.id === id);
  const retry = failedRetries.get(id);
  if (!msg) return;
  msg.hidden = true;
  failedRetries.delete(id);
  notify(sessionId);
  retry?.();
}

// "Connect a service first" prompt — posted when the user pastes a link to a
// connector-backed service (Slite, Notion, Google Docs, …) that isn't
// connected. Renders a card with the service logo, an explanation, and
// Connect / Close actions (see renderConnectPromptTurn in session.js). The
// click delegate connects the connector then retries startUrlImport(url).
// `status`: "pending" → "connected" (resolved) or "dismissed" (hidden).
export function postConnectPrompt(sessionId, { connectorId, connectorName, logo, url, noun = "document" }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "connect-prompt",
    meta: "Archie",
    connectorId,
    connectorName,
    logo,
    url,
    noun,
    status: "pending",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// Resolve a connect-prompt turn — "connected" swaps the card for a compact
// confirmation, "dismissed" removes it from the thread render.
export function markConnectPromptResolved(sessionId, id, status = "connected") {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === id);
  if (!msg) return;
  msg.status = status;
  notify(sessionId);
}

// Right-aligned "Source intake" turn — renders like a user turn but with
// a light electric-blue bubble containing a file icon + filename · size.
// Figma 25:1127/25:1131.
//
// Pass `sourceId` so the renderer can read live `source.status` from
// sources-stream and so `markSourceIntakeReady` can flip this turn from
// loading → ready when processing completes. Status defaults to
// `"loading"` — the upload subscription in session.js calls
// markSourceIntakeReady when sources-stream flips the source to
// Processed.
export function postSourceIntake(sessionId, { kind, filename, size, sourceId, status = "loading" }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "source-intake",
    meta: "Source intake",
    kind,
    filename,
    size,
    sourceId: sourceId || null,
    status,
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Flip an existing source-intake turn from loading → ready. Lookup by
// sourceId so the caller doesn't have to track message ids.
export function markSourceIntakeReady(sessionId, sourceId) {
  if (!sourceId) return;
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.role === "source-intake" && m.sourceId === sourceId);
  if (!msg || msg.status === "ready") return;
  msg.status = "ready";
  notify(sessionId);
}

// Structured AI extraction result — Drafting pill ("Extracted N ideas") →
// "Analyzed <filename>" → N idea cards. Figma 25:1053 / 25:1057.
export function postExtractionResult(sessionId, { filename, ideas }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    variant: "extraction",
    meta: "Archie",
    filename,
    // Carry kind + rationale through so the conversation idea card can show
    // the same kind tag + "Why this idea" rationale as the right-panel card.
    ideas: ideas.map((i) => ({
      id: i.id,
      title: i.title,
      body: i.body,
      kind: i.kind,
      rationale: i.rationale,
    })),
    count: ideas.length,
    status: "ready",
    open: true,
    createdAt: Date.now(),
  });
  notify(sessionId);
  // Completion ping — consistent across every idea-extraction path (bulk /
  // per-row / video analyze / save-the-angle), mirroring how drafts announce
  // "N drafts ready". No action button: the extracted ideas already render
  // inline in the thread as an idea card.
  const n = ideas.length;
  showToast(`${n} idea${n === 1 ? "" : "s"} ready`);
}

// Push a "pending" marker to indicate the session is busy (e.g. while a source
// is being extracted). Renders as an inline "Extracting" notice in the thread
// (Figma 25:1413) and also drives the composer status bar via its
// status === "loading" tag. `meta` is the human label shown on the composer
// status bar (e.g. "Extracting ideas from content…", "Generating post drafts…" — the prod copy); it defaults to a
// generic "Working". Returns an id so the caller can clear the marker when work
// finishes.
export function startPending(sessionId, meta = null, tools = null) {
  const thread = getThread(sessionId);
  const id = newId();
  // New conversation styles: the work shows the tools it runs, the way the prod
  // thread does (chat-thread.component toActivityGroup) — "Extract Ideas…"
  // while it runs, "Extract Ideas · 1.6s" / "Ran 3 tools · 3.0s" once done, and
  // the activity stays in the thread. Otherwise the transient pending marker.
  if (tools && isFlagOn("newConversationStyles")) {
    thread.push({
      id,
      role: "assistant",
      variant: "activity",
      meta: meta || null,
      tools: tools.map((tool) => ({ tool, ms: 0 })),
      status: "loading",
      createdAt: Date.now(),
    });
  } else {
    thread.push({
      id,
      role: "pending",
      status: "loading",
      meta: meta || null,
      createdAt: Date.now(),
    });
  }
  notify(sessionId);
  return id;
}

export function finishPending(sessionId, id) {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === id);
  if (msg) {
    msg.status = "ready";
    if (msg.variant === "activity") msg.tools.forEach((t) => (t.ms = TOOL_MS[t.tool] ?? 0));
  }
  notify(sessionId);
}

// A config step the prod logs as a finished tool at once ("Set Angle Mix ·
// 0.0s", "Set Publishing Accounts · 0.0s"). Nothing to show without the flag.
export function postActivity(sessionId, tools) {
  if (!isFlagOn("newConversationStyles")) return;
  finishPending(sessionId, startPending(sessionId, null, tools));
}

// Simulated durations (ms) — the prod reads them off the wire.
const TOOL_MS = { extract_ideas: 1600, start_generation: 200, generate_drafts: 2400, check_post_quality: 400 };

// The prod's tool vocabulary (studio i18n): hooks.toolNames.* for the chip,
// chat.tool.progress.* for what a finished single tool unfolds; any other id
// is de-snake-cased (tool-name.ts) / "Running {{tool}}…".
const TOOL_NAMES = {
  modify_post: "Modify Post",
  check_post_quality: "Check Quality",
  start_generation: "Generate Posts",
  schedule_post: "Schedule Post",
  answer_pdf_question: "Analyze Document",
  extract_ideas: "Extract Ideas",
  analyze_tone: "Analyze Tone",
  generate_drafts: "Generate Drafts",
  regenerate_posts: "Regenerate Posts",
  request_config: "Configure",
  score_quality: "Score Quality",
  get_best_times: "Best Publishing Times",
  fix_practices: "Fix Practices",
};
const TOOL_PROGRESS = {
  analyze_context: "Analyzing context…",
  analyze_tone: "Analyzing writing tone…",
  answer_pdf_question: "Analyzing document…",
  check_post_quality: "Checking best practices…",
  extract_ideas: "Extracting ideas from content…",
  generate_drafts: "Generating post drafts…",
  modify_post: "Modifying post content…",
  regenerate_posts: "Generating new posts…",
  request_config: "Updating configuration…",
  schedule_post: "Scheduling post…",
  start_generation: "Starting post generation…",
};
export const toolName = (t) => TOOL_NAMES[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const toolDescription = (t) => TOOL_PROGRESS[t] || `Running ${t}…`;
export const GENERATION_TOOLS = ["start_generation", "generate_drafts", "check_post_quality"];

// Push only a user bubble — no reasoning chip, no AI placeholder.
// Used by the draft flow so the user sees their intent echoed without
// triggering a generic AI reply.
export function postUserTurn(sessionId, text) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Push a user turn that echoes the picked social profiles visually — a row
// of avatar (+ network badge) + handle chips instead of a plain text bubble.
// `profiles` = raw socialAccounts entries (rendered via renderProfileTag).
export function postUserProfilesTurn(sessionId, profiles) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "profiles",
    meta: "You",
    profiles: Array.isArray(profiles) ? profiles : [],
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Push a user turn that echoes the top post the user chose to build on — a
// compact preview card (network + excerpt + key stats) instead of a truncated
// text bubble. Rendered by renderTopPostPickTurn in session.js. `post` is a
// trimmed copy of the winner (see top-posts-flow.chooseMode).
export function postTopPostPickTurn(sessionId, post) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "top-post-pick",
    meta: "You",
    post: post || null,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Interactive "top posts" selection widget — the inline (Add-menu) alternative
// to the full-screen studio board. Renders a compact, multi-select list of an
// account's winners directly in the conversation (renderTopPostsWidgetTurn in
// session.js). The selection lives ON the turn object and mutates in place, so
// every thread re-render reflects it (mirrors the source-intake mutate pattern).
export function postTopPostsWidget(sessionId, { network, postIds }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "top-posts-widget",
    meta: "Archie",
    network: network || null,
    postIds: Array.isArray(postIds) ? postIds.slice() : [],
    selected: [],
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// Find the latest still-open (ready) widget turn of one variant for a session.
// Shared by the top-posts and topics widgets — same single-select-then-freeze
// lifecycle, so one walker serves both.
function activeWidget(sessionId, variant) {
  const thread = getThread(sessionId);
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const m = thread[i];
    if (m.variant === variant && m.status === "ready") return m;
  }
  return null;
}

// SINGLE-select pick inside the active widget: the clicked item becomes the sole
// selection (clicking the selected one clears it). Returns whether it is now
// selected. Deliberately does NOT notify() — the caller updates the rows in place
// (like the Quickpicker) so there's no whole-thread re-render, image reload, or
// scroll reset inside the widget list.
function toggleWidgetPick(sessionId, variant, itemId) {
  const msg = activeWidget(sessionId, variant);
  if (!msg) return false;
  const alreadyOnly = msg.selected.length === 1 && msg.selected[0] === itemId;
  msg.selected = alreadyOnly ? [] : [itemId];
  return !alreadyOnly;
}

// Freeze the active widget (status → "answered", disabling further selection)
// and return the chosen ids so the caller can advance the flow.
function answerWidget(sessionId, variant) {
  const msg = activeWidget(sessionId, variant);
  if (!msg) return [];
  msg.status = "answered";
  notify(sessionId);
  return msg.selected.slice();
}

export function toggleTopPostsWidgetPick(sessionId, postId) {
  return toggleWidgetPick(sessionId, "top-posts-widget", postId);
}

export function answerTopPostsWidget(sessionId) {
  return answerWidget(sessionId, "top-posts-widget");
}

// Interactive "topics" selection widget — the composer's "Pick from the Topic
// Feed", run INLINE in the current chat exactly like the top-posts widget: a
// single-select list of the feed's draft-ready Topics rendered as a turn
// (renderTopicsWidgetTurn in session.js). Selection lives ON the turn object and
// mutates in place, so every thread re-render reflects it. The Topic ids are
// re-resolved at render time (getTopicById), so a Topic that leaves the feed
// simply drops out of the list.
export function postTopicsWidget(sessionId, { feedId, topicIds }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "topics-widget",
    meta: "Archie",
    feedId: feedId || null,
    topicIds: Array.isArray(topicIds) ? topicIds.slice() : [],
    selected: [],
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

export function toggleTopicsWidgetPick(sessionId, topicId) {
  return toggleWidgetPick(sessionId, "topics-widget", topicId);
}

export function answerTopicsWidget(sessionId) {
  return answerWidget(sessionId, "topics-widget");
}

// Generic "you picked this object" echo — a compact icon + title + meta chip in
// the thread, used whenever the user selects a dynamic object (source, idea,
// clip, …) so the pick stays visible like the post / profile echoes do.
// `echo` = { icon, title, meta }. Rendered by renderSelectionEcho in session.js.
export function postSelectionEcho(sessionId, echo) {
  if (!echo || !echo.title) return;
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "selection-echo",
    meta: "You",
    echo: { icon: echo.icon || "ap-icon-file", title: echo.title, meta: echo.meta || "" },
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Push an "assistant-choice" turn that renders a set of toggle chips plus a
// submit button. Keeps the module generic — the handler string identifies
// what the click delegate in session.js should do on submit.
//
// Pass `instant: true` for single-select pickers where each chip click
// immediately fires the handler (no Submit button). Useful for binary
// "pick a path" questions.
export function postAssistantChoice(
  sessionId,
  { text, choices, multi = true, handler = "", context = {}, submitLabel = "Submit", instant = false },
) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant-choice",
    meta: "Archie",
    text,
    choices, // [{ value, label, icon }]
    selected: [],
    multi,
    handler,
    context,
    submitLabel,
    instant,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Freeze a choice message after the user submits — chips become read-only.
export function submitAssistantChoice(sessionId, messageId, selectedValues) {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === messageId);
  if (!msg) return;
  msg.selected = selectedValues;
  msg.status = "answered";
  notify(sessionId);
}

// Inline "Extracting clips → Clips ready" card pinned to a single video
// source. The turn carries the sourceId; the renderer reads the source's
// live clipExtractionStatus / clips count from sources-stream so the same
// turn flips from pending to ready without an extra notify hop.
export function postClipExtractionTurn(sessionId, { sourceId, filename }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "clip-extraction",
    meta: "Archie",
    sourceId,
    filename,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// "Schedule all the drafts" — my proposed plan, one row per draft (QUOI →
// QUAND). Each row keeps a label snapshot: once scheduled, the draft leaves
// posts-store and its reference can no longer resolve, but the plan must still
// read. `status`: "proposed" → "scheduled" | "dismissed".
export function postSchedulePlan(sessionId, { intro, rows, summary }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "schedule-plan",
    meta: "Archie",
    text: intro,
    rows,
    summary,
    status: "proposed",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

export function setSchedulePlanStatus(sessionId, id, status) {
  const msg = getThread(sessionId).find((m) => m.id === id);
  if (!msg) return;
  msg.status = status;
  notify(sessionId);
}

// Structured "Drafted N posts" result turn. Reuses the extraction-turn chrome
// (mermaid pill + collapsible detail) but shows post mini-cards instead of
// idea cards.
export function postDraftResult(sessionId, { ideaTitle, drafts }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    variant: "draft",
    meta: "Archie",
    ideaTitle,
    drafts: drafts.map((d) => ({
      id: d.id,
      network: d.network,
      preview: Array.isArray(d.text) ? d.text[0] : d.text,
    })),
    count: drafts.length,
    status: "ready",
    open: true,
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// A voice proposal card (flag networkVoices, voice-coach.js). The turn holds
// only the ids: the suggestion lives in voice-coach-store, so accepting it
// from the Playbook's tray reads the same here.
export function postVoiceSuggestion(sessionId, { contextId, suggestionId }) {
  getThread(sessionId).push({
    id: newId(),
    role: "assistant",
    variant: "voice-suggestion",
    meta: "Archie",
    contextId,
    suggestionId,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Re-render the thread after the card's suggestion was answered.
export function refreshThread(sessionId) {
  notify(sessionId);
}

// --- Internals ------------------------------------------------------------

function notify(sessionId) {
  // Expose a shallow copy so subscribers can't mutate the thread by accident.
  notifier.notify(sessionId, (threads.get(sessionId) || []).slice());
}

function seedThread(sessionId, { hasContext }) {
  // Welcome-alt onboarding owns its own intro (context-builder startAlt), so
  // seed it empty regardless of which read (topbar / status card / panel)
  // triggers the seed first — otherwise the chat opens with a stray greeting
  // above the onboarding message. Clip Studio sessions (clip-studio-*) own
  // their own full-page flow and want the same empty open above the grid.
  if (sessionId.startsWith("welcome-alt-") || sessionId.startsWith("clip-studio-")) {
    threads.set(sessionId, []);
    return;
  }

  // Demo sessions ship with a scripted thread so opening one looks like
  // a real, mid-flight conversation (source intakes + extractions +
  // user prompt + draft result). Materialised lazily on first read:
  // each turn gets a fresh id + createdAt so the renderer and future
  // mutations behave like any in-flight thread.
  const scripted = seedThreadsBySession?.[sessionId];
  if (Array.isArray(scripted) && scripted.length > 0) {
    const baseTime = Date.now() - scripted.length * 1000;
    threads.set(
      sessionId,
      scripted.map((turn, idx) => ({
        ...turn,
        id: newId(),
        status: turn.status || "ready",
        createdAt: baseTime + idx * 1000,
      })),
    );
    return;
  }

  const greeting = hasContext
    ? "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source."
    : "Hi. I'll help you pick sources, sharpen ideas, and draft posts. Attach a Playbook any time to make my suggestions sharper.";

  threads.set(sessionId, [
    {
      id: newId(),
      role: "assistant",
      meta: "Archie",
      text: greeting,
      status: "ready",
      createdAt: Date.now(),
    },
  ]);
}

// Lot 16 — scripted batch generators (mirror handoff's defaultBatch /
// launchBatch). Stand-in until a real LLM is wired ; produces a small array
// of {id, network, text} drafts that postDraftResult can attach to a draft
// turn. `lead` is the top idea picked in mockAiReply ; we bias the copy to
// reference its title so the panel feels grounded in the source material.

function defaultBatch(lead) {
  const seed = lead?.title || "your story";
  const stamp = Date.now().toString(36);
  return [
    {
      id: `gen-${stamp}-1`,
      network: "linkedin",
      text: [
        `${seed} — the operator angle.`,
        "Open with the concrete change, add one proof signal from the source, close with a takeaway readers can try this week.",
      ],
    },
    {
      id: `gen-${stamp}-2`,
      network: "twitter",
      text: [`${seed}.`, "One sharp line. No filler."],
    },
    {
      id: `gen-${stamp}-3`,
      network: "instagram",
      text: [
        `${seed} — visual story.`,
        "Carousel-ready: hook → context → 3 beats → CTA. Aim for 1–2 minutes of read time.",
      ],
    },
    {
      id: `gen-${stamp}-4`,
      network: "linkedin",
      text: [
        `Why ${seed.toLowerCase()} matters now.`,
        "Frame as a contrarian read of the room. End with the question we're betting on.",
      ],
    },
    {
      id: `gen-${stamp}-5`,
      network: "twitter",
      text: [`Quick thread on ${seed}. 1/`, "Save the receipt at the end."],
    },
  ];
}

function launchBatch(lead) {
  const seed = lead?.title || "the launch";
  const stamp = Date.now().toString(36);
  const days = ["Day 1 · Tease", "Day 2 · Problem", "Day 3 · Reveal", "Day 4 · Demo", "Day 5 · CTA"];
  const networks = ["linkedin", "twitter", "linkedin", "instagram", "twitter"];
  return days.map((label, i) => ({
    id: `gen-${stamp}-${i + 1}`,
    network: networks[i],
    text: [`${label} — ${seed}.`, label.includes("CTA") ? "30 days free. No card." : "More soon."],
  }));
}

// Returns the title of the lead idea used by mockAiReply, for the
// `ideaTitle` field of the draft turn ("From idea: …" tagline).
let _lastLeadIdeaTitle = "";
function leadIdeaTitle() {
  return _lastLeadIdeaTitle;
}

// Build a fake MCP tool-call trace from a connector's capabilities, e.g.
// "notion.search → notion.read → notion.query". Each capability's leading verb
// becomes a lowercase method on the connector's namespace; reads like a real
// MCP server invocation in the reasoning chip.
function mcpCallTrace(connector) {
  const verb = (cap) => (cap || "").trim().split(/\s+/)[0].toLowerCase() || "call";
  const caps = Array.isArray(connector.capabilities) ? connector.capabilities : [];
  const tools = (caps.length ? caps : ["query"]).slice(0, 3).map((c) => `${connector.id}.${verb(c)}`);
  return tools.join(" → ");
}

// Scripted reply for a live connector query. Grounds the answer in 1–2 items
// from the connector's mock doc pool and cites them, so a simulated MCP query
// reads like it actually pulled from the workspace. Voice stays first-person.
function mockConnectorReply(connector, prompt) {
  const pool = connectorDocs[connector.id] || [];
  const cited = pool.slice(0, Math.min(2, pool.length));
  const lead = cited[0];
  const sourcesBlock = cited.length
    ? `\n\nSources I pulled:\n${cited.map((d) => `• ${d.title} — ${d.kind}`).join("\n")}`
    : "";

  const reasoning = `Called ${connector.name} over MCP — ran ${mcpCallTrace(connector)}. Scanned the workspace and pulled the ${
    cited.length || "most"
  } most relevant item${cited.length === 1 ? "" : "s"} to ground the answer.`;

  // No content to cite — connector is connected but its pool is empty.
  if (!lead) {
    return {
      reasoning,
      text: `I queried ${connector.name} live, but didn't find anything specific to work from yet. Try a more specific ask, or point me at a topic and I'll search again.`,
    };
  }

  const p = prompt || "";
  let body;
  if (/contrarian|angle|hot take|provocative/i.test(p)) {
    body = `Pulling from "${lead.title}", here's a contrarian angle worth posting: take the prevailing assumption it documents and argue the inverse, backed by the specifics inside. That tension is what stops the scroll.`;
  } else if (/summar|tl;?dr|bullet|recap/i.test(p)) {
    body = `Here's the recap from ${connector.name}, drawn mainly from "${lead.title}": the core decision, the reasoning behind it, and the one open question still worth resolving. I can turn any of those three into a post.`;
  } else if (/post|draft|repurpose|content|idea/i.test(p)) {
    body = `Based on "${lead.title}", the most post-worthy thread is the concrete before/after it captures. Let's lead a draft with that specific change — it's believable and it earns the claim.`;
  } else {
    body = `Here's what I found in ${connector.name}, grounded in "${lead.title}": the clearest, most specific point is the one I'd build on. Want me to draft a post from it, or dig into another item?`;
  }

  return { reasoning, text: body + sourcesBlock };
}

// Scripted mock replies. Ported from the old prototype (src/mock-generators.js),
// extended to return a { text, reasoning } pair — `reasoning` is shown in the
// mermaid-accented "Drafting" collapsible above the answer.
function mockAiReply({ prompt, sessionId }) {
  // THIS chat's ideas, never the account's. It used to read mocks.ideas — a flat
  // union of every session's — so a fresh chat with nothing in it would answer
  // about ideas the user had extracted somewhere else entirely.
  const ideas = readSessionIdeas(sessionId);
  const leadIdea = ideas.find((i) => i.pinned) || ideas[0] || null;
  const otherIdea = ideas.find((i) => i.id !== leadIdea?.id) || null;
  const ideaCount = ideas.length;

  // Cache the lead idea title so postDraftResult's `ideaTitle` field is
  // populated correctly when sendMessage triggers a batch.
  _lastLeadIdeaTitle = leadIdea?.title || "";

  if (!leadIdea) {
    return {
      reasoning: "No sources attached in this session yet, so there's nothing to rank or draft from.",
      text: "I don't have enough source material in this session yet. Add a source first and I can extract ideas, compare angles, or draft a post.",
    };
  }

  // Batch-y prompt keywords — handoff App.jsx generateReply uses the same
  // intent matcher to switch from a text-only reply to a 5-post batch +
  // drafts summary card. We add the same path here so starter prompts
  // ("Pull the strongest moments…", "Plan a 5-day launch…", "Repurpose
  // {{source}} into 8 posts…", "Use {{source}} to draft a customer-story
  // post…") actually produce drafts instead of a generic text reply.
  const isLaunch = /\b(launch|5-?day|week|drumbeat|tease|reveal)\b/i.test(prompt);
  const isBatch =
    isLaunch ||
    /\b(batch|draft|repurpose|moments|pull|schedule|posts?)\b/i.test(prompt) ||
    /linkedin|twitter|\bx\b|instagram|facebook|tiktok/i.test(prompt);

  // Archie names what it talks about with inline references (chat-refs.js):
  // `[[idea:id]]` renders as the idea's underlined title, previewed on hover.
  const lead = `[[idea:${leadIdea.id}]]`;

  if (isBatch) {
    // The batch lands in posts-store, so the Drafts panel shows it and the
    // reply can reference each draft it made.
    const batch = (isLaunch ? launchBatch(leadIdea) : defaultBatch(leadIdea)).map((d) =>
      addPostDraft(sessionId, { network: d.network, text: d.text }),
    );
    // One draft per line — a batch reads as a list, not a sentence.
    const named = batch.map((d) => `\n- [[post:${d.id}]]`).join("");
    return {
      reasoning: `Scanned ${ideaCount} extracted ideas, ranked by confidence and relevance. "${leadIdea.title}" came out on top (${leadIdea.confidence}% confidence) — composing a ${batch.length}-post batch grounded in its source.`,
      text: isLaunch
        ? `Here's a ${batch.length}-day sequence built from ${lead}, one post per day across networks:${named}\nOpen the Drafts panel to review and schedule.`
        : `I drafted ${batch.length} posts grounded in ${lead}, each sized for its network and following the active playbook's tone rules:${named}`,
      batch,
    };
  }

  if (/compare|versus|\bvs\b/i.test(prompt) && otherIdea) {
    const stronger = leadIdea.confidence >= otherIdea.confidence ? leadIdea : otherIdea;
    const weaker = stronger.id === leadIdea.id ? otherIdea : leadIdea;
    return {
      reasoning: `Compared confidence + relevance between "${leadIdea.title}" (${leadIdea.confidence}%) and "${otherIdea.title}" (${otherIdea.confidence}%). Picked the higher-confidence, more specific angle to lead with.`,
      text: `Between ${lead} and [[idea:${otherIdea.id}]], I'd lead with [[idea:${stronger.id}]]: clearer proof, higher confidence. Keep [[idea:${weaker.id}]] as a follow-up draft.`,
    };
  }

  if (/pin|priority|strongest|signal|actionable/i.test(prompt)) {
    return {
      reasoning: `Looked across ${ideaCount} ideas for the one closest to "specific, believable, publishable". "${leadIdea.title}" scored highest on all three.`,
      text: `The strongest idea right now is ${lead}: specific, believable, close to publishable. I'd pin it, pressure-test it against one alternative, then draft the first post.`,
    };
  }

  if (/source|pdf|video|url|attach|add/i.test(prompt)) {
    return {
      reasoning:
        "Reviewed current source coverage and the ideas already extracted — most are derived from marketing-adjacent material.",
      text: "Drop one more source to pressure-test the current idea — ideally something that isn't a marketing post. A transcript, a product retro, or a customer interview moves the needle fastest.",
    };
  }

  return {
    reasoning: `Reviewed session state: ${ideaCount} ideas extracted, strongest being "${leadIdea.title}". No draft in progress.`,
    text: `I can keep working in this chat. My recommendation: confirm the strongest idea in the Ideas panel, then generate a draft so the post stays grounded in the source. ${lead} is the one I'd start with.`,
  };
}
