// Image Generator — Edit mode, the controller. The Image Studio's Edit
// (components/image-studio-v2/: events, interactions, inline-text) rebuilt over
// a layered document (state/edit-doc.js):
//
//   • the same gestures — drag, resize from the corner, rotate from the handle,
//     draw / move / resize the crop box — patched on the DOM while the pointer
//     moves and committed (one undo step) on release;
//   • the same inline text editing — double-click or Enter, Enter again to
//     finish — and the same live style controls (colour, outline, shadow);
//   • plus the layers: a layer is selected from the image or from the panel,
//     hidden, locked, moved up and down, deleted — and EVERY change is one
//     undo step, where the studio only undid crops and redraws.
//
// Like the studio, the code that patches the DOM instead of re-rendering is
// kept together (the "Silent" section): a re-render there would lose the
// caret, drop the slider under the pointer, or replay a popover's entrance.
// Everything else goes change → repaint.

import { html, raw } from "../../lib/html.js?v=1842";
import { delegate, wait } from "../../lib/delegate.js?v=1842";
import { IMAGE_PRESETS, REDRAW_MS, outlineMetrics, shadowMetrics } from "../../config/edit.js?v=1842";
import { bakeDoc } from "../../render/edit-export.js?v=1842";
import {
  cropDoc,
  docSignature,
  findLayer,
  isBase,
  isPicture,
  moveLayer,
  pictureLayer,
  record,
  removeLayer,
  textLayer,
  undo,
} from "../../state/edit-doc.js?v=1842";
import { editFrame, textStyle } from "./canvas.js?v=1842";
import { composer, layersPanel, redrawTarget, toolPalette, viewToggle } from "./panels.js?v=1842";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const DEFAULT_CROP = { xF: 0.15, yF: 0.15, wF: 0.7, hF: 0.7 };

function sanitizeCrop(r) {
  const wF = Math.min(1, Math.max(0.05, r.wF));
  const hF = Math.min(1, Math.max(0.05, r.hF));
  return { xF: clamp(Math.min(r.xF, 1 - wF), 0, 1), yF: clamp(Math.min(r.yF, 1 - hF), 0, 1), wF, hF };
}

// The studio's fitRectToAspect: resized around its centre, in fraction space.
function fitCrop(r, aspect, frameRatio) {
  if (!aspect) return sanitizeCrop(r);
  const k = aspect / (frameRatio || 1);
  let wF = r.wF;
  let hF = wF / k;
  if (hF > 1) {
    hF = 1;
    wF = hF * k;
  }
  wF = Math.min(wF, 1);
  return sanitizeCrop({ xF: r.xF + r.wF / 2 - wF / 2, yF: r.yF + r.hF / 2 - hF / 2, wF, hF });
}

function naturalRatio(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((img.naturalHeight || 1) / (img.naturalWidth || 1));
    img.onerror = () => resolve(1);
    img.src = url;
  });
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * @param {{ getEntry: () => {doc, history} | null, brand: () => object, network: object|null,
 *           shapes: () => object[], renderFeedPreview: ((url: string) => string) | null,
 *           repaint: () => void, redraw: (entry, kinds: string[], prompt: string) => Promise<void>,
 *           toast: (msg: string, opts?: object) => void }} deps
 */
export function createEditor({ getEntry, brand, network, shapes, renderFeedPreview, repaint, redraw, toast }) {
  const fresh = () => ({
    selectedId: null,
    editingId: null,
    popover: null,
    crop: null, // { rect, aspect: shape id | null }
    prompt: "",
    view: "image",
    busy: null, // the words on the busy veil
    customColors: [],
    live: false, // a live control has already recorded its undo step
    editStart: null, // the text as it was when inline editing began
  });
  let ui = fresh();
  let host = null;
  const feedUrls = new Map(); // docSignature → object URL (null while it bakes)

  const doc = () => getEntry()?.doc || null;
  const selected = () => (ui.selectedId && doc() ? findLayer(doc(), ui.selectedId) : null);
  const frame = () => host?.querySelector("[data-imst-frame]");

  /** One undo step, then the change, then a repaint. */
  function change(fn) {
    const entry = getEntry();
    if (!entry || ui.busy) return;
    record(entry);
    fn(entry.doc);
    repaint();
  }

  function brandInfo() {
    const b = brand();
    const logos = b?.logos?.length ? b.logos : b?.defaultLogoUrl ? [{ label: "Logo", url: b.defaultLogoUrl }] : [];
    return {
      name: b?.name || "",
      colors: (b?.palette || []).map((c) => c.hex),
      fonts: (b?.fonts || []).map((f) => f.family),
      logos,
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function feedCard(d) {
    const key = docSignature(d);
    if (!feedUrls.has(key)) {
      feedUrls.set(key, null);
      bakeDoc(d)
        .then((blob) => {
          feedUrls.set(key, URL.createObjectURL(blob));
          repaint();
        })
        .catch(() => {
          feedUrls.delete(key);
          ui.view = "image";
          toast("The feed preview couldn't be drawn.", { variant: "error" });
          repaint();
        });
    }
    const url = feedUrls.get(key);
    return html`<div class="imst-feed imst-feed--edit">
      <p class="ap-caption imst-feed__note">How this post looks${network ? ` on ${network.label}` : " in the feed"}</p>
      <div class="imst-feed__card">
        ${url
          ? raw(renderFeedPreview(url))
          : html`<div class="imst-feed__pending" aria-busy="true">
              <span class="imst-shimmer"></span
              ><span class="imst-stage2__status"><span class="ap-loader size-30"></span></span>
            </div>`}
      </div>
    </div>`;
  }

  // `top`: the host's own bar at the top of the stage (the studio's way back).
  function render({ top = "" } = {}) {
    const d = doc();
    if (!d) {
      return html`<div class="imst-edit imst-edit--preparing" aria-busy="true">
        <span class="ap-loader size-30"></span><span class="ap-body">Separating the layers…</span>
      </div>`;
    }
    const b = brandInfo();
    const view = { ...ui, brandColors: b.colors, brandName: b.name, brandFonts: b.fonts };
    const feed = !!renderFeedPreview && ui.view === "feed";
    return html`<div class="imst-edit">
      <div class="isv2-main-col">
        <section class="isv2-stage" aria-label="Edit">
          ${top} ${renderFeedPreview ? viewToggle(ui, network) : ""}
          <div class="isv2-stage-body${feed ? "" : " has-palette"}">
            ${feed
              ? feedCard(d)
              : html`${editFrame(view, d, { network, shapes: shapes(), busy: ui.busy })}
                ${toolPalette(ui, { busy: !!ui.busy, brandLogos: b.logos })} ${layersPanel(ui, d, { busy: !!ui.busy })}`}
          </div>
        </section>
        ${feed ? "" : composer(ui, d, { busy: !!ui.busy })}
      </div>
    </div>`;
  }

  /** The footer's left slot: Undo, as in the Image Studio's Edit. */
  function footerLeft() {
    const entry = getEntry();
    const can = !!entry?.history.length && !ui.busy;
    return html`<button type="button" class="ap-button ghost grey" data-imst-edit-undo ${can ? "" : "disabled"}>
      <i class="ap-icon-reset"></i><span>Undo</span>
    </button>`;
  }

  // ── Selection & inline text ────────────────────────────────────────────────

  function select(id) {
    if (id !== ui.editingId) finishEditing();
    ui.selectedId = id;
    if (id) ui.crop = null;
    ui.popover = null;
    repaint();
  }

  function editingNode() {
    return ui.editingId ? host?.querySelector(`[data-imst-layer="${ui.editingId}"] [data-imst-overlay-text]`) : null;
  }

  function focusEditing({ selectAll = false } = {}) {
    const node = editingNode();
    if (!node) return;
    node.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    if (!selectAll) range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function startEditing(id, { selectAll = false } = {}) {
    const entry = getEntry();
    const l = findLayer(entry.doc, id);
    if (!l || l.kind !== "text" || l.locked || ui.busy) return;
    record(entry);
    ui.editStart = l.text;
    ui.editingId = id;
    ui.selectedId = id;
    repaint();
    focusEditing({ selectAll });
  }

  /** Pushes the typed text into the layer (a click can steal focus before the last input). */
  function syncText() {
    const node = editingNode();
    const l = selected();
    if (node && l && l.id === ui.editingId) l.text = node.textContent;
  }

  function finishEditing() {
    if (!ui.editingId) return;
    syncText();
    const entry = getEntry();
    const l = entry && findLayer(entry.doc, ui.editingId);
    // Nothing typed: the step recorded on entry would undo nothing.
    if (l && l.text === ui.editStart) entry.history.pop();
    ui.editingId = null;
    ui.editStart = null;
  }

  const restoreCaret = () => {
    if (ui.editingId) focusEditing();
  };

  // ── Adding ─────────────────────────────────────────────────────────────────

  function addText() {
    const entry = getEntry();
    if (!entry || ui.busy) return;
    finishEditing();
    ui.crop = null;
    const l = textLayer();
    record(entry);
    entry.doc.layers.push(l);
    ui.selectedId = l.id;
    ui.editingId = l.id;
    ui.editStart = null; // a new layer is a change even untyped
    repaint();
    focusEditing({ selectAll: true });
  }

  async function addPicture(url, name) {
    if (!url) return;
    const ratio = await naturalRatio(url);
    const entry = getEntry();
    if (!entry) return;
    const d = entry.doc;
    // The studio's default: 28% of the width, in the middle.
    const wF = 0.28;
    const hF = (wF * ratio * d.w) / d.h;
    const l = pictureLayer("image", { url, ratio, name, box: { x: 0.5 - wF / 2, y: 0.5 - hF / 2, w: wF, h: hF } });
    change((dd) => dd.layers.push(l));
    ui.selectedId = l.id;
    ui.crop = null;
    repaint();
  }

  function uploadPicture() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (file) addPicture(await blobToDataUrl(file), file.name.replace(/\.[a-z0-9]+$/i, "") || "Image");
    });
    input.click();
  }

  // ── Crop ───────────────────────────────────────────────────────────────────

  function toggleCrop() {
    if (ui.busy) return;
    finishEditing();
    ui.crop = ui.crop ? null : { rect: { ...DEFAULT_CROP }, aspect: null };
    ui.selectedId = null;
    ui.popover = null;
    repaint();
  }

  function setCropAspect(id) {
    if (!ui.crop) return;
    const shape = shapes().find((s) => s.id === id);
    ui.crop.aspect = shape ? id : null;
    ui.crop.rect = fitCrop(ui.crop.rect, shape ? shape.w / shape.h : null, doc().w / doc().h);
    repaint();
  }

  function applyCrop() {
    if (!ui.crop) return;
    const r = ui.crop.rect;
    ui.crop = null;
    change((d) => cropDoc(d, r));
  }

  // ── Redraw ─────────────────────────────────────────────────────────────────

  async function runRedraw() {
    const entry = getEntry();
    if (!entry || ui.busy) return;
    finishEditing();
    const target = redrawTarget(entry.doc, ui.selectedId);
    if (!target.kinds.length) {
      toast("I can only redraw the layers I generated — this image came with the draft.");
      return;
    }
    const prompt = ui.prompt.trim();
    ui.busy = "Applying…";
    ui.popover = null;
    ui.crop = null;
    repaint();
    record(entry);
    try {
      await wait(REDRAW_MS);
      await redraw(entry, target.kinds, prompt);
      ui.prompt = "";
    } catch (error) {
      entry.history.pop();
      toast(error.message || "The redraw failed.", { variant: "error" });
    } finally {
      ui.busy = null;
      repaint();
    }
  }

  // ── Gestures (silent while the pointer moves) ───────────────────────────────

  function startLayerGesture(event, el) {
    event.preventDefault();
    const entry = getEntry();
    const l = findLayer(entry.doc, el.dataset.imstLayer);
    const f = frame();
    if (!l || l.locked || !f) return;
    const rect = f.getBoundingClientRect();
    const mode = event.target.closest("[data-imst-overlay-resize]")
      ? "resize"
      : event.target.closest("[data-imst-overlay-rotate]")
        ? "rotate"
        : "move";
    if (ui.selectedId !== l.id) {
      finishEditing();
      ui.popover = null;
    }
    ui.selectedId = l.id;
    host.querySelectorAll(".image-studio__overlay.is-selected").forEach((n) => n.classList.remove("is-selected"));
    el.classList.add("is-selected");
    // Into the unclipped container, so it can be dragged past the edge; its
    // z-index keeps its place in the stack.
    const layer = host.querySelector("[data-imst-overlay-layer]");
    if (layer && el.parentElement !== layer) {
      layer.querySelectorAll("[data-imst-layer]").forEach((n) => host.querySelector(".imst-edit-overlays")?.append(n));
      layer.append(el);
    }
    layer?.classList.add("is-gesturing");

    const cx = rect.left + l.xF * rect.width;
    const cy = rect.top + l.yF * rect.height;
    const startDist = Math.hypot(event.clientX - cx, event.clientY - cy) || 1;
    const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
    const start = {
      px: event.clientX,
      py: event.clientY,
      xF: l.xF,
      yF: l.yF,
      wF: l.wF,
      sizeF: l.sizeF,
      boxWF: l.boxWF,
      rot: l.rot || 0,
    };
    const before = { ...l };
    const textNode = el.querySelector("[data-imst-overlay-text]");
    let moved = false;

    const move = (e) => {
      moved = true;
      if (mode === "move") {
        l.xF = clamp(start.xF + (e.clientX - start.px) / rect.width, 0.02, 0.98);
        l.yF = clamp(start.yF + (e.clientY - start.py) / rect.height, 0.02, 0.98);
        el.style.left = `${l.xF * 100}%`;
        el.style.top = `${l.yF * 100}%`;
      } else if (mode === "resize") {
        const factor = Math.hypot(e.clientX - cx, e.clientY - cy) / startDist;
        if (l.kind === "text") {
          l.sizeF = clamp(start.sizeF * factor, 0.02, 0.5);
          if (start.boxWF) l.boxWF = clamp(start.boxWF * factor, 0.05, 1.5);
          if (textNode) textNode.style.cssText = textStyle(l);
        } else {
          l.wF = clamp(start.wF * factor, 0.05, 1.5);
          el.style.width = `${l.wF * 100}%`;
        }
      } else {
        l.rot = start.rot + (Math.atan2(e.clientY - cy, e.clientX - cx) - startAngle);
        el.style.transform = `translate(-50%, -50%) rotate(${l.rot}rad)`;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      layer?.classList.remove("is-gesturing");
      if (moved) {
        // The step is what the layer was BEFORE the drag.
        const now = { ...l };
        Object.assign(l, before);
        record(entry);
        Object.assign(l, now);
      }
      if (ui.editingId && ui.editingId !== l.id) finishEditing();
      repaint();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startCropGesture(event, mode, corner) {
    event.preventDefault();
    const f = frame();
    const boxEl = host.querySelector("[data-imst-croprect]");
    if (!f || !boxEl || !ui.crop) return;
    const rect = f.getBoundingClientRect();
    const shape = shapes().find((s) => s.id === ui.crop.aspect);
    const k = shape ? shape.w / shape.h / (rect.width / rect.height) : null;
    const r0 = { ...ui.crop.rect };
    const fx = (x) => clamp((x - rect.left) / rect.width, 0, 1);
    const fy = (y) => clamp((y - rect.top) / rect.height, 0, 1);
    let ax = 0;
    let ay = 0;
    if (mode === "resize") {
      ax = corner === "nw" || corner === "sw" ? r0.xF + r0.wF : r0.xF;
      ay = corner === "nw" || corner === "ne" ? r0.yF + r0.hF : r0.yF;
    } else if (mode === "draw") {
      ax = fx(event.clientX);
      ay = fy(event.clientY);
    }
    const paint = (next) => {
      ui.crop.rect = sanitizeCrop(next);
      const c = ui.crop.rect;
      Object.assign(boxEl.style, {
        left: `${c.xF * 100}%`,
        top: `${c.yF * 100}%`,
        width: `${c.wF * 100}%`,
        height: `${c.hF * 100}%`,
      });
    };
    const move = (e) => {
      if (mode === "move") {
        const dx = (e.clientX - event.clientX) / rect.width;
        const dy = (e.clientY - event.clientY) / rect.height;
        paint({ xF: clamp(r0.xF + dx, 0, 1 - r0.wF), yF: clamp(r0.yF + dy, 0, 1 - r0.hF), wF: r0.wF, hF: r0.hF });
        return;
      }
      const px = fx(e.clientX);
      const py = fy(e.clientY);
      let wF = Math.abs(px - ax);
      let hF = Math.abs(py - ay);
      if (k) {
        if (wF >= hF * k) hF = wF / k;
        else wF = hF * k;
      }
      paint({ xF: px >= ax ? ax : ax - wF, yF: py >= ay ? ay : ay - hF, wF, hF });
    };
    f.classList.add("is-gesturing");
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      f.classList.remove("is-gesturing");
      repaint();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── Silent: live controls that patch the DOM ────────────────────────────────

  const overlayText = (id) => host.querySelector(`[data-imst-layer="${id}"] [data-imst-overlay-text]`);

  /** A live control's first move records the undo step; its release ends it. */
  function liveStep() {
    if (ui.live) return;
    const entry = getEntry();
    if (entry) record(entry);
    ui.live = true;
  }

  function paintSlider(input, value, valSel) {
    input.style.setProperty("--fill", `${value}%`);
    const valEl = host.querySelector(valSel);
    if (valEl) valEl.textContent = String(value);
  }

  function liveInput(t) {
    if (t.matches("[data-imst-overlay-text]")) {
      const l = selected();
      if (l && l.id === ui.editingId) l.text = t.textContent;
      return true;
    }
    const l = selected();
    if (!l || l.kind !== "text") return false;
    const node = overlayText(l.id);
    if (t.matches("[data-imst-text-colorpick]")) {
      liveStep();
      l.color = t.value;
      if (node) node.style.color = t.value;
    } else if (t.matches("[data-imst-outline-colorpick]")) {
      liveStep();
      l.outlineColor = t.value;
      if (node) node.style.webkitTextStrokeColor = t.value;
    } else if (t.matches("[data-imst-outline-width]")) {
      liveStep();
      l.outlineWidth = Number(t.value);
      if (node) node.style.webkitTextStrokeWidth = `${outlineMetrics(l.outlineWidth).emStroke}em`;
      paintSlider(t, l.outlineWidth, "[data-imst-outline-val]");
    } else if (t.matches("[data-imst-shadow-intensity]")) {
      liveStep();
      l.shadowIntensity = Number(t.value);
      const sm = shadowMetrics(l.shadowIntensity);
      if (node) node.style.textShadow = `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})`;
      paintSlider(t, l.shadowIntensity, "[data-imst-shadow-val]");
    } else return false;
    return true;
  }

  // Outline / shadow on or off without a re-render: the open popover stays
  // mounted (the studio's toggleTextEffect, four patches for one render).
  function toggleEffect(kind, on) {
    const l = selected();
    if (!l || l.kind !== "text") return;
    record(getEntry());
    l[kind] = on;
    const node = overlayText(l.id);
    if (node) node.style.cssText = textStyle(l);
    const slider = host.querySelector(
      kind === "outline" ? "[data-imst-outline-width]" : "[data-imst-shadow-intensity]",
    );
    if (slider) slider.disabled = !on;
    host.querySelector(`.image-studio__tt-${kind}`)?.classList.toggle("is-on", on);
    host.querySelector(`.image-studio__popover--${kind}`)?.classList.toggle("is-off", !on);
    paintFooterOnly();
  }

  let paintFooterOnly = () => {};

  // ── Events ─────────────────────────────────────────────────────────────────

  function onClick(event) {
    const t = event.target;
    const d = doc();
    if (!d || ui.busy) return;
    const popToggle = t.closest("[data-imst-popover-toggle]");
    if (ui.popover && !popToggle && !t.closest("[data-imst-popover]")) {
      ui.popover = null;
      repaint();
    }
    if (popToggle && !popToggle.disabled) {
      const name = popToggle.dataset.imstPopoverToggle;
      ui.popover = ui.popover === name ? null : name;
      repaint();
      if (name.startsWith("text")) restoreCaret();
      return;
    }
    const view = t.closest("[data-imst-edit-view]");
    if (view) {
      finishEditing();
      ui.view = view.dataset.imstEditView === "feed" ? "feed" : "image";
      ui.crop = null;
      return void repaint();
    }
    if (t.closest("[data-imst-crop-start]")) return void toggleCrop();
    if (t.closest("[data-imst-crop-cancel]")) {
      ui.crop = null;
      return void repaint();
    }
    if (t.closest("[data-imst-crop-apply]")) return void applyCrop();
    const aspect = t.closest("[data-imst-crop-aspect]");
    if (aspect) return void setCropAspect(aspect.dataset.imstCropAspect);
    if (t.closest("[data-imst-add-text]")) return void addText();
    if (t.closest("[data-imst-logo-upload]")) {
      ui.popover = null;
      repaint();
      return void uploadPicture();
    }
    const pb = t.closest("[data-imst-logo-playbook]");
    if (pb) {
      const logo = brandInfo().logos[Number(pb.dataset.imstLogoPlaybook)];
      ui.popover = null;
      return void addPicture(logo?.url, logo?.label || "Logo");
    }
    const preset = t.closest("[data-imst-logo-preset]");
    if (preset) {
      const p = IMAGE_PRESETS[Number(preset.dataset.imstLogoPreset)];
      ui.popover = null;
      return void addPicture(p?.url, p?.label);
    }
    // ── Layers panel ──
    const hide = t.closest("[data-imst-layer-hide]");
    if (hide) {
      const id = hide.dataset.imstLayerHide;
      if (id === ui.editingId) finishEditing();
      return void change((dd) => {
        const l = findLayer(dd, id);
        l.hidden = !l.hidden;
      });
    }
    const lock = t.closest("[data-imst-layer-lock]");
    if (lock) {
      const id = lock.dataset.imstLayerLock;
      if (id === ui.editingId) finishEditing();
      return void change((dd) => {
        const l = findLayer(dd, id);
        l.locked = !l.locked;
      });
    }
    const mv = t.closest("[data-imst-layer-move]");
    if (mv && ui.selectedId) return void change((dd) => moveLayer(dd, ui.selectedId, Number(mv.dataset.imstLayerMove)));
    const del = t.closest("[data-imst-layer-delete]");
    if (del && del.dataset.imstLayerDelete) return void deleteLayer(del.dataset.imstLayerDelete);
    const row = t.closest("[data-imst-layer-row]");
    if (row) {
      select(row.dataset.imstLayerRow);
      host.querySelector(`[data-imst-layer-row="${row.dataset.imstLayerRow}"]`)?.focus({ preventScroll: true });
      return;
    }
    // ── Overlay chrome ──
    const rotReset = t.closest("[data-imst-overlay-rotate-reset]");
    if (rotReset) return void change((dd) => (findLayer(dd, rotReset.dataset.imstOverlayRotateReset).rot = 0));
    const l = selected();
    if (l?.kind === "text") {
      const color = t.closest("[data-imst-text-color]");
      const outColor = t.closest("[data-imst-outline-color]");
      const font = t.closest("[data-imst-font]");
      const patch = color
        ? { color: color.dataset.imstTextColor }
        : outColor
          ? { outlineColor: outColor.dataset.imstOutlineColor }
          : font
            ? { fontFamily: font.dataset.imstFont || null }
            : t.closest("[data-imst-text-bold]")
              ? { bold: !l.bold }
              : t.closest("[data-imst-text-italic]")
                ? { italic: !l.italic }
                : null;
      if (patch) {
        syncText();
        if (color || outColor || font) ui.popover = null;
        change(() => Object.assign(l, patch));
        return void restoreCaret();
      }
    }
    if (t.closest("[data-imst-redraw]")) return void runRedraw();
    // A click on the image but not on a layer: nothing selected any more.
    if (
      (ui.selectedId || ui.editingId) &&
      t.closest("[data-imst-frame]") &&
      !t.closest("[data-imst-layer]") &&
      !ui.crop
    ) {
      finishEditing();
      ui.selectedId = null;
      repaint();
    }
  }

  function deleteLayer(id) {
    if (id === ui.editingId) {
      ui.editingId = null;
      ui.editStart = null;
    }
    change((d) => removeLayer(d, id));
    if (ui.selectedId === id) ui.selectedId = null;
    repaint();
  }

  function onPointerDown(event) {
    const t = event.target;
    if (ui.busy || !doc()) return;
    if (ui.crop) {
      const handle = t.closest("[data-imst-crop-handle]");
      if (handle) return void startCropGesture(event, "resize", handle.dataset.imstCropHandle);
      if (t.closest("[data-imst-croprect]")) return void startCropGesture(event, "move");
      if (t.closest("[data-imst-crop-layer]")) return void startCropGesture(event, "draw");
      return;
    }
    if (
      t.closest(
        "[data-imst-layer-delete], [data-imst-overlay-rotate-reset], [data-imst-text-toolbar], [data-imst-popover]",
      )
    )
      return;
    const el = t.closest("[data-imst-layer]");
    if (!el) return;
    const onHandle = t.closest("[data-imst-overlay-resize], [data-imst-overlay-rotate]");
    if (ui.editingId === el.dataset.imstLayer && !onHandle) return;
    startLayerGesture(event, el);
  }

  function onDblClick(event) {
    const el = event.target.closest("[data-imst-layer]");
    if (el) startEditing(el.dataset.imstLayer);
  }

  function onInput(event) {
    const t = event.target;
    if (t.matches("[data-img-edit-prompt]")) {
      ui.prompt = t.value;
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight}px`;
      return;
    }
    liveInput(t);
  }

  function onChange(event) {
    const t = event.target;
    if (!t.isConnected) return;
    const l = selected();
    if (t.matches("[data-imst-text-colorpick], [data-imst-outline-colorpick]")) {
      const hex = t.value.toUpperCase();
      if (!ui.customColors.includes(hex)) ui.customColors.push(hex);
      if (l) l[t.matches("[data-imst-text-colorpick]") ? "color" : "outlineColor"] = hex;
      ui.live = false;
      ui.popover = null;
      repaint();
      restoreCaret();
    } else if (t.matches("[data-imst-outline-toggle]")) toggleEffect("outline", t.checked);
    else if (t.matches("[data-imst-shadow-toggle]")) toggleEffect("shadow", t.checked);
    else if (t.matches("[data-imst-outline-width], [data-imst-shadow-intensity]")) {
      ui.live = false;
      repaint();
    }
  }

  const inField = (t) => t.closest?.("input, textarea, [contenteditable='true']");

  function onKeydown(event) {
    const t = event.target;
    const d = doc();
    if (!d) return;
    if (event.key === "Enter" && !event.shiftKey && t.matches("[data-img-edit-prompt]")) {
      event.preventDefault();
      return void runRedraw();
    }
    if (event.key === "Enter" && ui.editingId) {
      event.preventDefault();
      finishEditing();
      return void repaint();
    }
    if (inField(t)) return;
    if (event.key === "Enter") {
      const el = t.closest("[data-imst-layer]");
      if (el && findLayer(d, el.dataset.imstLayer)?.kind === "text") {
        event.preventDefault();
        return void startEditing(el.dataset.imstLayer);
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      return void runUndo();
    }
    // The layers list: ↑ / ↓ walk it, top layer first.
    const row = t.closest("[data-imst-layer-row]");
    if (row && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const list = [...d.layers].reverse();
      const i = list.findIndex((l) => l.id === row.dataset.imstLayerRow);
      const next = list[clamp(i + (event.key === "ArrowDown" ? 1 : -1), 0, list.length - 1)];
      select(next.id);
      host.querySelector(`[data-imst-layer-row="${next.id}"]`)?.focus({ preventScroll: true });
      return;
    }
    const l = selected();
    if (!l || isBase(l) || ui.busy) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      return void deleteLayer(l.id);
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[event.key] && !l.locked && !row) {
      event.preventDefault();
      const [dx, dy] = arrows[event.key];
      change(() => {
        l.xF = clamp(l.xF + dx, 0.02, 0.98);
        l.yF = clamp(l.yF + dy, 0.02, 0.98);
      });
      host.querySelector(`[data-imst-layer="${l.id}"]`)?.focus({ preventScroll: true });
    }
  }

  function runUndo() {
    const entry = getEntry();
    if (!entry || ui.busy) return;
    finishEditing();
    if (!undo(entry)) return;
    if (ui.selectedId && !findLayer(entry.doc, ui.selectedId)) ui.selectedId = null;
    ui.crop = null;
    ui.popover = null;
    repaint();
  }

  return {
    render,
    footerLeft,
    syncText,
    finishEditing,
    undo: runUndo,
    /** New source (another variation, the draft's photo): fresh selection, crop, prompt. */
    reset() {
      ui = { ...fresh(), view: ui.view, customColors: ui.customColors };
    },
    isBusy: () => !!ui.busy,
    /** Escape unwinds, innermost first. False when there was nothing left to unwind. */
    escape() {
      if (ui.popover) ui.popover = null;
      else if (ui.crop) ui.crop = null;
      else if (ui.editingId) finishEditing();
      else if (ui.selectedId) ui.selectedId = null;
      else return false;
      repaint();
      return true;
    },
    bind(target, { onFooterChange }) {
      host = target;
      paintFooterOnly = onFooterChange;
      const offs = [
        delegate(target, "click", "*", (e) => onClick(e)),
        delegate(target, "pointerdown", "*", (e) => onPointerDown(e)),
        delegate(target, "dblclick", "[data-imst-layer]", (e) => onDblClick(e)),
        delegate(target, "input", "*", (e) => onInput(e)),
        delegate(target, "change", "*", (e) => onChange(e)),
        delegate(target, "keydown", "*", (e) => onKeydown(e)),
      ];
      return () => {
        offs.forEach((off) => off());
        feedUrls.forEach((url) => url && URL.revokeObjectURL(url));
        host = null;
      };
    },
    /** The PNG the draft gets. */
    async bake() {
      syncText();
      const blob = await bakeDoc(doc());
      return blobToDataUrl(blob);
    },
    isPicture,
  };
}
