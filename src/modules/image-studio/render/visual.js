// Image Generator — renders one mock visual as standalone SVG markup.
//
// Deterministic: the same (style, brand palette, seeds, size, subject) always
// draws the same picture, which is why a variation stores seeds, not pixels.
// A preset draws with its own generator. A CUSTOM style is made of reference
// images: its look is read from their colours (lookFromColors) and they tint
// the palette. (Older styles that mixed presets still draw with them.)

import { prng } from "../lib/prng.js?v=1852";
import { QUICK_PRESETS, presetById } from "../config/style-presets.js?v=1852";
import { generatorFor } from "./generators.js?v=1852";
import { inkOn, resolvePalette } from "./palette.js?v=1852";
import { fontStack } from "../config/fonts.js?v=1852";
import { subjectPath } from "./subjects.js?v=1852";

let renderSeq = 0;

function weightedPick(rand, sources) {
  const total = sources.reduce((sum, s) => sum + s.weight, 0) || 1;
  let t = rand() * total;
  for (const s of sources) {
    t -= s.weight;
    if (t <= 0) return s;
  }
  return sources[sources.length - 1];
}

function hsl(hex) {
  const n = parseInt(String(hex || "").replace("#", ""), 16);
  if (!Number.isFinite(n)) return { h: 0, s: 0, l: 0.5 };
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: sat, l };
}

/**
 * The look a style's reference images point to — what a real model would read
 * from them, mocked from their sampled colours: dark with one vivid colour → a
 * glossy 3D render; dark or warm → a photograph; vivid and light → corporate
 * flat; greyish → tech minimal or bold editorial; the rest → hand-drawn.
 */
export function lookFromColors(colors) {
  const c = colors.map(hsl);
  if (!c.length) return "preset-bold-editorial";
  const avg = (k) => c.reduce((sum, x) => sum + x[k], 0) / c.length;
  const l = avg("l");
  const sat = avg("s");
  const vivid = c.some((x) => x.s > 0.6 && x.l > 0.35 && x.l < 0.75);
  const warm = c.filter((x) => x.s > 0.2 && (x.h < 60 || x.h > 330)).length / c.length;
  if (l < 0.32) return vivid ? "preset-3d-render" : "preset-photoreal";
  if (sat > 0.55 && l > 0.45) return "preset-corporate";
  if (sat < 0.18) return l > 0.7 ? "preset-tech-minimal" : "preset-bold-editorial";
  if (warm >= 0.5) return "preset-photoreal";
  return "preset-hand-drawn";
}

/** The colours a style's reference images carry: sampled at upload, or given with the image. */
function styleImageColors(style, getAsset = () => null) {
  return (style?.custom?.sources || [])
    .filter((s) => s.type === "image" && s.weight > 0)
    .flatMap((s) => s.colors || getAsset(s.ref)?.colors || []);
}

/** Which generator a style draws with, for a given seed, plus the palette tint it asks for. */
export function resolveStyleDrawing(style, seed, getAsset = () => null) {
  // From scratch — no style: each seed takes its own direction, the way a model
  // left to the words alone would.
  if (!style) {
    const free = presetById(QUICK_PRESETS[(seed >>> 0) % QUICK_PRESETS.length]);
    return { ...free.render, family: free.family, tint: [], tintWeight: 0 };
  }
  if (style.kind !== "custom") return { ...style.render, family: style.family, tint: [], tintWeight: 0 };
  const sources = style.custom?.sources || [];
  // Older styles mixed presets; they still draw with them. A style is now made
  // of reference images only, and its look is read FROM them.
  const presets = sources.filter((s) => s.type === "preset" && presetById(s.ref) && s.weight > 0);
  const images = sources.filter((s) => s.type === "image" && s.weight > 0);
  const colors = styleImageColors(style, getAsset);
  let chosen = presetById(lookFromColors(colors));
  if (presets.length) {
    const src =
      style.custom.fidelity === "composition"
        ? [...presets].sort((a, b) => b.weight - a.weight)[0]
        : weightedPick(prng(seed ^ 0x9e3779b9), presets);
    chosen = presetById(src.ref);
  }
  const tint = colors.slice(0, 3);
  const imageWeight = images.reduce((sum, s) => sum + s.weight, 0);
  const presetWeight = presets.reduce((sum, s) => sum + s.weight, 0);
  const tintWeight = tint.length
    ? Math.min(0.85, presets.length ? imageWeight / (imageWeight + presetWeight || 1) : 0.6)
    : 0;
  return { family: chosen.family, variant: chosen.render.variant, tint, tintWeight };
}

/**
 * @param {{style, brand, seed:number, bgSeed?:number, subjectSeed?:number, width:number, height:number,
 *          subjectKind?:string, productHref?:string, text?:{number?:string}, getAsset?:Function, title?:string}} o
 * @returns {string} SVG markup
 */
export function renderVisual(o) {
  const W = 1000;
  const H = Math.round((1000 * o.height) / o.width);
  const drawing = resolveStyleDrawing(o.style, o.seed, o.getAsset);
  const p = resolvePalette(o.brand, { tint: drawing.tint, tintWeight: drawing.tintWeight });
  const r = prng(o.seed);
  const rb = prng(o.bgSeed ?? o.seed ^ 0x5bd1e995);
  const rs = prng(o.subjectSeed ?? o.seed ^ 0x27d4eb2d);
  // The subject sits where the text layer ISN'T: lower-right third on a tall
  // canvas, right of centre on a wide one — the text block and logo take the rest.
  const { cx, cy, s } = subjectPlacement(W, H, rs);
  const kind = o.subjectKind || "object";
  const ctx = {
    W,
    H,
    p,
    r,
    rb,
    rs,
    id: `imst-r${(renderSeq += 1)}`,
    subject: { kind, cx, cy, s, d: subjectPath(kind, cx, cy, s, rs) },
    text: o.text || null,
    productHref: o.productHref || "",
  };
  const body = generatorFor(drawing.family, drawing.variant)(ctx) + embeddedText(ctx, o);
  const title = o.title ? `<title>${String(o.title).replace(/[&<>]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${o.width}" height="${o.height}" preserveAspectRatio="xMidYMid slice">${title}${body}</svg>`;
}

// "Built into the image": the model writes the headline itself, so it becomes
// part of the pixels — in the brand's heading font, on a soft scrim so it reads
// whatever the generator drew underneath. Only offered for styles that support it.
function embeddedText(c, o) {
  const headline = o.text?.embedded && o.text.headline ? String(o.text.headline) : "";
  if (!headline) return "";
  const { W, H, p } = c;
  const family = o.brand?.fonts?.find((f) => f.role === "heading")?.family;
  const font = family ? fontStack(family).replace(/"/g, "'") : "Helvetica, Arial, sans-serif";
  const size = Math.min(W, H) * (headline.length > 28 ? 0.06 : 0.08);
  const words = headline.split(/\s+/);
  const perLine = Math.max(1, Math.floor((W * 0.8) / (size * 0.55)));
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  const shown = lines.slice(0, 3);
  const top = H * 0.08;
  const scrimH = size * 1.25 * shown.length + size;
  const ink = inkOn(p.background, p.text);
  const esc = (t) => t.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
  return (
    `<rect x="${W * 0.05}" y="${top - size * 0.2}" width="${W * 0.9}" height="${scrimH}" rx="${size * 0.3}" fill="${p.background}" opacity="0.82"/>` +
    shown
      .map(
        (l, i) =>
          `<text x="${W * 0.09}" y="${top + size * (1.05 + i * 1.25)}" font-size="${size}" font-weight="700" font-family="${font}" fill="${ink}">${esc(l)}</text>`,
      )
      .join("")
  );
}

/**
 * Where the subject sits, in viewBox units (W = 1000). Matches render/layout.js:
 * square / portrait keep the text in the lower third, stories just under the
 * middle, wide formats on the left half. Exported for the attention heatmap.
 */
function subjectPlacement(W, H, rs) {
  const ratio = H / W;
  const wide = ratio < 0.72;
  const tall = ratio > 1.5;
  // A subject in a scene, not a sticker filling the frame.
  const s = wide ? H * (0.48 + rs() * 0.1) : W * (tall ? 0.48 + rs() * 0.08 : 0.37 + rs() * 0.06);
  const cx = W * (wide ? 0.72 : 0.5 + (rs() - 0.5) * 0.14);
  const cy = H * (wide ? 0.5 : tall ? 0.3 : 0.36 + (rs() - 0.5) * 0.06);
  return { cx, cy, s };
}

export function svgToDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
