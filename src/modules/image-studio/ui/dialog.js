// Image Generator — dialogs. DS .ap-dialog + the app's .app-modal-backdrop,
// positioned by the module's own CSS (.imst-dialog). Deliberately NOT routed
// through Archie's modal-coordinator: the module imports nothing of Archie's.
//
// openDialog() returns { el, close, setBody }. Escape and the backdrop close it;
// focus moves in on open and back to the opener on close.

import { html, toString } from "../lib/html.js?v=1775";

let open = [];

function onKey(event) {
  const top = open[open.length - 1];
  if (!top) return;
  if (event.key === "Escape") {
    event.stopPropagation();
    // A dialog with its own layers of state (the studio's Edit) unwinds those first.
    if (top.beforeEscape?.()) {
      event.preventDefault();
      return;
    }
    top.close();
  } else if (event.key === "Tab") {
    trapFocus(top.el, event);
  }
}

function focusables(root) {
  return [
    ...root.querySelectorAll("button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"),
  ].filter((el) => !el.disabled && el.offsetParent !== null);
}

function trapFocus(root, event) {
  const items = focusables(root);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * @param {{title:string, subtitle?:string, body:object, footer?:object, size?:"sm"|"md"|"lg",
 *          role?:"dialog"|"alertdialog", onMount?:(el:HTMLElement, api:object)=>void|(()=>void),
 *          onClose?:()=>void, headerAside?:object}} opts
 * `headerAside` sits at the end of the header row (the studio's Generate | Edit
 * tabs); `api.beforeEscape`, when set, may swallow an Escape by returning true.
 */
export function openDialog({
  title,
  subtitle,
  body,
  footer,
  size = "md",
  role = "dialog",
  onMount,
  onClose,
  headerAside = null,
}) {
  const opener = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "app-modal-backdrop imst-backdrop open";
  const el = document.createElement("aside");
  el.className = `ap-dialog imst-dialog imst-dialog--${size}`;
  el.setAttribute("role", role);
  el.setAttribute("aria-modal", "true");
  const titleId = `imst-dlg-${Math.random().toString(36).slice(2, 8)}`;
  el.setAttribute("aria-labelledby", titleId);
  el.innerHTML = toString(html`
    <div class="ap-dialog-header imst-dialog__header${headerAside ? " imst-dialog__header--aside" : ""}">
      <div class="imst-dialog__heading">
        <h2 class="ap-dialog-title" id="${titleId}">${title}</h2>
        ${subtitle ? html`<span class="ap-dialog-subtitle">${subtitle}</span>` : ""}
      </div>
      ${headerAside || ""}
    </div>
    <button type="button" class="ap-dialog-close imst-dialog__close" data-imst-dialog-close aria-label="Close">
      <i class="ap-icon-close" aria-hidden="true"></i>
    </button>
    <div class="ap-dialog-content imst-dialog__content" data-imst-dialog-body>${body}</div>
    ${footer ? html`<div class="ap-dialog-footer imst-dialog__footer" data-imst-dialog-footer>${footer}</div>` : ""}
  `);
  document.body.append(backdrop, el);
  if (!open.length) document.addEventListener("keydown", onKey, true);

  let teardown = null;
  const api = {
    el,
    close() {
      if (!open.includes(api)) return;
      open = open.filter((d) => d !== api);
      if (!open.length) document.removeEventListener("keydown", onKey, true);
      teardown?.();
      backdrop.remove();
      el.remove();
      onClose?.();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    },
    setBody(fragment) {
      el.querySelector("[data-imst-dialog-body]").innerHTML = toString(fragment);
    },
    setFooter(fragment) {
      const node = el.querySelector("[data-imst-dialog-footer]");
      if (node) node.innerHTML = toString(fragment);
    },
  };
  open.push(api);
  backdrop.addEventListener("click", () => api.close());
  el.querySelector("[data-imst-dialog-close]").addEventListener("click", () => api.close());
  const result = onMount?.(el, api);
  if (typeof result === "function") teardown = result;
  requestAnimationFrame(() => {
    const target =
      el.querySelector("[autofocus]") || focusables(el).find((n) => !n.matches("[data-imst-dialog-close]"));
    (target || el).focus?.();
  });
  return api;
}

/** Closes every module dialog — the route cleanup calls it. */
export function closeAllDialogs() {
  [...open].reverse().forEach((d) => d.close());
}

/** Resolves true on confirm, false on cancel / Escape / backdrop. */
// The confirm is the orange primary whether the action destroys or not — the
// DS has no primary red, and the verb on the button says what happens
// (design-guidelines, interaction-patterns §1). Callers may still pass
// `danger`; it no longer changes the look.
export function confirmDialog({ title, body, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    let answered = false;
    const dialog = openDialog({
      title,
      size: "sm",
      role: "alertdialog",
      body: html`<p class="ap-body imst-dialog__text">${body}</p>`,
      footer: html`
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button ghost grey" data-imst-confirm="no">Cancel</button>
          <button type="button" class="ap-button primary orange" data-imst-confirm="yes">${confirmLabel}</button>
        </div>
      `,
      onMount(el) {
        el.addEventListener("click", (event) => {
          const btn = event.target.closest("[data-imst-confirm]");
          if (!btn) return;
          answered = true;
          resolve(btn.dataset.imstConfirm === "yes");
          dialog.close();
        });
      },
      onClose() {
        if (!answered) resolve(false);
      },
    });
  });
}
