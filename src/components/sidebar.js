import { html, raw, clampToViewport } from "../utils.js?v=1854";
import { navigate, getPath } from "../router.js?v=1854";
import { open as openBugReportModal } from "./bug-report-modal.js?v=1854";
import { open as openFeedbackModal } from "./feedback-modal.js?v=1854";
import { open as openSearchModal } from "./search-modal.js?v=1854";
import { renderAdminMenu, applyUserMode, applyOrgRole, toggleFlag } from "../admin-menu.js?v=1854";
import { subscribe as subscribeSessions } from "../sessions-store.js?v=1854";
import { isFlagOn } from "../feature-flags.js?v=1854";
import { subscribe as subscribeContexts } from "../contexts-store.js?v=1854";
import {
  getActivePlaybook,
  isWorkspaceMode,
  playbookForNewWork,
  catalogueRoute,
  subscribe as subscribeScope,
} from "../active-playbook.js?v=1854";
import { setHandoff } from "../handoff.js?v=1854";
// A Playbook nobody shared with me must not surface here either — the store
// still holds it (see playbook-access.js), the sidebar just doesn't name it.
import { visibleContexts } from "../playbook-access.js?v=1854";
import { getFeedForPlaybook } from "../topic-feeds-store.js?v=1854";
import { countToReview, subscribe as subscribeTopics } from "../topics-store.js?v=1854";
import { getConnectedConnectors, subscribe as subscribeConnectors } from "../connectors-store.js?v=1854";
import { closePanel as closeRightPanel } from "./right-panel.js?v=1854";
import {
  deleteSidebarSession,
  matchSessionId,
  renderOrganizeHeader,
  renderRecentLists,
  startRenameSidebar,
  togglePinSidebar,
} from "./sidebar/recent-chats.js?v=1854";
import { renderPlaybookSwitcher, switchPlaybook } from "./sidebar/playbook-switcher.js?v=1854";

// Global app sidebar — Brand / + New conversation / Recent chats / User footer.
// Rendered once at boot into #sidebar; re-rendered on every route change so the
// active conversation row stays highlighted.
//
// Mobile fork: the sidebar is a DRAWER. `is-sidebar-open` on #appShell slides
// it in over the content, with a backdrop; the topbar's ☰ opens it, and any
// navigation (hashchange), a tap on the backdrop or Escape closes it. There is
// no collapsed rail and no ⌘B — see docs/reference/PANEL-SIDEBAR-RULES.md.
//
// Footer popmenu (Lot 11) — the user-row's trailing button is a popmenu
// trigger that exposes Send feedback / Report a bug / the Admin controls.

let menuOpen = false;

// Recent-chats "Sort & group" control.
// The chosen { groupBy, sortBy } persists across reloads — mirror the
// feature-flags localStorage idiom (defensive JSON read, merge with defaults).
const ORGANIZE_KEY = "archie-chat-organize";
const ORGANIZE_DEFAULTS = { groupBy: "none", sortBy: "recency" };

let organizeOpen = false;

export function getOrganizePrefs() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ORGANIZE_KEY) || "{}");
    return { ...ORGANIZE_DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    return { ...ORGANIZE_DEFAULTS };
  }
}

function setOrganizePref(key, value) {
  try {
    const prefs = getOrganizePrefs();
    prefs[key] = value;
    window.localStorage.setItem(ORGANIZE_KEY, JSON.stringify(prefs));
  } catch {
    /* private-browsing / storage disabled — ignore, prefs stay session-local */
  }
}

// Search lives in a dedicated modal now (cf. ./search-modal.js — opened from
// the Search… row in the top nav). The sidebar no longer carries an inline
// `<input>` or a live filter query — opening the modal is the only path.

// Rename is handled via the dedicated rename-modal, not inline edit.
// (Earlier iteration tried inline title → input swap but the modal
// pattern is friendlier for a name long enough to matter.)

export function isDrawerOpen() {
  return !!document.getElementById("appShell")?.classList.contains("is-sidebar-open");
}

export function setDrawerOpen(open) {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  shell.classList.toggle("is-sidebar-open", open);
  const backdrop = document.getElementById("drawerBackdrop");
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.classList.toggle("open", open); // modals.css shows a backdrop only when .open
  }
  const el = document.getElementById("sidebar");
  if (el) el.inert = !open;
  if (!open) {
    setMenuOpen(false);
    setOrganizeMenuOpen(false);
  }
}

function closePlaybookSwitcher() {
  document.querySelector("[data-pb-switcher][open]")?.removeAttribute("open");
}

function setMenuOpen(open) {
  menuOpen = open;
  const popmenu = document.querySelector("[data-sidebar-foot-menu]");
  const trigger = document.querySelector("[data-sidebar-foot-toggle]");
  if (popmenu) popmenu.hidden = !open;
  if (trigger) trigger.setAttribute("aria-expanded", String(open));
  // The popmenu is position:fixed (the sidebar clips overflow), so anchor it
  // to the cog's rect each time it opens: above the cog, kept on screen.
  if (open && popmenu && trigger) {
    const rect = trigger.getBoundingClientRect();
    popmenu.style.left = `${rect.left}px`;
    popmenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    clampToViewport(popmenu);
  }
}

// Open/close the "Sort & group" popover. Mirrors setMenuOpen: the panel is
// position:fixed (the sidebar clips overflow), so anchor it to the trigger's
// rect each open — dropping down from just below the filter button, left-aligned
// so the row flyouts have room to open rightward over the content.
function setOrganizeMenuOpen(open) {
  organizeOpen = open;
  const menu = document.querySelector("[data-sidebar-organize-menu]");
  const trigger = document.querySelector("[data-sidebar-organize-toggle]");
  if (menu) menu.hidden = !open;
  if (trigger) trigger.setAttribute("aria-expanded", String(open));
  if (open && menu && trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    clampToViewport(menu, rect.top);
  }
}

export function initSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;

  // The drawer's backdrop — the full-viewport scrim (ds-patches.css), a sibling
  // of the drawer inside the shell. A tap on it closes the drawer.
  el.insertAdjacentHTML(
    "afterend",
    '<div class="app-modal-backdrop app-drawer-backdrop" id="drawerBackdrop" hidden></div>',
  );
  document.getElementById("drawerBackdrop").addEventListener("click", () => setDrawerOpen(false));
  // Closed at rest: out of the tab order and the accessibility tree.
  el.inert = true;
  // Every way out of the drawer is a navigation — a row, a nav item, New chat.
  window.addEventListener("hashchange", () => setDrawerOpen(false));

  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-sidebar-close]")) {
      setDrawerOpen(false);
      return;
    }
    // The wordmark, in workspace mode, is the door to the level ABOVE the
    // work: the account home — every brand, every chat, and a box to start
    // from. Before the switcher there was no such level, which is why it used
    // to mint a chat like the row under it; that is still the flag-OFF path
    // below, and "New chat" keeps that job in both modes.
    if (isWorkspaceMode() && event.target.closest("[data-sidebar-home]")) {
      closeRightPanel();
      navigate("/home");
      return;
    }
    if (event.target.closest("[data-sidebar-home]") || event.target.closest("[data-sidebar-new]")) {
      // Brand button + "New chat" row both mint a fresh conversation.
      // `/` resolves to the most-recent session for returning users
      // (cf. dashboard.js redirect), which felt like the brand button
      // was "swallowing" the click into an existing chat. Treat both
      // entry-points the same: close any leftover right-panel and
      // mint a unique session id so the per-id stores start clean.
      closeRightPanel();
      navigate(`/session/new-${Date.now().toString(36)}`);
      return;
    }
    // Search… nav row — open the dedicated search modal (mirrors Claude's
    // pattern). Captured before the generic `data-sidebar-nav` branch since
    // the Search row intentionally isn't a route.
    if (event.target.closest("[data-sidebar-search-open]")) {
      openSearchModal();
      return;
    }
    // Playbook switcher — pick a brand, or the two footer verbs. The <details>
    // is closed by hand: picking re-renders the whole rail anyway, but
    // "Manage" / "Create" navigate away and a re-render on arrival would
    // otherwise bring the open dropdown back with it.
    const pbPick = event.target.closest("[data-pb-switch-pick]");
    if (pbPick) {
      event.preventDefault();
      closePlaybookSwitcher();
      switchPlaybook(pbPick.dataset.pbSwitchPick);
      return;
    }
    if (event.target.closest("[data-pb-switch-manage]")) {
      event.preventDefault();
      closePlaybookSwitcher();
      // The catalogue is the home's Playbooks TAB in this mode — through the
      // helper, which carries it, rather than a bare `/home` that would open on
      // Chats under a control labelled "All playbooks".
      navigate(catalogueRoute());
      return;
    }
    if (event.target.closest("[data-pb-switch-create]")) {
      // Same handoff as /contexts' "New Playbook": the builder runs as a
      // conversation in its own transient session, and hands back to the
      // library when it's done.
      event.preventDefault();
      closePlaybookSwitcher();
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: catalogueRoute() });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
      return;
    }
    const navItem = event.target.closest("[data-sidebar-nav]");
    if (navItem) {
      navigate(navItem.dataset.sidebarNav);
      return;
    }
    // Rename action — opens the inline-rename input on the row.
    const renameBtn = event.target.closest("[data-sidebar-row-rename]");
    if (renameBtn) {
      event.preventDefault();
      event.stopPropagation();
      startRenameSidebar(renameBtn.dataset.sidebarRowRename);
      return;
    }
    // Delete action — confirm-modal then cleanup + remove.
    const deleteBtn = event.target.closest("[data-sidebar-row-delete]");
    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();
      deleteSidebarSession(deleteBtn.dataset.sidebarRowDelete);
      return;
    }
    // Pin/unpin a conversation. Captured before the row-navigation handler
    // so clicking the pin button doesn't bubble into a route change.
    const pinBtn = event.target.closest("[data-sidebar-pin]");
    if (pinBtn) {
      event.preventDefault();
      event.stopPropagation();
      togglePinSidebar(pinBtn.dataset.sidebarPin);
      return;
    }
    // 3-dots menu summary click — let <details> handle its own toggle,
    // swallow propagation so the row's session-nav handler doesn't fire,
    // and position the dropdown (fixed-positioned, escapes the sidebar's
    // overflow) just to the right of the trigger.
    const summary = event.target.closest(".app-sidebar__row-menu summary");
    if (summary) {
      event.stopPropagation();
      // Wait for <details>.open to toggle, then position the dropdown.
      requestAnimationFrame(() => {
        const details = summary.closest("details");
        if (!details?.open) return;
        const dropdown = details.querySelector(".app-sidebar__row-menu-dropdown");
        if (!dropdown) return;
        // Under the ⋮, right-aligned to it — the drawer is the screen's width.
        const rect = summary.getBoundingClientRect();
        dropdown.style.left = `${rect.right - dropdown.offsetWidth}px`;
        dropdown.style.top = `${rect.bottom + 4}px`;
        clampToViewport(dropdown, rect.top);
      });
      return;
    }
    const sessionRow = event.target.closest("[data-sidebar-session]");
    if (sessionRow) {
      navigate(`/session/${sessionRow.dataset.sidebarSession}`);
      return;
    }
    // "Sort & group" control — toggle the popover on its trigger.
    if (event.target.closest("[data-sidebar-organize-toggle]")) {
      setOrganizeMenuOpen(!organizeOpen);
      return;
    }
    // "Sort & group" — pick an option (groupBy / sortBy). Persist, close, and
    // re-render so the recent list reorders/regroups.
    const organizeOpt = event.target.closest("[data-sidebar-organize-set]");
    if (organizeOpt) {
      event.preventDefault();
      const { organizeKey, organizeValue } = organizeOpt.dataset;
      if (organizeKey && organizeValue) {
        setOrganizePref(organizeKey, organizeValue);
        setOrganizeMenuOpen(false);
        renderSidebar();
      }
      return;
    }
    // Footer popmenu — toggle on the trigger, dispatch on item click.
    if (event.target.closest("[data-sidebar-foot-toggle]")) {
      setMenuOpen(!menuOpen);
      return;
    }
    // Sidebar head "Give feedback" link OR the popmenu item — same
    // handler. Lot 18.c — the head link is the new visible entry point
    // ; popmenu version stays for keyboard / discoverability.
    if (event.target.closest("[data-sidebar-feedback]")) {
      setMenuOpen(false);
      openFeedbackModal();
      return;
    }
    if (event.target.closest("[data-sidebar-bug]")) {
      setMenuOpen(false);
      openBugReportModal();
      return;
    }
    // Admin (cog popover) — feature-flag toggle. Reloads so stores re-read it.
    const flagRow = event.target.closest("[data-admin-flag]");
    if (flagRow) {
      event.preventDefault();
      toggleFlag(flagRow.dataset.adminFlag);
    }
  });

  // Admin (cog popover) — user-mode and org-role radios both apply + reload.
  el.addEventListener("change", (event) => {
    const mode = event.target.closest('[name="sidebar-admin-user-mode"]');
    if (mode) {
      applyUserMode(mode.value);
      return;
    }
    const role = event.target.closest('[name="sidebar-admin-org-role"]');
    if (role) applyOrgRole(role.value);
  });

  // Keyboard activation for the conversation row — it's a <div role="button">
  // (HTML forbids nesting <details> inside <button>), so Enter/Space need
  // explicit wiring to navigate. Other interactive children (rename, pin,
  // delete, summary) are real <button>/<summary> elements and handle Enter
  // natively; we only intervene when focus is on the row itself.
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-sidebar-session]");
    if (!row || event.target !== row) return;
    event.preventDefault();
    navigate(`/session/${row.dataset.sidebarSession}`);
  });

  // A <details> doesn't close itself on an outside click, and this one is the
  // one dropdown in the rail that survives a click on the page (the row menus
  // are re-rendered away by navigation).
  document.addEventListener("click", (event) => {
    const open = el.querySelector("[data-pb-switcher][open]");
    if (open && !open.contains(event.target)) open.removeAttribute("open");
  });

  // Live-rerender on store mutations so the nav counters and any context
  // colors used by session rows stay in sync without waiting for the next
  // route change.
  subscribeContexts(() => renderSidebar());
  // The switcher prints the active brand and the list under it is scoped to
  // that brand, so a scope change repaints the whole rail.
  subscribeScope(() => renderSidebar());
  subscribeSessions(() => renderSidebar());
  subscribeConnectors(() => renderSidebar());
  // A Topic used or ignored anywhere has to move the unread mark immediately —
  // the reader may never leave the page it happened on.
  subscribeTopics(() => renderSidebar());

  // Click outside the popmenu → close.
  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (event.target.closest("[data-sidebar-foot-menu], [data-sidebar-foot-toggle]")) return;
    setMenuOpen(false);
  });

  // Click outside the "Sort & group" popover → close.
  document.addEventListener("click", (event) => {
    if (!organizeOpen) return;
    if (event.target.closest("[data-sidebar-organize-menu], [data-sidebar-organize-toggle]")) return;
    setOrganizeMenuOpen(false);
  });

  // Click outside an open row ⋮ menu → close it. The dropdown is
  // fixed-positioned so its click events bubble normally to document.
  document.addEventListener("click", (event) => {
    const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
    if (!openDetails) return;
    if (openDetails.contains(event.target)) return;
    openDetails.removeAttribute("open");
  });

  // If the user scrolls the sidebar list while a menu is open, close it
  // — the dropdown is fixed-positioned and wouldn't follow.
  const list = el.querySelector(".app-sidebar__list");
  if (list) {
    list.addEventListener("scroll", () => {
      const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
      if (openDetails) openDetails.removeAttribute("open");
    });
  }
  window.addEventListener("resize", () => {
    const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
    if (openDetails) openDetails.removeAttribute("open");
    if (organizeOpen) setOrganizeMenuOpen(false);
  });

  // Escape closes the innermost open thing: a menu, then the drawer itself.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (menuOpen) setMenuOpen(false);
    else if (organizeOpen) setOrganizeMenuOpen(false);
    else if (isDrawerOpen()) setDrawerOpen(false);
  });
}

export function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  // Re-rendering tears down the popmenu DOM, so reset the local state to
  // match. Any open menu has to be re-opened with a fresh click.
  menuOpen = false;
  organizeOpen = false;
  const path = getPath();
  const activeSessionId = matchSessionId(path);

  el.innerHTML = html`
    <div class="app-sidebar__head">
      <button type="button" class="app-sidebar__brand" data-sidebar-home aria-label="Go to Archie home">
        <h3 class="app-sidebar__brand-title">Archie</h3>
        <span class="app-sidebar__brand-beta ap-badge blue">BETA</span>
      </button>
      <button type="button" class="ap-icon-button transparent" data-sidebar-close aria-label="Close menu">
        <i class="ap-icon-close"></i>
      </button>
    </div>

    ${raw(renderPlaybookSwitcher())}

    <nav class="app-sidebar__nav" aria-label="Library">${raw(renderNav(path))}</nav>

    ${raw(renderOrganizeHeader())}

    <div class="app-sidebar__list" aria-label="Recent conversations">${raw(renderRecentLists(activeSessionId))}</div>

    <div class="app-sidebar__foot">
      <div class="app-sidebar__user">
        <div class="ap-avatar size-32">MB</div>
        <div class="app-sidebar__user-meta">
          <span class="app-sidebar__user-name">Matt Bousendorfer</span>
          <span class="app-sidebar__user-plan">Studio · Team</span>
        </div>
        ${raw(renderFootMenu())}
      </div>
    </div>
  `;
}

// Footer popmenu — trigger button + popmenu list. The popmenu lives in the
// DOM but is hidden until the user taps the trigger. A sibling 💬 icon button
// is the direct, always-visible entry point to Send feedback.
function renderFootMenu() {
  const feedbackBtn = `
      <button
        type="button"
        class="ap-icon-button transparent app-sidebar__foot-feedback"
        data-sidebar-feedback
        aria-label="Send feedback"
        title="Send feedback"
      >
        <i class="ap-icon-single-chat-bubble"></i>
      </button>
    `;
  const inner = `
    ${feedbackBtn}
    <div class="app-sidebar__foot-popmenu-wrap">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-sidebar-foot-toggle
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="More actions"
        title="More actions"
      >
        <i class="ap-icon-cog"></i>
      </button>
      <div
        class="ap-action-dropdown app-sidebar__foot-popmenu"
        role="menu"
        data-sidebar-foot-menu
        hidden
      >
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-feedback>
          <i class="ap-icon-single-chat-bubble"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Send feedback</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-bug>
          <i class="ap-icon-bug"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Report a bug</span>
            </div>
          </div>
        </button>
        <div class="ap-action-dropdown-divider" role="separator"></div>
        ${renderAdminMenu()}
      </div>
    </div>
  `;
  return `<div class="app-sidebar__foot-tools">${inner}</div>`;
}

// Library nav — Playbooks / Connectors standalone views. `count` resolves
// to a live count from the relevant store so the trailing `.ap-counter`
// badge stays in sync. Sources moved into per-session ownership; they
// are no longer browseable workspace-wide so the global /sources page
// was dropped, and the standalone /ideas library was removed too (ideas
// now live only inside a session + the right panel). Chats: the
// recent-conversations list below is the canonical entry point for
// session navigation.
// `flag` gates the row declaratively (was a hardcoded `if` on /connectors). It
// takes a list when a row needs several flags, because a row that survives one
// of its dependencies is worse than no row.
const NAV = [
  {
    path: "/contexts",
    icon: "ap-icon-target",
    label: "Playbooks",
    match: (p) => p === "/contexts",
    count: () => visibleContexts().length,
  },
  // ⚠️ In workspace mode that row is REPLACED, not kept — see workspaceNav().
  // "Playbooks 8" was the only row in a one-brand rail whose destination talked
  // about the seven others, and a second door to them beside the switcher —
  // one that didn't admit it changed scope.
  {
    path: "/connectors",
    icon: "ap-icon-view-grid",
    label: "Connectors",
    flag: "connectors",
    match: (p) => p === "/connectors",
    count: () => getConnectedConnectors().length,
  },
  // The antenna is the listening glyph. The counter is Topics still TO REVIEW in
  // the DEFAULT Playbook's feed — the row is a notification, so it counts what
  // is waiting for an answer rather than everything the feed holds.
  //
  // Scoped to the default Playbook rather than summed across every one, because
  // the feed itself is scoped: a count that spans four brands would send the
  // reader to a screen showing one of them. Which Playbook that is comes from
  // playbookForNewWork(): the active one in workspace mode, the default
  // otherwise — the same resolution the feed itself uses, so the count and the
  // screen it sends you to can never name two different brands.
  // Insights — the one analytics surface you walk to. NO COUNTER, deliberately:
  // the row above reads "Playbooks 7" — a count of THINGS — so an identically
  // styled "Insights 5" gets read as five insights rather than five objectives
  // in trouble.
  {
    path: "/insights",
    icon: "ap-icon-bar-graph",
    label: "Insights",
    flag: "insightsHub",
    match: (p) => p.startsWith("/insights"),
  },
  {
    path: "/topics",
    icon: "ap-icon-antenna",
    label: "Topic Feed",
    // Prefix, not equality: the row stays lit on /topics/settings, which is
    // still the Topic Feed rather than somewhere else.
    match: (p) => p.startsWith("/topics"),
    count: () => {
      const pb = playbookForNewWork() || visibleContexts()[0] || null;
      const feed = pb ? getFeedForPlaybook(pb.id) : null;
      return feed ? countToReview(feed.id) : 0;
    },
  },
];

// The nav, in workspace mode: the catalogue row becomes THIS brand's fiche.
//
// Singular, no counter — a count of one is noise, and the 8 it used to print
// was the cross-brand leak. It is also the honest frequency: while you work you
// open the fiche of the brand you are in (voice, audience, brand) far more often
// than the list of all of them, which you open to switch, create or delete. The
// list moved up to the switcher's footer ("All playbooks"), the one control that
// announces it changes scope.
//
// No active Playbook (new-alt, nothing created yet) → no row at all: the
// switcher is already rendering the offer to create the first one.
function workspaceNav(items) {
  if (!isWorkspaceMode()) return items;
  const active = getActivePlaybook();
  const fiche = active ? `/playbook/${active.id}` : null;
  return items
    .map((item) => {
      if (item.path !== "/contexts") return item;
      if (!fiche) return null;
      return {
        path: fiche,
        icon: "ap-icon-target",
        label: "Playbook",
        match: (p) => p === fiche,
      };
    })
    .filter(Boolean);
}

function renderNav(path) {
  // Action rows at the top of the nav group: New conversation + Search.
  // Both are verbs (not routes), so they live alongside Playbooks / Connectors
  // but never carry the `.is-active` cue. No keyboard hints: the fork is touch-only.
  const newConversationItem = `
    <button
      type="button"
      class="app-sidebar__nav-item"
      data-sidebar-new
      aria-label="New chat"
    >
      <i class="ap-icon-plus"></i>
      <span>New chat</span>
    </button>
  `;

  const searchItem = `
    <button
      type="button"
      class="app-sidebar__nav-item"
      data-sidebar-search-open
      aria-label="Search chats"
    >
      <i class="ap-icon-search"></i>
      <span>Search…</span>
    </button>
  `;

  const routeItems = workspaceNav(NAV.filter((item) => !item.flag || [item.flag].flat().every(isFlagOn)))
    .map((item) => {
      const count = item.count ? item.count() : 0;
      const counter = count > 0 ? `<span class="ap-counter normal grey">${count}</span>` : "";
      return `
      <button
        type="button"
        class="app-sidebar__nav-item ${item.match(path) ? "is-active" : ""}"
        data-sidebar-nav="${item.path}"
        title="${item.label}"
        aria-label="${item.label}"
      >
        <i class="${item.icon}"></i>
        <span>${item.label}</span>
        ${counter}
      </button>
    `;
    })
    .join("");

  return newConversationItem + searchItem + routeItems;
}
