// Image Generator — baking an Edit document (state/edit-doc.js) into a PNG:
// the base through its crop window, then every visible layer, bottom to top,
// drawn the way the canvas shows it — pictures at their centre and rotation,
// text with the Image Studio's outline and shadow (config/edit.js metrics), a
// wrapped block and its band when it has a box.

import { outlineMetrics, shadowMetrics, textFamily } from "../config/edit.js?v=1830";
import { isBase } from "../state/edit-doc.js?v=1830";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A layer couldn't be drawn."));
    img.src = url;
  });
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const fontOf = (l, px) => `${l.italic ? "italic " : ""}${l.bold ? 700 : 400} ${px}px ${textFamily(l.fontFamily)}`;

function drawText(ctx, l, W, H) {
  const px = l.sizeF * H;
  ctx.font = fontOf(l, px);
  ctx.textBaseline = "middle";
  const box = l.boxWF ? l.boxWF * W : null;
  const lines = box ? wrap(ctx, l.text || "", box) : [String(l.text || "")];
  const lh = px * (l.band ? 1.2 : 1.05);
  const widest = box || Math.max(...lines.map((t) => ctx.measureText(t).width));
  const sm = l.shadow ? shadowMetrics(l.shadowIntensity) : null;
  lines.forEach((t, i) => {
    const y = -((lines.length - 1) * lh) / 2 + i * lh;
    const w = ctx.measureText(t).width;
    const align = box ? l.align || "left" : "center";
    const x = align === "center" ? -w / 2 : align === "right" ? widest / 2 - w : -widest / 2;
    if (l.band && l.bandColor) {
      ctx.fillStyle = l.bandColor;
      ctx.fillRect(x - px * 0.3, y - px * 0.66, w + px * 0.6, px * 1.32);
    }
    ctx.textAlign = "left";
    const castShadow = () => {
      ctx.shadowColor = `rgba(0,0,0,${sm.alpha})`;
      ctx.shadowBlur = sm.blurEm * px;
      ctx.shadowOffsetY = sm.offYEm * px;
    };
    if (l.outline) {
      ctx.save();
      ctx.lineWidth = outlineMetrics(l.outlineWidth).emStroke * px;
      ctx.lineJoin = "round";
      ctx.strokeStyle = l.outlineColor || "#0A1B33";
      if (sm) castShadow();
      ctx.strokeText(t, x, y);
      ctx.restore();
    } else if (sm) {
      ctx.save();
      castShadow();
      ctx.fillStyle = l.color || "#FFFFFF";
      ctx.fillText(t, x, y);
      ctx.restore();
    }
    ctx.fillStyle = l.color || "#FFFFFF";
    ctx.fillText(t, x, y);
  });
}

/** @returns {Promise<Blob>} the document at its own size. */
export async function bakeDoc(doc) {
  const W = doc.w;
  const H = doc.h;
  const visible = doc.layers.filter((l) => !l.hidden);
  const fonts = visible.filter((l) => l.kind === "text").map((l) => fontOf(l, 32));
  if (document.fonts) await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => {})));
  const images = await Promise.all(visible.map((l) => (l.url ? loadImage(l.url) : null)));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  visible.forEach((l, i) => {
    const img = images[i];
    if (isBase(l)) {
      const iw = img.naturalWidth || W;
      const ih = img.naturalHeight || H;
      const c = l.crop;
      ctx.drawImage(img, c.x * iw, c.y * ih, c.w * iw, c.h * ih, 0, 0, W, H);
      return;
    }
    ctx.save();
    ctx.translate(l.xF * W, l.yF * H);
    ctx.rotate(l.rot || 0);
    if (l.kind === "text") drawText(ctx, l, W, H);
    else if (img) {
      const dw = l.wF * W;
      const dh = dw * (l.ratio || (img.naturalHeight || 1) / (img.naturalWidth || 1));
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be exported."))), "image/png"),
  );
}
