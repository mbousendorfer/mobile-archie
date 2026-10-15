// Image Generator — the brand IS the Playbook. This adapter is the ONE file of
// the module that reads Archie's Playbooks: it turns a Context into the brand
// view every generator surface uses, resolves which Playbook is active, and
// knows the two doors back into Archie (the Playbook page, Playbook creation).
//
// The generator writes a Playbook only from the fiche's Brand section: the
// style creator (/playbook/:id/styles/*) saving the brand's image styles
// (`imageStyles`), and the Imagery rows beside them — the reference images
// (`referenceImages`).
// Each is a deliberate edit, the only
// way a Playbook may change (CONCEPTS §1); the rest of the kit is edited on the
// Playbook page itself (src/playbook-brand-kit.js). Sub-brands don't exist: a variant
// is a duplicated Playbook (docs/reference/CONCEPTS.md §1).

import {
  getContextById,
  getContexts,
  subscribe as subscribeContexts,
  updateContext,
} from "../../../contexts-store.js?v=1854";
import { createStyle } from "../model/schema.js?v=1854";
import { STYLE_PRESETS } from "../config/style-presets.js?v=1854";
import { canEdit, usableContexts } from "../../../playbook-access.js?v=1854";
import {
  getActivePlaybookId,
  isWorkspaceMode,
  playbookForNewWork,
  subscribe as subscribeActive,
} from "../../../active-playbook.js?v=1854";
import { storageService as storage } from "../services/index.js?v=1854";

// Which copy archetype the mocked copyService uses — guessed from the Playbook's words.
function sectorKeyOf(ctx) {
  const text = [ctx.name, ctx.brandName, ctx.businessSummary, ...(ctx.objective || [])].join(" ").toLowerCase();
  if (/coffee|café|cafe|roast|food|restaurant|bakery/.test(text)) return "coffee";
  if (/financ|bank|pay|invoice|saas|software|b2b|platform|tool|devrel|api|workspace/.test(text)) return "finance";
  return "lifestyle";
}

function imageryDefaultsOf(ctx) {
  const d = ctx.defaultLook || {};
  // The brand's own style, or one of the studio's presets (a Playbook with
  // nothing of its own can still skip the question with a ready-made look).
  const style = d.kind === "style" && [...(ctx.imageStyles || []), ...STYLE_PRESETS].find((st) => st.id === d.id);
  const ref = d.kind === "reference" && (ctx.referenceImages || []).find((r) => r.id === d.id);
  return {
    styleId: style ? style.id : "",
    referenceUrl: ref ? ref.url : "",
    referenceLabel: ref ? ref.label || "" : "",
    formatByNetwork: { ...(ctx.formatByNetwork || {}) },
  };
}

/** A Playbook, as the generator reads it. `null` for an unknown id. */
function toBrand(ctx) {
  if (!ctx) return null;
  const t = ctx.brandTypography || {};
  const vp = ctx.voiceProfile || {};
  return {
    id: ctx.id,
    // The name ON the visuals is the brand's; the Playbook's own name says which framing.
    name: ctx.brandName || ctx.name,
    playbookName: ctx.name,
    websiteUrl: ctx.websiteUrl || "",
    sectorKey: sectorKeyOf(ctx),
    logos: (ctx.brandLogos || []).map((l) => ({ id: l.id, label: l.label, url: l.url, variant: l.variant || "" })),
    defaultLogoUrl: ctx.brandLogo || "",
    palette: (ctx.brandColors || [])
      .filter((c) => c.hex)
      .map((c) => ({ hex: c.hex, name: c.name || "", role: c.role || "" })),
    fonts: [
      t.headingFont ? { family: t.headingFont, role: "heading" } : null,
      t.bodyFont ? { family: t.bodyFont, role: "body" } : null,
    ].filter(Boolean),
    personality: ctx.brandPersonality || "",
    // Where a new image starts (Brand › Imagery): resolved here, so a deleted
    // style or an empty upload simply reads as no default.
    defaults: imageryDefaultsOf(ctx),
    imageStyle: {
      // Not `imageDefaults`: it serves the old Image Studio. The brand's look is
      // its styles (imageStyles) and its reference images, `defaults` above.
    },
    voice: {
      tone: [vp.headline, ...(ctx.tones || [])].filter(Boolean).join(" · "),
      examples: [...(ctx.signatureHooks || []), ...(ctx.closingPatterns || [])].filter(Boolean).slice(0, 5),
      avoid: (ctx.voiceAvoid || []).slice(),
      dos: (ctx.doRules || []).slice(),
      donts: (ctx.dontRules || []).slice(),
    },
    positioning: {
      summary: ctx.businessSummary || "",
      audience: (ctx.audience || []).join(", "),
      objectives: (ctx.objective || []).slice(),
      values: [],
    },
    rules: {
      logoMinPx: 48,
      clearSpace: 0.5,
      noLogoDistortion: true,
      forbiddenPairs: [],
      ...(ctx.brandRules || {}),
    },
  };
}

export function getBrand(id) {
  return toBrand(getContextById(id));
}

/**
 * The Playbook the generator works for. In workspace mode it is THE active
 * Playbook (the rail's switcher is the only control, and it is always visible).
 * Otherwise it is the generator's own pick, remembered in its storage, falling
 * back to the Playbook new work goes to.
 */
export function getActiveBrandId() {
  const usable = new Set(usableContexts().map((c) => c.id));
  if (isWorkspaceMode()) {
    const id = getActivePlaybookId();
    return usable.has(id) ? id : null;
  }
  const picked = storage.getMeta().activePlaybookId;
  if (picked && usable.has(picked)) return picked;
  const fallback = playbookForNewWork()?.id;
  return usable.has(fallback) ? fallback : usableContexts()[0]?.id || null;
}

export function canEditBrand(id) {
  const ctx = getContextById(id);
  return !!ctx && canEdit(ctx);
}

// ── The brand's own image styles — a field of the Playbook (imageStyles) ─────
// The style creator is the only writer, and a deliberate edit, like the rest
// of the fiche. The generator turns each into a full style (createStyle).

/** The Playbook's own styles, as the generator uses them. */
export function getPlaybookStyles(id) {
  const ctx = getContextById(id);
  return (ctx?.imageStyles || []).map((s) => createStyle({ ...s, brandId: id }));
}

/** A custom style by id, whichever Playbook holds it (a creation remembers only the id). */
export function findPlaybookStyle(styleId) {
  for (const ctx of getContexts()) {
    const hit = (ctx.imageStyles || []).find((s) => s.id === styleId);
    if (hit) return createStyle({ ...hit, brandId: ctx.id });
  }
  return null;
}

/** Adds or replaces one style on the Playbook. */
export function savePlaybookStyle(id, style) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx)) return null;
  const { brandId: _b, ...stored } = style;
  const list = ctx.imageStyles || [];
  const next = list.some((s) => s.id === style.id)
    ? list.map((s) => (s.id === style.id ? stored : s))
    : [...list, stored];
  updateContext(id, { imageStyles: next, updatedAt: "just now" });
  return createStyle({ ...stored, brandId: id });
}

export function deletePlaybookStyle(id, styleId) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx)) return false;
  updateContext(id, { imageStyles: (ctx.imageStyles || []).filter((s) => s.id !== styleId), updatedAt: "just now" });
  return true;
}

// ── The brand's reference images and its default look ───────────────────────
// Brand › Imagery shows the reference images beside the styles, the same way
// and as live: added and removed from their own row, outside the section's
// edit mode. One of either is the brand's look (`defaultLook`), and each
// network may have a preferred shape (`formatByNetwork`) — the Playbook's
// Images tab (views/playbook-images.js) sets both.

export function getPlaybookReferences(id) {
  return (getContextById(id)?.referenceImages || []).map((r) => ({ id: r.id, label: r.label || "", url: r.url }));
}

/** Adds images (data URLs) to the Playbook's reference images. */
export function addPlaybookReferences(id, images) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx) || !images.length) return false;
  const added = images.map((img, i) => ({
    id: `ref-${Date.now().toString(36)}-${i}`,
    label: img.label,
    url: img.url,
    networks: [],
  }));
  updateContext(id, { referenceImages: [...(ctx.referenceImages || []), ...added], updatedAt: "just now" });
  return true;
}

export function deletePlaybookReference(id, refId) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx)) return false;
  updateContext(id, {
    referenceImages: (ctx.referenceImages || []).filter((r) => r.id !== refId),
    updatedAt: "just now",
  });
  return true;
}

export function getPlaybookDefaultLook(id) {
  const d = getContextById(id)?.defaultLook || {};
  return { kind: d.kind || "", id: d.id || "" };
}

/** The look Generate image starts from — a style or a reference image, never both. */
export function setPlaybookDefaultLook(id, look) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx)) return false;
  updateContext(id, { defaultLook: { kind: look.kind, id: look.id }, updatedAt: "just now" });
  return true;
}

export function getPlaybookFormats(id) {
  return { ...(getContextById(id)?.formatByNetwork || {}) };
}

/** One network's preferred shape ("" = automatic, the network's first). */
export function setPlaybookFormat(id, network, shapeId) {
  const ctx = getContextById(id);
  if (!ctx || !canEdit(ctx)) return false;
  const next = { ...(ctx.formatByNetwork || {}) };
  if (shapeId) next[network] = shapeId;
  else delete next[network];
  updateContext(id, { formatByNetwork: next, updatedAt: "just now" });
  return true;
}

/** Repaint when a Playbook changes or the active one does. */
export function subscribeBrands(fn) {
  const a = subscribeContexts(fn);
  const b = subscribeActive(fn);
  return () => {
    a();
    b();
  };
}

// "Use the Playbook" off: the same brand id (its styles and history stay
// its own) but none of its identity — no logo, a neutral palette, the default
// fonts, no moods or words to avoid. Colours are CONTENT here, not chrome.
const NEUTRAL_PALETTE = [
  { hex: "#2B2F36", name: "Graphite", role: "primary" },
  { hex: "#C8A27A", name: "Sand", role: "accent" },
  { hex: "#F4F1EC", name: "Paper", role: "background" },
  { hex: "#8A94A6", name: "Slate", role: "secondary" },
  { hex: "#1C1E22", name: "Ink", role: "text" },
];

export function unbranded(brand) {
  if (!brand) return brand;
  return {
    ...brand,
    unbranded: true,
    logos: [],
    defaultLogoUrl: "",
    palette: NEUTRAL_PALETTE.map((c) => ({ ...c })),
    fonts: [],
    personality: "",
    imageStyle: { moods: [], references: [] },
    voice: { ...brand.voice, avoid: [], dos: [], donts: [] },
    rules: { ...brand.rules, forbiddenPairs: [] },
  };
}
