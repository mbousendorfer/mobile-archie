// Analyze-social-profiles dialog. Lets the user pick one or more connected
// social profiles to (re-)fill a Playbook's sections from their posts. Same
// init/open/close pattern as rename-modal / confirm-modal.
//
// Public API:
//   init()                       — inject markup + bind once on app boot
//   open({ onConfirm, network }) — onConfirm(selectedProfileIds: string[]);
//                                  `network` (voice per network) lists only that
//                                  network's profiles and rebuilds its adaptation
//
// Behaviour:
//   - Lists getConnectedProfiles() as a checkable list; profiles with no
//     posts are disabled (nothing to learn from).
//   - "Analyze & fill" is disabled until at least one profile is selected;
//     it fires onConfirm(ids) then closes. A warning notes the overwrite.
//   - Cancel / Esc / backdrop / close-X dismiss without firing.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1841";
import { escapeHtml as esc } from "../utils.js?v=1841";
import {
  getConnectedProfiles,
  normalizeNetwork,
  networkMeta,
  NETWORK_ICON_BY_PLATFORM,
  BRAND_INITIALS,
  PROFILE_SEARCH_THRESHOLD,
} from "../social-profiles.js?v=1841";

const MODAL_ID = "analyze-profiles";

let backdrop, modal, listEl, confirmBtn, cancelBtn, closeBtn, searchGroup, searchInput, noMatchEl;
let initialized = false;
let pendingOnConfirm = null;
let onlyNetwork = null; // voice per network: the network whose voice is rebuilt
let leadEl, warnEl;

const HTML = `
<div class="app-modal-backdrop analyze-profiles-modal__backdrop" id="analyzeProfilesBackdrop" hidden></div>
<aside
  class="ap-dialog analyze-profiles-modal"
  id="analyzeProfilesModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="analyzeProfilesTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="analyzeProfilesTitle">Analyze social profiles</span>
  </div>
  <button class="ap-dialog-close" type="button" id="analyzeProfilesClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="analyze-profiles-modal__lead" id="analyzeProfilesLead">
      Pick the profiles to learn from — I read their recent posts and rebuild your Voice &amp; style.
    </p>
    <div class="ap-input-group analyze-profiles-modal__search" id="analyzeProfilesSearchGroup" hidden>
      <i class="ap-icon-search" aria-hidden="true"></i>
      <input
        type="search"
        id="analyzeProfilesSearch"
        placeholder="Search profiles by name, handle or network…"
        aria-label="Search profiles"
        autocomplete="off"
      />
    </div>
    <div class="analyze-profiles-modal__list" id="analyzeProfilesList" role="group" aria-label="Connected profiles"></div>
    <p class="analyze-profiles-modal__empty" id="analyzeProfilesNoMatch" hidden>No profiles match your search.</p>
    <div class="ap-infobox warning analyze-profiles-modal__warn">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message" id="analyzeProfilesWarn">This replaces your Voice &amp; style section.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button ghost grey" id="analyzeProfilesCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="analyzeProfilesConfirm" disabled>
        <i class="ap-icon-archie-official"></i><span>Analyze &amp; fill</span>
      </button>
    </div>
  </div>
</aside>`;

function profilesShown() {
  const all = getConnectedProfiles();
  return onlyNetwork ? all.filter((p) => normalizeNetwork(p.platform) === onlyNetwork) : all;
}

function renderList() {
  const profiles = profilesShown();
  if (!profiles.length) {
    const label = onlyNetwork ? `${networkMeta(onlyNetwork)?.label || onlyNetwork} ` : "";
    listEl.innerHTML = `<p class="analyze-profiles-modal__empty">No connected ${esc(label)}profiles yet. Connect one from a chat when you draft a post, and I can learn from it here.</p>`;
    return;
  }
  // Row HTML is built from esc()'d values; assign directly (no escaping wrapper).
  listEl.innerHTML = profiles
    .map((p) => {
      const noPosts = p.postCount === 0;
      const caption = [p.platformLabel, p.kind].filter(Boolean).join(" · ");
      const icon = NETWORK_ICON_BY_PLATFORM[p.platform] || "";
      const haystack = [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" ").toLowerCase();
      return `
      <label class="ap-checkbox-container analyze-profiles-modal__row ${noPosts ? "is-disabled" : ""}" data-search="${esc(haystack)}">
        <input type="checkbox" value="${esc(p.id)}" data-profile-check ${noPosts ? "disabled" : ""} />
        <i></i>
        <span class="ap-avatar size-36" aria-hidden="true">
          ${p.photo ? `<img src="${esc(p.photo)}" alt="" />` : `<span class="ap-avatar-initials">${esc(p.initials || BRAND_INITIALS)}</span>`}
          ${icon ? `<span class="ap-avatar-network"><i class="${esc(icon)}"></i></span>` : ""}
        </span>
        <span class="analyze-profiles-modal__meta">
          <span class="analyze-profiles-modal__handle">${esc(p.handle || "Profile")}</span>
          ${caption ? `<span class="analyze-profiles-modal__caption">${esc(caption)}</span>` : ""}
        </span>
        ${noPosts ? `<span class="analyze-profiles-modal__note">No posts to analyze</span>` : ""}
      </label>`;
    })
    .join("");
}

function selectedIds() {
  return Array.from(listEl.querySelectorAll("[data-profile-check]:checked")).map((el) => el.value);
}

// Show/hide rows against the search query; reveal the empty state when nothing
// matches. Checked-but-hidden rows still count toward the confirm selection.
function filterList() {
  const q = (searchInput.value || "").trim().toLowerCase();
  let visible = 0;
  listEl.querySelectorAll("[data-search]").forEach((row) => {
    const match = !q || row.dataset.search.includes(q);
    row.classList.toggle("is-hidden", !match);
    if (match) visible += 1;
  });
  noMatchEl.hidden = visible !== 0;
}

function syncConfirm() {
  confirmBtn.disabled = selectedIds().length === 0;
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("analyzeProfilesBackdrop");
  modal = document.getElementById("analyzeProfilesModal");
  listEl = document.getElementById("analyzeProfilesList");
  confirmBtn = document.getElementById("analyzeProfilesConfirm");
  cancelBtn = document.getElementById("analyzeProfilesCancel");
  closeBtn = document.getElementById("analyzeProfilesClose");
  searchGroup = document.getElementById("analyzeProfilesSearchGroup");
  searchInput = document.getElementById("analyzeProfilesSearch");
  noMatchEl = document.getElementById("analyzeProfilesNoMatch");
  leadEl = document.getElementById("analyzeProfilesLead");
  warnEl = document.getElementById("analyzeProfilesWarn");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  confirmBtn.addEventListener("click", submit);
  listEl.addEventListener("change", (e) => {
    if (e.target.matches("[data-profile-check]")) syncConfirm();
  });
  // Live search — filter rows in place (the list isn't re-rendered on toggle,
  // so a simple show/hide keeps checkbox state and focus intact).
  searchInput.addEventListener("input", filterList);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  initialized = true;
}

function submit() {
  const ids = selectedIds();
  if (!ids.length) return;
  const fn = pendingOnConfirm;
  pendingOnConfirm = null;
  close();
  if (typeof fn === "function") fn(ids);
}

export function init() {
  injectOnce();
}

export function open({ onConfirm = null, network = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  pendingOnConfirm = onConfirm;
  onlyNetwork = network ? normalizeNetwork(network) : null;
  const label = onlyNetwork ? networkMeta(onlyNetwork)?.label || onlyNetwork : "";
  leadEl.textContent = onlyNetwork
    ? `Pick the profiles to learn from — I read their recent posts and rebuild how your voice adapts on ${label}.`
    : "Pick the profiles to learn from — I read their recent posts and rebuild your Voice & style.";
  warnEl.textContent = onlyNetwork
    ? `This replaces what's adapted for ${label}. What I've learned stays.`
    : "This replaces your Voice & style section.";
  renderList();
  syncConfirm();
  // Reset + reveal the search box only when the list is long enough to warrant it.
  searchInput.value = "";
  searchGroup.hidden = profilesShown().length <= PROFILE_SEARCH_THRESHOLD;
  noMatchEl.hidden = true;

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  pendingOnConfirm = null;
  notifyClose(MODAL_ID);
}
