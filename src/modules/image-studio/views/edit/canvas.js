// Image Generator — Edit mode: what sits ON the image. The Image Studio's edit
// canvas (components/image-studio-v2/edit-view.js), rebuilt over layers: the
// same markup and the same classes — `.isv2-frame`, `.image-studio__overlay*`,
// `__text-toolbar`, `__tt-*`, `__popover*`, `__swatch*`, `__font-*`, `__slider-*`,
// `__crop-*` — so styles/screens/image-studio-canvas.css and image-studio-v2.css
// draw it exactly as they draw the studio's. Only the hooks differ
// (`data-imst-*`): the module owns its behaviour.
//
// What changed is what the overlays ARE. The studio had one flattened picture
// and text/logo floating over it; here every layer but the base is an overlay —
// the subject lifted off the background too — in the document's order, so the
// DOM order IS the stacking order.
//
// ⚠️ Three class families are built by concatenation, as in the studio:
// `__crop-handle--{nw,ne,sw,se}`, `__popover--{kind}`, `__tt-{kind}`.

import { html, raw } from "../../lib/html.js?v=1814";
import { EDIT_FONTS, TEXT_COLORS, outlineMetrics, shadowMetrics, textFamily } from "../../config/edit.js?v=1814";
import { isBase, layerName } from "../../state/edit-doc.js?v=1814";

// ── The frame ───────────────────────────────────────────────────────────────

/** The base through its crop window: sized so the window fills the frame. */
function baseImage(layer) {
  if (!layer || layer.hidden) return "";
  const c = layer.crop;
  const style = `width:${100 / c.w}%;height:${100 / c.h}%;left:${(-c.x / c.w) * 100}%;top:${(-c.y / c.h) * 100}%;`;
  return html`<img class="imst-edit-base" src="${layer.url}" alt="" draggable="false" style="${style}" />`;
}

export function editFrame(ui, doc, { network, shapes, busy }) {
  const base = doc.layers.find(isBase);
  const ratio = doc.w / doc.h;
  const crop = ui.crop && !busy ? cropRect(ui, network, shapes) : "";
  return html`<div
    class="isv2-frame isv2-frame--edit${base?.hidden ? " imst-edit-frame--nobase" : ""}"
    style="--isv2-ratio:${ratio}"
    data-imst-frame
  >
    <div class="isv2-frame-clip">${baseImage(base)}</div>
    ${overlayLayer(ui, doc)}${crop}${busy
      ? html`<div class="isv2-busy"><span class="ap-loader size-30"></span><span>${busy}</span></div>`
      : ""}
  </div>`;
}

// ── Crop ────────────────────────────────────────────────────────────────────

function cropRect(ui, network, shapes) {
  const r = ui.crop.rect;
  const style = `left:${r.xF * 100}%; top:${r.yF * 100}%; width:${r.wF * 100}%; height:${r.hF * 100}%;`;
  return html`<div class="image-studio__crop-layer" data-imst-crop-layer>
      <div class="image-studio__croprect" data-imst-croprect style="${style}">
        ${["nw", "ne", "sw", "se"].map(
          (c) =>
            html`<span
              class="image-studio__crop-handle image-studio__crop-handle--${c}"
              data-imst-crop-handle="${c}"
              aria-hidden="true"
            ></span>`,
        )}
      </div>
    </div>
    ${cropToolbar(ui, network, shapes)}`;
}

// The Image Studio's toolbar under the box: "Best for", the ratios, ✕ / ✓ — the
// ratios are the draft network's own shapes (config/formats.js), not the
// studio's clip formats.
function cropToolbar(ui, network, shapes) {
  const r = ui.crop.rect;
  const style = `left:${(r.xF + r.wF / 2) * 100}%; top:${(r.yF + r.hF) * 100}%;`;
  const sep = html`<span class="image-studio__crop-sep" aria-hidden="true"></span>`;
  const chip = (id, label, ratio, on) =>
    html`<button
      type="button"
      class="image-studio__crop-aspect${ratio ? "" : " image-studio__crop-aspect--free"}${on ? " is-selected" : ""}"
      data-imst-crop-aspect="${id}"
      aria-pressed="${on}"
    >
      <span
        class="image-studio__crop-aspect-glyph"
        style="${ratio ? `aspect-ratio:${ratio}` : ""}"
        aria-hidden="true"
      ></span
      ><span>${label}</span>
    </button>`;
  const chips = [
    chip("free", "Freeform", null, !ui.crop.aspect),
    ...shapes.map((s) => chip(s.id, s.label, s.w / s.h, ui.crop.aspect === s.id)),
  ];
  return html`<div class="image-studio__crop-toolbar" style="${style}" role="toolbar" aria-label="Crop">
    ${network
      ? html`<span class="image-studio__crop-bestfor" aria-label="Best for ${network.label}"
            >Best for <i class="${network.icon}" title="${network.label}" aria-hidden="true"></i></span
          >${sep}`
      : ""}
    <div class="image-studio__crop-aspects">${chips.map((c, i) => (i ? [sep, c] : c))}</div>
    ${sep}
    <div class="image-studio__crop-actions">
      <button type="button" class="ap-icon-button" data-imst-crop-cancel title="Cancel" aria-label="Cancel">
        <i class="ap-icon-close" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="ap-icon-button image-studio__crop-apply"
        data-imst-crop-apply
        title="Apply crop"
        aria-label="Apply crop"
      >
        <i class="ap-icon-check" aria-hidden="true"></i>
      </button>
    </div>
  </div>`;
}

// ── Overlays: every layer above the base ─────────────────────────────────────

// Two containers, and the stacking still follows the document. The Image
// Studio unclipped its whole overlay layer while something was selected, so the
// selected element and its chrome stayed grabbable past the edge — fine for a
// logo, not for a subject that covers the image: every layer spilled out. Here
// only the SELECTED layer sits in the unclipped container (`has-selection`),
// the rest stay clipped to the image; neither container makes a stacking
// context of their own — the stack around them is the one — so each overlay's z-index (its place in the document) still decides
// what covers what across the two.
function overlayLayer(ui, doc) {
  const layers = doc.layers.filter((l) => !isBase(l) && !l.hidden);
  if (!layers.length) return "";
  const z = (l) => doc.layers.indexOf(l);
  const sel = layers.find((l) => l.id === ui.selectedId);
  return html`<div class="imst-edit-stack">
    <div class="image-studio__overlay-layer imst-edit-overlays">
      ${layers.filter((l) => l !== sel).map((l) => renderOverlay(l, ui, z(l)))}
    </div>
    <div class="image-studio__overlay-layer imst-edit-overlays has-selection" data-imst-overlay-layer>
      ${sel ? renderOverlay(sel, ui, z(sel)) : ""}
    </div>
  </div>`;
}

/** The text's inline style — shared with the patches in editor.js. */
export function textStyle(l) {
  const sm = shadowMetrics(l.shadowIntensity);
  const om = outlineMetrics(l.outlineWidth);
  return (
    `color:${l.color || "#FFFFFF"}; font-family:${textFamily(l.fontFamily)};` +
    ` font-size:${l.sizeF * 100}cqh; font-weight:${l.bold ? 700 : 400}; font-style:${l.italic ? "italic" : "normal"};` +
    // A headline laid out in a box wraps inside it, like the generator drew it.
    (l.boxWF
      ? ` white-space:normal; width:${l.boxWF * 100}cqw; text-align:${l.align || "left"}; line-height:${l.band ? 1.2 : 1.05};`
      : "") +
    (l.outline ? ` -webkit-text-stroke:${om.emStroke}em ${l.outlineColor || "#0A1B33"}; paint-order:stroke;` : "") +
    (l.shadow ? ` text-shadow:0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha});` : "")
  );
}

function renderOverlay(l, ui, z) {
  const selected = l.id === ui.selectedId;
  const editing = l.id === ui.editingId;
  const text = l.kind === "text";
  const base = `left:${l.xF * 100}%; top:${l.yF * 100}%; z-index:${z}; transform:translate(-50%,-50%) rotate(${l.rot || 0}rad);`;
  const style = text ? base : `${base} width:${l.wF * 100}%;`;
  const handles = l.locked
    ? ""
    : html`<span class="image-studio__overlay-rotate" data-imst-overlay-rotate title="Rotate" aria-hidden="true"
          ><i class="ap-icon-refresh"></i></span
        >${Math.abs(l.rot || 0) > 0.001
          ? html`<button
              type="button"
              class="image-studio__overlay-rotate-reset"
              data-imst-overlay-rotate-reset="${l.id}"
              title="Reset rotation"
              aria-label="Reset rotation"
            >
              <i class="ap-icon-reset" aria-hidden="true"></i>
            </button>`
          : ""}
        <span class="image-studio__overlay-resize" data-imst-overlay-resize title="Resize" aria-hidden="true"></span>`;
  let inner;
  let chrome;
  if (!text) {
    inner = html`<img src="${l.url}" alt="" draggable="false" />`;
    chrome = l.locked
      ? ""
      : html`<button
            type="button"
            class="image-studio__overlay-delete"
            data-imst-layer-delete="${l.id}"
            aria-label="Delete ${layerName(l)}"
          >
            <i class="ap-icon-close" aria-hidden="true"></i></button
          >${handles}`;
  } else {
    const words =
      l.band && l.bandColor
        ? html`<span class="imst-layer__band" style="background:${l.bandColor}">${l.text}</span>`
        : l.text;
    inner = html`<span
      class="image-studio__overlay-text"
      data-imst-overlay-text
      ${editing
        ? raw(`contenteditable="true" role="textbox" aria-multiline="false" aria-label="Text layer" spellcheck="false"`)
        : ""}
      style="${textStyle(l)}"
      >${words}</span
    >`;
    chrome = l.locked ? "" : html`${textToolbar(l, ui, selected)}${handles}`;
  }
  const cls = `image-studio__overlay${text ? " is-text" : ""}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}${l.locked ? " is-locked" : ""}`;
  return html`<div
    class="${cls}"
    data-imst-layer="${l.id}"
    tabindex="0"
    role="button"
    aria-label="${layerName(l)}"
    style="${style}"
  >
    ${inner}${chrome}
  </div>`;
}

// ── The text mini toolbar ─────────────────────────────────────────────────────

function textToolbar(l, ui, selected) {
  const open = (name) => selected && ui.popover === name;
  const fontLabel = l.fontFamily ? EDIT_FONTS.find((f) => f.family === l.fontFamily)?.label || l.fontFamily : "Default";
  const sep = html`<span class="image-studio__tt-sep" aria-hidden="true"></span>`;
  const anchored = (btn, pop) => html`<span class="isv2-tt-anchor">${btn}${pop}</span>`;
  return html`<div class="image-studio__text-toolbar" data-imst-text-toolbar>
    ${anchored(
      html`<button
        type="button"
        class="image-studio__tt-btn"
        data-imst-popover-toggle="textColor"
        aria-haspopup="true"
        aria-expanded="${open("textColor")}"
        aria-label="Text colour"
      >
        <span class="image-studio__tt-swatch" style="--sw:${l.color || "#FFFFFF"}"></span><span>Colour</span>
      </button>`,
      open("textColor") ? textColorPopover(l, ui) : "",
    )}
    ${sep}
    ${anchored(
      html`<button
        type="button"
        class="image-studio__tt-btn image-studio__tt-font"
        data-imst-popover-toggle="textFont"
        aria-haspopup="true"
        aria-expanded="${open("textFont")}"
        title="Font — ${fontLabel}"
        aria-label="Font"
      >
        <span class="image-studio__tt-aa" aria-hidden="true">Aa</span>
      </button>`,
      open("textFont") ? textFontPopover(l, ui) : "",
    )}
    <button
      type="button"
      class="image-studio__tt-btn image-studio__tt-bold"
      data-imst-text-bold
      aria-pressed="${!!l.bold}"
    >
      Bold
    </button>
    <button
      type="button"
      class="image-studio__tt-btn image-studio__tt-italic"
      data-imst-text-italic
      aria-pressed="${!!l.italic}"
    >
      Italic
    </button>
    ${sep}
    ${anchored(
      html`<button
        type="button"
        class="image-studio__tt-btn image-studio__tt-outline${l.outline ? " is-on" : ""}"
        data-imst-popover-toggle="textOutline"
        aria-haspopup="true"
        aria-expanded="${open("textOutline")}"
        title="Outline"
      >
        <span class="image-studio__tt-swatch" style="--sw:${l.outlineColor || "#0A1B33"}"></span><span>Outline</span>
      </button>`,
      open("textOutline") ? textOutlinePopover(l, ui) : "",
    )}
    ${anchored(
      html`<button
        type="button"
        class="image-studio__tt-btn image-studio__tt-shadow${l.shadow ? " is-on" : ""}"
        data-imst-popover-toggle="textShadow"
        aria-haspopup="true"
        aria-expanded="${open("textShadow")}"
        title="Shadow"
      >
        <span class="image-studio__tt-shadowdot" aria-hidden="true"></span><span>Shadow</span>
      </button>`,
      open("textShadow") ? textShadowPopover(l) : "",
    )}
    ${sep}
    <button
      type="button"
      class="ap-icon-button image-studio__tt-del"
      data-imst-layer-delete="${l.id}"
      aria-label="Delete text"
    >
      <i class="ap-icon-trash" aria-hidden="true"></i>
    </button>
  </div>`;
}

// The Playbook's colours in their own framed group, then the defaults, the
// custom colours and the "add" picker (the Image Studio's swatchGrid).
function swatchGrid({ ui, selected, applyAttr, pickAttr, pickLabel }) {
  const sel = (selected || "").toUpperCase();
  const seen = new Set();
  const dedupe = (list) =>
    (list || []).map((c) => (c || "").toUpperCase()).filter((c) => c && !seen.has(c) && seen.add(c));
  const brand = dedupe(ui.brandColors);
  const others = dedupe([...TEXT_COLORS, ...ui.customColors]);
  const swatch = (c) =>
    html`<button
      type="button"
      class="image-studio__swatch${sel === c ? " is-selected" : ""}"
      ${raw(`${applyAttr}="${c}"`)}
      style="--sw:${c}"
      aria-label="${c}"
    ></button>`;
  return html`${brand.length
      ? html`<div class="image-studio__color-group">
          <p class="image-studio__color-label">${ui.brandName ? `Brand (${ui.brandName})` : "Brand"}</p>
          <span class="image-studio__swatches">${brand.map(swatch)}</span>
        </div>`
      : ""}
    <div class="image-studio__color-group">
      ${brand.length ? html`<p class="image-studio__color-label">More</p>` : ""}
      <span class="image-studio__swatches"
        >${others.map(swatch)}<label class="image-studio__swatch image-studio__swatch--add" title="${pickLabel}"
          ><input type="color" ${raw(pickAttr)} aria-label="${pickLabel}" /><i
            class="ap-icon-plus"
            aria-hidden="true"
          ></i></label
      ></span>
    </div>`;
}

function textColorPopover(l, ui) {
  return html`<div
    class="image-studio__popover image-studio__popover--textcolor"
    data-imst-popover
    role="menu"
    aria-label="Text colour"
  >
    <div class="image-studio__popover-head"><p class="image-studio__popover-title">Colour</p></div>
    <div class="image-studio__popover-body">
      ${swatchGrid({
        ui,
        selected: l.color,
        applyAttr: "data-imst-text-color",
        pickAttr: "data-imst-text-colorpick",
        pickLabel: "Add text colour",
      })}
    </div>
  </div>`;
}

const fxToggle = (attr, on, label) =>
  html`<label class="ap-toggle-container image-studio__fx-toggle" title="${label}"
    ><input type="checkbox" ${raw(attr)} ${on ? "checked" : ""} aria-label="${label}" /><i aria-hidden="true"></i
  ></label>`;

function textOutlinePopover(l, ui) {
  const on = !!l.outline;
  const w = l.outlineWidth ?? 50;
  return html`<div
    class="image-studio__popover image-studio__popover--textcolor image-studio__popover--outline${on ? "" : " is-off"}"
    data-imst-popover
    role="menu"
    aria-label="Outline"
  >
    <div class="image-studio__popover-head">
      <p class="image-studio__popover-title">Outline</p>
      ${fxToggle("data-imst-outline-toggle", on, "Toggle outline")}
    </div>
    <div class="image-studio__popover-body">
      <div class="image-studio__slider-row">
        <input
          type="range"
          class="ap-slider"
          min="0"
          max="100"
          step="1"
          value="${w}"
          data-imst-outline-width
          aria-label="Outline thickness"
          style="--fill:${w}%"
          ${on ? "" : "disabled"}
        />
        <span class="image-studio__slider-val" data-imst-outline-val>${w}</span>
      </div>
      ${swatchGrid({
        ui,
        selected: l.outlineColor,
        applyAttr: "data-imst-outline-color",
        pickAttr: "data-imst-outline-colorpick",
        pickLabel: "Add outline colour",
      })}
    </div>
  </div>`;
}

function textShadowPopover(l) {
  const on = !!l.shadow;
  const val = l.shadowIntensity ?? 55;
  return html`<div
    class="image-studio__popover image-studio__popover--shadow${on ? "" : " is-off"}"
    data-imst-popover
    role="menu"
    aria-label="Shadow"
  >
    <div class="image-studio__popover-head">
      <p class="image-studio__popover-title">Shadow</p>
      ${fxToggle("data-imst-shadow-toggle", on, "Toggle shadow")}
    </div>
    <div class="image-studio__popover-body">
      <div class="image-studio__slider-row">
        <input
          type="range"
          class="ap-slider"
          min="0"
          max="100"
          step="1"
          value="${val}"
          data-imst-shadow-intensity
          aria-label="Shadow intensity"
          style="--fill:${val}%"
          ${on ? "" : "disabled"}
        />
        <span class="image-studio__slider-val" data-imst-shadow-val>${val}</span>
      </div>
    </div>
  </div>`;
}

// The Image Studio's font list — with the Playbook's own faces first, since the
// generator sets the headline in them.
function textFontPopover(l, ui) {
  const cur = l.fontFamily || null;
  const brand = ui.brandFonts.filter((f) => !EDIT_FONTS.some((x) => x.family === f));
  const rows = [...brand.map((f) => ({ family: f, label: f })), ...EDIT_FONTS];
  return html`<div
    class="image-studio__popover image-studio__popover--font"
    data-imst-popover
    role="menu"
    aria-label="Font"
  >
    <div class="image-studio__popover-head"><p class="image-studio__popover-title">Font</p></div>
    <div class="image-studio__popover-body">
      <div class="image-studio__font-list">
        ${rows.map((f) => {
          const on = (f.family || null) === cur;
          return html`<button
            type="button"
            class="image-studio__font-row${on ? " is-selected" : ""}"
            data-imst-font="${f.family || ""}"
            role="menuitemradio"
            aria-checked="${on}"
          >
            <span class="image-studio__font-name" style="font-family:${textFamily(f.family)}">${f.label}</span>
            ${on ? html`<i class="ap-icon-check image-studio__font-check" aria-hidden="true"></i>` : ""}
          </button>`;
        })}
      </div>
    </div>
  </div>`;
}
