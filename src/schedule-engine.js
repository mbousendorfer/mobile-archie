// The schedule spread — which date each draft of a batch gets. Moved out of the
// schedule modal, unchanged, so the chat ("schedule all the drafts") proposes
// the SAME dates the modal would open on: one engine, two hosts.
//
//   planSlots(posts, strategy, prevSlots?) → [{ post, when, pinned }]
//   defaultStrategy(playbookId)           → the Playbook's saved rhythm, from tomorrow

import { getQueue, dayKey } from "./schedule-store.js?v=1756";
import { normalizeNetwork } from "./social-profiles.js?v=1756";
import { getPreset } from "./schedule-presets-store.js?v=1756";

// Per-network suggested publishing windows. Each entry lists
// { dow: [0..6 sunday-first], hours: [24h]} — mirrors the kind of static
// benchmarks a publishing tool ships with out of the box.
export const PER_NETWORK_OPTIMAL = {
  linkedin: { dow: [2, 3, 4], hours: [9, 12] },
  twitter: { dow: [1, 2, 3, 4, 5], hours: [10, 14, 17] },
  x: { dow: [1, 2, 3, 4, 5], hours: [10, 14, 17] },
  instagram: { dow: [2, 4, 0], hours: [11, 19] },
  facebook: { dow: [1, 3, 5], hours: [13, 16] },
  tiktok: { dow: [2, 3, 4], hours: [18, 20, 22] },
};

export const FALLBACK_OPTIMAL = { dow: [1, 2, 3, 4, 5], hours: [9, 13, 17] };

// Posting rhythms. Each decides WHICH days a draft can land on; the
// per-network map then decides the HOUR. `days` is a sunday-first dow set;
// `every` spaces slots N days apart from the start; `weekly` repeats the
// start day's weekday.
export const CADENCES = [
  { id: "weekdays", label: "Every weekday", days: [1, 2, 3, 4, 5] },
  { id: "thrice", label: "3 times a week", days: [1, 3, 5] },
  { id: "twice", label: "Twice a week", days: [2, 4] },
  { id: "alternate", label: "Every other day", every: 2 },
  { id: "once", label: "Once a week", weekly: true },
];

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function defaultStartFrom() {
  // Tomorrow — never schedule a batch in the past.
  const d = startOfDay(Date.now());
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

// The Playbook's saved rhythm when it has one — but never its start date:
// a batch always starts tomorrow.
export function defaultStrategy(playbookId) {
  const preset = playbookId ? getPreset(playbookId) : null;
  return { ...(preset || { cadence: "weekdays", timeOfDay: null, skip: [] }), startFrom: defaultStartFrom() };
}

export function pickHour(hours, timeOfDay) {
  if (!hours || hours.length === 0) return 9;
  const sorted = [...hours].sort((a, b) => a - b);
  if (timeOfDay === "morning") return sorted[0];
  if (timeOfDay === "evening") return sorted[sorted.length - 1];
  if (timeOfDay === "afternoon") return sorted[Math.floor(sorted.length / 2)];
  return sorted[0];
}

export function networkOf(post) {
  return (post.network || "linkedin").toLowerCase();
}

// The days already carrying a post on one of THIS batch's networks. That is
// what the spread avoids: a Facebook post doesn't crowd a LinkedIn one, so a
// day busy on another network stays eligible — and its row says what's there.
function busyDaysFor(posts) {
  const networks = new Set(posts.map((p) => normalizeNetwork(networkOf(p))));
  const keys = new Set();
  for (const e of getQueue()) if (networks.has(normalizeNetwork(e.network))) keys.add(dayKey(e.when));
  return keys;
}

// Walking from `startFrom`, collect the next `count` days that match the
// rhythm, skipping the weekdays the user ticked, any day already carrying a
// post on one of the batch's networks, and any day a pinned draft already
// holds — so the new dates slot in around what's on the calendar. Bounded
// look-ahead so a pathological pattern can't loop forever.
function strategyDays(posts, count, strategy, takenKeys) {
  const start = startOfDay(strategy.startFrom || defaultStartFrom());
  // One draft has no rhythm: any day qualifies, the network's best day wins below.
  const cadence = posts.length === 1 ? null : CADENCES.find((c) => c.id === strategy.cadence) || CADENCES[0];
  const skip = new Set(strategy.skip);
  const busy = busyDaysFor(posts);
  const startDow = start.getDay();
  const days = [];
  const cursor = new Date(start);
  for (let guard = 0; days.length < count && guard < 400; guard++) {
    const dow = cursor.getDay();
    let qualifies = true;
    if (cadence?.every) {
      qualifies = Math.round((cursor - start) / 86400000) % cadence.every === 0;
    } else if (cadence?.weekly) {
      qualifies = dow === startDow;
    } else if (cadence) {
      qualifies = cadence.days.includes(dow);
    }
    const key = dayKey(cursor.getTime());
    const taken = busy.has(key) || takenKeys.has(key);
    if (qualifies && !skip.has(dow) && !taken) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// A single draft goes to the first free day that is one of its network's
// best days — "Best time for this post", not "the first free day".
function singleDay(posts, post, strategy) {
  const map = PER_NETWORK_OPTIMAL[networkOf(post)] || FALLBACK_OPTIMAL;
  const candidates = strategyDays(posts, 14, strategy, new Set());
  return candidates.find((d) => map.dow.includes(d.getDay())) || candidates[0];
}

// Spread every draft that the user hasn't set by hand. Pinned slots (from
// `prevSlots`) keep their date and their day counts as taken.
export function planSlots(posts, strategy, prevSlots = []) {
  const byPost = new Map(prevSlots.map((slot) => [slot.post.id, slot]));
  const pinned = posts.filter((p) => byPost.get(p.id)?.pinned);
  const free = posts.filter((p) => !byPost.get(p.id)?.pinned);
  const takenKeys = new Set(pinned.map((p) => dayKey(byPost.get(p.id).when)));
  const days =
    posts.length === 1
      ? [singleDay(posts, free[0] || posts[0], strategy)]
      : strategyDays(posts, free.length, strategy, takenKeys);
  const fallback = startOfDay(strategy.startFrom || defaultStartFrom());

  let i = 0;
  return posts.map((post) => {
    const existing = byPost.get(post.id);
    if (existing?.pinned) return existing;
    const map = PER_NETWORK_OPTIMAL[networkOf(post)] || FALLBACK_OPTIMAL;
    const hour = pickHour(map.hours, strategy.timeOfDay);
    // If the rhythm couldn't yield enough distinct days, stack the remainder
    // on the last day an hour apart so nothing silently drops.
    const baseDay = days[i] || days[days.length - 1] || fallback;
    const overflow = i >= days.length ? i - days.length + 1 : 0;
    i++;
    const when = new Date(baseDay);
    when.setHours(hour + overflow, 0, 0, 0);
    return { post, when: when.getTime(), pinned: false };
  });
}

// The queue entries a confirmed plan adds to the calendar (schedule-store).
export function queueEntries(slots) {
  return slots.map((s) => ({
    id: `q-${s.post.id}-${s.when}`,
    network: s.post.network || "linkedin",
    text: firstLine(s.post),
    when: s.when,
  }));
}

export function firstLine(post) {
  // post.text may be an array of paragraphs on real drafts.
  if (Array.isArray(post.text) && post.text.length > 0) return post.text[0];
  const text = (post.preview || post.text || "").toString();
  return text.split("\n")[0] || text;
}
