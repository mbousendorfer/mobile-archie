// Image Generator — rendering an asset. Inline SVG assets resolve synchronously;
// IndexedDB blobs resolve after render, so they go out with data-imst-asset and
// hydrateAssets(root) fills their src.

import { html } from "../lib/html.js?v=1877";
import { storageService as storage } from "../services/index.js?v=1877";
import { getAsset } from "../state/store.js?v=1877";

export function assetImg(assetOrId, { alt = "", className = "" } = {}) {
  const asset = typeof assetOrId === "string" ? getAsset(assetOrId) : assetOrId;
  if (!asset)
    return html`<span class="imst-asset-missing ${className}" aria-hidden="true"><i class="ap-icon-image"></i></span>`;
  if (asset.svg) {
    return html`<img class="${className}" src="${storage.svgDataUrl(asset.svg)}" alt="${alt}" draggable="false" />`;
  }
  return html`<img class="${className}" data-imst-asset="${asset.id}" alt="${alt}" draggable="false" />`;
}

const urlCache = new Map();

/** A URL for an asset right now: inline SVG always, a blob only once warmed. */
export function assetUrlSync(id) {
  const asset = getAsset(id);
  if (!asset) return "";
  if (asset.svg) return storage.svgDataUrl(asset.svg);
  if (asset.preview) return asset.preview;
  return urlCache.get(id) || "";
}

export async function hydrateAssets(root) {
  for (const img of root.querySelectorAll("img[data-imst-asset]:not([src])")) {
    const url = await storage.assetUrl(getAsset(img.dataset.imstAsset));
    if (url && img.isConnected) img.src = url;
  }
}

/**
 * The logo URL to use for a brand (a Playbook): the requested version if the
 * Playbook says which one it is, else its default logo, else the first one.
 */
export function logoUrl(brand, variant = "color") {
  const logos = brand?.logos || [];
  return logos.find((l) => l.variant === variant)?.url || brand?.defaultLogoUrl || logos[0]?.url || "";
}
