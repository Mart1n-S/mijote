# ADR 0008 : bibliothèques des erreurs et de la journalisation

- Statut : acceptée
- Date : 1er novembre 2026

## Contexte

La story #8 demande quatre choses que le dépôt n'avait pas : des journaux JSON portant un identifiant de requête de bout en bout, un format d'erreur unique RFC 9457, des erreurs de validation champ par champ, et des tests qui mesurent tout cela tel qu'un client le reçoit.

Rien n'était installé : ni journalisation, ni validation. Le `CLAUDE.md` nomme `pino` dans sa stack, mais pas la façon de le brancher à NestJS.

## Décision

### `nestjs-pino` 5.3.1, avec `pino` 10.4.0 et `pino-http` 11.0.0

Ce qui coûte cher dans « chaque ligne de journal porte l'identifiant de la requête », ce n'est pas pino : c'est le stockage de contexte asynchrone qui permet à un service appelé trois couches plus bas de retrouver la requête en cours. `nestjs-pino` le porte, avec la ligne d'accès par requête et la journalisation de NestJS lui-même redirigée vers pino.

Écartés :

- **pino seul, plus un intergiciel écrit à la main.** C'est réécrire ce stockage de contexte et cette ligne d'accès, sans les tests de l'amont.
- **Le `Logger` de `@nestjs/common`.** Format texte, aucun contexte de requête : il ne répond à aucun des deux critères.

`pino-http` est un pair exigé par `nestjs-pino`, pas un choix séparé. Les trois versions se tiennent : `nestjs-pino` 5.3.1 déclare `@nestjs/core ^11 || ^12`, `pino ^10` et `pino-http ^11`.

### `zod` 4.6.7 pour la validation, plutôt que `class-validator`

Deux raisons, dans cet ordre :

1. **Les schémas se partagent.** Ils vivent dans `packages/shared` et serviront aux formulaires du front, qui doit refuser la même chose que l'API. Un décorateur sur une classe de l'API ne se partage pas.
2. **`class-validator` repose sur les métadonnées de décorateurs**, que Rolldown n'émet pas sous Vitest (ADR 0002). Ses tests ne mesureraient donc pas ce que la production fait, ce qui est le pire défaut qu'un outil de validation puisse avoir.

En prime, une dépendance au lieu de deux (`class-validator` et `class-transformer`).

La locale française de zod est posée par le pipe de validation lui-même, seul endroit du projet qui transforme une erreur de schéma en message lu par un utilisateur.

### `unplugin-swc` 2.0.0 et `@swc/core` 1.16.21, en développement

L'ADR 0002 avait nommé ce jour : « le jour où un test d'intégration devra vraiment traverser le conteneur, il faudra ajouter `unplugin-swc` à la configuration Vitest de `apps/api`, ce qui demandera un accord sur cette dépendance ». C'est ce jour, et l'accord est donné.

swc émet les métadonnées de décorateurs, donc `apps/api/src/app.http.spec.ts` monte l'application réelle, l'écoute sur un port libre et l'interroge avec le `fetch` de Node. Aucun `supertest`, aucun `@nestjs/testing` : le filtre d'erreurs est mesuré là où il compte, c'est-à-dire branché.

**Le script d'installation de `@swc/core` est refusé**, pas autorisé : `pnpm-workspace.yaml` porte `'@swc/core': false` avec sa raison. Son `postinstall` ne fait que vérifier que le binaire natif se charge, et à défaut lance un `npm install` ; le binaire natif arrive par dépendance facultative, donc ce script n'a rien à faire.

### Le contrat d'erreur vit dans `packages/shared`, et se construit

`ProblemDetails` est un schéma zod, et pas seulement un type : l'API le produit, le front le reçoit par le réseau et doit donc le valider avant de s'y fier. Le même schéma garantit les deux côtés.

Conséquence d'outillage : `apps/api` et `apps/web` consomment ce paquet par son `dist`. Le script `prepare` le construit à l'installation, mais **une installation à lockfile gelé et cache à jour saute `prepare`** : la CI construit donc le paquet par une étape explicite, dans ses deux travaux.

### Le front appelle `/api` sur sa propre origine

Le navigateur ne connaît aucune adresse d'API : il appelle `/api`, servi par le mandataire de `vite.config.ts` en développement et en prévisualisation, par le serveur frontal en production. Aucune requête entre origines, donc **aucun CORS à ouvrir dans ce lot** (les en-têtes de sécurité et le CORS restent l'issue #31).

`VITE_API_URL` change donc de rôle : ce n'est plus une adresse lue par le navigateur, mais la cible de ce mandataire, lue dans le `.env` de la racine par la configuration de Vite. Avant cette story, personne ne la lisait.

## Conséquences

- Cinq dépendances de plus, toutes figées à l'exact. `pnpm audit` reste propre, et c'est vérifié en CI à chaque passage.
- Les tests de bout en bout bouchonnent la sonde de santé (`apps/web/e2e/api.ts`) : sans API derrière la construction statique, le bandeau de service s'afficherait sur chaque écran et les mesures de géométrie porteraient sur une page que personne ne verra.
- Après une modification des sources de `packages/shared`, il faut la reconstruire pour que la vérification des types et la construction du front voient le changement : `pnpm --filter @mijote/shared build`. C'est la limite du `dist` partagé, assumée ici plutôt que résolue par des références de projet TypeScript.
- `LOG_LEVEL` entre dans `.env.example`, avec ses valeurs acceptées et ce qu'elle vaut par défaut.
- **Les erreurs journalisées passent par une liste blanche**, comme les requêtes : type, message, code, pile, et la cause sur un seul niveau. Le sérialiseur par défaut de pino recopie toutes les propriétés énumérables, et une erreur de PostgreSQL en porte qui nomment la valeur fautive (`detail`, « Key (email)=(...) already exists »), tandis qu'une erreur de client inactif porte l'objet de connexion entier. Limite qui reste, mesurée : Drizzle place la requête et ses paramètres dans le message de ses erreurs, donc à la première requête portant des données personnelles, il faudra journaliser son `code` et non l'erreur entière.

## Quand revoir cette décision

- Si l'API passe à Fastify : `nestjs-pino` le gère, mais les sérialiseurs et le pose d'en-tête de réponse sont à revérifier.
- Si la validation demande ce que zod n'exprime pas, ou si une bibliothèque de schéma devient le standard de l'écosystème NestJS.
- Si le déploiement sert la PWA et l'API depuis deux origines : il faudra alors du CORS, et l'arbitrage reviendra à l'issue #31.
