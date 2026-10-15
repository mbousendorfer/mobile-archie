// The Playbook switcher under the wordmark (flag playbookWorkspace): the
// active brand, the list to switch to, and what a switch re-points (see
// switchPlaybook). Moved out of sidebar.js, unchanged.

import { isWorkspaceMode, getActivePlaybook, setActivePlaybook } from "../../active-playbook.js?v=1912";
import { escapeHtml } from "../../utils.js?v=1912";
import { visibleContexts } from "../../playbook-access.js?v=1912";
import { getPath, navigate } from "../../router.js?v=1912";
import { closePanel as closeRightPanel } from "../right-panel.js?v=1912";

// ── The Playbook switcher — the scope, worn at the top of the rail ─────────
//
// One question, asked once, above everything it governs. It replaces the six
// pickers that each asked it separately — see the header of active-playbook.js
// for the list, what a global scope costs, and why there is no "All playbooks"
// row here.
//
// It sits UNDER the wordmark and ABOVE New chat, which is the whole claim of
// the layout: Archie is the product, the brand is the scope, and everything
// below the switcher — New chat, Search, the nav, the chat list — belongs to
// the brand named in it. Same DS `.ap-select` as the composer control it
// replaces, inline label included: a scope that hides is only safe while it is
// legible, and the label is what says WHAT is being switched.
export function renderPlaybookSwitcher() {
  if (!isWorkspaceMode()) return "";
  const active = getActivePlaybook();
  const dotClass = `app-sidebar__row-color-dot app-sidebar__row-color-dot--${active?.color || "grey"}`;

  // No Playbook at all (new-alt mode, first run): the switcher has nothing to
  // switch between, so it becomes the one thing that helps — the offer to make
  // the first one. Rendering an empty select here would be a control that
  // opens onto nothing.
  if (!active) {
    return `
      <div class="app-sidebar__pb">
        <button type="button" class="app-sidebar__nav-item app-sidebar__pb-empty" data-pb-switch-create>
          <i class="ap-icon-plus" aria-hidden="true"></i>
          <span>Create a playbook</span>
        </button>
      </div>
    `;
  }

  const options = visibleContexts()
    .map((c) => {
      const isSel = c.id === active.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-pb-switch-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${c.color || "grey"}" aria-hidden="true"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div class="app-sidebar__pb">
      <details class="ap-select app-sidebar__pb-select" data-pb-switcher>
        <summary
          class="ap-select-trigger app-sidebar__pb-trigger"
          title="Playbook: ${escapeHtml(active.name)} — switch"
        >
          <span class="${dotClass}" aria-hidden="true"></span>
          <span class="ap-select-inline-label">Playbook</span>
          <span class="ap-select-value">${escapeHtml(active.name)}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown app-sidebar__pb-dropdown" role="listbox" aria-label="Switch playbook">
          <div class="ap-select-options">${options}</div>
          <div class="ap-select-footer">
            <button type="button" class="ap-select-create" data-pb-switch-manage>
              <i class="ap-icon-stack ap-select-create-icon" aria-hidden="true"></i>
              <span>All playbooks</span>
            </button>
            <button type="button" class="ap-select-create" data-pb-switch-create>
              <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
              <span>Create a playbook</span>
            </button>
          </div>
        </div>
      </details>
    </div>
  `;
}

// Switching brand. The list, the nav counts and the feed re-scope themselves
// off the store's notify — but a CHAT does not: it keeps the Playbook it was
// born with (CONCEPTS §2), so the one you are reading is now outside the scope
// and no longer in the list under it. So a switch made from a chat lands on
// that brand's most recent chat, or on a fresh one when it has none. Every
// other route stays put and simply re-paints.
export function switchPlaybook(id) {
  const previous = getActivePlaybook()?.id;
  if (!id || id === previous) return;
  const path = getPath();
  // Was I reading the workspace's OWN fiche? Then the SURFACE is "this brand's
  // Playbook", not that one brand — so it re-points to the brand just picked,
  // exactly as /topics and Insights re-point themselves. It has to be answered
  // BEFORE the switch: a moment later the path's id is no longer the active
  // one, which is also why leaving it alone was worse than a stale page —
  // isAccountScope() would start calling it another brand's fiche while
  // `body.account-scope` (only written on a route change) still said workspace,
  // so the rail named Pawtrack above Acme's sheet.
  const onOwnFiche = !!previous && path === `/playbook/${previous}`;
  setActivePlaybook(id);
  if (path.startsWith("/session/")) {
    // `/` IS "this brand's home": a pure redirect to the most recent chat in
    // scope, or a fresh one ([`screens/dashboard.js`]). Computing the
    // destination here too is how two answers to one question start to drift —
    // the topbar's way back from the catalogue asks the same thing.
    closeRightPanel();
    navigate("/");
    return;
  }
  if (onOwnFiche) {
    navigate(`/playbook/${id}`);
    return;
  }
  // Everything else is a surface with no brand in its URL (the feed, its
  // settings, Insights): the scope notify repaints it where it stands.
}
