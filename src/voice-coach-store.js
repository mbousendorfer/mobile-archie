// voice-coach-store — what Archie PROPOSES for a Playbook's network voices
// (flag networkVoices). Global catalogue keyed by Playbook: a suggestion comes
// out of produced content (a draft edit, a thumbs-down), so it fails the
// Playbook's inclusion test and lives here, beside it — the competitors'
// "propose beside, never write inside" pattern (CONCEPTS §1). Only accept()
// writes the Playbook, and only because someone clicked Add.
//
// Suggestion = { id, network, text, why, source: "edits"|"feedback"|"coaching",
//                field?: "closingPatterns"|"signatureHooks", postIds?: string[], status }
//   postIds: the drafts it came from, in the chat it was noticed in (the card links them).
//   status: "pending" | "accepted" | "dismissed". A dismissed one is kept so
//   the same proposal never resurfaces.
//
// Public API: getSuggestions(ctxId, { network?, status? }) · getSuggestion(ctxId, id)
//             propose(ctxId, s) → Suggestion | null · accept(ctxId, id) · undo(ctxId, id) · dismiss(ctxId, id)
//             subscribe(fn)

import { voiceSuggestionsByContext } from "./mocks.js?v=1842";
import { isNewUser } from "./user-mode.js?v=1842";
import { createNotifier } from "./store-utils.js?v=1842";
import { getContextById, updateContext } from "./contexts-store.js?v=1842";
import { withSuggestion, withoutSuggestion } from "./network-voice.js?v=1842";
import { normalizeNetwork } from "./social-profiles.js?v=1842";

const byCtx = new Map(); // contextId → Suggestion[]
const notifier = createNotifier("voice-coach-store");
let seq = 0;

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify();

function list(ctxId) {
  if (!byCtx.has(ctxId)) {
    const seed = isNewUser() ? [] : voiceSuggestionsByContext[ctxId] || [];
    byCtx.set(
      ctxId,
      seed.map((s) => ({ ...s, status: "pending" })),
    );
  }
  return byCtx.get(ctxId);
}

export function getSuggestions(ctxId, { network = null, status = "pending" } = {}) {
  if (!ctxId) return [];
  return list(ctxId).filter(
    (s) => (!status || s.status === status) && (!network || s.network === normalizeNetwork(network)),
  );
}

export function getSuggestion(ctxId, id) {
  return (ctxId && list(ctxId).find((s) => s.id === id)) || null;
}

// Null when the same proposal was already made (whatever became of it) — a
// dismissed rule must not come back because the user edited one more draft.
export function propose(ctxId, s) {
  if (!ctxId || !s?.text) return null;
  const network = normalizeNetwork(s.network);
  const all = list(ctxId);
  if (all.some((x) => x.network === network && x.text === s.text)) return null;
  const next = { ...s, network, id: `vs-${Date.now().toString(36)}-${++seq}`, status: "pending" };
  all.unshift(next);
  notify();
  return next;
}

export function accept(ctxId, id) {
  const s = getSuggestion(ctxId, id);
  const ctx = getContextById(ctxId);
  if (!s || !ctx || s.status !== "pending") return null;
  updateContext(ctxId, { voiceByNetwork: withSuggestion(ctx, s), updatedAt: "just now" });
  s.status = "accepted";
  notify();
  return s;
}

// Undo a Remember: the rule leaves the Playbook, the proposal asks again.
export function undo(ctxId, id) {
  const s = getSuggestion(ctxId, id);
  const ctx = getContextById(ctxId);
  if (!s || !ctx || s.status !== "accepted") return null;
  updateContext(ctxId, { voiceByNetwork: withoutSuggestion(ctx, s), updatedAt: "just now" });
  s.status = "pending";
  notify();
  return s;
}

export function dismiss(ctxId, id) {
  const s = getSuggestion(ctxId, id);
  if (!s || s.status !== "pending") return null;
  s.status = "dismissed";
  notify();
  return s;
}
