// Shared "connected social profiles" source + picker-item builder.
//
// Single source of truth so the Playbook onboarding profile step
// (context-builder.js) and the in-session "draft for which profile?"
// picker (session.js) propose the EXACT same connected accounts,
// presented identically: brand handle as the label, "Platform · Kind"
// as the muted caption, and a DS avatar carrying the brand photo plus a
// corner network badge.

import { socialAccounts, demoManyProfiles } from "./mocks.js?v=1838";
import { escapeHtml } from "./utils.js?v=1838";
import { createNotifier } from "./store-utils.js?v=1838";

// THE network table — every surface that names, badges, counts or colours a
// network reads it, so a network is spelled one way everywhere. It replaced
// eight local tables that had drifted apart (X was `ap-icon-x-official` in
// three places and the old bird `ap-icon-twitter-official` in five, and
// "X (Twitter)" here but "X" everywhere else).
//   icon        the DS's full-colour network glyph (.ap-avatar-network badge)
//   label       the network's name, as the product writes it
//   connectKind what you connect ON it — the subtitle under each card of
//               Agorapulse's "Add new social profiles" grid
//   limit       the post's character budget (the drafts card's count chip)
//   accent      the brand colour — data, not a DS token (third-party brand
//               colours live in JS, per the project rule)
export const NETWORKS = Object.freeze({
  linkedin: {
    icon: "ap-icon-linkedin-official",
    label: "LinkedIn",
    connectKind: "Profiles, company pages",
    limit: 3000,
    accent: "#0A66C2",
  },
  x: { icon: "ap-icon-x-official", label: "X", connectKind: "Profiles", limit: 280, accent: "#0F1419" },
  instagram: {
    icon: "ap-icon-instagram-official",
    label: "Instagram",
    connectKind: "Professional accounts",
    limit: 2200,
    accent: "#E1306C",
  },
  facebook: {
    icon: "ap-icon-facebook-official",
    label: "Facebook",
    connectKind: "Pages",
    limit: 63206,
    accent: "#1877F2",
  },
  tiktok: { icon: "ap-icon-tiktok-official", label: "TikTok", connectKind: "Accounts", limit: 2200, accent: "#FE2C55" },
  youtube: {
    icon: "ap-icon-youtube-official",
    label: "YouTube",
    connectKind: "Channels",
    limit: 5000,
    accent: "#FF0000",
  },
});

// posts-store (and some seeds) spell X as `twitter`. One normaliser, so no
// caller re-implements the alias.
export function normalizeNetwork(network) {
  const key = String(network || "").toLowerCase();
  return key === "twitter" ? "x" : key;
}

/** The NETWORKS entry for a slug (either spelling of X), or null. */
export function networkMeta(network) {
  return NETWORKS[normalizeNetwork(network)] || null;
}

// Flat lookups derived from NETWORKS, `twitter` alias included, for the many
// call sites that index by slug.
const withAlias = (pick) => {
  const out = Object.fromEntries(Object.entries(NETWORKS).map(([k, v]) => [k, pick(v)]));
  out.twitter = out.x;
  return Object.freeze(out);
};
export const NETWORK_ICON_BY_PLATFORM = withAlias((n) => n.icon);
export const NETWORK_LABEL = withAlias((n) => n.label);
const NETWORK_CONNECT_KINDS = withAlias((n) => n.connectKind);

// Mock brand initials shown as the avatar fallback when no photo loads.
export const BRAND_INITIALS = "NS";

// Above this many profiles, a profile picker turns on its live search box so a
// long connected-account list stays scannable. Shared so every profile picker
// (draft, clips, onboarding, repurpose) flips to search at the same count.
export const PROFILE_SEARCH_THRESHOLD = 8;

// Resolve a connected profile from a network/platform slug.
export function profileForNetwork(network) {
  const key = normalizeNetwork(network);
  if (!key) return null;
  // Through the same gate as getConnectedProfiles(), or the schedule modal and
  // the top-post cards would show a profile nobody has connected.
  return getConnectedProfiles().find((a) => a.platform === key) || null;
}

// Canonical profile display — DS avatar (brand photo + corner network badge)
// followed by the profile name. The single source of truth for "show a
// profile" so every surface (drafts card, schedule modal, picker echoes…)
// renders the SAME UI: Avatar + network indicator + profile name.
// `account` is a socialAccounts entry (preferred); `network` is the slug
// used to badge + label when no account is available.
export function renderProfileTag(account, { network } = {}) {
  const platform = account?.platform || normalizeNetwork(network);
  const name = account?.handle || account?.platformLabel || NETWORK_LABEL[platform] || platform || "Profile";
  const networkIcon = NETWORK_ICON_BY_PLATFORM[platform];
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${account?.initials || BRAND_INITIALS}</span>`;
  const badge = networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : "";
  return `
    <span class="profile-tag" title="${escapeHtml(name)}">
      <span class="ap-avatar size-24" aria-hidden="true">${avatarInner}${badge}</span>
      <span class="profile-tag__name">${escapeHtml(name)}</span>
    </span>
  `;
}

// Conversation echo card for a picked profile — matches the selection-echo
// visual (rounded navy-tint card, 32px leading visual, two lines): the profile
// NAME on top, the @handle below (or "Platform · Kind" when the handle isn't a
// distinct @). Used by the chat "which account(s)?" echoes so profile picks
// read like every other selection echo in the thread.
export function renderProfileEchoCard(account, { network } = {}) {
  const platform = account?.platform || normalizeNetwork(network);
  const name = account?.name || account?.handle || NETWORK_LABEL[platform] || platform || "Profile";
  const handle = account?.handle || "";
  const meta =
    handle && handle !== name
      ? handle
      : [account?.platformLabel || NETWORK_LABEL[platform], account?.kind].filter(Boolean).join(" · ");
  const networkIcon = NETWORK_ICON_BY_PLATFORM[platform];
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${account?.initials || BRAND_INITIALS}</span>`;
  const badge = networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : "";
  return `
    <div class="selection-echo selection-echo--profile" title="${escapeHtml(name)}">
      <span class="selection-echo__icon selection-echo__icon--avatar">
        <span class="ap-avatar size-32" aria-hidden="true">${avatarInner}${badge}</span>
      </span>
      <span class="selection-echo__body">
        <span class="selection-echo__title">${escapeHtml(name)}</span>
        ${meta ? `<span class="selection-echo__meta">${escapeHtml(meta)}</span>` : ""}
      </span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Which accounts are connected RIGHT NOW.
//
// The mocks describe accounts; this Set describes the ones connected in this
// browser session, so connecting one in a chat shows up everywhere afterwards.
// Starts EMPTY: nothing is connected until the user connects it.
// ---------------------------------------------------------------------------
const notifier = createNotifier("social-profiles");
export const subscribe = notifier.subscribe;

let connectedIds = null;

// Every account the user could connect, mock-connected or not — the brand's
// own accounts, one per network. demoManyProfiles stays out: those ~36 exist to
// exercise the picker's search on an established account, not to be connected
// one by one.
const ALL_ACCOUNTS = [...socialAccounts, ...demoManyProfiles];

function ensureSeeded() {
  if (connectedIds) return connectedIds;
  connectedIds = new Set();
  return connectedIds;
}

// All currently-connected social accounts (mock). The base connected accounts
// are followed by a large, varied demo set (see mocks.demoManyProfiles) so the
// profile quickpicker's search can be evaluated against a realistic ~40-profile
// list.
export function getConnectedProfiles() {
  const ids = ensureSeeded();
  return ALL_ACCOUNTS.filter((p) => ids.has(p.id));
}

/** One connected profile by id — null when it isn't (or is no longer) connected. */
export function getConnectedProfileById(id) {
  return (id && getConnectedProfiles().find((p) => p.id === id)) || null;
}

// What the connect modal offers: the brand's own accounts that aren't connected
// yet, in mock order so the list is stable.
// `handle` is the identity test, not `status`: the mock's disconnected entries
// come in two kinds — real accounts (name, handle, photo, post history) and
// bare network stubs like `{ id: "tt", platformLabel: "TikTok" }` standing for
// a network the brand has no account on. A stub has nothing to connect TO, and
// would render as an "undefined" row, so it never reaches the picker.
export function getConnectableAccounts() {
  const ids = ensureSeeded();
  return socialAccounts.filter((p) => !ids.has(p.id) && p.handle);
}

// The same accounts, grouped into the NETWORKS you can still add — the unit the
// product's "Add new social profiles" grid is built on (you pick a network, its
// own dialog picks the account). A network drops out of the grid once every
// account it offers is connected.
export function getConnectableNetworks() {
  const byPlatform = new Map();
  for (const account of getConnectableAccounts()) {
    if (!byPlatform.has(account.platform)) {
      byPlatform.set(account.platform, {
        platform: account.platform,
        label: NETWORK_LABEL[account.platform] || account.platformLabel || account.platform,
        kinds: NETWORK_CONNECT_KINDS[account.platform] || account.kind || "Accounts",
        icon: NETWORK_ICON_BY_PLATFORM[account.platform] || null,
        accounts: [],
      });
    }
    byPlatform.get(account.platform).accounts.push(account);
  }
  return [...byPlatform.values()];
}

// Mock-connect one or more accounts by id. Returns the accounts that actually
// flipped, so a caller can echo exactly what it connected.
export function connectAccounts(accountIds) {
  const ids = ensureSeeded();
  const added = [];
  for (const id of accountIds || []) {
    if (ids.has(id)) continue;
    const account = ALL_ACCOUNTS.find((p) => p.id === id);
    if (!account) continue;
    ids.add(id);
    added.push(account);
  }
  if (added.length) notifier.notify(getConnectedProfiles());
  return added;
}

// Build inline-question picker items for the connected profiles. The
// profile name is the primary identifier — the platform is a secondary
// detail (signalled both by the caption and the avatar's corner network
// badge), so we lead with the handle and demote "Facebook · Page" to the
// muted caption. Reused by both the onboarding profile step and the
// in-session draft profile picker so the two stay identical.
// `requirePosts` (default true) is for the "analyse my top posts" flows: a
// profile with no published history can't be analysed, so it's disabled with a
// "No posts to analyze" note. Pass `requirePosts: false` when the profile is
// only a DESTINATION (e.g. picking which accounts to draft clips for) — there
// every connected account is a valid target regardless of post history.
export function buildConnectedProfileItems({ requirePosts = true } = {}) {
  return getConnectedProfiles().map((p) => {
    const hasNoPosts = requirePosts && p.postCount === 0;
    const captionParts = [];
    if (p.platformLabel) captionParts.push(p.platformLabel);
    if (p.kind) captionParts.push(p.kind);
    return {
      value: p.id,
      label: p.handle,
      caption: captionParts.join(" · "),
      // Search haystack for the picker's live filter — the brand name and
      // network aren't always visible in the label (e.g. an @handle row), so
      // fold them in explicitly so "linkedin" or a brand name both match.
      search: [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" "),
      disabled: hasNoPosts,
      endNote: hasNoPosts ? "No posts to analyze" : null,
      avatar: {
        imageUrl: p.photo,
        initials: p.initials || BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[p.platform],
      },
    };
  });
}
