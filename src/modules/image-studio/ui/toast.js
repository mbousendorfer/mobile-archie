// Image Generator — snackbars (.ap-snackbar), in the module's own region so it
// never shares Archie's #toastRegion.

import { html, toString } from "../lib/html.js?v=1773";

const DURATION = 4000;

function region() {
  let el = document.getElementById("imstToasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "imstToasts";
    el.className = "ap-snackbar-thread imst-toasts";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  return el;
}

function dismiss(el) {
  if (!el.isConnected) return;
  el.classList.remove("animate-in");
  el.classList.add("animate-out");
  setTimeout(() => el.remove(), 250);
}

/** @param {string} message @param {{variant?:"success"|"error", action?:{label:string,onClick:()=>void}}} opts */
export function toast(message, { variant = "success", action } = {}) {
  const el = document.createElement("div");
  el.className = `ap-snackbar ${variant === "error" ? "error" : "success"} animate-in`;
  el.innerHTML = toString(html`
    <div class="ap-snackbar-left"><i></i><span>${message}</span></div>
    <div class="ap-snackbar-right">
      ${action ? html`<button type="button" class="ap-link" data-imst-toast-action>${action.label}</button>` : ""}
      <button type="button" aria-label="Close" data-imst-toast-close>
        <i class="ap-icon-close" aria-hidden="true"></i>
      </button>
    </div>
  `);
  region().append(el);
  el.querySelector("[data-imst-toast-close]").addEventListener("click", () => dismiss(el));
  el.querySelector("[data-imst-toast-action]")?.addEventListener("click", () => {
    try {
      action.onClick();
    } finally {
      dismiss(el);
    }
  });
  let timer = setTimeout(() => dismiss(el), DURATION);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => (timer = setTimeout(() => dismiss(el), DURATION)));
}
