# Decisions — the arbitrations behind the code

> Moved here from `CLAUDE.md` on 2026-09-30, unchanged in substance, so the agent brief stays short.
> `CLAUDE.md` keeps one line per decision and links here. **These are not background**: each one records
> something that was argued, shipped and in several cases reverted — read the section before touching
> the surface it names, and update it in the same commit when the user overrules it.

## The mobile fork — mobile-only, drawer + sheets, no desktop frame

`mobile-archie` is the mobile-only fork of rebel-racoon (2026-10-15, plan in [`docs/plans/mobile-fork.md`](../plans/mobile-fork.md)). Every surface targets a phone; there is no desktop layout to keep. What was decided, and what went:

- **No desktop frame.** For a day a desktop window was redirected to `frame.html`, the app in a 390×844 iframe. Removed at the user's request (2026-10-15): the PWA on Pages is served as itself on every screen, and a desktop shows the mobile layout wider. Don't reintroduce a frame. `frame.html` survives as a stub that sends a browser still holding the old `index.html` (Pages caches HTML for 10 minutes) back to the app under a fresh URL; and `sw.js` revalidates the HTML (`cache: "no-cache"`) so a deploy is seen on the next open.
- **Drawer + sheets, the ChatGPT / Claude pattern.** The chat is full screen; the sidebar is a drawer (☰); the right panel is a full-height bottom sheet with Drafts · Ideas · Sources tabs, `?panel=` still the source of truth so Back closes it. Rules in [`PANEL-SIDEBAR-RULES.md`](PANEL-SIDEBAR-RULES.md).
- **Modals are sheets**, by one rule in `ds-patches.css` (`:root body .ap-dialog`), plus `app-dialog--full` for the big ones. The dialog keeps a `transform` so it stays the containing block of the popovers placed against its rect.
- **Deeper levels are pushed by URL** — a Topic (`?topic=`), an Insights objective (`?objective=`, Mob · Index now the default layout) — so Back always walks back up.
- **Deleted, not flagged:** the collapsed rail (`archie-sidebar-collapsed`, `setSidebarCollapsed`), ⌘B / ⌘K / ⇧⌘O / `?`, the shortcut legend, every `<kbd>` hint, the panel's mouse resize and its sidebar coupling (`CHAT_MIN_WIDTH_PX`, `syncSidebarToWidth`), the topbar's three pills (they are the sheet's tabs), the click-to-rename title (Rename is in the topbar ⋯), the persisted status-card toggle (`archie-status-card-visible`), the Topic Feed's auto-opened first article, hover reveals (each one is now always visible, or hidden: the turn's time). Tooltips and ref previews are off under `(hover: none)`.
- **A PWA, on GitHub Pages** (2026-10-15, at the user's request — the fork had started local-only): `origin` is github.com/mbousendorfer/mobile-archie, Pages deploys `main`. `manifest.webmanifest` + `sw.js` (offline: network-first HTML, cache-first `?v=N`, stale-while-revalidate for the rest).
- **The pattern audit** (2026-10-15, at the user's request — "des patterns un peu chelous"). What it settled, so it isn't redone: no unlabelled icon row on touch (a draft's seven rail icons became Rewrite · Schedule · ⋯); no tabs inside tabs (Clips is a sheet tab, Drafts' status is a pair of filter chips); a drag handle must drag (the sheet's head swipes down to close); a back and a ☰ never share the topbar (a sub-page shows its back only); a button says what it opens (the topbar's panel button is Drafts, Ideas or Sources); an inline reference is a `<span role="button">`, not a `<button>`, so it wraps with its sentence.
- **Merging upstream:** `upstream` (rebel-racoon) is fetch-only. A desktop change merged in has to be re-checked at 375px — most conflicts will be in `layout.css`, `sidebar.js`, `topbar.js` and `right-panel.js`, which the fork rewrote.

## A settings surface must not aggregate

Three attempts at a general settings page were reverted here: the drawer (`2b0abcf`, the DS ships no side-drawer primitive), a Connectors section (`8cdd7e8`, it duplicated `/connectors`), then `/settings` itself (`6fca0b0`). Config belongs on the entity that owns it (a Playbook's fields live on `/playbook/:id`) or on a route scoped to one feature — never re-hosted in a global page.

## Playbook sharing: the store holds the facts, `playbook-access` holds the rights

Behind the `playbookSharing` flag a Playbook has an owner and one of **three** scopes — `personal`,
`members` (a **fixed** list of colleagues, in `sharedWith`) or `organization` (a **dynamic** list: the whole
org, joiners included). That fixed-vs-dynamic difference is what the two sharing cards say FIRST — the doc
asks twice for it to be underlined. ⚠️ This shipped with two scopes and a "there is no named sharing" note
for two weeks, on an arbitration nobody ever wrote down; the spec has had three states in every version, so
the doc won and the people-picker is real. An **empty `members` list is not shared** — it reaches nobody, and
a manager's whole reach hangs off that predicate.

**Editing and governing are separate rights.** `canEdit` is the owner, full stop: a shared fiche is
read-only for everyone it reaches, managers included. What a manager gets on a **shared** Playbook lives in
`canGovern` — share it, hand it over, delete it — and `canDelete` / `canManageSharing` / `canTransfer` all
derive from that, never from `canEdit`. A manager with a pencil on a colleague's Playbook was the bug this
replaced.

**A Playbook tied to a social profile (`selectedProfileId`) only reaches people who can reach that
profile.** `profileBlockFor()` runs before every other test in `canView`, and the picker keeps a blocked
teammate in the list — disabled, with the reason — because removing the row would leave the owner hunting
for their colleague. The permission is Agorapulse's, so it is read from `org.js` (`profiles` per member) and
never stored on the fiche; an unresolvable profile **fails open**.

`contexts-store` carries `ownerId` / `scope` / `sharedWith` / `history` but **never filters** —
`getContexts()` keeps returning everything to everyone. That is deliberate: a chat whose Playbook stopped
being shared still has to _name_ it ("this chat runs on Brightline · launch, and Jonas Beck stopped sharing
it"), which means reading a fiche you may no longer open. `src/playbook-access.js` is the only gate —
`canView` / `canUse` / `canEdit` / `canGovern` / `canManageSharing`, plus `visibleContexts()` /
`usableContexts()` / `editableContexts()` that surfaces substitute for `getContexts()`, and
`revokedContextFor()` as the one function allowed to look past it. `sharedWith` survives a trip through
private and back, because the doc promises both directions with no data loss — only `scope` decides who is
in. The flag short-circuits in a single place, so flag OFF is byte-for-byte the pre-sharing behaviour.

Ownership is **chrome, never a section**: a tag in the card's metadata corner and beside the fiche's name,
an Owner quick-fact in the rail, and everything else in the Share modal. A "Sharing" section on the fiche
would be the switch grid already removed for the listening config ([`CONCEPTS.md`](CONCEPTS.md) §1, third
storage exception). The degraded chat marks `body.playbook-revoked` — on `<body>`, because the drafts panel
is shell chrome outside `#app` — and one capture-phase listener swallows the generating hooks and says why,
so no card renderer needs to know sharing exists.

## The Image Studio is split by subject, and the engine holds no DOM

`src/image-studio.js` is the state engine: a `Map(key → state)`, every mock, and **no DOM at all**.
The views under `components/image-studio-v2/` hold no state of their own — a mutation notifies and the
whole modal body is re-rendered. That one-way path is what makes the studio safe to change, so the
exceptions are quarantined in **one** file, `inline-text.js`: typing in a text overlay, dragging a
colour or a slider, and toggling outline/shadow all patch the DOM by hand, because a re-render would
lose the caret, replace the input mid-drag, or remount an open popover so it replays its entrance
animation. Nothing else in the studio may skip the render path.

The modules split by **subject**, not by size: `index.js` is the lifecycle, `events.js` every
delegated listener, `commit.js` the paths that write to the draft, `prompt-guard.js` the
confirmation that protects a hand-edited brief, then one view module per surface
(`stage-view`, `setup-stage`, `settings-view`, `references-view`, `branding-view`, `brief-blocks`,
`preview-column`, `composer-view`, `tools-view`, `edit-view`), plus `type-art.js` / `style-art.js`,
the nine drawn option previews.

**The options come first, the brief comes last.** Generate is two halves for the whole loop — the
seven option rows on the left, the image or its placeholder on the right — and **Generate is the
form's submit**, in the footer. There is **no prose prompt field anywhere.** The brief is written AT
generate time (`deriveNow`), not at open, and lives behind an **Advanced** tab beside Options that
stays disabled until an image exists, because what it holds is the prompt that produced the image on
screen rather than a draft of one. Every option rewrites the brief; typing in one of its blocks IS
the takeover, after which an option change flags it stale instead of overwriting, and the guard names
the option it is about to rewrite.

⚠️ **Two earlier arrangements were DELETED, not flagged — don't propose either back.** A _classic_
one landed on a prose brief in a bottom composer with the options pinned to the stage's left edge in
a 284px inspector (`git log -S isv2-panel`), and an _auto-brief_ one made the written brief the hero
of the stage with the options as a bar of popover modifiers under it (`git log -S isv2-bs-mod`). Both
asked the user to face a brief before there was anything to brief about, and keeping three variants
meant three code paths through one engine — `briefIsDerived()`, `isBriefStage()` and
`afterLegacySetting()` existed only to reconcile them. Their flags (`imageStudioAutoBrief`,
`imageStudioSetupFirst`) are gone with them: the surviving studio is the behaviour, not a variant of
it.

⚠️ A confirmation inside the studio must NOT be `confirm-modal.js`: it registers with
`modal-coordinator`, whose `requestOpen` closes the active overlay — the studio — running `exit(KEY)`
and deleting the session. Render it in the studio body from state instead, listen for its keys on
`document` in capture, and pass `bindOverlayDismissal` an `isOpen` that stands down while it's up. Two stylesheets, for the same reason: `image-studio-v2.css` is the shell (`.isv2-*`),
`image-studio-canvas.css` is everything that sits ON the image and must follow a precise pixel
(`.image-studio__*`).

Two naming legacies are deliberate, not oversights: the `image-studio-v2/` directory, the `.isv2-`
prefix and `KEY = "studio-v2"` date from when a second studio was mounted beside this one behind the
`imageStudioV2` flag (both removed). Renaming them would touch two stylesheets and fifteen modules
for something no user can see. Likewise `isv2-sheet-label` / `-hint` / `-switch` were written for
flyout sheets the settings panel replaced — `settings-view.js` carries the disclosure.

⚠️ Four class families are assembled by string concatenation and a rename breaks them silently:
`.image-studio__crop-handle--{nw,ne,se,sw}`, `.image-studio__popover--{kind}`,
`.image-studio__tt-{kind}`, and `.isv2-art--{key}` — now only the grey FALLBACK frame `typeArt()` /
`styleArt()` return for a catalogue key with no drawing.

The nine option previews (three Types, six Styles) are inline SVG — `type-art.js` and `style-art.js`,
one drawing per `IMAGE_TYPES` / `STYLE_PRESETS` key, every colour in CSS as `.ta-*` / `.ta-stop-*`
DS tokens (brand orange on navy for the Types, the user's call over the amber a first pass used).
They replaced CSS-drawn spans: five shapes could only name a geometry, so "Illustration" was a circle,
a square and a triangle. Rules that came out of drawing them: a Type shows a different SUBJECT each
(backlit shot · data poster · flat landscape) while a Style holds ONE subject still and varies the
TREATMENT; there is **one warm disc in the Type row**, the Illustration's sun — a sphere in the hook
and a donut in the chart made three cards read as three sunsets; and `.isv2-option-art--dark` on a
dark drawing turns the radio ring white (`:has()`), the hook, Corporate and Bold Editorial.

## Connectors as live, MCP-queryable sources

**Gated behind the `connectors` feature flag (default OFF)** — when off, every connectors surface (gallery route + sidebar nav, modal, composer Add → "Connected sources" submenu, Sources panel "Live connectors", Add-source modal Connectors tab) is hidden. Turn it on in the sidebar cog's Admin popover. Connector management lives only on the `/connectors` page/modal — nothing else duplicates it.

Connectors (Notion, Slite, Google Drive, GitHub, …) are seeded in `mocks.js` (`connectors` + `connectorDocs`) with `category` / `featured` / `accent` / `capabilities`. Once **connected**, a connector becomes a **live source**: the user "asks" it in chat and `assistant.js` `sendConnectorMessage()` simulates an MCP round-trip — a "Querying … via MCP" reasoning chip listing tool calls, then a cited mock answer. Entry points: the `/connectors` gallery page (clicking a connector opens its detail in `connectors-modal.js`), the composer **Add** menu, and the right-panel **Sources** "Connect" / "Live connectors" surface. `connectors-view.js` holds the shared render helpers used by both the page and the modal; `connector-ask.js` launches the in-chat ask flow. All connect/disconnect goes through `connectors-store` so the gallery, the modal and the composer stay in sync.

## The Topic Feed — the one place Archie proposes instead of waiting

**Gated behind the `topicFeed` feature flag (default OFF)** — when off, `/topics` and `/topics/settings` (a stale deep link bounces to `/`), the sidebar nav row and its unread count, the "Fresh topics to review" list on a new chat and the composer's "Pick from the Topic Feed" all disappear. The data (`mocks.topicFeeds`, `mocks.topics`) rides along regardless, exactly like `multilingualPlaybook`.

Agorapulse listening pulls social posts against **eight sources** declared in `topics-catalog.js`. That file is **CONFIG, not content**: it ships with the app and must exist in `new-alt` mode too, the same split as `ff-catalog.js` vs `mocks.js`. Only `competitor-posts` and `influencer-posts` are `live`, and that is load-bearing — the feed's default source filter derives from `LIVE_SOURCE_IDS`, so a Topic seeded on a non-live source would be filtered out of its own feed on first paint.

Archie assembles those posts into a **Topic**: a headline (the claim), a written analysis in two sections, and the posts behind it. `/topics` is the **queue you triage it in**.

**⚠️ This replaced a Topics MAGAZINE, which was deleted rather than flagged.** The proto had a cross-Playbook magazine — lead story + grid, `ctx.topics` on the Context, a front page on `/` behind `frontPage`, a three-headline rail in the new-chat hero, Start-a-chat / Dismiss. All of it is gone: 8 modules, 5 stylesheets, the `topics` and `frontPage` flags, the Home nav row. Keeping both meant two nav rows carrying the same antenna, two stores and two settings pages — which is what the fork this was ported from actually shipped. Deleting freed the canonical names (`/topics`, `topics-store.js`, `topic-card.js`, `topic-flow.js`), which the port took instead of installing a third vocabulary (`research` / `lane` / `brief`) beside the Playbook ⇄ Context legacy. **Do not propose bringing the magazine or the front page back behind a flag** — that arbitration is closed. A front page may return, but on the Topic Feed's own data. ⚠️ The account home (`/home`, § The Playbook scope) is **not** that page coming back: the front page was a page of what Archie PROPOSES, fed by listening and mounted on `/`; the home is a page of what you HAVE — your Playbooks and your chats. It reads no `topics-store`, renders no Topic, and `/` is still a pure redirect.

## THE INVARIANT: four separate fields, ONE visual vocabulary

`status` (`new` / `used` / `ignored`), `kind` (`ready` / `later`), `isTrending` and `isUpdated` are four fields in `topics-store`. No signal is a fourth status and nothing a reader does writes `kind`.

The reader sees **six states as CHIPS** — To review (chip-less) · Trending · Updated · Already used · For later · Ignored — each a `.ap-tag` pill with its own tone, glyph and word, on the card and the article header. `topicStates(topic)` derives that flat list from the four fields; `TOPIC_STATES` in `topics-catalog.js` is the single declaration. **That is presentation, not a merge** — and the separation is exactly what makes it work: a Topic can be **Already used and Trending** at once and both chips show. Collapsing the fields would let one fact hide another, let a re-scan overwrite the reader's own answer, and break the wire contract (`AC-TRK-6`) that reports the three independently.

**The Filters panel is NOT that six-row list** (it was, and the flat version was reverted — `git log -S renderStateSelect`). It is **three grouped controls**, each one field: **Topics**, a multi-select on `kind` that is **EMPTY at rest — both lanes (To review + For later) show in one list**, and ticking a lane narrows to it (a For-later Topic is told apart in the mixed list by its own blue "For later" chip, not a card change); **Marked as**, a multi-select on the ANSWERED statuses (Already used ticked at rest, Ignored not), added on top of the To-review baseline the list shows; **Sources**. This replaced a one-lane-at-a-time RADIO (`git log -S renderKindRadio`), which replaced tabs above the list — the arbitration is now "read both by default, narrow if you want". **Trending and Updated are not filter rows at all** — a signal is a claim about NOW, not a lane, so it stays a card chip. Dropping them from the filter is what lets the ignored rule fall out for free: the predicate never reads a signal, so one can never resurface an ignored Topic. An ignored Topic shows only when **Ignored** is ticked in Marked as. `defaultFilters` / `matchesFilters` / `narrowedGroupCount` in `topics-store` are the three functions this lives in.

**Triage lives in its own `Map`**, never written onto the Topic: a Topic is what the scan returned (server-owned), a triage row is what _this user_ did with it (user-owned). Keeping them apart is what lets a re-scan replace a Topic without clobbering the answer.

**The Topic's trail is two-sided, for the same reason.** `history` on the Topic is what the scan recorded ("Surfaced from the 16 Jun – 16 Jul Instagram scan"); the triage row's `entries` are what this reader did ("Ignored — not our angle"). `withTriage()` concatenates them on read, seeded first, so the trail reads oldest to newest and neither half can overwrite the other. Writing the reader's entries onto the Topic would put them in the path of the next scan — which is precisely what the separate Map exists to prevent. `unignoreTopic` wipes `entries` alongside `reason`, because that is the path the toast's Undo takes and an undo that leaves a footprint has not undone anything.

An **ignored Topic is never surfaced by a signal, anywhere.** Ticking Ignored in the filter is the only way back. The opposite rule — "a spike is never hidden by triage" — was tried and dropped: it made Ignore a suggestion rather than an answer.

`withTriage()` **clears both signals past the first age group**, because Trending and Updated are claims about _now_ and a card carrying either under a three-weeks-ago separator contradicts itself. Enforced on read, not in the seed, so every surface agrees for free.

## Connecting an account: asked in the flow, never as a prerequisite

Behind `skipConnectProfiles`, nothing is connected to begin with and Playbook creation stops
_requiring_ an account: the step stays, but it is a choice — it offers to connect one (the same
rows and the same modal as in chat) when none is, or the usual profile pick when some are, and
either way it carries a **Skip**. The step count doesn't change; only its obligation does.
Skipping is not a dead end — the ask comes back where it pays for itself, in the chat flows that
draft FOR an account. `requireConnectedProfiles()` in
[`connect-profiles-flow.js`](../../src/connect-profiles-flow.js) is the whole feature: it returns straight
through when anything is connected, so callers wrap unconditionally and the flag-off path is
byte-identical. Otherwise it puts a Quickpicker in the step's own slot, hands the confirm to
[`connect-account-modal.js`](../../src/components/connect-account-modal.js), then calls `onReady` — so the
flow **resumes where it left off** instead of restarting. The rule is coverage, not convenience:
EVERY path that produces a draft asks — `addPostDraft`'s five call sites are the checklist —
draft-from-idea and repurpose (`session/draft-questions.js`), clip drafts (`clip-draft-flow.js`), top
posts inline and in the studio (`top-posts-flow.js`), and the Clip Studio. A batch of posts needs no
gate of its own: it replays its sources through the classic source → idea workflow, which is already
gated.

The Clip Studio is the one that can't use the shared step — it is a full-panel takeover, so a
Quickpicker posted into the thread would be hidden behind it. `renderClipStudioConnect` (session/clip-studio-view.js) renders
the SAME network cards in the studio's own chrome instead, and connecting notifies so the normal
profiles stage takes over. Left alone it was a silent dead end: `finalizeClipStudio` returns early
on an empty account list, so "Create N drafts" sat disabled with nothing explaining why.

Two rules this rests on:

- **The grid asks, the dialog consents** — the product's own two beats. The step is a card grid of
  NETWORKS (glyph, name, "Pages" / "Professional accounts"), laid out like Agorapulse's _Add new
  social profiles_ screen, because that is the real unit: you don't pick from accounts you already
  have, you pick a network and its dialog hands one back. Connecting is an Agorapulse action, not an
  Archie one ([`CONCEPTS.md`](CONCEPTS.md) §6 — the account catalogue belongs to the
  platform). Don't collapse the two into a bare "Connect" button.
- ⚠️ **The cards variant resolves by DESTROYING the picker** (`pick()` deletes the state before
  calling `onPick`). So the dialog must hand control back on cancel — `onDismiss` re-arms the grid.
  Without it, backing out of the dialog leaves the flow with nothing on screen.
- **The Skip is not silent.** Onboarding's Skip (the nothing-connected branch only) opens
  [`skip-connect-modal.js`](../../src/components/skip-connect-modal.js): the three guarantees first, as a
  **trio of three filled tiles** — bold claim + a one-line detail — saying nothing publishes without
  approval, Archie reads only what is already public, and the accounts live in Agorapulse and not in
  Archie ([`CONCEPTS.md`](CONCEPTS.md) §6). A row, not a stack: stacked, it had the
  same silhouette as the checkbox list below it, so nothing said "read this, then answer that" — and
  three equal-weight paragraphs gave the claims no rank. ⚠️ **Three separate tiles, not one filled
  container**: a single grey rectangle holding three columns reads as one BANNER, and the three
  blocks only appear on a second look — the fill and the padding belong to each item, so white
  gutters do the separating. The dialog's 680px and the three-or-one column rule both fall out of one
  measurement (the widest string is 162px); `auto-fit` is banned here because two tiles plus an
  orphan third was invisible as a band and is glaring as separate shapes. Then a
  multi-select "Why not now?". ⚠️ **No margin-top anywhere in this dialog** — `.ap-dialog-content`
  gaps its children by `--ref-spacing-md` and every margin added a second one. ⚠️ **Answering is REQUIRED** here, unlike
  `topic-ignore-modal`'s optional reason: this is the only thing the step gets back, and the user
  meets the dialog once. What keeps that honest is that LEAVING is free — Back, Esc, backdrop and X
  all put the network grid back rather than skipping, so the gate sits on the skip and never on the
  exit. Reasons land in `feedback-store` via `recordReasons` (key `skip:connect-profiles`), the one
  store function that records an answer with no verdict. Skipping the _pick_ of an already-connected
  profile is a different gesture and is NOT intercepted.
- **A step that a dialog hands control back to is put BACK, not asked again.** `askAltProfile` takes
  `{ announce }`, false from both `onDismiss` paths — without it the thread printed its own question
  twice for one step (a pre-existing blemish on the connect dialog's cancel, doubled the day the skip
  dialog became a second caller).
- **`social-profiles.js` now holds state.** A module-level `Set` of connected ids, seeded once from
  the mocks (flag off) or empty (flag on), with `connectAccounts()` writing to it and a notifier so
  every surface agrees. `profileForNetwork()` goes through the SAME gate — otherwise the schedule
  modal and the top-post cards would show a profile nobody connected. `getConnectableAccounts()`
  filters on `handle`, not `status`: the mock's disconnected entries include bare network stubs
  (`{ id: "tt", platformLabel: "TikTok" }`) that have nothing to connect to and would render as
  "undefined" rows.

⚠️ A surface that merely _lists_ profiles is out of scope on purpose — it renders its empty list.
But a surface that makes the user _pick_ one must never render an empty picker: that is a silent
dead end, which is the exact failure this feature removes. Top Posts was gated for that reason after
it was seen doing it.

## The listening config left the Playbook

The magazine kept it as `ctx.topics`. It now lives in `topic-feeds-store.js`, keyed by Playbook: **one feed per Playbook**, provisioned lazily on read (`provisionMissingFeeds`), so a brand new to the app never meets a screen asking it to configure something first — and nothing can _delete_ a feed, since the next read would rebuild it.

Which feeds listen and how often answers "what job should Archie run?", not "who are you?" ([`CONCEPTS.md`](CONCEPTS.md) §1). Data stays per Playbook; only its owner changed. It also buys `websites` — one feed's scan list, which has no place on a fiche whose `websiteUrl` is the brand's canonical address.

## The Playbook scope — `?pb=` by default, a workspace behind `playbookWorkspace`

The fork introduced `active-playbook.js`: a global, `localStorage`-persisted Playbook scope written to by a select sitting in the feed's own filter bar — so a control that promised a page filter silently re-scoped the sidebar, the next new chat and the composer's picker. That version was **deliberately not ported**, on one condition stated at the time: _don't reintroduce a global scope without a permanently visible switcher — a scope that hides is only safe while it is legible._

**Behind `playbookWorkspace` (default OFF), that condition is now met and the scope IS the model.** A Playbook is the level above the work, not a field on it: one is active at all times, chosen from the switcher under the wordmark in the rail, and everything below it belongs to that brand — the chat list, a new chat, the Topic Feed and its count, Insights, the studios' drafts. The six pickers that each asked the question separately (the composer's select, the feed's toolbar select, `/topics/settings`' own, the batch / clip / repurpose selects) are **gone**, not disabled: a greyed-out field restating what the rail prints permanently is chrome the reader has to rule out, and next to a live control it reads as something broken. Every host absorbs the loss on its own (`flex-end` commit rows, `margin-left:auto` on Send), and the Insights title stops being a picker because the rail is the door now. Where a page would otherwise stop naming its brand, an existing **live** control picks the name up — `/topics/settings`' "Open the Playbook" link becomes "Open Acme · Q2 marketing".

**Two levels, and the switcher is the seam.** Inside a workspace every surface is one brand's. The CATALOGUE of brands — and any other brand's fiche opened from it — belongs to the level above, so those routes step out of the shell: `isAccountScope(path)` (same module) drives `body.account-scope`, layout.css hides the rail, and the topbar keeps only the way back in ("‹ Back to Acme · Q2 marketing" from the catalogue, "‹ Back to all playbooks" from a fiche). It is the mechanism `body.onboarding` already used, not a new one. Consequences worth knowing before touching either surface:

- **Insights' page head is the flag's too.** Flag ON, `/insights` drops its brand
  band entirely — the rail names the Playbook one row above the topbar's own
  title, so a band re-printing it spent the top of the page on what the chrome
  already said — and **`Objectives` becomes the page title** (`pageTitle()` in
  the screen's `pieces.js`, at the rung the brand name held). Cockpit's rail
  head takes the same word, since a column of three counts and no noun says
  nothing. Flag OFF the band stays: there, the brand name in it is the app's
  only Playbook switcher.
- **The rail's row is singular.** `Playbooks 8` — a count of every brand, in a rail that promises one — became **`Playbook`** → `/playbook/<active>`: the fiche of the brand you are in, which is both in scope and the frequent destination. The list moved to the switcher's footer ("All playbooks" → `/home`), the only control that announces it changes scope. `workspaceNav()` in sidebar.js does that swap.
- **The wordmark is the account's door.** In workspace mode it opens `/home`; flag OFF there is no level above the work, so it keeps minting a chat — and `[data-sidebar-new]`, which shares its handler branch, keeps that job in both modes.
- **The active brand's own fiche stays IN the workspace** — chrome, the rail row lit. Only cross-brand routes leave. That is the whole rule: the chrome follows the object's scope. Its topbar leads with a back arrow to the catalogue (Playbook 2.0: the DS Top bar pattern's icon back, the title staying in the fiche's own header by exception; flag OFF: "‹ Back to all playbooks"), like every other fiche: a bare `Playbook` title repeated the rail row and the h1 and pointed nowhere (the user's call, 2026-09-30, over the earlier no-crumb rule). Staying in the workspace is the rail's job, not the topbar's.
- **On the home, a Playbook card IS the workspace.** Clicking it switches to that brand and opens a fresh chat in it (`?contextId=`, not `/` — the home is a launcher, so the gesture is "start", not "resume"); the fiche keeps the pen, with the other hover verbs, and the active card reads `Current`. ⚠️ This reversed the opposite arbitration one commit earlier — body opens the fiche, a small `Switch` link carries the scope move — argued from a mis-click's asymmetry. The user's call; what makes it safe is that nothing is lost (the new chat is empty, the crumb goes back, the brand you left is one card away), and the `Switch` link went with it as a second control for what the whole card now does. Flag OFF the card still opens the fiche.
- **`/` is the one definition of "this brand's home"** — a redirect to the most recent chat IN SCOPE, else a fresh one (dashboard.js reads `scopeSessions`). The rail's switcher, the catalogue's Switch and the topbar's way back all navigate there rather than each computing a destination. `/` is the **brand's** home and `/home` the **account's**: two levels, two homes, and neither renders the other's list — `/` still renders nothing at all.
- **A switch re-points the surface it was made from.** From a chat → `/` (above). From the active brand's own fiche → `/playbook/<new id>`: what the reader has open is "this brand's Playbook", not that one brand, so it follows the switch the way `/topics` and Insights follow it. `switchPlaybook()` answers that BEFORE calling `setActivePlaybook` — a moment later the path's id is no longer the active one. Leaving the fiche alone was worse than a stale page: `isAccountScope()` would call it another brand's fiche while `body.account-scope` (only written on a route change) still said workspace, so the rail named one brand above another's sheet. Everywhere else — no brand in the URL — the scope notify repaints in place.

Three rules hold it up:

- **The flag short-circuits in ONE place.** `isWorkspaceMode()` / `playbookForNewWork()` / `scopeSessions()` in [`active-playbook.js`](../../src/active-playbook.js) are what every surface reads — the same arrangement as `playbook-access.js` and `playbookSharing`. Flag OFF is byte-for-byte the per-chat model: `?pb=` on the feed and its settings, `getDefaultContext()` for new work, a selectable composer pill on a fresh chat.
- **A chat still keeps its own Playbook** ([`CONCEPTS.md`](CONCEPTS.md) §2). It inherits the active one at birth and never changes — so switching brand does not rewrite what a chat produced. It also means the chat you are reading can fall outside the new scope, which is why a switch made from `/session/*` lands on that brand's most recent chat (or a fresh one).
- **There is no "All playbooks" inside a workspace, and the account home is unfiltered.** A scope HIDES: anything outside it is invisible rather than empty, so cross-brand views are the price — an "All" row in the rail would turn the guarantee back into a filter. The exception is the one surface whose whole subject is the brands you are NOT in: `/home`, where both its lists are cross-brand — the catalogue the switcher picks from, and every chat with its brand named in a column. `search-modal.js` (⌘K) already read `getSessions()` unscoped, so this makes an existing cross-brand read legible rather than adding one. Opening a chat from there **re-scopes** to that chat's brand, for the same reason `/` exists.

⚠️ Don't re-point a surface at `getDefaultContext()` or add a `?pb=` producer without going through those three functions: two scopes that can disagree is the exact failure this replaced.

## One article, three hosts

`topic-article.js` is the render engine — `renderTopicHeader` + `renderTopicArticle` + `renderTopicActions`, pure functions, no DOM and no listeners, the same shape as `playbook-view.js` and `connectors-view.js`. The feed's pane, the picker's dialog and the in-chat dialog all call it, so there is exactly one article.

The identity is its own renderer because the two hosts **compose** it differently: the pane keeps `renderTopicHeader(topic, {withActions: true})` outside its scroller — title, source and the two verbs, all fixed, and **no Close**: a two-pane reader closes a message by opening the next one, and the list is right there, so a button spent the header's best slot on what the layout already does. Escape closes the pane, wired by the host and removed in teardown. While the dialog renders the same header inline and keeps its verbs in a sticky footer against its bottom edge. Placement is the host's; what the identity and the verbs SAY is not, which is the whole point of rendering both from one place. ⚠️ The pane used to keep only the VERBS up there, with the title below them inside the scroller: the actions had no subject on screen and scrolling took away the line naming what they act on. A second copy for the dialog is how a card and the thing it opens end up saying different sentences about one Topic. `topicTitle()` is the matching rule for titles: the article's own title wins, `headline` is only the fallback for a Topic with no article yet.

`topic-card.js` emits the same object in TWO shapes — the feed's card and the picker's card, identical part for part — both carrying `data-topic-read`, so a host wires them once. The new chat's Fresh-topics grid renders the picker's card too, with `withUse: true` adding the verb on the card face: the body still opens the article, and the button is the second door for a reader who already knows. ⚠️ There was a third shape, `renderTopicRow`, for the hero; six full-width rows ran ~500px and pushed the workflow starters off the fold, so the hero took the card and the shape count went DOWN.

## The master–detail: the list SHRINKS

Non-negotiable, because getting it wrong is what broke this feature on the fork. There the list was pinned at 666px and the pane took the leftover, so under ~1180px of **content** width a container query dropped the article below the list — at 1440px of viewport (a 14" laptop, sidebar included) clicking a card rendered the article 1900px below the fold and nothing appeared to happen. Here the pane is the fixed half — `flex: 0 1 calc(var(--topic-measure) + 2 * var(--ref-spacing-md))`, so exactly the prose measure and never a pixel of dead white space — and the list is `flex: 1 1 0` with a 340px floor, absorbing whatever is left. Side by side survives to 760px of content width. The page cap (1132px) is `calc()`'d from the same two `:root` variables, so it cannot drift from the measure the way the hand-written 1440 did. Below that it stacks and opening an article **scrolls it into view** — arithmetic, not `scrollIntoView()`, whose `nearest` declines to move a pane taller than the scrollport and whose `smooth` loses the race against the next repaint.

The split is measured with a **`@container` query on the row**, never a media query: the sidebar collapses and the right panel overlays, so viewport width never tells you content width.

## Two verbs, and only two

**Use in chat** (`topic-flow.js`) marks the Topic **Used**, then opens a **new** chat with it attached as a Source via `addReadySource` — so Extract ideas, Draft, Ask and the Sources panel all light up with no new plumbing and no special case. The mark lands _before_ the chat opens, in one place, so the three surfaces that navigate (feed card, feed article, hero card) mean the same thing. No echo message and no question picker on arrival: the source-intake card already names the Topic.

**The composer's "Pick from the Topic Feed" is the one INLINE exception** (`startTopicPickerInline`): it runs in the chat the reader is already in, the same shape as "Top performing posts" — one Archie line, then a single-select **widget turn** (`renderTopicsWidget`, radio cards of the feed's draft-ready Topics, newest first, max six), and **Use this topic** marks it Used, attaches it to _this_ chat via the same `attachTopicToChat`, then offers a next-steps Quickpicker (Extract ideas / Draft a post / Ask about it). Every neighbour in the Add menu acts in place; a Topic that opened a second chat was the one item that took the reader away from the chat they had just asked to add to. ⚠️ The dialog's LIST view that used to back this entry point was deleted with it (`git log -S renderListView`) — `topic-picker-modal.js` now opens on the article only.

**Ignore** opens `topic-ignore-modal.js` and asks why. The reason is the only thing a reader ever _tells_ Archie about the listening, and it is what makes the Ignored state readable afterwards — the card prints it back. It is `stroked grey`, not red: ignoring hides a Topic that ticking Ignored brings straight back. Reversible via the toast's Undo, which also **clears the reason**. ⚠️ The fork's "Don't show this again" checkbox is not ported — it turned Ignore into a one-click action with no reason, contradicting the same feature's promise that the reason is kept.

## The DS ports live in ds-patches.css

`.ap-filter-dropdown` is a **transcription of an Angular-only DS component** from its own SCSS — it does not exist in css-ui, so this is the missing-primitive case `ds-patches.css` is for, and the day it lands in the DS the block is a delete. It is the component the DS's own tie-breaker prescribes: grouped options behind a trigger → filter dropdown (not filter chips, which is right for a small flat always-visible set — what the magazine correctly used for its six sources).

⚠️ `.ap-segmented-control` was ported here for `/topics`' two-view switch and was **deleted** from there — it was the wrong component (the product uses TABS for that shape, and only one list was ever on screen). Then the `.ap-tabs` that replaced it went too. The `kind` axis (To review / For later) it carried now lives as the **Topics multi-select** inside the Filters panel — empty by default so both lanes show in one list, ticking a lane to narrow. `git log -S renderTabs` has the tabbed version, `git log -S ap-segmented-control` the one before it, `git log -S renderKindRadio` the one-lane radio between them. Don't re-port a page-level lane switch without a genuine 2–4 co-visible-views case — the select-in-panel is the answer here. The port itself is **back** in `ds-patches.css` (2026-09-29) for a different job, the Image Generator's Variations picker (1 · 2 · 3 · 4): a short set of values, all visible, one picked. That is its use; switching pages or lanes is still tabs.

Every token substitution is commented with the value it stands in for, because the `--sys-color-*-interactive-*` family, `--sys-height-control` and `--sys-radius-inner` are **not published yet** (absent from ui-theme 22.0.17). Re-point them the day they land. ⚠️ The `--selected` double dash is the component's own — the DS wrote it that way against its own flat-modifier convention, and a port that "fixed" it would stop matching what it ports.
