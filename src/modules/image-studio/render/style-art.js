// Image Generator — the style ART: one hand-drawn picture per preset, the one
// that tells the style apart at a glance. Used for every style THUMBNAIL (the
// studio's picks, the gallery, the Styles page, the creator's sources); a TEST
// of a style on a subject still goes through render/visual.js.
//
// Each style shows the subject it is best at — a small world for Isometric,
// objects from above for Flat lay, a figure at dusk for Cinematic — because
// the styles are not variations of one treatment: an infographic and a
// lifestyle shot have nothing in common, and one shared mug hid exactly that.
// Every picture is drawn in the brand's palette (colours are CONTENT here).
//
// Pure: (variant, palette) → SVG markup, 400 × 400, no DOM. Rendered as an
// <img>, so ids never collide between thumbnails and only system fonts apply.

import { contrast, darken as D, lighten as L, mix as M } from "./palette.js?v=1791";

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const BLACK = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const ROUND = "'Arial Rounded MT Bold', 'Helvetica Rounded', 'Arial Black', sans-serif";

// Deterministic randomness for the few drawings that scatter things.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

/** The darker / lighter of two colours. */
const darker = (a, b) => (contrast(a, "#FFFFFF") >= contrast(b, "#FFFFFF") ? a : b);

function grainDef(id, amount = 0.35, freq = 0.9) {
  amount *= 0.45;
  freq = Math.max(freq, 1.3);
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount} 0"/>
  </filter>`;
}
const grainRect = (id) => `<rect width="400" height="400" filter="url(#${id})"/>`;

// ── Illustration ─────────────────────────────────────────────────────────────

function flat(p) {
  const sky = L(p.secondary, 0.72);
  const far = L(p.primary, 0.45);
  const mid = L(p.primary, 0.18);
  const near = p.primary;
  const tree = (x, y, s, c) =>
    `<rect x="${x - s * 0.06}" y="${y - s * 0.1}" width="${s * 0.12}" height="${s * 0.3}" fill="${D(c, 0.35)}"/>
     <polygon points="${pts([
       [x, y - s],
       [x + s * 0.34, y - s * 0.08],
       [x - s * 0.34, y - s * 0.08],
     ])}" fill="${c}"/>`;
  return `
    <rect width="400" height="400" fill="${sky}"/>
    <circle cx="292" cy="118" r="54" fill="${p.accent}"/>
    <rect x="54" y="84" width="74" height="16" rx="8" fill="#FFFFFF" opacity="0.9"/>
    <rect x="80" y="70" width="44" height="18" rx="9" fill="#FFFFFF" opacity="0.9"/>
    <polygon points="0,270 70,176 132,236 204,138 300,250 360,198 400,236 400,400 0,400" fill="${far}"/>
    <polygon points="160,172 204,138 232,170 214,164 198,180 184,168" fill="#FFFFFF" opacity="0.85"/>
    <path d="M0 300 C 80 262 150 270 214 292 S 340 300 400 268 L400 400 L0 400 Z" fill="${mid}"/>
    <path d="M0 338 C 100 312 190 322 260 338 S 360 346 400 330 L400 400 L0 400 Z" fill="${near}"/>
    <path d="M214 400 C 222 370 260 352 300 338" stroke="${L(p.accent, 0.35)}" stroke-width="14" fill="none" stroke-linecap="round"/>
    ${tree(70, 318, 70, D(p.primary, 0.1))}
    ${tree(104, 326, 50, L(p.primary, 0.08))}
    ${tree(348, 306, 60, D(p.primary, 0.1))}
    <rect x="252" y="262" width="54" height="40" fill="${p.background === "#FFFFFF" ? "#FFFFFF" : L(p.background, 0.3)}"/>
    <polygon points="246,264 279,236 312,264" fill="${p.accent}"/>
    <rect x="272" y="278" width="14" height="24" fill="${near}"/>`;
}

function lineArt(p) {
  const ink = darker(p.text, p.primary);
  const s = `stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return `
    <rect width="400" height="400" fill="${L(p.background, 0.4)}"/>
    <circle cx="238" cy="150" r="62" fill="${L(p.accent, 0.55)}"/>
    <!-- window -->
    <path d="M70 74 H 180 V 214" ${s} opacity="0.35"/>
    <!-- pot -->
    <path d="M150 330 L 162 262 H 246 L 258 330 Z" ${s}/>
    <path d="M156 276 H 252" ${s}/>
    <!-- stems and leaves, one stroke weight -->
    <path d="M204 262 C 204 220 196 184 176 150" ${s}/>
    <path d="M204 262 C 208 214 230 176 262 150" ${s}/>
    <path d="M204 262 C 204 230 206 200 208 116" ${s}/>
    <path d="M176 150 C 140 146 118 120 116 92 C 150 94 172 116 176 150 Z" ${s}/>
    <path d="M176 150 C 156 126 136 112 116 92" ${s} opacity="0.6"/>
    <path d="M262 150 C 262 116 288 94 318 90 C 318 122 294 146 262 150 Z" ${s}/>
    <path d="M262 150 C 280 126 298 108 318 90" ${s} opacity="0.6"/>
    <path d="M208 116 C 190 96 190 68 208 48 C 226 68 226 96 208 116 Z" ${s}/>
    <path d="M190 206 C 164 206 146 190 140 170 C 166 170 184 184 190 206 Z" ${s}/>
    <!-- table line + a cup -->
    <path d="M60 330 H 340" ${s}/>
    <path d="M278 330 V 300 H 318 V 318 C 318 326 312 330 304 330" ${s}/>
    <path d="M318 306 C 330 306 330 322 318 322" ${s}/>
    <path d="M290 290 C 284 280 296 274 290 264 M 304 290 C 298 280 310 274 304 264" ${s} opacity="0.7"/>`;
}

function editorial(p) {
  const paper = L(p.background, 0.25);
  const head = darker(p.primary, p.text);
  return `
    <defs>
      ${grainDef("g", 0.45, 1.1)}
      <clipPath id="hd"><path d="M118 400 L 118 330 C 90 318 84 292 92 270 L 70 250 L 94 232 C 86 206 92 150 132 118 C 170 88 238 84 280 110 C 322 136 336 190 322 236 C 312 268 290 290 290 330 L 290 400 Z"/></clipPath>
    </defs>
    <rect width="400" height="400" fill="${paper}"/>
    <rect x="0" y="0" width="400" height="400" fill="${p.accent}" opacity="0.14"/>
    <path d="M118 400 L 118 330 C 90 318 84 292 92 270 L 70 250 L 94 232 C 86 206 92 150 132 118 C 170 88 238 84 280 110 C 322 136 336 190 322 236 C 312 268 290 290 290 330 L 290 400 Z" fill="${head}"/>
    <g clip-path="url(#hd)">
      <rect x="140" y="120" width="170" height="150" fill="${L(p.secondary, 0.55)}"/>
      <circle cx="248" cy="170" r="30" fill="${p.accent}"/>
      <path d="M140 240 C 180 214 214 226 240 238 S 290 250 310 232 V 270 H 140 Z" fill="${L(p.primary, 0.3)}"/>
      <!-- a ladder climbing out of the head -->
      <g stroke="${paper}" stroke-width="4">
        <path d="M188 270 L 206 118 M 214 270 L 232 118"/>
        <path d="M192 240 H 216 M 196 208 H 220 M 200 176 H 224 M 204 144 H 228"/>
      </g>
    </g>
    <g stroke="${head}" stroke-width="4">
      <path d="M206 118 L 214 40 M 232 118 L 240 40"/>
      <path d="M208 96 H 234 M 210 72 H 236 M 212 50 H 238"/>
    </g>
    <path d="M300 64 q 10 -8 20 0 q 10 -8 20 0" stroke="${head}" stroke-width="3" fill="none"/>
    <path d="M326 94 q 7 -6 14 0 q 7 -6 14 0" stroke="${head}" stroke-width="3" fill="none"/>
    ${grainRect("g")}`;
}

function watercolor(p) {
  const paper = "#FBF8F2";
  const mul = 'style="mix-blend-mode:multiply"';
  // A wash: displaced edges, uneven pigment inside, pigment pooled at the rim.
  const wash = (d, c, o, filter = "w") => `<path d="${d}" fill="${c}" opacity="${o}" filter="url(#${filter})" ${mul}/>`;
  const washFilter = (id, scale, seed) => `
      <filter id="${id}" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="${seed}" result="t"/>
        <feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.9" result="d1"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="${seed + 5}" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.8 0 0 0 0.35" result="na"/>
        <feComposite in="d1" in2="na" operator="in" result="tex"/>
        <feMorphology in="d1" operator="erode" radius="3" result="er"/>
        <feGaussianBlur in="er" stdDeviation="3.5" result="erb"/>
        <feComposite in="d1" in2="erb" operator="out" result="edge"/>
        <feMerge><feMergeNode in="tex"/><feMergeNode in="edge"/></feMerge>
      </filter>`;
  const sky = L(p.secondary, 0.6);
  const hill1 = L(p.primary, 0.62);
  const hill2 = L(M(p.primary, p.secondary, 0.5), 0.45);
  const hill3 = L(p.primary, 0.3);
  return `
    <defs>
      ${washFilter("w", 30, 3)}
      ${washFilter("wb", 46, 11)}
      ${washFilter("w2", 14, 21)}
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" result="n"/>
        <feDiffuseLighting in="n" lighting-color="#FFFFFF" surfaceScale="0.9" result="l"><feDistantLight azimuth="45" elevation="62"/></feDiffuseLighting>
        <feColorMatrix in="l" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 -0.7 0.7"/>
      </filter>
    </defs>
    <rect width="400" height="400" fill="${paper}"/>
    ${wash("M20 60 C 90 30 170 70 240 40 C 300 20 360 50 390 80 C 380 150 360 190 380 230 C 280 250 150 220 20 240 C 30 180 10 120 20 60 Z", sky, 0.7, "wb")}
    ${wash("M200 70 C 260 60 330 80 350 120 C 330 150 260 160 220 150 C 190 130 180 90 200 70 Z", L(p.accent, 0.45), 0.55, "wb")}
    <circle cx="276" cy="118" r="36" fill="${p.accent}" opacity="0.85" filter="url(#w2)" ${mul}/>
    ${wash("M-10 240 C 60 190 130 186 196 232 C 256 190 330 186 410 226 L 410 300 C 300 290 100 300 -10 300 Z", hill1, 0.8)}
    ${wash("M-10 282 C 90 246 180 252 260 284 C 310 266 360 262 410 276 L 410 340 C 300 334 100 344 -10 340 Z", hill2, 0.85)}
    ${wash("M-10 322 C 120 300 250 306 410 318 L 410 420 L -10 420 Z", hill3, 0.8)}
    ${wash("M96 322 C 100 290 106 262 112 238 C 120 262 126 292 130 322 Z", D(p.primary, 0.15), 0.9, "w2")}
    ${wash("M138 326 C 142 300 146 280 150 262 C 156 280 162 302 166 326 Z", D(p.primary, 0.1), 0.8, "w2")}
    <g fill="${p.accent}" opacity="0.55" ${mul}>
      <circle cx="318" cy="300" r="3"/><circle cx="330" cy="290" r="1.6"/><circle cx="72" cy="96" r="2.4"/><circle cx="84" cy="112" r="1.4"/><circle cx="350" cy="190" r="2"/>
    </g>
    <path d="M110 110 q 8 -6 16 0 q 8 -6 16 0 M 140 132 q 6 -5 12 0 q 6 -5 12 0" stroke="${D(p.primary, 0.1)}" stroke-width="2" fill="none" opacity="0.55"/>
    <rect width="400" height="400" filter="url(#paper)" opacity="0.45"/>`;
}

// Isometric projection: x to the right-down, y to the left-down, z up.
function isoPt(x, y, z, S = 22, ox = 200, oy = 214) {
  return [ox + (x - y) * 0.866 * S, oy + (x + y) * 0.5 * S - z * S];
}
function isoBox(x, y, z, w, d, h, top, left, right) {
  const P = (a, b, c) => isoPt(a, b, c);
  return `
    <polygon points="${pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)])}" fill="${left}"/>
    <polygon points="${pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)])}" fill="${right}"/>
    <polygon points="${pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)])}" fill="${top}"/>`;
}
function isometric(p) {
  const ground = L(p.secondary, 0.35);
  const grass = M(p.secondary, "#6FBF73", 0.35);
  const wall = L(p.background === "#FFFFFF" ? "#EEF0F5" : p.background, 0.1);
  const roof = p.accent;
  const box = (x, y, z, w, d, h, c) => isoBox(x, y, z, w, d, h, L(c, 0.12), D(c, 0.12), D(c, 0.28));
  const tree = (x, y) => {
    const [bx, by] = isoPt(x, y, 1);
    return `<rect x="${bx - 3}" y="${by - 16}" width="6" height="16" fill="${D(p.primary, 0.2)}"/>
      <circle cx="${bx}" cy="${by - 30}" r="18" fill="${D(grass, 0.15)}"/><circle cx="${bx - 5}" cy="${by - 35}" r="9" fill="${L(grass, 0.2)}"/>`;
  };
  const windows = (() => {
    let out = "";
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const a = isoPt(3.4 + 0.1, 2.2 + j * 0.9 + 0.2, 1.6 + i * 1.1);
        const b = isoPt(3.4 + 0.1, 2.2 + j * 0.9 + 0.7, 1.6 + i * 1.1);
        const c = isoPt(3.4 + 0.1, 2.2 + j * 0.9 + 0.7, 2.2 + i * 1.1);
        const d = isoPt(3.4 + 0.1, 2.2 + j * 0.9 + 0.2, 2.2 + i * 1.1);
        out += `<polygon points="${pts([a, b, c, d])}" fill="${L(p.accent, 0.55)}"/>`;
      }
    return out;
  })();
  return `
    <rect width="400" height="400" fill="${L(p.primary, 0.88)}"/>
    <circle cx="200" cy="210" r="170" fill="${L(p.primary, 0.8)}"/>
    ${isoBox(-3, -3, -1.4, 8, 8, 1.4, grass, D(ground, 0.25), D(ground, 0.4))}
    ${isoBox(-3, 3.2, 0, 8, 1.2, 0.05, L(ground, 0.4), ground, ground)}
    ${tree(-2, -1.6)}
    ${tree(-2.2, 1.2)}
    ${box(-0.4, -2.2, 0, 2.6, 2.4, 1.6, wall)}
    ${isoBox(-0.4, -2.2, 1.6, 2.6, 2.4, 0.5, L(roof, 0.1), D(roof, 0.15), D(roof, 0.3))}
    ${box(1.2, 1.2, 0, 2.3, 2.6, 4.2, L(p.primary, 0.25))}
    ${windows}
    ${isoBox(1.2, 1.2, 4.2, 2.3, 2.6, 0.3, p.accent, D(p.accent, 0.2), D(p.accent, 0.35))}
    ${tree(4, -2)}
    ${(() => {
      const [x, y] = isoPt(-1.4, 3.6, 0.35);
      return `<rect x="${x - 14}" y="${y - 10}" width="28" height="12" rx="3" fill="${p.accent}"/><circle cx="${x - 8}" cy="${y + 3}" r="3" fill="${p.text}"/><circle cx="${x + 8}" cy="${y + 3}" r="3" fill="${p.text}"/>`;
    })()}
    <ellipse cx="96" cy="84" rx="30" ry="10" fill="#FFFFFF" opacity="0.85"/>
    <ellipse cx="310" cy="64" rx="22" ry="8" fill="#FFFFFF" opacity="0.85"/>`;
}

// ── 3D ───────────────────────────────────────────────────────────────────────

function clay(p) {
  const bg = L(p.accent, 0.78);
  const ball = (id, c) =>
    `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${L(c, 0.35)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${D(c, 0.3)}"/></radialGradient>`;
  return `
    <defs>
      ${ball("a", L(p.accent, 0.1))}
      ${ball("b", L(p.primary, 0.35))}
      ${ball("c", L(p.secondary, 0.35))}
      ${ball("d", "#FFFFFF")}
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
      ${grainDef("g", 0.12, 1.4)}
      <radialGradient id="bgv" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="${L(bg, 0.4)}"/><stop offset="1" stop-color="${D(bg, 0.06)}"/></radialGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bgv)"/>
    <ellipse cx="200" cy="340" rx="150" ry="22" fill="${D(bg, 0.3)}" opacity="0.5" filter="url(#soft)"/>
    <!-- a squishy pill -->
    <rect x="70" y="250" width="160" height="80" rx="40" fill="url(#b)"/>
    <!-- a ball -->
    <circle cx="290" cy="280" r="54" fill="url(#a)"/>
    <!-- a cloud on top -->
    <g>
      <circle cx="140" cy="200" r="46" fill="url(#d)"/>
      <circle cx="196" cy="180" r="58" fill="url(#d)"/>
      <circle cx="250" cy="206" r="40" fill="url(#d)"/>
      <rect x="112" y="200" width="160" height="46" rx="23" fill="url(#d)"/>
    </g>
    <!-- a small donut -->
    <circle cx="96" cy="118" r="30" fill="url(#c)"/>
    <circle cx="96" cy="118" r="11" fill="${D(bg, 0.12)}"/>
    <circle cx="310" cy="110" r="16" fill="url(#a)"/>
    <!-- a face: clay is friendly -->
    <circle cx="180" cy="198" r="5" fill="${D(p.text, 0.1)}"/>
    <circle cx="214" cy="198" r="5" fill="${D(p.text, 0.1)}"/>
    <path d="M186 214 q 11 10 22 0" stroke="${D(p.text, 0.1)}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="166" cy="212" rx="8" ry="5" fill="${L(p.accent, 0.3)}" opacity="0.8"/>
    <ellipse cx="228" cy="212" rx="8" ry="5" fill="${L(p.accent, 0.3)}" opacity="0.8"/>
    ${grainRect("g")}`;
}

function glossy(p) {
  const body = p.accent;
  return `
    <defs>
      <radialGradient id="bg" cx="0.5" cy="0.4" r="0.75"><stop offset="0" stop-color="${L(darker(p.primary, p.text), 0.18)}"/><stop offset="1" stop-color="${D(darker(p.primary, p.text), 0.55)}"/></radialGradient>
      <linearGradient id="bd" x1="0" x2="1">
        <stop offset="0" stop-color="${D(body, 0.55)}"/>
        <stop offset="0.14" stop-color="${D(body, 0.2)}"/>
        <stop offset="0.22" stop-color="${L(body, 0.75)}"/>
        <stop offset="0.27" stop-color="${L(body, 0.2)}"/>
        <stop offset="0.6" stop-color="${body}"/>
        <stop offset="0.82" stop-color="${D(body, 0.35)}"/>
        <stop offset="0.9" stop-color="${L(body, 0.35)}"/>
        <stop offset="1" stop-color="${D(body, 0.5)}"/>
      </linearGradient>
      <linearGradient id="cap" x1="0" x2="1">
        <stop offset="0" stop-color="#1A1A1A"/><stop offset="0.22" stop-color="#8A8A8A"/><stop offset="0.3" stop-color="#2A2A2A"/><stop offset="0.8" stop-color="#111"/><stop offset="0.9" stop-color="#666"/><stop offset="1" stop-color="#111"/>
      </linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF" stop-opacity="0.35"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></linearGradient>
      <mask id="rm"><rect x="0" y="318" width="400" height="90" fill="url(#fade)"/></mask>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
    </defs>
    <rect width="400" height="400" fill="url(#bg)"/>
    <ellipse cx="200" cy="170" rx="120" ry="140" fill="${body}" opacity="0.28" filter="url(#glow)"/>
    <rect x="0" y="318" width="400" height="82" fill="#000" opacity="0.35"/>
    <!-- bottle -->
    <g id="bottle">
      <rect x="150" y="118" width="100" height="200" rx="22" fill="url(#bd)"/>
      <rect x="176" y="72" width="48" height="52" rx="6" fill="url(#cap)"/>
      <rect x="170" y="116" width="60" height="10" rx="3" fill="#0D0D0D"/>
      <rect x="166" y="200" width="68" height="3" fill="#FFFFFF" opacity="0.7"/>
      <rect x="166" y="210" width="40" height="3" fill="#FFFFFF" opacity="0.45"/>
      <rect x="170" y="134" width="7" height="166" rx="3.5" fill="#FFFFFF" opacity="0.55"/>
    </g>
    <g mask="url(#rm)"><g transform="translate(0 636) scale(1 -1)">
      <rect x="150" y="118" width="100" height="200" rx="22" fill="url(#bd)"/>
    </g></g>
    <!-- sharp studio highlights -->
    <path d="M40 0 L 70 0 L 20 400 L 0 400 Z" fill="#FFFFFF" opacity="0.05"/>
    <path d="M340 0 L 352 0 L 330 400 L 322 400 Z" fill="#FFFFFF" opacity="0.08"/>`;
}

function lowPoly(p) {
  const r = rng(7);
  const sky1 = L(p.accent, 0.35);
  const sky2 = L(p.secondary, 0.4);
  const shade = (c) => (r() > 0.5 ? L(c, r() * 0.25) : D(c, r() * 0.25));
  let out = "";
  // Sky: large facets.
  const skyPts = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) skyPts.push([i * 100 + (j % 2 ? 50 : 0) - 25, j * 90]);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++) {
      const a = [i * 100 + (j % 2 ? 50 : 0) - 25, j * 90];
      const b = [a[0] + 100, a[1]];
      const c = [a[0] + (j % 2 ? -50 : 50), a[1] + 90];
      const d = [c[0] + 100, c[1]];
      const t = j / 3;
      out += `<polygon points="${pts([a, b, c])}" fill="${shade(M(sky1, sky2, t))}"/>`;
      out += `<polygon points="${pts([b, d, c])}" fill="${shade(M(sky1, sky2, t + 0.15))}"/>`;
    }
  // Sun, faceted.
  const sun = [];
  for (let k = 0; k < 8; k++)
    sun.push([290 + 44 * Math.cos((k * Math.PI) / 4), 110 + 44 * Math.sin((k * Math.PI) / 4)]);
  for (let k = 0; k < 8; k++)
    out += `<polygon points="${pts([[290, 110], sun[k], sun[(k + 1) % 8]])}" fill="${k % 2 ? L(p.accent, 0.15) : p.accent}"/>`;
  // Mountains: a ridge of triangles, lit from the left.
  const peak = (x, y, w, c) => {
    const base = 340;
    const mid = [x + w * 0.05, y + (base - y) * 0.45];
    return `<polygon points="${pts([[x - w / 2, base], [x, y], mid])}" fill="${L(c, 0.18)}"/>
      <polygon points="${pts([[x, y], [x + w / 2, base], mid])}" fill="${D(c, 0.22)}"/>
      <polygon points="${pts([[x - w / 2, base], mid, [x + w / 2, base]])}" fill="${c}"/>
      <polygon points="${pts([
        [x, y],
        [x - w * 0.09, y + (base - y) * 0.2],
        [x + w * 0.05, y + (base - y) * 0.16],
      ])}" fill="#FFFFFF" opacity="0.9"/>`;
  };
  out += peak(90, 150, 260, L(p.primary, 0.3));
  out += peak(310, 170, 240, L(p.primary, 0.2));
  out += peak(200, 110, 300, p.primary);
  // Ground facets.
  for (let i = 0; i < 8; i++) {
    const x = i * 50;
    out += `<polygon points="${pts([
      [x, 340],
      [x + 50, 340],
      [x + 25, 400],
    ])}" fill="${shade(D(p.secondary, 0.2))}"/>`;
    out += `<polygon points="${pts([
      [x + 50, 340],
      [x + 75, 400],
      [x + 25, 400],
    ])}" fill="${shade(D(p.secondary, 0.3))}"/>`;
  }
  return `<rect width="400" height="400" fill="${sky1}"/>${out}`;
}

function toy(p) {
  const body = p.accent;
  const trim = L(p.primary, 0.1);
  const bg = L(p.secondary, 0.7);
  return `
    <defs>
      <radialGradient id="hd" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="${L(body, 0.45)}"/><stop offset="0.6" stop-color="${body}"/><stop offset="1" stop-color="${D(body, 0.28)}"/></radialGradient>
      <radialGradient id="bd" cx="0.35" cy="0.25" r="0.9"><stop offset="0" stop-color="${L(trim, 0.35)}"/><stop offset="0.6" stop-color="${trim}"/><stop offset="1" stop-color="${D(trim, 0.3)}"/></radialGradient>
      <linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L(p.primary, 0.85)}"/><stop offset="1" stop-color="${L(p.primary, 0.6)}"/></linearGradient>
      <filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    <rect width="400" height="400" fill="${bg}"/>
    <circle cx="70" cy="70" r="16" fill="#FFFFFF" opacity="0.6"/>
    <circle cx="340" cy="120" r="10" fill="#FFFFFF" opacity="0.6"/>
    <!-- plinth -->
    <ellipse cx="200" cy="344" rx="120" ry="26" fill="${D(p.primary, 0.1)}" opacity="0.35" filter="url(#sh)"/>
    <path d="M90 318 V 336 A 110 22 0 0 0 310 336 V 318 Z" fill="${L(p.primary, 0.5)}"/>
    <ellipse cx="200" cy="318" rx="110" ry="22" fill="url(#pl)"/>
    <!-- legs + body -->
    <rect x="168" y="270" width="26" height="50" rx="13" fill="url(#bd)"/>
    <rect x="206" y="270" width="26" height="50" rx="13" fill="url(#bd)"/>
    <rect x="146" y="206" width="108" height="86" rx="40" fill="url(#hd)"/>
    <rect x="118" y="216" width="30" height="54" rx="15" fill="url(#hd)" transform="rotate(18 133 243)"/>
    <rect x="252" y="200" width="30" height="54" rx="15" fill="url(#hd)" transform="rotate(-30 267 227)"/>
    <!-- head, oversized -->
    <rect x="112" y="72" width="176" height="150" rx="66" fill="url(#hd)"/>
    <rect x="136" y="104" width="128" height="86" rx="40" fill="${L(p.background === "#FFFFFF" ? "#FFF6EC" : p.background, 0.4)}"/>
    <ellipse cx="174" cy="146" rx="14" ry="18" fill="#1B1B1F"/>
    <ellipse cx="226" cy="146" rx="14" ry="18" fill="#1B1B1F"/>
    <circle cx="179" cy="139" r="5" fill="#FFFFFF"/>
    <circle cx="231" cy="139" r="5" fill="#FFFFFF"/>
    <path d="M190 172 q 10 8 20 0" stroke="#1B1B1F" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- antenna -->
    <rect x="196" y="40" width="8" height="36" rx="4" fill="${trim}"/>
    <circle cx="200" cy="38" r="14" fill="url(#bd)"/>
    <!-- vinyl sheen -->
    <path d="M132 110 C 136 90 156 80 176 80" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.6"/>`;
}

// ── Photo ────────────────────────────────────────────────────────────────────

function lifestyle(p) {
  const warm = M(L(p.accent, 0.35), "#E9C9A0", 0.5);
  const wood = M("#8A5A3C", p.primary, 0.15);
  const mug = L(p.background === "#FFFFFF" ? "#F3EFE8" : p.background, 0.2);
  return `
    <defs>
      <linearGradient id="room" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L(warm, 0.55)}"/><stop offset="1" stop-color="${D(warm, 0.05)}"/></linearGradient>
      <filter id="bk" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="bk2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
      <linearGradient id="tbl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L(wood, 0.15)}"/><stop offset="1" stop-color="${D(wood, 0.35)}"/></linearGradient>
      <linearGradient id="mg" x1="0" x2="1"><stop offset="0" stop-color="${D(mug, 0.18)}"/><stop offset="0.35" stop-color="${L(mug, 0.3)}"/><stop offset="1" stop-color="${D(mug, 0.3)}"/></linearGradient>
      <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6E0" stop-opacity="0.75"/><stop offset="1" stop-color="#FFF6E0" stop-opacity="0"/></linearGradient>
      <radialGradient id="vig" cx="0.55" cy="0.45" r="0.8"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></radialGradient>
      <linearGradient id="beam" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3D6" stop-opacity="0.7"/><stop offset="1" stop-color="#FFF3D6" stop-opacity="0"/></linearGradient>
      ${grainDef("g", 0.22, 1.2)}
    </defs>
    <rect width="400" height="400" fill="url(#room)"/>
    <!-- out of focus: a window, a plant, warm lights -->
    <g filter="url(#bk)">
      <rect x="220" y="-10" width="200" height="230" fill="#FFF8E8" opacity="0.8"/>
      <rect x="310" y="-10" width="10" height="230" fill="${D(warm, 0.3)}"/>
      <ellipse cx="80" cy="120" rx="60" ry="90" fill="${M("#4E7A4F", p.secondary, 0.3)}"/>
      <ellipse cx="40" cy="170" rx="40" ry="60" fill="${D(M("#4E7A4F", p.secondary, 0.3), 0.2)}"/>
    </g>
    <g filter="url(#bk2)" opacity="0.85">
      <circle cx="170" cy="60" r="16" fill="#FFE7B8"/><circle cx="200" cy="96" r="10" fill="#FFE7B8"/>
      <circle cx="140" cy="130" r="12" fill="#FFE7B8" opacity="0.7"/><circle cx="360" cy="240" r="14" fill="#FFF2D4"/>
    </g>
    <!-- table, in focus -->
    <path d="M0 260 L 400 238 L 400 400 L 0 400 Z" fill="url(#tbl)"/>
    <path d="M0 290 L 400 268 M 0 330 L 400 308 M 0 372 L 400 350" stroke="${D(wood, 0.25)}" stroke-width="1.5" opacity="0.4"/>
    <!-- notebook + pen -->
    <polygon points="40,318 172,300 190,368 56,392" fill="#F7F4EE"/>
    <polygon points="40,318 172,300 174,306 42,324" fill="${p.primary}"/>
    <path d="M70 344 L 160 332 M 72 356 L 150 346 M 74 368 L 140 360" stroke="${L(p.text, 0.5)}" stroke-width="2" opacity="0.5"/>
    <rect x="110" y="376" width="96" height="6" rx="3" fill="${p.accent}" transform="rotate(-12 158 379)"/>
    <!-- the mug: the sharp subject -->
    <ellipse cx="282" cy="338" rx="62" ry="12" fill="#000" opacity="0.28" filter="url(#bk2)"/>
    <path d="M232 250 H 332 V 318 C 332 336 314 344 282 344 C 250 344 232 336 232 318 Z" fill="url(#mg)"/>
    <path d="M332 266 C 362 266 362 310 330 310" stroke="${D(mug, 0.2)}" stroke-width="10" fill="none"/>
    <ellipse cx="282" cy="250" rx="50" ry="10" fill="${D(mug, 0.1)}"/>
    <ellipse cx="282" cy="252" rx="44" ry="7" fill="#5A3A26"/>
    <rect x="232" y="286" width="100" height="18" fill="${p.accent}" opacity="0.85"/>
    <path d="M268 236 C 258 216 280 204 270 184 M 292 236 C 282 214 304 204 294 180" stroke="#FFFFFF" stroke-width="4" fill="none" opacity="0.45" filter="url(#bk2)"/>
    <polygon points="250,0 400,0 400,120 120,400 20,400" fill="url(#beam)" opacity="0.55"/>
    <rect width="400" height="400" fill="url(#light)" opacity="0.6"/>
    <rect width="400" height="400" fill="url(#vig)"/>
    ${grainRect("g")}`;
}

function packshot(p) {
  const jar = p.primary;
  return `
    <defs>
      <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.62" stop-color="#F1F2F4"/><stop offset="1" stop-color="#E2E4E8"/></linearGradient>
      <radialGradient id="spot" cx="0.5" cy="0.3" r="0.6"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
      <linearGradient id="jb" x1="0" x2="1">
        <stop offset="0" stop-color="${D(jar, 0.35)}"/><stop offset="0.18" stop-color="${L(jar, 0.25)}"/><stop offset="0.5" stop-color="${jar}"/><stop offset="0.85" stop-color="${D(jar, 0.25)}"/><stop offset="1" stop-color="${D(jar, 0.4)}"/>
      </linearGradient>
      <linearGradient id="lid" x1="0" x2="1">
        <stop offset="0" stop-color="#C9CCD3"/><stop offset="0.2" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#E4E6EA"/><stop offset="1" stop-color="#A9ADB6"/>
      </linearGradient>
      <filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <linearGradient id="rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF" stop-opacity="0.22"/><stop offset="0.6" stop-color="#FFF" stop-opacity="0"/></linearGradient>
      <mask id="rm"><rect x="0" y="312" width="400" height="80" fill="url(#rf)"/></mask>
    </defs>
    <rect width="400" height="400" fill="url(#sweep)"/>
    <rect width="400" height="400" fill="url(#spot)"/>
    <ellipse cx="200" cy="314" rx="92" ry="10" fill="#000" opacity="0.28" filter="url(#sh)"/>
    <ellipse cx="200" cy="312" rx="66" ry="4" fill="#000" opacity="0.4" filter="url(#sh)"/>
    <!-- the jar -->
    <rect x="130" y="170" width="140" height="142" rx="18" fill="url(#jb)"/>
    <rect x="124" y="126" width="152" height="54" rx="10" fill="url(#lid)"/>
    <rect x="124" y="170" width="152" height="6" fill="#000" opacity="0.08"/>
    <rect x="150" y="214" width="100" height="62" rx="4" fill="#FFFFFF" opacity="0.94"/>
    <rect x="164" y="228" width="44" height="6" rx="3" fill="${p.accent}"/>
    <rect x="164" y="242" width="72" height="4" rx="2" fill="${L(p.text, 0.3)}"/>
    <rect x="164" y="252" width="56" height="4" rx="2" fill="${L(p.text, 0.5)}"/>
    <rect x="142" y="180" width="8" height="122" rx="4" fill="#FFFFFF" opacity="0.35"/>
    <g mask="url(#rm)"><rect x="130" y="312" width="140" height="80" rx="18" fill="url(#jb)"/></g>`;
}

function flatLay(p) {
  const surface = L(p.secondary, 0.62);
  const sh = `filter="url(#sh)"`;
  return `
    <defs>
      <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="4" dy="7" stdDeviation="6" flood-color="#000" flood-opacity="0.22"/></filter>
      ${grainDef("g", 0.1, 1.3)}
    </defs>
    <rect width="400" height="400" fill="${surface}"/>
    <!-- notebook -->
    <g ${sh} transform="rotate(-8 140 170)">
      <rect x="54" y="72" width="172" height="220" rx="8" fill="${p.primary}"/>
      <rect x="196" y="72" width="8" height="220" fill="${D(p.primary, 0.3)}"/>
      <rect x="86" y="120" width="80" height="10" rx="5" fill="${L(p.primary, 0.4)}"/>
    </g>
    <!-- coffee from above -->
    <g ${sh}>
      <circle cx="300" cy="104" r="54" fill="#FFFFFF"/>
      <circle cx="300" cy="104" r="40" fill="#F4F1EC"/>
      <circle cx="300" cy="104" r="31" fill="#6B4430"/>
      <path d="M288 98 C 296 90 310 94 308 104 C 306 112 294 114 292 106" stroke="#E8CFAE" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="348" y="96" width="30" height="16" rx="8" fill="#FFFFFF"/>
    </g>
    <!-- phone -->
    <g ${sh} transform="rotate(12 300 270)">
      <rect x="262" y="198" width="82" height="152" rx="14" fill="#1B1D22"/>
      <rect x="268" y="206" width="70" height="136" rx="9" fill="${L(p.accent, 0.2)}"/>
      <circle cx="303" cy="262" r="20" fill="#FFFFFF" opacity="0.85"/>
    </g>
    <!-- pen, glasses, leaf -->
    <rect ${sh} x="64" y="318" width="150" height="10" rx="5" fill="${p.accent}" transform="rotate(-18 140 323)"/>
    <g ${sh} fill="none" stroke="#1B1D22" stroke-width="5">
      <circle cx="198" cy="342" r="20"/><circle cx="246" cy="350" r="20"/><path d="M217 344 C 222 338 226 340 227 346"/>
    </g>
    <g ${sh}>
      <path d="M232 22 C 268 30 282 64 270 96 C 238 88 222 56 232 22 Z" fill="${M("#4E8A55", p.secondary, 0.25)}"/>
      <path d="M232 22 C 244 50 256 74 270 96" stroke="${D(M("#4E8A55", p.secondary, 0.25), 0.3)}" stroke-width="2" fill="none"/>
    </g>
    ${grainRect("g")}`;
}

function cinematic(p) {
  const sky1 = D(darker(p.primary, p.text), 0.2);
  const sky2 = M(p.accent, "#FF8A3D", 0.3);
  const teal = M(p.secondary, "#1F5C66", 0.55);
  return `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="0.62" stop-color="${M(sky1, sky2, 0.6)}"/><stop offset="0.78" stop-color="${sky2}"/></linearGradient>
      <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${D(teal, 0.2)}"/><stop offset="1" stop-color="${D(teal, 0.6)}"/></linearGradient>
      <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFF4D6"/><stop offset="0.3" stop-color="${L(sky2, 0.4)}"/><stop offset="1" stop-color="${sky2}" stop-opacity="0"/></radialGradient>
      <linearGradient id="flare" x1="0" x2="1"><stop offset="0" stop-color="#9FD8FF" stop-opacity="0"/><stop offset="0.5" stop-color="#CFEBFF" stop-opacity="0.8"/><stop offset="1" stop-color="#9FD8FF" stop-opacity="0"/></linearGradient>
      ${grainDef("g", 0.3, 1)}
    </defs>
    <rect width="400" height="400" fill="url(#sky)"/>
    <circle cx="250" cy="236" r="110" fill="url(#sun)"/>
    <circle cx="250" cy="238" r="22" fill="#FFF4D6"/>
    <!-- distant hills -->
    <path d="M0 250 C 60 232 120 240 170 248 S 300 232 400 246 V 270 H 0 Z" fill="${D(teal, 0.35)}"/>
    <!-- the road to the vanishing point -->
    <path d="M0 262 H 400 V 400 H 0 Z" fill="url(#road)"/>
    <path d="M150 400 L 244 262 L 256 262 L 330 400 Z" fill="${D(teal, 0.1)}"/>
    <path d="M249 268 L 249 274 M 248 286 L 247 298 M 245 316 L 243 340 M 240 366 L 236 400" stroke="#F4E3B8" stroke-width="3" opacity="0.8"/>
    <!-- a lone figure and its long shadow -->
    <path d="M214 300 L 206 400 L 194 400 Z" fill="#000" opacity="0.35"/>
    <g fill="#0B0D12">
      <circle cx="214" cy="266" r="6"/>
      <path d="M208 274 H 220 L 222 300 H 206 Z"/>
      <path d="M208 298 L 204 318 H 209 L 213 300 M 216 300 L 219 318 H 224 L 220 298 Z"/>
    </g>
    <rect x="0" y="232" width="400" height="10" fill="url(#flare)"/>
    ${grainRect("g")}
    <!-- 2.39:1 letterbox -->
    <rect width="400" height="68" fill="#000"/>
    <rect y="332" width="400" height="68" fill="#000"/>`;
}

// ── Graphic ──────────────────────────────────────────────────────────────────

function infographic(p) {
  const ink = darker(p.text, p.primary);
  const bars = [0.42, 0.58, 0.5, 0.74, 0.92];
  const barFill = (i) => (i === bars.length - 1 ? p.accent : L(p.primary, 0.15 + (4 - i) * 0.1));
  let chart = "";
  bars.forEach((v, i) => {
    const x = 44 + i * 44;
    const h = v * 170;
    chart += `<rect x="${x}" y="${330 - h}" width="30" height="${h}" rx="4" fill="${barFill(i)}"/>`;
    chart += `<text x="${x + 15}" y="350" font-size="11" font-family="${SANS}" fill="${L(ink, 0.3)}" text-anchor="middle">Q${i + 1}</text>`;
  });
  const donut = (cx, cy, r, v, c) => {
    const C = 2 * Math.PI * r;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${L(p.primary, 0.82)}" stroke-width="14"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="14" stroke-dasharray="${f(C * v)} ${f(C)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
  };
  return `
    <rect width="400" height="400" fill="${L(p.background, 0.2)}"/>
    <text x="36" y="58" font-size="22" font-weight="700" font-family="${SANS}" fill="${ink}">Reach, by quarter</text>
    <text x="36" y="80" font-size="12" font-family="${SANS}" fill="${L(ink, 0.35)}">Posts published · 2026</text>
    <g stroke="${L(ink, 0.82)}" stroke-width="1">
      <path d="M36 330 H 264 M 36 287 H 264 M 36 245 H 264 M 36 202 H 264 M 36 160 H 264"/>
    </g>
    ${chart}
    <path d="M59 ${330 - 0.42 * 170 - 16} L 103 ${330 - 0.58 * 170 - 16} L 147 ${330 - 0.5 * 170 - 16} L 191 ${330 - 0.74 * 170 - 16} L 235 ${330 - 0.92 * 170 - 16}" stroke="${ink}" stroke-width="2.5" fill="none" stroke-dasharray="1 6" stroke-linecap="round"/>
    <rect x="200" y="${330 - 0.92 * 170 - 52}" width="70" height="26" rx="13" fill="${ink}"/>
    <text x="235" y="${330 - 0.92 * 170 - 34}" font-size="13" font-weight="700" font-family="${SANS}" fill="#FFFFFF" text-anchor="middle">+38%</text>
    ${donut(330, 150, 38, 0.68, p.accent)}
    <text x="330" y="156" font-size="18" font-weight="700" font-family="${SANS}" fill="${ink}" text-anchor="middle">68%</text>
    <text x="330" y="210" font-size="11" font-family="${SANS}" fill="${L(ink, 0.35)}" text-anchor="middle">engaged</text>
    ${donut(330, 280, 38, 0.34, L(p.primary, 0.2))}
    <text x="330" y="286" font-size="18" font-weight="700" font-family="${SANS}" fill="${ink}" text-anchor="middle">34%</text>
    <text x="330" y="340" font-size="11" font-family="${SANS}" fill="${L(ink, 0.35)}" text-anchor="middle">shared</text>`;
}

function bigNumber(p) {
  const bg = darker(p.primary, p.text);
  const ink = contrast(bg, p.accent) >= 3 ? p.accent : "#FFFFFF";
  return `
    <rect width="400" height="400" fill="${bg}"/>
    <circle cx="360" cy="40" r="120" fill="${L(bg, 0.08)}"/>
    <text x="30" y="84" font-size="15" font-weight="700" font-family="${SANS}" fill="#FFFFFF" opacity="0.7" letter-spacing="0.5">Q2 report</text>
    <text x="18" y="262" font-size="196" font-weight="900" font-family="${BLACK}" fill="${ink}" letter-spacing="-10">3×</text>
    <rect x="32" y="296" width="64" height="7" fill="${ink}"/>
    <text x="32" y="336" font-size="20" font-weight="700" font-family="${SANS}" fill="#FFFFFF">more replies when a post</text>
    <text x="32" y="362" font-size="20" font-weight="700" font-family="${SANS}" fill="#FFFFFF">asks a real question</text>`;
}

function quote(p) {
  const bg = L(p.background === "#FFFFFF" ? "#F7F3EC" : p.background, 0.1);
  const ink = darker(p.text, p.primary);
  return `
    <rect width="400" height="400" fill="${bg}"/>
    <text x="28" y="168" font-size="220" font-family="${SERIF}" fill="${p.accent}">“</text>
    <text font-family="${SERIF}" font-style="italic" font-size="34" fill="${ink}">
      <tspan x="40" y="198">The best plans</tspan>
      <tspan x="40" y="240">name the one signal</tspan>
      <tspan x="40" y="282">they will watch.</tspan>
    </text>
    <rect x="40" y="316" width="36" height="3" fill="${p.accent}"/>
    <text x="88" y="322" font-size="14" font-weight="700" font-family="${SANS}" fill="${ink}">Maya Chen</text>
    <text x="88" y="340" font-size="12" font-family="${SANS}" fill="${L(ink, 0.35)}">Head of Content</text>`;
}

function beforeAfter(p) {
  const r = rng(11);
  let mess = "";
  for (let i = 0; i < 14; i++) {
    const x = 20 + r() * 150;
    const y = 90 + r() * 240;
    const w = 20 + r() * 50;
    mess += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(8 + r() * 20)}" fill="#A5A9B1" opacity="${f(0.4 + r() * 0.4)}" transform="rotate(${f((r() - 0.5) * 40)} ${f(x)} ${f(y)})"/>`;
  }
  return `
    <rect width="200" height="400" fill="#D9DBDF"/>
    ${mess}
    <path d="M30 300 C 60 260 90 330 120 280 S 170 300 180 250" stroke="#7D828C" stroke-width="3" fill="none"/>
    <rect x="200" width="200" height="400" fill="${L(p.accent, 0.8)}"/>
    <rect x="230" y="96" width="140" height="92" rx="10" fill="#FFFFFF"/>
    <rect x="246" y="112" width="56" height="8" rx="4" fill="${p.primary}"/>
    <rect x="246" y="130" width="100" height="6" rx="3" fill="${L(p.primary, 0.6)}"/>
    <rect x="246" y="144" width="82" height="6" rx="3" fill="${L(p.primary, 0.6)}"/>
    <rect x="246" y="162" width="40" height="14" rx="7" fill="${p.accent}"/>
    <rect x="232" y="218" width="30" height="100" rx="4" fill="${L(p.primary, 0.35)}"/>
    <rect x="272" y="190" width="30" height="128" rx="4" fill="${L(p.primary, 0.15)}"/>
    <rect x="312" y="150" width="30" height="168" rx="4" fill="${p.accent}"/>
    <rect x="198" width="4" height="400" fill="#FFFFFF"/>
    <circle cx="200" cy="200" r="22" fill="#FFFFFF"/>
    <path d="M192 192 L 184 200 L 192 208 M 208 192 L 216 200 L 208 208" stroke="${darker(p.text, p.primary)}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="20" y="24" width="72" height="26" rx="13" fill="#FFFFFF" opacity="0.85"/>
    <text x="56" y="42" font-size="13" font-weight="700" font-family="${SANS}" fill="#555A63" text-anchor="middle">Before</text>
    <rect x="308" y="24" width="72" height="26" rx="13" fill="${darker(p.text, p.primary)}"/>
    <text x="344" y="42" font-size="13" font-weight="700" font-family="${SANS}" fill="#FFFFFF" text-anchor="middle">After</text>`;
}

// ── Trends ───────────────────────────────────────────────────────────────────

function collage(p) {
  const r = rng(5);
  const torn = (x, y, w, h, n = 18) => {
    const top = [];
    const bot = [];
    for (let i = 0; i <= n; i++) {
      top.push([x + (w * i) / n, y + (r() - 0.5) * 8]);
      bot.push([x + w - (w * i) / n, y + h + (r() - 0.5) * 8]);
    }
    return pts([...top, ...bot]);
  };
  return `
    <defs>
      <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="5" stdDeviation="3" flood-opacity="0.25"/></filter>
      <pattern id="ht" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="2.6" fill="${D(p.primary, 0.2)}"/></pattern>
      <clipPath id="face"><circle cx="220" cy="180" r="92"/></clipPath>
      ${grainDef("g", 0.25, 0.9)}
    </defs>
    <rect width="400" height="400" fill="#EDE6D8"/>
    <polygon points="${torn(-10, 40, 250, 150)}" fill="${L(p.accent, 0.25)}" filter="url(#sh)" transform="rotate(-6 120 110)"/>
    <polygon points="${torn(170, 220, 250, 160)}" fill="${L(p.secondary, 0.3)}" filter="url(#sh)" transform="rotate(5 290 300)"/>
    <!-- a halftone cut-out -->
    <g filter="url(#sh)">
      <circle cx="220" cy="180" r="96" fill="#FFFFFF"/>
      <g clip-path="url(#face)">
        <rect x="120" y="80" width="200" height="200" fill="${L(p.primary, 0.75)}"/>
        <rect x="120" y="80" width="200" height="200" fill="url(#ht)" opacity="0.8"/>
        <path d="M180 290 C 180 240 196 224 220 224 C 244 224 262 240 262 290 Z" fill="${D(p.primary, 0.1)}"/>
        <circle cx="220" cy="178" r="40" fill="${D(p.primary, 0.1)}"/>
      </g>
    </g>
    <!-- type scraps -->
    <g filter="url(#sh)" transform="rotate(-4 90 300)">
      <rect x="30" y="276" width="150" height="46" fill="${darker(p.text, p.primary)}"/>
      <text x="44" y="310" font-size="30" font-weight="900" font-family="${BLACK}" fill="#FFFFFF">MAKE</text>
    </g>
    <g filter="url(#sh)" transform="rotate(6 110 350)">
      <rect x="60" y="330" width="120" height="40" fill="#FFFFFF"/>
      <text x="70" y="360" font-size="28" font-style="italic" font-family="${SERIF}" fill="${p.accent}">noise</text>
    </g>
    <!-- tape + sticker + a scribble -->
    <rect x="160" y="70" width="80" height="22" fill="#F4E9B8" opacity="0.8" transform="rotate(-18 200 81)"/>
    <rect x="300" y="236" width="70" height="20" fill="#F4E9B8" opacity="0.8" transform="rotate(24 335 246)"/>
    <polygon points="${pts(Array.from({ length: 10 }, (_, i) => [340 + Math.cos((i * Math.PI) / 5 - Math.PI / 2) * (i % 2 ? 14 : 32), 90 + Math.sin((i * Math.PI) / 5 - Math.PI / 2) * (i % 2 ? 14 : 32)]))}" fill="${p.accent}" filter="url(#sh)"/>
    <path d="M40 210 C 70 190 90 230 120 206 S 150 190 160 214" stroke="${p.accent}" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${grainRect("g")}`;
}

function neoBrutalism(p) {
  const K = "#111111";
  const bg = L(p.accent, 0.55);
  const card = (x, y, w, h, fill, rx = 10) =>
    `<rect x="${x + 8}" y="${y + 8}" width="${w}" height="${h}" rx="${rx}" fill="${K}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${K}" stroke-width="4"/>`;
  return `
    <rect width="400" height="400" fill="${bg}"/>
    <g stroke="${K}" stroke-width="1" opacity="0.15">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 40} 0 V 400 M 0 ${i * 40} H 400"/>`).join("")}</g>
    ${card(40, 60, 260, 170, "#FFFFFF")}
    <rect x="40" y="60" width="260" height="34" rx="10" fill="${L(p.secondary, 0.4)}" stroke="${K}" stroke-width="4"/>
    <circle cx="62" cy="77" r="6" fill="#FF5A5F" stroke="${K}" stroke-width="2.5"/>
    <circle cx="82" cy="77" r="6" fill="#FFC53D" stroke="${K}" stroke-width="2.5"/>
    <circle cx="102" cy="77" r="6" fill="#3DD68C" stroke="${K}" stroke-width="2.5"/>
    <text x="62" y="152" font-size="42" font-weight="900" font-family="${BLACK}" fill="${K}">LOUD</text>
    <text x="62" y="196" font-size="42" font-weight="900" font-family="${BLACK}" fill="${p.primary}">&amp; CLEAR</text>
    ${card(60, 272, 180, 58, p.accent, 29)}
    <text x="150" y="309" font-size="20" font-weight="900" font-family="${BLACK}" fill="${K}" text-anchor="middle">SIGN UP →</text>
    <g transform="translate(318 280)">
      <polygon points="${pts(Array.from({ length: 16 }, (_, i) => [8 + Math.cos((i * Math.PI) / 8) * (i % 2 ? 36 : 56), 8 + Math.sin((i * Math.PI) / 8) * (i % 2 ? 36 : 56)]))}" fill="${K}"/>
      <polygon points="${pts(Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8) * (i % 2 ? 36 : 56), Math.sin((i * Math.PI) / 8) * (i % 2 ? 36 : 56)]))}" fill="${L(p.primary, 0.5)}" stroke="${K}" stroke-width="4"/>
      <text x="0" y="8" font-size="20" font-weight="900" font-family="${BLACK}" fill="${K}" text-anchor="middle">NEW</text>
    </g>
    <g transform="translate(334 110)">
      <circle cx="6" cy="6" r="36" fill="${K}"/><circle r="36" fill="#FFE14D" stroke="${K}" stroke-width="4"/>
      <circle cx="-12" cy="-6" r="4.5" fill="${K}"/><circle cx="12" cy="-6" r="4.5" fill="${K}"/>
      <path d="M-16 10 Q 0 26 16 10" stroke="${K}" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>`;
}

function gradient(p) {
  const base = D(darker(p.primary, p.text), 0.25);
  return `
    <defs>
      <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
      <radialGradient id="glass" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.2"/></radialGradient>
      ${grainDef("g", 0.28, 0.85)}
    </defs>
    <rect width="400" height="400" fill="${base}"/>
    <g filter="url(#b)">
      <circle cx="110" cy="120" r="140" fill="${p.accent}"/>
      <circle cx="320" cy="140" r="120" fill="${L(p.secondary, 0.25)}"/>
      <circle cx="240" cy="330" r="150" fill="${L(p.primary, 0.35)}"/>
      <circle cx="60" cy="360" r="90" fill="${M(p.accent, "#FF4FA3", 0.45)}"/>
    </g>
    <circle cx="228" cy="196" r="92" fill="url(#glass)"/>
    <circle cx="228" cy="196" r="92" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="1.5"/>
    <ellipse cx="196" cy="150" rx="34" ry="16" fill="#FFFFFF" opacity="0.35" transform="rotate(-30 196 150)"/>
    ${grainRect("g")}`;
}

function retro(p) {
  const bg = M("#F3E1C0", L(p.accent, 0.6), 0.3);
  const a = p.accent;
  const b = M(p.accent, "#C8502E", 0.5);
  const c = darker(p.primary, p.text);
  let rays = "";
  for (let i = 0; i < 18; i++) {
    if (i % 2) continue;
    const a0 = Math.PI + (i * Math.PI) / 18;
    const a1 = Math.PI + ((i + 1) * Math.PI) / 18;
    rays += `<polygon points="${pts([
      [200, 300],
      [200 + Math.cos(a0) * 420, 300 + Math.sin(a0) * 420],
      [200 + Math.cos(a1) * 420, 300 + Math.sin(a1) * 420],
    ])}" fill="${L(a, 0.45)}" opacity="0.55"/>`;
  }
  const band = (r0, w, col) =>
    `<path d="M${200 - r0} 300 A ${r0} ${r0} 0 0 1 ${200 + r0} 300 L ${200 + r0 - w} 300 A ${r0 - w} ${r0 - w} 0 0 0 ${200 - r0 + w} 300 Z" fill="${col}"/>`;
  return `
    <defs>
      <clipPath id="sunc"><circle cx="200" cy="232" r="70"/></clipPath>
      ${grainDef("g", 0.2, 1)}
    </defs>
    <rect width="400" height="400" fill="${bg}"/>
    ${rays}
    ${band(190, 22, c)}
    ${band(168, 22, b)}
    ${band(146, 22, a)}
    ${band(124, 22, L(a, 0.35))}
    <g clip-path="url(#sunc)">
      <rect x="120" y="150" width="160" height="160" fill="#FFD27A"/>
      <rect x="120" y="248" width="160" height="6" fill="${bg}"/>
      <rect x="120" y="262" width="160" height="8" fill="${bg}"/>
      <rect x="120" y="278" width="160" height="10" fill="${bg}"/>
    </g>
    <rect x="0" y="300" width="400" height="100" fill="${c}"/>
    <text x="200" y="358" font-size="40" font-weight="900" font-family="${ROUND}" fill="${bg}" text-anchor="middle" letter-spacing="1">good days</text>
    <path d="M60 376 H 340" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
    ${grainRect("g")}`;
}

function swiss(p) {
  const ink = darker(p.text, p.primary);
  const bg = "#F4F3EF";
  return `
    <rect width="400" height="400" fill="${bg}"/>
    <g stroke="${ink}" stroke-width="0.6" opacity="0.18">
      <path d="M40 0 V 400 M 120 0 V 400 M 200 0 V 400 M 280 0 V 400 M 360 0 V 400 M 0 40 H 400 M 0 200 H 400 M 0 360 H 400"/>
    </g>
    <circle cx="240" cy="200" r="120" fill="${p.accent}"/>
    <rect x="40" y="200" width="160" height="160" fill="${ink}"/>
    <text x="40" y="66" font-size="30" font-weight="700" font-family="${SANS}" fill="${ink}" letter-spacing="-1">Form</text>
    <text x="40" y="96" font-size="30" font-weight="700" font-family="${SANS}" fill="${ink}" letter-spacing="-1">follows</text>
    <text x="40" y="126" font-size="30" font-weight="700" font-family="${SANS}" fill="${ink}" letter-spacing="-1">function.</text>
    <text x="280" y="378" font-size="10" font-family="${SANS}" fill="${ink}">No. 04 — 2026</text>
    <text x="56" y="344" font-size="10" font-family="${SANS}" fill="${bg}">Grid, type, air.</text>`;
}

const ART = Object.freeze({
  flat,
  "line-art": lineArt,
  editorial,
  watercolor,
  isometric,
  clay,
  glossy,
  "low-poly": lowPoly,
  toy,
  lifestyle,
  packshot,
  "flat-lay": flatLay,
  cinematic,
  infographic,
  "big-number": bigNumber,
  quote,
  "before-after": beforeAfter,
  collage,
  "neo-brutalism": neoBrutalism,
  gradient,
  retro,
  swiss,
});

export const hasStyleArt = (variant) => Object.prototype.hasOwnProperty.call(ART, variant);

/** The style's picture for `variant`, in palette `p` (render/palette.js resolvePalette). */
export function styleArtSvg(variant, p) {
  const draw = ART[variant] || ART.flat;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="600" height="600">${draw(p)}</svg>`;
}
