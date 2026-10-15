// Image Generator — the Edit mode's document: one image as a stack of LAYERS.
// No DOM, no rendering: the views draw it, render/edit-export.js bakes it.
//
//   background  the generated backdrop (or, for a draft's own photo, "Image") —
//               always at the bottom, never moved, cropped with the frame
//   subject     the generated subject, lifted off the background (render/split.js)
//   text        the headline, and every text added since
//   logo/image  the Playbook's mark, and every picture added since
//
// Geometry is the Image Studio's overlay model, so the canvas can use its
// markup as is: a centre (xF, yF) in fractions of the frame, a rotation in
// radians, a width in fractions of the frame width (pictures, whose height
// follows `ratio`), a font size in fractions of the frame height (text).
//
// A document belongs to the image it was opened on — a variation, or the
// draft's photo — and keeps its own undo stack. Edits stick to that image:
// picking another variation opens (or reopens) that one's document.

import { hashString } from "../lib/prng.js?v=1807";

let seq = 0;
const uid = (prefix) => `${prefix}-${(seq += 1).toString(36)}`;

export const LAYER_ICONS = Object.freeze({
  background: "ap-icon-image",
  photo: "ap-icon-image",
  subject: "ap-icon-star",
  text: "ap-icon-closed-captions",
  logo: "ap-icon-file--image",
  image: "ap-icon-file--image",
});

const TEXT_DEFAULTS = Object.freeze({
  text: "Your text",
  color: "#FFFFFF",
  outline: false,
  outlineColor: "#0A1B33",
  outlineWidth: 50,
  shadow: false,
  shadowIntensity: 55,
  fontFamily: null,
  sizeF: 0.09,
  bold: false,
  italic: false,
  band: false,
  bandColor: null,
  boxWF: null,
  align: "center",
  xF: 0.5,
  yF: 0.5,
  rot: 0,
});

/** What the layers panel calls a layer. */
export function layerName(layer) {
  if (layer.kind === "text") {
    const t = String(layer.text || "").trim();
    return t ? (t.length > 24 ? `${t.slice(0, 22).trimEnd()}…` : t) : "Text";
  }
  return layer.name;
}

export const isPicture = (layer) => layer.kind === "subject" || layer.kind === "logo" || layer.kind === "image";
export const isBase = (layer) => layer.kind === "background" || layer.kind === "photo";

function baseLayer(kind, url) {
  return {
    id: "base",
    kind,
    name: kind === "photo" ? "Image" : "Background",
    url,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    hidden: false,
    locked: true,
  };
}

/** A picture layer centred where `box` (top-left fractions) was. */
export function pictureLayer(kind, { url, ratio, box, name }) {
  return {
    id: uid(kind),
    kind,
    name: name || (kind === "subject" ? "Subject" : kind === "logo" ? "Logo" : "Image"),
    url,
    ratio,
    xF: box.x + box.w / 2,
    yF: box.y + box.h / 2,
    wF: box.w,
    rot: 0,
    hidden: false,
    locked: false,
  };
}

export function textLayer(partial = {}) {
  return { id: uid("text"), kind: "text", ...TEXT_DEFAULTS, hidden: false, locked: false, ...partial };
}

/** The draft's own photo: one layer, nothing to lift off it. */
export function photoDoc({ key, url, w, h }) {
  return { key, w, h, origin: "photo", seeds: null, layers: [baseLayer("photo", url)] };
}

/**
 * A generated variation, as layers. `split` is render/split.js's output for
 * it; `text` the headline as the generator placed it (resolved layer spec);
 * `logo` the mark, with its natural ratio already measured.
 */
export function generatedDoc({ key, w, h, seeds, split, subjectUrl, backgroundUrl, text, logo }) {
  const layers = [baseLayer("background", backgroundUrl)];
  if (split.subject) {
    const b = split.subject.box;
    layers.push(pictureLayer("subject", { url: subjectUrl, ratio: (b.h * h) / (b.w * w), box: b }));
  }
  if (text) layers.push(textLayer(text));
  if (logo) layers.push(pictureLayer("logo", logo));
  return { key, w, h, origin: "generated", seeds: { ...seeds }, layers };
}

export const snapshot = (doc) => ({
  ...doc,
  seeds: doc.seeds && { ...doc.seeds },
  layers: doc.layers.map((l) => ({ ...l, crop: l.crop && { ...l.crop } })),
});

/** An entry: the document and its undo stack. */
export const entryOf = (doc) => ({ doc, history: [] });

/** Records the state BEFORE a change, so Undo can put it back. */
export function record(entry) {
  entry.history.push(snapshot(entry.doc));
  if (entry.history.length > 60) entry.history.shift();
}

export function undo(entry) {
  const prev = entry.history.pop();
  if (prev) entry.doc = prev;
  return !!prev;
}

export const findLayer = (doc, id) => doc.layers.find((l) => l.id === id) || null;

/** Up (towards the top) or down one step. The base stays at the bottom. */
export function moveLayer(doc, id, dir) {
  const i = doc.layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 1 || j < 1 || j >= doc.layers.length) return false;
  [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
  return true;
}

export function removeLayer(doc, id) {
  const layer = findLayer(doc, id);
  if (!layer || isBase(layer)) return false;
  doc.layers = doc.layers.filter((l) => l.id !== id);
  return true;
}

/**
 * Crops the whole document to `r` (fractions of the frame). The base keeps
 * its source and narrows its window; every other layer keeps its size in
 * pixels and its place in the picture, re-expressed against the new frame.
 */
export function cropDoc(doc, r) {
  doc.layers = doc.layers.map((l) => {
    if (isBase(l)) {
      const c = l.crop;
      return { ...l, crop: { x: c.x + r.xF * c.w, y: c.y + r.yF * c.h, w: c.w * r.wF, h: c.h * r.hF } };
    }
    const next = { ...l, xF: (l.xF - r.xF) / r.wF, yF: (l.yF - r.yF) / r.hF };
    if (l.kind === "text") {
      next.sizeF = l.sizeF / r.hF;
      if (l.boxWF) next.boxWF = l.boxWF / r.wF;
    } else next.wF = l.wF / r.wF;
    return next;
  });
  doc.w = Math.max(1, Math.round(doc.w * r.wF));
  doc.h = Math.max(1, Math.round(doc.h * r.hF));
}

/** A cheap identity for "has this document changed" caches (the bake). */
export function docSignature(doc) {
  return JSON.stringify([doc.w, doc.h, doc.layers.map((l) => ({ ...l, url: l.url ? hashString(l.url) : "" }))]);
}
