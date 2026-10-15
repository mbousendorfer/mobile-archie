// Image Generator — popover menus on <details> + DS .ap-action-dropdown.
// ADS has no nested / flyout dropdown: menus are flat, sections split by a divider.
//
// menu({ trigger, items, align }) → fragment. installMenus(root) → off():
// one open at a time, closes on outside click, Escape, and after an item click.

import { html, raw } from "../lib/html.js?v=1877";

/**
 * item: { action, label, icon?, description?, attrs?, danger? } | "divider"
 * trigger: { className, content, label } — `content` is a fragment inside <summary>.
 */
// `up` opens the menu above its trigger — for a menu in a footer.
export function menu({ trigger, items, align = "end", label = "Menu", wide = false, up = false }) {
  return html`
    <details class="imst-menu imst-menu--${align}${up ? " imst-menu--up" : ""}" data-imst-menu>
      <summary class="${trigger.className}" aria-label="${trigger.label || label}" aria-haspopup="menu">
        ${trigger.content}
      </summary>
      <div class="ap-action-dropdown${wide ? " large" : ""} imst-menu__pop" role="menu" aria-label="${label}">
        ${items.map((item) =>
          item === "divider"
            ? html`<div class="ap-action-dropdown-divider" role="separator"></div>`
            : html`
                <button
                  type="button"
                  class="ap-action-dropdown-item${item.selected ? " focused" : ""}"
                  role="menuitem"
                  data-imst-action="${item.action}"
                  ${raw(item.attrs || "")}
                >
                  ${item.icon ? html`<i class="${item.icon}" aria-hidden="true"></i>` : ""} ${item.media || ""}
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">${item.label}</span>
                    </div>
                    ${item.description
                      ? html`<span class="ap-action-dropdown-item-description">${item.description}</span>`
                      : ""}
                  </div>
                </button>
              `,
        )}
      </div>
    </details>
  `;
}

export function installMenus(root) {
  const onClick = (event) => {
    const inside = event.target.closest?.("[data-imst-menu]");
    for (const d of root.querySelectorAll("details[data-imst-menu][open], details.ap-select[open]")) {
      if (d !== inside) d.open = false;
    }
    if (inside && event.target.closest(".ap-action-dropdown-item, .ap-select-option")) {
      // Let the action handler run first, then close.
      setTimeout(() => (inside.open = false));
    }
  };
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    const openMenu = root.querySelector("details[data-imst-menu][open], details.ap-select[open]");
    if (openMenu) {
      openMenu.open = false;
      openMenu.querySelector("summary")?.focus();
      event.stopPropagation();
    }
  };
  document.addEventListener("click", onClick, true);
  root.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("click", onClick, true);
    root.removeEventListener("keydown", onKey);
  };
}
