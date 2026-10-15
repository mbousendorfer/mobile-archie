// Image Generator — Edit mode: the chrome around the image.
//
//   left    the Image Studio's tool palette (tools-view.js): Crop · Add text ·
//           Add image, and its one sheet — same classes, same order
//   right   the LAYERS — the one piece the studio never had. It sits on the
//           right edge the stage already reserves (`.isv2-stage-body.has-palette`
//           pads both sides the same, so the image stays on the centre line):
//           top layer first, as every layered editor lists them; a row selects,
//           its eye hides, its lock pins; the selected layer moves up or down
//   bottom  the studio's composer, "Describe a change…" → Redraw — which now
//           redraws ONE layer: the selected picture layer, or both picture
//           layers with nothing (or a text) selected. The text and the logo are
//           never redrawn: that is what having layers buys.

import { html } from "../../lib/html.js?v=1796";
import { IMAGE_PRESETS } from "../../config/edit.js?v=1796";
import { LAYER_ICONS, isBase, layerName } from "../../state/edit-doc.js?v=1796";

// ── Tool palette (left) ─────────────────────────────────────────────────────

function toolRow({ label, icon, hook, active = false, disabled = false, sheet = null, open = false }) {
  const btn = html`<button
    type="button"
    class="ap-button ghost grey"
    ${hook}
    ${sheet ? html`aria-haspopup="true" aria-expanded="${open}"` : ""}
    aria-pressed="${active}"
    ${disabled ? "disabled" : ""}
  >
    <i class="${icon}" aria-hidden="true"></i><span>${label}</span>
  </button>`;
  if (!sheet) return btn;
  return html`<div class="image-studio__palette-anchor">${btn}${open && !disabled ? sheet() : ""}</div>`;
}

export function toolPalette(ui, { busy, brandLogos }) {
  return html`<div class="image-studio__palette" role="toolbar" aria-label="Edit tools">
    ${toolRow({
      label: "Crop",
      icon: "ap-icon-cropper",
      hook: html`data-imst-crop-start`,
      active: !!ui.crop,
      disabled: busy,
    })}
    ${toolRow({ label: "Add text", icon: "ap-icon-closed-captions", hook: html`data-imst-add-text`, disabled: busy })}
    ${toolRow({
      label: "Add image",
      icon: "ap-icon-file--image",
      hook: html`data-imst-popover-toggle="logo"`,
      disabled: busy,
      open: ui.popover === "logo",
      sheet: () => logoSheet(ui, brandLogos),
    })}
  </div>`;
}

// The Playbook's marks FIRST, every variant (the studio's playbookMark), then
// Upload, then the stamps. Tiles carry an index, not the url: a logo may be a
// data URL, and an attribute is no place for one.
function logoSheet(ui, brandLogos) {
  const who = ui.brandName || "Playbook";
  return html`<div class="isv2-sheet" data-imst-popover role="dialog" aria-label="Add an image">
    <p class="isv2-sheet-title">Add an image</p>
    <div class="isv2-sheet-body">
      ${brandLogos.length
        ? html`<p class="isv2-sheet-label">From your Playbook</p>
            <div class="image-studio__presets">
              ${brandLogos.map(
                (l, i) =>
                  html`<button
                    type="button"
                    class="image-studio__preset"
                    data-imst-logo-playbook="${i}"
                    title="${who} — ${l.label || "Logo"}"
                  >
                    <img src="${l.url}" alt="${who} — ${l.label || "Logo"}" />
                  </button>`,
              )}
            </div>
            <span class="isv2-sheet-divider" role="separator"></span>`
        : ""}
      <button type="button" class="ap-button stroked grey image-studio__logo-upload" data-imst-logo-upload>
        <i class="ap-icon-upload" aria-hidden="true"></i><span>Upload an image</span>
      </button>
      <span class="isv2-sheet-divider" role="separator"></span>
      <div class="image-studio__presets">
        ${IMAGE_PRESETS.map(
          (p, i) =>
            html`<button type="button" class="image-studio__preset" data-imst-logo-preset="${i}" title="${p.label}">
              <img src="${p.url}" alt="${p.label}" loading="lazy" />
            </button>`,
        )}
      </div>
    </div>
  </div>`;
}

// ── Layers (right) ──────────────────────────────────────────────────────────

export function layersPanel(ui, doc, { busy }) {
  const rows = [...doc.layers].reverse();
  const sel = doc.layers.find((l) => l.id === ui.selectedId) || null;
  const index = sel ? doc.layers.indexOf(sel) : -1;
  const canUp = sel && !isBase(sel) && index < doc.layers.length - 1;
  const canDown = sel && !isBase(sel) && index > 1;
  return html`<section class="imst-layers" aria-label="Layers">
    <p class="imst-layers__title"><i class="ap-icon-stack" aria-hidden="true"></i><span>Layers</span></p>
    <ul class="imst-layers__list" role="listbox" aria-label="Layers" data-imst-layers>
      ${rows.map((l) => {
        const on = l.id === ui.selectedId;
        const name = layerName(l);
        return html`<li
          class="imst-layers__row${on ? " is-selected" : ""}${l.hidden ? " is-hidden" : ""}"
          role="option"
          aria-selected="${on}"
          tabindex="${on ? "0" : "-1"}"
          data-imst-layer-row="${l.id}"
        >
          <span class="imst-layers__thumb${l.kind === "text" ? " imst-layers__thumb--text" : ""}" aria-hidden="true"
            >${l.url ? html`<img src="${l.url}" alt="" />` : html`<i class="${LAYER_ICONS[l.kind]}"></i>`}</span
          >
          <span class="imst-layers__name">${name}</span>
          <button
            type="button"
            class="ap-icon-button transparent grey"
            data-imst-layer-hide="${l.id}"
            aria-pressed="${!!l.hidden}"
            aria-label="${l.hidden ? `Show ${name}` : `Hide ${name}`}"
            data-tooltip="${l.hidden ? "Show" : "Hide"}"
            ${busy ? "disabled" : ""}
          >
            <i class="${l.hidden ? "ap-icon-eye-off" : "ap-icon-eye-on"}" aria-hidden="true"></i>
          </button>
          ${isBase(l)
            ? html`<span class="imst-layers__pin" aria-label="Always at the bottom" data-tooltip="Always at the bottom"
                ><i class="ap-icon-lock-on" aria-hidden="true"></i
              ></span>`
            : html`<button
                type="button"
                class="ap-icon-button transparent grey"
                data-imst-layer-lock="${l.id}"
                aria-pressed="${!!l.locked}"
                aria-label="${l.locked ? `Unlock ${name}` : `Lock ${name}`}"
                data-tooltip="${l.locked ? "Unlock" : "Lock"}"
                ${busy ? "disabled" : ""}
              >
                <i class="${l.locked ? "ap-icon-lock-on" : "ap-icon-lock-off"}" aria-hidden="true"></i>
              </button>`}
        </li>`;
      })}
    </ul>
    <div class="imst-layers__actions" role="toolbar" aria-label="Selected layer">
      <button
        type="button"
        class="ap-icon-button transparent grey"
        data-imst-layer-move="1"
        aria-label="Bring forward"
        data-tooltip="Bring forward"
        ${canUp && !busy ? "" : "disabled"}
      >
        <i class="ap-icon-arrow-up" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="ap-icon-button transparent grey"
        data-imst-layer-move="-1"
        aria-label="Send backward"
        data-tooltip="Send backward"
        ${canDown && !busy ? "" : "disabled"}
      >
        <i class="ap-icon-arrow-down" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="ap-icon-button transparent grey"
        data-imst-layer-delete="${sel && !isBase(sel) ? sel.id : ""}"
        aria-label="Delete layer"
        data-tooltip="Delete"
        ${sel && !isBase(sel) && !busy ? "" : "disabled"}
      >
        <i class="ap-icon-trash" aria-hidden="true"></i>
      </button>
    </div>
  </section>`;
}

// ── The composer (bottom) ───────────────────────────────────────────────────

/** Which picture layers a Redraw would touch, and how the composer says it. */
export function redrawTarget(doc, selectedId) {
  const sel = doc.layers.find((l) => l.id === selectedId);
  if (doc.origin !== "generated") return { kinds: [], placeholder: "I can only redraw the layers I generated…" };
  if (sel?.kind === "background")
    return { kinds: ["background"], placeholder: "Describe a change to the background and I'll redraw it…" };
  if (sel?.kind === "subject")
    return { kinds: ["subject"], placeholder: "Describe a change to the subject and I'll redraw it…" };
  const kinds = ["background", ...(doc.layers.some((l) => l.kind === "subject") ? ["subject"] : [])];
  return { kinds, placeholder: "Describe a change and I'll redraw it…" };
}

export function composer(ui, doc, { busy }) {
  const target = redrawTarget(doc, ui.selectedId);
  const off = busy || !target.kinds.length;
  // The Generate tab's former Refine field, the one style for "say a change".
  return html`<div class="isv2-dock">
    <div class="imst-refine imst-refine--edit" role="group" aria-label="Edit the image">
      <i class="ap-icon-sparkles imst-refine__icon" aria-hidden="true"></i>
      <input
        type="text"
        class="imst-refine__input"
        data-img-edit-prompt
        value="${ui.prompt}"
        placeholder="${target.placeholder}"
        aria-label="Describe a change for AI to apply"
        ${off ? "disabled" : ""}
      />
      <button type="button" class="ap-button primary orange" data-imst-redraw ${off ? "disabled" : ""}>
        <span>Redraw</span>
      </button>
    </div>
  </div>`;
}

// ── Image / In feed (above the image) ────────────────────────────────────────

export function viewToggle(ui, network) {
  const feed = ui.view === "feed";
  return html`<div class="isv2-stage-top">
    <div class="isv2-viewseg" role="group" aria-label="Preview view">
      <button type="button" class="ap-filter-chip" data-imst-edit-view="image" aria-pressed="${!feed}">
        <i class="ap-icon-image" aria-hidden="true"></i>Image
      </button>
      <button
        type="button"
        class="ap-filter-chip"
        data-imst-edit-view="feed"
        aria-pressed="${feed}"
        title="${network ? `Preview on ${network.label}` : "Preview in the feed"}"
      >
        <i class="${network?.icon || "ap-icon-image"}" aria-hidden="true"></i>In feed
      </button>
    </div>
  </div>`;
}
