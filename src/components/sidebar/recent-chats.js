// The rail's chat list: Sort & group (the organize prefs live in sidebar.js),
// date buckets, the rows, and their pin / rename / delete. Moved out of
// sidebar.js, unchanged.

import { isWorkspaceMode, scopeSessions } from "../../active-playbook.js?v=1837";
import {
  getSessions,
  getSessionById,
  togglePin as togglePinSession,
  updateSession,
  deleteSession,
} from "../../sessions-store.js?v=1837";
import { isNewUser } from "../../user-mode.js?v=1837";
import { escapeHtml } from "../../utils.js?v=1837";
import { getContextById } from "../../contexts-store.js?v=1837";
import { canView } from "../../playbook-access.js?v=1837";
import { showToast } from "../toast.js?v=1837";
import { open as openRenameModal } from "../rename-modal.js?v=1837";
import { open as openConfirmModal } from "../confirm-modal.js?v=1837";
import { clearSession as clearAssistantSession } from "../../assistant.js?v=1837";
import { clearSession as clearPostsSession } from "../../posts-store.js?v=1837";
import { clearSession as clearLibrarySession } from "../../library.js?v=1837";
import { clearSession as clearSourcesSession } from "../../sources-stream.js?v=1837";
import { getPath, navigate } from "../../router.js?v=1837";
import { closePanel as closeRightPanel } from "../right-panel.js?v=1837";
import { getOrganizePrefs } from "../sidebar.js?v=1837";

// "Sort & group" control — options for the two rows. Grouping is limited to the
// dimensions the session record supports: Playbook (contextId) and Date
// (derived from the lastActivity label). Sorting is name or the current
// (recency) order.
const ORGANIZE_GROUP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "playbook", label: "Playbook" },
  { value: "date", label: "Date" },
];

// The options actually offered, and the grouping actually applied. In workspace
// mode the list already IS one Playbook, so "Group by → Playbook" would draw a
// single heading over everything — the option goes, and a preference stored
// before the switch falls back to None rather than rendering that heading.
function organizeGroupOptions() {
  return isWorkspaceMode() ? ORGANIZE_GROUP_OPTIONS.filter((o) => o.value !== "playbook") : ORGANIZE_GROUP_OPTIONS;
}

function effectiveGroupBy(groupBy) {
  return isWorkspaceMode() && groupBy === "playbook" ? "none" : groupBy;
}

const ORGANIZE_SORT_OPTIONS = [
  { value: "recency", label: "Recency" },
  { value: "alphabetical", label: "Alphabetical" },
];

// Chronological buckets for "Group by → Date", most-recent first. Rendered in
// this order, empty buckets skipped.
const ORGANIZE_DATE_BUCKETS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

// Map a session to a date bucket. Sessions carry no real timestamp — only the
// human `lastActivity` label ("2 hours ago", "Yesterday", "5 days ago", "just
// now") — so parse that. Unknown / undated → "Older".
function sessionDateBucket(session) {
  const s = (session.lastActivity || "").toLowerCase();
  if (
    !s ||
    s.includes("now") ||
    s.includes("today") ||
    s.includes("second") ||
    s.includes("min") ||
    s.includes("hour") ||
    s.includes("hr")
  ) {
    return "Today";
  }
  if (s.includes("yesterday")) return "Yesterday";
  const dayMatch = s.match(/(\d+)\s*day/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    if (n <= 1) return "Yesterday";
    if (n <= 7) return "Previous 7 days";
    if (n <= 30) return "Previous 30 days";
    return "Older";
  }
  const weekMatch = s.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7 <= 30 ? "Previous 30 days" : "Older";
  if (s.includes("week")) return "Previous 30 days";
  return "Older";
}

// Apply the active sort to a list of sessions. "recency" keeps the store order
// (sessions are seeded newest-first); "alphabetical" sorts by name.
function sortSessions(list, sortBy) {
  if (sortBy === "alphabetical") {
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return list.slice();
}

// One section of the "Sort & group" popover — a quiet label + its option rows,
// the active one marked with a check. Deliberately FLAT: the ADS has no
// nested/flyout-dropdown pattern, so all options are shown at once inside a
// single action-dropdown, reusing only the DS item + divider primitives.
function renderOrganizeSection(label, key, options, current) {
  const items = options
    .map((opt) => {
      const active = opt.value === current;
      return `
        <button
          type="button"
          role="menuitemradio"
          aria-checked="${active ? "true" : "false"}"
          class="ap-action-dropdown-item"
          data-sidebar-organize-set
          data-organize-key="${key}"
          data-organize-value="${opt.value}"
        >
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">${opt.label}</span>
            </div>
          </div>
          ${active ? `<i class="ap-icon-check app-sidebar__organize-check" aria-hidden="true"></i>` : ""}
        </button>
      `;
    })
    .join("");
  return `
    <div class="app-sidebar__organize-section" role="group" aria-label="${label}">
      <div class="app-sidebar__organize-section-label" aria-hidden="true">${label}</div>
      ${items}
    </div>
  `;
}

// Header row above the recent-chats list: a quiet "Chats" caption + a filter
// button that opens the Group by / Sort by popover.
export function renderOrganizeHeader() {
  const { groupBy, sortBy } = getOrganizePrefs();
  return `
    <div class="app-sidebar__list-header">
      <span class="app-sidebar__list-header-label">Chats</span>
      <button
        type="button"
        class="ap-icon-button transparent app-sidebar__organize-toggle"
        data-sidebar-organize-toggle
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="Sort & group chats"
        title="Sort & group chats"
      >
        <i class="ap-icon-filter"></i>
      </button>
      <div class="ap-action-dropdown app-sidebar__organize-menu" role="menu" data-sidebar-organize-menu hidden>
        ${renderOrganizeSection("Group by", "groupBy", organizeGroupOptions(), effectiveGroupBy(groupBy))}
        <div class="ap-action-dropdown-divider" role="separator"></div>
        ${renderOrganizeSection("Sort by", "sortBy", ORGANIZE_SORT_OPTIONS, sortBy)}
      </div>
    </div>
  `;
}

// Pinned + Recent groups. Search lives in a dedicated modal now
// (./search-modal.js) — the sidebar always renders the full list.
export function renderRecentLists(activeSessionId) {
  // Scoped to the active Playbook in workspace mode — the rail under the
  // switcher is that brand's work and nothing else.
  const allSessions = scopeSessions(getSessions());
  if (isNewUser() || allSessions.length === 0) {
    // FIND-E4: first-run anchor for the recent-conversations list. The
    // bare "No conversations yet" was a dead end — anchor a soft hint
    // that points at the New conversation button just above this list,
    // so the user has an obvious next move without duplicating the
    // primary CTA.
    // A scope that hides has to say so: chats DO exist, just not in this
    // brand, and "No chats yet" under a switcher would read as "the app is
    // empty" instead of "you're looking at Acme".
    const scopedEmpty = !isNewUser() && getSessions().length > 0;
    return `
      <div class="app-sidebar__empty app-sidebar__empty--first-run">
        <div class="app-sidebar__empty-icon">
          <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
        </div>
        <span class="app-sidebar__empty-text">${scopedEmpty ? "No chats in this playbook" : "No chats yet"}</span>
        <span class="app-sidebar__empty-hint">Start one with the New chat button above.</span>
      </div>
    `;
  }
  const { groupBy: storedGroupBy, sortBy } = getOrganizePrefs();
  const groupBy = effectiveGroupBy(storedGroupBy);

  const pinned = sortSessions(
    allSessions.filter((s) => s.pinned),
    sortBy,
  );
  const unpinned = sortSessions(
    allSessions.filter((s) => !s.pinned),
    sortBy,
  );

  const heading = (label) => `<div class="app-sidebar__section-heading">${escapeHtml(label)}</div>`;
  const rows = (list) => list.map((s) => renderSessionRow(s, activeSessionId)).join("");

  let out = "";
  // Pinned always leads, regardless of grouping.
  if (pinned.length > 0) {
    out += heading("Pinned");
    out += rows(pinned);
  }

  if (groupBy === "playbook") {
    // Bucket the unpinned rows by their Playbook (contextId), ordered by first
    // appearance in the sorted list; a "No playbook" bucket is forced last.
    const buckets = new Map();
    const NONE = "__none__";
    for (const s of unpinned) {
      const ctx = visibleCtx(s.contextId);
      const key = ctx?.id || NONE;
      if (!buckets.has(key)) {
        buckets.set(key, { label: ctx?.name || "No playbook", rows: [] });
      }
      buckets.get(key).rows.push(s);
    }
    const ordered = [...buckets.entries()].sort(([a], [b]) => {
      if (a === NONE) return 1;
      if (b === NONE) return -1;
      return 0;
    });
    for (const [, bucket] of ordered) {
      out += heading(bucket.label);
      out += rows(bucket.rows);
    }
  } else if (groupBy === "date") {
    // Bucket the unpinned rows by recency, rendered in fixed chronological
    // order (most-recent first); empty buckets are skipped.
    const buckets = new Map();
    for (const s of unpinned) {
      const label = sessionDateBucket(s);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(s);
    }
    for (const label of ORGANIZE_DATE_BUCKETS) {
      const bucketRows = buckets.get(label);
      if (bucketRows && bucketRows.length > 0) {
        out += heading(label);
        out += rows(bucketRows);
      }
    }
  } else if (unpinned.length > 0) {
    out += heading("Recent");
    out += rows(unpinned);
  }
  return out;
}

// One conversation row — Claude-style minimal layout:
//   [color dot]  [title]                                          [⋮ on hover]
// The color dot resolves the row's bound playbook color (orange / blue /
// green / etc.); falls back to grey when the session has no playbook
// attached. Pinned status is conveyed only by the PINNED section header
// above the row (no extra glyph on the row itself).
// The Playbook behind a chat, but only when I'm allowed to see it: a chat that
// lost access falls back to the grey dot and the "No playbook" bucket rather
// than advertising a name I can't open.
function visibleCtx(contextId) {
  if (!contextId) return null;
  const ctx = getContextById(contextId);
  return ctx && canView(ctx) ? ctx : null;
}

function renderSessionRow(session, activeSessionId) {
  const isActive = session.id === activeSessionId;
  const ctx = visibleCtx(session.contextId);
  const dotColor = ctx?.color || "grey";
  const isPinned = !!session.pinned;
  const safeName = escapeHtml(session.name);
  // <div role="button"> rather than <button> so we can nest the <details>
  // dropdown legitimately without breaking HTML semantics.
  return `
    <div
      class="app-sidebar__row ${isActive ? "is-active" : ""}"
      data-sidebar-session="${session.id}"
      data-sidebar-pinned="${isPinned ? "true" : "false"}"
      role="button"
      tabindex="0"
    >
      <span
        class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${dotColor}"
        aria-hidden="true"
      ></span>
      <span class="app-sidebar__row-title">${safeName}</span>
      <details class="ap-select app-sidebar__row-menu" data-sidebar-row-menu>
        <summary
          class="app-sidebar__row-more"
          aria-label="More actions"
          title="More actions"
        >
          <i class="ap-icon-more"></i>
        </summary>
        <div class="ap-action-dropdown app-sidebar__row-menu-dropdown" role="menu">
          <button type="button" class="ap-action-dropdown-item" role="menuitem" data-sidebar-row-rename="${session.id}">
            <i class="ap-icon-pen"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Rename</span>
              </div>
            </div>
          </button>
          <button type="button" class="ap-action-dropdown-item" role="menuitem" data-sidebar-pin="${session.id}">
            <i class="ap-icon-pin"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">${isPinned ? "Unpin" : "Pin"}</span>
              </div>
            </div>
          </button>
          <button type="button" class="ap-action-dropdown-item red-mode" role="menuitem" data-sidebar-row-delete="${session.id}">
            <i class="ap-icon-trash"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Delete</span>
              </div>
            </div>
          </button>
        </div>
      </details>
    </div>
  `;
}

// Toggle the pinned flag on a session via the sessions-store, then
// surface a toast with an Undo action. The store's subscribe hook
// re-renders the sidebar automatically.
export function togglePinSidebar(sessionId) {
  const before = getSessionById(sessionId);
  if (!before) return;
  const after = togglePinSession(sessionId);
  if (!after) return;
  showToast(after.pinned ? "Chat pinned" : "Chat unpinned", {
    action: {
      label: "Undo",
      onClick: () => togglePinSession(sessionId),
    },
  });
}

// Open the rename modal for a session. The modal owns its own input +
// keyboard handling; on Save we patch the session and the store's
// subscribe hook re-renders the sidebar + topbar.
export function startRenameSidebar(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  // Close any open dropdown menus that may have triggered this rename.
  document.querySelectorAll(".app-sidebar__row-menu[open]").forEach((el) => el.removeAttribute("open"));
  openRenameModal({
    title: "Rename chat",
    initialName: session.name,
    placeholder: "Chat name",
    confirmLabel: "Save name",
    onSubmit: (name) => updateSession(sessionId, { name }),
  });
}

// Delete a conversation via confirm-modal. Cleans up every per-session
// store before removing from the sessions list, and redirects to the
// dashboard if the user was viewing the deleted session.
export function deleteSidebarSession(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  openConfirmModal({
    title: "Delete chat?",
    body: `"${session.name}" and its sources, ideas, and drafts will be permanently removed.`,
    confirmLabel: "Delete chat",
    cancelLabel: "Keep",
    danger: true,
    onConfirm: () => {
      // Sweep per-session state before pulling the row.
      try {
        clearAssistantSession(sessionId);
      } catch {}
      try {
        clearPostsSession(sessionId);
      } catch {}
      try {
        clearLibrarySession(sessionId);
      } catch {}
      try {
        clearSourcesSession(sessionId);
      } catch {}
      deleteSession(sessionId);
      // If the user was viewing this session, bounce them home.
      const activeId = matchSessionId(getPath());
      if (activeId === sessionId) {
        closeRightPanel();
        navigate("/");
      }
      showToast("Chat deleted");
    },
  });
}

export function matchSessionId(path) {
  const m = /^\/session\/([^/?]+)/.exec(path);
  return m ? m[1] : null;
}
