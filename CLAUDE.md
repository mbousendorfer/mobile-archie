# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive prototype for exploring and validating Agorapulse UI redesigns — specifically **Archie**, an AI content assistant (sources → ideas → drafts → schedule). No build step, no bundler — static ES modules served locally. The codebase mixes English (code, UI copy) and French (some comments). Archie speaks in the first person ("I", "Let's") — never third-person "Archie" — in user-facing copy.

## Before you build a feature — read the docs

`docs/` is not background reference: it records decisions that were argued, shipped, and in several cases **reverted**. Designing here without reading it means re-proposing something that was already tried and removed — which is the single most common failure mode on this repo.

**Whenever a request adds, moves, or changes a feature** — a screen, a section, a field, a control, a flow — read these BEFORE proposing anything:

1. **[`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md)** — what each object IS and where its boundary sits. It settles _"which entity does this thing belong to?"_, the question most rejected designs here got wrong.
2. **[`docs/reference/FEATURES.md`](docs/reference/FEATURES.md)** — the § covering the surface you're touching, so you extend what exists instead of building a parallel version beside it.
3. Then the doc for the dimension in play:

| You're touching…                      | Read                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| a Playbook field or section           | [`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1 + [`FEATURES.md`](docs/reference/FEATURES.md) §9           |
| anything in the Topic Feed            | [`FEATURES.md`](docs/reference/FEATURES.md) §17 + [`specs/AC-TOPIC-FEED.md`](docs/specs/AC-TOPIC-FEED.md) |
| any HTML/CSS                          | [`DESIGN-SYSTEM.md`](docs/reference/DESIGN-SYSTEM.md) + [`UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md) |
| a new route or screen                 | [`ROUTES.md`](docs/reference/ROUTES.md) + [`ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md)             |
| state that has to live somewhere      | [`STORES.md`](docs/reference/STORES.md)                                                                   |
| user-facing copy                      | [`copy-principles.md`](docs/copy/copy-principles.md) + [`GLOSSARY.md`](docs/reference/GLOSSARY.md)        |
| sidebar / right-panel sizing behavior | [`PANEL-SIDEBAR-RULES.md`](docs/reference/PANEL-SIDEBAR-RULES.md)                                         |
| Insights / objectives                 | [`FEATURES.md`](docs/reference/FEATURES.md) §19                                                           |
| a surface named in § Decisions        | its section in [`DECISIONS.md`](docs/reference/DECISIONS.md)                                              |

Then say, in the proposal itself: **which object the feature attaches to, and why it belongs there** rather than on a neighbour. If a doc contradicts what you were about to build, the doc wins until the user overrules it — and when the user does overrule it, update the doc in the same commit.

**The three arbitrations that keep coming back** (each already cost a revert):

- **A settings surface must not aggregate** — config lives on the entity that owns it, or on a route scoped to one feature. Never a global settings page ([`DECISIONS.md`](docs/reference/DECISIONS.md#a-settings-surface-must-not-aggregate)).
- **A Playbook is an identity sheet, not a container** — no produced content, no metrics, no operational config ([`CONCEPTS.md`](docs/reference/CONCEPTS.md) §1).
- **Never invent a component, token, or icon the DS already ships** (§ Design System).

## Running the prototype

```bash
npm install   # tooling only (prettier / husky / lint-staged) — the DS comes from the CDN
npm start     # runs `npx serve -p 8000` — open http://localhost:8000
```

With Claude Code the dev server auto-launches via `.claude/launch.json` (server name `archie`, `python3 -m http.server` on an auto-assigned port). There is **no test suite**; verify changes by running the app (see the verify/run skills) and the checks: `npm run check:ds` (every token / icon / `.ap-*` class resolves against the DS the app loads), `check:dead`, `check:versions`, `check:templates`.

## Architecture

**Vanilla JS only** — no build step, no bundler, no framework, no external runtime deps. A hash-based router (`src/router.js`) renders the matched route into `#app` on every `hashchange`. The persistent app shell (sidebar + topbar + right panel) lives outside `#app` and is updated by subscriptions. Each screen, modal, and component owns its own DOM and uses **pure event delegation** with `data-*` attributes.

### App shell

`index.html` is the only HTML entry point. It mounts the shell — `#sidebar`, `#topbar`, `#app`, `#toastRegion` — and loads every stylesheet + `src/app.js`. `app.js` registers the routes, calls each component's `init()` (which injects that component's DOM into `<body>` once), and calls `start()`. The right panel and all modals inject themselves on `init()`.

### Routes (declared in `src/app.js`) — details, chrome levels and URL state in [`ROUTES.md`](docs/reference/ROUTES.md)

| Route                                     | Screen                            | In one line                                                                                          |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/`                                       | `dashboard.js`                    | A redirect and nothing else: the active **brand's** home (most recent chat in scope, else a new one) |
| `/session/:id`                            | `session.js` + `session/`         | The chat surface: thread, composer, per-session flows, the studios                                   |
| `/home`                                   | `home.js` + `home/`               | The **account** home (flag `playbookWorkspace`): hero + Chats / Playbooks tabs; flag OFF → `/`       |
| `/contexts`                               | `home.js`                         | The Playbooks catalogue; in workspace mode it `replace`s to `/home?tab=playbooks`                    |
| `/playbook/:id`                           | `playbook.js`                     | A Playbook's fiche (`?tab=`)                                                                         |
| `/playbook/:id/styles/new`, `…/:styleId`  | `modules/image-studio/`           | The brand's image-style creator                                                                      |
| `/insights` (`/insights/:tab` → redirect) | `insights/shell.js`               | The active Playbook's objectives (flag `insightsHub`)                                                |
| `/connectors`                             | `connectors.js`                   | Connectors gallery; detail in a modal (flag `connectors`)                                            |
| `/topics`, `/topics/settings`             | `topics.js`, `topics-settings.js` | The Topic Feed and its listening config, one Playbook at a time                                      |
| `/welcome-alt`, `/welcome-alt/recap`      | `welcome-alt*.js`                 | First-time onboarding and its recap                                                                  |

There is **no `/settings` route** — it was removed. The prototype Admin controls (user mode + feature flags + docs link) now live in the sidebar footer cog popover (`admin-menu.js`, rendered by `sidebar.js`); the old Social-accounts page was dropped (`social-profiles.js` now holds the connected-account state and the NETWORKS table).

`setAfterRender` (in `app.js`) re-renders the sidebar + conversation-status-card after every route change and toggles the `body.onboarding` full-bleed class for the welcome-alt flow.

> **Vocabulary:** a saved AI context is a **Playbook** (UI label) but the code/store calls it a **Context** (`contexts-store`, `contextId`). Source → Idea → Draft (post) → Schedule is the content pipeline; a **Topic** (`topics-store`) is an optional step upstream of it. `topic` stays banned as a synonym for **Idea** — a Topic is its own object.

### Source layout — the map (full annotated tree: [`ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md#source-layout))

```
src/
  app.js · router.js · url-state.js · handoff.js · utils.js · store-utils.js   — the boot + the primitives
  user-mode.js · feature-flags.js · ff-catalog.js · org.js · active-playbook.js · playbook-access.js
  mocks.js + mocks/        ALL seed data, one file per domain, self-contained
  *-store.js, library.js, assistant.js, sources-stream.js, social-profiles.js   — state (see STORES.md)
  *-flow.js, context-builder.js, inline-question.js, playbook-view.js, topic-article.js …  — orchestrators
  modules/image-studio/    — the Image Generator, self-contained
  screens/                 one module per route; big ones split by subject into a folder:
                           session/ · home/ · insights/
  components/              init() + render/open(); right-panel/ · sidebar/ · video-clips-modal/
  modal-coordinator.js     one overlay at a time
```

### State management

**No external store library.** Stores follow one pattern: a module-level `Map(sessionId → state)` (or a single array for catalogs) plus a `Set<fn>` of subscribers notified shallowly on each mutation, built with `createNotifier()` from `store-utils.js`. State seeds lazily from `mocks.js` on first read — **or stays empty in `new-alt` mode** (`isNewUser()`).

The catalogue — every store, its scope, its full public API — lives in [`STORES.md`](docs/reference/STORES.md#catalogue-des-stores); read it before adding state, and update it in the same commit.

**Per-session** stores: `sources-stream` (sources — `Map(sessionId → Source[])`, per-session subscribers, `clearSession()`), `library`, `posts-store`, `assistant`, `composer-mentions`. That's the model: what a user brings into a chat belongs to that chat ([`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md) §3). **Global** are the catalogs, legitimately — they pre-exist any chat: `contexts`, `connectors`, `folders`, `sessions`, `schedule`, `schedule-presets`, `top-posts`, `topic-feeds`, `topics` — plus `sources-stream`'s **uploads**, a transient pre-source pool the Add-source modal reads as a whole. `library.js` subscribes to sources-stream and re-emits per-session so any session's content surfaces repaint when a source lands. **Almost no persistence** — a few preferences in `localStorage` (user mode, flags, role, the active Playbook, sidebar collapse, Sort & group, the status card, the Insights layout), the `sessionStorage` handoffs, and one real exception: the Image Generator keeps its styles / creations in `localStorage` + IndexedDB. Every key, with its owner: [`STORES.md` § Persistence](docs/reference/STORES.md#persistence). A new key goes in that table.

### Decisions — one line each, the reasoning in [`DECISIONS.md`](docs/reference/DECISIONS.md)

Each of these was argued and several were reverted; read its section before touching the surface.

- **[A settings surface must not aggregate](docs/reference/DECISIONS.md#a-settings-surface-must-not-aggregate)** — three global settings pages were reverted (drawer, Connectors section, `/settings`). Config lives on the entity that owns it or on a route scoped to one feature.
- **[Playbook sharing](docs/reference/DECISIONS.md#playbook-sharing-the-store-holds-the-facts-playbook-access-holds-the-rights)** (flag `playbookSharing`) — three scopes (`personal` / `members` = fixed list / `organization` = dynamic). `contexts-store` never filters; `playbook-access.js` is the only gate. `canEdit` is the owner only; a manager gets `canGovern` (share, hand over, delete), never content. A profile-tied Playbook reaches only people who can reach that profile (fails open). Ownership is chrome, never a section.
- **[The Image Studio is split by subject](docs/reference/DECISIONS.md#the-image-studio-is-split-by-subject-and-the-engine-holds-no-dom)** — `image-studio.js` holds state and no DOM; views re-render; the only DOM-patching exceptions live in `inline-text.js`. Options first, brief last (Advanced tab, written at generate time). ⚠️ The _classic_ and _auto-brief_ arrangements were deleted — don't propose them back. A confirm inside the studio must not be `confirm-modal.js` (it would close the studio). Four class families are built by concatenation — a rename breaks them silently.
- **[Connectors](docs/reference/DECISIONS.md#connectors-as-live-mcp-queryable-sources)** (flag `connectors`) — a connected connector is a live source asked in chat (`sendConnectorMessage`, simulated MCP). Managed only on `/connectors`.
- **[The Topic Feed](docs/reference/DECISIONS.md#the-topic-feed--the-one-place-archie-proposes-instead-of-waiting)** — the triage queue on `/topics`. ⚠️ It replaced a Topics _magazine_, deleted rather than flagged: don't bring the magazine or its front page back. `topics-catalog.js` is CONFIG (ships in `new-alt`); only `competitor-posts` and `influencer-posts` are live, and the default filter derives from them.
- **[Four separate fields, one visual vocabulary](docs/reference/DECISIONS.md#the-invariant-four-separate-fields-one-visual-vocabulary)** — `status` / `kind` / `isTrending` / `isUpdated` stay four fields, shown as six chips. Filters = three grouped controls (Topics lane multi-select empty at rest · Marked as · Sources); signals are never filter rows, so an ignored Topic never resurfaces. Triage lives in its own `Map`; the trail is two-sided.
- **[Connecting an account](docs/reference/DECISIONS.md#connecting-an-account-asked-in-the-flow-never-as-a-prerequisite)** — asked in the flow, never as a prerequisite: `requireConnectedProfiles()` wraps every path that produces a draft, and the flow resumes where it left off. The grid asks, the dialog consents; the Skip is not silent (required reasons, free exit). A picker must never render empty.
- **[The listening config left the Playbook](docs/reference/DECISIONS.md#the-listening-config-left-the-playbook)** — one feed per Playbook in `topic-feeds-store`, provisioned on read, never deletable.
- **[The Playbook scope](docs/reference/DECISIONS.md#the-playbook-scope--pb-by-default-a-workspace-behind-playbookworkspace)** (flag `playbookWorkspace`) — OFF: `?pb=` and a per-chat Playbook. ON: one active Playbook chosen in the rail, everything scoped under it, the six in-flow pickers gone, `/home` the account level (`isAccountScope`). The flag short-circuits in `active-playbook.js` only. A chat keeps its own Playbook. ⚠️ Never re-point a surface at `getDefaultContext()` or add a `?pb=` producer outside those three functions.
- **[One article, three hosts](docs/reference/DECISIONS.md#one-article-three-hosts)** — `topic-article.js` is the single renderer (feed pane, picker dialog, in-chat dialog); `topic-card.js` emits two shapes, no third.
- **[The master–detail: the list shrinks](docs/reference/DECISIONS.md#the-masterdetail-the-list-shrinks)** — the article pane is the fixed half, the list absorbs the rest, split measured by a `@container` query, never a media query.
- **[Two verbs, and only two](docs/reference/DECISIONS.md#two-verbs-and-only-two)** — Use in chat (marks Used, attaches as a Source) and Ignore (asks why, reversible, the reason is kept). The composer's picker is the one inline exception.
- **[The DS ports live in ds-patches.css](docs/reference/DECISIONS.md#the-ds-ports-live-in-ds-patchescss)** — `.ap-filter-dropdown` (and `.ap-segmented-control` for the Image Generator's Variations, `.ap-close-button` for the style creator's image tiles) are transcriptions of Angular-only DS components; their token substitutions are commented and wait for the DS to publish the real names.

### Routing & screen lifecycle

`router.js` re-runs the matched handler on **every** `hashchange` (including query-only changes — it matches on the path with the query stripped). A screen's `render(params, target)` may return a cleanup function that the router invokes before the next render. URL state is encoded as hash query params (`#/session/:id?tab=posts&focusIdea=…`); read it with `parseHashParams()` and mutate with `setHashQuery(path, params)` (calls `navigate()`).

### Cross-screen handoffs

`handoff.js` exposes `setHandoff(key, payload)` / `consumeHandoff(key)` (atomic read+remove) over `sessionStorage` — the one-shot bridge across a navigation. The live keys, who sets and who consumes each: [`ROUTES.md` § Handoffs](docs/reference/ROUTES.md#handoffs-entre-routes). ⚠️ A key that is consumed but never set reads as a live entry point and is dead — add a key only with both ends (`focusObjective` was removed for this on 2026-09-30).

### Admin / user mode (prototype controls)

The **Admin** popover in the sidebar footer cog (`admin-menu.js`) is the prototype control panel: user mode (`user-mode.js` — `"returning"`, populated mocks, default · `"new-alt"`, empty stores + first-time onboarding; `isNewUser()`) and the feature flags (`ff-catalog.js`, read via `isFlagOn()`); each change reloads so stores re-seed. What each flag gates, in full: [`FEATURES.md` §14](docs/reference/FEATURES.md#14-admin-feature-flags--user-modes). One line each:

- `insightsHub` (OFF) — the whole `/insights` section. · `playbookWorkspace` (OFF) — the Playbook as the level above the work (rail switcher, scoped surfaces, `/home`). · `connectors` (OFF) — the whole connectors feature.
- `playbookSharing` (OFF) — ownership, three scopes, governance, the profile gate; its two demo Playbooks and demo chat are seeded **only** under the flag.
- `networkVoices` (OFF) — a base voice + an adaptation per network on the Playbook (`voiceByNetwork`); Archie coaches it by PROPOSING rules (chat card + the Voice tab's tray, `voice-coach-store`), never writing silently. Per-network view on Playbook 2.0.
- `voiceNewSection` (OFF) — a demo: adds a 5th voice part, Hashtags, marked New (orange arc, "1 new part", tab dot), to show how the Voice tab signals a part the product added. The parts come from ONE registry, `VOICE_PARTS` in `network-voice.js`.
- `brandTintedPresets` (OFF) — ready-made style thumbnails in the brand's colours; OFF = Acme's palette everywhere.
- `newScheduleModal` (**ON**) — the redesigned schedule modal; OFF reopens `schedule-modal-legacy.js`, a delete once the comparison ends. · `newConversationStyles` (OFF) — the thread in Figma's « two sides » style (§ E): Archie's butter disc (no name), You + avatar on the right, time on hover, white object chips; a wrap of the rendered turns in `renderTwoSides`. It holds EVERY conversation restyle since Monday 2026-10-05 (before / after): OFF = the Monday thread, its values in `styles/chat-legacy.css` (`body:not(.conv-new)`, class set in `app.js`) + a few `isFlagOn` branches for the Monday markup — delete them all when the flag is baked. · `draftInlineEdit`, `conversationStatusCard`, `multilingualPlaybook` (OFF).

**Removed flags — do not reintroduce as toggles:** `topicFeed`, `playbook2`, `sexySquirrel` (the Image Generator + brand kit, old Image Studio deleted) and `skipConnectProfiles` (all baked ON 2026-10-07), `playbookDefault` (deleted), `statusActionSnackbars`, `playbookColors`, `manyProfiles`, `playbookCompetitors` (baked ON), `imageStudioAutoBrief`, `imageStudioSetupFirst`, `imageStudioV2`, `frontPage`, `topics` (deleted with what they switched).

### Module loading

ES modules with a `?v=N` cache-busting suffix (`from "./assistant.js?v=1213"`). **One number for the whole app** — every module specifier in `src/` and every app stylesheet in `index.html` carries the same `?v=`. The browser caches a module by its exact URL, so a store named at two versions becomes two module instances with split state; a single shared number makes that impossible instead of merely discouraged.

```bash
npm run bump            # N → N+1 across every file, in one pass — run it for ANY js/css change
npm run check:versions  # fails on drift; the pre-commit hook runs it
```

Never hand-edit a `?v=`. `scripts/cache-version.mjs` owns the number (it also covers dynamic `import("…")`, which a hand-bump used to miss), and the pre-commit hook blocks a commit whose versions disagree. The number is only a cache-buster — the server resolves the same file whatever the suffix — so a bump is always behaviour-neutral.

⚠️ **A cached entry point pins the whole old import graph.** After a JS change, verify a _visible_ effect (a removed node, a changed class) in the browser: a CSS-only confirmation proves nothing about the JS.

The **Design System is loaded from jsDelivr at `@latest`** (`index.html`: `@agorapulse/ui-theme` tokens + CSS-UI + Averta, `@agorapulse/ui-symbol` icons) and nothing of it is vendored — the published package is the only source, as the `design-guidelines` skill prescribes. Everything else is local: no other CDN / `esm.sh` import in app code (the bug-report modal lazy-loads html2canvas from cdnjs, the one exception). `package.json` holds tooling only (prettier/husky/lint-staged). The pre-commit hook runs `check-template-comments.py`, `cache-version.mjs check`, and `prettier --write` on staged files.

## Design System — READ FIRST before UI/CSS work

This project is built on the official Agorapulse Design System (`@agorapulse/ui-theme` + `@agorapulse/ui-symbol`, **loaded from jsDelivr `@latest`** — see `index.html`). **Do not invent custom components, tokens, or icons when the DS already provides them.** Regressions from ad-hoc CSS overriding DS tokens are the #1 source of bugs in this repo.

### Required workflow before writing any HTML/CSS

**All DS work goes through the `/design-guidelines` skill** (`mode: html-prototype`) — it reads the specs from the `agorapulse/design` repo and the packages from the CDN, and carries the house rules the specs don't (ink grey-80…100, borders grey-20, blue = interactive, no nested elevation, no uppercase labels, no edge-accent bars, card hover = blue border, CTAs never full width, footers right-grouped). Generic design skills are a review checklist only. **Never the `ds-css` MCP** — it was removed from this repo.

1. **Find the component by intent** (the skill's lookup), then its CSS-UI classes in the CDN's `css-ui/index.css`.
2. **Check the icon exists** in `@agorapulse/ui-symbol@latest/icons/ap-icons.css` — match the full class (`ap-icon-eye` does not exist, `ap-icon-eye-on` does). Use `<i class="ap-icon-{name}"></i>`.
3. **Use DS tokens, not hardcoded values** — every `--ref-*` / `--sys-*` / `--comp-*` must exist in `desktop_variables.css`. Grey steps are `05 · 10 · 20 · 40 · 60 · 80 · 100 · 150` only.
4. **Prefer `--sys-*` over `--ref-*`** when a semantic token exists.
5. **Custom CSS only if nothing in the DS fits** — pick the right file:
   - `styles/ds-patches.css` — the **only** place to extend a DS class with a missing variant or add a primitive the DS forgot (e.g. `.ap-filter-chip`, `.app-modal-backdrop`). It should shrink as the DS evolves.
   - `styles/screens/<screen>.css` — screen-specific styling.
   - `styles/components/<component>.css` — shared component styling.
   - **Never** redeclare a `.ap-*` class with overrides outside `ds-patches.css` — it flips the cascade silently. The one standing exception is `styles/components/archie-loader.css`, which claims `.ap-loader` on purpose: every spinner in the app is replaced by the animated Archie mark, and that is a brand decision, not a missing DS primitive. It says so at the top of the file. Don't add a second exception without the same kind of note.
6. **Validate before committing** — `npm run check:ds`. A name that doesn't exist fails silently (the declaration is dropped, the mask is empty), so this is the only thing that catches it.

### Brand color convention

Per project preference: **orange = AI / spotlight actions** (Ask, Try in chat, primary AI CTA); **blue = routine list-page CTAs** (Connect, Create, navigation). Reuse shared primitives — e.g. filter chips use `.ap-filter-chip` (driven by `aria-pressed`), the same chip the Ideas panel uses.

### DS files (jsDelivr, `@latest` — nothing vendored)

```
@agorapulse/ui-theme@latest/assets/
  desktop_variables.css      — design tokens (--ref-* / --sys-* / --comp-*)
  style/css-ui/font-face.css — Averta font-face (resolves ../../fonts/averta/ on the CDN)
  style/css-ui/index.css     — all .ap-* component classes
@agorapulse/ui-symbol@latest/icons/
  ap-icons.css               — icons (mask-image on <i class="ap-icon-*">)
```

### App styles (in `styles/`)

```
styles/
  tokens.css        — app-only tokens (surface aliases, radius, shadows, chart palette → DS data tokens)
  base.css          — resets, keyframes, the global [hidden] rule, app-wide token groupings
  fonts.css         — the Image Studio's bundled display fonts (local @font-face, OFL)
  layout.css        — app shell (sidebar / topbar / content / panel chrome)
  ds-patches.css    — the only legitimate place to touch .ap-* selectors
  chat.css          — composer + thread chrome
  chat-legacy.css   — the thread as of Monday 2026-10-05, flag newConversationStyles OFF only
  screens/          — analyse, batch-studio, caption-editor, clip-studio, connectors,
                      contexts (the catalogue + the home's page box), home (its hero,
                      tab toolbar and chats table), dashboard, image-studio-canvas,
                      image-studio-v2, insights (+ insights-cockpit / -mob_index /
                      -mob_side / -read, one per layout), modals, playbook-v2, posts,
                      session, topics, topics-settings, welcome
  components/       — add-source-modal, archie-loader, archie-pixels, clip-card, connectors-modal,
                      conversation-status-card, feedback-control, objective-modal,
                      right-panel, schedule-modal (+ schedule-modal-legacy), sidebar,
                      social-post-card, subtitle-style, top-post-card, topic-badge,
                      topic-card, video-clips-modal, workflow-flow
src/modules/image-studio/styles/imst-*.css — the Image Generator's own sheets (linked from index.html)
```

### Token tiers

- `--ref-*` — reference tokens (colors, spacing, fonts, radii) from the DS.
- `--sys-*` — semantic tokens (text/border colors, component states) — prefer these.
- `--comp-*` — component-level tokens — do not use directly in app CSS.

Exception: the `sparklesMermaid` icon uses inline SVG for its gradient fill. Third-party brand colors (connector accents, social logos) live as data in JS, not as DS tokens.

## Key conventions

- `index.html` is HTML markup only — all UI is rendered by JS.
- All seed data lives under `src/mocks/`, one file per domain, re-exported by the `src/mocks.js` barrel — consumers always import from `mocks.js`, never from a domain file. A new domain is a new file plus one `export *` line; it must not read another domain.
- Event wiring is **pure event delegation** with `data-*` attributes on the screen/modal/panel root. No inline `onclick`, no per-child `addEventListener` for interactive elements.
- `?v=N` is ONE number for the whole app: `npm run bump` after any JS/CSS change, never a hand edit (§ Module loading).
- The `html` tagged-template escapes interpolations by default — wrap trusted HTML fragments in `raw()`, and do **not** double-escape (don't call `escapeHtml()` on a value already interpolated into an `html` template).
- One ask = one commit, pushed to `main` (GitHub Pages deploys it); never create branches. Other sessions push to `main` too: fetch before pushing, and merge — never rebase — when behind.

## Docs

All docs (except this file and `README.md`) live under [`docs/`](docs/). Start from [`docs/README.md`](docs/README.md) for the full index. **What to read before designing anything: § Before you build a feature, at the top of this file.**

- [`docs/reference/CONCEPTS.md`](docs/reference/CONCEPTS.md) — **what each object IS**: the Playbook and its hard boundaries, what a session is and what belongs to it, the draft/post/top-post/source-post split, what a Studio is, and where Archie stops and Agorapulse starts. Read before adding a field, a section, or a surface.
- [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md) — **functional catalog of every app feature** (flows, states, entry points). Start here to learn what the app does.
- [`docs/reference/DECISIONS.md`](docs/reference/DECISIONS.md) — **the arbitrations behind the code**, in full (the one-liners in § Decisions above link into it).
- [`docs/reference/UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md) — concrete DS usage (ds-patches inventory, app tokens, UI patterns, the loader system, colour convention).
- [`docs/reference/`](docs/reference/) — current truth about the proto (architecture + the full source tree, routes, stores, design system, glossary, shell sizing).
- [`docs/audits/`](docs/audits/) — dated snapshots (prod vs proto, alpha feedback, the Image Generator integration); read the date before trusting a detail.
- [`docs/copy/`](docs/copy/) — UX copy principles (voice, tone, glossary).
- [`docs/specs/`](docs/specs/) — acceptance criteria, written from the running app. [`AC-TOPIC-FEED.md`](docs/specs/AC-TOPIC-FEED.md) covers the Topic Feed; its §0 lists what this repo deliberately does differently from the spec it was ported from.

## MCP

- `plugin:figma:figma` (when enabled) — design ↔ code: `use_figma`, `get_design_context`, `get_screenshot`, `generate_diagram`, etc.
- A live browser **preview** is available for verification (navigate routes, click, screenshot, read console).
