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
- Portées : `api`, `web`, `shared`, `db`, `ci`, `docs`, `ia` (tout ce qui touche `.claude/` : agents, rules, réglages).
- Un commit = un changement cohérent. Pas de commit fourre-tout.
- La description d'une PR est en français, à une exception près : le mot-clé de fermeture s'écrit `Closes #<numéro>`, GitHub ne reconnaissant que les siens, qui sont anglais.
- Exemples : `feat(api): ajoute la création d'invitation`, `fix(web): corrige le focus du dialogue de confirmation`.

## Décisions

Un ADR numéroté sous `docs/adr/` pour une décision coûteuse à défaire, ou qui écarte une alternative qu'on ne veut pas voir reproposer : choix d'outil, de structure, de format, abandon d'une option. Un ADR accepté n'est jamais modifié : une décision qui change donne un nouvel ADR qui remplace l'ancien.

**Cette règle court à partir de la fusion sur `main`.** Un ADR né dans la branche en cours se corrige jusque-là, autant de fois qu'il le faut : la décision est encore en train de se prendre, personne d'autre ne l'a lue, et une relecture qui trouve un trou dans son raisonnement doit pouvoir le combler à sa place. Ce qui est interdit, c'est de réécrire une décision que `main` porte déjà, donc sur laquelle d'autres se sont appuyés. Une fois la branche fusionnée, l'ADR est figé et seul un nouvel ADR le remplace.

Un réglage qui se défait en une ligne n'a pas d'ADR : une règle de lint, une option d'outil, un seuil chiffré se documentent en commentaire dans leur fichier de configuration (ADR 0004).
