// Image Generator — builds the text prompt a real image model would receive.
// Pure, and shared by every implementation of imageGenerationService, so the
// day a real API is plugged in it gets exactly the prompt the mock shows.

import { colorByRole, fontByRole } from "../model/schema.js?v=1816";

function paletteText(brand) {
  return (brand?.palette || []).map((c) => `${c.role} ${c.hex}`).join(", ") || "neutral tones";
}

function styleFragment(style, brief, brand) {
  if (!style) return brief.prompt;
  if (style.kind === "custom") {
    const parts = style.custom.sources.map((s) => `${s.label || s.ref} (${Math.round(s.weight * 100)}%)`);
    const fidelity =
      style.custom.fidelity === "composition"
        ? "match colours, textures, strokes, mood, framing, camera angle and layout of the references"
        : "match colours, textures, strokes and mood of the references";
    return [
      brief.prompt,
      `in the style "${style.label}": blend of ${parts.join(", ")}`,
      fidelity,
      style.custom.stylePrompt,
    ]
      .filter(Boolean)
      .join(". ");
  }
  return style.promptTemplate
    .replaceAll("{subject}", brief.prompt || "the brand's world")
    .replaceAll("{palette}", paletteText(brand))
    .replaceAll("{mood}", (brand?.imageStyle?.moods || []).join(", ") || "on-brand");
}

/**
 * @param {{brief, brand, style, product?, format, textMode, text?}} request
 * @returns {string}
 */
export function buildPrompt({ brief, brand, style, product, format, textMode, text }) {
  const lines = [styleFragment(style, brief, brand)];
  if (product) lines.push(`Featuring the product "${product.name}": ${product.description}. Keep it recognisable.`);
  if (format) lines.push(`Aspect ${format.width}x${format.height}.`);
  if (textMode === "embedded" && text?.headline) {
    const font = fontByRole(brand, "heading");
    lines.push(`Render the text "${text.headline}" in the image${font ? `, typeface similar to ${font}` : ""}.`);
  } else {
    lines.push("No text in the image; leave clear space for a headline.");
  }
  const bg = colorByRole(brand, "background");
  if (bg) lines.push(`Dominant background close to ${bg}.`);
  return lines.join("\n");
}
