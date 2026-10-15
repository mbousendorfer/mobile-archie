// Image Generator — the module's own data model: styles, products,
// creations, layers, assets. Shapes are in docs/audits/image-studio-integration.md §4.
//
// There is no Brand here: the brand IS the Playbook, read through
// state/playbook-brand.js. Everything below is scoped to one by `brandId`,
// which is a Playbook (Context) id.

import { uid, nowIso } from "../lib/id.js?v=1854";

// 2: brands moved to the Playbook (v1 had its own brands collection).
export const SCHEMA_VERSION = 2;

// ── Factories ────────────────────────────────────────────────────────────────

export function createStyle(partial = {}) {
  const at = nowIso();
  return {
    id: uid("st"),
    brandId: null,
    kind: "custom",
    family: "custom",
    label: "Untitled style",
    description: "",
    promptTemplate: "",
    supportsEmbeddedText: false,
    render: { generator: "blend", variant: "custom" },
    custom: { sources: [], fidelity: "essential", stylePrompt: "" },
    createdAt: at,
    updatedAt: at,
    ...partial,
  };
}

export function createLayer(type, partial = {}) {
  return {
    id: uid("ly"),
    type,
    x: 0.1,
    y: 0.1,
    w: 0.8,
    h: 0.2,
    rotation: 0,
    z: 0,
    hidden: false,
    locked: false,
    props: {},
    ...partial,
  };
}

export function createVariation(seed, partial = {}) {
  return { id: uid("va"), seed, ...partial };
}

export function createCreation(partial = {}) {
  const at = nowIso();
  return {
    id: uid("cr"),
    brandId: null,
    title: "",
    brief: { prompt: "", headline: "", styleId: null, productId: null, formatIds: [], textMode: "layer" },
    // The style as it was when the images were made — a style edited or deleted
    // later must not change images that already exist.
    styleSnapshot: null,
    // Variations come in batches (a generation, "Similar to…"): { id, seed, bgSeed, subjectSeed, batchId, prompt }
    variations: [],
    batches: [],
    favoriteVariationIds: [],
    selectedVariationId: null,
    master: { formatId: null, layers: [] },
    adaptations: [],
    copy: { hooks: [], ctas: [], captions: {} },
    favorite: false,
    history: [],
    checks: null,
    createdAt: at,
    updatedAt: at,
    ...partial,
  };
}

export function createAsset(partial = {}) {
  return {
    id: uid("as"),
    brandId: null,
    kind: "image",
    name: "",
    mime: "image/png",
    width: 0,
    height: 0,
    // Exactly one of these carries the pixels: an IndexedDB blob, or inline SVG
    // markup (seeded logos and product shots are drawn, not uploaded).
    blobKey: null,
    svg: null,
    source: "upload",
    favorite: false,
    createdAt: nowIso(),
    ...partial,
  };
}

export function historyEntry(action, detail = "") {
  return { at: nowIso(), action, detail };
}

// ── Palette helpers ──────────────────────────────────────────────────────────

export function colorByRole(brand, role) {
  return brand?.palette?.find((c) => c.role === role)?.hex || null;
}

export function fontByRole(brand, role) {
  return brand?.fonts?.find((f) => f.role === role)?.family || null;
}
