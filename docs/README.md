# Docs — index

Point d'entrée pour la documentation du proto Archie. **`reference/`, `specs/` et `copy/` décrivent le code courant** et se corrigent dans le même commit que lui. **`audits/` sont des instantanés datés** : ils décrivent le proto à leur date, lire la date avant de se fier à un détail.

> **Pour les agents (Claude Code, Codex, …)** : commencer par [`../CLAUDE.md`](../CLAUDE.md) à la racine. Sa section **« Before you build a feature »** dit quoi lire selon la tâche — et ce n'est pas optionnel : une bonne partie de cette doc existe parce que l'idée inverse a été essayée puis retirée.

---

## 📘 Reference — current truth about the proto

Documentation qui décrit l'état actuel du code. À maintenir à jour quand le code évolue.

| Document                                                                 | Sujet                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [`reference/CONCEPTS.md`](reference/CONCEPTS.md)                         | **Modèle conceptuel** : Playbook, session, contenu, Studios, frontière avec Agorapulse              |
| [`reference/FEATURES.md`](reference/FEATURES.md)                         | **Catalogue fonctionnel** : toutes les features de l'app, leurs flows, états, entrées               |
| [`reference/DECISIONS.md`](reference/DECISIONS.md)                       | **Les arbitrages** derrière le code (partage, scope Playbook, Topic Feed, Image Studio…), en entier |
| [`reference/ARCHITECTURE.md`](reference/ARCHITECTURE.md)                 | Architecture du proto, lifecycle, **arborescence complète**, patterns de fichiers                   |
| [`reference/ROUTES.md`](reference/ROUTES.md)                             | Route table, handoffs cross-routes, URL state hash query                                            |
| [`reference/STORES.md`](reference/STORES.md)                             | Stores : pattern de base, catalogue, persistence, invariants, singleton warning                     |
| [`reference/DESIGN-SYSTEM.md`](reference/DESIGN-SYSTEM.md)               | Workflow DS obligatoire (skill `/design-guidelines`, DS en CDN), tokens, `.ap-*`, `check:ds`        |
| [`reference/UI-PATTERNS.md`](reference/UI-PATTERNS.md)                   | **Usage concret du DS** : `ds-patches`, tokens app, patterns UI, loaders, couleur                   |
| [`reference/PANEL-SIDEBAR-RULES.md`](reference/PANEL-SIDEBAR-RULES.md)   | **Fork mobile** : le drawer (sidebar) et le bottom sheet (right panel) — à lire en premier          |
| [`reference/SHELL-LAYOUT.md`](reference/SHELL-LAYOUT.md)                 | ⚠️ Desktop (rebel-racoon) — remplacé dans le fork ; gardé pour merger l'upstream                    |
| [`reference/SIDEBAR-PANEL-RECIPE.md`](reference/SIDEBAR-PANEL-RECIPE.md) | ⚠️ Desktop (rebel-racoon) — remplacé dans le fork par le drawer + sheet                             |
| [`reference/GLOSSARY.md`](reference/GLOSSARY.md)                         | Vocabulaire produit, pipeline, ambiguïtés (Playbook ↔ Context)                                      |

---

## 📐 Specs — acceptance criteria

Critères d'acceptation écrits **depuis l'app tournante** : chacun dit ce que le lecteur fait et ce qu'il doit voir, donc n'importe qui avec un build peut les passer. Statut : proposés, pas encore validés avec l'engineering.

| Document                                           | Sujet                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`specs/AC-TOPIC-FEED.md`](specs/AC-TOPIC-FEED.md) | **Topic Feed** — la file, l'article, et les deux surfaces in-chat. §0 liste ce qui a changé par rapport à la spec d'origine du fork, et pourquoi |

---

## 🔍 Audits — instantanés datés

| Document                                                                   | Date            | Sujet                                                                                                      |
| -------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| [`audits/PROD-VS-PROTOTYPE.md`](audits/PROD-VS-PROTOTYPE.md)               | 2026-06-04      | Comparaison Studio (prod) ↔ Archie (proto) en 4 dimensions (visuel / fonctionnel / UX-copy / archi)        |
| [`audits/PROD-CHANGES.md`](audits/PROD-CHANGES.md)                         | 2026-06-05      | Plan priorisé des changements à appliquer côté prod pour se rapprocher du proto                            |
| [`audits/ALPHA-FEEDBACK.md`](audits/ALPHA-FEEDBACK.md)                     | 2026-06-10      | Retours des 12 sessions alpha (Mike Allton) : issues numérotées, statut dans le proto, solutions à choisir |
| [`audits/image-studio-integration.md`](audits/image-studio-integration.md) | 2026-09-25 → 28 | L'Image Generator : rapport de phase 0 puis son journal (§9-12 = l'état courant, cf. FEATURES §18)         |

Les trois premiers précèdent le workspace Playbook, le Topic Feed, le partage, Insights et l'Image Generator ; `PROD-VS-PROTOTYPE` décrit encore `/settings`, supprimé depuis.

---

## 🎨 Figma

| Document                                     | Sujet                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`figma-coverage.md`](figma-coverage.md)     | Couverture Figma ⇄ app : ce que le fichier **Archie** couvre, et le backlog de ce qui manque |
| [`figma-sync-map.json`](figma-sync-map.json) | Le mapping technique (fileKey, node-ids, routes, sources) lu par l'agent `figma-sync`        |

---

## ✍️ Copy — UX & voice

| Document                                             | Sujet                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`copy/copy-principles.md`](copy/copy-principles.md) | Voice, tone matrix, glossaire éditorial, patterns par famille de copy, style rules |

---

## 🗺️ Comment naviguer

| Tu cherches…                                                        | Va voir                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Ce qu'est un Playbook, et ce qui n'a rien à y faire                 | [`reference/CONCEPTS.md`](reference/CONCEPTS.md)                         |
| Ce que fait telle feature (flow, états, entrées)                    | [`reference/FEATURES.md`](reference/FEATURES.md)                         |
| Comment fonctionne le proto en général                              | [`reference/ARCHITECTURE.md`](reference/ARCHITECTURE.md)                 |
| Quelles classes/tokens DS l'app utilise en pratique                 | [`reference/UI-PATTERNS.md`](reference/UI-PATTERNS.md)                   |
| Comment ajouter une route / un écran                                | [`reference/ROUTES.md`](reference/ROUTES.md)                             |
| Comment ajouter / modifier un store                                 | [`reference/STORES.md`](reference/STORES.md)                             |
| Comment poser une couleur / un spacing                              | [`reference/DESIGN-SYSTEM.md`](reference/DESIGN-SYSTEM.md)               |
| Comment se comportent le drawer et le panel sheet (fork mobile)     | [`reference/PANEL-SIDEBAR-RULES.md`](reference/PANEL-SIDEBAR-RULES.md)   |
| Recréer le comportement sidebar + right panel de zéro               | [`reference/SIDEBAR-PANEL-RECIPE.md`](reference/SIDEBAR-PANEL-RECIPE.md) |
| Que veut dire "Playbook" / "Context" / "Finding" / "Idea" / "Draft" | [`reference/GLOSSARY.md`](reference/GLOSSARY.md)                         |
| Pourquoi c'est fait comme ça (et ce qu'il ne faut pas reproposer)   | [`reference/DECISIONS.md`](reference/DECISIONS.md)                       |
| Différences entre la prod Studio et le proto                        | [`audits/PROD-VS-PROTOTYPE.md`](audits/PROD-VS-PROTOTYPE.md)             |
| Quels changements appliquer côté prod                               | [`audits/PROD-CHANGES.md`](audits/PROD-CHANGES.md)                       |
| Que dire / pas dire dans les copy                                   | [`copy/copy-principles.md`](copy/copy-principles.md)                     |

---

## ✅ Maintenance

Ce qui se vérifie tout seul (il n'y a pas de suite de tests) :

```bash
npm run check:versions  # un seul ?v= dans tout le graphe — lancé par le hook pre-commit
npm run check:templates # un backtick dans un commentaire HTML blanchit l'app — idem
npm run check:dead      # audit : exports que personne ne nomme + classes CSS jamais émises
npm run check:ds        # chaque token / icône / classe .ap-* résout contre le DS @latest (réseau requis)
```

`check:dead` rapporte, il ne supprime pas : une classe ASSEMBLÉE (`isv2-art--${key}`) est
signalée `[built?]` et bien vivante. C'est l'outil qui a servi à la passe de nettoyage — le
relancer avant d'écrire un nouvel écran évite d'hériter du mort de l'ancien.

- **Quand tu modifies une convention** → mettre à jour à la fois [`CLAUDE.md`](../CLAUDE.md) ET le doc concerné dans `docs/reference/`.
- **Quand tu produis un audit** → poser le doc dans `docs/audits/` avec date + portée en intro. Un audit est un instantané : quand le proto le dépasse, l'indexer comme tel (ou le supprimer — l'historique git suffit), jamais le laisser passer pour l'état courant.
- **Quand tu trouves un doc qui contredit le code** → corriger le doc immédiatement, ou le supprimer s'il n'est pas récupérable. Pas de zone tampon "à jour plus tard".
