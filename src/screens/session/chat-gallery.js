// "ADMIN MODE: DISPLAY IN CHAT" — a prototype shortcut under the composer that lists every
// element a conversation can display and every trigger that produces one, and
// plays any of them in the current chat.
//
// Two kinds of entry:
//   • a COMPONENT drops one sample turn straight into the thread (assistant.js
//     post* — the same call the real flows make);
//   • a TRIGGER runs the real path: a prompt goes through the composer's submit
//     (so the keyword routes in session.js / assistant.js decide, as if typed),
//     a flow is started with its own entry point.
// An entry whose precondition isn't met (a flag OFF, no idea yet, no video…)
// renders disabled and says why, rather than doing nothing on click.
//
// ponytail: the catalogue is a hand-kept list — a new turn variant or route has
// to be added here too, or it won't show in the menu.

import { escapeHtml } from "../../utils.js?v=1902";
import { isFlagOn } from "../../feature-flags.js?v=1902";
import {
  postAssistantMessage,
  postUserTurn,
  sendMessage,
  startPending,
  finishPending,
  postSourceIntake,
  markSourceIntakeReady,
  postExtractionResult,
  postClipExtractionTurn,
  postSelectionEcho,
  postUserProfilesTurn,
  postTopPostPickTurn,
  postConnectPrompt,
  postVoiceSuggestion,
  reportDraftFailure,
  getThread,
  refreshThread,
} from "../../assistant.js?v=1902";
import { getSources, getIdeas } from "../../library.js?v=1902";
import { getPosts } from "../../posts-store.js?v=1902";
import { getTopPosts } from "../../top-posts-store.js?v=1902";
import { getConnectedProfiles } from "../../social-profiles.js?v=1902";
import { extractClipsForSource, updateSourceClips } from "../../sources-stream.js?v=1902";
import { getConnectedConnectors } from "../../connectors-store.js?v=1902";
import { detectUrlService } from "../../url-services.js?v=1902";
import { propose, getSuggestions } from "../../voice-coach-store.js?v=1902";
import * as inlineQuestion from "../../inline-question.js?v=1902";
import { startTopPostsInline } from "../../top-posts-flow.js?v=1902";
import { startTopicPickerInline } from "../../topic-flow.js?v=1902";
import { askConnector } from "../../connector-ask.js?v=1902";
import { coachAfterDraft, coachingTarget } from "../../voice-coach.js?v=1902";
import { requireConnectedProfiles } from "../../connect-profiles-flow.js?v=1902";
import { startIdeaDraft, askVideoIntake } from "./draft-questions.js?v=1902";

// The intake sample plays the real lifecycle — loading, then ready — under a
// sample id no source owns, so intake-lifecycle leaves it alone.
function playIntake(sid, file, ms) {
  const sourceId = `gallery-intake-${Date.now().toString(36)}`;
  postSourceIntake(sid, { ...file, sourceId, status: "loading" });
  setTimeout(() => markSourceIntakeReady(sid, sourceId), ms);
}

const videoOf = (sid) => getSources(sid).find((s) => s.kind === "Video");
const flagOff = (id) => (isFlagOn(id) ? null : `Turn on ${id} in Admin`);

// Each entry: id, label, icon, hint (what it is), when(sid, session) → reason it
// can't run (or null), run(sid, session, send).
const COMPONENTS = [
  {
    id: "assistant",
    label: "Archie message",
    icon: "ap-icon-archie-official",
    hint: "A reply, with an inline reference",
    run: (sid) => {
      const idea = getIdeas(sid)[0];
      postAssistantMessage(
        sid,
        idea ? `Here's what I'd build on: [[idea:${idea.id}]].` : "Here's a plain reply from me.",
      );
    },
  },
  {
    id: "user",
    label: "Your message",
    icon: "ap-icon-user",
    hint: "A user turn, no reply",
    run: (sid) => postUserTurn(sid, "Can you make it shorter?"),
  },
  {
    id: "thinking",
    label: "Thinking notice",
    icon: "ap-icon-sparkles",
    hint: "The reasoning pill: Thinking (its dot pulsing) for 3 seconds, then Thought for 3s",
    run: (sid) => {
      sendMessage(sid, "Ranked the ideas by confidence and picked the most specific one.", {
        role: "system",
        variant: "mermaid",
        // OFF (Monday): "Thinking", and it stays "Thinking" once done.
        meta: isFlagOn("newConversationStyles") ? "Thinking…" : "Thinking",
        status: "loading",
      });
      const msg = getThread(sid).at(-1);
      setTimeout(() => {
        msg.status = "ready";
        if (isFlagOn("newConversationStyles")) msg.meta = "Thought for 3s";
        refreshThread(sid);
      }, 3000);
    },
  },
  {
    id: "pending",
    label: "Working status",
    icon: "ap-icon-refresh",
    hint: "The live “Extracting” notice, for 4 seconds",
    run: (sid) => {
      const id = startPending(sid, "Extracting ideas from content…");
      setTimeout(() => finishPending(sid, id), 4000);
    },
  },
  {
    id: "intake",
    label: "Source intake",
    icon: "ap-icon-file--pdf",
    hint: "A file landing in the chat: Uploading for 3 seconds, then ready",
    run: (sid) => playIntake(sid, { kind: "pdf", filename: "Q3 customer interviews.pdf", size: "1.2 MB" }, 3000),
  },
  {
    id: "intake-video",
    label: "Video intake",
    icon: "ap-icon-file--video",
    hint: "A video landing in the chat: Uploading for 6 seconds, then ready",
    run: (sid) => playIntake(sid, { kind: "video", filename: "Founder keynote.mp4", size: "84 MB" }, 6000),
  },
  {
    id: "extraction",
    label: "Extracted ideas",
    icon: "ap-icon-star",
    hint: "The idea cards after an extraction",
    when: (sid) => (getIdeas(sid).length ? null : "Needs ideas in this chat"),
    run: (sid) => postExtractionResult(sid, { filename: "Sample source", ideas: getIdeas(sid).slice(0, 2) }),
  },
  {
    id: "clips",
    label: "Clip extraction",
    icon: "ap-icon-file--video",
    hint: "A video cut into clips: its stages for ~7s, then the “Clips ready” card",
    when: (sid) => (videoOf(sid) ? null : "Needs a video source"),
    // Replays the real extraction on the chat's video: its clips are dropped,
    // then re-cut through the staged ticker (the same path as "Extract & create
    // clips"), so the card walks its stages instead of landing ready.
    run: (sid) => {
      const v = videoOf(sid);
      updateSourceClips(v.id, []);
      extractClipsForSource(sid, v.id);
      postClipExtractionTurn(sid, { sourceId: v.id, filename: v.filename });
    },
  },
  {
    id: "failed",
    label: "Failed card",
    icon: "ap-icon-warning",
    hint: "A job I couldn't finish, with Retry (new conversation styles; a toast otherwise)",
    run: (sid) =>
      reportDraftFailure(sid, new Error("Sample failure"), () =>
        postAssistantMessage(sid, "That worked this time — your drafts are in the Drafts tab."),
      ),
  },
  {
    id: "echo",
    label: "Selection echo",
    icon: "ap-icon-check",
    hint: "What you picked, as a card",
    run: (sid) =>
      postSelectionEcho(sid, { icon: "ap-icon-file--pdf", title: "Q2 strategy offsite notes", meta: "PDF source" }),
  },
  {
    id: "profiles",
    label: "Profiles echo",
    icon: "ap-icon-multiple-users",
    hint: "The accounts you picked",
    when: () => (getConnectedProfiles().length ? null : "Needs a connected account"),
    run: (sid) => postUserProfilesTurn(sid, getConnectedProfiles().slice(0, 2)),
  },
  {
    id: "top-post",
    label: "Top post echo",
    icon: "ap-icon-feature-analytics",
    hint: "A top post you chose to build on",
    when: () => (getTopPosts().length ? null : "No top post to show"),
    run: (sid) => {
      const { id, ...post } = getTopPosts()[0];
      postTopPostPickTurn(sid, post);
    },
  },
  {
    id: "connect",
    label: "Connect prompt",
    icon: "ap-icon-link",
    hint: "“Connect Notion first” on a pasted link",
    run: (sid) => {
      const url = "https://www.notion.so/acme/q3-roadmap";
      const svc = detectUrlService(url);
      postConnectPrompt(sid, {
        connectorId: svc.connectorId,
        connectorName: svc.name,
        logo: svc.logo,
        url,
        noun: svc.noun || "document",
      });
    },
  },
  {
    id: "voice",
    label: "Voice suggestion",
    icon: "ap-icon-sparkles",
    hint: "A rule Archie wants to remember",
    when: (sid, session) => flagOff("networkVoices") || (session.contextId ? null : "Needs a Playbook on this chat"),
    run: (sid, session) => {
      const ctx = session.contextId;
      // The evidence is this chat's LinkedIn drafts, so the card links them and,
      // once kept, offers to rewrite them.
      const from = getPosts(sid)
        .filter((p) => p.network === "linkedin")
        .slice(0, 2)
        .map((p) => p.id);
      const s =
        propose(ctx, {
          network: "linkedin",
          text: "Keep the opening line under 10 words.",
          why: `You shortened the hook on your last ${from.length > 1 ? `${from.length} ` : ""}LinkedIn drafts.`,
          source: "edits",
          postIds: from,
        }) || getSuggestions(ctx)[0];
      if (s) postVoiceSuggestion(sid, { contextId: ctx, suggestionId: s.id });
    },
  },
  {
    id: "quickpicker",
    label: "Quickpicker",
    icon: "ap-icon-numbered-list",
    hint: "An inline question with options",
    run: (sid) => {
      inlineQuestion.ask(sid, {
        title: "Which tone should I use?",
        subtitle: "Pick one.",
        stepLabel: "Tone",
        items: [
          { value: "Friendly", label: "Friendly" },
          { value: "Expert", label: "Expert" },
          { value: "Playful", label: "Playful" },
        ],
        customPlaceholder: "Or describe your own…",
        onPick: (v) => postUserTurn(sid, v),
        onCustom: (v) => v.trim() && postUserTurn(sid, v.trim()),
        onSkip: () => {},
        skipLabel: "Not now",
      });
    },
  },
];

const needsDrafts = (sid) => (getPosts(sid).some((p) => p.status !== "scheduled") ? null : "Needs drafts in this chat");
const needsIdeas = (sid) => (getIdeas(sid).length ? null : "Needs ideas in this chat");

// Typed asks — sent through the composer, so the real routing answers them.
const PROMPTS = [
  {
    id: "p-batch",
    label: "Draft a batch",
    prompt: "Draft 4 posts for LinkedIn and X",
    hint: "Reply + drafts in the panel",
    when: needsIdeas,
  },
  {
    id: "p-launch",
    label: "Plan a launch",
    prompt: "Plan a 5-day launch sequence",
    hint: "A 5-day drumbeat of drafts",
    when: needsIdeas,
  },
  {
    id: "p-compare",
    label: "Compare ideas",
    prompt: "Compare the top two ideas",
    hint: "Reply naming two ideas",
    when: needsIdeas,
  },
  {
    id: "p-strongest",
    label: "Strongest idea",
    prompt: "Which idea is the strongest?",
    hint: "Reply with one pick",
    when: needsIdeas,
  },
  {
    id: "p-source",
    label: "Ask what to add",
    prompt: "What source should I add next?",
    hint: "Reply about sources",
    when: needsIdeas,
  },
  {
    id: "p-schedule-all",
    label: "Schedule all drafts",
    prompt: "Schedule all the drafts",
    hint: "The schedule plan card",
    when: needsDrafts,
  },
  {
    id: "p-schedule-some",
    label: "Schedule some drafts",
    prompt: "Schedule some drafts",
    hint: "Which drafts? Quickpicker",
    when: needsDrafts,
  },
  {
    id: "p-delete",
    label: "Delete drafts",
    prompt: "Delete the drafts",
    hint: "The delete confirm",
    when: needsDrafts,
  },
  {
    id: "p-image",
    label: "Image for a draft",
    prompt: "Make an image for a draft",
    hint: "Which draft, then the image flow",
    when: needsDrafts,
  },
].map((p) => ({ ...p, icon: "ap-icon-single-chat-bubble", run: (sid, session, send) => send(p.prompt) }));

const FLOWS = [
  {
    id: "f-draft-idea",
    label: "Draft from an idea",
    icon: "ap-icon-pen",
    hint: "Angle, network and count questions",
    when: needsIdeas,
    run: (sid) => startIdeaDraft(sid, getIdeas(sid)[0].id),
  },
  {
    id: "f-top-posts",
    label: "Pick top posts",
    icon: "ap-icon-feature-analytics",
    hint: "The top posts widget",
    run: (sid) => startTopPostsInline(sid),
  },
  {
    id: "f-topics",
    label: "Pick from the Topic Feed",
    icon: "ap-icon-feature-listening",
    hint: "The topics widget",
    run: (sid, session) => startTopicPickerInline(sid, session),
  },
  {
    id: "f-connector",
    label: "Ask a connector",
    icon: "ap-icon-stack",
    hint: "A live source attached to the composer",
    when: () => flagOff("connectors") || (getConnectedConnectors().length ? null : "Needs a connected connector"),
    run: (sid) => askConnector(sid, getConnectedConnectors()[0].id),
  },
  {
    id: "f-video",
    label: "Video intake question",
    icon: "ap-icon-file--video",
    hint: "“What should I do with this video?”",
    when: (sid) => (videoOf(sid) ? null : "Needs a video source"),
    run: (sid) => {
      const v = videoOf(sid);
      askVideoIntake(sid, v.id, v.filename);
    },
  },
  {
    id: "f-connect-account",
    label: "Connect an account",
    icon: "ap-icon-user--plus",
    hint: "Asked before a draft when none is connected",
    when: () => (getConnectedProfiles().length ? "Only with no account connected" : null),
    run: (sid) =>
      requireConnectedProfiles(sid, { onReady: () => postAssistantMessage(sid, "Connected — back to the draft.") }),
  },
  {
    id: "f-voice-question",
    label: "Voice coaching question",
    icon: "ap-icon-sparkles",
    hint: "How do you end a post on X? (once per visit)",
    when: (sid) => flagOff("networkVoices") || needsDrafts(sid) || coachingTarget(sid, getPosts(sid)).reason || null,
    run: (sid) => coachAfterDraft(sid, getPosts(sid)),
  },
];

const GROUPS = [
  { title: "Components", items: COMPONENTS },
  { title: "Typed asks", items: PROMPTS },
  { title: "Flows", items: FLOWS },
];
const ALL = GROUPS.flatMap((g) => g.items);

// The link + an empty menu; the items are built on open, so their availability
// reads the chat as it is at that moment.
export function renderChatGallery() {
  return `
    <span class="chat-gallery">
      <button type="button" class="ap-link chat-gallery__toggle" data-chat-gallery-toggle aria-haspopup="menu" aria-expanded="false">
        <i class="ap-icon-illuminati" aria-hidden="true"></i> ADMIN MODE: DISPLAY IN CHAT <i class="ap-icon-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="ap-action-dropdown chat-gallery__menu" data-chat-gallery-menu role="menu" hidden></div>
    </span>
  `;
}

function renderItem(item, session) {
  const reason = item.when?.(session.id, session) || null;
  return `
    <button type="button" class="ap-action-dropdown-item has-description" role="menuitem" data-chat-gallery-item="${item.id}" ${reason ? "disabled" : ""}>
      <i class="${item.icon}" aria-hidden="true"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${escapeHtml(item.label)}</span>
        </div>
        <span class="ap-action-dropdown-item-description">${escapeHtml(reason || item.hint)}</span>
      </div>
    </button>
  `;
}

export function closeChatGallery(root) {
  const menu = root.querySelector("[data-chat-gallery-menu]");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  root.querySelector("[data-chat-gallery-toggle]")?.setAttribute("aria-expanded", "false");
}

// Click delegate for the link and its menu. Returns true when it took the click.
// `send(text)` submits a prompt through the composer.
export function onChatGalleryClick(event, root, session, send) {
  const toggle = event.target.closest("[data-chat-gallery-toggle]");
  if (toggle) {
    const menu = root.querySelector("[data-chat-gallery-menu]");
    const open = menu.hidden;
    if (open) {
      menu.innerHTML = GROUPS.map(
        (g) =>
          `<div class="chat-gallery__group">${g.title}</div>${g.items.map((i) => renderItem(i, session)).join("")}`,
      ).join(`<div class="ap-action-dropdown-divider" role="separator"></div>`);
    }
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    return true;
  }
  const btn = event.target.closest("[data-chat-gallery-item]");
  if (btn) {
    closeChatGallery(root);
    ALL.find((i) => i.id === btn.dataset.chatGalleryItem)?.run(session.id, session, send);
    return true;
  }
  if (!event.target.closest("[data-chat-gallery-menu]")) closeChatGallery(root);
  return false;
}
