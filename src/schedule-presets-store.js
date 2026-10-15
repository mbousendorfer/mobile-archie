// Posting-rhythm presets — at most one per Playbook: the rhythm, time of day
// and skipped weekdays the schedule modal opens on for that brand's drafts.
//
// GLOBAL, like topic-feeds-store, and keyed by Playbook for the same reason.
//
// ── Why this is a store and not a field on the Playbook ────────────────────
// "We post twice a week, in the mornings, never on Mondays" is per brand, but
// it answers "what job should Archie run?", not "who are you?" — the third
// question of the inclusion test in CONCEPTS.md §1. It is operational config,
// so the data stays per Playbook and only its owner changes: this store,
// written from the one surface that reads it (the schedule modal's Adjust
// panel). ⚠️ It must never become a section of the fiche.
//
// The start date is NOT part of a preset: it is a date, meaningless the next
// time the modal opens. The modal always starts from tomorrow.
//
// No seed and no persistence — like every app store, it lives for the page.
//
// Public API:
//   getPreset(playbookId)            → Preset | null
//   savePreset(playbookId, preset)   → Preset
//   subscribe(fn)                    → unsubscribe
//
// Preset shape: { cadence, timeOfDay, skip: number[] } — the ids the modal's
// CADENCES / TIMES_OF_DAY declare, `skip` as sunday-first weekday numbers.

import { createNotifier } from "./store-utils.js?v=1790";

const presets = new Map(); // playbookId → Preset

const notifier = createNotifier("schedule-presets-store");
export const subscribe = notifier.subscribe;

function normalize(raw = {}) {
  return {
    cadence: raw.cadence || "weekdays",
    timeOfDay: raw.timeOfDay || null,
    skip: Array.isArray(raw.skip) ? [...new Set(raw.skip)].sort() : [],
  };
}

export function getPreset(playbookId) {
  const p = playbookId ? presets.get(playbookId) : null;
  return p ? { ...p, skip: [...p.skip] } : null;
}

export function savePreset(playbookId, preset) {
  if (!playbookId) return null;
  const next = normalize(preset);
  presets.set(playbookId, next);
  notifier.notify({ playbookId, preset: next });
  return getPreset(playbookId);
}
