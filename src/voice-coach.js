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

import { getSessionById } from "./sessions-store.js?v=1787";
import { getContextById } from "./contexts-store.js?v=1787";
import { playbookForNewWork } from "./active-playbook.js?v=1787";
import { getPosts } from "./posts-store.js?v=1787";
import { postVoiceSuggestion, postSelectionEcho, postAssistantMessage } from "./assistant.js?v=1787";
import { startRewrite } from "./draft-rewrite.js?v=1787";
import { escapeHtml } from "./utils.js?v=1787";
import { ask, isActive } from "./inline-question.js?v=1787";
import { propose, accept } from "./voice-coach-store.js?v=1787";
import { normalizeNetwork } from "./social-profiles.js?v=1787";
import { networkVoiceOptions } from "./context-mock-analysis.js?v=1787";
import {
  networkVoicesOn,
  baseNetwork,
  isOverridden,
  networkLabel,
  networkIcon,
  followRules,
} from "./network-voice.js?v=1787";

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
  if (read)
    suggest(sessionId, ctx, { ...read, network: normalizeNetwork(post.network), source: "edits", postIds: [post.id] });
}

// Only the reasons that are about HOW it sounds. Off-topic / inaccurate are
// about the content: nothing for the voice to learn. Each reason has a default
// rule and a version per network where the default would be wrong — "short
// paragraphs" means nothing on X, where a post is one line.
const REASON_RULES = {
  formatting: {
    why: "You flagged this draft's formatting.",
    default: "Short paragraphs, one idea each, a line break between them.",
    x: "One idea per post, no line breaks. A thread only when there are steps.",
    instagram: "The hook in the first line, short paragraphs, the hashtags in one block at the end.",
    facebook: "Two or three short paragraphs, then a question to open the comments.",
    tiktok: "One caption line that says the hook again in words.",
    youtube: "The title carries the hook; the description opens with what the video answers.",
  },
  "too-generic": {
    why: "You marked this draft as too generic.",
    default: "Open on a specific number, name or example, not a general statement.",
    x: "Lead with the number or the name. No setup line.",
    instagram: "Open on one concrete moment someone can picture.",
  },
  "wrong-tone": {
    why: "You said this draft's tone was off.",
    default: "Write like you'd talk to a peer: plain words, no hype.",
    x: "Say it like a reply to a friend: short, dry, no hype.",
    instagram: "Talk to one person, warmly. Nothing that sounds like an ad.",
  },
};

function reasonRule(reason, network) {
  const r = REASON_RULES[reason];
  return r ? { text: r[network] || r.default, why: r.why } : null;
}

export function noticeDraftFeedback(targetId, reasons = []) {
  if (!networkVoicesOn() || !String(targetId).startsWith("draft:")) return;
  const sessionId = sessionFromHash();
  const ctx = sessionId && sessionPlaybook(sessionId);
  const post = ctx && getPosts(sessionId).find((p) => p.id === targetId.slice("draft:".length));
  const network = post && normalizeNetwork(post.network);
  const rule = post && reasons.map((r) => reasonRule(r, network)).find(Boolean);
  if (rule)
    suggest(sessionId, ctx, {
      ...rule,
      network,
      source: "feedback",
      postIds: [post.id],
    });
}

// Closings that read native on each network — the answers offered when a
// network voice has none of its own yet. One table with the Optimize wizard's.
const closingsFor = (n) => networkVoiceOptions(n)?.closingPatterns || null;

const asked = new Set(); // `${contextId}:${network}` — one question per network voice per visit

// The network a closing question would be about, or why there is none — one
// reading for the question itself and for the admin gallery, which says why
// it's off instead of doing nothing.
export function coachingTarget(sessionId, drafts = []) {
  const ctx = sessionPlaybook(sessionId);
  if (!ctx) return { reason: "Needs a Playbook on this chat" };
  const base = baseNetwork(ctx);
  const others = [...new Set(drafts.map((d) => normalizeNetwork(d.network)))].filter(
    (n) => n !== base && closingsFor(n),
  );
  if (!others.length) return { reason: `Needs a draft on a network other than ${networkLabel(base)}` };
  const open = others.filter((n) => !isOverridden(ctx, n, "closingPatterns"));
  if (!open.length) return { reason: "Every network here already has its own closing" };
  const net = open.find((n) => !asked.has(`${ctx.id}:${n}`));
  return net ? { ctx, net } : { reason: "Already asked during this visit" };
}

export function coachAfterDraft(sessionId, drafts = []) {
  if (!networkVoicesOn() || isActive(sessionId)) return;
  const { ctx, net } = coachingTarget(sessionId, drafts);
  if (!net) return;
  const base = baseNetwork(ctx);
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
    items: closingsFor(net).map((c) => ({ value: c, label: c })),
    customPlaceholder: "Or write your own closing…",
    onPick: commit,
    onCustom: (v) => v.trim() && commit(v.trim()),
    onSkip: () => {},
    skipLabel: "Not now",
  });
}

// ── Using what was kept ──────────────────────────────────────────────────────
// A kept rule changes the drafts Archie writes next (posts-store writes every
// draft in its network voice). The drafts already in the chat were written
// before it: these are the ones it can still rewrite — the rule's network, not
// scheduled, not mid-rewrite, not already following it. Field proposals (a
// closing) are not rules: they shape the next drafts only.
export function draftsToRewrite(sessionId, s) {
  if (!s || s.field || s.status !== "accepted") return [];
  return getPosts(sessionId).filter(
    (p) =>
      normalizeNetwork(p.network) === s.network &&
      p.status !== "scheduled" &&
      !p.isRegenerating &&
      !(p.voice?.rules || []).includes(s.text),
  );
}

// Rewrite them, with the regenerate animation, and say so in the thread with
// a link to each — the rule is used where the user can see it.
export function rewriteDraftsWithRule(sessionId, s) {
  const posts = draftsToRewrite(sessionId, s);
  if (!posts.length) return;
  posts.forEach((p) =>
    startRewrite(sessionId, p.id, "voice", (post) => ({
      ...followRules(post, [s.text]),
      cta: post.cta || "",
      voice: { network: s.network, rules: [...(post.voice?.rules || []), s.text] },
    })),
  );
  const n = posts.length;
  postAssistantMessage(
    sessionId,
    `Rewriting your ${n} ${escapeHtml(networkLabel(s.network))} ${n === 1 ? "draft" : "drafts"} so ${
      n === 1 ? "it follows" : "they follow"
    } “${escapeHtml(s.text)}”:${posts.map((p) => `\n- [[post:${p.id}]]`).join("")}`,
  );
}
