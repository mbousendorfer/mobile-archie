// Image Generator — the module's app state. Its own objects (creations and
// assets) come from storageService, scoped by `brandId` — a Playbook id. The
// brands, and the brand's own styles, are the Playbooks', read through the
// adapter and re-exported here so views have one import.

import { storageService as storage } from "../services/index.js?v=1831";
import { STYLE_PRESETS } from "../config/style-presets.js?v=1831";
import { findPlaybookStyle, getPlaybookStyles, subscribeBrands } from "./playbook-brand.js?v=1831";

export { getActiveBrandId, getBrand, canEditBrand } from "./playbook-brand.js?v=1831";

/** One subscription for everything a view shows: module storage + Playbooks. */
export function subscribe(fn) {
  const a = storage.subscribe(fn);
  const b = subscribeBrands(fn);
  return () => {
    a();
    b();
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────

/** The style picker's list for a brand: its own custom styles FIRST, then the presets. */
export function getStylesForBrand(brandId) {
  return [...getPlaybookStyles(brandId), ...STYLE_PRESETS];
}

export function getStyle(id) {
  return STYLE_PRESETS.find((p) => p.id === id) || findPlaybookStyle(id) || oneOffs.get(id);
}

// ── One-off styles ────────────────────────────────────────────────────────────
// "From an image" in a draft's studio: a style read from images the user just
// uploaded, for THAT image only. Held in memory, never on the Playbook — it is
// not the brand's until someone saves it there — and never listed by
// getStylesForBrand. getStyle resolves it so the studio can draw with it.
const oneOffs = new Map();

export function registerOneOffStyle(style) {
  oneOffs.set(style.id, style);
}

export function forgetOneOffStyle(id) {
  oneOffs.delete(id);
}

// ── Everything else, scoped to a brand ───────────────────────────────────────

export function getProducts(brandId) {
  return storage.list("products", (p) => p.brandId === brandId);
}

export function getCreation(id) {
  return storage.get("creations", id);
}

export function getAsset(id) {
  return storage.get("assets", id);
}
