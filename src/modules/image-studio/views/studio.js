// Image Generator — the studio, opened FROM A DRAFT (flag sexySquirrel
// replaces the draft's Image Studio): the draft's Playbook is the brand, only
// its network's shapes, a prompt suggested from the post, and "Use in draft"
// puts the PNG in the post. It is the ONLY place images are generated; the
// brand's own styles live on the Playbook (Brand › Image styles).
//
//   CONTROLS (left column, Generate always in reach at its foot)
//     brand applied · the prompt · the style as a picture (6 quick picks + the
//     full gallery) · the shape drawn to scale ·
//     text on the image and how it's set
//   CANVAS (the rest)
//     before generating — a LIVE preview of what the choices give, in the
//       brand's colours, redrawn on every change: nothing is picked blind
//     generating — the shape, shimmering, with what's being made in words
//     after — the chosen variation LARGE, its actions beside it, the four as a
//       filmstrip, earlier runs underneath

import { html, raw, toString } from "../lib/html.js?v=1830";
import { delegate } from "../lib/delegate.js?v=1830";
import { hashString } from "../lib/prng.js?v=1830";
import { renderEmpty } from "../ui/empty.js?v=1830";
import { preserveFocus } from "../ui/fields.js?v=1830";
import { toast } from "../ui/toast.js?v=1830";
import { assetImg, hydrateAssets } from "../ui/asset.js?v=1830";
import { styleThumb } from "../ui/style-thumb.js?v=1830";
import { openDialog } from "../ui/dialog.js?v=1830";
import { menu } from "../ui/menu.js?v=1830";
import { variationCanvas, variationSvg, layersFor } from "../ui/variation.js?v=1830";
import { QUICK_PRESETS, STYLE_PRESETS } from "../config/style-presets.js?v=1830";
import { formatById, shapeForFormat, shapesFor, shapesForBrand } from "../config/formats.js?v=1830";
import { networkById } from "../config/networks.js?v=1830";
import { copyService, imageGenerationService } from "../services/index.js?v=1830";
import { unbranded, getPlaybookReferences } from "../state/playbook-brand.js?v=1830";
import { resolveLayers } from "../render/layout.js?v=1830";
import { svgToDataUrl } from "../render/visual.js?v=1830";
import { REVEAL_MS } from "../../../archie-pixels.js?v=1830";
import { splitVisual } from "../render/split.js?v=1830";
import { bakeDoc } from "../render/edit-export.js?v=1830";
import { subjectKindFor } from "../render/subjects.js?v=1830";
import { docSignature, entryOf, findLayer, generatedDoc, isBase, photoDoc } from "../state/edit-doc.js?v=1830";
import { createEditor } from "./edit/editor.js?v=1830";
import { mount as mountStyleCreator } from "./style-creator.js?v=1830";
import { toPngBlob, downloadBlob, slug } from "../render/export.js?v=1830";
import {
  canEditBrand,
  forgetOneOffStyle,
  getBrand,
  getCreation,
  getProducts,
  getStyle,
  getStylesForBrand,
  registerOneOffStyle,
  subscribe,
} from "../state/store.js?v=1830";
import { discardOneOff, oneOffStyleFrom } from "../state/style-actions.js?v=1830";
import {
  addBatch,
  appendVariations,
  deleteCreation,
  replaceVariation,
  startCreation,
} from "../state/creation-actions.js?v=1830";

const variationsLabel = (n) => (n === 1 ? "1 variation" : `${n} variations`);

function defaultBrief(brand, network = null) {
  // The Playbook's default style (Brand › Imagery), else its first own style.
  const own = getStylesForBrand(brand.id).find((s) => s.kind === "custom");
  const firstShape = shapesForBrand(brand, network)[0];
  return {
    prompt: "",
    headline: "",
    styleId: brand.defaults?.styleId || own?.id || "preset-photoreal",
    productId: null,
    formatIds: [firstShape?.formatId || "ig-post"],
    textMode: "layer",
    count: 4,
  };
}

// What the image is drawn with: the Playbook. The "Use the Playbook" switch was
// removed (2026-09-29) — an image made from a draft is always the brand's — but a
// creation saved with it off still redraws in the neutral look it was made in.
const lookOf = (brand, brief) => (brief?.useBrand === false ? unbranded(brand) : brand);

/**
 * @param {HTMLElement} target
 * @param {{ draft: { brandId, network, text, imageUrl, slides }, onUse: (dataUrl) => void,
 *           renderFeedPreview?: (imageUrl: string) => string }} opts
 * With `renderFeedPreview` (the draft's own card, from the shell), a result can
 * be seen In feed: the baked PNG — exactly what Use in draft puts in the post —
 * inside that card.
 *
 * Two modes, as in the Image Studio: Generate, and Edit — the chosen image as
 * LAYERS (views/edit/). `modes` is where the tabs go (the dialog's header),
 * `footerLeft` the footer's left slot (Edit's Undo), and `onEscape` hands the
 * dialog a function that unwinds Edit before Escape closes anything.
 */
export function mountStudio(
  target,
  {
    draft,
    onUse,
    onCancel = () => {},
    footer = null,
    footerLeft = null,
    modes = null,
    onEscape = null,
    renderFeedPreview = null,
  },
) {
  // The dialog's footer holds the final actions (DS: right-aligned); clicks are
  // delegated from the dialog so body and footer share one set of handlers.
  const root = target.closest(".ap-dialog") || target;
  const brandNow = () => getBrand(draft.brandId);
  const shapes = () => shapesFor(draft.network);
  const state = {
    brandId: null,
    brief: null,
    creationId: null,
    focusId: null,
    run: { status: "idle" }, // idle | loading | error
    busy: new Set(), // variation ids being regenerated
    warning: "",
    error: "",
    abort: null,
    view: "image", // image | feed — how a result is shown
    mode: "generate", // generate | edit
    oneOff: null, // "From an image": the style read from the user's upload (state/store.js)
    refId: null, // the Playbook reference image the one-off was read from, if any
    oneOffBusy: false,
    source: null, // null (the chooser) | style | image | scratch — where the look comes from
    lastStyleId: null, // the style picked under "A style", kept while another answer is open
    sourceError: "",
    editKey: null, // which image Edit has open
  };
  // Edit documents, one per image, kept for the life of the dialog: edits stick
  // to the variation they were made on. key → { doc, history } (state/edit-doc.js)
  const entries = new Map();
  // What each generated document is drawn from, for Redraw. key → { creation, formatId, look }
  const sources = new Map();
  const editedUrls = new Map(); // docSignature → object URL (null while it bakes)
  // The PNG each variation bakes to for the In feed card, keyed by what draws it.
  const feedUrls = new Map(); // key → object URL, or null while it bakes
  let alive = true;

  const brandChanged = (brand) => {
    state.brandId = brand?.id || null;
    state.brief = brand ? defaultBrief(brand, draft.network) : null;
    // A default look skips the chooser: the brand's style, or its reference image.
    state.source = brand?.defaults?.styleId ? "style" : null;
    if (brand?.defaults?.referenceUrl) styleFromPlaybookReference(brand.defaults.referenceUrl);
    state.lastStyleId = state.brief?.styleId || null;
    state.sourceError = "";
    // A draft that already has an image shows it first; any choice switches to the live preview.
    state.showCurrent = !!draft.imageUrl;
    state.focusId = null;
    state.creationId = null;
  };

  const currentCreation = () => (state.creationId ? getCreation(state.creationId) : null);
  const latestBatch = (c) => (c.batches?.length ? c.batches[0] : { id: null, label: "Variations" });
  const batchVariations = (c, batch) => c.variations.filter((v) => (v.batchId ?? null) === batch.id);
  const focused = (c) => {
    const current = batchVariations(c, latestBatch(c));
    return c.variations.find((v) => v.id === state.focusId) || current[0] || c.variations[0] || null;
  };

  // ── Edit: the chosen image as layers ─────────────────────────────────────

  const variationKey = (c, v) => `${c.id}|${v.id}|${v.seed}`;

  /** The image Edit works on: the focused variation, else the draft's own photo. */
  const editSource = () => {
    const c = currentCreation();
    if (c?.variations.length && state.run.status !== "loading") {
      const v = focused(c);
      return { key: variationKey(c, v), creation: c, variation: v };
    }
    if (draft.imageUrl && state.run.status !== "loading") return { key: "current" };
    return null;
  };
  const canEdit = () => !!brandNow() && !!editSource();
  const editEntry = () => (state.mode === "edit" && state.editKey ? entries.get(state.editKey) || null : null);
  const edited = (key) => !!entries.get(key)?.history.length;

  const measure = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1080, h: img.naturalHeight || 1080 });
      img.onerror = () => resolve({ w: 1080, h: 1080 });
      img.src = url;
    });

  // A variation, lifted into layers: the render split in two (background ·
  // subject), and the headline and the logo exactly where the generator put
  // them — re-expressed in the Image Studio's overlay geometry.
  async function buildGenerated(key, c, v) {
    const brand = brandNow();
    const look = lookOf(brand, c.brief);
    const format = formatById(c.brief.formatIds[0]);
    const W = format.width;
    const H = format.height;
    const split = splitVisual(variationSvg({ creation: c, variation: v, formatId: format.id, brand: look }));
    const resolved = resolveLayers(layersFor({ creation: c, formatId: format.id }), look);
    const t = resolved.find((l) => l.type === "text" && l.content);
    let text = null;
    if (t) {
      // The generator sets the block from the top of its box: find its middle.
      const perLine = Math.max(1, Math.floor(t.w / (t.size * 0.55)));
      const lines = Math.ceil(String(t.content).length / perLine);
      const heightF = (lines * t.size * 1.2 * W) / H;
      text = {
        text: t.content,
        color: t.color,
        fontFamily: look.fonts?.find((f) => f.role === "heading")?.family || "Helvetica Neue",
        bold: true,
        sizeF: (t.size * W) / H,
        boxWF: t.w,
        align: t.align || "left",
        band: !!t.band,
        bandColor: t.bandColor,
        xF: t.x + t.w / 2,
        yF: t.y + Math.min(t.h, heightF) / 2,
        hidden: !!t.hidden,
      };
    }
    const lg = resolved.find((l) => l.type === "logo" && l.href);
    let logo = null;
    if (lg) {
      const nat = await measure(lg.href);
      const ratio = nat.h / nat.w;
      // Contained in its slot, as the generator draws it.
      const wF = Math.min(lg.w, (lg.h * H) / ratio / W);
      const hF = (wF * ratio * W) / H;
      logo = {
        url: lg.href,
        ratio,
        box: { x: lg.x + lg.w / 2 - wF / 2, y: lg.y + lg.h / 2 - hF / 2, w: wF, h: hF },
      };
    }
    const doc = generatedDoc({
      key,
      w: W,
      h: H,
      seeds: { seed: v.seed, bgSeed: v.bgSeed, subjectSeed: v.subjectSeed },
      split,
      backgroundUrl: svgToDataUrl(split.background),
      subjectUrl: split.subject ? svgToDataUrl(split.subject.svg) : "",
      text,
      logo,
    });
    const subject = doc.layers.find((l) => l.kind === "subject");
    if (subject) subject.srcW = split.subject.box.w;
    sources.set(key, { creation: c, formatId: format.id, look });
    return entryOf(doc);
  }

  async function openEdit() {
    const src = editSource();
    if (!src || !brandNow()) return;
    editor.finishEditing();
    if (state.editKey !== src.key) editor.reset();
    state.mode = "edit";
    state.editKey = src.key;
    paint();
    if (entries.has(src.key)) return;
    try {
      const entry =
        src.key === "current"
          ? entryOf(photoDoc({ key: "current", url: draft.imageUrl, ...(await measure(draft.imageUrl)) }))
          : await buildGenerated(src.key, src.creation, src.variation);
      entries.set(src.key, entry);
    } catch (error) {
      state.mode = "generate";
      toast(error.message || "The layers couldn't be separated.", { variant: "error" });
    }
    paint();
  }

  function leaveEdit() {
    editor.finishEditing();
    state.mode = "generate";
    paint();
  }

  // Redraw ONE part: new seeds for the background or the subject, the same
  // render split again, and only that layer's picture replaced — its place,
  // its size and everything above it untouched. The prompt steers what the
  // subject is when it names one (the mock reads kinds, not prose).
  async function redrawEntry(entry, kinds, prompt) {
    const src = sources.get(entry.doc.key);
    if (!src) throw new Error("This image can't be redrawn.");
    const seeds = { ...entry.doc.seeds };
    const fresh = () => Math.floor(Math.random() * 2 ** 31);
    if (kinds.includes("background")) seeds.bgSeed = fresh();
    if (kinds.includes("subject")) seeds.subjectSeed = fresh();
    const c = src.creation;
    const kindPrompt = prompt && subjectKindFor(prompt) !== "object" ? prompt : c.brief.prompt;
    const split = splitVisual(
      variationSvg({
        creation: { ...c, brief: { ...c.brief, prompt: kindPrompt } },
        variation: seeds,
        formatId: src.formatId,
        brand: src.look,
      }),
    );
    const doc = entry.doc;
    doc.seeds = seeds;
    if (kinds.includes("background")) doc.layers.find(isBase).url = svgToDataUrl(split.background);
    const subject = doc.layers.find((l) => l.kind === "subject");
    if (kinds.includes("subject") && subject && split.subject) {
      const b = split.subject.box;
      const f = formatById(src.formatId);
      subject.wF = subject.wF * (b.w / (subject.srcW || b.w));
      subject.srcW = b.w;
      subject.ratio = (b.h * f.height) / (b.w * f.width);
      subject.url = svgToDataUrl(split.subject.svg);
    }
  }

  /** An edited variation, baked — what Generate shows and In feed / Use take. Null while it bakes. */
  function editedUrl(key) {
    const entry = entries.get(key);
    const sig = docSignature(entry.doc);
    if (!editedUrls.has(sig)) {
      editedUrls.set(sig, null);
      bakeDoc(entry.doc)
        .then((blob) => {
          if (!alive) return;
          editedUrls.set(sig, URL.createObjectURL(blob));
          paint();
        })
        .catch(() => editedUrls.delete(sig));
    }
    return editedUrls.get(sig);
  }

  const editor = createEditor({
    getEntry: editEntry,
    brand: () => {
      const brand = brandNow();
      const c = currentCreation();
      return brand ? lookOf(brand, c?.brief || state.brief) : null;
    },
    network: draft.network ? networkById(draft.network) : null,
    shapes,
    renderFeedPreview,
    repaint: () => paint(),
    redraw: redrawEntry,
    toast,
  });

  // Generate | Edit — the Image Studio's two peer modes, as DS tabs in the header.
  // No Generate | Edit tabs any more (2026-10-02): Generate → Edit is the Edit
  // button on the image itself; Edit → Generate is "Back to the variations"
  // above the editor. The header slot stays empty.
  const paintModes = () => {
    if (modes) modes.innerHTML = "";
  };

  // ── Controls ───────────────────────────────────────────────────────────────

  // Five styles after the "From an image" tile: the image the user brought
  // first, then the Playbook's own, then the presets.
  const QUICK = 6;
  const quickStyles = (brand) => {
    const own = getStylesForBrand(brand.id).filter((s) => s.kind === "custom");
    const list = [...own, ...QUICK_PRESETS.map(getStyle).filter(Boolean)].filter(
      (s, i, a) => a.findIndex((x) => x.id === s.id) === i,
    );
    const selected = getStyle(state.lastStyleId);
    // The "New style" tile takes the first of the six places when the user can make one.
    const room = canEditBrand(brand.id) ? QUICK - 1 : QUICK;
    const top = list.slice(0, room);
    if (selected && !top.some((s) => s.id === selected.id)) top[room - 1] = selected;
    return top;
  };

  // ── "From an image": a style read from the user's own pictures ─────────────

  // Every one-off made while the dialog is open; the ones nobody saved lose
  // their images when it closes (what was generated keeps its colours).
  const oneOffsMade = [];

  async function styleFromImages(files, refId = null) {
    const brand = brandNow();
    if (!brand || state.oneOffBusy) return;
    state.oneOffBusy = true;
    paint();
    try {
      const style = await oneOffStyleFrom(brand.id, files);
      if (!alive) return;
      registerOneOffStyle(style);
      oneOffsMade.push(style);
      state.oneOff = style;
      state.refId = refId; // which of the Playbook's references it is, if any
      state.oneOffBusy = false;
      state.source = "image";
      state.sourceError = "";
      setStyle(style.id);
    } catch (error) {
      state.oneOffBusy = false;
      toast(error.message || "The image couldn't be read.", { variant: "error" });
      paint();
    }
  }

  // The Playbook's default reference image goes down the "From an image" path,
  // a one-off like any upload (deleted when the studio closes).
  async function styleFromPlaybookReference(url) {
    try {
      const blob = await (await fetch(url)).blob();
      const ref = getPlaybookReferences(brandNow()?.id).find((r) => r.url === url);
      await styleFromImages(
        [new File([blob], ref?.label || "Playbook reference", { type: blob.type })],
        ref?.id || null,
      );
    } catch {
      // An unreadable image leaves the chooser as it is.
    }
  }

  function pickStyleImages() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => input.files?.length && styleFromImages(input.files));
    input.click();
  }

  // "New style": the Playbook's style creator in a POPOVER anchored to the tile
  // that opened it — it opens beside the tile, over the edge of the column and
  // the preview, a caret pointing back at the tile; nothing is dimmed.
  // The panel is one node kept across repaints (the studio redraws its body
  // on every change; the creator owns its own DOM). Save puts the style on the
  // Playbook (Brand › Image styles) and picks it; Cancel or × just closes.
  let creatorPanel = null;
  let creatorOff = null;
  // The panel grows as images come in: keep it inside the studio as it does.
  const creatorResize = new ResizeObserver(() => placeNewStyle());
  function openNewStyle() {
    const brand = brandNow();
    if (!brand || !canEditBrand(brand.id) || creatorPanel) return;
    creatorPanel = document.createElement("section");
    creatorPanel.className = "imst-stylepop";
    creatorPanel.setAttribute("role", "dialog");
    creatorPanel.setAttribute("aria-labelledby", "imst-stylepop-title");
    creatorPanel.innerHTML = toString(html`
      <header class="imst-stylepop__head">
        <div>
          <h3 class="imst-stylepop__title" id="imst-stylepop-title">Create a style</h3>
          <p class="ap-caption">
            Part of ${brand.playbookName || brand.name}'s brand, for every image made with this Playbook.
          </p>
        </div>
        <button type="button" class="ap-icon-button transparent grey" data-imst-stylepop-close aria-label="Close">
          <i class="ap-icon-close" aria-hidden="true"></i>
        </button>
      </header>
      <div class="imst-stylepop__body" data-imst-creator-host></div>
      <footer class="imst-stylepop__foot" data-imst-stylepop-foot></footer>
    `);
    creatorOff = mountStyleCreator(
      creatorPanel.querySelector("[data-imst-creator-host]"),
      { id: brand.id },
      {},
      {
        embed: {
          footer: creatorPanel.querySelector("[data-imst-stylepop-foot]"),
          onSaved(style) {
            closeNewStyle();
            state.source = "style";
            setStyle(style.id);
          },
          onCancel() {
            closeNewStyle();
            paint();
          },
        },
      },
    );
    creatorResize.observe(creatorPanel);
    target.addEventListener("scroll", placeNewStyle, true);
    window.addEventListener("resize", placeNewStyle);
    paint();
    creatorPanel.querySelector("[data-imst-stylepop-close]")?.focus({ preventScroll: true });
  }
  function closeNewStyle() {
    creatorOff?.();
    creatorOff = null;
    creatorResize.disconnect();
    creatorPanel?.remove();
    creatorPanel = null;
    target.removeEventListener("scroll", placeNewStyle, true);
    window.removeEventListener("resize", placeNewStyle);
  }
  // Beside the New style tile, its top level with the tile's, kept inside the studio.
  function placeNewStyle() {
    const studio = target.querySelector(".imst-studio");
    const tile = target.querySelector('[data-imst-action="new-style"]');
    if (!creatorPanel || !studio || !tile) return;
    if (creatorPanel.parentNode !== studio) studio.append(creatorPanel);
    const sr = studio.getBoundingClientRect();
    const tr = tile.getBoundingClientRect();
    const gap = 12;
    const h = creatorPanel.offsetHeight;
    const top = Math.max(0, Math.min(tr.top - sr.top, sr.height - h));
    creatorPanel.style.left = `${tr.right - sr.left + gap}px`;
    creatorPanel.style.top = `${top}px`;
    // The caret stays on the tile even when the panel had to move up.
    creatorPanel.style.setProperty("--imst-caret-top", `${Math.max(16, tr.top - sr.top - top + tr.height / 2)}px`);
  }

  // "Best for" + the network's icon; its name goes in title / aria-label.
  const bestFor = (networks) =>
    html`<span class="ap-caption imst-best"
      >Best for
      <span class="imst-best__nets"
        >${networks.map(
          (n) =>
            html`<i
              class="${networkById(n).icon}"
              role="img"
              aria-label="${networkById(n).label}"
              title="${networkById(n).label}"
            ></i>`,
        )}</span
      ></span
    >`;

  // ── Start from: where the image's look comes from ─────────────────────────
  // One question, three exclusive answers. The open answer shows its own
  // controls under its card; switching keeps the others' choice in memory.
  const SOURCES = [
    {
      id: "style",
      icon: "ap-icon-bookmark",
      title: "A style",
      label: "Start from a style",
      text: "Pick one of your Playbook's styles, or one of ours. Every image comes out in the same look.",
      when: "Good for posts that should look like the brand.",
      short: "Every image in the same look.",
    },
    {
      id: "image",
      icon: "ap-icon-image",
      title: "An image",
      label: "Start from an image",
      text: "Upload a picture whose look you like. The new image borrows its colours and feel, just this once.",
      when: "Good when you have a reference in mind.",
      short: "The look of your picture, just this once.",
    },
    {
      id: "scratch",
      icon: "ap-icon-pen",
      title: "From scratch",
      label: "Start from scratch",
      text: "No style at all. Describe the subject, the medium, the light, the mood: your words decide.",
      when: "Good for a one-off that shouldn't look like the rest.",
      short: "Your words alone, no style.",
    },
  ];

  const styleTile = (brand, s) =>
    html`<button
      type="button"
      class="imst-tile"
      role="radio"
      aria-checked="${s.id === state.brief.styleId}"
      data-imst-style="${s.id}"
      aria-label="${s.label}"
    >
      ${styleThumb(s, lookOf(brand, state.brief), { className: "imst-tile__img", seed: hashString(s.id) })}
      ${s.kind === "custom" ? html`<span class="ap-tag grey mini imst-mine"><span>My style</span></span>` : ""}
      <span class="imst-tile__name">${s.label}</span>
      ${s.id === state.brief.styleId
        ? html`<span class="imst-tile__check" aria-hidden="true"><i class="ap-icon-check"></i></span>`
        : ""}
    </button>`;

  const sourceBody = (brand, style, styleCount) => {
    if (state.source === "style")
      return html`<section class="imst-ctl" aria-labelledby="imst-ctl-style">
        <header class="imst-ctl__head">
          <h3 class="imst-ctl__label ap-body-bold" id="imst-ctl-style">Style</h3>
          <button type="button" class="ap-link" data-imst-action="all-styles">All ${styleCount} styles</button>
        </header>
        <div class="imst-tiles" role="radiogroup" aria-labelledby="imst-ctl-style">
          ${canEditBrand(brand.id)
            ? html`<button type="button" class="imst-tile imst-tile--new" data-imst-action="new-style">
                <span class="imst-tile__new-art" aria-hidden="true"><i class="ap-icon-plus"></i></span>
                <span class="imst-tile__new-name">New style</span>
              </button>`
            : ""}
          ${quickStyles(brand).map((s) => styleTile(brand, s))}
        </div>
        <p class="ap-caption imst-start__note">
          ${style
            ? html`<span class="ap-body-bold">${style.label}</span>${style.kind === "custom"
                  ? " · My style"
                  : ""}${style.description ? ` — ${style.description}` : ""}`
            : ""}
        </p>
      </section>`;
    if (state.source === "image") {
      // Its own section, titled like the column's others; the recall above shows the picture.
      // The Playbook's reference images, one click away: each is read like an upload.
      const refs = getPlaybookReferences(brand.id);
      const refTiles = refs.length
        ? html`<div class="imst-tiles" role="radiogroup" aria-label="From your Playbook">
            ${refs.map(
              (r) =>
                html`<button
                  type="button"
                  class="imst-tile"
                  role="radio"
                  aria-checked="${r.id === state.refId}"
                  data-imst-ref="${r.url}"
                  aria-label="${r.label}"
                >
                  <img class="imst-tile__img" src="${r.url}" alt="" draggable="false" />
                  ${r.label ? html`<span class="imst-tile__name">${r.label}</span>` : ""}
                  ${r.id === state.refId
                    ? html`<span class="imst-tile__check" aria-hidden="true"><i class="ap-icon-check"></i></span>`
                    : ""}
                </button>`,
            )}
          </div>`
        : "";
      const section = (head, body) =>
        html`<section class="imst-ctl" aria-labelledby="imst-ctl-image">
          <header class="imst-ctl__head">
            <h3 class="imst-ctl__label ap-body-bold" id="imst-ctl-image">Your image</h3>
            ${head}
          </header>
          ${body} ${state.oneOffBusy ? "" : refTiles}
        </section>`;
      if (state.oneOffBusy)
        return section(
          "",
          html`<div class="imst-start__drop" aria-busy="true">
            <span class="ap-loader size-24"></span>
            <span class="ap-body-bold">Reading your image…</span>
          </div>`,
        );
      if (!state.oneOff)
        return section(
          "",
          html`<div class="imst-start__drop${state.sourceError ? " has-error" : ""}" data-imst-style-drop>
              <i class="ap-icon-upload imst-start__drop-icon" aria-hidden="true"></i>
              <span class="ap-body">Drop an image here, or</span>
              <button type="button" class="ap-button stroked blue" data-imst-action="style-from-image">
                <span>Upload an image</span>
              </button>
            </div>
            ${state.sourceError
              ? html`<span class="ap-form-message error" role="alert">${state.sourceError}</span>`
              : ""}`,
        );
      // The picture itself, in the slot it was dropped in: it still takes a drop,
      // and Replace sits on it — the upload stays where it was.
      return section(
        "",
        html`<div class="imst-start__image" data-imst-style-drop>
          ${assetImg(state.oneOff.custom.sources[0].ref, { className: "imst-thumb imst-start__image-img" })}
          <div class="imst-start__image-text">
            <span class="ap-caption">Its look, for this image only.</span>
          </div>
          <button type="button" class="ap-button stroked blue" data-imst-action="style-from-image">
            <i class="ap-icon-upload" aria-hidden="true"></i><span>Replace</span>
          </button>
        </div>`,
      );
    }
    return "";
  };

  // The chooser: the dialog opens on the one decision that shapes the rest —
  // where the image's look comes from — before any control. Each answer is a
  // card that shows what it does: the brand's styles fanned out, a picture
  // passing its look on, a sentence being typed.
  // `live`: the recall's copy, which shows the CURRENT pick — the chosen style
  // in the middle of the fan, the user's own picture once it is read.
  const fanStyles = (brand, live) => {
    const list = quickStyles(brand).slice(0, 3);
    const picked = live && getStyle(state.brief.styleId);
    if (!picked) return list;
    const rest = list.filter((s) => s.id !== picked.id);
    return [rest[0], picked, rest[1]].filter(Boolean);
  };

  const chooserArt = (brand, id, { live = false } = {}) => {
    const look = lookOf(brand, state.brief);
    if (id === "style") {
      const own = getStylesForBrand(brand.id).filter((s) => s.kind === "custom").length;
      return html`<span class="ap-tag grey imst-chooser__count"
          ><span
            >${own
              ? `${own} ${brand.name} style${own === 1 ? "" : "s"}`
              : `${STYLE_PRESETS.length} ready-made styles`}</span
          ></span
        ><span class="imst-chooser__fan">
          ${fanStyles(brand, live).map((s) =>
            styleThumb(s, look, { className: "imst-chooser__fan-card", seed: hashString(s.id) }),
          )}
        </span>`;
    }
    if (id === "image") {
      const ref = getStyle("preset-photoreal") || quickStyles(brand)[0];
      const own = live && state.oneOff;
      return html`<span class="imst-chooser__pass">
        <span class="imst-chooser__ref"
          >${own
            ? assetImg(state.oneOff.custom.sources[0].ref, { className: "imst-thumb imst-chooser__pass-img" })
            : styleThumb(ref, look, { className: "imst-chooser__pass-img", seed: 7 })}<span
            class="imst-chooser__badge imst-chooser__badge--upload"
            ><i class="ap-icon-upload"></i></span
        ></span>
        <i class="ap-icon-arrow-right imst-chooser__arrow" aria-hidden="true"></i>
        <span class="imst-chooser__out"
          >${styleThumb(own ? state.oneOff : ref, look, {
            className: "imst-chooser__pass-img",
            seed: 41,
            kind: "place",
          })}</span
        >
      </span>`;
    }
    return html`<span class="imst-chooser__words">
      <span class="imst-chooser__line"
        >A watercolour of a lighthouse at dusk, soft light, a quiet sea<span class="imst-chooser__caret"></span
      ></span>
      <span class="imst-chooser__badge imst-chooser__badge--spark"><i class="ap-icon-sparkles"></i></span>
    </span>`;
  };

  let chooserShown = false;
  const renderChooser = (brand) => {
    const entering = !chooserShown;
    chooserShown = true;
    return html`
      <div class="imst-chooser${entering ? " is-entering" : ""}">
        <div class="imst-chooser__head">
          <h2 class="ap-h2 imst-chooser__title" id="imst-chooser-title">How do you want to start?</h2>
          <p class="ap-body imst-chooser__lead">
            It decides where the image's look comes from. You can change it at any time.
          </p>
        </div>
        <div class="imst-chooser__grid" role="list" aria-labelledby="imst-chooser-title">
          ${SOURCES.map(
            (o) =>
              html`<button type="button" class="imst-chooser__card" role="listitem" data-imst-source="${o.id}">
                <span class="imst-chooser__art" aria-hidden="true">${chooserArt(brand, o.id)}</span>
                <span class="imst-chooser__body">
                  <span class="imst-chooser__name">${o.title}</span>
                  <span class="ap-body imst-chooser__text">${o.text}</span>
                  <span class="ap-caption imst-chooser__when">${o.when}</span>
                </span>
              </button>`,
          )}
        </div>
        ${draft.imageUrl
          ? html`<p class="ap-body imst-chooser__or">
              Or keep the draft's ${draft.slides > 1 ? "carousel" : "image"} and change it:
              <button type="button" class="ap-link standalone" data-imst-mode="edit">
                <i class="ap-icon-pen" aria-hidden="true"></i><span>Edit the current image</span>
              </button>
            </p>`
          : ""}
      </div>
    `;
  };

  // In the controls: what was chosen, in one line, and the way back to the chooser.
  const renderSource = (brand, style, styleCount) => {
    const picked = SOURCES.find((o) => o.id === state.source);
    // The thumbnail lands once, right after the pick — the chooser's card, shrunk into the column.
    const landing = state.justPicked;
    state.justPicked = false;
    return html`
      <section class="imst-ctl" aria-labelledby="imst-ctl-source">
        <h3 class="imst-start__sr" id="imst-ctl-source">${picked.label}</h3>
        <button
          type="button"
          class="imst-start__recall${landing ? " is-landing" : ""}"
          data-imst-action="change-source"
          ${picked.id === "image" ? "data-imst-style-drop" : ""}
          aria-label="${picked.label}. Change where the look comes from"
        >
          <!-- Looks like the DS icon button, a way back to the chooser; a span, since the whole row is the button. -->
          <span class="ap-icon-button stroked imst-start__change" aria-hidden="true"
            ><i class="ap-icon-arrow-left"></i
          ></span>
          <span class="imst-start__what">
            <span class="imst-start__name">${picked.title}</span>
            <span class="ap-caption">${picked.short}</span>
          </span>
          <span class="imst-start__mini" aria-hidden="true"
            ><span class="imst-start__mini-art imst-chooser__art"
              >${chooserArt(brand, picked.id, { live: true })}</span
            ></span
          >
        </button>
      </section>
      ${sourceBody(brand, style, styleCount)}
    `;
  };

  const renderControls = (brand) => {
    const b = state.brief;
    const style = getStyle(b.styleId);
    const shape = shapeForFormat(b.formatIds[0]);
    const format = formatById(b.formatIds[0]);
    const canEmbed = !style || !!style.supportsEmbeddedText;
    // Every shape for the same networks (a draft's dialog): say it once, beside the title.
    const nets = shapes().map((x) => x.networks.join(","));
    const sharedNets = nets.every((n) => n === nets[0]) ? shapes()[0]?.networks : null;
    const styleCount = getStylesForBrand(brand.id).length || STYLE_PRESETS.length;
    // A style and An image need no description: the post is the brief, and the
    // text on the image takes its place. From scratch is the words alone.
    const describeSection = html` <section class="imst-ctl">
      <label class="imst-ctl__label ap-body-bold" for="imst-prompt">Describe the image</label>
      <div class="imst-composer${state.error ? " has-error" : ""}">
        <textarea
          id="imst-prompt"
          class="imst-composer__input"
          rows="4"
          data-imst-field="prompt"
          placeholder="${state.source === "scratch"
            ? "Describe everything: the subject, the medium, the light, the mood…"
            : "What should the image show? A scene, a subject, a mood…"}"
          ${state.error ? html`aria-invalid="true" aria-describedby="imst-prompt-error"` : ""}
        >
${b.prompt}</textarea
        >
        <div class="imst-composer__bar">
          ${draft.text
            ? html`<button type="button" class="ap-button mermaid" data-imst-action="suggest">
                <i class="ap-icon-sparkles" aria-hidden="true"></i><span>Suggest from the post</span>
              </button>`
            : ""}
        </div>
      </div>
      ${state.error
        ? html`<span class="ap-form-message error" id="imst-prompt-error" role="alert">${state.error}</span>`
        : ""}
    </section>`;
    const shapeSection = html` <section class="imst-ctl" aria-labelledby="imst-ctl-shape">
      <header class="imst-ctl__head">
        <div class="imst-ctl__title">
          <h3 class="imst-ctl__label ap-body-bold" id="imst-ctl-shape">Shape</h3>
          ${sharedNets ? bestFor(sharedNets) : ""}
        </div>
        <span class="ap-caption imst-ctl__meta">${format.width} × ${format.height} px</span>
      </header>
      <div class="imst-seg" role="radiogroup" aria-labelledby="imst-ctl-shape">
        ${shapes().map(
          (s) =>
            html`<button
              type="button"
              class="imst-seg__opt"
              role="radio"
              aria-checked="${s.id === shape.id}"
              data-imst-shape="${s.id}"
              aria-label="${s.label} ${s.ratio}, best for ${s.networks.map((n) => networkById(n).label).join(", ")}"
            >
              <span class="imst-seg__box"
                ><span
                  class="imst-seg__frame"
                  style="aspect-ratio: ${s.w} / ${s.h}; ${s.w >= s.h ? "width: 100%" : "height: 100%"}"
                ></span
              ></span>
              <span class="imst-seg__name">${s.label}</span>
              <span class="ap-caption imst-seg__ratio">${s.ratio}</span>
              ${sharedNets ? "" : bestFor(s.networks)}
            </button>`,
        )}
      </div>
    </section>`;
    const textSection = html` <section class="imst-ctl" aria-labelledby="imst-ctl-text">
      <header class="imst-ctl__head">
        <h3 class="imst-ctl__label ap-body-bold" id="imst-ctl-text">Text on the image</h3>
        <span class="ap-caption imst-ctl__meta">Optional</span>
      </header>
      <div class="imst-composer imst-composer--line">
        <input
          type="text"
          class="imst-composer__line"
          data-imst-field="headline"
          value="${b.headline}"
          placeholder="A headline, e.g. Plans that name their signal"
          aria-labelledby="imst-ctl-text"
        />
        ${draft.text
          ? html`<button
              type="button"
              class="ap-button mermaid"
              data-imst-action="suggest-headline"
              aria-label="Suggest a headline from the post"
              data-tooltip="${b.headline ? "Another line from the post" : "A line from the post"}"
            >
              <i class="ap-icon-sparkles" aria-hidden="true"></i><span>Suggest</span>
            </button>`
          : ""}
      </div>
      <div class="imst-ctl__toggle-row">
        <label class="ap-toggle-container imst-ctl__toggle">
          <input
            type="checkbox"
            data-imst-textmode
            ${b.textMode === "embedded" ? "checked" : ""}
            ${canEmbed ? "" : "disabled"}
          /><i></i><span>Write it into the image</span>
        </label>
        <!-- Beside the label, not in it: a click on the ⓘ must not flip the switch. -->
        <i
          class="ap-icon-info imst-ctl__info"
          tabindex="0"
          role="img"
          aria-label="What writing the text into the image changes"
          data-tooltip="Written in, the text is painted into the picture: it takes on the style's lettering and texture, but can't be edited or moved afterwards. Left off, it stays a layer you can change any time."
        ></i>
      </div>
      <span class="ap-caption imst-ctl__note"
        >${!canEmbed
          ? `${style.label} can't write text, so it stays an editable layer you can move and restyle.`
          : b.textMode === "embedded"
            ? "Part of the picture — it won't be editable afterwards."
            : "Otherwise it stays an editable layer you can move and restyle."}</span
      >
      ${state.warning
        ? html`<span class="ap-caption imst-ctl__warn" role="status"
            ><i class="ap-icon-warning_fill" aria-hidden="true"></i> ${state.warning}</span
          >`
        : ""}
    </section>`;
    return html`
      <aside class="imst-controls" aria-label="Image settings">
        <div class="imst-controls__scroll">
          ${renderSource(brand, style, styleCount)}
          ${state.source === "scratch" ? html`${describeSection}${shapeSection}` : html`${textSection}${shapeSection}`}
          <section class="imst-ctl" aria-labelledby="imst-ctl-count">
            <header class="imst-ctl__head imst-ctl__head--control">
              <h3 class="imst-ctl__label ap-body-bold" id="imst-ctl-count">Variations</h3>
              <div class="ap-segmented-control" role="radiogroup" aria-labelledby="imst-ctl-count">
                ${[1, 2, 3, 4].map(
                  (n) =>
                    html`<button
                      type="button"
                      class="ap-segmented-control__segment${n === b.count
                        ? " ap-segmented-control__segment--selected"
                        : ""}"
                      role="radio"
                      aria-checked="${n === b.count}"
                      aria-label="${variationsLabel(n)}"
                      data-imst-action="count"
                      data-imst-count="${n}"
                    >
                      <span class="ap-segmented-control__label">${n}</span>
                    </button>`,
                )}
              </div>
            </header>
          </section>
        </div>
      </aside>
    `;
  };

  // ── Canvas ─────────────────────────────────────────────────────────────────

  const stageFrame = (format, inner, extra = "") => html`
    <div class="imst-stage2" style="--imst-ratio: ${format.width / format.height}">
      <div class="imst-stage2__frame ${extra}">${inner}</div>
    </div>
  `;

  const renderPreview = (brand) => {
    const b = state.brief;
    const style = getStyle(b.styleId);
    const format = formatById(b.formatIds[0]);
    const pseudo = { title: "Preview", brief: { ...b }, styleSnapshot: style, master: { layers: [] } };
    // "An image" with none yet: nothing to preview, and a free render would mislead.
    if (state.source === "image" && !style)
      return html`
        <div class="imst-canvas-area imst-canvas-area--preview">
          ${stageFrame(
            format,
            html`<span class="imst-stage2__status"
              ><i class="ap-icon-image imst-start__drop-icon" aria-hidden="true"></i
              ><span class="ap-body-bold">Add an image: its look becomes this image's.</span></span
            >`,
            "is-preview",
          )}
        </div>
      `;
    const seed = hashString(
      `${style?.id || "scratch"}|${b.productId || ""}|${b.prompt.length > 10 ? b.prompt.slice(0, 40) : ""}`,
    );
    return html`
      <div class="imst-canvas-area imst-canvas-area--preview">
        ${stageFrame(
          format,
          html`${variationCanvas({
              creation: pseudo,
              variation: { seed, bgSeed: seed ^ 91, subjectSeed: seed ^ 17 },
              formatId: format.id,
              brand: lookOf(brand, b),
            })}<span class="ap-tag grey imst-stage2__badge"><span>Preview</span></span>`,
          "is-preview",
        )}
        <p class="ap-body imst-canvas-area__caption">
          <span class="ap-body-bold"
            >${!style
              ? `From your words alone, in ${brand.name}'s colours.`
              : `A preview of ${style.oneOff ? "your image's style" : style.label} in ${brand.name}'s colours.`}</span
          >
          ${state.source === "scratch" ? "Describe what you want and generate" : "Generate: I'll draw from the post"} —
          you'll get ${b.count === 1 ? "one image" : `${b.count} variations to pick from`}.
        </p>
      </div>
    `;
  };

  // Generating: the image loader (src/archie-pixels.js, in Archie's colours) on
  // the stage and on each tile to come. The stage's loader narrates its own
  // stages; the run's start keeps them in step.
  const renderLoading = () => {
    const format = formatById(state.brief.formatIds[0]);
    const style = getStyle(state.brief.styleId);
    return html`
      <div class="imst-canvas-area" aria-live="polite" aria-busy="true">
        ${stageFrame(
          format,
          html`<archie-pixels
            role="status"
            aria-label="Generating ${variationsLabel(state.brief.count).toLowerCase()}${style
              ? ` in ${style.label}`
              : ""}"
            data-since="${state.run.since}"
          ></archie-pixels>`,
        )}
        <div class="imst-filmstrip">
          ${Array.from(
            { length: state.brief.count > 1 ? state.brief.count : 0 },
            () =>
              html`<span
                class="imst-filmstrip__item is-loading"
                style="aspect-ratio: ${format.width} / ${format.height}"
                ><archie-pixels data-since="${state.run.since}"></archie-pixels
              ></span>`,
          )}
        </div>
      </div>
    `;
  };

  // The arrival over the images a run just made, one tile after the other.
  const revealAt = (id) => {
    const r = state.reveal;
    const at = r && r.ids.includes(id) ? r.at + r.ids.indexOf(id) * 90 : 0;
    return at && Date.now() - at < REVEAL_MS ? html`<archie-pixels data-reveal-at="${at}"></archie-pixels>` : "";
  };

  const renderError = () => html`
    <div class="imst-canvas-area imst-canvas-area--center">
      <div class="ap-infobox error" role="alert">
        <i class="ap-icon-warning_fill" aria-hidden="true"></i>
        <div class="ap-infobox-content">
          <div class="ap-infobox-texts">
            <div class="ap-infobox-title">Generation failed</div>
            <div class="ap-infobox-message">Nothing was lost — your brief is still on the left.</div>
          </div>
          <button type="button" class="ap-button ghost blue" data-imst-action="generate">Try again</button>
        </div>
      </div>
    </div>
  `;

  // The draft's own card with the baked variation in it — the same PNG Use in
  // draft writes, so text and logo sit exactly where they will. A shimmer the
  // time it takes to bake (first view of a variation only).
  const renderFeed = (brand, c, v, netLabel, regenerating) => {
    const key = variationKey(c, v);
    const url = state.busy.has(v.id) ? null : edited(key) ? editedUrl(key) : feedUrl(brand, c, v);
    return html`
      <div class="imst-feed">
        <p class="ap-caption imst-feed__note">How this post looks${netLabel ? ` on ${netLabel}` : " in the feed"}</p>
        <div class="imst-feed__card">
          ${url
            ? raw(renderFeedPreview(url))
            : html`<div class="imst-feed__pending" aria-busy="true">
                <span class="imst-shimmer"></span>${regenerating ||
                html`<span class="imst-stage2__status"><span class="ap-loader size-30"></span></span>`}
              </div>`}
        </div>
      </div>
    `;
  };

  // A variation edited in Edit shows AS EDITED here — its layers baked — so
  // the tab you come back to and the image Use in draft sends agree.
  const renderEdited = (brand, c, v, format) => {
    const entry = entries.get(variationKey(c, v));
    const url = editedUrl(variationKey(c, v));
    const shape = { ...format, width: entry.doc.w, height: entry.doc.h };
    return stageFrame(
      shape,
      html`${url
          ? html`<img class="imst-edited" src="${url}" alt="The edited image" />`
          : variationCanvas({ creation: c, variation: v, formatId: format.id, brand: lookOf(brand, c.brief) })}<span
          class="ap-tag blue imst-stage2__badge"
          ><span>Edited</span></span
        >`,
    );
  };

  const renderResults = (brand, c) => {
    const format = formatById(c.brief.formatIds[0]);
    const v = focused(c);
    // Every image of this session in ONE strip, oldest first, a gap between
    // runs — no "earlier" section and no batch jargon ("Like variation 2") —
    // and a "+" tile at the end that adds one more.
    const runs = c.batches?.length ? [...c.batches].reverse() : [latestBatch(c)];
    const strip = runs.flatMap((bt) => batchVariations(c, bt).map((x, i) => ({ x, runStart: i === 0 })));
    const shown = new Set(strip.map((e) => e.x.id));
    c.variations.filter((x) => !shown.has(x.id)).forEach((x, i) => strip.push({ x, runStart: i === 0 }));
    const index = strip.findIndex((e) => e.x.id === v.id);
    const busy = state.busy.has(v.id);
    const style = c.styleSnapshot || getStyle(c.brief.styleId);
    // null: no card to preview in (the studio opened without one).
    const feedView = renderFeedPreview ? state.view === "feed" : null;
    const net = draft.network ? networkById(draft.network) : null;
    const netLabel = net?.label || "";
    const regenerating = busy
      ? html`<span class="imst-stage2__status"
          ><span class="ap-loader size-30"></span><span class="ap-body-bold">Regenerating…</span></span
        >`
      : "";
    const stage = feedView
      ? renderFeed(brand, c, v, netLabel, regenerating)
      : !busy && edited(variationKey(c, v))
        ? renderEdited(brand, c, v, format)
        : null;
    return html`
      <div class="imst-canvas-area">
        <header class="imst-result-bar">
          <div class="imst-result-bar__what">
            <span class="ap-body-bold"
              >${strip.length > 1 ? `Variation ${index + 1} of ${strip.length}` : "Your image"}</span
            >
            <span class="ap-caption"
              >${style?.label || "From scratch"} · ${shapeForFormat(format.id).label}
              ${shapeForFormat(format.id).ratio}</span
            >
          </div>
          <div class="imst-result-bar__actions">
            ${feedView !== null
              ? html`<div class="imst-view-toggle" role="group" aria-label="Show the result">
                  <button type="button" class="ap-filter-chip" data-imst-view="image" aria-pressed="${!feedView}">
                    <i class="ap-icon-image" aria-hidden="true"></i>Image
                  </button>
                  <button
                    type="button"
                    class="ap-filter-chip"
                    data-imst-view="feed"
                    aria-pressed="${feedView}"
                    title="${netLabel ? `Preview on ${netLabel}` : "Preview in the feed"}"
                  >
                    ${net ? html`<i class="${net.icon}" aria-hidden="true"></i>` : ""}In feed
                  </button>
                </div>`
              : ""}
            <!-- Into Edit on this variation (the only way in from here: no tabs). -->
            <button type="button" class="ap-button stroked grey" data-imst-mode="edit" ${busy ? "disabled" : ""}>
              <i class="ap-icon-pen" aria-hidden="true"></i><span>Edit</span>
            </button>
            <button
              type="button"
              class="ap-icon-button transparent grey"
              data-imst-var="regenerate"
              aria-label="Regenerate this variation"
              data-tooltip="Regenerate"
              ${busy ? "disabled" : ""}
            >
              <i class="ap-icon-refresh" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="ap-icon-button transparent grey"
              data-imst-var="download"
              aria-label="Download as PNG"
              data-tooltip="Download PNG"
            >
              <i class="ap-icon-download" aria-hidden="true"></i>
            </button>
          </div>
        </header>
        ${stage ||
        stageFrame(
          format,
          html`${variationCanvas({
            creation: c,
            variation: v,
            formatId: format.id,
            brand: lookOf(brand, c.brief),
          })}${revealAt(v.id)}${regenerating}`,
        )}
        ${strip.length
          ? html` <div class="imst-filmstrip" role="listbox" aria-label="Variations" data-imst-strip>
              ${strip.map(
                ({ x, runStart }, i) =>
                  html`<button
                    type="button"
                    class="imst-filmstrip__item${runStart && i > 0 ? " is-run-start" : ""}"
                    role="option"
                    aria-selected="${x.id === v.id}"
                    data-imst-focus="${x.id}"
                    aria-label="Variation ${i + 1}"
                    style="aspect-ratio: ${format.width} / ${format.height}"
                  >
                    ${variationCanvas({
                      creation: c,
                      variation: x,
                      formatId: format.id,
                      brand: lookOf(brand, c.brief),
                    })}${revealAt(x.id)}
                  </button>`,
              )}
              ${state.addingOne
                ? html`<span
                    class="imst-filmstrip__item imst-filmstrip__add is-loading"
                    style="aspect-ratio: ${format.width} / ${format.height}"
                    role="status"
                    aria-label="Generating one more"
                    ><archie-pixels></archie-pixels
                  ></span>`
                : html`<button
                    type="button"
                    class="imst-filmstrip__item imst-filmstrip__add"
                    data-imst-var="add-one"
                    aria-label="Generate one more"
                    data-tooltip="One more"
                    style="aspect-ratio: ${format.width} / ${format.height}"
                    ${state.run.status === "loading" ? "disabled" : ""}
                  >
                    <i class="ap-icon-plus" aria-hidden="true"></i>
                  </button>`}
            </div>`
          : ""}
      </div>
    `;
  };

  // Edit, with its way back and what is being edited, in words.
  const renderEditing = () => {
    const src = editSource();
    const v = src?.variation;
    const what = !v
      ? `Editing the draft's ${draft.slides > 1 ? "first slide" : "image"}`
      : `Editing variation ${src.creation.variations.indexOf(v) + 1} of ${src.creation.variations.length}`;
    // In the stage, at its top — where Generate shows its result bar.
    return editor.render({
      top: html`<header class="imst-result-bar imst-editbar">
        <button type="button" class="ap-button stroked blue" data-imst-mode="generate">
          <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>${v ? "Back to the variations" : "Back"}</span>
        </button>
        <span class="ap-caption imst-editbar__what">${what}</span>
      </header>`,
    });
  };

  const renderCurrent = () => html`
    <div class="imst-canvas-area imst-canvas-area--preview">
      <div class="imst-stage2">
        <div class="imst-current">
          <img class="imst-current__img" src="${draft.imageUrl}" alt="The draft's current image" />
          <span class="ap-tag grey imst-stage2__badge"
            ><span>${draft.slides > 1 ? `Current carousel · slide 1 of ${draft.slides}` : "Current image"}</span></span
          >
        </div>
      </div>
      <p class="ap-body imst-canvas-area__caption">
        Pick a style or describe a new one — a new image replaces the draft's ${draft.slides > 1 ? "carousel" : "image"}
        only when you choose.
      </p>
      <div class="imst-current__actions">
        <button type="button" class="ap-button stroked grey" data-imst-mode="edit">
          <i class="ap-icon-pen" aria-hidden="true"></i><span>Edit this image</span>
        </button>
      </div>
    </div>
  `;

  const renderCanvas = (brand) => {
    if (state.run.status === "loading") return renderLoading();
    if (state.run.status === "error") return renderError();
    const c = currentCreation();
    if (c && c.variations.length) return renderResults(brand, c);
    if (state.showCurrent) return renderCurrent();
    return renderPreview(brand);
  };

  // Cancel · Generate (orange: the AI action) · Use in draft (the final one, primary).
  // Once there is a result, Generate steps back to "Generate again".
  const useLabel = () => (draft.imageUrl ? "Replace the draft's image" : "Use in draft");
  const paintFooter = () => {
    if (!footer) return;
    if (footerLeft) footerLeft.innerHTML = state.mode === "edit" ? toString(editor.footerLeft()) : "";
    if (state.mode === "edit") {
      const ready = !!editEntry() && !editor.isBusy();
      footer.innerHTML = toString(html`
        <button type="button" class="ap-button ghost grey" data-imst-action="cancel">Cancel</button>
        <button
          type="button"
          class="ap-button primary blue${state.using ? " loading" : ""}"
          data-imst-var="use"
          ${state.using || !ready ? "disabled" : ""}
        >
          <i class="ap-icon-check" aria-hidden="true"></i><span>${useLabel()}</span>
        </button>
      `);
      return;
    }
    if (brandNow() && !state.source) {
      footer.innerHTML = toString(
        html`<button type="button" class="ap-button ghost grey" data-imst-action="cancel">Cancel</button>`,
      );
      return;
    }
    const c = currentCreation();
    const running = state.run.status === "loading";
    const result = !!(c && c.variations.length) && state.run.status !== "error";
    footer.innerHTML = toString(html`
      <button type="button" class="ap-button ghost grey" data-imst-action="cancel">Cancel</button>
      ${brandNow()
        ? html`<button
            type="button"
            class="ap-button ${result ? "secondary blue" : "primary orange"}${running ? " loading" : ""}"
            data-imst-action="generate"
            ${running ? "disabled" : ""}
          >
            <i class="ap-icon-sparkles" aria-hidden="true"></i
            ><span>${running ? "Generating…" : result ? "Generate again" : "Generate"}</span>
          </button>`
        : ""}
      ${result
        ? html`<button
            type="button"
            class="ap-button primary blue${state.using ? " loading" : ""}"
            data-imst-var="use"
            ${state.using || running ? "disabled" : ""}
          >
            <i class="ap-icon-check" aria-hidden="true"></i><span>${useLabel()}</span>
          </button>`
        : ""}
    `);
  };

  // Every paint rebuilds the body, and a rebuilt scroller starts at the top: a
  // click low in the settings column threw the reader back to the prompt. So
  // the scroll of each area that scrolls is read before and put back after —
  // and the dialog's content box too, which a focus or a click can nudge.
  const SCROLLERS = [".imst-controls__scroll", ".imst-canvas-col", ".imst-filmstrip", ".imst-layers__list"];
  const keepScroll = () => {
    const box = target.closest(".ap-dialog-content");
    const saved = SCROLLERS.map((sel) => {
      const el = target.querySelector(sel);
      return el ? { sel, top: el.scrollTop, left: el.scrollLeft } : null;
    }).filter(Boolean);
    return () => {
      saved.forEach(({ sel, top, left }) => {
        const el = target.querySelector(sel);
        if (el) {
          el.scrollTop = top;
          el.scrollLeft = left;
        }
      });
      if (box) box.scrollTop = 0;
    };
  };

  const paint = () => {
    if (!alive) return;
    const brand = brandNow();
    if ((brand?.id || null) !== state.brandId) brandChanged(brand);
    const restore = preserveFocus(target);
    const restoreScroll = keepScroll();
    if (!brand) {
      target.innerHTML = toString(
        renderEmpty({
          icon: "ap-icon-image",
          title: "This chat has no Playbook",
          body: "Images follow a brand, and the brand lives in the chat's Playbook. Pick one for this chat first.",
        }),
      );
      paintFooter();
      paintModes();
      return;
    }
    if (state.mode === "edit" && !canEdit()) state.mode = "generate";
    target.innerHTML = toString(
      state.mode === "edit"
        ? renderEditing()
        : !state.source
          ? renderChooser(brand)
          : html`<div class="imst-studio imst-studio--draft">
              ${renderControls(brand)}
              <main class="imst-canvas-col">${renderCanvas(brand)}</main>
            </div>`,
    );
    paintFooter();
    paintModes();
    hydrateAssets(target);
    // The style popover: the same node every time, re-anchored to its tile.
    placeNewStyle();
    restoreScroll();
    restore();
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const request = (brand, brief = state.brief, style = getStyle(brief.styleId)) => ({
    brief,
    brand: lookOf(brand, brief),
    style,
    product: brief.productId ? getProducts(brand.id).find((p) => p.id === brief.productId) : null,
    format: formatById(brief.formatIds[0]),
    textMode: brief.textMode,
    text: { headline: brief.headline },
    // The CURRENT choice, also for More like this on an earlier run.
    count: state.brief.count || 4,
  });

  async function generate() {
    const brand = brandNow();
    if (state.source === "scratch" && !state.brief.prompt.trim()) {
      state.error = "Describe the image first.";
      paint();
      target.querySelector("#imst-prompt")?.focus();
      return;
    }
    state.error = "";
    if (state.source === "image" && !state.oneOff) {
      state.sourceError = "Add an image first.";
      paint();
      return;
    }
    // A style / An image have no description field: what the image shows comes
    // from the post. From scratch is the words alone: no text on the image.
    const brief =
      state.source === "scratch"
        ? { ...state.brief, headline: "", textMode: "layer" }
        : { ...state.brief, prompt: state.brief.headline || String(draft.text || "").slice(0, 240) };
    const req = request(brand, brief);
    const creation = startCreation({ brand, brief, style: req.style });
    state.creationId = creation.id;
    state.focusId = null;
    state.run = { status: "loading", since: Date.now() };
    state.abort = new AbortController();
    paint();
    try {
      const variations = await imageGenerationService.generate(req, { signal: state.abort.signal });
      addBatch(creation.id, variations, { label: variationsLabel(variations.length) });
      state.reveal = { at: Date.now(), ids: variations.map((x) => x.id) };
      state.run = { status: "idle" };
    } catch (error) {
      if (error.name === "AbortError") return;
      deleteCreation(creation.id);
      state.creationId = null;
      state.run = { status: "error" };
    }
    paint();
  }

  /** The "+" tile: one more image from the same brief, into the latest run. */
  async function addOne() {
    const c = currentCreation();
    if (!c || state.addingOne) return;
    state.addingOne = true;
    paint();
    try {
      const [v] = await imageGenerationService.generate(
        { ...request(brandNow(), c.brief, c.styleSnapshot), count: 1 },
        {},
      );
      appendVariations(c.id, [v]);
      state.reveal = { at: Date.now(), ids: [v.id] };
      state.focusId = v.id;
    } catch {
      toast("That one didn't come through. Try again.", { variant: "error" });
    }
    state.addingOne = false;
    paint();
  }

  async function regenerate() {
    const brand = brandNow();
    const c = currentCreation();
    const v = focused(c);
    state.busy.add(v.id);
    paint();
    try {
      const next = await imageGenerationService.regenerate(v, "all", request(brand, c.brief, c.styleSnapshot));
      replaceVariation(c.id, v.id, next);
    } catch {
      toast("That variation failed to regenerate. Try again.", { variant: "error" });
    }
    state.busy.delete(v.id);
    paint();
  }

  /** A variation as the PNG the draft gets: image, text and logo baked. */
  function bake(brand, c, v) {
    const f = formatById(c.brief.formatIds[0]);
    return toPngBlob({
      svg: variationSvg({ creation: c, variation: v, formatId: f.id, brand: lookOf(brand, c.brief) }),
      width: f.width,
      height: f.height,
      layers: resolveLayers(layersFor({ creation: c, formatId: f.id }), lookOf(brand, c.brief)),
    });
  }

  const feedKey = (brand, c, v) =>
    `${c.id}|${v.id}|${v.seed}|${c.brief.formatIds[0]}|${c.brief.useBrand !== false}|${brand.id}`;

  /** The In feed image of a variation, baked once, then served from the cache. */
  function feedUrl(brand, c, v) {
    const key = feedKey(brand, c, v);
    if (feedUrls.has(key)) return feedUrls.get(key);
    feedUrls.set(key, null);
    bake(brand, c, v)
      .then((blob) => {
        if (!alive) return;
        feedUrls.set(key, URL.createObjectURL(blob));
        paint();
      })
      .catch(() => {
        feedUrls.delete(key);
        if (!alive) return;
        state.view = "image";
        toast("The feed preview couldn't be drawn.", { variant: "error" });
        paint();
      });
    return null;
  }

  /** Draft mode: the chosen variation, text and logo baked, into the post. */
  async function useInDraft() {
    const brand = brandNow();
    const c = currentCreation();
    state.using = true;
    paint();
    try {
      let dataUrl;
      if (state.mode === "edit") dataUrl = await editor.bake();
      else {
        const v = focused(c);
        const key = variationKey(c, v);
        const blob = edited(key) ? await bakeDoc(entries.get(key).doc) : await bake(brand, c, v);
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }
      onUse?.(dataUrl);
    } catch (error) {
      state.using = false;
      toast(error.message || "The image couldn't be added.", { variant: "error" });
      paint();
    }
  }

  // A suggestion takes as long as the real call (4–8 s): the field says it's
  // reading the post and shimmers, the button spins, the field is read-only
  // meanwhile. It then fills IN PLACE — nothing else is redrawn.
  async function suggestInto(button, field, ask) {
    if (!button || button.disabled) return;
    const input = target.querySelector(`[data-imst-field='${field}']`);
    const box = input?.closest(".imst-composer");
    const placeholder = input?.placeholder;
    // The DS way to say "working" on a button: the icon becomes the loader.
    const icon = button.querySelector("i");
    const spinner = document.createElement("span");
    spinner.className = "ap-loader size-16";
    icon?.replaceWith(spinner);
    button.classList.add("loading");
    button.disabled = true;
    box?.classList.add("is-suggesting");
    if (input) {
      input.readOnly = true;
      input.placeholder = "Reading the post…";
      if (!input.value) input.setAttribute("aria-busy", "true");
    }
    try {
      const text = await ask();
      state.brief[field] = text;
      if (input) {
        input.value = text;
        input.focus();
      }
      // The headline is drawn on the live preview: show it there too.
      if (field === "headline" && !currentCreation()) paint();
      if (field === "prompt" && state.error) {
        state.error = "";
        target.querySelector(".imst-composer")?.classList.remove("has-error");
        target.querySelector("#imst-prompt-error")?.remove();
      }
    } catch {
      toast("No suggestion this time. Try again.", { variant: "error" });
    } finally {
      if (icon) spinner.replaceWith(icon);
      button.classList.remove("loading");
      button.disabled = false;
      box?.classList.remove("is-suggesting");
      if (input) {
        input.readOnly = false;
        input.placeholder = placeholder;
        input.removeAttribute("aria-busy");
      }
    }
  }

  const suggestFromPost = (button) =>
    suggestInto(button, "prompt", () => copyService.promptFromPost({ brand: brandNow(), text: draft.text }));

  const suggestHeadline = (button) =>
    suggestInto(button, "headline", () =>
      copyService.headlineFromPost({
        text: draft.text,
        round: (state.headlineRound = (state.headlineRound ?? -1) + 1),
      }),
    );

  async function download() {
    const brand = brandNow();
    const c = currentCreation();
    const v = focused(c);
    const f = formatById(c.brief.formatIds[0]);
    try {
      const blob = await toPngBlob({
        svg: variationSvg({ creation: c, variation: v, formatId: f.id, brand: lookOf(brand, c.brief) }),
        width: f.width,
        height: f.height,
        layers: resolveLayers(layersFor({ creation: c, formatId: f.id }), lookOf(brand, c.brief)),
      });
      downloadBlob(blob, `${slug(c.title)}-${f.id}.png`);
      toast(`Downloaded ${f.width} × ${f.height} PNG.`);
    } catch (error) {
      toast(error.message || "The download failed.", { variant: "error" });
    }
  }

  function openStyleGallery() {
    const brand = brandNow();
    const own = getStylesForBrand(brand.id).filter((s) => s.kind === "custom");
    const card = (s) =>
      html`<button
        type="button"
        class="imst-gallery__item${s.kind === "custom" ? " is-mine" : ""}"
        aria-pressed="${s.id === state.brief.styleId}"
        data-imst-pick-style="${s.id}"
      >
        <span class="imst-gallery__art"
          >${styleThumb(s, lookOf(brand, state.brief), { seed: hashString(s.id) })}${s.kind === "custom"
            ? html`<span class="ap-tag grey mini imst-mine"><span>My style</span></span>`
            : ""}</span
        >
        <span class="imst-gallery__text"
          ><span class="ap-body-bold">${s.label}</span
          ><span class="ap-caption">${s.description || "Made from your references."}</span></span
        >
      </button>`;
    // Six presets: one list, no filter (2026-10-08). The brand's own styles head it.
    const body = html`
      <div class="imst-gallery-scroll">
        ${own.length
          ? html`<h3 class="ap-body-bold imst-gallery__group">My styles</h3>
              <div class="imst-gallery">${own.map(card)}</div>
              <h3 class="ap-body-bold imst-gallery__group">Presets</h3>
              <div class="imst-gallery">${STYLE_PRESETS.map(card)}</div>`
          : html`<div class="imst-gallery">${STYLE_PRESETS.map(card)}</div>`}
      </div>
    `;
    const dialog = openDialog({
      title: "Styles",
      subtitle: `Every one drawn in ${brand.name}'s colours.`,
      size: "lg",
      body,
      onMount(el) {
        el.addEventListener("click", (event) => {
          const pick = event.target.closest("[data-imst-pick-style]");
          if (!pick) return;
          setStyle(pick.dataset.imstPickStyle);
          dialog.close();
        });
      },
    });
  }

  function setStyle(styleId) {
    state.brief.styleId = styleId;
    if (state.source === "style" && styleId) state.lastStyleId = styleId;
    const style = styleId ? getStyle(styleId) : null;
    if (state.brief.textMode === "embedded" && style && !style.supportsEmbeddedText) {
      state.brief.textMode = "layer";
      state.warning = `${style.label} can't write text into the image, so the text goes on an editable layer.`;
    } else state.warning = "";
    leaveResults();
    paint();
  }

  // Changing the brief after a run goes back to the live preview of the new choices.
  function leaveResults() {
    state.showCurrent = false;
    if (state.run.status === "loading") return;
    if (currentCreation()) {
      state.creationId = null;
      state.focusId = null;
    }
    state.run = { status: "idle" };
  }

  paint();
  const offs = [
    subscribe(paint),
    delegate(target, "input", "[data-imst-field]", (_e, el) => {
      if (el.closest("[data-imst-creator-host]")) return;
      const f = el.dataset.imstField;
      state.brief[f] = el.value;
      if (f === "prompt" && state.error) {
        state.error = "";
        target.querySelector(".imst-ctl .ap-form-message.error")?.remove();
      }
    }),
    // The preview follows the text on the image once you're done typing.
    delegate(target, "change", "[data-imst-field='headline']", () => {
      if (!currentCreation()) paint();
    }),
    delegate(target, "keydown", "#imst-prompt", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        generate();
      }
    }),
    delegate(target, "click", "[data-imst-style]", (_e, el) => setStyle(el.dataset.imstStyle)),
    delegate(target, "click", "[data-imst-ref]", (_e, el) => styleFromPlaybookReference(el.dataset.imstRef)),
    delegate(target, "click", "[data-imst-shape]", (_e, el) => {
      state.brief.formatIds = [shapes().find((s) => s.id === el.dataset.imstShape).formatId];
      leaveResults();
      paint();
    }),
    // Dropping an image on the style grid does what the tile does.
    delegate(target, "dragover", "[data-imst-style-drop]", (event, el) => {
      if (![...(event.dataTransfer?.items || [])].some((i) => i.kind === "file")) return;
      event.preventDefault();
      el.classList.add("is-dragover");
    }),
    delegate(target, "dragleave", "[data-imst-style-drop]", (event, el) => {
      if (!el.contains(event.relatedTarget)) el.classList.remove("is-dragover");
    }),
    delegate(target, "drop", "[data-imst-style-drop]", (event, el) => {
      event.preventDefault();
      el.classList.remove("is-dragover");
      if (event.dataTransfer?.files?.length) styleFromImages(event.dataTransfer.files);
    }),
    delegate(target, "click", "[data-imst-source]", (_e, el) => {
      if (el.dataset.imstSource === state.source) return;
      state.justPicked = !!el.closest(".imst-chooser");
      state.source = el.dataset.imstSource;
      state.sourceError = "";
      setStyle(
        state.source === "style" ? state.lastStyleId : state.source === "image" ? state.oneOff?.id || null : null,
      );
      if (el.closest(".imst-chooser")) target.querySelector("#imst-prompt")?.focus({ preventScroll: true });
    }),
    delegate(target, "change", "[data-imst-textmode]", (_e, el) => {
      state.brief.textMode = el.checked ? "embedded" : "layer";
      state.warning = "";
      paint();
    }),
    delegate(target, "click", "[data-imst-view]", (_e, el) => {
      state.view = el.dataset.imstView === "feed" ? "feed" : "image";
      paint();
      target.querySelector(`[data-imst-view="${state.view}"]`)?.focus({ preventScroll: true });
    }),
    delegate(target, "click", "[data-imst-focus]", (_e, el) => {
      state.focusId = el.dataset.imstFocus;
      paint();
      target.querySelector(`[data-imst-focus="${state.focusId}"]`)?.focus({ preventScroll: true });
    }),
    delegate(target, "keydown", "[data-imst-strip]", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const items = [...target.querySelectorAll("[data-imst-strip] [data-imst-focus]")];
      const i = items.findIndex((x) => x.getAttribute("aria-selected") === "true");
      const next = items[(i + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
      if (next) next.click();
      event.preventDefault();
    }),
    delegate(root, "click", "[data-imst-action]", (_e, el) => {
      const a = el.dataset.imstAction;
      if (a === "cancel") onCancel();
      else if (a === "generate") generate();
      else if (a === "suggest") suggestFromPost(el);
      else if (a === "suggest-headline") suggestHeadline(el);
      else if (a === "all-styles") openStyleGallery();
      else if (a === "new-style") openNewStyle();
      else if (a === "change-source") {
        state.source = null;
        paint();
        target.querySelector(".imst-chooser__card")?.focus();
      } else if (a === "style-from-image") pickStyleImages();
      else if (a === "count") {
        state.brief.count = Number(el.dataset.imstCount) || 4;
        paint();
      }
    }),
    delegate(root, "click", "[data-imst-stylepop-close]", () => {
      closeNewStyle();
      paint();
    }),
    delegate(root, "click", "[data-imst-mode]", (_e, el) => {
      if (el.disabled || editor.isBusy() || creatorPanel) return;
      if (el.dataset.imstMode === "edit") openEdit();
      else if (state.mode === "edit") leaveEdit();
    }),
    delegate(root, "click", "[data-imst-edit-undo]", () => editor.undo()),
    editor.bind(target, { onFooterChange: () => paintFooter() }),
    delegate(root, "click", "[data-imst-var]", (_e, el) => {
      const c = currentCreation();
      const v = focused(c);
      const a = el.dataset.imstVar;
      if (a === "regenerate") regenerate();
      else if (a === "add-one") addOne();
      else if (a === "download") download();
      else if (a === "use") useInDraft();
    }),
  ];
  // Escape unwinds Edit first (popover → crop → typing → selection); only then does it close.
  // Escape unwinds the style popover first, then Edit, before the dialog closes.
  onEscape?.(() => {
    if (creatorPanel) {
      closeNewStyle();
      paint();
      return true;
    }
    return state.mode === "edit" && editor.escape();
  });
  return () => {
    alive = false;
    closeNewStyle();
    state.abort?.abort();
    feedUrls.forEach((url) => url && URL.revokeObjectURL(url));
    editedUrls.forEach((url) => url && URL.revokeObjectURL(url));
    oneOffsMade.forEach((style) => {
      forgetOneOffStyle(style.id);
      discardOneOff(style);
    });
    offs.forEach((off) => off());
  };
}
