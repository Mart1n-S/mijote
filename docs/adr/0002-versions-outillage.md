# ADR 0002 : versions de l'outillage du squelette

- Statut : acceptée
- Date : 29 octobre 2026

## Contexte

L'ADR 0001 a fixé la stack. Restait à en figer les versions au moment de monter
le squelette du monorepo. Trois d'entre elles ne pouvaient pas être prises à la
dernière version stable : les contraintes entre TypeScript, son outillage de
lint et NestJS se recoupent mal à la fin du mois d'octobre 2026.

## Décision

### TypeScript 6.0.3 et non 7.0.2

TypeScript 7.0.2 est la dernière version stable, mais la fenêtre réellement
disponible se réduit à la ligne 6.0 :

- `typescript-eslint` 8.72.1, sa dernière version stable, déclare
  `typescript >=4.8.4 <6.1.0`. TypeScript 7 ne publie pas d'API compilateur
  JavaScript, dont dépendent les règles typées. L'issue 12518 du projet a été
  fermée en « not planned », son mainteneur indiquant qu'il n'y a rien à faire
  tant que TypeScript 7 n'expose pas d'API. Le travail en cours (PR 12803) vise
  les API `typescript/sync` et `typescript/ast` annoncées pour TypeScript 7.1.
- `@nestjs/schematics` 12.0.12 déclare `typescript >=6.0.0`, ce qui écarte
  symétriquement toute la ligne 5.
- Microsoft recommande elle-même TypeScript 6.0 aux outils qui ont besoin d'un
  accès programmatique au compilateur, en attendant la nouvelle API.

La ligne 6.0 est donc la seule qui satisfait les deux bornes, et `6.0.3` en est
la dernière version stable.

L'option du montage côte à côte (TypeScript 7 pour `tsc`, TypeScript 6 pour
l'outillage) a été écartée : deux compilateurs à tenir à jour pour un gain de
vitesse de compilation dont ce projet, à un seul développeur, n'a pas besoin.

### API en ESM

Les paquets de NestJS 12 sont livrés en ESM. Le guide de migration officiel
laisse le choix : une application CommonJS peut les consommer par
`require(esm)` et le rester aussi longtemps qu'elle veut. `apps/api` est
néanmoins écrite en ESM, parce que les projets ESM générés par `nest new`
utilisent Vitest, qui est le lanceur de tests de la stack (ADR 0001), alors que
les projets CommonJS restent sur Jest.

Conséquences, assumées : `"type": "module"` dans le `package.json`, `nodenext`
pour `module` et `moduleResolution`, extension `.js` sur les imports relatifs,
et `import.meta.dirname` au lieu de `__dirname`.

Les décorateurs restent ceux de TypeScript, avec `experimentalDecorators` et
`emitDecoratorMetadata` : c'est encore ce que le guide de migration de NestJS 12
prescrit, les décorateurs standard de TC39 n'étant pas la voie recommandée.

### Vitest sans emitDecoratorMetadata

Vitest transforme les fichiers par Rolldown, qui traduit la syntaxe des
décorateurs mais n'émet pas les métadonnées de `emitDecoratorMetadata`.
L'injection de dépendances de NestJS repose sur ces métadonnées : elle n'est
donc pas disponible dans les tests Vitest.

Conséquence pratique : les tests instancient les classes directement, comme
`new HealthController()`, au lieu de passer par `Test.createTestingModule`.
C'est suffisant pour un contrôleur sans dépendance. Le jour où un test
d'intégration devra vraiment traverser le conteneur, il faudra ajouter
`unplugin-swc` à la configuration Vitest de `apps/api`, ce qui demandera un
accord sur cette dépendance (CLAUDE.md).

### Autres versions figées

PostgreSQL est en 18.6, dernière version de production : la 19 n'était qu'en
version candidate le 15 octobre 2026. `@types/node` suit la ligne 24, celle du
runtime, et non la 26, qui décrirait des API absentes de Node 24.

Les versions sont écrites à l'exact dans les `package.json`, sans accent
circonflexe, conformément au CLAUDE.md.

## Conséquences

- Le socle n'est pas sur la dernière version de TypeScript, et son outillage de
  lint non plus. C'est le prix d'un lint typé qui fonctionne.
- ~~Les règles ESLint typées sont coupées sur `apps/web` : le service de types
  d'ESLint ne lit pas les composants monofichiers sans le greffon TypeScript de
  Vue.~~ **Levé le 29 octobre 2026** : `@vue/typescript-plugin` a été approuvé
  et ajouté, et les règles typées sont actives sur les `.ts` de `apps/web`. Les
  fichiers `.vue` en restent exclus, non par manque de types mais parce que les
  règles s'appliqueraient alors au TypeScript généré derrière le composant, et
  non au composant écrit. `vue-tsc` reste leur vérificateur de types, dans
  `pnpm typecheck` comme dans le build.

## Quand revoir cette décision

Quand les deux conditions suivantes seront réunies :

1. TypeScript 7.1 est stable et expose son API pour l'outillage ;
2. `typescript-eslint` publie une version stable dont la borne supérieure sur
   `typescript` dépasse `6.1.0`.

La vérification tient en une commande :

```bash
npm view typescript-eslint peerDependencies
```

Si la borne a bougé, la migration vers TypeScript 7 se fait en un nouvel ADR, et
il faudra alors revérifier `@nestjs/schematics`, `vue-tsc` et `drizzle-kit`.
