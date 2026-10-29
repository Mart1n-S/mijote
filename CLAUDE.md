# App Repas

PWA de planification de repas sur 7 ou 14 jours : recettes HelloFresh, liste de courses par magasin (Picard, Intermarché), prix et valeurs nutritionnelles par repas, suivi des dépenses. V1 sur invitation.

## Références

- `docs/cahier-des-charges.md` : la référence fonctionnelle. Ne le lis pas en entier : va chercher la section utile.
- `docs/lot-0/` : rapports de faisabilité. À lire avant de toucher à une source de données (HelloFresh, Picard, Intermarché, Open Food Facts, Ciqual, tickets).
- `docs/adr/` : décisions d'architecture. Ne repropose jamais une option déjà écartée par un ADR ; une décision qui change donne un nouvel ADR.

## Phase actuelle : lot 1, socle

Objectif (section 13 du cahier des charges) : design system, comptes sur invitation, profil foyer, format d'erreur, journalisation, CI avec axe-core. Aucune fonctionnalité métier (recettes, planning, courses) dans ce lot.

## Stack

| Couche     | Choix                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Langage    | TypeScript strict partout, Node 24                                                                 |
| Monorepo   | pnpm workspaces                                                                                    |
| API        | NestJS                                                                                             |
| Base       | PostgreSQL avec l'extension `pg_trgm`, accès par Drizzle (schéma et migrations versionnés)         |
| Front      | Vue 3, Vite, PWA, Vue Router                                                                       |
| Composants | Reka UI (comportement et ARIA), styles maison à partir de jetons de design (CSS custom properties) |
| Tests      | Vitest (unitaires et intégration), Playwright (bout en bout), axe-core (accessibilité)             |
| Journaux   | pino, au format JSON                                                                               |
| Conteneurs | Docker Compose en développement, homelab en production                                             |

## Structure

```text
apps/
  api/            # NestJS, un module par domaine
  web/            # PWA Vue 3
packages/
  shared/         # types et schémas partagés entre api et web
docs/
  cahier-des-charges.md
  adr/            # décisions d'architecture, numérotées
  lot-0/          # rapports de faisabilité
```

`apps/web` et `apps/api` n'importent jamais l'un de l'autre : tout ce qui est partagé passe par `packages/shared`.

## Commandes

Créées par le squelette, à la racine. Ne pas en inventer d'autres sans les ajouter ici.

```bash
pnpm install          # dépendances
pnpm dev              # api et web en développement
pnpm lint             # ESLint et Prettier en vérification
pnpm typecheck        # vérification des types, tous les paquets
pnpm test             # Vitest
pnpm test:e2e         # Playwright, avec axe-core
pnpm db:migrate       # migrations Drizzle
```

Avant de proposer un commit : `pnpm lint`, `pnpm typecheck` et `pnpm test` doivent passer.

## Façon de travailler

1. **Réfléchir avant de coder** : expliciter les hypothèses ; si la demande est floue, poser la question.
2. **Le plus simple qui marche** : pas de code spéculatif, pas d'abstraction pour un seul usage.
3. **Changements chirurgicaux** : ne toucher que ce qui est demandé, garder le style existant.
4. **Objectif vérifiable** : traduire la tâche en critères testables, boucler jusqu'à ce qu'ils passent.

Pour toute tâche de plus de quelques lignes : présenter le plan et attendre ma validation avant d'écrire du code.

## Règles non négociables

- **Secrets** : ne jamais lire, afficher ni commiter un fichier `.env`. Les variables attendues sont listées dans `.env.example`.
- **Données personnelles** : ne jamais afficher, recopier ni journaliser un nom, une adresse, un e-mail, un téléphone, un numéro de carte de fidélité ou de paiement. Dans le code, les filtrer dès l'extraction (liste blanche de sortie).
- **Sites tiers** : `robots.txt` respecté sans exception, aucun navigateur piloté pour passer une protection, arrêt au premier blocage (captcha, 403, 429). Aucune collecte Intermarché.
- **Accessibilité** : RGAA 4.1 niveau AA. HTML natif avant ARIA, chaque champ a un label visible, tout se fait au clavier, contrastes 4,5:1.
- **Erreurs** : format unique RFC 9457 (Problem Details) pour toute l'API ; jamais de trace technique renvoyée au navigateur.
- **Journaux** : JSON, avec identifiant de requête ; rien de sensible (voir données personnelles, jetons, mots de passe).
- **Dépendances** : version figée, `pnpm audit` propre ; demander avant d'ajouter une dépendance qui n'est pas dans la stack ci-dessus.

## Conventions

- **Langue** : documentation, commentaires, commits et rapports en français. Noms dans le code (variables, fonctions, classes, fichiers, tables, colonnes) en anglais.
- **Ponctuation** : jamais de tiret long (—) ni de tiret moyen (–) ; utiliser deux-points, virgules ou parenthèses.
- **Commits** : Conventional Commits en français, à l'impératif présent, en minuscules : `type(portée): description`. Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`. Portées : `api`, `web`, `shared`, `db`, `ci`, `docs`.
- **Branches** : une branche par story, `<type>/<numéro d'issue>-<description-courte>`, créée depuis `main`.
- **Commentaires** : expliquer le pourquoi, pas le quoi ; commenter ce qui n'est pas évident.
- **Git** : proposer les commits ; ne jamais faire `git push` sans demande, jamais `git push --force`, jamais de fusion de PR (c'est moi qui fusionne).