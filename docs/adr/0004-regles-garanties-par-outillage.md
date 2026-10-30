# ADR 0004 : une règle mécanique est garantie par l'outillage

- Statut : acceptée
- Date : 30 octobre 2026

## Contexte

Les règles du projet vivent dans `CLAUDE.md` et `.claude/rules/`. Elles y sont
lues par les agents, et par moi. Rien ne garantissait qu'une règle soit
appliquée : elle valait tant qu'un relecteur, humain ou agent, la repérait.

Un banc d'essai l'a montré. La branche `test/code-reviewer` porte six défauts
semés exprès, un par nature, sur un changement qui passe `pnpm lint`,
`pnpm typecheck` et `pnpm test`. Le relecteur a trouvé cinq défauts sur six et
n'a produit aucun faux positif, mais :

- il a manqué le type de retour absent d'une fonction exportée, alors que
  `typescript.md` le demande et qu'il avait le fichier sous les yeux ;
- il a classé un champ de formulaire sans label en « important à confirmer par
  a11y-reviewer », alors que le RGAA 4.1 niveau AA est non négociable ;
- il a mis sept points sur vingt-et-un en bloquant, dont des règles dont
  l'infrastructure n'existe pas encore dans le dépôt.

Un relecteur attentif rate donc une règle mécanique, et hésite sur la gravité
d'une règle non mécanique. Ce ne sont pas les mêmes défauts, et ils ne se
corrigent pas au même endroit.

## Décision

### Trois places, trois rôles

- **L'outillage garantit.** Une règle décidable sans contexte (un type de
  retour absent, un `any`, un champ sans label, une promesse flottante dans un
  fichier typé) est appliquée par ESLint, `tsc`, `vue-tsc`, Vitest ou axe-core,
  en erreur, et vérifiée en CI. Elle n'est plus affaire de vigilance.
- **Les rules font écrire juste du premier coup.** `.claude/rules/` reste la
  référence écrite, y compris pour ce que l'outillage garantit : une règle
  comprise évite l'erreur, l'outillage ne fait que l'attraper.
- **La relecture garde le jugement.** Ce qu'aucune règle ne décide : le
  périmètre, la pertinence d'un test, un commentaire qui affirme faux, une
  donnée personnelle dans un journal, un message de succès affiché à tort.

Conséquence pratique : chaque fois qu'une relecture trouve un défaut mécanique,
on se demande d'abord s'il peut passer dans l'outillage. S'il peut, il y passe,
et la relecture n'a plus à le chercher.

### Premier exemple : les deux garanties du 30 octobre 2026

- `@typescript-eslint/explicit-module-boundary-types` en erreur sur les `.ts`.
- `eslint-plugin-vuejs-accessibility`, figé en 2.6.3, en configuration
  recommandée sur les `.vue`, restreint aux composants : l'entrée sans `files`
  de sa configuration verserait 1200 variables globales de navigateur dans tout
  le dépôt, `apps/api` comprise.

Les deux viennent de défauts que la relecture avait manqués ou sous-évalués sur
le banc d'essai.

### Seuil de l'ADR

Un ADR coûte à écrire et se veut durable. Il est donc réservé à une décision
coûteuse à défaire, ou qui écarte une alternative qu'on ne veut pas voir
reproposer. Un réglage simple, qui se défait en une ligne, se documente là où
il vit : en commentaire dans son fichier de configuration. Une règle de lint,
une option d'outil, un seuil chiffré n'ont pas d'ADR.

Cet ADR-ci n'est pas le réglage, c'est le principe : c'est lui qui est coûteux
à défaire.

## Conséquences

- Ajouter une règle de lint ne demande plus d'ADR, seulement un commentaire qui
  dit pourquoi elle est là, dans `eslint.config.js`.
- `.claude/rules/writing-style.md` est mis à jour en miroir, pour que la
  consigne lue par les agents dise la même chose.
- La relecture par agent reste utile, mais son score n'est plus la mesure de la
  qualité : ce qui descend dans l'outillage sort de son périmètre.
- Le banc d'essai `test/code-reviewer` est conservé en local, non poussé, et
  rejoué à chaque modification du prompt du relecteur. Les passages sont
  consignés dans `docs/outillage-ia.md`.

## Quand revoir cette décision

- Si une garantie d'outillage produit des faux positifs assez nombreux pour
  qu'on prenne l'habitude de la désactiver localement : la règle est mal
  choisie, et c'est elle qu'il faut revoir, pas la désactivation.
- Si un défaut mécanique revient trois fois en relecture sans qu'aucun outil ne
  sache le dire : il faut alors chercher l'outil, ou accepter par écrit qu'il
  reste au jugement.
