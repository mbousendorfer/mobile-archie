// network-voice — a Playbook's voice, per network (flag `networkVoices`).
//
// The model, stored on the Playbook (it's identity: how this brand sounds on
// LinkedIn is true before the first post and after the hundredth):
//   voiceBaseNetwork  "linkedin" — where the base voice was learned from (the
//                     first network connected or picked at creation;
//                     the others get an adaptation drafted then, see
//                     analyzeNetworkVoices).
//   voiceByNetwork    { [network]: { signatureHooks?, closingPatterns?,
//                     formattingStyle?, visualStyle?, rules: string[] } }
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

import { isFlagOn } from "./feature-flags.js?v=1749";
import { escapeHtml } from "./utils.js?v=1749";
import { NETWORKS, normalizeNetwork, getConnectedProfileById } from "./social-profiles.js?v=1749";

export const NETWORK_FIELDS = ["signatureHooks", "closingPatterns", "formattingStyle", "visualStyle"];
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

// The networks this Playbook has a voice for: the base first, then the ones it
// publishes on, then any adaptation added by hand.
export function voiceNetworks(ctx) {
  const list = [baseNetwork(ctx), ...(ctx?.connectedSocials || []), ...Object.keys(ctx?.voiceByNetwork || {})].map(
    known,
  );
  return [...new Set(list.filter(Boolean))];
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
  const adapted = NETWORK_FIELDS.filter((f) => e[f] !== undefined).length;
  const rules = (e.rules || []).length;
  const score = adapted + rules;
  const level = score === 0 ? "new" : score <= 2 ? "learning" : score <= 4 ? "shaping" : "tuned";
  const label = { new: "Same as base", learning: "Learning", shaping: "Taking shape", tuned: "Tuned" }[level];
  const parts = [];
  if (rules) parts.push(`${rules} ${rules === 1 ? "rule" : "rules"} learned`);
  if (adapted) parts.push(`${adapted} of ${NETWORK_FIELDS.length} parts adapted`);
  return {
    level,
    label,
    detail: parts.length
      ? `${parts.join(" · ")}.`
      : `Writes like your ${networkLabel(baseNetwork(ctx))} voice until it learns otherwise.`,
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
export function memoryCardHtml(s, { attr, value, undo = true }) {
  const esc = escapeHtml;
  const net = `<i class="${esc(networkIcon(s.network))}" aria-hidden="true"></i> ${esc(networkLabel(s.network))}`;
  const kept = s.status === "accepted";
  const answer = kept
    ? `<div class="memory-card__answer" role="status">
        <span class="memory-card__ask"><i class="${isFlagOn("newConversationStyles") ? "ap-icon-rounded-check_fill" : "ap-icon-check"} memory-card__done" aria-hidden="true"></i>Remembered for your ${net} voice</span>
        <div class="memory-card__actions">${undo ? `<a class="ap-link standalone small" href="#" role="button" data-${attr}-undo="${esc(value)}">Undo</a>` : ""}</div>
      </div>`
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
    </div>
    ${answer}
  </div>`;
}

export function cloneVoiceByNetwork(v) {
  if (!v || typeof v !== "object") return {};
  const out = {};
  for (const [net, e] of Object.entries(v)) {
    if (!known(net) || !e || typeof e !== "object") continue;
    const entry = { rules: Array.isArray(e.rules) ? e.rules.filter(Boolean) : [] };
    for (const f of NETWORK_FIELDS) {
      if (e[f] === undefined) continue;
      entry[f] = LIST_FIELDS.has(f) ? (Array.isArray(e[f]) ? e[f].slice() : []) : String(e[f] ?? "");
    }
    out[known(net)] = entry;
  }
  return out;
}
