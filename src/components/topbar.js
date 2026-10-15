import { html, raw, escapeHtml, escapeAttr } from "../utils.js?v=1924";
import { getPath, navigate } from "../router.js?v=1924";
import { parseHashParams } from "../url-state.js?v=1924";
import { setDrawerOpen } from "./sidebar.js?v=1924";
import { installMoreMenu } from "./more-menu.js?v=1924";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  openSources as openSourcesPanel,
  closePanel as closeRightPanel,
  getMode as getRightPanelMode,
  getActiveBatchRef as getActiveDraftsBatchRef,
  subscribe as subscribeRightPanel,
} from "./right-panel.js?v=1924";
import { getSources as getSessionSources, subscribeSources } from "../sources-stream.js?v=1924";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=1924";
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=1924";
import { getPosts, subscribe as subscribePosts } from "../posts-store.js?v=1924";
import {
  isEnabled as isStatusCardEnabled,
  toggle as toggleStatusCard,
  subscribeVisibility as subscribeStatusCardVisibility,
} from "./conversation-status-card.js?v=1924";
import { getSessionById, updateSession, subscribe as subscribeSessions } from "../sessions-store.js?v=1924";
import { open as openRenameModal } from "./rename-modal.js?v=1924";
import {
  subscribe as subscribeContexts,
  getContextById,
  getDefaultContext,
  getContexts,
} from "../contexts-store.js?v=1924";
import { isFlagOn } from "../feature-flags.js?v=1924";
import { getActivePlaybook, isWorkspaceMode, isAccountScope, catalogueRoute } from "../active-playbook.js?v=1924";
import { getFeedForPlaybook } from "../topic-feeds-store.js?v=1924";
import { findCadence } from "../topics-catalog.js?v=1924";
import {
  getPickerState as getTopPostsState,
  subscribePicker as subscribeTopPosts,
  backToProfiles as topPostsBackToProfiles,
} from "../top-posts-flow.js?v=1924";
// The Insights view switch. Imported from views.js, NOT from the screen's
// shell: the shell imports this module, so taking it from there would close a
// cycle. views.js imports neither.
import { readLayoutId, viewSwitch } from "../screens/insights/views.js?v=1924";

// The playbook/context pill now lives in the composer (session.js
// renderPlaybookControl) — selectable on a New Chat, then a static
// indicator once the conversation starts — so the topbar no longer
// renders it.

// Persistent top bar — the mobile fork's.
//
//   • Left  — ☰ (opens the sidebar drawer), then the route title, truncated —
//     or a sub-page's back control in its place.
//   • Right — on /session/:id, ONE panel button (Drafts + its count) that opens
//     the bottom sheet, where the three panels are tabs, and a ⋯ menu for the
//     rest (Rename chat, the chat status). The feed-settings cog on /topics;
//     the View switch on /insights.
//
// Feedback / Report a bug / Admin live in the drawer's footer popmenu.

// A page's own primary actions (DS: the header carries the title on the left and
// the page's actions on the right). A screen hands them over for ITS path, so a
// route change drops them on the next render even if the screen forgot to.
let pageActions = null; // { path, markup, left? }

// `left` (optional): the page's own left side — the DS Top bar pattern's
// back · avatar · title · edit · custom slot — replacing the route title / back.
export function setTopbarActions(path, markup, { left = "" } = {}) {
  pageActions = path && markup ? { path, markup, left } : null;
  renderTopbar();
}

export function renderTopbar(_options = {}) {
  const el = document.getElementById("topbar");
  if (!el) return;
  const onSession = isSessionRoute();
  const back = backTargetFor(getPath());
  const onWelcomeAlt = onSession && isWelcomeAltSession();
  const rpMode = getRightPanelMode();
  const draftCount = onSession ? latestDraftCount() : 0;
  const ideaCount = onSession ? sessionIdeaCount() : 0;
  // Welcome-alt swaps the right-side pills cluster for a single Exit
  // button — the wizard has no conversation to surface yet, so the
  // session pills + chat-status toggle would just be dead controls.
  // The info toggle only appears once the chat has something to summarise —
  // on a brand-new/empty chat the status card would be all "None yet", so we
  // hide the control entirely (matches conversation-status-card.render).
  // Gated behind the conversationStatusCard flag: when OFF, the whole card —
  // and this topbar toggle — disappears (matches conversation-status-card.render).
  const statusCardAvailable =
    onSession && isFlagOn("conversationStatusCard") && (sessionSourceCount() > 0 || ideaCount > 0 || draftCount > 0);
  const ownActions = pageActions && pageActions.path === getPath() ? pageActions.markup : "";
  const rightSide = ownActions
    ? ownActions
    : onWelcomeAlt
      ? renderWelcomeAltExit()
      : onSession
        ? `${renderPanelButton(rpMode, draftCount, ideaCount)}${renderSessionMenu(statusCardAvailable)}`
        : getPath() === "/topics"
          ? renderTopicsSettings()
          : getPath().startsWith("/insights")
            ? renderInsightsActions()
            : "";
  // On the repurposing winner board (profile-first mode), the topbar leads with
  // a "Change profile" back — the app's standard back affordance — in place of
  // the session title.
  const ownLeft = pageActions && pageActions.path === getPath() ? pageActions.left : "";
  const left = ownLeft
    ? ownLeft
    : back
      ? renderBack(back)
      : isTopPostsBoard()
        ? renderTopPostsBack()
        : renderTitle(onSession);
  // ☰ on the top-level screens only. A sub-page leads with its back, and ☰ beside
  // it read as two competing ways out (the drawer is one Back away). Account
  // scope has no rail by decision — its back leads in instead.
  const leadsWithBack = !!(ownLeft || back || isTopPostsBoard());
  const menu =
    isAccountScope(getPath()) || leadsWithBack
      ? ""
      : `<button type="button" class="ap-icon-button transparent" data-topbar-menu aria-label="Open menu"><i class="ap-icon-view-list"></i></button>`;
  el.innerHTML = html`
    <div class="app-topbar__left">${raw(menu)}${raw(left)}</div>
    <div class="app-topbar__right">${raw(rightSide)}</div>
  `;
}

// True when the active session is showing the repurposing board (step 2) —
// i.e. there's a "Change profile" step to go back to.
function isTopPostsBoard() {
  if (!isSessionRoute()) return false;
  const sid = currentSessionId();
  return !!sid && getTopPostsState(sid)?.stage === "board";
}

// "‹ Change profile" — same back treatment as the Playbook page, so the
// repurposing board's back matches every other back in the app.
function renderTopPostsBack() {
  return `
    <button type="button" class="ap-button ghost grey app-topbar__back" data-topbar-topposts-back title="Change profile">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      <span>Change profile</span>
    </button>
  `;
}

// Right-side Exit affordance shown during the integrated Playbook
// creation flow. The first-time onboarding flow has body.onboarding
// applied, so the topbar is hidden — only the integrated returning-user
// flow ever sees this button (the welcome-alt wizard chrome itself has
// no Exit affordance any more; this is the canonical one). Click goes
// through the session.js confirm-modal that was previously gating the
// floating wizard Exit button.
function renderWelcomeAltExit() {
  return `
    <button
      type="button"
      class="ap-button ghost grey"
      data-topbar-welcome-alt-exit
      aria-label="Exit Playbook creation"
    >
      Exit
      <i class="ap-icon-close" aria-hidden="true"></i>
    </button>
  `;
}

// The Topic Feed's scope, resolved exactly as screens/topics.js does: the
// active Playbook in workspace mode, otherwise `?pb=` when it names a real one
// and the default when it doesn't. Duplicating the rule would be how the cog
// ends up naming a different brand than the screen under it.
function topicsScopedPlaybook() {
  if (isWorkspaceMode()) return getActivePlaybook();
  const wanted = parseHashParams().get("pb");
  return (wanted && getContextById(wanted)) || getDefaultContext() || getContexts()[0] || null;
}

// Feed settings cog — far right of the topbar on /topics, the app's canonical
// home for a page-level action. It moved out of the feed's own toolbar (it sat
// beside the Playbook scope select there). Icon-only: the cog is the one glyph
// nobody has to hover to recognise, and its title carries the cadence, which has
// nowhere else to live. The Playbook scope rides in the hash (`?pb=`) both ways,
// so the settings page keeps the feed's scope and the back returns to it.
function renderTopicsSettings() {
  // Resolve the scope the same way the feed does — see topicsScopedPlaybook.
  const pb = topicsScopedPlaybook();
  const feed = pb ? getFeedForPlaybook(pb.id) : null;
  // Workspace mode carries no `?pb=`: the settings page reads the rail like
  // every other surface, so a link that pinned a brand into the URL would be a
  // second scope waiting to disagree with it.
  const href = `#/topics/settings${pb && !isWorkspaceMode() ? `?pb=${encodeURIComponent(pb.id)}` : ""}`;
  const title = feed ? `Feed settings · refreshed ${findCadence(feed.cadence)?.adverb || "weekly"}` : "Feed settings";
  return `
    <a
      class="ap-icon-button transparent app-topbar__topics-settings"
      href="${escapeAttr(href)}"
      aria-label="Feed settings"
      title="${escapeAttr(title)}"
    >
      <i class="ap-icon-cog"></i>
    </a>
  `;
}

// Insights' two page-level controls, far right — where /topics puts its cog and
// a session puts its pills. The View switch is PROTOTYPE chrome (three layouts
// kept side by side to be compared live — see views.js); New objective is the
// page's one primary, and it is here rather than in the page because Insights
// had grown a bar of its own holding nothing else. That bar is gone: a row of
// the page spent on one button, above a header that then had to compete with
// it. The primary sits LAST, the rightmost slot being the strongest one.
//
// The screen owns both clicks: insights/shell.js binds its dispatch to #topbar
// too, so `data-ins-view` and `data-ins-new` are handled there and this only
// paints. Which means they are inert on any other route — hence the route gate
// above.
function renderInsightsActions() {
  if (!isFlagOn("insightsHub")) return "";
  return `${viewSwitch(readLayoutId())}
    <button type="button" class="ap-button primary blue" data-ins-new>
      <i class="ap-icon-plus" aria-hidden="true"></i><span>New objective</span>
    </button>`;
}

// The ⋯ at the far right of a chat: what the topbar can't afford to show —
// Rename (the title is no longer a button: too small a target, and a tap on a
// title reads as nothing) and the chat status sheet when there's a status.
function renderSessionMenu(statusAvailable) {
  const sid = currentSessionId();
  const item = (attr, icon, label) => `
    <button type="button" role="menuitem" class="ap-action-dropdown-item" ${attr}>
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${label}</span>
        </div>
      </div>
    </button>`;
  const status = statusAvailable
    ? item("data-topbar-toggle-status-card", "ap-icon-info", isStatusCardEnabled() ? "Hide chat status" : "Chat status")
    : "";
  return `
    <div class="app-topbar__more">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-topbar-more
        aria-controls="topbarMoreMenu"
        aria-expanded="false"
        aria-haspopup="menu"
        aria-label="More"
      ><i class="ap-icon-more"></i></button>
      <div class="ap-action-dropdown app-topbar__more-menu" id="topbarMoreMenu" role="menu" hidden>
        ${item(`data-topbar-rename-session="${escapeAttr(sid || "")}"`, "ap-icon-pen", "Rename chat")}${status}
      </div>
    </div>
  `;
}

// The route title — a plain heading, truncated by the CSS. Welcome-alt
// sessions (Playbook creation) read a fixed "New Playbook".
function renderTitle(onSession) {
  if (onSession && isWelcomeAltSession()) {
    return `<h1 class="app-topbar__title">New Playbook</h1>`;
  }
  return `<h1 class="app-topbar__title">${currentTitle()}</h1>`;
}

// Bind once at startup — the topbar DOM node is persistent.
export function initTopbar() {
  const el = document.getElementById("topbar");
  if (!el) return;
  // The ⋯ menu's toggle, outside-tap and Escape; tapping an item closes it.
  installMoreMenu({
    menuSelector: ".app-topbar__more-menu",
    triggerSelector: "[data-topbar-more]",
    closeAfterSelectors: [".app-topbar__more-menu [role=menuitem]"],
  });
  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-topbar-menu]")) {
      setDrawerOpen(true);
      return;
    }
    // The panel button opens the sheet where there's something to show:
    // Drafts first, then Ideas, then Sources. Its tabs move between them.
    if (event.target.closest("[data-topbar-panel]")) {
      if (getRightPanelMode()) closeRightPanel();
      else if (latestDraftCount() > 0) openDraftsPanel(latestDraftRef(currentSessionId()));
      else if (sessionIdeaCount() > 0) openIdeasPanel();
      else openSourcesPanel();
      return;
    }
    // Back from a sub-page — target comes from backTargetFor(), and may carry a
    // query (the settings page sends its Playbook back to the digest).
    const backBtn = event.target.closest("[data-topbar-back]");
    if (backBtn) {
      navigate(backBtn.dataset.topbarBack || "/");
      return;
    }
    // "Change profile" — back to the repurposing profile chooser (step 1).
    if (event.target.closest("[data-topbar-topposts-back]")) {
      const sid = currentSessionId();
      if (sid) topPostsBackToProfiles(sid);
      return;
    }
    // Click the conversation title → open the rename modal for it.
    const renameBtn = event.target.closest("[data-topbar-rename-session]");
    if (renameBtn) {
      const sid = renameBtn.dataset.topbarRenameSession;
      const session = sid ? getSessionById(sid) : null;
      if (!session) return;
      openRenameModal({
        title: "Rename chat",
        initialName: session.name,
        placeholder: "Chat name",
        confirmLabel: "Save name",
        onSubmit: (name) => updateSession(sid, { name }),
      });
      return;
    }
    // Welcome-alt Exit — open the discard-progress confirm and navigate
    // back to the dashboard. Pairs with the topbar button rendered by
    // renderWelcomeAltExit() above. The wizard chrome no longer carries
    // its own Exit affordance; this is the only entry.
    if (event.target.closest("[data-topbar-welcome-alt-exit]")) {
      import("./confirm-modal.js?v=1924").then(({ open }) => {
        open({
          title: "Exit onboarding?",
          body: "Your progress so far will be discarded. You can start over anytime from the dashboard.",
          confirmLabel: "Exit",
          cancelLabel: "Stay",
          danger: true,
          onConfirm: () => navigate("/"),
        });
      });
      return;
    }
    if (event.target.closest("[data-topbar-toggle-status-card]")) {
      toggleStatusCard();
      // Defensive: explicitly re-render the topbar so the button's
      // aria-pressed + title reflect the new state immediately, even
      // if the visibility subscription chain races with another
      // subscriber firing renderTopbar with the previous state.
      renderTopbar();
      return;
    }
  });

  // Re-render the topbar when the user flips the status-card visibility
  // preference so the `i` button's pressed state + tooltip stay accurate.
  subscribeStatusCardVisibility(() => renderTopbar());

  // Re-render when a context is renamed / deleted / created so the
  // active-session pill stays in sync (covers playbook editor saves and
  // wizard finalisation).
  subscribeContexts(() => renderTopbar());

  // Re-render the topbar whenever the right panel state changes so the
  // pills reflect the live mode (.is-on accent flips).
  subscribeRightPanel(() => renderTopbar());
  // Re-render when a session is renamed / deleted so the topbar title
  // reflects the new value (or "New conversation" if the active session
  // got removed).
  subscribeSessions(() => renderTopbar());

  // Re-render on hash change so pills re-derive per-route state.
  window.addEventListener("hashchange", () => renderTopbar());

  // When the active session's thread updates (new drafts land), re-render
  // so the Drafts pill badge reflects the latest count. Re-attach when the
  // route changes to a different session. Same goes for sources — drives
  // the Sources pill counter — and for the library (ideas extracted from
  // sources) — drives the Outputs pill badge + ungating.
  let lastSessionId = null;
  let unsubscribeThread = null;
  let unsubscribeSources = null;
  let unsubscribeLibrary = null;
  let unsubscribePosts = null;
  let unsubscribeTopPosts = null;
  function syncThreadSubscription() {
    const sid = currentSessionId();
    if (sid === lastSessionId) return;
    if (unsubscribeThread) {
      unsubscribeThread();
      unsubscribeThread = null;
    }
    if (unsubscribeSources) {
      unsubscribeSources();
      unsubscribeSources = null;
    }
    if (unsubscribeLibrary) {
      unsubscribeLibrary();
      unsubscribeLibrary = null;
    }
    if (unsubscribePosts) {
      unsubscribePosts();
      unsubscribePosts = null;
    }
    if (unsubscribeTopPosts) {
      unsubscribeTopPosts();
      unsubscribeTopPosts = null;
    }
    lastSessionId = sid;
    if (sid) {
      unsubscribeThread = subscribeThread(sid, () => renderTopbar());
      unsubscribeSources = subscribeSources(sid, () => renderTopbar());
      unsubscribeLibrary = subscribeLibrary(sid, () => renderTopbar());
      unsubscribePosts = subscribePosts(sid, () => renderTopbar());
      // Repurposing stage changes (profile → board → back) flip the topbar
      // between the session title and the "Change profile" back.
      unsubscribeTopPosts = subscribeTopPosts(sid, () => renderTopbar());
    }
  }
  syncThreadSubscription();
  window.addEventListener("hashchange", syncThreadSubscription);
}

// The one panel button on a chat — "Drafts" and its count, the thing a chat
// produces. It opens the bottom sheet; Ideas and Sources are the sheet's other
// tabs. Disabled while the chat has nothing for any of the three.
// It names what it opens: Drafts while the chat has drafts, else Ideas, else
// Sources — a "Drafts" button that opened the Ideas tab read as a broken promise.
function renderPanelButton(rpMode, draftCount, ideaCount) {
  const sourceCount = sessionSourceCount();
  const target =
    draftCount > 0
      ? { label: "Drafts", icon: "ap-icon-pen", count: draftCount, tone: "orange" }
      : ideaCount > 0
        ? { label: "Ideas", icon: "ap-icon-sparkles", count: ideaCount, tone: "blue" }
        : {
            label: sourceCount > 0 ? "Sources" : "Drafts",
            icon: sourceCount > 0 ? "ap-icon-file" : "ap-icon-pen",
            count: sourceCount,
            tone: "blue",
          };
  const disabled = !rpMode && target.count === 0;
  const badge = target.count > 0 ? `<span class="ap-counter normal ${target.tone}">${target.count}</span>` : "";
  return `
    <button
      type="button"
      class="ap-button ${rpMode ? "stroked blue" : "ghost grey"}"
      data-topbar-panel
      ${disabled ? "disabled" : ""}
      aria-pressed="${!!rpMode}"
      aria-label="${target.label} — open the chat's drafts, ideas and sources"
    >
      <i class="${target.icon}"></i>
      <span>${target.label}</span>
      ${badge}
    </button>
  `;
}

// The batch the Drafts tab pins to — the latest draft turn of the chat.
function latestDraftRef(sessionId) {
  if (!sessionId) return getActiveDraftsBatchRef();
  const latest = [...getThread(sessionId)].reverse().find((m) => m.variant === "draft");
  return latest ? { sessionId, messageId: latest.id } : getActiveDraftsBatchRef();
}

// Resolve the count of sources attached to the active session. Drives
// the .ap-counter badge on the Sources pill so the user sees how many
// inputs are feeding the conversation without opening the panel.
function sessionSourceCount() {
  const sid = currentSessionId();
  if (!sid) return 0;
  return getSessionSources(sid).length;
}

// Same shape for ideas (drives the Outputs pill badge + ungating).
function sessionIdeaCount() {
  const sid = currentSessionId();
  if (!sid) return 0;
  return getIdeas(sid).length;
}

// Count of drafts in the active session — posts-store, the store the Drafts
// panel reads. (It used to fall back on the last "Drafted N posts" turn, for a
// mock batch that never reached the store; every flow writes the store now, and
// the fallback kept counting drafts after they were deleted.)
function latestDraftCount() {
  const sessionId = currentSessionId();
  return sessionId ? getPosts(sessionId).length : 0;
}

function isSessionRoute() {
  return /^\/session\//.test(getPath());
}

// Routes that lead with a back control instead of a title, and where they go.
function backTargetFor(path) {
  // The brand's style creator (Image Generator, flag sexySquirrel) is a page OF
  // a Playbook: its way back is that fiche, named — in either model.
  const styleOf = /^\/playbook\/([^/?]+)\/styles\//.exec(path);
  if (styleOf) {
    const id = decodeURIComponent(styleOf[1]);
    const name = getContextById(id)?.name;
    return { to: `/playbook/${styleOf[1]}`, label: name ? `Back to ${name}` : "Back to the Playbook" };
  }
  // Account scope (see active-playbook.js): these routes sit above the
  // workspaces, so their back control leads back IN rather than to a sibling
  // page — and it names the brand, because "Back" alone would not say what you
  // are returning to. `/` resolves that brand's home (dashboard.js).
  if (isAccountScope(path)) {
    if (path === "/home" || path === "/contexts") {
      const active = getActivePlaybook();
      return { to: "/", label: active ? `Back to ${active.name}` : "Back to my work" };
    }
    // Another brand's fiche, opened from the home's Playbooks tab — back to
    // that tab, not to the home's default list.
    return { to: catalogueRoute(), label: "Back to all playbooks" };
  }
  // The active brand's fiche too: a bare "Playbook" title repeated the rail's
  // lit row and the page's own h1, and said nothing about where to go next. It
  // stays IN the workspace (the rail stays); the back simply leads up to the
  // catalogue, worded like the other fiches' in workspace mode.
  if (/^\/playbook\//.test(path)) {
    if (isWorkspaceMode()) return { to: catalogueRoute(), label: "Back to all playbooks" };
    return { to: "/contexts", label: "Back to Playbooks" };
  }
  // Insights' fiche is a LEVEL, not a route: `?objective=` is what opens it, and
  // `Mob · Index` is the only reading with two levels (Cockpit and Side keep the
  // whole list on screen, so they have no level to come back from — and their
  // selection always resolves to an objective, never to nothing). Its in-page
  // crumb moved here so the way back is where every other feature keeps it.
  // getPath() strips the query, so the selection has to be read from the hash.
  if (path === "/insights") {
    if (readLayoutId() !== "mob_index") return null;
    if (!parseHashParams().get("objective")) return null;
    // `/insights` with no query IS the index — the same primitive the fiche's
    // own crumb used (shell.js § insUnselect drops the param).
    return { to: "/insights", label: "Back to objectives" };
  }
  // Mobile fork: an open Topic (or the influencer invite) is a level pushed over
  // the feed — the back drops that parameter and keeps the rest (scope, filters).
  if (path === "/topics") {
    const params = parseHashParams();
    if (!params.has("topic") && !params.has("invite")) return null;
    params.delete("topic");
    params.delete("invite");
    const qs = params.toString();
    return { to: qs ? `/topics?${qs}` : "/topics", label: "Back to the feed" };
  }
  // The Topics settings page carries its Playbook scope BACK to the feed, so a
  // filtered feed survives the round trip. getPath() strips the query, so the scope
  // has to be read from the hash here rather than taken from `path`.
  if (/^\/topics\/settings/.test(path)) {
    const pb = parseHashParams().get("pb");
    return { to: pb ? `/topics?pb=${encodeURIComponent(pb)}` : "/topics", label: "Back to the feed" };
  }
  return null;
}

// The welcome-alt session hosts the conversational Playbook builder
// (URL → profile → optional docs). It runs in app-shell chrome only
// in the integrated entry (returning user creates a Playbook from
// /contexts); the first-time onboarding hides chrome entirely via the
// body.onboarding class set in app.js. Either way, the Sources / Ideas
// / Drafts pills + the chat-status toggle don't apply during creation
// — there's no thread yet, no drafts, no idea bank. Use this helper to
// gate session-pill rendering.
function isWelcomeAltSession() {
  const sid = currentSessionId();
  return !!sid && sid.startsWith("welcome-alt-");
}

// The DS Top bar pattern's back (V2 Molecules › Top bar, 7016:21445): an icon
// button, the destination in its tooltip and name. For pages that hand the
// topbar their own left side (setTopbarActions … { left }).
export function renderIconBack(to, label) {
  return `<button type="button" class="ap-icon-button" data-topbar-back="${escapeAttr(to)}" aria-label="${escapeAttr(label)}" data-tooltip="${escapeAttr(label)}">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
    </button>`;
}

// A sub-page leads with a back control in place of the route title.
function renderBack({ to, label }) {
  return `
    <button type="button" class="ap-button ghost grey app-topbar__back" data-topbar-back="${escapeAttr(to)}" title="${escapeAttr(label)}">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function currentSessionId() {
  const m = /^\/session\/([^/?]+)/.exec(getPath());
  return m ? m[1] : null;
}

// Resolve the title shown in the topbar from the current route. Session
// titles fall back to a generic label so /session/new and unknown ids stay
// readable. Anchors back to the dashboard via the sidebar — no need to make
// the topbar title clickable.
function currentTitle() {
  const path = getPath();
  // Two homes, one word: `/` is the active brand's (a redirect that never
  // renders), `/home` is the account's.
  if (path === "/" || path === "/home") return "Home";
  if (path === "/contexts") return "Playbooks";
  if (path === "/connectors") return "Connectors";
  if (path === "/topics") return "Topic Feed";
  // The topbar names the SECTION; the brand is named once, by the heading each
  // layout renders — which is also the Playbook switcher (insights/pieces.js).
  if (path.startsWith("/insights")) return "Insights";
  const sessionMatch = /^\/session\/([^/?]+)/.exec(path);
  if (sessionMatch) {
    const id = sessionMatch[1];
    const known = getSessionById(id);
    if (known?.name) return known.name;
    // A freshly minted `new-*` chat isn't in the store yet, so fall back to the
    // `?title=` param the same way session.js does when it builds the virtual
    // session — otherwise a chat spawned with a name (from a topic, say) reads
    // "New chat" in the topbar while its own header shows the real one.
    return parseHashParams().get("title") || "New chat";
  }
  return "Archie";
}
