// Image Generator — every write a creation undergoes. A generation run is saved
// as a creation straight away (that IS the history); opening a variation in the
// editor gives it its layers.

import { storageService as storage } from "../services/index.js?v=1856";
import { createCreation, historyEntry } from "../model/schema.js?v=1856";
import { uid } from "../lib/id.js?v=1856";

function get(id) {
  return storage.get("creations", id);
}

function save(creation) {
  return storage.put("creations", creation);
}

function shortTitle(prompt) {
  const t = String(prompt || "")
    .replace(/#\w+/g, "")
    .trim();
  if (!t) return "Untitled image";
  return t.length > 48 ? t.slice(0, 45).trimEnd() + "…" : t.charAt(0).toUpperCase() + t.slice(1);
}

/** A new creation for a brief — saved straight away: the history IS the list of creations. */
export function startCreation({ brand, brief, style }) {
  return save(
    createCreation({
      brandId: brand.id,
      title: shortTitle(brief.prompt),
      brief: { ...brief },
      styleSnapshot: style ? structuredClone(style) : null,
      history: [historyEntry("created", style ? `Style: ${style.label}` : "")],
    }),
  );
}

/** Adds a batch of variations (a generation, or "Similar to #n"). Newest batch first. */
export function addBatch(creationId, variations, { label, parentVariationId = null } = {}) {
  const c = get(creationId);
  const batchId = uid("bt");
  const batch = { id: batchId, label, parentVariationId, at: new Date().toISOString() };
  return save({
    ...c,
    batches: [batch, ...(c.batches || [])],
    variations: [...variations.map((v) => ({ ...v, batchId })), ...c.variations],
    history: [
      ...c.history,
      historyEntry(parentVariationId ? "similar" : "generated", `${variations.length} variations`),
    ],
  });
}

/** One more image in the latest run — the filmstrip's "+" tile. */
export function appendVariations(creationId, variations) {
  const c = get(creationId);
  const batchId = c.batches?.[0]?.id ?? null;
  return save({
    ...c,
    variations: [...c.variations, ...variations.map((v) => ({ ...v, batchId }))],
    history: [...c.history, historyEntry("generated", `${variations.length} more`)],
  });
}

export function replaceVariation(creationId, variationId, next) {
  const c = get(creationId);
  return save({
    ...c,
    variations: c.variations.map((v) => (v.id === variationId ? { ...next, id: v.id, batchId: v.batchId } : v)),
    history: [...c.history, historyEntry("regenerated", "One variation")],
  });
}

export function deleteCreation(id) {
  storage.remove("creations", id);
}
