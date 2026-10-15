import { html, raw, escapeAttr } from "../utils.js?v=1927";
import { renderTopbar } from "../components/topbar.js?v=1927";
import {
  getContexts,
  subscribe as subscribeContexts,
  duplicateContext,
  deleteContext,
} from "../contexts-store.js?v=1927";
import { getSessions, getSessionById, subscribe as subscribeSessions } from "../sessions-store.js?v=1927";
import { parseHashParams, setHashQuery } from "../url-state.js?v=1927";
import { closePanel as closeRightPanel } from "../components/right-panel.js?v=1927";
import { navigate, getPath } from "../router.js?v=1927";
import { setHandoff } from "../handoff.js?v=1927";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=1927";
import { visibleContexts, usableContexts } from "../playbook-access.js?v=1927";
import { isWorkspaceMode, setActivePlaybook, catalogueRoute } from "../active-playbook.js?v=1927";
import { open as openShareModal } from "../components/share-playbook-modal.js?v=1927";
import { installMoreMenu } from "../components/more-menu.js?v=1927";
import { showToast } from "../components/toast.js?v=1927";
import { pickedPlaybook, renderHeroPicker, renderHomeHero, renderHomeWorkflows } from "./home/hero.js?v=1927";
import {
  chatPlaybook,
  renderChatsTab,
  renderContextCard,
  renderContextsEmpty,
  renderGhostCard,
  renderPlaybooksTable,
} from "./home/lists.js?v=1927";

// The account HOME — and the Playbooks catalogue it merged with.
//
// ── Two levels, two homes ─────────────────────────────────────────────────
// `/` is the home of the active BRAND: a pure redirect to its most recent chat
// (dashboard.js). This is the home of the ACCOUNT — the level above the
// workspaces, where the two things that exist at that level live: the catalogue
// of brands, and every chat, all brands. A hero on top turns it from a place
// that only manages into a place you start from: type, pick a Playbook, Enter.
//
// ⚠️ NOT the front page that was deleted. `frontPage` made `/` a magazine fed by
// listening, and that arbitration is closed (CLAUDE.md § The Topic Feed). The
// test that separates them: the front page was a page of what Archie PROPOSES;
// this is a page of what you HAVE. No Topic, no topics-store read, and `/` is
// untouched.
//
// ── Two routes, one module ────────────────────────────────────────────────
//   /home      → renderHome          the hero + the two tabs   (workspace mode)
//   /contexts  → renderContextsRoute the catalogue on its own   (flag OFF)
// Each gates itself and bounces, the way /topics and /insights do, so a stale
// deep link lands somewhere real instead of rendering a dead screen. The
// catalogue path is byte-for-byte what it was: flag OFF, nothing here changed.
//
// ⚠️ The names still say `contexts` — the classes (`.contexts-view__*`,
// `.contexts-card*`) and the stylesheet (styles/screens/contexts.css). Renaming
// them would touch a stylesheet and every card selector for something no user
// can see; same call as the `.isv2-` prefix in the Image Studio.

// ── The row's overflow menu — one open at a time (shared behaviour) ───────
// The row lists its verbs in a kebab instead of the tile's hover toolbar. Two
// reasons: a toolbar whose width depends on my rights (four buttons or two)
// makes the whole right-hand cluster start at a different x on every row, which
// is the one thing a list is for; and a hover-only control is a poor primary on
// a row whose body is now a navigation. Installed once at module scope, like
// source-card and idea-card do — it binds document listeners.
installMoreMenu({
  menuSelector: ".home-playbooks__more-menu",
  triggerSelector: "[data-playbook-more]",
  closeAfterSelectors: [
    "[data-contexts-share]",
    "[data-contexts-edit]",
    "[data-contexts-duplicate]",
    "[data-contexts-delete]",
  ],
});

let unsubs = [];
// Where this screen paints — the router's #app. Held at module level because
// every repaint path (a store notify, Clear search, a tab switch) has to reach
// it, and bind() is handed the SECTION, not this.
let mountTarget = null;
export let pageState = { query: "", pickedPlaybookId: null };
// Which of the two surfaces this mount is. Module-level rather than threaded
// through every renderer: the search's partial repaint needs it too.
let isHome = false;

export function renderHome(_params, target) {
  // No level above the work without the workspace model — so no home either.
  if (!isWorkspaceMode()) {
    replaceHash("/");
    return;
  }
  return mountScreen(target, true);
}

export function renderContextsRoute(_params, target) {
  // In workspace mode the catalogue IS the home's Playbooks tab. Kept as a
  // route so every stale deep link and every inbound navigate still lands — on
  // that TAB, since `/contexts` meant the catalogue and the home opens on Chats.
  if (isWorkspaceMode()) {
    replaceHash(catalogueRoute());
    return;
  }
  return mountScreen(target, false);
}

// `replace`, not navigate(): a redirect that writes a history entry gives the
// reader a Back button that lands on the route it just left and bounces again —
// a Back that does nothing. Same call dashboard.js makes for the same reason.
function replaceHash(path) {
  window.location.replace(window.location.href.split("#")[0] + "#" + path);
}

function mountScreen(target, home) {
  isHome = home;
  mountTarget = target;
  renderTopbar();
  drainSubs();
  paint();
  // FIND-B: tear the subscriptions down on route change so off-route
  // notifications don't repaint a target that no longer holds this view.
  unsubs.push(subscribeContexts(() => paint()));
  // The Chats tab has to move when a chat is renamed, pinned or deleted
  // somewhere else — the rail's ⋮ menu, mostly.
  if (home) unsubs.push(subscribeSessions(() => paint()));
  return () => {
    drainSubs();
    // Switching tab is a query-only change, which re-runs this handler: the
    // path is already the NEW one here, so a tab switch keeps the search box
    // and leaving the surface forgets it.
    if (getPath() !== "/home") pageState = { query: "", pickedPlaybookId: null };
  };
}

function drainSubs() {
  unsubs.forEach((off) => off());
  unsubs = [];
}

function paint() {
  const target = mountTarget;
  if (!target) return;
  target.innerHTML = html`<section class="screen contexts-view" data-home-root>${raw(renderPage())}</section>`;
  // ⚠️ Bind to the SECTION, not to `target`. `target` is #app, which paint()
  // never replaces — so every repaint (a store notify, Clear search) stacked
  // another pair of listeners on it, and after two paints one click on the
  // ghost card minted two sessions. The section's innerHTML IS replaced, so
  // its listeners die with the node. `querySelector` rather than
  // firstElementChild: the html`` template can leave a leading text node.
  bind(target.querySelector("[data-home-root]"));
}

// Which list the home is showing. In the URL, like every other screen state
// here (`?tab=` on a session, `?pb=` on the feed): the two lists are then
// linkable and the browser's Back moves between them. An unknown value falls
// back rather than rendering nothing.
function activeTab() {
  // Chats first, and the default: the home's subject is the work, and the
  // catalogue is what you open to switch, create or manage. An unknown value
  // falls back rather than rendering nothing.
  return parseHashParams().get("tab") === "playbooks" ? "playbooks" : "chats";
}

function renderPage() {
  // What I'm allowed to see, not what the store holds — a colleague's private
  // Playbook is in the store and must not be in this grid.
  const all = visibleContexts();
  const totalChats = all.reduce((sum, c) => sum + (c.usedIn || 0), 0);

  // Flag OFF — the catalogue on its own, header and all, exactly as before.
  if (!isHome) {
    return html`
      <div class="contexts-view__page">
        <header class="contexts-view__head">
          <div class="contexts-view__head-text">
            <h1 class="contexts-view__title">Playbooks</h1>
            <p class="contexts-view__sub">${all.length} Playbooks · applied across ${totalChats} chats</p>
          </div>
          <div class="contexts-view__head-actions">${raw(renderSearchField())}${raw(renderCreateButton())}</div>
        </header>

        <div class="contexts-view__body">${raw(renderTabBody())}</div>
      </div>
    `;
  }

  // The home. No `h1 Playbooks` and no count sub-line up here: the hero owns
  // the page's only h1, and a heading reading "Playbooks" forty pixels under a
  // tab reading "Playbooks 8" is the same word twice with the same number
  // beside it. What the sub-line said that the tab doesn't survives in the
  // toolbar under it.
  const tab = activeTab();
  return html`
    <div class="contexts-view__page">
      ${raw(renderHomeHero())} ${raw(renderHomeWorkflows())}
      ${raw(renderHomeTabs(all.length, getSessions().length, tab))} ${raw(renderHomeToolbar(tab, totalChats))}
      <div class="contexts-view__body">${raw(renderTabBody())}</div>
    </div>
  `;
}

// ⚠️ ONE body renderer, two callers: renderPage() and the search's `input`
// handler, which repaints only this so the field keeps its caret. They were two
// copies and they had drifted twice — the partial one read getContexts() where
// the page reads visibleContexts() (so typing surfaced a colleague's private
// Playbook) and it forgot the ghost card (which vanished on the first
// keystroke). Two callers, one function: they cannot drift again.
function renderTabBody() {
  if (isHome && activeTab() === "chats") return renderChatsTab();
  const all = visibleContexts();
  const visible = filter(all, pageState);
  if (visible.length === 0) return renderContextsEmpty(all, pageState);
  // On the home the Playbooks tab is a LIST of full-width rows, not a grid of
  // tiles. Two reasons, and the second is the one that matters: the numbers
  // (chats, audiences, competitors, influencers) line up in a column you can read down —
  // a 3-up grid scatters them across nine positions — and a row is the shape
  // of the thing it now is, a door into a workspace, sitting beside the Chats
  // tab's own rows. Flag OFF the catalogue keeps its grid: it is a page for
  // browsing fiches, and its cards are the object, not a door.
  if (isHome) return renderPlaybooksTable(visible);
  return `<div class="contexts-view__grid">${visible.map(renderContextCard).join("")}${renderGhostCard()}</div>`;
}

function renderSearchField() {
  const chats = isHome && activeTab() === "chats";
  return `
    <div class="ap-input-group contexts-view__search">
      <i class="ap-icon-search"></i>
      <input
        type="search"
        placeholder="${chats ? "Search chats…" : "Search Playbooks…"}"
        value="${escapeAttr(pageState.query)}"
        data-contexts-search
      />
    </div>
  `;
}

function renderCreateButton() {
  return `
    <button type="button" class="ap-button primary blue" data-contexts-new>
      <i class="ap-icon-plus"></i>
      <span>Create a Playbook</span>
    </button>
  `;
}

// ── The two lists ─────────────────────────────────────────────────────────
// Real DS tabs (.ap-tabs ships in ds/css-ui). /topics dropped its tabs because
// only one list was ever on screen there; here there are genuinely two, which
// is the case the component is for. Counters are safe on both: each counts
// THINGS, so "Chats 12" reads as twelve chats.
function renderHomeTabs(playbookCount, chatCount, tab) {
  const item = (id, icon, label, count) => {
    const on = tab === id;
    return `
      <button
        type="button"
        class="ap-tabs-tab${on ? " active" : ""}"
        role="tab"
        aria-selected="${on ? "true" : "false"}"
        data-home-tab="${id}"
      >
        <i class="${icon}" aria-hidden="true"></i>
        <span>${label}</span>
        <span class="ap-counter normal ${on ? "blue" : "grey"}">${count}</span>
      </button>
    `;
  };
  return `
    <div class="ap-tabs">
      <div class="ap-tabs-nav" role="tablist" aria-label="Playbooks and chats">
        ${item("chats", "ap-icon-single-chat-bubble", "Chats", chatCount)}
        ${item("playbooks", "ap-icon-target", "Playbooks", playbookCount)}
      </div>
    </div>
  `;
}

// Under the tabs rather than beside them: the DS nav owns its full-width rule,
// and hanging a search field inside a [role=tablist] would put a non-tab in it.
function renderHomeToolbar(tab, totalChats) {
  const hint =
    tab === "playbooks"
      ? `<p class="home-toolbar__hint muted">Applied across ${totalChats} chats</p>`
      : `<p class="home-toolbar__hint muted">Every chat, every Playbook.</p>`;
  return `
    <div class="home-toolbar">
      ${hint}
      <div class="home-toolbar__actions">
        ${renderSearchField()}
        ${tab === "playbooks" ? renderCreateButton() : ""}
      </div>
    </div>
  `;
}

// ── The three pieces both shapes must say the same way ───────────────────

function filter(list, { query }) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.brandName || "").toLowerCase().includes(q) ||
      (c.briefSummary || "").toLowerCase().includes(q),
  );
}

// A shared Playbook takes other people's work down with it, so the confirm says
// how many chats and what survives — not just "this will be removed".
function deleteBody(ctx) {
  if (ctx.scope !== "organization") {
    return `"${ctx.name}" will be removed. Chats using it will need a new Playbook.`;
  }
  const n = ctx.usedIn || 0;
  const who = n === 1 ? "1 chat" : `${n} chats`;
  return n
    ? `"${ctx.name}" is shared with your organisation and ${who} run on it. They keep the drafts already written — those can still be saved or scheduled — but they won't generate anything new.`
    : `"${ctx.name}" is shared with your organisation. It disappears from everyone's list. Playbooks duplicated from it are their own and stay untouched.`;
}

function bind(root) {
  root.addEventListener("click", (event) => {
    // The hero's two menus don't close themselves on an outside click. Before
    // the dispatch guards, so a click on empty page space shuts them. No
    // document listener — paint() recreates these nodes, and a document
    // listener would outlive them.
    const openPicker = root.querySelector("[data-home-pb][open]");
    if (openPicker && !openPicker.contains(event.target)) openPicker.removeAttribute("open");
    if (!event.target.closest(".home-hero__add")) closeAddMenu(root);

    // Add — the same menu the composer carries, launching instead of staging.
    if (event.target.closest("[data-home-add-toggle]")) {
      event.preventDefault();
      const menu = root.querySelector("[data-home-add-menu]");
      const toggle = root.querySelector("[data-home-add-toggle]");
      if (menu) {
        menu.hidden = !menu.hidden;
        toggle?.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      }
      return;
    }
    const addItem = event.target.closest("[data-home-add]");
    if (addItem) {
      event.preventDefault();
      closeAddMenu(root);
      startFromHomeAdd(root, addItem.dataset.homeAdd);
      return;
    }
    const addConnector = event.target.closest("[data-home-add-connector]");
    if (addConnector) {
      event.preventDefault();
      closeAddMenu(root);
      startFromHomeAdd(root, "connector", addConnector.dataset.homeAddConnector);
      return;
    }

    // Tabs — the state lives in the URL, so the router repaints and Back works.
    const tabBtn = event.target.closest("[data-home-tab]");
    if (tabBtn) {
      event.preventDefault();
      const next = tabBtn.dataset.homeTab;
      if (next !== activeTab()) setHashQuery("/home", { tab: next });
      return;
    }

    // Picking a brand in the hero writes NOTHING but the pick. The scope moves
    // on Send, which is the explicit commit — a picker that silently re-scoped
    // the app is the exact failure active-playbook.js's header describes.
    // Repaint only the picker: the textarea beside it holds what the reader
    // typed, and a full paint would throw it away.
    const pbPick = event.target.closest("[data-home-pb-pick]");
    if (pbPick) {
      event.preventDefault();
      pageState.pickedPlaybookId = pbPick.dataset.homePbPick;
      const host = root.querySelector("[data-home-pb]");
      if (host) host.outerHTML = renderHeroPicker(pickedPlaybook(), usableContexts());
      return;
    }

    // A workflow card. Same three actions the chat's hero dispatches, minus the
    // session it has and this page hasn't.
    const starter = event.target.closest("[data-starter-action]");
    if (starter) {
      event.preventDefault();
      startFromStarter(starter.dataset.starterAction);
      return;
    }

    if (event.target.closest("[data-home-send]")) {
      event.preventDefault();
      submitHomePrompt(root);
      return;
    }

    // A chat row. Opening a chat from up here has to re-scope: otherwise the
    // reader lands on a conversation the rail beside it doesn't list.
    const chatRow = event.target.closest("[data-home-chat]");
    if (chatRow) {
      openChatFromHome(chatRow.dataset.homeChat);
      return;
    }

    const shareBtn = event.target.closest("[data-contexts-share]");
    if (shareBtn) {
      event.stopPropagation();
      // The store notifies on commit and this screen is subscribed, so the card's
      // mark repaints on its own — no onDone needed here.
      openShareModal({ contextId: shareBtn.dataset.contextsShare });
      return;
    }
    // Edit (pen icon) — opens the Playbook detail page, where the brief
    // panel handles in-place edits (rename, toggle chips, change brand
    // color, etc.).
    const editBtn = event.target.closest("[data-contexts-edit]");
    if (editBtn) {
      event.stopPropagation();
      navigate(`/playbook/${editBtn.dataset.contextsEdit}`);
      return;
    }
    if (event.target.closest("[data-contexts-new]")) {
      // Launch the conversational Playbook flow (welcome-alt) integrated in
      // the app shell: the `welcomeAltIntegrated` flag keeps the sidebar +
      // topbar visible and the recap finishes by returning here (no
      // switch-to-returning). A `welcome-alt-` session id gets the flow + hero.
      try {
        window.sessionStorage.setItem("welcomeAltIntegrated", "1");
        window.sessionStorage.setItem("welcomeAltReturnTo", catalogueRoute());
      } catch {
        /* ignore */
      }
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: catalogueRoute() });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
      return;
    }
    if (event.target.closest("[data-contexts-clear-query]")) {
      pageState.query = "";
      paint();
      return;
    }
    const dupBtn = event.target.closest("[data-contexts-duplicate]");
    if (dupBtn) {
      event.stopPropagation();
      const copy = duplicateContext(dupBtn.dataset.contextsDuplicate);
      if (copy) {
        showToast("Playbook duplicated");
        navigate(`/playbook/${copy.id}`);
      }
      return;
    }
    const delBtn = event.target.closest("[data-contexts-delete]");
    if (delBtn) {
      event.stopPropagation();
      const ctx = getContexts().find((c) => c.id === delBtn.dataset.contextsDelete);
      if (!ctx) return;
      if (getContexts().length <= 1) {
        showToast("Can't delete the last Playbook — every chat needs one.");
        return;
      }
      // FIND-C1: DS confirm-modal so the delete prompt is keyboard-
      // accessible, themed, and consistent with the rest of the prototype.
      openConfirmModal({
        title: "Delete Playbook?",
        body: deleteBody(ctx),
        confirmLabel: "Delete Playbook",
        cancelLabel: "Keep",
        danger: true,
        onConfirm: () => {
          deleteContext(ctx.id);
          showToast("Playbook deleted");
        },
      });
      return;
    }
    // The kebab and its menu are not the card: without this the trigger would
    // fall through to the card fallback below and enter the workspace.
    // more-menu.js owns the toggle itself, on the document.
    if (event.target.closest("[data-playbook-more]") || event.target.closest(".home-playbooks__more-menu")) {
      return;
    }
    // Card click — anywhere outside the action buttons. On the home it enters
    // the workspace (see renderContextCard); flag OFF it opens the fiche for
    // inspection, as it always did. The action buttons stop propagation so
    // they win over this fallback.
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      enterWorkspace(card.dataset.contextsCard);
      return;
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-contexts-search]")) {
      pageState.query = event.target.value || "";
      // Repaint the body in place so empty <-> grid transitions both work
      // without losing the search field's focus — through renderTabBody(), the
      // one renderer the full paint also uses.
      const body = root.querySelector(".contexts-view__body");
      if (body) body.innerHTML = renderTabBody();
      return;
    }
    // Typing in the hero: the only thing that changes is whether Send can fire.
    // Patched by hand, never repainted — a repaint would take the caret with it.
    if (event.target.matches("[data-home-prompt]")) {
      const send = root.querySelector("[data-home-send]");
      if (send) send.disabled = !event.target.value.trim();
    }
  });

  root.addEventListener("keydown", (event) => {
    // Enter sends, Shift+Enter is a newline — the composer's contract, because
    // this is the same gesture one screen earlier.
    if (event.target.matches("[data-home-prompt]") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitHomePrompt(root);
      return;
    }
    // Neither a <tr role="button"> nor an <article role="button"> is natively
    // activatable, and both are now this page's primary targets.
    if (event.key !== "Enter" && event.key !== " ") return;
    const chatRow = event.target.closest("[data-home-chat]");
    if (chatRow) {
      event.preventDefault();
      openChatFromHome(chatRow.dataset.homeChat);
      return;
    }
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      event.preventDefault();
      enterWorkspace(card.dataset.contextsCard);
    }
  });
}

// A Playbook card, activated. In workspace mode that means: work in this brand
// — switch the scope, then open a fresh chat bound to it, the same landing
// "Start a chat" gives on the fiche. `?contextId=` rather than `/`, which would
// resolve to whatever chat the brand last had: this page is a launcher, and the
// gesture is "start", not "resume". Flag OFF, there is no workspace to enter and
// the card keeps opening the fiche.
function enterWorkspace(id) {
  if (!id) return;
  if (!isWorkspaceMode()) {
    navigate(`/playbook/${id}`);
    return;
  }
  setActivePlaybook(id);
  closeRightPanel();
  navigate(`/session/new-${Date.now().toString(36)}?contextId=${encodeURIComponent(id)}`);
}

// ── Starting a chat from the home ─────────────────────────────────────────
//
// The Playbook and the chat's NAME ride in the URL, because session.js resolves
// `?contextId=` and `?title=` as it mints a `new-*` session — so the chat is
// bound and named on its first paint. Only the text needs a bridge, and a
// single-use handoff is that bridge.
//
// setActivePlaybook BEFORE navigate, like every other switch here: the other
// order is what leaves the rail naming one brand above another's page.
function submitHomePrompt(root) {
  const field = root.querySelector("[data-home-prompt]");
  const text = (field?.value || "").trim();
  // Send is disabled while the field is empty; this is the keyboard's guard.
  // sendMessage() itself returns early on empty text, so an empty submit would
  // open a chat and post nothing — which reads as a bug.
  if (!text) return;
  const picked = pickedPlaybook();
  if (!picked) return;
  setActivePlaybook(picked.id);
  setHandoff("pendingHomePrompt", { text });
  const params = new URLSearchParams({ contextId: picked.id, title: chatNameFromPrompt(text) });
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
}

// A workflow, launched from the home. Batch and Clip Studio each run in their
// own transient session and already read `playbookForNewWork()` when they
// start — which is the ACTIVE Playbook — so switching first is what binds them
// to the brand picked in the hero. Their handoffs are the ones session.js
// consumes synchronously on a `batch-*` / `clip-studio-*` id, unchanged.
//
// Top posts has no session of its own: it runs IN a chat, so the home mints one
// and rides `pendingHomeAdd` — with the studio kind, `startTopPostsFlow`, which
// is what the card opens in the hero (the Add menu's row is the inline variant;
// both exist in the chat too).
function startFromStarter(action) {
  const picked = pickedPlaybook();
  if (!picked) return;
  setActivePlaybook(picked.id);
  closeRightPanel();
  const stamp = Date.now().toString(36);
  if (action === "open-batch") {
    setHandoff("pendingStartBatch", {});
    navigate(`/session/batch-${stamp}`);
    return;
  }
  if (action === "open-video-clips") {
    setHandoff("pendingStartClipStudio", {});
    navigate(`/session/clip-studio-${stamp}`);
    return;
  }
  if (action === "open-top-posts") {
    setHandoff("pendingHomeAdd", { kind: "top-posts-studio", connectorId: null });
    navigate(`/session/new-${stamp}?contextId=${encodeURIComponent(picked.id)}`);
  }
}

function closeAddMenu(root) {
  const menu = root.querySelector("[data-home-add-menu]");
  if (menu && !menu.hidden) {
    menu.hidden = true;
    root.querySelector("[data-home-add-toggle]")?.setAttribute("aria-expanded", "false");
  }
}

// An Add item, launched. Same two beats as Send — switch, then mint the chat —
// with the intent riding across in `pendingHomeAdd` for session.js to dispatch.
// "Browse connectors" is the exception: a gallery is a page, not a chat.
//
// Anything already typed comes ALONG: the reader wrote it, and dropping it
// because they then reached for Add would be the worst kind of quiet loss.
function startFromHomeAdd(root, kind, connectorId) {
  if (kind === "connectors") {
    navigate("/connectors");
    return;
  }
  const picked = pickedPlaybook();
  if (!picked) return;
  const field = root.querySelector("[data-home-prompt]");
  const text = (field?.value || "").trim();
  setActivePlaybook(picked.id);
  setHandoff("pendingHomeAdd", { kind, connectorId: connectorId || null });
  if (text) setHandoff("pendingHomePrompt", { text });
  const params = new URLSearchParams({ contextId: picked.id });
  if (text) params.set("title", chatNameFromPrompt(text));
  closeRightPanel();
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
}

// The chat's name IS the ask, truncated on a word. No shared helper to reuse:
// session.js's own is private and dates the chat ("Chat · Jun 3, 14:20"), which
// says less than the sentence the reader just typed.
function chatNameFromPrompt(text) {
  const line = String(text).split("\n")[0].trim();
  if (line.length <= 60) return line;
  return `${line.slice(0, 59).replace(/\s+\S*$/, "")}…`;
}

function openChatFromHome(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  // A chat with no Playbook — or one whose fiche I can't open — is left alone:
  // it lives in every workspace by construction, and switching to a brand I
  // cannot view would break the scope's own guarantee.
  const ctx = chatPlaybook(session);
  if (ctx) setActivePlaybook(ctx.id);
  closeRightPanel();
  navigate(`/session/${session.id}`);
}
