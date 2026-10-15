// Minimal DOM / template helpers. Intentionally tiny — all state is mock,
// all screens are render-on-navigate, so we don't need anything clever.

export function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape for HTML *text content* — the minimal & < > set. Use when the value
// lands between tags (not inside an attribute). null/undefined → "".
export function escapeText(value) {
  if (value == null) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Escape for an HTML *attribute value* — the full set, including quotes. This
// is the same coverage as escapeHtml, exported under an intent-revealing name.
export const escapeAttr = escapeHtml;

export function html(strings, ...values) {
  // Tiny tagged-template helper: interpolates values, escaping by default.
  // To skip escaping (for nested HTML fragments), wrap the value in raw(...).
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null || v === false) continue;
      if (Array.isArray(v)) {
        out += v.join("");
      } else if (typeof v === "object" && v && v.__raw) {
        out += v.value;
      } else {
        out += escapeHtml(v);
      }
    }
  }
  return out;
}

export function raw(value) {
  return { __raw: true, value: value == null ? "" : String(value) };
}

// A duration or a playhead as m:ss. Two readings of the same number, kept
// apart on purpose: a DURATION rounds (a 29.6s clip is "0:30"), a PLAYHEAD
// floors (it reads 0:29 until the 30th second has actually passed).
export function formatClock(seconds, { round = false } = {}) {
  const n = Number.isFinite(seconds) ? seconds : 0;
  const s = Math.max(0, round ? Math.round(n) : Math.floor(n));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// A `position: fixed` popover placed by JS from its trigger's rect can land past
// the edge of a phone screen. Call after setting left/top: shifts it back inside
// the viewport (an 8px gutter), and flips it above its anchor when it overflows
// the bottom. `anchorTop` = the trigger's rect.top, for the flip.
export function clampToViewport(el, anchorTop = null, gutter = 8) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.right > vw - gutter) el.style.left = `${Math.max(gutter, vw - gutter - r.width)}px`;
  if (r.left < gutter) el.style.left = `${gutter}px`;
  if (r.bottom > vh - gutter) {
    const above = anchorTop != null ? anchorTop - r.height - 4 : vh - gutter - r.height;
    el.style.top = `${Math.max(gutter, above)}px`;
  }
}
