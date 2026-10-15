// Image Generator — one procedural drawing per style preset. The mock has to
// LOOK like its preset: clay is soft and rounded, an infographic is bars on a
// grid, a cinematic still is letterboxed. Every generator receives the same
// context and returns SVG markup (no <svg> wrapper):
//
//   { W, H, p, r, rb, rs, id, subject: { kind, cx, cy, s, d }, text, productHref }
//     p   resolved palette (render/palette.js)
//     r   general rand · rb background rand · rs subject rand (partial regeneration
//         re-seeds one of the two without moving the other)
//     id  a unique prefix for gradient / filter ids (four renders share a page)

import { darken, inkOn, lighten, luminance, mix } from "./palette.js?v=1924";
import { subjectDetail } from "./subjects.js?v=1924";

const n = (v) => Math.round(v * 10) / 10;
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

function rect(x, y, w, h, fill, extra = "") {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;
}
function circle(cx, cy, rad, fill, extra = "") {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rad)}" fill="${fill}" ${extra}/>`;
}
// Everything that belongs to the subject is wrapped in this marker — a <g> that
// draws nothing by itself — so the editor can lift the subject off the
// background as its own layer (render/split.js). Shadows, halos and eyes that
// travel with the subject are marked too; a generator that draws no subject
// (Big number, Quote…) simply has no subject layer.
export const SUBJECT_PART = "data-imst-part";
const part = (markup) => (markup ? `<g ${SUBJECT_PART}="subject">${markup}</g>` : "");

// The subject: its silhouette in the generator's own treatment, then its inner
// lines in a tone of that fill — lighter on a dark fill, darker on a light one.
// `detail: false` for the treatments that ARE outlines (line art) or blur it away.
function subject(c, fill, extra = "", { detail = true } = {}) {
  const { kind, cx, cy, s } = c.subject;
  // With a product, the product IS the subject: its own picture, not a
  // silhouette with the picture pasted on top.
  if (c.productHref) return productImage(c, 0.9);
  const base = `<path d="${c.subject.d}" fill="${fill}" fill-rule="evenodd" ${extra}/>`;
  if (!detail) return part(base);
  const plain = /^#[0-9a-f]{6}$/i.test(fill);
  const tone = plain ? (luminance(fill) < 0.35 ? lighten(fill, 0.45) : darken(fill, 0.35)) : "#FFFFFF";
  const width = c.W * 0.006;
  return part(
    base +
      `<path d="${subjectDetail(kind, cx, cy, s)}" fill="none" stroke="${tone}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${plain ? 0.9 : 0.55}"/>`,
  );
}
function productImage(c, scale = 1) {
  // Drawn once per render, whichever of subject() / the generator asks first.
  if (!c.productHref || c.productDrawn) return "";
  c.productDrawn = true;
  const { cx, cy, s } = c.subject;
  const size = s * scale;
  return part(
    `<image href="${c.productHref}" x="${n(cx - size / 2)}" y="${n(cy - size / 2)}" width="${n(size)}" height="${n(size)}" preserveAspectRatio="xMidYMid meet"/>`,
  );
}
function grain(c, opacity = 0.18) {
  return (
    `<filter id="${c.id}-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(c.r() * 999)}"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="${c.W}" height="${c.H}" filter="url(#${c.id}-grain)" opacity="${opacity}" style="mix-blend-mode:multiply"/>`
  );
}
function blur(c, name, amount) {
  return `<filter id="${c.id}-${name}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${amount}"/></filter>`;
}
function textLine(
  x,
  y,
  size,
  fill,
  content,
  { weight = 700, anchor = "start", font = "Helvetica, Arial, sans-serif" } = {},
) {
  const safe = String(content).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="${weight}" font-family="${font}" fill="${fill}" text-anchor="${anchor}">${safe}</text>`;
}

// ── Illustration ─────────────────────────────────────────────────────────────

function flat(c) {
  const { W, H, p, rb } = c;
  const sunX = W * (0.2 + rb() * 0.6);
  return (
    rect(0, 0, W, H, p.background) +
    circle(sunX, H * 0.28, W * 0.13, p.accent) +
    `<path d="M0 ${H * 0.72} Q ${W * 0.3} ${H * (0.5 + rb() * 0.1)} ${W * 0.6} ${H * 0.7} T ${W} ${H * 0.66} V ${H} H 0 Z" fill="${p.secondary}"/>` +
    `<path d="M0 ${H * 0.84} Q ${W * 0.45} ${H * 0.7} ${W} ${H * 0.86} V ${H} H 0 Z" fill="${p.primary}"/>` +
    subject(c, p.primary, `stroke="${p.background}" stroke-width="${W * 0.008}"`) +
    productImage(c, 0.8)
  );
}

function lineArt(c) {
  const { W, H, p, rb } = c;
  const lines = Array.from({ length: 3 }, (_, i) => {
    const y = H * (0.2 + i * 0.28 + rb() * 0.05);
    return `<path d="M ${W * 0.06} ${y} q ${W * 0.2} ${-H * 0.05} ${W * 0.4} 0 t ${W * 0.48} 0" stroke="${lighten(p.text, 0.75)}" stroke-width="${W * 0.003}" fill="none"/>`;
  }).join("");
  return (
    rect(0, 0, W, H, lighten(p.background, 0.5)) +
    lines +
    part(circle(c.subject.cx + c.subject.s * 0.4, c.subject.cy - c.subject.s * 0.45, W * 0.03, p.accent)) +
    subject(
      c,
      "none",
      `stroke="${p.text}" stroke-width="${W * 0.006}" stroke-linejoin="round" stroke-linecap="round"`,
      { detail: false },
    ) +
    part(
      `<path d="${subjectDetail(c.subject.kind, c.subject.cx, c.subject.cy, c.subject.s)}" fill="none" stroke="${p.text}" stroke-width="${W * 0.004}" stroke-linecap="round"/>`,
    )
  );
}

function editorial(c) {
  const { W, H, p, rb } = c;
  const shapes = Array.from({ length: 4 }, (_, i) =>
    circle(
      W * rb(),
      H * rb(),
      W * (0.15 + rb() * 0.25),
      pick(rb, [p.primary, p.secondary, p.accent, lighten(p.secondary, 0.4)]),
      `opacity="${0.55 + i * 0.1}"`,
    ),
  ).join("");
  return (
    rect(0, 0, W, H, mix(p.background, p.secondary, 0.25)) +
    shapes +
    part(circle(c.subject.cx, c.subject.cy, c.subject.s * 0.62, p.accent, 'opacity="0.9"')) +
    subject(c, p.text) +
    productImage(c, 0.7) +
    grain(c, 0.22)
  );
}

function watercolor(c) {
  const { W, H, p, rb } = c;
  const defs =
    `<filter id="${c.id}-wash" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${Math.floor(rb() * 999)}" result="t"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="t" scale="${W * 0.08}"/><feGaussianBlur stdDeviation="${W * 0.012}"/></filter>`;
  const blobs = Array.from({ length: 6 }, () =>
    circle(W * rb(), H * rb(), W * (0.12 + rb() * 0.2), pick(rb, p.all), `opacity="${0.25 + rb() * 0.25}"`),
  ).join("");
  return (
    defs +
    rect(0, 0, W, H, lighten(p.background, 0.6)) +
    `<g filter="url(#${c.id}-wash)">${blobs}${subject(c, p.primary, 'opacity="0.75"')}</g>` +
    grain(c, 0.1)
  );
}

function isometric(c) {
  const { W, H, p, rb } = c;
  const size = W * 0.1;
  const cubes = [];
  for (let i = 0; i < 9; i += 1) {
    const gx = (i % 3) - 1;
    const gy = Math.floor(i / 3) - 1;
    const x = W / 2 + (gx - gy) * size * 0.87;
    const y = H * 0.55 + (gx + gy) * size * 0.5;
    const tall = size * (0.4 + rb() * 1.4);
    const base = pick(rb, p.all);
    cubes.push(
      `<g><path d="M${n(x)} ${n(y - tall)} l${n(size * 0.87)} ${n(size * 0.5)} l${n(-size * 0.87)} ${n(size * 0.5)} l${n(-size * 0.87)} ${n(-size * 0.5)} Z" fill="${lighten(base, 0.25)}"/>` +
        `<path d="M${n(x - size * 0.87)} ${n(y - tall + size * 0.5)} l${n(size * 0.87)} ${n(size * 0.5)} v${n(tall)} l${n(-size * 0.87)} ${n(-size * 0.5)} Z" fill="${base}"/>` +
        `<path d="M${n(x)} ${n(y - tall + size)} l${n(size * 0.87)} ${n(-size * 0.5)} v${n(tall)} l${n(-size * 0.87)} ${n(size * 0.5)} Z" fill="${darken(base, 0.25)}"/></g>`,
    );
  }
  return rect(0, 0, W, H, p.background) + cubes.join("");
}

// ── 3D ───────────────────────────────────────────────────────────────────────

function clay(c) {
  const { W, H, p, rb } = c;
  const soft = (hex) => lighten(hex, 0.35);
  const grad = (name, hex) =>
    `<radialGradient id="${c.id}-${name}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${lighten(hex, 0.55)}"/><stop offset="0.6" stop-color="${soft(hex)}"/><stop offset="1" stop-color="${darken(soft(hex), 0.12)}"/></radialGradient>`;
  const blobs = [p.primary, p.accent, p.secondary].map((hex, i) => grad(`c${i}`, hex)).join("");
  // Around the edges, never behind the subject.
  const spots = [
    [0.14, 0.2],
    [0.86, 0.26],
    [0.18, 0.82],
    [0.84, 0.8],
  ];
  const pills = Array.from({ length: 3 }, (_, i) => {
    const [fx, fy] = spots[(i + Math.floor(rb() * 4)) % 4];
    const x = W * (fx + (rb() - 0.5) * 0.06);
    const y = H * (fy + (rb() - 0.5) * 0.06);
    const rad = W * (0.06 + rb() * 0.07);
    return `<ellipse cx="${n(x)}" cy="${n(y + rad * 0.9)}" rx="${n(rad)}" ry="${n(rad * 0.25)}" fill="#000" opacity="0.12" filter="url(#${c.id}-soft)"/>${circle(x, y, rad, `url(#${c.id}-c${i})`)}`;
  }).join("");
  return (
    `<defs>${blobs}${blur(c, "soft", W * 0.012)}<linearGradient id="${c.id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(p.background, 0.3)}"/><stop offset="1" stop-color="${mix(p.background, p.secondary, 0.18)}"/></linearGradient></defs>` +
    rect(0, 0, W, H, `url(#${c.id}-bg)`) +
    pills +
    part(
      `<ellipse cx="${c.subject.cx}" cy="${n(c.subject.cy + c.subject.s * 0.52)}" rx="${n(c.subject.s * 0.42)}" ry="${n(c.subject.s * 0.08)}" fill="#000" opacity="0.14" filter="url(#${c.id}-soft)"/>`,
    ) +
    subject(
      c,
      `url(#${c.id}-c0)`,
      `stroke="${darken(soft(p.primary), 0.1)}" stroke-width="${W * 0.004}" stroke-linejoin="round"`,
    ) +
    productImage(c, 0.75)
  );
}

function glossy(c) {
  const { W, H, p } = c;
  const { cx, cy, s } = c.subject;
  return (
    `<defs><radialGradient id="${c.id}-bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${lighten(p.primary, 0.25)}"/><stop offset="1" stop-color="${darken(p.primary, 0.55)}"/></radialGradient>` +
    `<linearGradient id="${c.id}-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(p.accent, 0.4)}"/><stop offset="0.5" stop-color="${p.accent}"/><stop offset="1" stop-color="${darken(p.accent, 0.45)}"/></linearGradient>` +
    `${blur(c, "soft", W * 0.02)}</defs>` +
    rect(0, 0, W, H, `url(#${c.id}-bg)`) +
    part(
      `<ellipse cx="${cx}" cy="${n(cy + s * 0.55)}" rx="${n(s * 0.5)}" ry="${n(s * 0.07)}" fill="#000" opacity="0.4" filter="url(#${c.id}-soft)"/>`,
    ) +
    subject(c, `url(#${c.id}-body)`) +
    productImage(c, 0.8) +
    part(
      `<ellipse cx="${n(cx - s * 0.12)}" cy="${n(cy - s * 0.2)}" rx="${n(s * 0.07)}" ry="${n(s * 0.2)}" fill="#FFF" opacity="0.55" transform="rotate(-20 ${n(cx)} ${n(cy)})"/>`,
    ) +
    `<g transform="translate(0 ${n(cy * 2 + s * 1.1)}) scale(1 -1)" opacity="0.12">${subject(c, `url(#${c.id}-body)`)}</g>`
  );
}

function lowPoly(c) {
  const { W, H, p, rb } = c;
  const cols = 6;
  const rows = Math.max(4, Math.round((cols * H) / W));
  const pts = [];
  for (let y = 0; y <= rows; y += 1)
    for (let x = 0; x <= cols; x += 1) {
      const edge = x === 0 || y === 0 || x === cols || y === rows;
      pts.push([
        (x / cols) * W + (edge ? 0 : (rb() - 0.5) * (W / cols) * 0.7),
        (y / rows) * H + (edge ? 0 : (rb() - 0.5) * (H / rows) * 0.7),
      ]);
    }
  const at = (x, y) => pts[y * (cols + 1) + x];
  const tris = [];
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1) {
      const a = at(x, y),
        b = at(x + 1, y),
        d = at(x, y + 1),
        e = at(x + 1, y + 1);
      const shade = (t) => mix(p.primary, p.secondary, (x / cols + y / rows) / 2 + (t - 0.5) * 0.3);
      tris.push(
        `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(d[0])} ${n(d[1])}Z" fill="${shade(rb())}"/>`,
      );
      tris.push(
        `<path d="M${n(b[0])} ${n(b[1])}L${n(e[0])} ${n(e[1])}L${n(d[0])} ${n(d[1])}Z" fill="${shade(rb())}"/>`,
      );
    }
  return (
    tris.join("") +
    subject(c, p.accent, `stroke="${darken(p.accent, 0.3)}" stroke-width="${W * 0.004}" stroke-linejoin="bevel"`)
  );
}

function toy(c) {
  const { W, H, p, rb } = c;
  const stroke = `stroke="${darken(p.text, 0.2)}" stroke-width="${W * 0.012}" stroke-linejoin="round"`;
  const blocks = Array.from({ length: 4 }, () => {
    const w = W * (0.12 + rb() * 0.12);
    return rect(
      W * rb() * 0.85,
      H * (0.1 + rb() * 0.75),
      w,
      w * (0.6 + rb() * 0.5),
      pick(rb, [lighten(p.accent, 0.1), lighten(p.primary, 0.3), lighten(p.secondary, 0.2)]),
      `rx="${n(w * 0.25)}" ${stroke}`,
    );
  }).join("");
  return (
    rect(0, 0, W, H, lighten(p.accent, 0.75)) +
    blocks +
    subject(c, lighten(p.primary, 0.2), stroke) +
    part(
      circle(c.subject.cx - c.subject.s * 0.08, c.subject.cy - c.subject.s * 0.05, W * 0.018, "#FFF", stroke) +
        circle(c.subject.cx + c.subject.s * 0.08, c.subject.cy - c.subject.s * 0.05, W * 0.018, "#FFF", stroke),
    )
  );
}

// ── Photo ────────────────────────────────────────────────────────────────────

function lifestyle(c) {
  const { W, H, p, rb } = c;
  const bokeh = Array.from({ length: 9 }, () =>
    circle(
      W * rb(),
      H * rb() * 0.7,
      W * (0.03 + rb() * 0.07),
      lighten(pick(rb, [p.accent, "#FFE7B8", p.secondary]), 0.4),
      `opacity="${0.35 + rb() * 0.35}" filter="url(#${c.id}-bokeh)"`,
    ),
  ).join("");
  return (
    `<defs>${blur(c, "bokeh", W * 0.012)}${blur(c, "depth", W * 0.004)}` +
    `<linearGradient id="${c.id}-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(mix(p.accent, "#FFD9A0", 0.5), 0.35)}"/><stop offset="1" stop-color="${mix(p.background, p.secondary, 0.35)}"/></linearGradient>` +
    `<radialGradient id="${c.id}-vig" cx="50%" cy="50%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient></defs>` +
    rect(0, 0, W, H, `url(#${c.id}-sky)`) +
    bokeh +
    rect(0, H * 0.74, W, H * 0.26, mix(darken(p.secondary, 0.2), "#8A6A4A", 0.4)) +
    `<g filter="url(#${c.id}-depth)">${subject(c, darken(p.primary, 0.1))}</g>` +
    productImage(c, 0.75) +
    rect(0, 0, W, H, `url(#${c.id}-vig)`) +
    grain(c, 0.08)
  );
}

function packshot(c) {
  const { W, H, p } = c;
  const { cx, cy, s } = c.subject;
  return (
    `<defs><linearGradient id="${c.id}-sweep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(p.background, 0.2)}"/><stop offset="0.7" stop-color="${mix(p.background, p.secondary, 0.12)}"/><stop offset="1" stop-color="${lighten(p.background, 0.4)}"/></linearGradient>${blur(c, "soft", W * 0.015)}</defs>` +
    rect(0, 0, W, H, `url(#${c.id}-sweep)`) +
    part(
      `<ellipse cx="${cx}" cy="${n(cy + s * 0.52)}" rx="${n(s * 0.4)}" ry="${n(s * 0.05)}" fill="#000" opacity="0.22" filter="url(#${c.id}-soft)"/>`,
    ) +
    (c.productHref ? productImage(c, 1.05) : subject(c, p.primary))
  );
}

function flatLay(c) {
  const { W, H, p, rb } = c;
  const items = Array.from({ length: 5 }, () => {
    const x = W * (0.1 + rb() * 0.8);
    const y = H * (0.1 + rb() * 0.8);
    const sz = W * (0.06 + rb() * 0.08);
    const fill = pick(rb, [p.accent, p.secondary, lighten(p.primary, 0.3), "#FFFFFF"]);
    const shape =
      rb() > 0.5
        ? circle(x, y, sz, fill)
        : rect(
            x - sz,
            y - sz * 0.7,
            sz * 2,
            sz * 1.4,
            fill,
            `rx="${n(sz * 0.15)}" transform="rotate(${n(rb() * 60 - 30)} ${n(x)} ${n(y)})"`,
          );
    return `<g filter="url(#${c.id}-drop)">${shape}</g>`;
  }).join("");
  return (
    `<defs><filter id="${c.id}-drop"><feDropShadow dx="${W * 0.006}" dy="${W * 0.008}" stdDeviation="${W * 0.006}" flood-opacity="0.22"/></filter></defs>` +
    rect(0, 0, W, H, mix(p.background, "#D9C8B0", 0.35)) +
    grain(c, 0.12) +
    items +
    `<g filter="url(#${c.id}-drop)">${subject(c, p.primary)}${productImage(c, 0.8)}</g>`
  );
}

function cinematic(c) {
  const { W, H, p } = c;
  const bar = H * 0.12;
  return (
    `<defs><linearGradient id="${c.id}-grade" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${mix("#0F4C5C", p.secondary, 0.4)}"/><stop offset="1" stop-color="${mix("#E07A3F", p.accent, 0.4)}"/></linearGradient>` +
    `<linearGradient id="${c.id}-rim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${lighten(p.accent, 0.4)}"/><stop offset="0.25" stop-color="${darken(p.text, 0.6)}"/></linearGradient></defs>` +
    rect(0, 0, W, H, `url(#${c.id}-grade)`) +
    rect(0, H * 0.7, W, H * 0.3, darken(p.primary, 0.6), 'opacity="0.6"') +
    subject(c, `url(#${c.id}-rim)`) +
    grain(c, 0.2) +
    rect(0, 0, W, bar, "#000") +
    rect(0, H - bar, W, bar, "#000")
  );
}

// ── Graphic ──────────────────────────────────────────────────────────────────

function infographic(c) {
  const { W, H, p, rb } = c;
  const bars = 5;
  const bw = W * 0.09;
  const base = H * 0.78;
  const out = [rect(0, 0, W, H, p.background)];
  for (let i = 0; i <= 4; i += 1)
    out.push(rect(W * 0.1, base - i * H * 0.13, W * 0.8, W * 0.002, lighten(p.text, 0.8)));
  for (let i = 0; i < bars; i += 1) {
    const h = H * (0.12 + rb() * 0.42);
    out.push(
      rect(
        W * 0.14 + i * bw * 1.6,
        base - h,
        bw,
        h,
        i === 3 ? p.accent : mix(p.primary, p.secondary, i / bars),
        `rx="${n(bw * 0.12)}"`,
      ),
    );
  }
  out.push(circle(W * 0.8, H * 0.2, W * 0.07, p.accent));
  out.push(rect(W * 0.1, H * 0.12, W * 0.4, H * 0.035, p.text, `rx="${H * 0.017}"`));
  out.push(rect(W * 0.1, H * 0.18, W * 0.26, H * 0.025, lighten(p.text, 0.5), `rx="${H * 0.012}"`));
  return out.join("");
}

function bigNumber(c) {
  const { W, H, p, rb } = c;
  const number = c.text?.number || `${Math.round(40 + rb() * 55)}%`;
  const bg = rb() > 0.5 ? p.primary : p.background;
  const ink = inkOn(bg, p.text);
  return (
    rect(0, 0, W, H, bg) +
    textLine(W * 0.08, H * 0.62, Math.min(W, H) * 0.38, bg === p.primary ? p.accent : p.primary, number, {
      weight: 800,
    }) +
    rect(W * 0.08, H * 0.7, W * 0.16, H * 0.012, p.accent) +
    rect(W * 0.08, H * 0.76, W * 0.62, H * 0.03, ink, `rx="${H * 0.015}" opacity="0.85"`) +
    rect(W * 0.08, H * 0.81, W * 0.44, H * 0.03, ink, `rx="${H * 0.015}" opacity="0.55"`)
  );
}

function quote(c) {
  const { W, H, p } = c;
  const bg = mix(p.background, p.secondary, 0.12);
  const ink = inkOn(bg, p.text);
  const lines = [0.82, 0.74, 0.56]
    .map((w, i) =>
      rect(W * 0.12, H * (0.46 + i * 0.08), W * w * 0.8, H * 0.04, ink, `rx="${H * 0.02}" opacity="${0.9 - i * 0.15}"`),
    )
    .join("");
  return (
    rect(0, 0, W, H, bg) +
    textLine(W * 0.1, H * 0.42, Math.min(W, H) * 0.4, p.accent, "“", { font: "Georgia, serif" }) +
    lines +
    rect(W * 0.12, H * 0.78, W * 0.08, H * 0.006, p.primary) +
    rect(W * 0.23, H * 0.77, W * 0.22, H * 0.025, lighten(ink, 0.3), `rx="${H * 0.012}"`)
  );
}

function beforeAfter(c) {
  const { W, H, p } = c;
  const clip = `<clipPath id="${c.id}-right"><rect x="${W / 2}" y="0" width="${W / 2}" height="${H}"/></clipPath><clipPath id="${c.id}-left"><rect x="0" y="0" width="${W / 2}" height="${H}"/></clipPath>`;
  return (
    `<defs>${clip}</defs>` +
    `<g clip-path="url(#${c.id}-left)">${rect(0, 0, W, H, "#D5D8DE")}${subject(c, "#9AA1AD")}</g>` +
    `<g clip-path="url(#${c.id}-right)">${rect(0, 0, W, H, p.background)}${circle(W * 0.8, H * 0.25, W * 0.1, p.accent)}${subject(c, p.primary)}${productImage(c, 0.8)}</g>` +
    rect(W / 2 - W * 0.003, 0, W * 0.006, H, "#FFFFFF") +
    circle(W / 2, H / 2, W * 0.03, "#FFFFFF", `stroke="${p.text}" stroke-width="${W * 0.003}"`) +
    textLine(W * 0.05, H * 0.1, H * 0.045, "#5C6370", "Before") +
    textLine(W * 0.95, H * 0.1, H * 0.045, inkOn(p.background, p.text), "After", { anchor: "end" })
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────

function collage(c) {
  const { W, H, p, rb } = c;
  const torn = (x, y, w, h, fill, rot) => {
    const pts = [];
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) pts.push([x + (w * i) / steps, y + (rb() - 0.5) * h * 0.06]);
    for (let i = steps; i >= 0; i -= 1) pts.push([x + (w * i) / steps, y + h + (rb() - 0.5) * h * 0.06]);
    return `<path d="M${pts.map(([a, b]) => `${n(a)} ${n(b)}`).join("L")}Z" fill="${fill}" transform="rotate(${n(rot)} ${n(x + w / 2)} ${n(y + h / 2)})" filter="url(#${c.id}-drop)"/>`;
  };
  const scraps = Array.from({ length: 5 }, () =>
    torn(
      W * rb() * 0.7,
      H * rb() * 0.8,
      W * (0.25 + rb() * 0.3),
      H * (0.12 + rb() * 0.2),
      pick(rb, [p.accent, p.secondary, "#F4EEDC", lighten(p.primary, 0.4)]),
      rb() * 30 - 15,
    ),
  ).join("");
  const dots = `<pattern id="${c.id}-dots" width="${W * 0.025}" height="${W * 0.025}" patternUnits="userSpaceOnUse"><circle cx="${W * 0.0125}" cy="${W * 0.0125}" r="${W * 0.005}" fill="${p.text}" opacity="0.5"/></pattern>`;
  return (
    `<defs>${dots}<filter id="${c.id}-drop"><feDropShadow dx="${W * 0.004}" dy="${W * 0.006}" stdDeviation="${W * 0.003}" flood-opacity="0.25"/></filter></defs>` +
    rect(0, 0, W, H, "#EFE7D6") +
    grain(c, 0.2) +
    scraps +
    part(circle(c.subject.cx, c.subject.cy, c.subject.s * 0.55, `url(#${c.id}-dots)`)) +
    subject(c, p.primary, `filter="url(#${c.id}-drop)"`)
  );
}

function neoBrutalism(c) {
  const { W, H, p, rb } = c;
  const ink = "#111111";
  const t = W * 0.012;
  const o = W * 0.02;
  const block = (x, y, w, h, fill) =>
    rect(x + o, y + o, w, h, ink) + rect(x, y, w, h, fill, `stroke="${ink}" stroke-width="${t}"`);
  return (
    rect(0, 0, W, H, lighten(p.accent, 0.55)) +
    block(W * 0.08, H * 0.1, W * 0.5, H * 0.18, p.primary) +
    block(W * (0.55 + rb() * 0.15), H * 0.62, W * 0.28, H * 0.2, p.secondary) +
    `<g transform="translate(${o} ${o})">${subject(c, ink)}</g>` +
    subject(c, p.accent, `stroke="${ink}" stroke-width="${t}" stroke-linejoin="miter"`) +
    rect(W * 0.12, H * 0.16, W * 0.3, H * 0.05, inkOn(p.primary), `rx="${t}"`)
  );
}

function gradient(c) {
  const { W, H, p, rb } = c;
  const orbs = [p.primary, p.accent, p.secondary, lighten(p.accent, 0.4)]
    .map((hex) =>
      circle(W * rb(), H * rb(), W * (0.3 + rb() * 0.25), hex, `filter="url(#${c.id}-mesh)" opacity="0.85"`),
    )
    .join("");
  return (
    `<defs>${blur(c, "mesh", W * 0.09)}</defs>` +
    rect(0, 0, W, H, mix(p.background, p.primary, 0.3)) +
    orbs +
    grain(c, 0.1)
  );
}

function retro(c) {
  const { W, H, p, rb } = c;
  const cx = W / 2;
  const cy = H * 0.62;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a0 = (Math.PI * i) / 16 - Math.PI;
    const a1 = (Math.PI * (i + 0.5)) / 16 - Math.PI;
    const R = Math.max(W, H) * 1.2;
    return `<path d="M${cx} ${cy} L${n(cx + Math.cos(a0) * R)} ${n(cy + Math.sin(a0) * R)} L${n(cx + Math.cos(a1) * R)} ${n(cy + Math.sin(a1) * R)} Z" fill="${lighten(p.accent, 0.35)}"/>`;
  }).join("");
  const stripes = [0, 1, 2, 3]
    .map((i) =>
      rect(0, cy + H * (0.02 + i * 0.07), W, H * 0.035, pick(rb, [p.primary, p.secondary, darken(p.accent, 0.2)])),
    )
    .join("");
  return (
    `<defs><clipPath id="${c.id}-sun"><circle cx="${cx}" cy="${cy}" r="${W * 0.26}"/></clipPath></defs>` +
    rect(0, 0, W, H, mix("#F6E7C8", p.background, 0.3)) +
    rays +
    `<g clip-path="url(#${c.id}-sun)">${rect(0, 0, W, H, p.accent)}${[0, 1, 2].map((i) => rect(0, cy - H * 0.02 + i * H * 0.05, W, H * (0.012 + i * 0.006), mix("#F6E7C8", p.background, 0.3))).join("")}</g>` +
    stripes +
    grain(c, 0.15)
  );
}

function swiss(c) {
  const { W, H, p, rb } = c;
  const cols = 6;
  const grid = Array.from({ length: cols + 1 }, (_, i) =>
    rect((W * i) / cols, 0, W * 0.001, H, lighten(p.text, 0.85)),
  ).join("");
  const big =
    rb() > 0.5
      ? circle(W * (0.55 + rb() * 0.2), H * 0.42, W * 0.3, p.accent)
      : rect(W * (0.5 + rb() * 0.15), H * 0.12, W * 0.36, H * 0.56, p.primary);
  return (
    rect(0, 0, W, H, p.background) +
    grid +
    big +
    rect(W / cols, H * 0.78, W * 0.5, H * 0.004, p.text) +
    rect(W / cols, H * 0.82, W * 0.3, H * 0.03, p.text, `rx="${H * 0.004}"`) +
    rect(W / cols, H * 0.87, W * 0.18, H * 0.02, lighten(p.text, 0.4), `rx="${H * 0.004}"`)
  );
}

const GENERATORS = Object.freeze({
  illustration: { flat, "line-art": lineArt, editorial, watercolor, isometric },
  "3d": { clay, glossy, "low-poly": lowPoly, toy },
  photo: { lifestyle, packshot, "flat-lay": flatLay, cinematic },
  graphic: { infographic, "big-number": bigNumber, quote, "before-after": beforeAfter },
  trend: { collage, "neo-brutalism": neoBrutalism, gradient, retro, swiss },
});

export function generatorFor(family, variant) {
  return GENERATORS[family]?.[variant] || flat;
}
