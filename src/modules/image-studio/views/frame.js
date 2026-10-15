// Image Generator — the page frame of the module's one page, the style creator
// (the topbar carries its way back to the Playbook).

import { html } from "../lib/html.js?v=1902";

/**
 * @param {{section?:string, back?:{path:string,label:string}, aside?:object, body:object, fill?:boolean}} opts
 *   fill: the page takes the whole content area (the studio) instead of the reading measure.
 *   aside: a fragment on the right of the bar (the brand picker).
 */
export function renderFrame({ section, back, aside, body, fill = false }) {
  const bar = back
    ? html`<button type="button" class="ap-link imst-back" data-imst-nav="${back.path}">
        <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>${back.label}</span>
      </button>`
    : "";
  return html`
    <section class="imst${fill ? " imst--fill" : ""}" data-imst-root>
      <div class="imst-page">
        ${bar || aside
          ? html`<div class="imst-bar${back ? " imst-bar--back" : ""}">
              <div class="imst-bar__main">${bar}</div>
              ${aside ? html`<div class="imst-bar__aside">${aside}</div>` : ""}
            </div>`
          : ""}
        <div class="imst-body">${body}</div>
      </div>
    </section>
  `;
}
