# Drawer & panel sheet — règles (fork mobile)

Comment se comportent la **sidebar** et le **right panel** dans `mobile-archie`,
le fork mobile-only de rebel-racoon. Sur téléphone, aucune des deux n'est une
colonne : la sidebar est un **drawer**, le right panel un **bottom sheet**. Le
contenu prend toujours toute la largeur.

> Avant le fork, ce fichier décrivait une grille 3 colonnes (sidebar 260/56px ·
> contenu · panel ≥ 610px), un rail rétracté, ⌘B, un resize du panel à la
> souris et un couplage sidebar ↔ panel. **Tout cela est supprimé** — ne le
> réintroduisez pas. Le plan qui a produit le fork :
> [`docs/plans/mobile-fork.md`](../plans/mobile-fork.md).

Le shell (`styles/layout.css`) est **une colonne** : la topbar (56px + la
safe-area du haut) au-dessus du contenu, sur `100dvh`.

---

## Drawer (la sidebar)

1. **Fermé au repos**, hors écran à gauche (`translateX(-100%)`),
   `width: min(85vw, 320px)`, `inert` tant qu'il est fermé.
2. **Ouverture** : le ☰ de la topbar (`setDrawerOpen(true)`, `sidebar.js`) pose
   `is-sidebar-open` sur `#appShell` et affiche un scrim (`.app-modal-backdrop`).
3. **Fermeture** : toute navigation (`hashchange`), un tap sur le scrim, le ✕ en
   tête du drawer, ou **Échap** (Échap ferme d'abord un menu ouvert du drawer).
4. **Pas d'état rétracté, pas de raccourci**, rien de persisté.
5. **Account scope** (`body.account-scope`, flag `playbookWorkspace`) : pas de
   drawer ni de ☰ — le retour de la topbar ramène dans le workspace.

---

## Panel sheet (le right panel)

6. **Un sheet plein écran** ancré en bas (`position: fixed`,
   `height: calc(100dvh − safe-top − 8px)`, coins hauts arrondis), qui monte à
   l'ouverture.
7. **Sa tête** : la poignée et le close sur une même ligne, puis les `.ap-tabs`
   **Drafts · Ideas · Clips · Sources** avec leurs compteurs (Clips seulement
   s'il y a des clips — ce n'est plus un sous-onglet d'Ideas : un onglet Ideas
   dans un onglet Ideas). Sous les onglets, pas d'autre rangée d'onglets : un
   filtre est une `.ap-filter-chip` (Drafts : All / Needs fixes, à côté du
   select réseau).
8. **Ouverture** : le bouton de la topbar **nomme ce qu'il ouvre** — « Drafts N »
   s'il y a des drafts, sinon « Ideas N », sinon « Sources N ». Les cartes du chat
   (Review, refs, status) ouvrent directement le bon onglet.
9. **`?panel=` est la vérité.** Ouvrir le sheet pousse une entrée d'historique :
   le **retour navigateur le ferme**. Changer d'onglet dans le sheet ouvert
   _remplace_ l'entrée (Back ferme le sheet, il ne rejoue pas les onglets).
10. **Lié à la session** : quitter le chat ferme le sheet. Une action du sheet
    dont le résultat arrive **dans le chat** (Reference, Draft depuis une idée,
    drafter des clips, interroger un connecteur) **ferme le sheet** après
    s'être exécutée (`CHAT_BOUND_ACTIONS`, `right-panel.js`) — sinon le sheet
    cache ce qu'elle vient de produire.
11. **Fermeture** : tirer la tête vers le bas (au-delà de 96px, sinon le sheet
    revient — `bindSheetDrag`, événements pointeur), le close, Back, ou Échap.
    La poignée tient donc sa promesse.

---

## Status card (flag `conversationStatusCard`)

12. Un **sheet** ancré en bas, ouvert depuis le ⋯ de la topbar (« Chat
    status »). Fermé par défaut, non persisté ; il se ferme quand une de ses
    lignes ouvre le panel, et quand on quitte le chat.

---

## Ce qui en découle pour une nouvelle surface

- Un menu long → **action sheet** du bas (le menu Add du composer, les Filters
  du Topic Feed).
- Un niveau de lecture plus profond → **poussé** en plein écran avec un retour
  dans la topbar, piloté par un paramètre d'URL (un Topic `?topic=`, un objectif
  Insights `?objective=`).
- Une modale → la règle sheet de `ds-patches.css` (et `app-dialog--full` pour
  les grosses). Voir [`UI-PATTERNS.md`](UI-PATTERNS.md) § Mobile.
