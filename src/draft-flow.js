// Draft-a-post conversational flow orchestrator.
//
// startDraftFlow(sessionId, ideaId):
//   Kicks off the multi-step flow from an idea card "Draft a post" click.
//   1. Echoes user intent as a user turn.
//   2. Shows a thinking chip (~1.5s).
//   3a. If idea has >1 channel: shows an assistant-choice turn (channel picker).
//   3b. If idea has 1 channel: skips the picker and calls executeDraft directly.
//
// executeDraft(sessionId, ideaId, selectedChannels):
//   Called from session.js when the user clicks "Draft them" in the choice turn.
//   1. Echoes the selected channels as a user turn.
//   2. Shows a thinking chip (~2s).
//   3. Creates one draft post per channel via posts-store.js.
//   4. Posts a structured "Drafted N posts" result turn.

import {
  postAssistantChoice,
  startPending,
  finishPending,
  postDraftResult,
  reportDraftFailure,
  GENERATION_TOOLS,
} from "./assistant.js?v=1797";
import { getIdeas } from "./library.js?v=1797";
import { anglesByIdea } from "./mocks.js?v=1797";
import { addPostDraft } from "./posts-store.js?v=1797";
import { networkMeta } from "./social-profiles.js?v=1797";
import { coachAfterDraft } from "./voice-coach.js?v=1797";

// The set-up pass before a draft (reading the brief and the voice) — logged as
// its own tools, so the generation that follows isn't counted twice.
const withSetupChip = (sessionId, work) => withPendingChip(sessionId, work, null, ["request_config", "analyze_tone"]);

// Simulated "generating drafts" delay shared by every draft flow.
const DRAFT_DELAY_MS = 6000;

// Shared lifecycle for the draft flows: show the thinking chip, wait out the
// simulated generation delay, clear the chip, then run `work`. When `onError`
// is given, `work` runs inside a try/catch so a downstream failure (posts-store
// throws, assistant push errors) still clears the chip and surfaces a retry
// toast instead of leaving the chip ticking forever (FIND-D2).
function withPendingChip(sessionId, work, onError, tools = GENERATION_TOOLS) {
  const pendingId = startPending(sessionId, "Generating post drafts…", tools);
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    if (!onError) {
      work();
      return;
    }
    try {
      work();
    } catch (err) {
      onError(err);
    }
  }, DRAFT_DELAY_MS);
}

// An idea belongs to the session that produced it, so that session is the only
// place worth looking. The fallback that used to follow — a flat lookup in
// mocks.ideas — existed because the right panel browsed every session's ideas
// at once and could hand this flow an id from another chat. It can't any more.
function resolveIdea(sessionId, ideaId) {
  return getIdeas(sessionId).find((i) => i.id === ideaId) || null;
}

// Generic angle fallback for ideas without a handcrafted set in
// anglesByIdea. Four fixed reframings (contrarian, how-to, story,
// data-backed) seeded off the idea's own title so the output reads as
// tailored without any randomness — keeps results stable across renders.
function generateAngles(idea) {
  const title = idea.title || "this idea";
  return [
    {
      id: `angle-${idea.id}-1`,
      title: "The contrarian take",
      description: `Challenge the common assumption behind “${title}” and argue the opposite.`,
    },
    {
      id: `angle-${idea.id}-2`,
      title: "A practical how-to",
      description: `Turn “${title}” into a step-by-step playbook readers can act on today.`,
    },
    {
      id: `angle-${idea.id}-3`,
      title: "The behind-the-scenes story",
      description: `Share the real story and the lessons behind “${title}”.`,
    },
    {
      id: `angle-${idea.id}-4`,
      title: "The data-backed proof",
      description: `Back “${title}” with concrete numbers and a result readers can trust.`,
    },
  ];
}

// Provenance stamped onto every idea-drafted post → rendered as the collapsible
// "Generation context" panel by post-card.js: the angle the user picked (when
// any) as the headline, and the source idea it drew on.
function ideaContext(idea, angle) {
  return {
    kind: "idea",
    headline: angle ? { icon: "ap-icon-target", text: `Angle · ${angle.description}` } : null,
    source: {
      icon: "ap-icon-sparkles",
      label: "1 source idea",
      detail: idea.body || idea.title,
    },
  };
}

// Resolve the 4 angles to suggest for an idea: handcrafted set from
// mocks when present, otherwise a generic generated set. Returns [] when
// the idea can't be resolved.
export function getAnglesForIdea(sessionId, ideaId) {
  const idea = resolveIdea(sessionId, ideaId);
  if (!idea) return [];
  return anglesByIdea[ideaId] || generateAngles(idea);
}

function labelFor(channel) {
  return networkMeta(channel)?.label || channel;
}

export function startDraftFlow(sessionId, ideaId, count = 1, channelOverride = null, angle = null, language = null) {
  const idea = resolveIdea(sessionId, ideaId);
  if (!idea) return;

  // The angle / count / profile picks are each echoed as their own user
  // turn by the pickers in session.js, so we no longer post a composite
  // "Draft N posts: …" echo here — that would duplicate the per-step
  // responses. Go straight to the thinking chip.
  withSetupChip(sessionId, () => {
    // The caller picked a profile explicitly — honour it and skip the
    // channel picker. Used by the right-panel count+profile flow where
    // the user has already chosen which network to draft for.
    if (Array.isArray(channelOverride) && channelOverride.length > 0) {
      executeDraft(sessionId, ideaId, channelOverride, count, angle, language);
      return;
    }

    const channels = (idea.channels || ["linkedin"]).filter((c) => networkMeta(c));

    // When count > 1, the user has already committed to a batch size —
    // skip the channel picker entirely and draft on the idea's primary
    // channel so we don't stack two pickers back-to-back.
    if (count > 1 || channels.length <= 1) {
      const chosen = channels.length >= 1 ? [channels[0]] : ["linkedin"];
      executeDraft(sessionId, ideaId, chosen, count, angle, language);
      return;
    }

    const choices = channels.map((c) => ({
      value: c,
      label: labelFor(c),
      icon: networkMeta(c).icon,
    }));

    postAssistantChoice(sessionId, {
      text: "Which channels should I draft for?",
      choices,
      multi: true,
      handler: "draft-channels",
      // Carry the chosen angle + language so the multi-channel fallback path
      // can pass them on to executeDraft (see dispatchChoiceSubmit).
      context: { ideaId: idea.id, angle, language },
      submitLabel: "Draft them",
    });
  });
}

export function executeDraft(sessionId, ideaId, selectedChannels, count = 1, angle = null, language = null) {
  const idea = resolveIdea(sessionId, ideaId);
  if (!idea || !selectedChannels || selectedChannels.length === 0) return;

  // The profile pick is already echoed as a user turn by the profile
  // picker, and the rare multi-channel fallback keeps its choice chips
  // visible in place — so no channel echo is posted here. Straight to
  // the thinking chip while "generating" the drafts.
  withPendingChip(
    sessionId,
    () => {
      // Total drafts = max(count, channels). When count > channels.length
      // we cycle channels round-robin so a "5 drafts on linkedin" request
      // produces 5 linkedin posts and a multi-channel "1 draft per
      // channel" pick still creates one per channel.
      const total = Math.max(count, selectedChannels.length);
      // Mock draft body reflects the chosen angle when present so the
      // generated preview feels shaped by the reframing the user picked.
      const draftBody = angle ? angle.description : idea.body;
      const drafts = Array.from({ length: total }, (_, i) => {
        const d = addPostDraft(sessionId, {
          network: selectedChannels[i % selectedChannels.length],
          text: [idea.title, ...(draftBody ? [draftBody] : [])],
          hashtags: [],
          language,
        });
        d.generationContext = ideaContext(idea, angle);
        return d;
      });
      postDraftResult(sessionId, {
        ideaTitle: idea.title,
        drafts,
      });
      coachAfterDraft(sessionId, drafts);
    },
    (err) =>
      reportDraftFailure(sessionId, err, () =>
        executeDraft(sessionId, ideaId, selectedChannels, count, angle, language),
      ),
  );
}

// Multi-angle batch — produces each angle's count of drafts in a single run,
// then posts ONE combined result. `anglePicks` is [{ angle, count }] (count
// already > 0). Channels are cycled round-robin across the whole batch so a
// single chosen profile still yields the right total. Mirrors executeDraft's
// pending + try/catch + Retry contract.
export function executeDraftBatch(sessionId, ideaId, selectedChannels, anglePicks, language = null) {
  const idea = resolveIdea(sessionId, ideaId);
  const channels = Array.isArray(selectedChannels) && selectedChannels.length ? selectedChannels : ["linkedin"];
  if (!idea || !Array.isArray(anglePicks) || anglePicks.length === 0) return;

  withPendingChip(
    sessionId,
    () => {
      const drafts = [];
      let ch = 0;
      for (const { angle, count } of anglePicks) {
        const draftBody = angle ? angle.description : idea.body;
        for (let i = 0; i < count; i += 1) {
          const d = addPostDraft(sessionId, {
            network: channels[ch % channels.length],
            text: [idea.title, ...(draftBody ? [draftBody] : [])],
            hashtags: [],
            language,
          });
          d.generationContext = ideaContext(idea, angle);
          drafts.push(d);
          ch += 1;
        }
      }
      postDraftResult(sessionId, { ideaTitle: idea.title, drafts });
      coachAfterDraft(sessionId, drafts);
    },
    (err) =>
      reportDraftFailure(sessionId, err, () =>
        executeDraftBatch(sessionId, ideaId, selectedChannels, anglePicks, language),
      ),
  );
}
