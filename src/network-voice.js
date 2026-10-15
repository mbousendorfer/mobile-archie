// network-voice — a Playbook's voice, per network (flag `networkVoices`).
//
// The model, stored on the Playbook (it's identity: how this brand sounds on
// LinkedIn is true before the first post and after the hundredth):
//   voiceBaseNetwork  "linkedin" — where the base voice was learned from (the
//                     first network connected or picked at creation;
//                     the others get an adaptation drafted then, see
//                     analyzeNetworkVoices).
//   voiceByNetwork    { [network]: { signatureHooks?, closingPatterns?,
//                     formattingStyle?, visualStyle?, rules: string[],
//                     drafted?: true } } — drafted: written by Archie (at
//                     creation, Learn from, Optimize) and untouched since
//
// A network entry holds ONLY what differs from the base: an absent field
// inherits the base voice. `rules` are what Archie learned and the user
// accepted ("Keep the opening line short"). Nothing here writes — the
// suggestions live in voice-coach-store.js, outside the Playbook, and only an
// explicit Add moves one in.
//
// ponytail: network overrides are language-agnostic; with multilingualPlaybook
// ON an overridden hook is written in one language. Per-language × per-network
// examples when a brand actually publishes in two languages on one network.

import { isFlagOn } from "./feature-flags.js?v=1820";
import { escapeHtml } from "./utils.js?v=1820";
import { NETWORKS, normalizeNetwork, getConnectedProfileById } from "./social-profiles.js?v=1820";

// The parts of a voice — ONE registry, in reading order. `isNew` marks a part
// the product just added: a network that hasn't optimized it is told so (an
// orange arc, a "New" pill). Hashtags is that part, simulated behind the flag
// voiceNewSection — the demo of a section added to every Voice.
export const VOICE_PARTS = [
  { field: "signatureHooks", title: "Opens with" },
  { field: "closingPatterns", title: "Closes with" },
  { field: "formattingStyle", title: "Formatting" },
  { field: "visualStyle", title: "Emoji & casing" },
  { field: "hashtagStyle", title: "Hashtags", isNew: true, flag: "voiceNewSection" },
];

// Every field a voice can carry, whatever the flags — what a copy must keep, so
// turning a part off never erases what was written for it.
export const ALL_NETWORK_FIELDS = VOICE_PARTS.map((p) => p.field);

// The parts on screen now.
export function voiceParts() {
  return VOICE_PARTS.filter((p) => !p.flag || isFlagOn(p.flag));
}

export function networkFields() {
  return voiceParts().map((p) => p.field);
}

const NEW_FIELDS = new Set(VOICE_PARTS.filter((p) => p.isNew).map((p) => p.field));
export const isNewPart = (field) => NEW_FIELDS.has(field);
const LIST_FIELDS = new Set(["signatureHooks", "closingPatterns"]);

export function networkVoicesOn() {
  return isFlagOn("networkVoices");
}

const known = (n) => (NETWORKS[normalizeNetwork(n)] ? normalizeNetwork(n) : "");

export function networkLabel(n) {
  return NETWORKS[normalizeNetwork(n)]?.label || n;
}

export function networkIcon(n) {
  return NETWORKS[normalizeNetwork(n)]?.icon || "ap-icon-web";
}

// The network the base voice was learned from. Stored at creation; a legacy
// Playbook falls back on its publishing profile, then on LinkedIn.
export function baseNetwork(ctx) {
  return (
    known(ctx?.voiceBaseNetwork) ||
    known(getConnectedProfileById(ctx?.selectedProfileId)?.platform) ||
    known(ctx?.connectedSocials?.[0]) ||
    "linkedin"
  );
}

// Every network has a voice from the start — the base's, until it's optimized.
// Order: the base, the ones it publishes on, the rest. Optimizing never moves
// a network: a tab must not jump under the cursor.
export function voiceNetworks(ctx) {
  const list = [baseNetwork(ctx), ...(ctx?.connectedSocials || []), ...Object.keys(NETWORKS)].map(known);
  return [...new Set(list.filter(Boolean))];
}

// Optimized = at least one part adapted to the network. Rules alone don't make
// it: they were learned from use, the parts are what Optimize writes.
export function isOptimized(ctx, n) {
  const e = networkEntry(ctx, n);
  return !!e && networkFields().some((f) => e[f] !== undefined);
}

export function networkEntry(ctx, n) {
  return ctx?.voiceByNetwork?.[normalizeNetwork(n)] || null;
}

export function isOverridden(ctx, n, field) {
  const e = networkEntry(ctx, n);
  return !!e && e[field] !== undefined;
}

// How far along a network voice is — derived on read, never stored (it moves
// only when someone edits or accepts, which is what keeps it off the metrics
// side of the Playbook's inclusion test). Always says its level in words.
export function maturity(ctx, n) {
  if (normalizeNetwork(n) === baseNetwork(ctx)) {
    return { level: "base", label: "Base voice", detail: `Learned from your ${networkLabel(n)} posts.` };
  }
  const e = networkEntry(ctx, n) || {};
  const adapted = networkFields().filter((f) => e[f] !== undefined).length;
  const rules = (e.rules || []).length;
  // Written by Archie (at creation, by Learn from, by Optimize) and not
  // touched since: nothing has been learned from use yet, so it can't claim a
  // level that only use earns. `drafted` drops at the first edit or Remember.
  if (e.drafted && !rules) {
    return {
      level: "drafted",
      label: "Optimized by Archie",
      detail: `${adapted} of ${networkFields().length} parts adapted to how posts work on ${networkLabel(n)}. It moves on as you edit it and I learn.`,
    };
  }
  const score = adapted + rules;
  const level = score === 0 ? "new" : score <= 2 ? "learning" : score <= 4 ? "shaping" : "tuned";
  const label = { new: "Not optimized", learning: "Learning", shaping: "Taking shape", tuned: "Tuned" }[level];
  const parts = [];
  if (rules) parts.push(`${rules} ${rules === 1 ? "rule" : "rules"} learned`);
  if (adapted) parts.push(`${adapted} of ${networkFields().length} parts adapted`);
  return {
    level,
    label,
    detail: parts.length
      ? `${parts.join(" · ")}.`
      : `Writes like your ${networkLabel(baseNetwork(ctx))} voice for now.`,
  };
}

// The voiceByNetwork a suggestion produces once accepted. A rule appends to the
// network's rules; a list-field suggestion (a closing, a hook) adds a line to
// that network's own list, seeded from the base so accepting never drops what
// the network already inherited.
export function withSuggestion(ctx, s) {
  const net = normalizeNetwork(s.network);
  const all = structuredClone(ctx.voiceByNetwork || {});
  const e = all[net] || { rules: [] };
  if (!Array.isArray(e.rules)) e.rules = [];
  delete e.drafted; // a Remember is use
  if (s.field && LIST_FIELDS.has(s.field)) {
    const list = e[s.field] !== undefined ? e[s.field] : (ctx[s.field] || []).slice();
    if (!list.includes(s.text)) list.unshift(s.text);
    e[s.field] = list;
  } else if (!e.rules.includes(s.text)) {
    e.rules.push(s.text);
  }
  all[net] = e;
  return all;
}

// The reverse of withSuggestion — what an Undo writes back.
export function withoutSuggestion(ctx, s) {
  const net = normalizeNetwork(s.network);
  const all = structuredClone(ctx.voiceByNetwork || {});
  const e = all[net];
  if (!e) return all;
  const key = s.field && LIST_FIELDS.has(s.field) ? s.field : "rules";
  if (Array.isArray(e[key])) e[key] = e[key].filter((t) => t !== s.text);
  return all;
}

// What Archie wants to remember, as one card (styles/components/voice-coach.css):
// the butter block holds the rule and why; the white row under it holds the
// question and, once answered, its answer — same place, same height.
// `attr` names the host's delegation attributes (data-<attr>-accept / -dismiss / -undo).
// The chat host adds what only it knows: `evidence` (trusted html — the drafts
// the rule came from, as chat refs) and `rewrite` (how many of this chat's drafts
// a kept rule can still rewrite).
export function memoryCardHtml(s, { attr, value, undo = true, evidence = "", rewrite = 0 }) {
  const esc = escapeHtml;
  const net = `<i class="${esc(networkIcon(s.network))}" aria-hidden="true"></i> ${esc(networkLabel(s.network))}`;
  const kept = s.status === "accepted";
  const answer = kept
    ? `<div class="memory-card__answer" role="status">
        <span class="memory-card__ask"><i class="${isFlagOn("newConversationStyles") ? "ap-icon-rounded-check_fill" : "ap-icon-check"} memory-card__done" aria-hidden="true"></i>Remembered for your ${net} voice</span>
        <div class="memory-card__actions">${undo ? `<a class="ap-link standalone small" href="#" role="button" data-${attr}-undo="${esc(value)}">Undo</a>` : ""}</div>
      </div>${
        rewrite
          ? `<div class="memory-card__answer">
        <span class="memory-card__ask">${rewrite} ${esc(networkLabel(s.network))} ${rewrite === 1 ? "draft here doesn't" : "drafts here don't"} follow it yet.</span>
        <div class="memory-card__actions">
          <button type="button" class="ap-button stroked blue" data-${attr}-rewrite="${esc(value)}">Rewrite ${rewrite === 1 ? "it" : "them"}</button>
        </div>
      </div>`
          : ""
      }`
    : `<div class="memory-card__answer">
        <span class="memory-card__ask">Remember this for your ${net} voice?</span>
        <div class="memory-card__actions">
          <button type="button" class="ap-button ghost grey" data-${attr}-dismiss="${esc(value)}">Not now</button>
          <button type="button" class="ap-button primary blue" data-${attr}-accept="${esc(value)}">Remember</button>
        </div>
      </div>`;
  return `<div class="memory-card" role="group" aria-label="Remember this for your ${esc(networkLabel(s.network))} voice?">
    <div class="memory-card__body">
      <i class="ap-icon-sparkles memory-mark" aria-hidden="true"></i>
      <p class="memory-card__rule">${esc(s.text)}</p>
      ${s.why ? `<p class="memory-card__why">${esc(s.why)}</p>` : ""}
      ${evidence ? `<p class="memory-card__why memory-card__evidence">${evidence}</p>` : ""}
    </div>
    ${answer}
  </div>`;
}

// Which parts a network has made its own, in voiceParts() order.
export function partsDone(ctx, n) {
  return networkFields().map((f) => isOverridden(ctx, n, f));
}

// Which parts need the user because the product just added them: a new part
// the network hasn't optimized — on the base, a new part it hasn't filled in.
export function partsNew(ctx, n) {
  const onBase = normalizeNetwork(n) === baseNetwork(ctx);
  return networkFields().map(
    (f) => isNewPart(f) && (onBase ? !String(ctx?.[f] || "").trim() : !isOverridden(ctx, n, f)),
  );
}

// The progress ring: one arc per part of the voice around the network's logo —
// green once optimized, grey-20 while it follows the base, ORANGE for a part
// the product just added and nobody has done yet. The base's ring is grey-100
// (the reference, not a score). When every part is done the arcs close into ONE
// green circle and a check badge says "all done". `current` thickens an arc
// (the wizard's step); `fresh` arcs fill once, to show what an action changed.
// Decorative: the state is always said in text beside it (voice-coach.css).
export function progressRingHtml(
  n,
  { done = [], base = false, current = -1, fresh = [], attention = [], size = 56 } = {},
) {
  const count = networkFields().length;
  const complete = !base && count > 0 && done.length === count && done.every(Boolean);
  const span = 100 / count;
  const gap = 7;
  const arcs = complete
    ? `<circle class="nv-ring__arc is-done is-complete${fresh.length ? " is-fresh" : ""}" cx="18" cy="18" r="15" pathLength="100" />`
    : networkFields()
        .map((_, i) => {
          const cls = [
            "nv-ring__arc",
            base && !attention[i] ? "is-base" : done[i] ? "is-done" : attention[i] ? "is-attention" : "",
            i === current ? "is-current" : "",
            fresh.includes(i) ? "is-fresh" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<circle class="${cls}" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${span - gap} ${100 - span + gap}" stroke-dashoffset="${-(span * i + gap / 2)}" />`;
        })
        .join("");
  const badge = complete ? `<span class="nv-ring__check"><i class="ap-icon-rounded-check_fill"></i></span>` : "";
  return `<span class="nv-ring${complete ? " is-complete" : ""}" style="--nv-ring:${size}px" aria-hidden="true"><svg viewBox="0 0 36 36" focusable="false">${arcs}</svg><i class="${networkIcon(n)}"></i>${badge}</span>`;
}

export function cloneVoiceByNetwork(v) {
  if (!v || typeof v !== "object") return {};
  const out = {};
  for (const [net, e] of Object.entries(v)) {
    if (!known(net) || !e || typeof e !== "object") continue;
    const entry = { rules: Array.isArray(e.rules) ? e.rules.filter(Boolean) : [] };
    if (e.drafted) entry.drafted = true;
    for (const f of ALL_NETWORK_FIELDS) {
      if (e[f] === undefined) continue;
      entry[f] = LIST_FIELDS.has(f) ? (Array.isArray(e[f]) ? e[f].slice() : []) : String(e[f] ?? "");
    }
    out[known(net)] = entry;
  }
  return out;
}

// ── Writing in a network voice ───────────────────────────────────────────────
// What a draft for `network` is written with: the network's own parts where it
// adapted them, the base's elsewhere (in the draft's language when the
// Playbook has one for it), and the rules the network learned.
export function resolvedVoice(ctx, network, language = null) {
  const net = known(network) || baseNetwork(ctx);
  const lang = (language && ctx?.voiceByLanguage?.[language]) || null;
  const base = (field) => (lang?.[field]?.length ? lang[field] : ctx?.[field] || []);
  const e = networkEntry(ctx, net) || {};
  return {
    network: net,
    signatureHooks: e.signatureHooks ?? base("signatureHooks"),
    closingPatterns: e.closingPatterns ?? base("closingPatterns"),
    rules: e.rules || [],
  };
}

const EMOJI_ALL = /\p{Extended_Pictographic}️?/gu;
const wordsOf = (s) =>
  String(s || "")
    .split(/\s+/)
    .filter(Boolean);
// Sentences, the last one kept even without its full stop.
const sentencesOf = (s) => (String(s || "").match(/[^.!?]+(?:[.!?]+|$)/g) || []).map((x) => x.trim()).filter(Boolean);

// The rules a mock can actually carry out on a draft — the ones Archie's own
// coaching writes (voice-coach.js). Any other rule is followed by the writer
// in the real thing; here it changes nothing.
// ponytail: regex-matched rule shapes; the real generator gets the rules as
// instructions and needs none of this.
const RULE_ACTIONS = [
  [
    /no emoji/i,
    (d) => ({
      ...d,
      text: d.text.map((l) =>
        l
          .replace(EMOJI_ALL, "")
          .replace(/\s{2,}/g, " ")
          .trim(),
      ),
    }),
  ],
  [/no hashtags/i, (d) => ({ ...d, hashtags: [], text: d.text.map((l) => l.replace(/\s*#\w+/g, "").trim()) })],
  [/(\d+) hashtags? at most/i, (d, m) => ({ ...d, hashtags: d.hashtags.slice(0, Number(m[1])) })],
  [
    /opening line under (\d+) words/i,
    (d, m) => {
      const [first = "", ...rest] = d.text;
      const max = Number(m[1]) - 1;
      if (wordsOf(first).length <= max) return d;
      // Cut where a person would: the strongest break that fits — a sentence
      // end, then a colon or dash, then a comma (a comma is often inside a
      // list) — else the word limit.
      const words = wordsOf(first);
      const lastBreak = (re) => {
        for (let i = max; i > 2; i -= 1) if (re.test(words[i - 1])) return i;
        return 0;
      };
      const cut = lastBreak(/[.!?]$/) || lastBreak(/^[—–-]$|[:;]$/) || lastBreak(/,$/) || max;
      const head = words
        .slice(0, cut)
        .join(" ")
        .replace(/[,:;—–-]+$/, "")
        .trim();
      const tail = words
        .slice(cut)
        .join(" ")
        .replace(/^[—–-]\s*/, "");
      const lead = `${head}${/[.!?]$/.test(head) ? "" : "."}`;
      return { ...d, text: [lead, `${tail.charAt(0).toUpperCase()}${tail.slice(1)}`, ...rest] };
    },
  ],
  [
    /about (\d+) words/i,
    (d, m) => {
      const max = Number(m[1]);
      const text = d.text.slice();
      const total = () => text.reduce((n, l) => n + wordsOf(l).length, 0);
      // Drop the last sentence of the longest middle paragraph until it fits.
      while (total() > max) {
        const mid = text.map((l, i) => [i, l]).filter(([i]) => i > 0 && i < text.length - 1);
        const [i, line] = mid.sort((a, b) => wordsOf(b[1]).length - wordsOf(a[1]).length)[0] || [];
        const sentences = sentencesOf(line);
        if (sentences.length < 2) break;
        text[i] = sentences.slice(0, -1).join(" ");
      }
      return { ...d, text };
    },
  ],
  [
    /short paragraphs/i,
    (d) => ({
      ...d,
      text: d.text.flatMap(sentencesOf),
    }),
  ],
];

// One draft, made to follow `rules`. Returns a new { text, hashtags }.
export function followRules(draft, rules = []) {
  let d = { text: (draft.text || []).slice(), hashtags: (draft.hashtags || []).slice() };
  for (const rule of rules) {
    for (const [re, act] of RULE_ACTIONS) {
      const m = String(rule).match(re);
      if (m) d = act(d, m);
    }
  }
  return d;
}

// A fresh draft, written in the network voice: opens on one of its hooks,
// closes on one of its closings, follows its rules. `seed` picks which hook
// and closing — the favourite (first) one every other draft — so a batch
// doesn't open five drafts the same way. Hooks with a
// [placeholder] are templates for a person, not lines to publish.
export function writeInVoice(ctx, network, draft, seed = 0) {
  const v = resolvedVoice(ctx, network, draft.language);
  const usable = (list) => list.filter((l) => l && !/\[[^\]]*\]/.test(l));
  const hooks = usable(v.signatureHooks);
  const closings = usable(v.closingPatterns);
  // The lines are in preference order (the wizard's drag): the first one leads
  // every other draft, the rest take turns.
  const favour = (list) => (seed % 2 === 0 ? list[0] : list[seed % list.length]);
  const text = [
    ...(hooks.length ? [favour(hooks)] : []),
    ...(draft.text || []),
    ...(closings.length ? [favour(closings)] : []),
  ];
  return {
    ...followRules({ text, hashtags: draft.hashtags }, v.rules),
    voice: { network: v.network, rules: v.rules.slice() },
  };
}
