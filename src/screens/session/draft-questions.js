// The draft-FOR-whom questions a chat asks before it writes: language, profile
// (and the connect step when none is), repurpose targets, angle, how many
// drafts, and the video intake. Each is an inline Quickpicker in the thread.
// Moved out of session.js, unchanged; askAngleQuestion is also the right
// panel's entry point (it imports this module, not the whole screen).

import { getSessionById } from "../../sessions-store.js?v=1823";
import { getContextById } from "../../contexts-store.js?v=1823";
import { playbookForNewWork } from "../../active-playbook.js?v=1823";
import { isFlagOn } from "../../feature-flags.js?v=1823";
import {
  postAssistantMessage,
  postSelectionEcho,
  postUserProfilesTurn,
  postUserTurn,
  startPending,
  finishPending,
  postActivity,
  postExtractionResult,
  postClipExtractionTurn,
} from "../../assistant.js?v=1823";
import * as inlineQuestion from "../../inline-question.js?v=1823";
import { getIdeas, extractVideoIdeas } from "../../library.js?v=1823";
import {
  getSources as getStreamSources,
  setSourceIdeaCount,
  extractClipsForSource,
} from "../../sources-stream.js?v=1823";
import {
  getConnectedProfiles,
  buildConnectedProfileItems,
  PROFILE_SEARCH_THRESHOLD,
  getConnectedProfileById,
  normalizeNetwork,
} from "../../social-profiles.js?v=1823";
import { requireConnectedProfiles } from "../../connect-profiles-flow.js?v=1823";
import { executeDraftBatch, startDraftFlow, getAnglesForIdea } from "../../draft-flow.js?v=1823";
import * as topPostsFlow from "../../top-posts-flow.js?v=1823";

// Build + show the "Which profile?" question, reached from every Draft Post
// entry point. The chosen profile's platform becomes the draft's network so
// the user gets posts on the surface they actually want to publish to. `count` is threaded through from the count
// picker; `onBack` lets the second-step picker return to the first.
// External entry to the draft-from-idea flow — echoes the chosen idea as a
// selection card (so the pick stays visible) then opens the profile step.
// Internal steps (count / angle / Back) call askProfileQuestion directly, so
// the idea echo is posted exactly once, at selection time.
// The Playbook languages backing this chat (primary first). Falls back to the
// default Playbook + "English" so the flow always has a language to write in.
function playbookLanguages(sessionId) {
  const session = getSessionById(sessionId);
  const ctx = session?.contextId ? getContextById(session.contextId) : playbookForNewWork();
  const langs = ctx && Array.isArray(ctx.languages) && ctx.languages.length ? ctx.languages.slice() : null;
  const primary = ctx?.primaryLanguage || (langs && langs[0]) || ctx?.language || "English";
  return { languages: langs || [primary], primary };
}

// Language gate for the draft flow. When the Playbook publishes in more than
// one language, ask which to write in (default = primary) and echo the pick;
// otherwise skip silently. Posts are then generated in that language using its
// native Voice examples — never a translation. `proceed(language)` continues.
function askLanguageQuestion(sessionId, ideaId, proceed) {
  const { languages, primary } = playbookLanguages(sessionId);
  // Multilingual gated behind a flag (default OFF) — and skip when there's only
  // one language to choose from anyway.
  if (!isFlagOn("multilingualPlaybook") || languages.length <= 1) {
    proceed(primary);
    return;
  }
  postAssistantMessage(sessionId, "Which language should I write in?");
  inlineQuestion.ask(sessionId, {
    title: "Choose a language",
    stepLabel: "Language",
    items: languages.map((l) => ({
      value: l,
      label: l,
      caption: l === primary ? "Primary — your Playbook default" : undefined,
      icon: "ap-icon-web",
    })),
    onPick: (lang) => {
      const chosen = languages.includes(lang) ? lang : primary;
      postSelectionEcho(sessionId, { icon: "ap-icon-web", title: chosen, meta: "Language" });
      proceed(chosen);
    },
    // A default always exists, so Skip writes in the primary language.
    onSkip: () => proceed(primary),
  });
}

export function startIdeaDraft(sessionId, ideaId) {
  const idea = getIdeas(sessionId).find((i) => i.id === ideaId);
  if (idea) {
    const srcName = (idea.sourceIds || []).length
      ? getStreamSources(sessionId).find((s) => s.id === idea.sourceIds[0])?.filename
      : "";
    postSelectionEcho(sessionId, {
      icon: "ap-icon-archie-official",
      title: idea.title,
      meta: srcName ? `Idea · from ${srcName}` : "Idea",
    });
  }
  askLanguageQuestion(sessionId, ideaId, (language) => askProfileQuestion(sessionId, ideaId, { language }));
}

function askProfileQuestion(
  sessionId,
  ideaId,
  { count = 1, angle = null, anglePicks = null, onBack = null, language = null } = {},
) {
  // Nothing connected (skipConnectProfiles) → ask for the connection in this
  // very slot, then come back here. With an account connected this returns
  // straight through, so the flow below is unchanged.
  if (getConnectedProfiles().length === 0) {
    requireConnectedProfiles(sessionId, {
      stepLabel: "Profile",
      onBack: onBack || undefined,
      onReady: () => askProfileQuestion(sessionId, ideaId, { count, angle, anglePicks, onBack, language }),
    });
    return;
  }
  // Connected profiles + their picker presentation come from the shared
  // social-profiles helper, so this picker proposes the exact same
  // accounts (brand handle + avatar with network badge) as the Playbook
  // onboarding profile step.
  const connected = getConnectedProfiles();
  postAssistantMessage(sessionId, "Which profile should I draft this for?");
  const profileItems = buildConnectedProfileItems();
  inlineQuestion.ask(sessionId, {
    title: "Pick a connected social profile",
    stepLabel: "Profile",
    items: profileItems,
    // With a lot of connected accounts, a flat list is slow to scan — add a
    // live search box so the user can filter by name/handle/network.
    searchable: profileItems.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search profiles by name, handle or network…",
    onPick: (accountId) => {
      const account = connected.find((a) => a.id === accountId);
      // Echo the pick as a visual profile chip (avatar + handle) so selecting a
      // profile gives the same object-preview feedback as picking a post — not
      // a plain text bubble. Mirrors the multi-account batch path below.
      if (account) postUserProfilesTurn(sessionId, [account]);
      postActivity(sessionId, ["set_publishing_accounts"]);
      const channels = account?.platform ? [account.platform] : null;
      // Multi-angle batch (from the angle stepper) → one draft run that
      // produces each angle's count. Otherwise the legacy single-angle path.
      if (anglePicks && anglePicks.length) {
        executeDraftBatch(sessionId, ideaId, channels, anglePicks, language);
      } else {
        startDraftFlow(sessionId, ideaId, count, channels, angle, language);
      }
    },
    onBack: onBack || undefined,
    onSkip: onBack ? undefined : () => {},
  });
}

// ── Published-posts repurposing (top-posts flow) ──────────────────────
// The winner board (top-posts-flow.js) hands off here once the user picks one or
// more winners — via a card's "Repurpose" or the bulk bar. We echo the picks,
// then go straight to the profiles step and generate the network-adapted drafts.
export function startRepurposeFlow(sessionId, postIds) {
  const ids = topPostsFlow.echoRepurposePicks(sessionId, postIds);
  if (!ids.length) return;
  askRepurposeProfiles(sessionId, ids);
}

// Profile-selection — a SINGLE unified per-profile version stepper (no separate
// "same vs other" scope step). Lists every connected profile: source-network
// profiles first, tagged "· Source". Every profile starts at 0 — the user opts
// in explicitly. "Generate N drafts" sums the counts and each draft is adapted
// to its profile's network. This is the first (and only) step after the picks
// are echoed — every repurpose entry point funnels here, so they all behave
// identically.
export function askRepurposeProfiles(sessionId, postIds) {
  // Every profile starts at 0 (fully opt-in); source profiles just lead the list.
  const items = topPostsFlow.repurposeProfileItems(postIds, { include: "all" }).map((it) => ({ ...it, count: 0 }));
  if (!items.length) {
    // Same slot, same shape: ask for the account here, then re-enter with the
    // list this step needs.
    requireConnectedProfiles(sessionId, {
      stepLabel: "Profile",
      onReady: () => askRepurposeProfiles(sessionId, postIds),
    });
    return;
  }
  postAssistantMessage(sessionId, "Where should I repurpose these?");
  inlineQuestion.ask(sessionId, {
    title: "Pick the profiles to repurpose to",
    subtitle: "Set how many versions I'll write for each profile — leave one at 0 to skip it.",
    stepLabel: "Versions per profile",
    // Per-profile version counter, capped so a single run stays scannable.
    stepper: true,
    countMin: 0,
    countMax: 5,
    submitCountLabel: (total) => `Generate ${total} draft${total === 1 ? "" : "s"}`,
    items,
    // Long profile lists get a live search box to filter down before setting counts.
    searchable: items.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search profiles by name, handle or network…",
    onPick: ({ picks, total }) => {
      // Each pick is { value: accountId, count } (count already > 0). Resolve
      // to the account + its network, echo the chosen profiles as chips, then
      // generate `count` versions per profile.
      const targets = picks
        .map((p) => ({ account: getConnectedProfileById(p.value) || null, count: p.count }))
        .filter((t) => t.account);
      postUserProfilesTurn(
        sessionId,
        targets.map((t) => t.account),
      );
      postUserTurn(
        sessionId,
        `${total} draft${total === 1 ? "" : "s"} · ${targets.length} profile${targets.length === 1 ? "" : "s"}`,
      );
      const networkTargets = targets.map((t) => ({
        network: normalizeNetwork(t.account.platform),
        count: t.count,
      }));
      topPostsFlow.executeRepurpose(sessionId, postIds, networkTargets);
    },
  });
}

// "Draft a post from this idea" — step 1: pick an angle. Triggered by the
// right-panel Ideas card "Draft" button. Archie suggests 4 AI-generated
// angles (title + short description) the idea could be reframed into; the
// chosen angle is threaded through the rest of the flow (count → profile →
// generate) so the produced drafts reflect it. Mirrors the screenshot
// pattern by reusing the inline-question numbered-card picker.
export function askAngleQuestion(sessionId, ideaId, { language = null } = {}) {
  // Language gate first (once) — then re-enter with the chosen language so it
  // threads through the angle → count → profile → generate chain.
  if (language === null) {
    askLanguageQuestion(sessionId, ideaId, (lang) => askAngleQuestion(sessionId, ideaId, { language: lang }));
    return;
  }
  const angles = getAnglesForIdea(sessionId, ideaId);
  // No resolvable idea / angles — fall back to the original count flow so
  // the Draft button never dead-ends.
  if (!angles.length) {
    askDraftCountQuestion(sessionId, ideaId, { language });
    return;
  }
  // The prod logs the set-up it ran before proposing angles.
  postActivity(sessionId, ["request_config", "analyze_tone", "propose_angles"]);
  postAssistantMessage(sessionId, "Let's draft from these angles.");
  // The quick picker shows a brand loader (~4s) while Archie "finds the
  // angles", then swaps in the real angle stepper. Cancelling during the
  // loader aborts the reveal.
  inlineQuestion.ask(sessionId, {
    loading: true,
    title: "Suggested angles",
    subtitle: "Finding the strongest angles for this idea…",
    skipLabel: "Cancel",
    onSkip: () => {},
  });
  window.setTimeout(() => {
    if (!inlineQuestion.isActive(sessionId)) return;
    inlineQuestion.ask(sessionId, {
      title: "Suggested angles",
      subtitle: "Set how many drafts I'll write for each angle — leave one at 0 to skip it.",
      stepLabel: "Drafts per angle",
      skipLabel: "Cancel",
      // Stepper mode — each angle row carries its own drafts counter (0 to
      // skip an angle). "Generate N drafts" sums every angle and advances
      // straight to the profile step, where the whole batch is produced.
      stepper: true,
      defaultCount: 1,
      countMin: 0,
      countMax: 20,
      submitCountLabel: (total) => `Generate ${total} draft${total === 1 ? "" : "s"}`,
      items: angles.map((a) => ({
        value: a.id,
        label: a.title,
        caption: a.description,
      })),
      onPick: ({ picks }) => {
        // Map each picked angle id → its angle object + count.
        const anglePicks = picks
          .map((p) => ({ angle: angles.find((a) => a.id === p.value) || null, count: p.count }))
          .filter((p) => p.angle && p.count > 0);
        const total = anglePicks.reduce((sum, p) => sum + p.count, 0);
        // Echo the batch as a user turn so it stays visible once the picker
        // unmounts — e.g. "3 drafts · 2 angles".
        postUserTurn(
          sessionId,
          `${total} draft${total === 1 ? "" : "s"} · ${anglePicks.length} angle${anglePicks.length === 1 ? "" : "s"}`,
        );
        postActivity(sessionId, ["set_angle_mix"]);
        askProfileQuestion(sessionId, ideaId, {
          anglePicks,
          language,
          // ← Back returns to the angle picker so the user can re-choose.
          onBack: () => askAngleQuestion(sessionId, ideaId, { language }),
        });
      },
      // First step of the flow — no earlier question, so it's Cancel (not Back).
      onSkip: () => {},
    });
  }, 4000);
}

// Step 2: how many drafts. Threads the chosen `angle` through to the
// profile picker. When reached from the angle step (`onBack` set) the
// picker shows a Back affordance; entered directly it shows Cancel.
function askDraftCountQuestion(sessionId, ideaId, { angle = null, onBack = null, language = null } = {}) {
  postAssistantMessage(sessionId, "How many drafts should I generate?");
  const advance = (count) => {
    // Clamp to a reasonable range — single-digit + custom typed numbers
    // can land outside it (0, negative, NaN). 1 floors any nonsense.
    const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    // Echo the count as a user turn so the pick stays visible once the
    // picker unmounts (covers both the preset chips and the custom input).
    postUserTurn(sessionId, `${n} draft${n === 1 ? "" : "s"}`);
    askProfileQuestion(sessionId, ideaId, {
      count: n,
      angle,
      language,
      // ← Back returns to the count picker so the user can change their mind.
      onBack: () => askDraftCountQuestion(sessionId, ideaId, { angle, onBack, language }),
    });
  };
  inlineQuestion.ask(sessionId, {
    title: "How many drafts from this idea?",
    stepLabel: "Drafts",
    skipLabel: "Cancel",
    items: [
      { value: 1, label: "1 draft" },
      { value: 3, label: "3 drafts" },
      { value: 5, label: "5 drafts" },
    ],
    customPlaceholder: "Or type any number (1–20)",
    onPick: advance,
    onCustom: advance,
    // When chained from the angle step, offer Back to it instead of Cancel.
    onBack: onBack || undefined,
    onSkip: onBack ? undefined : () => {},
  });
}

// "What would you like to do with this video?" — asked via the quick picker
// once a freshly-added video is processed (intake-lifecycle → onVideoReady).
// Each option carries a caption explaining what it does; picking one echoes
// it as a user turn and runs only that branch.
export function askVideoIntake(sessionId, sourceId, filename) {
  postAssistantMessage(sessionId, "What would you like to do with this video?");
  inlineQuestion.ask(sessionId, {
    title: "Use this video",
    stepLabel: "Video",
    skipLabel: "Cancel",
    items: [
      {
        value: "ideas",
        label: "Analyze for ideas",
        caption: "Pull the key themes and talking points into your Ideas to draft posts from.",
        icon: "ap-icon-archie-official",
      },
      {
        value: "clips",
        label: "Extract & create clips",
        caption: "Cut the video into short, post-ready clips you can caption and publish.",
        icon: "ap-icon-video",
      },
    ],
    onPick: (value) => {
      if (value === "ideas") {
        postUserTurn(sessionId, "Analyze for ideas");
        runVideoIdeasChoice(sessionId, sourceId, filename);
      } else if (value === "clips") {
        postUserTurn(sessionId, "Extract & create clips");
        runVideoClipsChoice(sessionId, sourceId, filename);
      }
    },
    onSkip: () => {},
  });
}

// ── Video-intake choice branches ──────────────────────────────────────────
// Run after the user answers "what to do with this video?" (intake-lifecycle).
// Extraction is deferred at upload, so each branch produces only its output.

// "Analyze for ideas" — brief thinking chip, inject the canned video ideas,
// surface the source-intake "N ideas" pill, then post the rich extraction turn.
function runVideoIdeasChoice(sessionId, sourceId, filename) {
  const pendingId = startPending(sessionId, "Extracting ideas from content…", ["extract_ideas"]);
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    const ideas = extractVideoIdeas(sessionId, sourceId);
    setSourceIdeaCount(sessionId, sourceId, ideas.length);
    postExtractionResult(sessionId, { filename, ideas });
  }, 1600);
}

// "Extract & create clips" — post the clip-extraction turn (renders pending,
// cycling through explanatory stages while no clips exist yet), then kick off
// the staged ~7.5s extraction. The ticker owns the timing and flips the turn to
// "ready" (via clipExtractionStatus) once the clips are attached.
function runVideoClipsChoice(sessionId, sourceId, filename) {
  postClipExtractionTurn(sessionId, { sourceId, filename });
  extractClipsForSource(sessionId, sourceId);
}
