// The right panel's Drafts mode: the feed grouped by network, its filters, the
// per-draft and per-section actions (schedule, save, delete, image, studio,
// rewrite, mention) and the inline editor. Its filter state lives here; the
// shell's delegated clicks write it through setDraftsFilter / setDraftsNetwork.
// Moved out of right-panel.js, unchanged.

import { networkMeta } from "../../social-profiles.js?v=1793";
import { getPosts, removePost, insertPost, updatePostContent, attachImageToDraft } from "../../posts-store.js?v=1793";
import { noticeDraftEdit } from "../../voice-coach.js?v=1793";
import { getContextById, getBrandKitGaps } from "../../contexts-store.js?v=1793";
import { getSessionById } from "../../sessions-store.js?v=1793";
import { renderPostCard } from "../post-card.js?v=1793";
import { html, raw } from "../../utils.js?v=1793";
import { isFlagOn } from "../../feature-flags.js?v=1793";
import { open as openNewScheduleModal } from "../schedule-modal.js?v=1793";
import { open as openLegacyScheduleModal } from "../schedule-modal-legacy.js?v=1793";
import { open as openConfirmModal } from "../confirm-modal.js?v=1793";
import { showToast } from "../toast.js?v=1793";
import { addMention as addComposerMention } from "../../composer-mentions.js?v=1793";
import { startDraftImageFlow } from "../../draft-image-flow.js?v=1793";
import { openDraftStudio, quickImagePreset } from "../../modules/image-studio/index.js?v=1793";
import { RPANEL_CLOSE_INLINE, activeSessionId, canDraftInlineEdit, renderPanel } from "../right-panel.js?v=1793";

// Drafts-mode local UI state — Lot 21 rich-card view. Filter strip at the
// top of the panel head drives both axes : status (all / needs_fixes /
// scheduled) and network (all / linkedin / twitter). Survives across
// open/close cycles so the user keeps their filter when they re-open.
let draftsFilter = "all";

let draftsNetwork = "all";

// The only writers from outside the Drafts view (the shell's delegated clicks):
// an imported `let` is read-only to its importer, so the filter moves through
// these two functions rather than by assignment.
export function setDraftsFilter(value) {
  draftsFilter = value;
}

export function setDraftsNetwork(value) {
  draftsNetwork = value;
}

// Network display metadata for the Drafts list — drives the per-network
// separators, their headers, and the network filter dropdown. `twitter`
// is the posts-store alias for `x`. NETWORK_ORDER gives a stable grouping
// order; only networks actually present in the feed render a section.
// `accent` is the network's brand colour (data, not a DS token — per the
// project's "third-party brand colours live in JS" rule). The drafts band
// no longer tints per-network (it uses the accent-blue selection wash), but
// the colour stays available for other per-network surfaces.
const NETWORK_ORDER = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube"];

function networkMetaFor(network) {
  return networkMeta(network) || { icon: "ap-icon-web", label: network || "Other", accent: "#6B7280" };
}

// Multi-select state for bulk scheduling. Lives across renders inside the
// panel; cleared when a session change or a bulk-schedule confirm fires.
export let selectedDraftIds = new Set();

// Inline-edit state — only one card in edit mode at a time. Snapshot of
// the original body fields powers the "no spurious save" check.
export let editingPostId = null;

let editingOriginal = null;

export function renderDraftsView() {
  const inlineEdit = canDraftInlineEdit();
  if (!inlineEdit && editingPostId) {
    editingPostId = null;
    editingOriginal = null;
  }
  // Scheduling and "Save as draft" both move a post out of this workspace,
  // so the panel only ever shows live drafts — there is no "scheduled" tab
  // anymore. Filter scheduled posts out defensively (covers any seeded
  // `status: "scheduled"` posts too).
  const sid = activeSessionId();
  const allPosts = sid ? getPosts(sid).filter((p) => p.status !== "scheduled") : [];
  if (!allPosts.length) return renderDraftsEmpty();

  // The "scheduled" status filter no longer exists — normalise any stale
  // state left over from an earlier render so the tabs stay in sync.
  if (draftsFilter === "scheduled") draftsFilter = "all";

  // Counts per status — drive the filter rail badges.
  const filterCounts = {
    all: allPosts.length,
    needs_fixes: allPosts.filter((p) => p.status === "needs_fixes").length,
  };

  // The Playbook behind this chat, resolved ONCE for the whole feed: an
  // image-less draft offers to go complete the brand kit, and the card must not
  // resolve a Context itself (it stays a pure render of a post).
  const ctx = sid ? getContextById(getSessionById(sid)?.contextId) : null;
  const brandGaps = getBrandKitGaps(ctx);
  const playbookId = ctx?.id || null;
  // ONCE per feed, on the first image-less draft — not once per card. What the
  // brand kit is missing is a fact about the Playbook, not about this draft, so
  // repeating it down a column of four drafts is four copies of one sentence.
  const firstGapPostId = brandGaps.length
    ? allPosts.find((p) => !p.clipRef && !p.imageUrl && !(p.carousel || []).length)?.id || null
    : null;

  // Apply both filter axes.
  const filtered = allPosts.filter((p) => {
    if (draftsFilter === "needs_fixes" && p.status !== "needs_fixes") return false;
    if (draftsNetwork !== "all" && p.network !== draftsNetwork) return false;
    return true;
  });

  // Filter header — status is the primary axis (which view of the list
  // you're looking at) so it uses the DS .ap-tabs component with
  // .ap-counter badges, matching the Outputs Ideas|Clips tabs. Network
  // is a secondary refinement, so it sits on the trailing edge as a
  // single DS .ap-select (details/summary). Both are first-class DS
  // controls — no native <select> form input, no ad-hoc filter buttons.
  const statusTab = (id, label, count) => {
    const active = draftsFilter === id;
    return `
      <button
        type="button"
        class="ap-tabs-tab ${active ? "active" : ""}"
        data-rpanel-drafts-filter="${id}"
        role="tab"
        aria-selected="${active}"
      >
        <span>${label}</span>
        <span class="ap-counter normal ${active ? "blue" : "grey"}">${count}</span>
      </button>
    `;
  };

  // Network dropdown options are dynamic — only networks actually present
  // in the current drafts, ordered by NETWORK_ORDER.
  const presentNetworks = [
    ...NETWORK_ORDER.filter((n) => allPosts.some((p) => p.network === n)),
    ...[...new Set(allPosts.map((p) => p.network))].filter((n) => !NETWORK_ORDER.includes(n)),
  ];
  const currentNetwork =
    draftsNetwork === "all" ? { icon: "ap-icon-web", label: "All networks" } : networkMetaFor(draftsNetwork);

  const networkOption = (id) => {
    const meta = id === "all" ? { icon: "ap-icon-web", label: "All networks" } : networkMetaFor(id);
    const count = id === "all" ? allPosts.length : allPosts.filter((p) => p.network === id).length;
    const selected = draftsNetwork === id;
    return `
      <div class="ap-select-option ${selected ? "selected" : ""}" data-rpanel-drafts-network="${id}">
        <i class="${meta.icon} ap-select-option-icon"></i>
        <span class="ap-select-option-text">${meta.label} (${count})</span>
        ${selected ? `<i class="ap-icon-check ap-select-option-check"></i>` : ""}
      </div>
    `;
  };

  const filtersBar = `
    <div class="rpanel-drafts__filters">
      <div class="ap-tabs rpanel-drafts__statustabs">
        <div class="ap-tabs-nav" role="tablist" aria-label="Filter drafts by status">
          ${statusTab("all", "All drafts", filterCounts.all)}
          ${statusTab("needs_fixes", "Needs fixes", filterCounts.needs_fixes)}
        </div>
      </div>
      <details class="ap-select rpanel-drafts__network">
        <summary class="ap-select-trigger" aria-label="Filter drafts by network">
          <span class="ap-select-value">
            <i class="${currentNetwork.icon} ap-select-inline-icon"></i> ${currentNetwork.label}
          </span>
          <i class="ap-icon-chevron-down ap-select-arrow"></i>
        </summary>
        <div class="ap-select-dropdown">
          <div class="ap-select-options">
            ${networkOption("all")}
            ${presentNetworks.map((n) => networkOption(n)).join("")}
          </div>
        </div>
      </details>
      ${RPANEL_CLOSE_INLINE}
    </div>
  `;

  // Multi-select — every draft is selectable. Keep the selection set in
  // sync with what actually exists so a removed draft can't ghost-affect
  // the bulk bar.
  const allIds = new Set(allPosts.map((p) => p.id));
  for (const id of Array.from(selectedDraftIds)) {
    if (!allIds.has(id)) selectedDraftIds.delete(id);
  }
  const selectedCount = selectedDraftIds.size;

  // Feed grouped by network with a separator header per group. Each header
  // carries a per-network "Select all" so a bulk selection naturally stays
  // within one network (the gate for scheduling). Groups follow
  // NETWORK_ORDER; any unknown network falls in after the known ones.
  const feedGroups = [
    ...NETWORK_ORDER.filter((n) => filtered.some((p) => p.network === n)),
    ...[...new Set(filtered.map((p) => p.network))].filter((n) => !NETWORK_ORDER.includes(n)),
  ];

  // Each network section is self-contained: the separator IS the section
  // header AND its bulk-action surface, in two states that share one row
  // (so there's no layout jump on selection):
  //   • Idle      — a calm divider: brand chip + draft count on a hairline,
  //                 no controls. The whole band is click-to-select-all.
  //   • Selecting — the divider fills into a solid contextual toolbar with
  //                 the network's bulk actions. Because every action is
  //                 scoped to one network, scheduling is always valid — so
  //                 there are never dead/disabled buttons sitting idle.
  // The header is sticky so the toolbar stays reachable while scrolling.
  const renderGroup = (network) => {
    const meta = networkMetaFor(network);
    const groupPosts = filtered.filter((p) => p.network === network);
    const groupSelected = groupPosts.filter((p) => selectedDraftIds.has(p.id)).length;
    const allGroupSelected = groupPosts.length > 0 && groupSelected === groupPosts.length;
    const indeterminate = groupSelected > 0 && !allGroupSelected;
    const selecting = groupSelected > 0;
    const cards = groupPosts
      .map((p) =>
        renderPostCard(p, {
          editing: p.id === editingPostId,
          inlineEdit,
          selectable: true,
          selected: selectedDraftIds.has(p.id),
          brandGaps: p.id === firstGapPostId ? brandGaps : [],
          playbookId,
          // What Generate an image will use: the Playbook's look and this
          // network's shape, shown before the click.
          imagePreset: playbookId && !p.imageUrl ? quickImagePreset({ brandId: playbookId, network: p.network }) : null,
        }),
      )
      .join("");
    const draftWord = groupPosts.length === 1 ? "draft" : "drafts";

    const countLabel = selecting ? `· ${groupSelected} selected` : `· ${groupPosts.length} ${draftWord}`;
    const delAria = `Delete ${groupSelected} selected ${meta.label} ${groupSelected === 1 ? "draft" : "drafts"}`;

    // Bulk actions live in the band and only render while a selection
    // exists (per Figma 1007:3335): Save = ghost-blue link, Schedule =
    // stroked-blue with calendar, Delete = grey icon button. No idle
    // controls — no hairline, no "Select all" hint.
    const actions = selecting
      ? `
          <div class="rpanel-drafts__group-actions">
            <button type="button" class="ap-button ghost blue" data-rpanel-section-save="${network}">Save as drafts</button>
            <button type="button" class="ap-button stroked blue" data-rpanel-section-schedule="${network}">
              <i class="ap-icon-calendar" aria-hidden="true"></i> Schedule
            </button>
            <button type="button" class="ap-icon-button" data-rpanel-section-delete="${network}" aria-label="${delAria}">
              <i class="ap-icon-trash" aria-hidden="true"></i>
            </button>
          </div>`
      : "";

    // The band IS the bar: the select-all checkbox sits inside it (left),
    // then the network identity, then (when selecting) the action cluster.
    // Idle is flat/white; hover and selecting tint with the accent wash.
    return `
      <div class="rpanel-drafts__group-header${selecting ? " is-selecting" : ""}">
        <div class="rpanel-drafts__group-band" data-rpanel-drafts-band="${network}">
          <label class="ap-checkbox-container ${indeterminate ? "indeterminate" : ""}" aria-label="Select all ${meta.label} drafts">
            <input type="checkbox" data-rpanel-drafts-select-network="${network}" ${allGroupSelected ? "checked" : ""} />
            <i></i>
          </label>
          <div class="rpanel-drafts__group-identity">
            <i class="${meta.icon} rpanel-drafts__group-icon" aria-hidden="true"></i>
            <span class="rpanel-drafts__group-label">${meta.label}</span>
            <span class="rpanel-drafts__group-count">${countLabel}</span>
          </div>
          ${actions}
        </div>
      </div>
      ${cards}
    `;
  };

  const feed = filtered.length
    ? feedGroups.map((n) => renderGroup(n)).join("")
    : `<div class="app-right-panel__empty">
         <div class="app-right-panel__empty-icon"><i class="ap-icon-search"></i></div>
         <div class="app-right-panel__empty-title">No drafts match this filter</div>
         <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
         <div class="app-right-panel__empty-action">
           <button type="button" class="ap-button stroked grey" data-rpanel-drafts-clear>Clear filters</button>
         </div>
       </div>`;

  // Layout: fixed filter header, then the scrolling feed. Bulk actions
  // live inside each network's (sticky) section header, so there is no
  // separate footer bar.
  return html`
    <div class="rpanel-drafts ${selectedCount ? "has-selection" : ""}">
      ${raw(filtersBar)}
      <div class="posts__feed rpanel-drafts__feed">${raw(feed)}</div>
    </div>
  `;
}

function renderDraftsEmpty() {
  return html`
    <div class="app-right-panel__empty">
      <div class="app-right-panel__empty-icon"><i class="ap-icon-pen"></i></div>
      <div class="app-right-panel__empty-title">No drafts yet</div>
      <div class="app-right-panel__empty-sub">
        Ask Archie for a batch — drafts will land here ready to review and schedule.
      </div>
    </div>
  `;
}

export function onPostRewrite(postId, intent = "fresh") {
  const sid = activeSessionId();
  if (!sid) return;
  // draft-rewrite.js owns the full visual flow: ghost skeleton →
  // streaming → commit. Loaded lazily so the rewrite code is only
  // pulled in when the user actually triggers a regen. `intent` biases
  // the rewrite (shorter / longer / warmer / formal / fresh).
  import("../../draft-rewrite.js?v=1793").then(({ startRewrite }) => {
    startRewrite(sid, postId, intent);
  });
}

// Close every open regenerate dropdown and reset its trigger's aria state.
export function closeAllRewriteMenus() {
  document.querySelectorAll(".posts__rewrite-menu:not([hidden])").forEach((menu) => {
    menu.hidden = true;
    const id = menu.getAttribute("data-post-rewrite-menu-for");
    if (id)
      document.querySelector(`[data-post-rewrite-menu="${cssEscape(id)}"]`)?.setAttribute("aria-expanded", "false");
  });
}

export function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// "New SM" flag: the redesigned modal, or the previous one kept for
// comparison. Same call shape; the legacy one ignores `playbookId`.
function openScheduleModal(opts) {
  return isFlagOn("newScheduleModal") ? openNewScheduleModal(opts) : openLegacyScheduleModal(opts);
}

export function onPostSchedule(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  openScheduleModal({
    posts: [post],
    // The chat's Playbook — whose saved posting rhythm the modal opens on.
    playbookId: getSessionById(sid)?.contextId || null,
    onConfirm: () => {
      // The modal queues the post on confirm; here we just drop it from
      // the Drafts workspace.
      commitScheduled(sid, [post]);
      selectedDraftIds.delete(post.id);
      renderPanel();
    },
  });
}

// The drafts of one network currently visible under the active filters —
// the scope a section's "Select all" (checkbox or band click) acts on.
export function visibleNetworkPosts(network) {
  const sid = activeSessionId();
  if (!sid) return [];
  return getPosts(sid).filter((p) => {
    if (p.status === "scheduled") return false;
    if (p.network !== network) return false;
    if (draftsFilter === "needs_fixes" && p.status !== "needs_fixes") return false;
    if (draftsNetwork !== "all" && p.network !== draftsNetwork) return false;
    return true;
  });
}

// Select or clear every visible draft of one network, then repaint.
export function setNetworkSelection(network, shouldSelect) {
  const visible = visibleNetworkPosts(network);
  for (const p of visible) {
    if (shouldSelect) selectedDraftIds.add(p.id);
    else selectedDraftIds.delete(p.id);
  }
  renderPanel();
}

// The target for a section's bulk action: the network's selected drafts.
// Snapshotted with the original feed index so a toast Undo can restore
// them in place. (Buttons are disabled when nothing is selected, so this
// is only ever called with a non-empty selection.)
function sectionTargetSnapshot(sid, network) {
  return getPosts(sid)
    .map((post, idx) => ({ post, idx }))
    .filter(({ post }) => post.network === network && selectedDraftIds.has(post.id));
}

// Per-network bulk delete — confirm-modal gate (destructive), then drop
// the selected drafts of that network with an Undo toast.
export function onSectionDelete(network) {
  const sid = activeSessionId();
  if (!sid) return;
  const snapshot = sectionTargetSnapshot(sid, network);
  if (snapshot.length === 0) return;
  const count = snapshot.length;
  const draftWord = count === 1 ? "draft" : "drafts";
  openConfirmModal({
    title: `Delete ${count} ${draftWord}?`,
    body: `${count === 1 ? "This draft" : `These ${count} drafts`} will be removed from the session. You can undo right after.`,
    confirmLabel: `Delete ${count} ${draftWord}`,
    danger: true,
    onConfirm: () => {
      for (const { post } of snapshot) {
        removePost(sid, post.id);
        selectedDraftIds.delete(post.id);
      }
      renderPanel();
      showToast(`${count} ${draftWord} deleted`, {
        action: {
          label: "Undo",
          onClick: () => {
            // Re-insert in ascending original index so positions line up.
            for (const { post, idx } of snapshot) insertPost(sid, post, idx);
            renderPanel();
          },
        },
      });
    },
  });
}

// Per-network schedule — opens the modal seeded with the section's target
// drafts (selection, or all of the network when nothing is checked).
// Single-network by construction, so always valid.
export function onSectionSchedule(network) {
  const sid = activeSessionId();
  if (!sid) return;
  const target = sectionTargetSnapshot(sid, network).map(({ post }) => post);
  if (target.length === 0) return;
  openScheduleModal({
    posts: target,
    playbookId: getSessionById(sid)?.contextId || null,
    onConfirm: () => {
      commitScheduled(sid, target);
      for (const p of target) selectedDraftIds.delete(p.id);
      renderPanel();
    },
  });
}

// The chat's "Adjust dates" on a schedule plan: the same modal, the same commit
// as the panel's own Schedule, for the drafts the plan named. `onScheduled`
// lets the chat say what happened.
export function openScheduleForPosts(sid, posts, onScheduled) {
  if (!sid || !posts.length) return;
  openScheduleModal({
    posts,
    playbookId: getSessionById(sid)?.contextId || null,
    onConfirm: (slots) => {
      commitScheduled(sid, posts);
      for (const p of posts) selectedDraftIds.delete(p.id);
      renderPanel();
      onScheduled?.(slots);
    },
  });
}

// Remove a freshly-scheduled batch from the Drafts workspace. The schedule
// modal already pushes the posts onto the calendar queue (schedule-store)
// on confirm, so here we only drop them from the list.
function commitScheduled(sid, posts) {
  for (const p of posts) removePost(sid, p.id);
}

// Per-network "Save as drafts" — opens the save modal for the section's
// target drafts (selection, or all of the network when nothing is checked).
// The modal offers three choices: keep them as separate drafts, file them
// into a new Agorapulse folder, or into an existing one. Whatever the user
// picks, the drafts leave the workspace with an Undo toast that restores the
// batch in place (and reverses the folder count for the folder choices).
export function onSectionSave(network) {
  const sid = activeSessionId();
  if (!sid) return;
  const snapshot = sectionTargetSnapshot(sid, network);
  if (snapshot.length === 0) return;
  const count = snapshot.length;
  const draftWord = count === 1 ? "draft" : "drafts";
  Promise.all([import("../save-folder-modal.js?v=1793"), import("../../folders-store.js?v=1793")]).then(
    ([{ open: openSaveModal }, { addDraftsToFolder }]) => {
      openSaveModal({
        count,
        // folder === null → save as separate drafts; otherwise file into it.
        onConfirm: (folder) => {
          for (const { post } of snapshot) {
            removePost(sid, post.id);
            selectedDraftIds.delete(post.id);
          }
          if (folder) addDraftsToFolder(folder.id, count);
          renderPanel();
          const message = folder
            ? `${count} ${draftWord} saved to “${folder.name}”`
            : `${count} ${draftWord} saved as draft`;
          showToast(message, {
            action: {
              label: "Undo",
              onClick: () => {
                for (const { post, idx } of snapshot) insertPost(sid, post, idx);
                if (folder) addDraftsToFolder(folder.id, -count);
                renderPanel();
              },
            },
          });
        },
      });
    },
  );
}

// Per-card "Save as draft" — single-post counterpart of onSaveAsDraft.
export function onPostSaveAsDraft(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const idx = getPosts(sid).findIndex((p) => p.id === postId);
  if (idx < 0) return;
  const post = getPosts(sid)[idx];
  removePost(sid, postId);
  selectedDraftIds.delete(postId);
  renderPanel();
  showToast("Saved as draft", {
    action: {
      label: "Undo",
      onClick: () => {
        insertPost(sid, post, idx);
        renderPanel();
      },
    },
  });
}

// Drafts have no title, so the composer pill reads "<Network> — <snippet>"
// (e.g. "LinkedIn — Boost your reach this quarter…"), derived from the
// draft's network + the first line of its body. Mirrors the Mention action
// on idea / clip / source cards, which feed addComposerMention a string.
const NETWORK_PILL_LABEL = {
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function onPostMention(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  const network = NETWORK_PILL_LABEL[(post.network || "").toLowerCase()] || "Draft";
  const firstLine = (Array.isArray(post.text) ? post.text[0] : post.text) || "";
  const snippet = firstLine.trim().slice(0, 40);
  const label = snippet ? `${network} — ${snippet}${firstLine.trim().length > 40 ? "…" : ""}` : `${network} draft`;
  addComposerMention(sid, label);
}

export function onPostDelete(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const idx = getPosts(sid).findIndex((p) => p.id === postId);
  if (idx < 0) return;
  selectedDraftIds.delete(postId);
  const removed = removePost(sid, postId);
  if (!removed) return;
  showToast("Draft deleted", {
    action: {
      label: "Undo",
      onClick: () => insertPost(sid, removed, idx),
    },
  });
}

// "Generate an image" on a draft's empty media slot → one image, in place, no
// studio. This used to open the Image Studio; the studio is where you go to
// STEER an image (references, type, style, format, branding), and paying a
// full-screen modal to press one button was the long way round for "just give
// me an image". The studio stays one click away on the result, via Edit.
//
// No toast: the image appearing in the slot IS the feedback, and Remove sits
// right there on it if it's wrong. Nothing is asked either (2026-10-08): the
// click goes straight to the loader, with the Playbook's look and this
// network's shape (draft-image-flow.js).
export function onPostImage(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post || post.isGeneratingImage) return;
  startDraftImageFlow(sid, postId, { repaint: renderPanel });
}

// Open the Image Studio on a draft, in whichever mode its media calls for. One
// function behind two entry points: the rail's Image Studio button (any state)
// and "Edit" / "Edit slides" on the media itself (contextual).
//
// The no-media branch is why the rail button exists. "Generate an image" in the
// empty slot produces a picture in one click with no way to steer it, and the
// media block's studio controls only exist once there IS media — so an
// image-less draft had no route to the studio at all.
export function onPostStudio(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  // The Image Generator's studio: the draft's Playbook as the brand, and the PNG back into the post.
  openDraftStudio({
    brandId: getSessionById(sid)?.contextId || null,
    network: post.network,
    text: Array.isArray(post.text) ? post.text.join("\n") : post.text || "",
    imageUrl: post.imageUrl || "",
    slides: Array.isArray(post.carousel) ? post.carousel.length : 0,
    onUse: (dataUrl) => attachImageToDraft(sid, postId, dataUrl),
    // "In feed": this very draft as the Drafts board draws it, the studio's
    // image in place of its own. The module can't import post-card, so the
    // card comes from here; `inert` because it's a picture of the card, not
    // a second set of its controls.
    renderFeedPreview: (imageUrl) => {
      const live = getPosts(sid).find((p) => p.id === postId) || post;
      return `<div class="posts__feed-preview" inert>${renderPostCard({
        ...live,
        imageUrl,
        carousel: null,
        clipRef: null,
        isRegenerating: false,
      })}</div>`;
    },
  });
}

// Upload / change a draft image without the AI studio — spin up a throwaway
// file picker, turn the pick into an object URL and attach it to the draft.
// We deliberately keep the object URL alive (no revoke) since the card keeps
// rendering it as its src.
export function onPostImageUpload(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    attachImageToDraft(sid, postId, URL.createObjectURL(file));
    renderPanel();
  });
  input.click();
}

// Clear a draft image — nulling imageUrl drops the card back to the
// generate/upload placeholder (post-card.js renders on imageUrl presence).
export function onPostImageRemove(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  attachImageToDraft(sid, postId, null);
  renderPanel();
  showToast("Image removed");
}

export function startEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId === postId) return;
  if (editingPostId) commitEdit(editingPostId); // auto-save the previous card
  const sid = activeSessionId();
  const post = sid && getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  editingPostId = postId;
  editingOriginal = {
    text: [...(post.text || [])],
    hashtags: [...(post.hashtags || [])],
    cta: post.cta || "",
  };
  renderPanel();
  // Focus the editor and place caret at the end of the body.
  requestAnimationFrame(() => {
    const editor = document.querySelector(`[data-post-editor="${postId}"]`);
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

export function commitEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId !== postId) return;
  const sid = activeSessionId();
  const editor = document.querySelector(`[data-post-editor="${postId}"]`);
  if (!sid || !editor) {
    editingPostId = null;
    editingOriginal = null;
    renderPanel();
    return;
  }
  const parsed = parseEditorBody(editor.innerText);
  const original = editingOriginal;
  const changed =
    JSON.stringify(parsed.text) !== JSON.stringify(original.text) ||
    JSON.stringify(parsed.hashtags) !== JSON.stringify(original.hashtags) ||
    parsed.cta !== original.cta;
  editingPostId = null;
  editingOriginal = null;
  if (changed) {
    updatePostContent(sid, postId, parsed); // notify → posts-store subscriber re-renders
    noticeDraftEdit(sid, postId, original, parsed); // flag networkVoices: may propose a rule
  } else {
    renderPanel(); // no notify path → render manually
  }
}

export function cancelEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId !== postId) return;
  editingPostId = null;
  editingOriginal = null;
  renderPanel();
}

// Reverse of post-card.js#serializeBody — split blank-line-separated
// blocks, find the hashtag-only block (if any), extract its tags into
// the hashtags array. Everything else becomes text[]. CTA folds into
// text[] as a regular paragraph (accepted per spec — only hashtags need
// to re-style on save).
//
// The hashtag block can sit anywhere among the blocks (typically last
// in social-post convention, but a CTA may follow it). Scanning all
// blocks instead of walking from the end keeps the round-trip robust
// against either ordering.
function parseEditorBody(raw) {
  const blocks = String(raw)
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const text = [];
  let hashtags = [];
  for (const block of blocks) {
    if (!hashtags.length && /^(#\S+\s*)+$/.test(block)) {
      hashtags = block
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/^#/, ""));
    } else {
      text.push(block);
    }
  }
  return { text, hashtags, cta: "" };
}
