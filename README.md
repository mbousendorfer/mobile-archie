# Archie

Interactive prototype for **Archie**, Agorapulse's AI content assistant — Sources → Ideas → Drafts → Schedule. Built on the Agorapulse V2 Design System.

**`mobile-archie` is the mobile-only fork** of [rebel-racoon](https://github.com/mbousendorfer/rebel-racoon) (the desktop proto): a phone web app — chat full screen, the sidebar as a drawer, Drafts / Ideas / Sources as a bottom sheet, every modal a sheet. Local only: no GitHub Pages; `upstream` is fetch-only. The plan: [`docs/plans/mobile-fork.md`](docs/plans/mobile-fork.md).

## Origine

Fork autonome issu d'une branche du projet [probable-spoon](https://github.com/mbousendorfer/probable-spoon), forké le 2026-04-29 (branche `audit/studio-handoff-2026-04-28`). Trajectoires indépendantes depuis.

## Run it

```bash
npm install   # tooling only — the Design System is loaded from jsDelivr
npm start     # runs `npx serve -p 8000` — open http://localhost:8000
```

With Claude Code the dev server auto-launches via `.claude/launch.json`.

### On a desktop

Open the server's root: any window 768px wide or more is sent to `frame.html`,
which shows the app in a 390×844 phone frame (an iframe, so the app gets a real
phone viewport). Narrow the window under 768px, or open `index.html` inside a
device emulator, to get it unframed.

### On a phone

`scripts/dev-server.py` (the `archie` launch config) listens on every interface.
With the phone on the same Wi-Fi as the Mac:

```bash
ipconfig getifaddr en0
```

then open `http://<that-ip>:<port>` on the phone (the port the server printed).
Add it to the home screen for the standalone look (`manifest.webmanifest`).
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
