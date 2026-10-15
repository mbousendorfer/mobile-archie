// voice-coach — Archie noticing how a network voice should change, and asking
// (flag networkVoices). Three signals, each ending in a PROPOSAL, never a
// silent write (CONCEPTS §1 — "propose beside, never write inside"):
//
//   noticeDraftEdit      a draft reworked by hand (Drafts panel, draftInlineEdit)
//   noticeDraftFeedback  a thumbs-down with a voice-shaped reason
//   coachAfterDraft      a question, after drafting for a network whose voice
//                        is still thin — the answer IS the explicit gesture
//
// The first two post a "voice-suggestion" turn in the chat; the same
// suggestion waits on the Playbook's Voice tab until Add or Not now.
//
// ponytail: the edit heuristics are a mock reading of one before/after pair.
// The real thing compares many drafts per network before proposing.

import { getSessionById } from "./sessions-store.js?v=1749";
import { getContextById } from "./contexts-store.js?v=1749";
import { playbookForNewWork } from "./active-playbook.js?v=1749";
import { getPosts } from "./posts-store.js?v=1749";
import { postVoiceSuggestion, postSelectionEcho } from "./assistant.js?v=1749";
import { ask, isActive } from "./inline-question.js?v=1749";
import { propose, accept } from "./voice-coach-store.js?v=1749";
import { normalizeNetwork } from "./social-profiles.js?v=1749";
import { networkVoicesOn, baseNetwork, isOverridden, networkLabel, networkIcon } from "./network-voice.js?v=1749";

function sessionPlaybook(sessionId) {
  const session = getSessionById(sessionId);
  return session?.contextId ? getContextById(session.contextId) : playbookForNewWork();
}

function sessionFromHash() {
  const m = window.location.hash.match(/^#\/session\/([^?/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const words = (s) =>
  String(s || "")
    .split(/\s+/)
    .filter(Boolean).length;
const EMOJI = /\p{Extended_Pictographic}/u;

// The ONE change worth naming in an edit, most specific first. Null when the
// edit says nothing about the voice (a typo, a fact).
function readEdit(before, after) {
  const bText = (before.text || []).join("\n");
  const aText = (after.text || []).join("\n");
  if (EMOJI.test(bText) && !EMOJI.test(aText))
    return { text: "No emoji.", why: "You took every emoji out of this draft." };
  const bTags = (before.hashtags || []).length;
  const aTags = (after.hashtags || []).length;
  if (bTags > 0 && aTags === 0) return { text: "No hashtags.", why: "You removed all the hashtags from this draft." };
  if (bTags > 3 && aTags < bTags)
    return { text: `${aTags} hashtags at most.`, why: `You cut the hashtags from ${bTags} to ${aTags}.` };
  const bHook = words(before.text?.[0]);
  const aHook = words(after.text?.[0]);
  if (bHook >= 8 && aHook > 0 && aHook <= bHook * 0.7)
    return {
      text: `Keep the opening line under ${Math.max(6, Math.ceil(aHook / 2) * 2)} words.`,
      why: `You cut the opening line from ${bHook} words to ${aHook}.`,
    };
  const bAll = words(bText);
  const aAll = words(aText);
  if (bAll >= 40 && aAll <= bAll * 0.75)
    return {
      text: `Keep posts to about ${Math.max(20, Math.round(aAll / 10) * 10)} words.`,
      why: `You shortened this draft from ${bAll} words to ${aAll}.`,
    };
  return null;
}

function suggest(sessionId, ctx, s) {
  const made = propose(ctx.id, s);
  if (made) postVoiceSuggestion(sessionId, { contextId: ctx.id, suggestionId: made.id });
}

export function noticeDraftEdit(sessionId, postId, before, after) {
  if (!networkVoicesOn()) return;
  const ctx = sessionPlaybook(sessionId);
  const post = getPosts(sessionId).find((p) => p.id === postId);
  const read = ctx && post ? readEdit(before, after) : null;
  if (read) suggest(sessionId, ctx, { ...read, network: normalizeNetwork(post.network), source: "edits" });
}

// Only the reasons that are about HOW it sounds. Off-topic / inaccurate are
// about the content: nothing for the voice to learn.
const REASON_RULES = {
  formatting: {
    text: "Short paragraphs, one idea each, a line break between them.",
    why: "You flagged this draft's formatting.",
  },
  "too-generic": {
    text: "Open on a specific number, name or example, not a general statement.",
    why: "You marked this draft as too generic.",
  },
  "wrong-tone": {
    text: "Write like you'd talk to a peer: plain words, no hype.",
    why: "You said this draft's tone was off.",
  },
};

export function noticeDraftFeedback(targetId, reasons = []) {
  if (!networkVoicesOn() || !String(targetId).startsWith("draft:")) return;
  const sessionId = sessionFromHash();
  const ctx = sessionId && sessionPlaybook(sessionId);
  const post = ctx && getPosts(sessionId).find((p) => p.id === targetId.slice("draft:".length));
  const rule = post && reasons.map((r) => REASON_RULES[r]).find(Boolean);
  if (rule) suggest(sessionId, ctx, { ...rule, network: normalizeNetwork(post.network), source: "feedback" });
}

// Closings that read native on each network — the answers offered when a
// network voice has none of its own yet.
const CLOSINGS = {
  linkedin: ["What's your take? Reply and tell me.", "Follow for more like this.", "Link in the comments."],
  instagram: ["Save this for later.", "Tell me in the comments.", "Link in bio."],
  x: ["Thoughts?", "More in the thread below.", "Agree or disagree?"],
  facebook: ["Share this with someone who needs it.", "What would you add?", "Link in the comments."],
  tiktok: ["Follow for part 2.", "Tell me in the comments.", "Save this one."],
  youtube: ["Subscribe for the next one.", "Tell me in the comments.", "Full video linked below."],
};

const asked = new Set(); // `${contextId}:${network}` — one question per network voice per visit

export function coachAfterDraft(sessionId, drafts = []) {
  if (!networkVoicesOn() || isActive(sessionId)) return;
  const ctx = sessionPlaybook(sessionId);
  if (!ctx) return;
  const base = baseNetwork(ctx);
  const net = drafts
    .map((d) => normalizeNetwork(d.network))
    .find((n) => n !== base && CLOSINGS[n] && !isOverridden(ctx, n, "closingPatterns") && !asked.has(`${ctx.id}:${n}`));
  if (!net) return;
  asked.add(`${ctx.id}:${net}`);
  const label = networkLabel(net);
  const commit = (text) => {
    postSelectionEcho(sessionId, { icon: networkIcon(net), title: text, meta: `${label} closing` });
    // The answer is the explicit gesture: kept at once, shown as a kept memory note.
    const s = propose(ctx.id, {
      network: net,
      field: "closingPatterns",
      text,
      why: "You told me.",
      source: "coaching",
    });
    if (s && accept(ctx.id, s.id)) postVoiceSuggestion(sessionId, { contextId: ctx.id, suggestionId: s.id });
  };
  ask(sessionId, {
    intro: `Your ${label} voice still closes the way your ${networkLabel(base)} one does. Quick question so I get it right next time.`,
    title: `How do you usually end a post on ${label}?`,
    stepLabel: "Voice",
    items: CLOSINGS[net].map((c) => ({ value: c, label: c })),
    customPlaceholder: "Or write your own closing…",
    onPick: commit,
    onCustom: (v) => v.trim() && commit(v.trim()),
    onSkip: () => {},
    skipLabel: "Not now",
  });
}
