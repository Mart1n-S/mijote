# Mijote

PWA de planification de repas sur 7 ou 14 jours : recettes, liste de courses par
magasin, prix et valeurs nutritionnelles par repas, suivi des dépenses.

La référence fonctionnelle est `docs/cahier-des-charges.md`, les décisions
d'architecture sont dans `docs/adr/`, et les consignes de travail dans
`CLAUDE.md`.

## Structure

| Dossier            | Contenu                                      |
| ------------------ | -------------------------------------------- |
| `apps/api`         | API NestJS, PostgreSQL par Drizzle           |
| `apps/web`         | PWA Vue 3 et Vite                            |
| `packages/shared`  | types et schémas partagés entre api et web   |
| `docs/`            | cahier des charges, ADR, rapports du lot 0   |

## Démarrer

Il faut Node 24 (version exacte dans `.nvmrc`), pnpm et Docker. Les outils
installés sur le poste sont listés dans `docs/poste-de-dev.md`.

```bash
cp .env.example .env     # puis renseigner les valeurs
docker compose up -d     # PostgreSQL de développement
pnpm install
pnpm db:migrate
pnpm dev
```

L'API écoute sur le port `API_PORT` (3000 par défaut) et expose `GET /health`.
La PWA est servie par Vite sur le port 5173.

## Premier administrateur

L'application est privée et l'inscription passe par invitation : il faut donc
créer le premier compte à la main. La commande demande le nom du foyer,
l'adresse e-mail et le mot de passe, qui se saisit sans écho :

```bash
pnpm admin:create
```

Elle doit tourner dans un terminal : le mot de passe ne se passe ni en
argument, ni par un tube, pour qu'il ne reste ni dans l'historique du shell ni
dans la liste des processus. Il fait au moins 12 caractères.

Une fois le compte créé, la connexion se fait sur `/connexion`.

## Commandes

```bash
pnpm dev              # api et web en développement
pnpm lint             # ESLint et Prettier en vérification
pnpm typecheck        # vérification des types, tous les paquets
pnpm test             # Vitest
pnpm test:e2e         # Playwright, avec axe-core
pnpm db:migrate       # migrations Drizzle
pnpm admin:create     # crée le premier administrateur, dans un terminal
```

`pnpm lint`, `pnpm typecheck` et `pnpm test` doivent passer avant tout commit.
