// Image Generator — empty state. The DS ships no empty-state class; this is the
// house composition (design-guidelines, empty-states.md), rewritten here so the
// module imports nothing: a bare icon (no medallion behind it), then the text —
// a bounded region's H3 title and one Body sentence, 420px at most — then one
// hug-width primary blue CTA. Gaps: icon↔text lg, title↔body xxxs, text↔action md.

import { html } from "../lib/html.js?v=1823";

export function renderEmpty({ icon, title, body, action }) {
  return html`
    <div class="imst-empty">
      <i class="${icon} ap-icon-xl imst-empty__icon" aria-hidden="true"></i>
      <div class="imst-empty__text">
        <h2 class="ap-h3 imst-empty__title">${title}</h2>
        ${body ? html`<p class="ap-body imst-empty__body">${body}</p>` : ""}
      </div>
      ${action ? html`<div class="imst-empty__actions">${action}</div>` : ""}
    </div>
  `;
}
