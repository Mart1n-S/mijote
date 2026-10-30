# Style d'écriture

- Documentation, commentaires, messages de commit, descriptions de PR et rapports : en français.
- Noms dans le code (variables, fonctions, classes, fichiers, tables, colonnes, routes) : en anglais.
- Jamais de tiret long (—) ni de tiret moyen (–). Utiliser deux-points, virgules ou parenthèses.
- Phrases courtes, mots simples, pas d'emoji. Un paragraphe dit une chose.
- Un commentaire explique le pourquoi, pas le quoi. Pas de commentaire qui paraphrase le code.

## Commits

Format Conventional Commits, en français, à l'impératif présent, en minuscules :

```text
type(portée): description
```

- Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.
- Portées : `api`, `web`, `shared`, `db`, `ci`, `docs`.
- Un commit = un changement cohérent. Pas de commit fourre-tout.
- Exemples : `feat(api): ajoute la création d'invitation`, `fix(web): corrige le focus du dialogue de confirmation`.

## Décisions

Une décision d'architecture (choix d'outil, de structure, de format, abandon d'une option) s'écrit dans un ADR numéroté sous `docs/adr/`. Un ADR accepté n'est jamais modifié : une décision qui change donne un nouvel ADR qui remplace l'ancien.
