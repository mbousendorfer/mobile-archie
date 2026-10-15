# Architecture

> Vue d'ensemble du proto, conventions structurelles, lifecycle. Compagnon de [`CLAUDE.md`](../../CLAUDE.md), zoomable sur les conventions d'architecture.

## Principes

- **Vanilla JS pur** — pas de framework, pas de bundler, pas de build, pas de dépendance runtime externe.
- **ES modules** servis directement depuis `src/`, avec un suffixe `?v=N` de cache-bust — **un seul numéro pour toute l'app**, réécrit en une passe par `npm run bump` (cf. § Cycle d'import).
- **Pure event delegation** — chaque écran/modal/composant attache un seul listener sur sa racine et dispatche via `data-*`. Aucun `onclick=` inline, aucun listener per-child sur les enfants interactifs.
- **Mocks** — toutes les seed data sont sous `src/mocks/`, un fichier par domaine derrière le barrel `src/mocks.js`. Très peu de persistance : quelques préférences en `localStorage` et le studio de l'Image Generator (`localStorage` + IndexedDB) — la liste complète des clés est dans [`STORES.md`](STORES.md) § Persistence.

## Lifecycle de l'app

1. `index.html` charge le DS depuis jsDelivr (`@latest`), tous les CSS de l'app et `src/app.js`.
2. `app.js` :
   - importe les screens (renderers) + composants + modaux
   - appelle `init()` sur chaque composant (qui injecte son DOM une fois dans `<body>`)
   - enregistre les routes via `route(path, handler)` (cf. `src/router.js`)
   - appelle `start()` qui lance le premier `hashchange`
3. À chaque `hashchange`, `router.js` :
   - match le path (query stripped)
   - appelle `cleanup` retourné par le précédent handler (si défini) — `#app` n'est pas vidé par le router : chaque screen écrit son propre contenu dans `target`
   - appelle le handler du nouveau path : `renderXxx(params, target)`
4. `setAfterRender` (dans `app.js`) re-render la sidebar + la `conversation-status-card` après chaque route change, et toggle la classe `body.onboarding` pour le flow welcome-alt (layout full-bleed).

## Topologie de l'app shell

```
<body>
  #sidebar          ← persistent, géré par src/components/sidebar.js
  #topbar           ← persistent, géré par src/components/topbar.js
  #app              ← contenu de la route active, vidé/recréé sur hashchange
  #rightPanel       ← persistent overlay, géré par src/components/right-panel.js
  #toastRegion      ← portal pour les toasts (DS .ap-snackbar)
  #conversationStatusCard ← floating indicator
  [modals]          ← chacun s'injecte sur init(), un seul ouvert via modal-coordinator
</body>
```

## Source layout

L'arborescence de référence (tenue à jour ici, pas dans `CLAUDE.md`, qui n'en garde qu'une carte). Styles : voir [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) § Files app.

```
src/
  app.js                — entry: imports + route table + init() calls + start()
  router.js             — hash router (route() / navigate() / getPath() / start())
  url-state.js          — parseHashParams() / setHashQuery() (hash query params)
  drag-reorder.js       — bindReorder(): the app's one drag-to-reorder (grip, lift, slide); styles/components/drag-reorder.css
  handoff.js            — single-use sessionStorage bridge across navigations
  utils.js              — html`` / raw() tagged-template helpers + escapeHtml (html`` escapes by default)
  store-utils.js        — createNotifier() subscribe/notify primitive used by stores
  user-mode.js          — "returning" vs "new-alt" mode (localStorage: archie-user-mode)
  feature-flags.js      — flag get/set (localStorage); ff-catalog.js is the flag list
  org.js                — CONFIG: who I am, my org, its members, my role (localStorage: archie-org-role)
  active-playbook.js   — the ACTIVE Playbook: the app-wide scope behind the flag
                          `playbookWorkspace` (localStorage: archie-active-playbook), plus the
                          three functions every scoped surface reads — isWorkspaceMode() /
                          playbookForNewWork() / scopeSessions() — and isAccountScope(path),
                          which marks the routes that live ABOVE the workspaces. Insights
                          reads it flag or no flag.
  playbook-access.js    — who may view/use/edit/share a Playbook; the store never filters
  playbook-brand-kit.js — the Playbook's brand-kit rows (flag `sexySquirrel`), called by playbook-view
  modules/image-studio/ — the Image Generator (flag `sexySquirrel`): the draft's studio, the brand's
                          styles row + creator. Self-contained (index.js is its only door):
                          config/ (formats, fonts, networks, style presets, mocks) · model/schema ·
                          state/ (store, creation / style actions, edit-doc, playbook-brand — the ONE
                          adapter to the Playbooks) · render/ (layout, palette, generators, export) ·
                          services/ (storage: localStorage + IndexedDB, mock generation) · ui/ ·
                          views/ (studio, style-creator, playbook-styles, edit/) · styles/imst-*.css
  file-kinds.js         — source kind → DS icon class
  figma-capture.js      — ?openModal= / ?openPanel= deep links for the Figma screen capture
  archie-loader.js      — swaps every spinner in the app for the animated Archie mark
  archie-pixels.js      — <archie-pixels>: the image-generation loader (brand-colour field, a shimmering matrix of square pixels, narrated stages) and its focus-pull arrival
  mocks.js              — barrel over mocks/ — the single import path for seed data
  mocks/                — ALL seed data, one file per domain: sessions, top-posts,
                          sources, ideas, playbooks, topics, posts, threads,
                          schedule, connectors, social, objectives. Self-contained: no file
                          under mocks/ reads a sibling.
  image-studio.js       — Image Studio state engine (UI-agnostic) + all its mocks
  image-studio-canvas.js — pure canvas helpers: bake / crop / text metrics

  # Stores (per-session Map + subscribers, seed from mocks unless new-alt mode)
  sessions-store.js     — chat sessions list (pin / rename / delete)
  contexts-store.js     — Playbooks (Contexts)
  connectors-store.js   — connectors list + connection state (the only "catalog" store)
  library.js            — per-session ideas; getSources() delegates to sources-stream
  posts-store.js        — per-session drafts
  assistant.js          — per-session conversational thread (turns, reasoning chips, MCP query)
  sources-stream.js     — sources PER SESSION + global uploads + processing state machine
  schedule-store.js     — scheduled-post queue (calendar)
  schedule-presets-store.js — GLOBAL: one posting-rhythm preset per Playbook (the schedule modal's Adjust)
  schedule-engine.js    — the schedule spread (which date each draft gets): the modal and the chat's plan
  chat-refs.js          — Archie's inline references ([[post|idea|source:id]] → underlined label)
  topic-feeds-store.js  — GLOBAL: one listening feed per Playbook (flag `topicFeed`)
  topics-store.js       — GLOBAL: the Topics + the triage, in two separate structures
  topics-catalog.js     — the eight listening sources, cadences, kinds, review
                          statuses, signals (CONFIG, like ff-catalog)
  composer-mentions.js  — per-session @mention pills in the composer
  composer-connector.js — composer's "Connected sources" submenu (feature-flagged)

  # Conversational flow orchestrators (drive the assistant thread + pickers)
  draft-flow.js         — "Draft post from idea" turn sequence (channel pick → execute → result)
  draft-rewrite.js      — regenerate-a-draft (thinking → streaming → commit)
  context-builder.js    — Playbook creation/edit conversation (drives welcome-alt + edits)
  playbook-view.js      — shared Playbook render engine (recap + detail)
  context-mock-analysis.js — deterministic mock "website analysis" for onboarding
  sidebar-wizard.js     — multi-stage numbered-option wizard inside the assistant panel
  inline-question.js    — one-shot numbered-option picker inside the assistant panel
  library-actions.js    — shared bulk-bar (Extract/Delete) + click dispatch for content lists
  social-profiles.js    — connected social accounts (STATE: which are connected, + a notifier),
                          the NETWORKS table (icon / label / limit / accent) and the profile renderers
  connect-profiles-flow.js — requireConnectedProfiles(): the connect step every draft path asks
                          (flag `skipConnectProfiles`)
  draft-image-flow.js   — "Generate an image": one image straight into the draft, nothing asked
  objective-measures.js / objective-scoring.js / objective-flow.js — Insights' objectives: the
                          metric catalogue, the tiers, and the chat doors (flag `insightsHub`)
  clip-formats.js        — video aspect-ratio catalog
  connectors-view.js    — shared pure render helpers for the connectors gallery + detail
  connector-ask.js      — launches the in-chat "Ask a connector" flow (gallery + right panel)
  topic-article.js      — ONE article renderer: the feed's pane, the picker, the in-chat dialog
  topic-flow.js         — Use in chat: mark Used, then a new chat with the Topic as a Source;
                          plus the composer's INLINE picker (startTopicPickerInline)

  # Studios (full-panel takeovers) + newer surfaces (not exhaustive — see docs/reference/FEATURES.md)
  batch-studio.js       — batch-of-posts studio (upload/analyse → review)
  clip-studio.js        — full-screen video clip extraction + editing studio
  top-posts-flow.js / top-posts-store.js — published-posts "winners" board + repurpose entry
  folders-store.js      — save-to-folder store; feedback-store.js — feedback submissions
  languages.js          — language catalog for multilingual Playbooks
  url-services.js       — recognises a service (Notion/Google Docs/…) from a pasted URL
  admin-menu.js         — sidebar cog Admin popover (user mode + feature flags + docs)
  caption-editor.js     — the clip caption editor (word marks, drag handles, presets)
  clip-captions.js      — caption preset catalog + the mock transcript they render
  clip-subtitles.js     — the subtitle-style picker's rendered samples

  screens/
    dashboard.js, session.js, home.js, playbook.js,
    connectors.js, topics.js, topics-settings.js,
    welcome-alt.js, welcome-alt-recap.js
      home.js             — the account home (flag `playbookWorkspace`) AND the Playbooks
                            catalogue, one module, two gated routes (/home + /contexts).
                            Its classes + stylesheet still say `contexts` on purpose.
    home/                 hero.js (prompt + Add + Playbook picker + starters) · lists.js
                          (the catalogue + the Chats tab)
    insights/             /insights (flag `insightsHub`): shell (topbar, clicks, doors) · model ·
                          views (the layout switch) · layouts/{cockpit, mob_index, mob_side} ·
                          read · pieces · charts (Highcharts, vendored)
    _analyse-common.js  — shared "chat bubble + numbered picker bar" wizard primitives
    session/
      intake-lifecycle.js — flips source-intake turns loading→ready as sources process
      thinking-chip.js    — animated "thinking…" composer chip + elapsed/credit counter
      thread-turns.js     — the PURE thread turns (the handoff gallery imports this one)
      thread-render.js    — renderThread + the turns that read a store (extraction, widgets…)
      composer.js         — the composer, its Add menu, the connector chip, the status banner
      draft-questions.js  — language / profile / repurpose / angle / count / video-intake questions
      empty-hero.js       — a new chat's hero + "Fresh topics to review"
      clip-studio-view.js — the Clip Studio's stages and handlers
      batch-studio-view.js — the Batch studio's screen and its replay into a chat
      top-posts-view.js   — the Top posts repurpose screen
      workflow-flow.js    — the "How it works" block both studios share
      wizard-keyboard.js  — keyboard nav (↑↓ / 1–9 / Enter / Esc) for the picker
      clip-draft-flow.js  — "draft from clips" picker (ratio → subtitles → accounts → generate) + clipContext; the only external caller (right-panel) imports THIS, not the whole session screen

  components/             — each exports init() (injects DOM once) + render/open()
    topbar.js             persistent header: route title (rename on session) +
                          Sources / Ideas / Drafts pills + status-card toggle; back on /playbook
    sidebar.js            left rail: brand, New chat, Search, nav (under `playbookWorkspace`:
                          `Playbook`, singular, = the active brand's fiche), footer popmenu
                          (feedback/bug/shortcuts + Admin menu)
    sidebar/              playbook-switcher.js (flag `playbookWorkspace`) · recent-chats.js
                          (Sort & group, rows, pin / rename / delete)
    right-panel.js        sliding panel shell: open / close / resize / URL state + the delegated listeners
    right-panel/          drafts-view.js (Drafts: feed, filters, actions, inline editor) ·
                          sources-view.js · ideas-view.js (Ideas + Clips)
    conversation-status-card.js  floating in-progress card (sources/ideas/drafts counts)
    content-workspace.js  shared Sources+Ideas library layout (search / sort / By Source / All Ideas)
    source-card.js, idea-card.js, idea-card-compact.js, post-card.js, clip-card.js, empty-state.js
    topic-card.js         one Topic: the feed's card, the picker's card, the in-chat row
    starter-card.js       one workflow starter, two hosts: the new chat's hero + the account home
    social-post-card.js   someone ELSE's published post, as evidence (not top-post-card)
    top-post-card.js      MY published post that performed — the Repurpose board's card
    more-menu.js          installMoreMenu(): the shared ⋯ popover on source / idea / clip cards
    dropzone.js           bindDropzone(): a dashed target that really accepts a drop
    tooltip.js            document-delegated [data-tooltip] — no per-screen wiring
    feedback-control.js   the thumbs + reasons row under anything Archie generated
    toast.js              showToast() snackbar (DS .ap-snackbar)
    shortcut-legend.js    ? key dialog
    # Modals (init → open → close, coordinated by modal-coordinator.js):
    add-source-modal.js   Upload / URL / Connectors tabs
    connectors-modal.js   connectors gallery + detail overlay (from composer Add / Sources panel / page)
    topic-picker-modal.js one dialog, two views — the picker's list, and the article
    topic-ignore-modal.js "Why did this Topic miss the mark?" — the reason, kept
    skip-connect-modal.js "Skip connecting an account?" — reassures, then asks why
    topic-history-modal.js the Topic's two-sided trail: the scan's, then the reader's
    video-clips-modal.js (+ video-clips-modal/editor-pane.js), schedule-modal.js
                          (+ schedule-modal-legacy.js behind `newScheduleModal`),
    connect-account-modal.js the network's consent dialog (flag `skipConnectProfiles`)
    objective-modal.js, objective-catalog-panel.js, measure-scope-field.js — Insights' objectives
    bug-report-modal.js, feedback-modal.js, chat-picker-modal.js,
    confirm-modal.js, rename-modal.js, search-modal.js,
    save-folder-modal.js, analyze-profiles-modal.js, fill-document-modal.js,
    share-playbook-modal.js  personal / named colleagues / whole org + owner + change log (flag)
    image-studio-v2/      the Image Studio, split by subject (see FEATURES §7 / §7bis):
                          index (lifecycle) · events · commit · inline-text · prompt-guard ·
                          stage-view (shell) · setup-stage (Generate: options + preview) ·
                          settings-view · references-view · branding-view ·
                          brief-blocks · preview-column ·
                          composer-view (Edit only) · tools-view · edit-view ·
                          interactions · context · type-art / style-art (the 9 drawn option previews)

  modal-coordinator.js    one-overlay-at-a-time: requestOpen / notifyClose / bindOverlayDismissal
```

## Conventions de fichiers

### Composants persistants

Chaque composant exporte `init()` (injection DOM idempotente) + une API de render/open/close. Les listeners DOM sont scopés à la racine du composant et installés une fois dans `init()`.

```js
// Pattern type
let inited = false;
let root;
export function init() {
  if (inited) return;
  inited = true;
  document.body.insertAdjacentHTML("beforeend", `<aside id="myComponent">…</aside>`);
  root = document.getElementById("myComponent");
  root.addEventListener("click", handleDelegatedClick);
  subscribe(render); // store subscription
}
```

### Screens

Chaque screen exporte `renderXxx(params, target)`. Peut retourner une cleanup function appelée par le router à la sortie.

```js
export function renderSession(params, target) {
  const sessionId = params.id;
  target.innerHTML = html`…`;
  const unsubscribe = subscribeThread(sessionId, () => paintThread(sessionId));
  return () => unsubscribe();
}
```

### Modaux

Pattern uniforme :

```js
// pseudo-code
let inited = false,
  dialog,
  lastFocus;
const MODAL_ID = "addSourceModal";

export function init() {
  if (inited) return;
  inited = true;
  document.body.insertAdjacentHTML("beforeend", `<dialog id="${MODAL_ID}">…</dialog>`);
  dialog = document.getElementById(MODAL_ID);
  bindOverlayDismissal(dialog, close);
}

export function open() {
  lastFocus = document.activeElement;
  requestOpen(MODAL_ID, close); // modal-coordinator
  dialog.hidden = false;
  dialog.querySelector("[autofocus]")?.focus();
}

function close() {
  dialog.hidden = true;
  notifyClose(MODAL_ID);
  lastFocus?.focus({ preventScroll: true });
}
```

Voir `src/modal-coordinator.js` pour le pattern global one-overlay-at-a-time.

## Rendering — html\`\` + raw()

`src/utils.js` expose deux tag templates :

```js
import { html, raw, escapeHtml } from "./utils.js";

const safe = html`<div class="card">${userInput}</div>`; // escape par défaut
const wrapped = html`<div>${raw(prerenderedHtml)}</div>`; // n'escape pas raw()
```

**Règle d'or** : ne jamais appeler `escapeHtml()` sur une valeur déjà interpolée dans `html\`\``. Double-escape = bug (cf. la section "HTML rendu en clair" historique).

## Cycle d'import + versioning

Les imports portent un suffixe `?v=N`, et **c'est le même numéro partout** — dans `src/`, dans les `<link>` de `index.html`, et sur le `<script>` d'entrée :

```js
import { sendMessage } from "./assistant.js?v=1004";
```

Le navigateur cache un module par son URL exacte : un store nommé à deux versions devient deux instances (state map + subscribers séparés). Un numéro unique rend la divergence impossible plutôt que simplement déconseillée.

```bash
npm run bump            # N → N+1 partout, en une passe
npm run check:versions  # échoue si un ?v= diverge — le hook pre-commit le lance
```

Ne jamais éditer un `?v=` à la main : `scripts/cache-version.mjs` détient le numéro et couvre aussi les `import("…")` dynamiques, qu'un sed manuel oubliait. Plus de détails dans [`STORES.md#singleton-warning`](STORES.md#singleton-warning).

## Voir aussi

- [`ROUTES.md`](ROUTES.md) — route table + handoffs + URL state
- [`STORES.md`](STORES.md) — patterns d'état + API par store
- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — DS workflow + conventions CSS
- [`GLOSSARY.md`](GLOSSARY.md) — vocabulaire produit + pipeline
- [`../../CLAUDE.md`](../../CLAUDE.md) — guide canonique pour les agents
