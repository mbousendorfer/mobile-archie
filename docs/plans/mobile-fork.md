# mobile-archie — fork mobile de rebel-racoon

## Context

rebel-racoon est un proto desktop : shell en grille 3 colonnes (sidebar 260/56px · contenu · right panel ≥ 610px), `100vh`, ~25 media queries éparses, aucune sous 768px au niveau du shell, des contrôles révélés au survol, un resize de panel à la souris, des raccourcis clavier. On le forke dans `~/sources/mobile-archie` pour en faire une **web app mobile**.

Décisions prises avec toi :

- **Clone local** (historique conservé, pas de remote public).
- **Mobile-only** : tout le CSS vise ≤ 480px ; sur desktop l'app s'affiche dans un cadre de téléphone.
- **Drawer + bottom sheets** (le pattern de ChatGPT / Claude / v0 vu sur Mobbin) : chat plein écran, sidebar en drawer, Drafts/Ideas/Sources en sheet.
- **Tout adapter dans la même passe**, studios compris.

## 0. Fork

```bash
git clone https://github.com/mbousendorfer/rebel-racoon.git ~/sources/mobile-archie
git -C ~/sources/mobile-archie remote rename origin upstream   # lecture seule : pour merger plus tard les évolutions desktop
```

- On supprime `.github/workflows/pages.yml` (pas de remote, donc pas de Pages).
- `CLAUDE.md` du fork : « commit + push sur main » devient « un commit par demande, en local » ; on ajoute un § Mobile (les règles ci-dessous) ; on retire les règles desktop (⌘B, resize, couplage sidebar↔panel).
- Implémentation : dans une session ouverte sur `~/sources/mobile-archie`, pour que son `.claude/launch.json` (serveur `archie`) serve le fork. Les deux repos restent isolés.

## 1. Fondations (un seul endroit, tout le reste en dépend)

- **`index.html`** : viewport `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` ; `theme-color` ; `apple-mobile-web-app-capable` ; un `manifest.webmanifest` minimal (nom, icône Archie, `display: standalone`) pour « Ajouter à l'écran d'accueil ».
- **Cadre téléphone sur desktop, via une iframe et non du CSS.** Un script inline en tête de `index.html` : si `window.top === window && innerWidth >= 768`, on fait `location.replace('frame.html' + location.hash)`. `frame.html` est une page de ~30 lignes : fond `#1E1E1E`, une iframe 390×844 arrondie qui pointe vers `index.html` + le hash. L'iframe donne un vrai viewport de téléphone, donc les `dvh`, les media queries et les `position: fixed` (modales, dropdowns, toasts) se comportent comme sur un téléphone. Un cadre en CSS les ferait sortir du cadre.
- **`100vh` → `100dvh`** partout (grep `100vh` dans `styles/` et `src/modules/image-studio/styles/`).
- **Safe areas** : `env(safe-area-inset-*)` sur la topbar, le composer, les sheets et le drawer.
- **Pas de zoom iOS au focus** : `font-size: 16px` sur les champs (textarea du composer, inputs), dans `ds-patches.css` pour les `.ap-*`.
- **Le tactile d'abord** (dans `base.css`) : `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: contain` sur les zones qui scrollent.
- **Survol** : les révélations au hover (horodatage du chat, ⋮ des lignes de sidebar, crayon de renommage de la topbar, contrôles d'image des posts, actions des cartes Playbook, retrait dans le partage, outils de la modale de planification) deviennent **toujours visibles**, ou passent dans un menu ⋯ quand ça encombre. L'horodatage du chat est masqué.
- **`tooltip.js` / `ref-preview.js`** : on les désactive sous `(hover: none)` (ils se coinceraient au tap) ; le tap d'une ref ouvre sa cible.
- **Raccourcis clavier** : on les retire, ainsi que les hints dans la sidebar et la légende (`shortcut-legend.js`).
- `scripts/dev-server.py` écoute sur `0.0.0.0` pour qu'un vrai téléphone sur le même Wi-Fi ouvre `http://<ip-du-mac>:<port>`.

## 2. Shell — `styles/layout.css`, `sidebar.js`/`.css`, `topbar.js`, `right-panel.js`/`.css`

- **Grille** : une colonne, avec les lignes `topbar 56px + safe-top` / `contenu 1fr`, en `height: 100dvh`. La colonne du right panel et celle de la status card disparaissent.
- **Sidebar → drawer** : `position: fixed`, `width: min(85vw, 320px)`, `translateX(-100%)`, backdrop `.app-modal-backdrop` ; une classe `is-sidebar-open` sur `#appShell`. Le drawer se ferme sur `hashchange`, au tap du backdrop et sur Échap. On supprime le **rail rétracté** (le markup collapsed de `renderSidebar`, `archie-sidebar-collapsed`, ⌘B, `setSidebarCollapsed`).
- **Topbar** : ☰ (ouvre le drawer) · titre (tronqué ; le renommage passe dans le ⋯) · à droite **un** bouton panel avec le compteur de drafts et un `.ap-action-dropdown` ⋯ pour le reste. Les pills Drafts/Ideas/Sources de la topbar disparaissent : on les retrouve dans le sheet.
- **Right panel → bottom sheet plein écran** : `position: fixed; inset: auto 0 0 0; height: calc(100dvh - safe-top - 8px)`, coins supérieurs arrondis, animation de montée. Une poignée et un close en tête, puis les **`.ap-tabs` Drafts · Ideas · Sources** (le sous-onglet Ideas | Clips reste). `?panel=` reste la source de vérité : le **bouton retour du navigateur ferme le sheet**, sans code de plus. On supprime le resize souris, `CHAT_MIN_WIDTH_PX`, `syncSidebarToWidth` et l'auto-rétraction de la sidebar.
  - _ponytail : pas de swipe-to-dismiss au départ ; le retour arrière, le close et Échap suffisent. Un drag de la poignée en pointer events s'ajoute si le test sur téléphone le réclame._
- **Cartes de post** dans le panel : les 500px fixes passent en 100 %, une colonne ; les container queries existantes (800 / 580) gardent leur forme étroite.
- **Status card** (flag `conversationStatusCard`) : un sheet ouvert depuis le ⋯ de la topbar, plus une colonne.
- **Toasts** : pleine largeur, au-dessus du composer (avec la safe-area du bas).

## 3. Modales — `ds-patches.css` + une classe par modale

- **Règle générique** dans `ds-patches.css` (le seul endroit légitime pour toucher `.ap-dialog`) : sheet ancré en bas, `width: 100%`, `max-height: calc(100dvh - safe-top - 16px)`, coins supérieurs seuls, footer collé en bas avec la safe-area. Les CTA restent en largeur auto (règle maison) mais passent sur leur propre ligne, groupés à droite.
- **Modificateur plein écran** `app-dialog--full` (dans `ds-patches.css`), posé dans le markup des grosses modales : schedule, objective, voice-wizard, video-clips, connectors detail, share, Image Studio, add-source.
- Les largeurs fixes internes (`schedule-modal` 380px, `video-clips` 200px, `save-folder` 440, `share` 560) passent en 100 %.
- Les popovers `position: fixed` placés par JS depuis un `rect` : on les borne au viewport (on garde la soustraction du rect de la modale décrite dans la mémoire « fixed popovers in modals »). Les menus longs passent en action sheet du bas.

## 4. Écrans

Pour chacun, le pattern et le fichier CSS concerné :

| Surface                                                                           | Pattern mobile                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session** (`session.css`, `chat.css`, `posts.css`)                              | Le thread pleine largeur avec un padding de 16 ; le composer collé en bas (safe-area) ; la barre « N drafts ready · Review » au-dessus ouvre le sheet. Le hero vide et les starters passent en 1 colonne. Les takeovers (batch studio, sidebar wizard, top-posts picker, inline question) sont déjà dans la colonne : ils deviennent fluides. Le menu Add du composer passe en action sheet. |
| **Home / Contexts** (`home.css`, `contexts.css`)                                  | Hero puis `.ap-tabs` Chats / Playbooks ; la table des chats devient une liste de lignes (titre + méta sur 2 lignes, colonnes masquées) ; la grille de Playbooks passe en 1 colonne.                                                                                                                                                                                                          |
| **Playbook** (`playbook-v2.css`, `playbook-view.js`)                              | Le rail de sections sticky devient des `.ap-tabs` horizontaux scrollables, sticky sous la topbar. Les sections s'empilent ; l'édition inline reste.                                                                                                                                                                                                                                          |
| **Topics** (`topics.css`, `topic-card.css`)                                       | Liste pleine largeur ; ouvrir un Topic **pousse** l'article en plein écran (couche + bouton retour, piloté par le paramètre d'URL existant). Le `@container` du master-detail retombe naturellement sur l'empilement. Filtres : un bouton qui ouvre un sheet avec les trois contrôles groupés. Use in chat / Ignore collés en bas de l'article.                                              |
| **Topics settings**                                                               | 1 colonne.                                                                                                                                                                                                                                                                                                                                                                                   |
| **Insights** (`insights*.css`)                                                    | Le layout **mob_index** (index → détail poussé) par défaut ; cockpit et mob_side retombent sur le même empilement.                                                                                                                                                                                                                                                                           |
| **Connectors**                                                                    | Grille 1 colonne ; le détail en sheet plein écran.                                                                                                                                                                                                                                                                                                                                           |
| **Welcome-alt + recap** (`welcome.css`)                                           | Déjà full-bleed avec des queries à 640 : on vérifie et on complète (grille de profils en 1–2 colonnes).                                                                                                                                                                                                                                                                                      |
| **Schedule modal**                                                                | Plein écran, 1 colonne, résultats d'abord (c'est déjà l'ordre) ; `hover: none` est déjà géré.                                                                                                                                                                                                                                                                                                |
| **Clip studio** (takeover)                                                        | Fluide, upload pleine largeur.                                                                                                                                                                                                                                                                                                                                                               |
| **Video clips modal**                                                             | Grille de clips en 1 colonne ; le pane d'édition **poussé** en plein écran (preview en haut, formulaire dessous, le trim reste en pointer events).                                                                                                                                                                                                                                           |
| **Caption editor** (3 panes)                                                      | Preview vidéo sticky en haut, puis `.ap-tabs` Transcript · Style en dessous.                                                                                                                                                                                                                                                                                                                 |
| **Image Studio** (`imst-*.css`, `image-studio-v2.css`, `image-studio-canvas.css`) | Dialog plein écran ; **canvas en haut (sticky, ~45dvh)**, contrôles qui scrollent dessous ; variations en filmstrip horizontal ; éditeur : canvas pleine largeur + barre d'outils en bas. La route du style-creator suit le même schéma. Le confirm interne n'utilise toujours pas `confirm-modal.js`.                                                                                       |

## 5. Docs du fork

- `docs/reference/PANEL-SIDEBAR-RULES.md` → réécrit pour le drawer et le sheet.
- `DECISIONS.md` : une entrée « Fork mobile » (mobile-only, cadre iframe, drawer + sheets, ce qui a été supprimé).
- `FEATURES.md` / `UI-PATTERNS.md` : les patterns sheet / push / action sheet.
- `README.md` : comment l'ouvrir sur un téléphone.

## Ordre d'exécution (un commit local par étape)

1. Clone + nettoyage (Pages, CLAUDE.md).
2. Fondations (§1) + cadre `frame.html`.
3. Shell : drawer, topbar, sheet (§2).
4. Modales génériques (§3).
5. Session + composer.
6. Home, Playbook, Connectors, Welcome.
7. Topics, Insights.
8. Schedule, clips, caption editor, Image Studio.
9. Docs.

Chaque étape : `npm run bump`, `npm run check:ds`, `npm run check:versions`.

## Vérification

- `preview_start archie` dans le fork, `resize_window` preset `mobile` (375×812), puis chaque route du tableau en mode `returning` et `new-alt`, avec les flags principaux ON (`playbookWorkspace`, `insightsHub`, `connectors`, `conversationStatusCard`).
- Pour chaque écran : pas de scroll horizontal (`document.documentElement.scrollWidth <= innerWidth` via `javascript_tool`), console propre, capture d'écran.
- Parcours de bout en bout : drawer → nouveau chat → ajouter une source → drafts générés → Review (sheet) → retour navigateur qui ferme le sheet → planifier → Image Studio depuis un draft.
- Desktop : `http://localhost:<port>/` redirige vers `frame.html` et l'app tourne dans le cadre.
- Vrai téléphone sur le même Wi-Fi : clavier virtuel (le composer reste visible), safe areas, pas de zoom au focus.
