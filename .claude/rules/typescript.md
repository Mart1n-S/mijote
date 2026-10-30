---
paths:
  - "**/*.ts"
  - "**/*.vue"
---

# TypeScript

- Jamais de `any`. Utiliser `unknown`, puis un garde de type ou une validation avant usage.
- Pas d'assertion non nulle (`!`) ni de `as` pour faire taire le compilateur : corriger le type. Une exception se justifie dans un commentaire.
- Les fonctions exportées ont un type de retour explicite.
- Toute promesse est attendue (`await`) ou explicitement ignorée (`void`) avec un commentaire qui dit pourquoi.
- Les erreurs ne sont jamais avalées : un `catch` vide est interdit. On relance, on transforme en erreur métier, ou on journalise avec le contexte.
- Les types partagés entre `apps/api` et `apps/web` vivent dans `packages/shared`. `apps/api` et `apps/web` ne s'importent jamais l'un l'autre.
- `apps/api` est en ESM : les imports relatifs portent l'extension `.js`, et on utilise `import.meta.dirname` au lieu de `__dirname`.
- Les montants sont des entiers en centimes, jamais des nombres à virgule. Les dates circulent au format ISO 8601, en UTC.
- Préférer des fonctions petites et nommées pour ce qu'elles font, plutôt que des commentaires qui expliquent un bloc.
