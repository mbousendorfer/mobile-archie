// The brand kit rows of the Playbook's Brand section — what an AI image
// generator needs on top of the logo, colours and fonts to stay on-brand:
// which version each logo is, what each colour is for, the
// words to avoid, and the visual rules. Gated by the `sexySquirrel` flag (the
// Image Generator reads these fields; nothing else does yet).
//
// Pure renderers + three handlers that playbook-view calls from its own
// onClick / onInput / onChange while a section is in edit mode. Edits mutate
// the fiche's live data object, exactly like every other Brand row, and are
// committed by the section's Save (snapshotEditable carries the fields).

import { escapeHtml as esc } from "./utils.js?v=1788";
import { COLOR_ROLES, LOGO_VARIANTS, getContextById } from "./contexts-store.js?v=1788";
import {
  handlePlaybookImagesClick,
  renderImagesGenerate,
  renderImagesReferences,
  renderImagesStyles,
} from "./modules/image-studio/index.js?v=1788";

const ROLE_LABELS = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent only",
  background: "Background",
  text: "Text",
};
const VARIANT_LABELS = { color: "Colour", white: "White", black: "Black", icon: "Icon only" };

// A DS single-select (.ap-select on <details>). The option carries everything the
// handler needs, so one delegated click resolves it.
function dsSelect({ kind, index, value, labels, options, placeholder, ariaLabel }) {
  const current = labels[value];
  const opts = options
    .map(
      (o) => `
      <div class="ap-select-option${o === value ? " selected" : ""}" role="option" tabindex="0"
        aria-selected="${o === value}" data-recap-kit-pick="${kind}" data-recap-kit-index="${index}" data-recap-kit-value="${esc(o)}">
        <span class="ap-select-option-text"><span class="ap-select-option-title">${esc(labels[o])}</span></span>
        ${o === value ? '<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>' : ""}
      </div>`,
    )
    .join("");
  return `
    <details class="ap-select recap__kit-select" data-recap-kit-select>
      <summary class="ap-select-trigger" aria-label="${esc(ariaLabel)}">
        <span class="ap-select-value${current ? "" : " ap-select-placeholder"}">${esc(current || placeholder)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox"><div class="ap-select-options">${opts}</div></div>
    </details>`;
}

/** The role picker appended to each colour row in edit mode. */
export function renderColorRole(color, index) {
  return dsSelect({
    kind: "role",
    index,
    value: color.role || "",
    labels: ROLE_LABELS,
    options: COLOR_ROLES,
    placeholder: "Role",
    ariaLabel: `Role of ${color.name || "this colour"}`,
  });
}

/** Read-mode caption under a swatch: its role, when it says more than the name. */
export function colorRoleCaption(color) {
  if (!color.role) return "";
  const label = ROLE_LABELS[color.role];
  return String(color.name || "").toLowerCase() === label.toLowerCase() ? "" : label;
}

/** "Logo versions" row: which version each mark is. */
export function renderLogoVariants(data, edit, logos) {
  const list = Array.isArray(logos) ? logos : [];
  if (!list.length) return `<span class="recap__row-empty">Add a logo first</span>`;
  return `<ul class="recap__kit-logos">${list
    .map(
      (l, i) => `
      <li class="recap__kit-logo">
        <span class="recap__kit-logo-thumb${l.variant === "white" ? " recap__kit-logo-thumb--dark" : ""}"><img src="${esc(l.url)}" alt="" /></span>
        <span class="recap__kit-logo-label">${esc(l.label || "Logo")}</span>
        ${
          edit
            ? dsSelect({
                kind: "variant",
                index: i,
                value: l.variant || "",
                labels: VARIANT_LABELS,
                options: LOGO_VARIANTS,
                placeholder: "Which version?",
                ariaLabel: `Version of ${l.label || "this logo"}`,
              })
            : `<span class="recap__look-value">${esc(VARIANT_LABELS[l.variant] || "Not said")}</span>`
        }
      </li>`,
    )
    .join("")}</ul>`;
}

// ── Visual rules ─────────────────────────────────────────────────────────

function pairSwatches(pair) {
  return `<span class="recap__kit-pair" aria-label="${esc(pair[0])} with ${esc(pair[1])}">
    <span class="recap__swatch-chip" style="background:${esc(pair[0])};"></span>
    <span class="recap__kit-pair-with">with</span>
    <span class="recap__swatch-chip" style="background:${esc(pair[1])};"></span>
  </span>`;
}

let pendingPair = ["", ""];

function colorPick(slot, colors) {
  const labels = Object.fromEntries(colors.map((c) => [c.hex, `${c.name || "Colour"} ${String(c.hex).toUpperCase()}`]));
  return dsSelect({
    kind: "pair",
    index: slot,
    value: pendingPair[slot],
    labels,
    options: colors.map((c) => c.hex),
    placeholder: slot === 0 ? "Colour" : "Never with",
    ariaLabel: slot === 0 ? "First colour of the pair" : "Colour it must never meet",
  });
}

export function renderVisualRules(data, edit) {
  const r = data.brandRules || {
    logoMinPx: 48,
    clearSpace: 0.5,
    noLogoDistortion: true,
    forbiddenPairs: [],
  };
  const colors = (Array.isArray(data.brandColors) ? data.brandColors : []).filter((c) => c.hex);
  if (!edit) {
    return `<dl class="recap__kit-facts">
      <dt>Logo minimum size</dt><dd>${esc(r.logoMinPx)} px</dd>
      <dt>Clear space around the logo</dt><dd>${esc(r.clearSpace)} × the logo's height</dd>
      <dt>Logo distortion</dt><dd>${r.noLogoDistortion ? "Never stretch or skew the logo" : "Allowed"}</dd>
      <dt>Colours that never meet</dt><dd>${
        r.forbiddenPairs.length
          ? `<div class="recap__kit-pairs">${r.forbiddenPairs.map(pairSwatches).join("")}</div>`
          : `<span class="recap__row-empty">None</span>`
      }</dd>
    </dl>`;
  }
  return `<div class="recap__kit-edit">
    <div class="recap__kit-inline">
      <label class="recap__kit-num">
        <span class="recap__look-label">Logo minimum size</span>
        <span class="ap-input-group"><input type="number" min="16" max="400" step="4" value="${esc(r.logoMinPx)}" data-recap-kit-num="logoMinPx" aria-label="Logo minimum size in pixels" /><span>px</span></span>
      </label>
      <label class="recap__kit-num">
        <span class="recap__look-label">Clear space</span>
        <span class="ap-input-group"><input type="number" min="0" max="3" step="0.25" value="${esc(r.clearSpace)}" data-recap-kit-num="clearSpace" aria-label="Clear space, in logo heights" /><span>× logo height</span></span>
      </label>
    </div>
    <label class="ap-toggle-container">
      <input type="checkbox" data-recap-kit-toggle="noLogoDistortion" ${r.noLogoDistortion ? "checked" : ""} />
      <i></i><span>Never stretch or skew the logo</span>
    </label>
    <div class="recap__kit-group">
      <span class="recap__look-label">Colours that never meet</span>
      ${
        r.forbiddenPairs.length
          ? `<ul class="recap__kit-pair-list">${r.forbiddenPairs
              .map(
                (p, i) => `<li>${pairSwatches(p)}
                <button type="button" class="ap-icon-button transparent grey" data-recap-kit-pair-remove="${i}" aria-label="Remove this pair"><i class="ap-icon-close"></i></button></li>`,
              )
              .join("")}</ul>`
          : ""
      }
      ${
        colors.length >= 2
          ? `<div class="recap__kit-pair-add">${colorPick(0, colors)}${colorPick(1, colors)}
              <button type="button" class="ap-button secondary blue" data-recap-kit-pair-add ${pendingPair[0] && pendingPair[1] && pendingPair[0] !== pendingPair[1] ? "" : "disabled"}>
                <i class="ap-icon-plus"></i><span>Add pair</span>
              </button></div>`
          : `<span class="recap__row-empty">Add two colours to set a pair</span>`
      }
    </div>
  </div>`;
}

// ── Handlers (called by playbook-view while a section is being edited) ───

function rules(data) {
  data.brandRules = data.brandRules && typeof data.brandRules === "object" ? data.brandRules : {};
  const r = data.brandRules;
  r.forbiddenPairs ??= [];
  return r;
}

/** Returns true when it handled the click (the caller then repaints). */
export function handleKitClick(event, data) {
  // One kit select open at a time; a click elsewhere closes them.
  const inSelect = event.target.closest("[data-recap-kit-select]");
  for (const d of document.querySelectorAll("details[data-recap-kit-select][open]")) if (d !== inSelect) d.open = false;

  const pick = event.target.closest("[data-recap-kit-pick]");
  if (pick) {
    const i = Number(pick.dataset.recapKitIndex);
    const value = pick.dataset.recapKitValue;
    const kind = pick.dataset.recapKitPick;
    if (kind === "role" && data.brandColors?.[i]) data.brandColors[i].role = value;
    else if (kind === "variant" && data.brandLogos?.[i]) data.brandLogos[i].variant = value;
    else if (kind === "pair") pendingPair[i] = value;
    return true;
  }
  const pairRemove = event.target.closest("[data-recap-kit-pair-remove]");
  if (pairRemove) {
    const i = Number(pairRemove.dataset.recapKitPairRemove);
    rules(data).forbiddenPairs = rules(data).forbiddenPairs.filter((_, k) => k !== i);
    return true;
  }
  if (event.target.closest("[data-recap-kit-pair-add]")) {
    const [a, b] = pendingPair;
    if (a && b && a !== b) {
      const r = rules(data);
      if (!r.forbiddenPairs.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)))
        r.forbiddenPairs.push([a, b]);
      pendingPair = ["", ""];
    }
    return true;
  }
  return false;
}

/** Text + number inputs. Returns true when handled (no repaint needed while typing). */
export function handleKitInput(event, data) {
  const t = event.target;
  if (t.matches("[data-recap-kit-num]")) {
    const n = Number(t.value);
    if (Number.isFinite(n)) rules(data)[t.dataset.recapKitNum] = n;
    return true;
  }
  return false;
}

export function handleKitChange(event, data) {
  const t = event.target;
  if (t.matches("[data-recap-kit-toggle]")) {
    rules(data)[t.dataset.recapKitToggle] = t.checked;
    return true;
  }
  return false;
}

/** Always live, like Reference images: styles are managed outside the section's edit mode. */
export function handleImageStylesClick(event, data, onChange) {
  if (!data?.id) return false;
  return handlePlaybookImagesClick(event, data.id, { onChange });
}

// ── The Images tab (playbook2) — the module's, whole: styles, reference
// images and the Generate image settings, all live (no Edit).
export function renderImagesTab(data, canEdit) {
  if (!data?.id || !getContextById(data.id)) return null;
  return {
    styles: renderImagesStyles(data.id, { canEdit }),
    references: renderImagesReferences(data.id, { canEdit }),
    generate: renderImagesGenerate(data.id, { canEdit }),
  };
}

/** Fields the fiche's snapshot must carry so Cancel restores them. */
export function kitSnapshot(d) {
  return {
    voiceAvoid: d.voiceAvoid || [],
    brandRules: d.brandRules || null,
  };
}
