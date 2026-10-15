// The home's two lists: the Playbooks catalogue (table + cards) and the Chats
// tab (every chat, all brands). Reads the page state home.js owns. Moved out of
// home.js, unchanged.

import {
  visibleContexts,
  ownerOf,
  isMine,
  accessLabel,
  canEdit,
  canManageSharing,
  canDelete,
  canView,
} from "../../playbook-access.js?v=1763";
import { isFlagOn } from "../../feature-flags.js?v=1763";
import { escapeAttr, escapeText } from "../../utils.js?v=1763";
import { isWorkspaceMode, getActivePlaybookId } from "../../active-playbook.js?v=1763";
import { getSessions } from "../../sessions-store.js?v=1763";
import { renderEmptyState } from "../../components/empty-state.js?v=1763";
import { getSources, getIdeas } from "../../library.js?v=1763";
import { getPosts } from "../../posts-store.js?v=1763";
import { getContextById } from "../../contexts-store.js?v=1763";
import { pageState } from "../home.js?v=1763";

// The Playbooks tab — a TABLE, the same shape as the Chats tab beside it.
//
// ⚠️ It was a list of horizontal cards for two commits, and before that a grid
// of tiles. The table is the end of that road, and the reason is what these two
// tabs ARE: records to scan. Short comparable fields, one row each, and a
// reader moving DOWN a column — which is what a table is, and what the card
// list was imitating with fixed widths, one uniform row height and aligned
// numbers. Only the border and radius per row were still card.
//
// What the table adds that no card list could: its columns are NAMED, in text,
// in a header. The card list left the reader to infer that "MB" was an owner, a
// pen was a permission and a date was the last edit.
//
// The grid of tiles survives for `/contexts` flag OFF: there, a Playbook is an
// object you browse, not a row you pick from.
export function renderPlaybooksTable(list) {
  if (!list.length) return renderContextsEmpty(visibleContexts(), pageState);
  const sharing = isFlagOn("playbookSharing");
  return `
    <table class="ap-table outer-border header-background clickable-rows home-playbooks">
      <thead>
        <tr>
          <th scope="col">Playbook</th>
          ${sharing ? `<th scope="col">Owner</th><th scope="col">Access</th>` : ""}
          <th scope="col">Updated</th>
          <th scope="col" class="right">Action</th>
        </tr>
      </thead>
      <tbody>${list.map(renderPlaybookRow).join("")}</tbody>
    </table>
  `;
}

// One Playbook, as a row. The words it says — the brief, the default star, the
// Current mark — come from the same three helpers the tile uses, so the two
// shapes can't drift into saying different things about one Playbook.
function renderPlaybookRow(ctx) {
  const sharing = isFlagOn("playbookSharing");
  const owner = sharing ? ownerOf(ctx) : null;
  const mine = isMine(ctx);
  const accessTitle = accessLabel(ctx) || (canEdit(ctx) ? "You can edit this Playbook" : "Read-only");
  const title = startChatTitle(ctx);
  return `
    <tr
      data-contexts-card="${escapeAttr(ctx.id)}"
      role="button"
      tabindex="0"
      ${title ? `title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"` : ""}
    >
      <td>
        <div class="ap-table-cell-content home-playbooks__identity">
          ${playbookThumb(ctx)}
          <div class="home-playbooks__text">
            <div class="home-playbooks__name-row">
              <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(ctx.color || "grey")}" aria-hidden="true"></span>
              <span class="home-playbooks__name">${escapeText(ctx.name)}</span>
              ${defaultBadge(ctx)}${currentTagFor(ctx)}
            </div>
            <div class="home-playbooks__brief">${escapeText(playbookBrief(ctx))}</div>
          </div>
        </div>
      </td>
      ${
        sharing
          ? `<td>
              <div class="ap-table-cell-content home-playbooks__owner">
                <span class="ap-avatar size-24"><span class="ap-avatar-initials">${escapeText(mine ? "MB" : owner?.initials || "?")}</span></span>
                <span class="home-playbooks__owner-name">${escapeText(mine ? "You" : owner?.name || "a teammate")}</span>
              </div>
            </td>
            <td>
              <div class="ap-table-cell-content home-playbooks__access" title="${escapeAttr(accessTitle)}" aria-label="${escapeAttr(accessTitle)}">
                <i class="${canEdit(ctx) ? "ap-icon-pen" : "ap-icon-eye-on"}" aria-hidden="true"></i>
              </div>
            </td>`
          : ""
      }
      <td><div class="ap-table-cell-content">${escapeText(ctx.updatedAt || "recently")}</div></td>
      <td class="right">${playbookMoreMenu(ctx)}</td>
    </tr>
  `;
}

// The brand's own mark where the analysis found a logo, its initials where it
// didn't — so the column keeps one width and one shape, and never a stretched
// or cropped lockup.
function playbookThumb(ctx) {
  const initials = String(ctx.name || "")
    .split("·")[0]
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return `
    <span class="ap-avatar square size-32 home-playbooks__thumb" aria-hidden="true">
      ${
        ctx.brandLogo
          ? `<img src="${escapeAttr(ctx.brandLogo)}" alt="" />`
          : `<span class="ap-avatar-initials">${escapeText(initials)}</span>`
      }
    </span>
  `;
}

function playbookBrief(ctx) {
  const summary = (ctx.businessSummary || ctx.briefSummary || "").trim();
  return summary || "No brief yet — open this Playbook to add one.";
}

function defaultBadge(ctx) {
  return ctx.isDefault
    ? `<span class="contexts-card__badge" title="Default Playbook"><i class="ap-icon-star_fill"></i></span>`
    : "";
}

// What activating this Playbook does, as a title — empty without the workspace
// model, where a card opens the fiche instead.
function startChatTitle(ctx) {
  return isWorkspaceMode() ? `Start a chat in ${ctx.name}` : "";
}

function currentTagFor(ctx) {
  return isWorkspaceMode() && ctx.id === getActivePlaybookId()
    ? `<span class="ap-tag blue mini contexts-card__current"><span>Current</span></span>`
    : "";
}

// The four verbs, in a DS action-dropdown. Same `data-contexts-*` hooks as the
// tile's hover toolbar, so the screen's handlers don't know which shape fired.
function playbookMoreMenu(ctx) {
  const menuId = `ctxMore-${ctx.id}`;
  const item = (hook, icon, label, danger) => `
    <button
      type="button"
      role="menuitem"
      class="ap-action-dropdown-item${danger ? " red-mode" : ""}"
      ${hook}="${escapeAttr(ctx.id)}"
    >
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${label}</span>
        </div>
      </div>
    </button>
  `;
  return `
    <div class="home-playbooks__more">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-playbook-more="${escapeAttr(ctx.id)}"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="${menuId}"
        aria-label="More actions"
        title="More actions"
      >
        <i class="ap-icon-more"></i>
      </button>
      <div class="ap-action-dropdown home-playbooks__more-menu" id="${menuId}" role="menu" hidden>
        ${canManageSharing(ctx) ? item("data-contexts-share", "ap-icon-share", "Share") : ""}
        ${canEdit(ctx) ? item("data-contexts-edit", "ap-icon-pen", "Open the Playbook") : ""}
        ${item("data-contexts-duplicate", "ap-icon-copy", "Duplicate")}
        ${canDelete(ctx) ? item("data-contexts-delete", "ap-icon-trash", "Delete", true) : ""}
      </div>
    </div>
  `;
}

// The Chats tab — `getSessions()`, UNSCOPED. That is the whole point of the
// tab: at the account level the question is "where is my work", and the rail
// one level down already answers "this brand's work".
//
// .ap-table rather than .ap-list-panel: the latter is a master-detail left
// column (border-right, height 100%) with no column structure, and this needs
// three aligned columns.
export function renderChatsTab() {
  const q = (pageState.query || "").trim().toLowerCase();
  // Recency, the store's own order, and nothing else. NOT pinned-first, which
  // this list led with for a commit: a pin is something you do to a chat inside
  // its workspace, so the rail is where it sorts and where it shows. Up here the
  // only visible ordering column is Last activity, and a list ordered by a fact
  // it doesn't print reads as arbitrary.
  const rows = getSessions()
    .map((s) => ({ session: s, ctx: chatPlaybook(s) }))
    .filter(({ session, ctx }) => {
      if (!q) return true;
      // The brand is a visible column, so it has to be searchable.
      return `${session.name} ${ctx?.name || ""}`.toLowerCase().includes(q);
    });

  if (rows.length === 0) {
    return q
      ? renderEmptyState({
          icon: "ap-icon-search",
          title: "No chats match",
          body: `No chat matches "${escapeText(pageState.query)}". Try a different term.`,
          actionHtml: `<button type="button" class="ap-button stroked grey" data-contexts-clear-query>Clear search</button>`,
          wrapperClass: "contexts-view__empty contexts-view__empty--rich",
          level: 2,
        })
      : renderEmptyState({
          icon: "ap-icon-single-chat-bubble",
          title: "No chats yet",
          body: "Start one from the box above — pick a Playbook and tell me what you need.",
          wrapperClass: "contexts-view__empty contexts-view__empty--rich",
          level: 2,
        });
  }

  const body = rows
    .map(
      ({ session, ctx }) => `
      <tr data-home-chat="${escapeAttr(session.id)}" role="button" tabindex="0">
        <td>
          <div class="ap-table-cell-content">
            <span class="home-chats__name">${escapeText(session.name)}</span>
          </div>
        </td>
        ${countCell(getSources(session.id).length)}
        ${countCell(getIdeas(session.id).length)}
        ${countCell(getPosts(session.id).length)}
        <td>
          <div class="ap-table-cell-content">
            <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(ctx?.color || "grey")}" aria-hidden="true"></span>
            <span class="${ctx ? "" : "muted"}">${ctx ? escapeText(ctx.name) : "No Playbook"}</span>
          </div>
        </td>
        <td><div class="ap-table-cell-content">${escapeText(session.lastActivity || "")}</div></td>
      </tr>
    `,
    )
    .join("");

  return `
    <table class="ap-table small outer-border header-background clickable-rows home-chats">
      <thead>
        <tr>
          <th scope="col">Chat</th>
          <th scope="col" class="right">Sources</th>
          <th scope="col" class="right">Ideas</th>
          <th scope="col" class="right">Drafts</th>
          <th scope="col">Playbook</th>
          <th scope="col">Last activity</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

// How far the work in a chat got — sources in, ideas out, drafts written. Three
// numbers with a COLUMN HEADER each rather than three icons in one cell: a
// number needs its name in text, and in a table the header is that name.
//
// ⚠️ Not the same call as the Playbooks tab, which just LOST its three counters.
// The difference is what the reader is doing: nobody picks a brand by how many
// audiences its fiche lists, but "3 sources · 5 ideas · 2 drafts" is exactly how
// far a conversation got, which is what you scan a list of work for.
//
// A zero prints as a zero, muted: an empty cell in a numeric column reads as
// "unknown", and "this chat has produced nothing yet" is a fact worth seeing.
function countCell(n) {
  return `<td class="right"><div class="ap-table-cell-content">
    <span class="${n ? "home-chats__count" : "home-chats__count home-chats__count--zero"}">${n}</span>
  </div></td>`;
}

// The Playbook behind a chat, but only if I may open it — same rule the rail's
// rows follow: a chat that lost access shows the grey dot and the neutral word,
// never a name it can't reach.
export function chatPlaybook(session) {
  if (!session?.contextId) return null;
  const ctx = getContextById(session.contextId);
  return ctx && canView(ctx) ? ctx : null;
}

// FIND-B4: rich empty state — separates "no contexts at all" (first-run)
// from "search active with no match". Returning user with everything
// deleted hits the same first-run path, which is fine — both want a
// "Create your first context" CTA.
export function renderContextsEmpty(allContexts, pageState) {
  const hasQuery = (pageState.query || "").trim().length > 0;
  if (allContexts.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-target",
      title: "No Playbooks yet",
      body: "Capture your brand, audience, brief, and tone of voice — I'll apply it to every draft.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-contexts-new><i class="ap-icon-plus"></i><span>Create your first Playbook</span></button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  if (hasQuery) {
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "No Playbooks match",
      body: `No Playbook matches "${escapeText(pageState.query)}". Try a different term.`,
      actionHtml: `<button type="button" class="ap-button stroked grey" data-contexts-clear-query>Clear search</button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-target",
    title: "No Playbooks to show",
    body: "Create one to get started.",
    wrapperClass: "contexts-view__empty contexts-view__empty--rich",
  });
}

// Claude-Projects-style summary card. The card is the primary
// "what is this context" affordance — readable at a glance, with
// secondary actions tucked into a hover-reveal toolbar in the
// top-right corner. DO/DON'T lists and the tones chip row moved
// out: they bloated the card without helping identification, and
// they live in the read panel where they belong.
// Trailing "ghost" card — visually invites a new Playbook from the grid
// itself, so the user doesn't have to chase the header CTA after scrolling.
// Triggers the same `data-contexts-new` handler as the header button.
export function renderGhostCard() {
  return `
    <button type="button" class="contexts-card contexts-card--ghost" data-contexts-new aria-label="Create a new Playbook">
      <span class="contexts-card--ghost__glyph"><i class="ap-icon-archie-official"></i></span>
      <span class="contexts-card--ghost__title">Create a Playbook</span>
      <span class="contexts-card--ghost__sub">One brand, one voice, one goal — I'll keep every draft aligned.</span>
    </button>
  `;
}

export function renderContextCard(ctx) {
  const color = ctx.color || "orange";
  const summary = (ctx.businessSummary || ctx.briefSummary || "").trim();
  const voiceHeadline =
    ctx.voiceProfile?.headline ||
    (Array.isArray(ctx.tones) && ctx.tones.length ? ctx.tones.join(" · ").toLowerCase() : "");
  const audienceCount = Array.isArray(ctx.audience) ? ctx.audience.length : ctx.audience ? 1 : 0;
  // `suggested` entries are still pending proposals from Archie, not
  // competitors of this brand yet — they must not inflate the count.
  const competitorCount = Array.isArray(ctx.competitors) ? ctx.competitors.filter((c) => !c.suggested).length : 0;
  const influencerCount = Array.isArray(ctx.influencers) ? ctx.influencers.filter((c) => !c.suggested).length : 0;
  const usedIn = ctx.usedIn || 0;
  // Brand color preview — first website's primary / accent / link from
  // imageVoice, up to 3 dots. Matches the "people avatars" affordance
  // in the Claude reference but uses the analysed brand palette.
  const site = ctx.imageVoice?.websites?.[0];
  const paletteDots = site
    ? [site.colors?.primary, site.colors?.accent, site.colors?.link]
        .filter((c, i, arr) => c && arr.indexOf(c) === i)
        .slice(0, 3)
    : [];
  const dotsHtml = paletteDots.length
    ? `<div class="contexts-card__palette" aria-hidden="true">${paletteDots
        .map((c) => `<span class="contexts-card__palette-dot" style="background:${escapeAttr(c)};"></span>`)
        .join("")}</div>`
    : "";
  const isDefaultBadge = defaultBadge(ctx);
  // Who this Playbook belongs to, in the card's metadata corner next to the
  // palette dots — never a coloured border, a card's state goes in its content.
  // It tried living beside the title first and broke long names onto two lines;
  // the foot is also where the Claude reference puts its people avatars.
  // Mine-and-private says nothing, because that's the default nobody needs told.
  const access = accessLabel(ctx);
  const ownerTag = access
    ? `<span class="ap-tag grey mini contexts-card__owner" title="${escapeAttr(access)}">
        <i class="${isMine(ctx) ? "ap-icon-multiple-users" : "ap-icon-user"}" aria-hidden="true"></i>
        <span>${escapeText(access)}</span>
      </span>`
    : "";
  // Only the actions I can actually take. For a Playbook someone shared with
  // me that's Duplicate alone — the one move that turns reading into having.
  const actions = [
    canManageSharing(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-share="${ctx.id}" title="Share" aria-label="Share">
          <i class="ap-icon-share"></i>
        </button>`
      : "",
    canEdit(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-edit="${ctx.id}" title="Edit" aria-label="Edit">
          <i class="ap-icon-pen"></i>
        </button>`
      : "",
    `<button type="button" class="ap-icon-button transparent" data-contexts-duplicate="${ctx.id}" title="Duplicate" aria-label="Duplicate">
      <i class="ap-icon-copy"></i>
    </button>`,
    canDelete(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-delete="${ctx.id}" title="Delete" aria-label="Delete">
          <i class="ap-icon-trash"></i>
        </button>`
      : "",
  ].join("");
  // ── On the home, a card IS the workspace ────────────────────────────────
  //
  // Clicking it switches to that brand and opens a fresh chat in it: on a page
  // whose subject is "which brand am I working in", the card is the door, the
  // way it is in every workspace picker. The fiche keeps the pen, with the
  // other management verbs.
  //
  // ⚠️ This REVERSES what stood here for a commit — the body opening the fiche,
  // with a small "Switch" link carrying the scope move — argued from the
  // asymmetry of a mis-click (a page versus the whole app moving). The user's
  // call, and what makes it safe is that nothing is lost: the new chat is
  // empty, the crumb goes back, and the brand you left is one card away. The
  // Switch link went with it, redundant: a second control for what the whole
  // card now does.
  //
  // Flag OFF there is no workspace to enter, so the card keeps opening the
  // fiche and none of this renders.
  const currentTag = currentTagFor(ctx);
  const cardTitle = startChatTitle(ctx);
  // The tile's own pieces. What the two shapes must say IDENTICALLY — the
  // default star, the Current mark, the title of the click — comes from the
  // shared helpers above, the same rule topic-card.js follows for its shapes.
  const voiceHtml = voiceHeadline
    ? `<div class="contexts-card__voice">
        <i class="ap-icon-archie-official"></i>
        <span>${escapeText(voiceHeadline)}</span>
      </div>`
    : "";
  const briefHtml = summary
    ? `<p class="contexts-card__brief">${escapeText(summary)}</p>`
    : `<p class="contexts-card__brief contexts-card__brief--empty">${escapeText(playbookBrief(ctx))}</p>`;
  const countersHtml = `
    <div class="contexts-card__counters">
      <span class="contexts-card__counter" title="${usedIn} ${usedIn === 1 ? "chat uses this Playbook" : "chats use this Playbook"}">
        <i class="ap-icon-single-chat-bubble"></i>
        <span>${usedIn}</span>
      </span>
      ${
        audienceCount
          ? `<span class="contexts-card__counter" title="${audienceCount} ${audienceCount === 1 ? "audience" : "audiences"}">
              <i class="ap-icon-target"></i>
              <span>${audienceCount}</span>
            </span>`
          : ""
      }
      ${
        competitorCount
          ? `<span class="contexts-card__counter" title="${competitorCount} ${competitorCount === 1 ? "competitor" : "competitors"}">
              <i class="ap-icon-buildings"></i>
              <span>${competitorCount}</span>
            </span>`
          : ""
      }
      ${
        influencerCount
          ? `<span class="contexts-card__counter" title="${influencerCount} ${influencerCount === 1 ? "influencer" : "influencers"}">
              <i class="ap-icon-star"></i>
              <span>${influencerCount}</span>
            </span>`
          : ""
      }
    </div>
  `;
  const openAttrs = `
      data-contexts-card="${ctx.id}"
      role="button"
      tabindex="0"
      ${cardTitle ? `title="${escapeAttr(cardTitle)}" aria-label="${escapeAttr(cardTitle)}"` : ""}`;

  // ── The tile ────────────────────────────────────────────────────────────
  // The catalogue's own shape, flag OFF: a colour strip, the voice chip, three
  // counters, the palette, the hover toolbar. A Playbook is an OBJECT you
  // browse here. On the home the same Playbook is a row you pick from
  // (renderPlaybookRow), which is why the two shapes differ in everything but
  // the words they say.
  return `
    <article class="contexts-card contexts-card--${color}"${openAttrs}>
      <span class="contexts-card__swatch" aria-hidden="true"></span>

      <div class="contexts-card__actions" data-contexts-card-actions>${actions}</div>

      <header class="contexts-card__head">
        <h3 class="contexts-card__name">
          ${escapeText(ctx.name)}
          ${isDefaultBadge}
        </h3>
      </header>

      ${voiceHtml} ${briefHtml}

      <footer class="contexts-card__foot">
        ${countersHtml}
        <div class="contexts-card__meta">
          ${currentTag}
          ${ownerTag}
          ${dotsHtml}
        </div>
      </footer>

      <div class="contexts-card__updated">Updated ${escapeText(ctx.updatedAt || "recently")}</div>
    </article>
  `;
}
