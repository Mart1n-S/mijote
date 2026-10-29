# ADR 0001 : stack et structure du dépôt

- Statut : acceptée
- Date : 29 octobre 2026

## Contexte

Le lot 0 a validé la faisabilité des sources de données. Le lot 1 pose le socle de l'application : une API, une PWA et des types partagés entre les deux, développés par une seule personne assistée d'agents IA. La correspondance ingrédient vers produit (rapport `docs/lot-0/correspondance.md`) demande du SQL avancé sur PostgreSQL (`pg_trgm`), et l'application vise le RGAA 4.1 niveau AA.

## Options étudiées

| Sujet                        | Options                                                                            | Retenue                    |
| ---------------------------- | ---------------------------------------------------------------------------------- | -------------------------- |
| Organisation du code         | deux dépôts ; monorepo npm workspaces ; monorepo pnpm workspaces                   | pnpm workspaces            |
| ORM                          | Prisma ; Drizzle ; MikroORM ; TypeORM                                              | Drizzle                    |
| Composants d'interface       | tout maison ; Reka UI avec styles maison ; bibliothèque stylée (PrimeVue, Vuetify) | Reka UI avec styles maison |
| Langue des noms dans le code | anglais ; français ; métier en français et technique en anglais                    | anglais                    |

## Décision

- **Monorepo pnpm workspaces** : `apps/api` (NestJS), `apps/web` (Vue 3, Vite, PWA), `packages/shared` (types et schémas partagés). Un seul dépôt garde les types synchronisés entre l'API et le front ; pnpm est rapide et strict sur les dépendances.
- **Drizzle** : proche du SQL et typé, il laisse écrire les requêtes `pg_trgm` sans quitter l'ORM, avec des migrations versionnées lisibles. Prisma est écarté car ces requêtes passeraient en SQL brut ; TypeORM pour sa maintenance et la faiblesse de ses types ; MikroORM, proche de Doctrine, reste une alternative crédible mais apporte une complexité (unit of work) inutile ici.
- **Reka UI avec styles maison** : Reka UI fournit le comportement clavier et ARIA des composants complexes (dialogue, liste déroulante, combobox, menu), qui sont les plus difficiles à rendre accessibles. Le style reste entièrement maison, conforme à la direction visuelle sobre de la section 7 du cahier des charges.
- **Noms en anglais dans le code**, documentation, commentaires et commits en français : cohérent avec les frameworks et les bibliothèques, sans mélange de langues dans un même identifiant.

## Conséquences

- La section 11 du cahier des charges (stack technique) doit mentionner Drizzle et Reka UI.
- Toute dépendance hors de cette stack demande un accord explicite (CLAUDE.md).
- Reka UI ne dispense pas des tests d'accessibilité : axe-core en CI et audit manuel au lecteur d'écran restent obligatoires.
- Les requêtes `pg_trgm` et les index associés seront écrits dans le schéma Drizzle ou en migration SQL versionnée, jamais à la main sur la base.