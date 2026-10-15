// Image Generator — the Edit mode's catalogues. The Image Studio's own
// (src/image-studio.js), copied rather than imported: the module imports
// nothing of Archie's. Same fonts, same swatches, same stamps, so the two Edit
// modes offer the same things.

import { FONT_CHOICES } from "./fonts.js?v=1793";

// `family: null` is the app default (Averta); the rest are bundled locally
// (styles/fonts.css), so the canvas bake can draw them offline.
export const EDIT_FONTS = Object.freeze([
  { family: null, label: "Default" },
  { family: "Montserrat", label: "Montserrat" },
  { family: "Playfair Display", label: "Playfair Display" },
  { family: "Oswald", label: "Oswald" },
  { family: "Caveat", label: "Caveat" },
]);

export const TEXT_COLORS = Object.freeze(["#FFFFFF", "#0A1B33", "#FF3C00", "#178DFE"]);

export const IMAGE_PRESETS = Object.freeze([
  { label: "Northwind", url: "assets/avatars/northwind-studio.svg" },
  { label: "Archie", url: "assets/logos/archie-mono.svg" },
  { label: "Archie wordmark", url: "assets/logos/archie-wordmark.svg" },
  { label: "LinkedIn", url: "assets/logos/social/linkedin.svg" },
  { label: "X", url: "assets/logos/social/x.svg" },
  { label: "Instagram", url: "assets/logos/social/instagram.svg" },
  { label: "Facebook", url: "assets/logos/social/facebook.svg" },
  { label: "YouTube", url: "assets/logos/social/youtube.svg" },
  { label: "TikTok", url: "assets/logos/social/tiktok.svg" },
  { label: "Threads", url: "assets/logos/social/threads.svg" },
  { label: "Pinterest", url: "assets/logos/social/pinterest.svg" },
  { label: "Bluesky", url: "assets/logos/social/bluesky.svg" },
  { label: "Notion", url: "assets/logos/notion.svg" },
  { label: "Slack", url: "assets/logos/slack.svg" },
  { label: "Figma", url: "assets/logos/figma.svg" },
  { label: "GitHub", url: "assets/logos/github.svg" },
]);

// "Describe a change" → Redraw: how long the mock takes (the Image Studio's EDIT_MS).
export const REDRAW_MS = 2600;

// Text outline — an EXTERNAL stroke that never eats into the glyph: painted
// under the fill at twice the visible width. 0–100 → em (the Image Studio's
// outlineMetrics, value for value, so screen and bake agree).
export function outlineMetrics(width) {
  const t = Math.max(0, Math.min(100, width ?? 50)) / 100;
  const emVisible = 0.02 + t * 0.13;
  return { emVisible, emStroke: emVisible * 2 };
}

// Shadow intensity 0–100 → { blurEm, offYEm, alpha } (the Image Studio's shadowMetrics).
export function shadowMetrics(i) {
  const t = Math.max(0, Math.min(100, i ?? 0)) / 55;
  return { blurEm: 0.06 + t * 0.12, offYEm: 0.02 + t * 0.02, alpha: 0.2 + t * 0.35 };
}

/** CSS / canvas family stack for a text layer's family (null → Averta). */
export function textFamily(family) {
  if (!family) return "Averta, sans-serif";
  const system = FONT_CHOICES.find((f) => f.family === family);
  if (system) return system.stack;
  return `${/\s/.test(family) ? `"${family}"` : family}, Averta, sans-serif`;
}
