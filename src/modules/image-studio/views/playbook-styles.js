// Image Generator — the brand's image styles, as the Playbook's Brand section
// shows them when `playbook2` is OFF (flag sexySquirrel). Under `playbook2`
// the fiche shows the brand's LOOK instead (views/playbook-look.js). The fiche calls two functions and knows
// nothing else: renderPlaybookStyles() for the row, handlePlaybookStylesClick()
// from its own delegated click handler.
//
// A style is part of the brand — what its images look like — so it lives ON the
// Playbook (imageStyles) and is managed here, where the logo and the colours
// are. Creating or editing one opens the style creator, a page of its own
// (/playbook/:id/styles/*), because it needs the room: reference images, their
// weights and a test on three subjects. The system presets are NOT shown here:
// they belong to no Playbook, and the fiche lists only what is this brand's.

import { html, toString } from "../lib/html.js?v=1890";
import { navigate } from "../../../router.js?v=1890";
import { styleThumb } from "../ui/style-thumb.js?v=1890";
import { confirmDialog } from "../ui/dialog.js?v=1890";
import { toast } from "../ui/toast.js?v=1890";
import { canEditBrand, getBrand, getStyle, getStylesForBrand } from "../state/store.js?v=1890";
import { deleteStyle, duplicateStyle } from "../state/style-actions.js?v=1890";

const creatorPath = (playbookId, rest) => `/playbook/${encodeURIComponent(playbookId)}/styles/${rest}`;

/** "3 reference images" — what a style is made of, in words. */
function sourcesSummary(style) {
  const images = (style.custom?.sources || []).filter((s) => s.type === "image").length;
  return images ? `${images} reference image${images === 1 ? "" : "s"}` : "";
}

/** One card of either row: the picture, the name, what it is, its actions. */
function itemCard({ art, label, meta, actions, openAttrs }) {
  return html`
    <article class="ap-card imst-style-card imst-pbstyle">
      ${openAttrs
        ? html`<button type="button" class="imst-style-card__open" ${openAttrs} aria-label="Edit ${label}">
            ${art}
          </button>`
        : html`<span class="imst-style-card__open">${art}</span>`}
      <div class="imst-style-card__body">
        <div class="imst-style-card__title">
          <span class="ap-body-bold">${label}</span>
          ${actions ? html`<span class="imst-pbstyle__actions">${actions}</span>` : ""}
        </div>
        <span class="ap-caption imst-style-card__meta">${meta}</span>
      </div>
    </article>
  `;
}

const deleteButton = (attrs, label) =>
  html`<button
    type="button"
    class="ap-icon-button transparent grey"
    ${attrs}
    aria-label="Delete ${label}"
    data-tooltip="Delete"
  >
    <i class="ap-icon-trash" aria-hidden="true"></i>
  </button>`;

function styleCard(style, brand, canEdit) {
  const id = html`data-imst-style="${style.id}"`;
  return itemCard({
    art: styleThumb(style, brand),
    label: style.label,
    // The style Generate image uses says so (the Images tab's third block sets it).
    meta:
      brand.defaults?.styleId === style.id
        ? html`<span class="ap-tag grey mini imst-images__used"><span>Used by Generate image</span></span>`
        : sourcesSummary(style),
    openAttrs: canEdit ? html`data-imst-pb-style="edit" ${id}` : null,
    actions: canEdit
      ? html`<button
            type="button"
            class="ap-icon-button transparent grey"
            data-imst-pb-style="duplicate"
            ${id}
            aria-label="Duplicate ${style.label}"
            data-tooltip="Duplicate"
          >
            <i class="ap-icon-copy" aria-hidden="true"></i>
          </button>
          ${deleteButton(html`data-imst-pb-style="delete" ${id}`, style.label)}`
      : null,
  });
}

/** The first tile of a row: an empty-state card that is the button. */
function newTile(attrs, title, caption) {
  return html`<button type="button" class="imst-pbstyles__new" ${attrs}>
    <span class="imst-pbstyles__new-art" aria-hidden="true"><i class="ap-icon-plus"></i></span>
    <span class="imst-pbstyles__new-text">
      <span class="ap-body-bold">${title}</span>
      <span class="ap-caption">${caption}</span>
    </span>
  </button>`;
}

/** The Brand section's "Image styles" row: the Playbook's own styles and New style. */
export function renderPlaybookStyles(playbookId, { canEdit = true, newTile: withTile = true } = {}) {
  const brand = getBrand(playbookId);
  if (!brand) return "";
  const editable = canEdit && canEditBrand(playbookId);
  const own = getStylesForBrand(playbookId).filter((s) => s.kind === "custom");
  // "New style" is the FIRST tile of the grid, an empty-state card that is the
  // button — always in reach at the left, however many styles follow.
  const tile =
    editable && withTile
      ? newTile(
          html`data-imst-pb-style="new"`,
          "New style",
          own.length ? "From a few reference images" : "Give a few reference images whose look you want",
        )
      : "";
  if (!own.length && !editable)
    return toString(html`<p class="ap-body imst-pbstyles__empty">No style of this brand's own yet.</p>`);
  return toString(html`
    <div class="imst-pbstyles">
      <div class="imst-pbstyles__grid">${tile}${own.map((s) => styleCard(s, brand, editable))}</div>
    </div>
  `);
}

/** The fiche's delegated click, for the row above. Returns true when it handled the click. */
export function handlePlaybookStylesClick(event, playbookId, { onChange = () => {} } = {}) {
  if (!playbookId) return false;
  const el = event.target.closest("[data-imst-pb-style]");
  if (!el) return false;
  const action = el.dataset.imstPbStyle;
  const styleId = el.dataset.imstStyle;
  if (!canEditBrand(playbookId)) return true;
  if (action === "new") navigate(creatorPath(playbookId, "new"));
  else if (action === "edit") navigate(creatorPath(playbookId, encodeURIComponent(styleId)));
  else if (action === "duplicate") {
    const copy = duplicateStyle(playbookId, styleId);
    if (copy) {
      toast(`Duplicated as ${copy.label}.`);
      onChange();
    }
  } else if (action === "delete") {
    const style = getStyle(styleId);
    confirmDialog({
      title: `Delete ${style?.label || "this style"}?`,
      body: "Images already made with it stay as they are. This can't be undone.",
      confirmLabel: "Delete style",
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      deleteStyle(playbookId, styleId);
      toast(`${style?.label || "The style"} deleted.`);
      onChange();
    });
  }
  return true;
}
