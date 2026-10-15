// Image Generator — every write a custom style undergoes. A custom style is the
// BRAND's: it lives on the Playbook and is listed first in the studio's picker.

import { storageService as storage } from "../services/index.js?v=1786";
import { createAsset, createStyle } from "../model/schema.js?v=1786";
import { presetById, CUSTOM_STYLE_LIMITS } from "../config/style-presets.js?v=1786";
import { sampleColors } from "../render/sample-colors.js?v=1786";
import { uid } from "../lib/id.js?v=1786";
import { lookFromColors } from "../render/visual.js?v=1786";
import { getAsset } from "./store.js?v=1786";
import { deletePlaybookStyle, findPlaybookStyle, savePlaybookStyle } from "./playbook-brand.js?v=1786";

/** A custom style can write text into the image when the look read from its images can. */
function deriveEmbeddedText(sources) {
  const colors = sources.filter((s) => s.type === "image").flatMap((s) => s.colors || getAsset(s.ref)?.colors || []);
  return !!presetById(lookFromColors(colors))?.supportsEmbeddedText;
}

export function validateStyleDraft(draft) {
  const errors = [];
  if (!draft.label.trim()) errors.push("Give the style a name.");
  const images = draft.sources.filter((s) => s.type === "image").length;
  if (!images) errors.push("Add at least one reference image: the style's look is read from them.");
  if (images > CUSTOM_STYLE_LIMITS.images) errors.push(`Up to ${CUSTOM_STYLE_LIMITS.images} reference images.`);
  return errors;
}

// A custom style is the BRAND's — a field of its Playbook (imageStyles), written
// through the adapter. Reference images stay in the module's asset store (pixels).

export function saveStyle(draft) {
  const base = draft.id ? findPlaybookStyle(draft.id) : null;
  const style = createStyle({
    ...(base || {}),
    id: draft.id || uid("st"),
    brandId: draft.brandId,
    label: draft.label.trim(),
    description: draft.description.trim(),
    supportsEmbeddedText: deriveEmbeddedText(draft.sources),
    custom: {
      sources: draft.sources.filter((s) => s.type === "image").map((s) => ({ ...s })),
      fidelity: draft.fidelity,
      stylePrompt: draft.stylePrompt.trim(),
    },
    createdAt: base?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return savePlaybookStyle(draft.brandId, style);
}

export function duplicateStyle(brandId, id) {
  const src = findPlaybookStyle(id);
  if (!src) return null;
  return savePlaybookStyle(brandId, {
    ...structuredClone(src),
    id: uid("st"),
    label: `${src.label} (copy)`,
    createdAt: new Date().toISOString(),
  });
}

export function deleteStyle(brandId, id) {
  return deletePlaybookStyle(brandId, id);
}

/** Stores a reference image for a Playbook, with its dominant colours sampled. */
export async function uploadReference(brandId, file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  const colors = await sampleColors(file);
  const asset = createAsset({ brandId, kind: "reference", name: file.name, mime: file.type, source: "upload", colors });
  if (file.type === "image/svg+xml") asset.svg = await file.text();
  else {
    asset.blobKey = asset.id;
    await storage.putBlob(asset.blobKey, file);
  }
  return storage.put("assets", asset);
}

// ── One-off styles (a draft's studio, "From an image") ───────────────────────

/** A style read from uploaded images, for one image only (state/store.js). */
export async function oneOffStyleFrom(brandId, files) {
  const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, CUSTOM_STYLE_LIMITS.images);
  if (!images.length) throw new Error("That isn't an image — drop a picture whose look you want.");
  const assets = await Promise.all(images.map((f) => uploadReference(brandId, f)));
  // The colours travel ON the source: the images behind a one-off are deleted
  // when the studio closes, and what was generated with it still has to redraw.
  const sources = assets.map((a) => ({ type: "image", ref: a.id, label: a.name, weight: 0.8, colors: a.colors || [] }));
  const name = images[0].name.replace(/\.[a-z0-9]+$/i, "");
  return createStyle({
    id: uid("st"),
    brandId,
    oneOff: true,
    label: images.length > 1 ? "Your images" : "Your image",
    description: images.length > 1 ? `The look of ${images.length} images you added` : `The look of ${name}`,
    supportsEmbeddedText: deriveEmbeddedText(sources),
    custom: { sources, fidelity: "essential", stylePrompt: "" },
  });
}

/** Deletes the reference images of one-offs nobody saved. */
export async function discardOneOff(style) {
  for (const s of style.custom.sources) {
    const asset = getAsset(s.ref);
    if (!asset) continue;
    if (asset.blobKey) await storage.deleteBlob(asset.blobKey).catch(() => {});
    storage.remove("assets", asset.id);
  }
}
