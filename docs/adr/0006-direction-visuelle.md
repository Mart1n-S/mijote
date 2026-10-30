# ADR 0006 : direction visuelle et coloris

- Statut : acceptée
- Date : 30 octobre 2026

## Contexte

La première version du design system (story #7) était posée sur un vert bleuté. Martin l'a écartée : trop proche de l'identité d'une banque. La refonte a été l'occasion de choisir une direction pour de bon, parce qu'un coloris se défait cher une fois que des écrans métier existent.

Le brief était : sobre, élégant, accessible, chaleureux, un peu différent de l'ordinaire, ni excentrique ni futuriste. Piste suggérée sans obligation, l'univers de la cuisine, d'où le nom du projet.

Un skill externe de conseil en design (`frontend-design`, voir `docs/outillage-ia.md`) a servi de garde-fou contre les choix par défaut. Il nomme comme premier tic des interfaces produites par IA la combinaison **fond crème (#F4F1EA), serif à fort contraste en titrage, accent terracotta (#D97757)**. C'est exactement là que « cuisine et tons chauds » atterrit sans y penser.

## Options étudiées

Cinq coloris ont été construits en entier, neutres compris, et comparés sur la même maquette, en clair et en sombre, à 320 px de large. Trois autres ont été construits puis abandonnés sur mesure.

Le critère qui a tranché n'est pas le goût mais **la distance de l'accent aux couleurs d'état**, en dE2000. Un accent qui ressemble à un avertissement ou à une erreur rend l'interface ambiguë, surtout en petit. Au-dessous de 20, deux couleurs restent parentes à l'oeil.

| Coloris                      | Accent clair / sombre | Écart minimal aux états | Retenu |
| ---------------------------- | --------------------- | ----------------------- | ------ |
| Roux de fonte                | `#9a4b16` / `#f0a06a` | **11,7**                | non    |
| Bleu de fonte émaillée       | `#27548f` / `#8fb6e8` | 36,8                    | non    |
| Prune                        | `#6e2a52` / `#dfa0c8` | 20,3                    | non    |
| **Cassis, indigo profond**   | `#44367d` / `#aaa2ea` | **32,4**                | **oui** |
| Poivre, graphite chaud       | `#3f3a34` / `#e0d9ce` | 21,4                    | non    |

Les cinq passaient tous les seuils de contraste dans les deux thèmes : la différence s'est jouée ailleurs.

### Écartés en cours de route, et pourquoi

| Coloris     | Mesure                                                        | Pourquoi c'est rédhibitoire                                                                 |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vert olive  | 14,3 du vert de succès en clair, 16,7 en sombre               | un repère de succès et la couleur de marque se ressembleraient                               |
| Vert sauge  | 10,9 à 13,7 du vert de succès selon la nuance                 | un vert gris est moins saturé, donc **plus** proche du succès, pas moins                     |
| Bordeaux    | 22 en clair, mais 10,9 du rouge d'erreur en sombre            | il s'éclaircit en rose en thème sombre, et s'en éloigner le sortirait du bordeaux            |

**Les deux verts tombent pour une raison de fond : le vert de succès occupe déjà cette partie du spectre.** Un accent vert oblige à choisir entre ressembler au succès et virer au bleu-vert, qui est précisément ce que Martin a écarté au départ. La famille verte est donc fermée tant que le succès reste vert.

## Décision

### Cassis, un indigo profond

Accent `#44367d` en clair, `#aaa2ea` en sombre. Deuxième meilleur jeu d'écarts après le bleu de fonte, et plus sombre que lui : la couleur se fait remarquer sans éclairer la page. C'est aussi le coloris le plus éloigné du terracotta du skill, à 47,8.

Le roux, pourtant le plus proche du brief « cuisine et tons chauds », est écarté par sa propre mesure : son accent est à 11,9 de l'avertissement et 12,9 de l'erreur. Mis côte à côte, l'accent, l'avertissement et l'erreur formaient visiblement une famille.

### Les neutres sont teintés vers l'accent

La section 7 du cahier des charges demande un « fond clair et neutre ». **Cette décision s'en écarte sciemment** : les neutres penchent vers l'indigo (`#fbfbfe`, `#eeeef7`) au lieu d'être gris.

La raison est que la section 7 visait la sobriété, pas la neutralité chromatique pour elle-même, et qu'un gris parfaitement neutre sous un accent coloré donne une impression de gabarit. L'écart reste minime : le fond clair est à 98,5 de clarté L\* pour une saturation C\* de 1,2, donc il lit blanc. C'est une teinte, pas une couleur.

### La structure

Retenue avant le coloris, sur une comparaison séparée : arrondis modestes de 3, 6 et 10 px, ombres discrètes, barre de navigation basse à trait épais, et **l'audace dépensée à un seul endroit par écran**, le chiffre mis en avant, à quoi `--text-display` est réservé.

### Atkinson Hyperlegible Next, hébergée dans le projet

Une seule famille, pas deux. Dessinée par la Braille Institute pour la basse vision : elle différencie `I l 1`, `O 0`, `a e`. C'est un choix motivé par la cible RGAA du projet, pas par son allure, ce qui est aussi ce qui le distingue d'un choix par défaut.

Next plutôt que l'originale : même licence OFL-1.1, mais sept graisses de 200 à 800 au lieu de deux, ce qu'un design system réclame, en un seul fichier variable de 48 ko.

**Fraunces a été envisagée pour les titres et écartée** : Atkinson Next en graisse 800 couvre le titrage, une seconde famille serait de la décoration, et un serif à fort contraste en titrage sur des tons chauds est le premier tic listé par le skill.

La police est servie par l'application. Aucune requête vers Google Fonts ni vers un autre service tiers, ce qu'un test Playwright vérifie sur chaque page.

## Conséquences

- **Le coloris et les familles écartées ne se reproposent pas sans refaire la mesure.** Les chiffres de cet ADR sont reproductibles à partir des valeurs de `tokens.css` et de la formule CIEDE2000.
- La page temporaire qui a servi à comparer les cinq coloris a été supprimée avant la fusion. Son contenu est dans le commit `5b76998`, et ses chiffres sont ici.
- Un accent vert redevient envisageable seulement si la couleur de succès change, ce qui demanderait un nouvel ADR.
- **Le manifeste PWA recopie deux couleurs à la main**, `theme_color` et `background_color` : un manifeste ne lit pas une propriété CSS personnalisée. C'est le seul endroit du projet où une couleur vit hors de `tokens.css`, et toute refonte doit y repasser. La première l'a d'ailleurs oublié.
- La police ajoute 48 ko au paquet livré, que le navigateur ne télécharge qu'au premier texte rendu.
- `docs/design-system.md` porte le détail opérationnel : jetons, ratios mesurés, états, règles d'usage. Cet ADR ne porte que la décision et ce qu'elle écarte.

## Quand revoir cette décision

- Si la couleur de succès cesse d'être verte, la famille verte redevient disponible.
- Si une identité visuelle est commandée à un graphiste, cet ADR est remplacé par un nouveau plutôt que modifié.
- Si Atkinson Hyperlegible Next cesse d'être maintenue, ou si une mesure d'usage montre que sa largeur pénalise les écrans denses du planning.
