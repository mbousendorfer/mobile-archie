# Archie

Interactive prototype for **Archie**, Agorapulse's AI content assistant — Sources → Ideas → Drafts → Schedule. Built on the Agorapulse V2 Design System.

**`mobile-archie` is the mobile-only fork** of [rebel-racoon](https://github.com/mbousendorfer/rebel-racoon) (the desktop proto): a phone web app — chat full screen, the sidebar as a drawer, Drafts / Ideas / Sources as a bottom sheet, every modal a sheet — and a PWA you install on the phone's home screen, which opens offline.

**Live: [https://mbousendorfer.github.io/mobile-archie/](https://mbousendorfer.github.io/mobile-archie/)** — deployed by GitHub Pages on every push to `main` (`.github/workflows/pages.yml`, no build step). The plan: [`docs/plans/mobile-fork.md`](docs/plans/mobile-fork.md); `upstream` (rebel-racoon) is fetch-only.

## Origine

Fork autonome issu d'une branche du projet [probable-spoon](https://github.com/mbousendorfer/probable-spoon), forké le 2026-04-29 (branche `audit/studio-handoff-2026-04-28`). Trajectoires indépendantes depuis.

## Run it

```bash
npm install   # tooling only — the Design System is loaded from jsDelivr
npm start     # runs `npx serve -p 8000` — open http://localhost:8000
```

With Claude Code the dev server auto-launches via `.claude/launch.json`.

### On a desktop

The app opens as itself — no phone frame — so a desktop browser shows the mobile
layout at the window's width. To see it at a phone's size, use the browser's
device emulator (e.g. Chrome DevTools, iPhone 12 Pro).

### On a phone — install it

Open [https://mbousendorfer.github.io/mobile-archie/](https://mbousendorfer.github.io/mobile-archie/) on the phone, then:

- **iPhone (Safari)**: Share → _Add to Home Screen_.
- **Android (Chrome)**: the install prompt, or ⋮ → _Install app_.

It opens standalone (no browser chrome) and, once opened online, works offline:
the service worker (`sw.js`) keeps the app and the Design System in its cache.

### On a phone — against your local server

`scripts/dev-server.py` (the `archie` launch config) listens on every interface.
With the phone on the same Wi-Fi as the Mac:

```bash
ipconfig getifaddr en0
```

then open `http://<that-ip>:<port>` on the phone (the port the server printed).
Over plain http on the LAN the service worker doesn't run (it needs https or
localhost), so the app works but won't install or open offline — use the Pages
URL for that.
Check there what an emulator can't: the virtual keyboard (the composer must stay
visible), the safe areas (notch, home indicator), and that focusing a field
doesn't zoom.

There is no test suite — changes are verified by running the app. What the repo
does check:

```bash
npm run bump            # one cache-bust number across every module + stylesheet
npm run check:versions  # fails if any ?v= disagrees (pre-commit hook runs it)
npm run check:templates # a backtick inside an HTML comment blanks the app
npm run check:dead      # audit: unreferenced exports + CSS classes nothing emits
npm run format          # prettier
```

## Stack

- **Vanilla JS** — no framework, no bundler, ES modules served straight from `src/`.
- **Hash router** — `src/router.js`, route table in `src/app.js`.
- **Agorapulse V2 DS** — `@agorapulse/ui-theme` + `@agorapulse/ui-symbol`, loaded from jsDelivr at `@latest` (`index.html`); `npm run check:ds` verifies every name the app uses resolves against it. UI uses `.ap-*` classes + DS tokens (`--ref-*`, `--sys-*`) — no raw hex or pixel values.
- **Mocks** — `src/mocks/`, one file per domain behind the `src/mocks.js` barrel. Hardcoded, no network, no persistence.

## Routes

| Route                | Screen                                 |
| -------------------- | -------------------------------------- |
| `/`                  | Redirect (first-time → onboarding)     |
| `/session/:id`       | Chat (main surface)                    |
| `/contexts`          | Playbooks library                      |
| `/playbook/:id`      | Playbook detail                        |
| `/connectors`        | Connectors gallery (flag `connectors`) |
| `/topics`            | Topic Feed (flag `topicFeed`)          |
| `/topics/settings`   | Topic Feed listening config (`?pb=`)   |
| `/welcome-alt`       | Onboarding (new user)                  |
| `/welcome-alt/recap` | Onboarding recap                       |

Full route + handoff documentation: [`docs/reference/ROUTES.md`](docs/reference/ROUTES.md). Il n'y a **plus** de route `/settings` : les contrôles Admin (user mode + feature flags) vivent dans le popover ⚙️ de la sidebar.

## Documentation

- **Pour Claude Code et les agents** : [`CLAUDE.md`](CLAUDE.md) — vue d'ensemble, conventions, MCP.
- **Index complet** : [`docs/README.md`](docs/README.md).
- **Toutes les features** : [`docs/reference/FEATURES.md`](docs/reference/FEATURES.md) — catalogue fonctionnel complet.
- **Architecture du proto** : [`docs/reference/`](docs/reference/) — architecture, routes, stores, design system (+ [`UI-PATTERNS.md`](docs/reference/UI-PATTERNS.md)), glossaire.
- **Audits courants** : [`docs/audits/`](docs/audits/) — prod-vs-proto + plan de changements prod.
- **Copy / UX** : [`docs/copy/`](docs/copy/) — principes éditoriaux.
