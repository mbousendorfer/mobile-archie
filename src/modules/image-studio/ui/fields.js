// Image Generator — form fields built from DS pieces (.ap-form-field, .ap-input-group,
// .ap-textarea-field, .ap-select, .ap-toggle-container, .ap-tag). Every field carries
// data-imst-field="<path>" so one delegated listener can write it back.

import { html, raw } from "../lib/html.js?v=1775";

export function field({ label, hint, control, id }) {
  return html`
    <div class="ap-form-field imst-field">
      ${label ? html`<label${id ? html` for="${id}"` : ""}>${label}</label>` : ""} ${control}
      ${hint ? html`<span class="ap-caption imst-field__hint">${hint}</span>` : ""}
    </div>
  `;
}

export function textInput({ path, value, placeholder = "", type = "text", id, attrs = "", disabled = false }) {
  return html`
    <div class="ap-input-group">
      <input
        type="${type}"
        ${id ? html`id="${id}"` : ""}
        data-imst-field="${path}"
        value="${value ?? ""}"
        placeholder="${placeholder}"
        ${raw(attrs)}
        ${disabled ? "disabled" : ""}
      />
    </div>
  `;
}

export function textArea({ path, value, placeholder = "", rows = 3, id, disabled = false }) {
  return html`
    <div class="ap-textarea-field resizable">
      <textarea
        ${id ? html`id="${id}"` : ""}
        data-imst-field="${path}"
        rows="${rows}"
        placeholder="${placeholder}"
        ${disabled ? "disabled" : ""}
      >
${value ?? ""}</textarea
      >
    </div>
  `;
}

/** Single-choice DS select. options: [{ value, label, caption? }] */
export function select({ path, value, options, placeholder = "Choose…", inlineLabel, disabled = false, ariaLabel }) {
  const current = options.find((o) => o.value === value);
  return html`
    <details class="ap-select imst-select" data-imst-select="${path}" ${disabled ? "data-disabled" : ""}>
      <summary
        class="ap-select-trigger"
        aria-label="${ariaLabel || inlineLabel || placeholder}"
        ${disabled ? 'tabindex="-1"' : ""}
      >
        ${inlineLabel ? html`<span class="ap-select-inline-label">${inlineLabel}</span>` : ""}
        <span class="ap-select-value${current ? "" : " ap-select-placeholder"}">${current?.label || placeholder}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox">
        <div class="ap-select-options">
          ${options.map(
            (o) => html`
              <div
                class="ap-select-option${o.value === value ? " selected" : ""}"
                role="option"
                tabindex="0"
                aria-selected="${o.value === value ? "true" : "false"}"
                data-imst-option="${o.value}"
              >
                <span class="ap-select-option-text">
                  <span class="ap-select-option-title">${o.label}</span>
                  ${o.caption ? html`<span class="ap-select-option-caption">${o.caption}</span>` : ""}
                </span>
                ${o.value === value
                  ? html`<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>`
                  : ""}
              </div>
            `,
          )}
        </div>
      </div>
    </details>
  `;
}

export function toggle({ path, checked, label, disabled = false }) {
  return html`
    <label class="ap-toggle-container">
      <input type="checkbox" data-imst-field="${path}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
      <i></i>
      <span>${label}</span>
    </label>
  `;
}

/** DS-port range slider (.ap-slider). The filled part follows --fill, kept in sync by syncSlider(). */
export function slider({ path, value, min = 0, max = 1, step = 0.05, label, disabled = false }) {
  const fill = ((value - min) / (max - min)) * 100;
  return html`<input
    type="range"
    class="ap-slider"
    data-imst-field="${path}"
    min="${min}"
    max="${max}"
    step="${step}"
    value="${value}"
    style="--fill: ${fill}%"
    aria-label="${label}"
    ${disabled ? "disabled" : ""}
  />`;
}

export function syncSlider(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
}

export function checkbox({ path, checked, label, caption, disabled = false, attrs = "" }) {
  return html`
    <label class="ap-checkbox-container imst-check">
      <input
        type="checkbox"
        data-imst-field="${path}"
        ${checked ? "checked" : ""}
        ${disabled ? "disabled" : ""}
        ${raw(attrs)}
      />
      <i></i>
      <span class="imst-check__text">
        <span>${label}</span>
        ${caption ? html`<span class="ap-caption">${caption}</span>` : ""}
      </span>
    </label>
  `;
}

/**
 * Keeps focus across a full re-render: call before innerHTML, then call the
 * returned function after it.
 */
export function preserveFocus(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return () => {};
  const key = el.dataset?.imstField || el.dataset?.imstFocus || el.id;
  const selector = el.dataset?.imstField
    ? `[data-imst-field="${CSS.escape(key)}"]`
    : el.dataset?.imstFocus
      ? `[data-imst-focus="${CSS.escape(key)}"]`
      : el.id
        ? `#${CSS.escape(key)}`
        : null;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  return () => {
    if (!selector) return;
    const next = root.querySelector(selector);
    if (!next) return;
    next.focus({ preventScroll: true });
    try {
      if (start != null) next.setSelectionRange(start, end);
    } catch {
      /* not a text field */
    }
  };
}
