# App Repas

PWA de planification de repas sur 7 ou 14 jours : recettes HelloFresh, liste de courses par magasin (Picard, Intermarché), prix et valeurs nutritionnelles par repas, suivi des dépenses. V1 sur invitation.

## Références

- `docs/cahier-des-charges.md` : la référence fonctionnelle. Ne le lis pas en entier : va chercher la section utile.
- `docs/lot-0/` : rapports de faisabilité. À lire avant de toucher à une source de données (HelloFresh, Picard, Intermarché, Open Food Facts, Ciqual, tickets).
- `docs/adr/` : décisions d'architecture. Ne repropose jamais une option déjà écartée par un ADR ; une décision qui change donne un nouvel ADR.
- `docs/outillage-ia.md` : agents, rules et outils externes. Tout skill, agent ou outil externe est lu, scanné avec SkillSpector et figé à une version précise avant installation (ADR 0003).

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
| Validation | zod, schémas partagés dans `packages/shared` (ADR 0008)                                            |
| Journaux   | pino par nestjs-pino, au format JSON (ADR 0008)                                                    |
| E-mails    | nodemailer, Mailpit en développement (ADR 0009)                                                    |
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
  outillage-ia.md # agents, rules et outils externes, avec leur version figée
  poste-de-dev.md # outils installés sur la machine, avec leur retrait
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
5. **Proportion** : on corrige ce qui touche un utilisateur réel dans ce qui est livré. Un défaut hypothétique va dans les limites connues, avec sa mesure, et n'ouvre pas d'issue. Une suggestion de relecteur ne devient une issue que si elle est bloquante ou importante.

Pour toute tâche de plus de quelques lignes : présenter le plan et attendre ma validation avant d'écrire du code.

## Règles non négociables

Le détail est dans `.claude/rules/` : `security.md` et `writing-style.md` sont chargées à chaque session, `typescript.md`, `api.md` et `vue-accessibility.md` seulement sur les fichiers qu'elles visent. D'où ce rappel en une ligne, qui reste valable partout.

- **Secrets** : ne jamais lire, afficher ni commiter un `.env` (`security.md`).
- **Données personnelles** : jamais affichées, recopiées ni journalisées ; filtrage par liste blanche dès l'extraction (`security.md`).
- **Sites tiers** : `robots.txt` respecté, arrêt au premier blocage, aucune collecte Intermarché (`security.md`).
- **Accessibilité** : le socle de base, et rien de plus. En résumé, HTML natif avant ARIA, clavier, focus visible, labels, contrastes garantis par les jetons, axe-core en CI ; la liste qui fait foi est celle de `vue-accessibility.md`. Aucune conformité RGAA visée, et un point qui bloque trop peut être abandonné (ADR 0007).
- **Erreurs** : format unique RFC 9457, jamais de trace technique renvoyée au navigateur (`api.md`).
- **Journaux** : JSON, avec identifiant de requête, rien de sensible (`api.md`).
- **Dépendances** : version figée, `pnpm audit` propre, accord avant toute dépendance hors stack (`security.md`).

## Conventions

- **Langue** : documentation, commentaires, commits et rapports en français. Noms dans le code (variables, fonctions, classes, fichiers, tables, colonnes) en anglais.
- **Ponctuation** : jamais de tiret long (—) ni de tiret moyen (–) ; utiliser deux-points, virgules ou parenthèses.
- **Commits** : Conventional Commits en français, à l'impératif présent, en minuscules : `type(portée): description`. Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`. Portées : `api`, `web`, `shared`, `db`, `ci`, `docs`, `ia` (tout ce qui touche `.claude/` : agents, rules, réglages).
- **Branches** : une branche par story, `<type>/<numéro d'issue>-<description-courte>`, créée depuis `main`.
- **Commentaires** : expliquer le pourquoi, pas le quoi ; commenter ce qui n'est pas évident.
- **Git** : proposer les commits ; ne jamais faire `git push` sans demande, jamais `git push --force`, jamais de fusion de PR (c'est moi qui fusionne).
