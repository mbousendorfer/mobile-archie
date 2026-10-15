// Image Generator — lifting the subject off a generated image, for the Edit
// mode's layers. The generators wrap everything that belongs to the subject in
// a marker <g> (SUBJECT_PART, render/generators.js), so one render can be read
// twice:
//
//   background  the same SVG with every marked group removed
//   subject     the same SVG with everything else removed — but the groups
//               ABOVE a marked one kept, attributes and all, so a subject drawn
//               inside a blur, a clip or a mirrored reflection still looks the
//               way it did in the full image — then cropped to its own box
//
// The box is measured by laying the subject out off-screen: the only way to
// honour the transforms and clips around it. It needs a document, which the
// editor always has.

import { SUBJECT_PART } from "./generators.js?v=1911";

const MARK = `[${SUBJECT_PART}]`;
// Definitions a subject may point at: kept wherever they sit.
const KEEP = new Set([
  "defs",
  "title",
  "style",
  "filter",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
]);

function prune(el) {
  [...el.children].forEach((child) => {
    if (KEEP.has(child.localName) || child.hasAttribute(SUBJECT_PART)) return;
    if (child.querySelector(MARK)) prune(child);
    else child.remove();
  });
}

function viewBoxOf(root) {
  const [x, y, w, h] = (root.getAttribute("viewBox") || "0 0 1000 1000").split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

/** The subject's box in the SVG's own units, from an off-screen layout. */
function measure(subjectRoot, vb) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
  const node = document.importNode(subjectRoot, true);
  node.setAttribute("width", String(vb.w));
  node.setAttribute("height", String(vb.h));
  host.append(node);
  document.body.append(host);
  try {
    const frame = node.getBoundingClientRect();
    const boxes = [...node.querySelectorAll(MARK)]
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width || r.height);
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((r) => r.left)) - frame.left;
    const top = Math.min(...boxes.map((r) => r.top)) - frame.top;
    const right = Math.max(...boxes.map((r) => r.right)) - frame.left;
    const bottom = Math.max(...boxes.map((r) => r.bottom)) - frame.top;
    // A blur or a drop shadow bleeds past the geometry: a little air, inside the canvas.
    const pad = vb.w * 0.02;
    const x = Math.max(0, left - pad);
    const y = Math.max(0, top - pad);
    const w = Math.min(vb.w, right + pad) - x;
    const h = Math.min(vb.h, bottom + pad) - y;
    return w > 1 && h > 1 ? { x: vb.x + x, y: vb.y + y, w, h } : null;
  } finally {
    host.remove();
  }
}

/**
 * @param {string} svg a full render (render/visual.js#renderVisual)
 * @returns {{ background: string, subject: null | { svg: string, box: {x,y,w,h} } }}
 *   `box` is the subject's place in the image, in fractions of it.
 */
export function splitVisual(svg) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  const out = new XMLSerializer();
  const bg = root.cloneNode(true);
  bg.querySelectorAll(MARK).forEach((n) => n.remove());
  const background = out.serializeToString(bg);
  if (!root.querySelector(MARK)) return { background, subject: null };

  const vb = viewBoxOf(root);
  const sub = root.cloneNode(true);
  prune(sub);
  const box = measure(sub, vb);
  if (!box) return { background, subject: null };
  const scale = Number(root.getAttribute("width")) / vb.w || 1;
  sub.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  sub.setAttribute("width", String(Math.round(box.w * scale)));
  sub.setAttribute("height", String(Math.round(box.h * scale)));
  sub.setAttribute("preserveAspectRatio", "xMidYMid meet");
  sub.querySelector("title")?.remove();
  return {
    background,
    subject: {
      svg: out.serializeToString(sub),
      box: { x: (box.x - vb.x) / vb.w, y: (box.y - vb.y) / vb.h, w: box.w / vb.w, h: box.h / vb.h },
    },
  };
}
