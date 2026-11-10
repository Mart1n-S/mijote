# ADR 0016 : le profil du foyer, ses listes fermées et ses données de santé

- Statut : acceptée
- Date : 10 novembre 2026

## Contexte

La story #14 remplit le foyer : nombre de personnes, contraintes alimentaires, allergènes, ingrédients exclus, objectif, budget mensuel, temps par repas, et équilibre entre variété et réutilisation. Le planning des lots suivants s'y adapte, et ces réglages se proposent au premier lancement puis se modifient au profil.

Deux choses rendent cette story différente des précédentes. La première est traitée par l'ADR 0015 : c'est la première donnée qui appartient à un foyer. La seconde est ici : **ce sont les premières données de santé du projet.** Une allergie, une intolérance, un régime, et même une liste d'ingrédients exclus disent quelque chose de la santé de quelqu'un, et le RGPD les traite à part (article 9). L'issue #14 le dit dans ses propres mots : la saisie est facultative, une phrase dit à quoi elles servent, et elles n'apparaissent jamais dans les journaux.

Rien n'est encore collecté des recettes (lot 2), donc le vocabulaire d'allergènes de HelloFresh n'est pas disponible comme source : `docs/lot-0/hellofresh.md` le relève sur un échantillon de vingt recettes et le donne pour fermé, ce qui est une promesse pour le lot 2, pas une liste utilisable aujourd'hui.

## Décision

### Des colonnes sur `household`, et pas une table de profil

Le profil est du un pour un avec le foyer : ce sont des colonnes de plus sur `household`, nullables, plus une date de premier lancement.

Écarté : **une table `household_profile`**. Elle isolerait les champs de santé dans leur propre table, ce qui est un argument sérieux, mais elle ajouterait une jointure, un chemin de création à tenir et une ligne qui peut manquer. Et l'argument tombe de lui-même : les dépôts du projet sélectionnent des colonnes nommées une par une, jamais `select *`, donc une requête qui ne veut que le nom du foyer ne lit pas les champs de santé. La discipline existe déjà, elle n'a pas besoin d'une table pour être tenue.

| Champ | Type | Bornes | Nul autorisé |
| --- | --- | --- | --- |
| `name` | texte | 1 à 60 caractères | non, défaut « Mon foyer » |
| `people_count` | entier | 1 à 35 | oui |
| `goal` | `household_goal` | economy, balance, speed, mix | oui |
| `monthly_budget_cents` | entier | 100 à 1 000 000 | oui |
| `max_meal_minutes` | entier | 5 à 180 | oui |
| `variety_balance` | `household_variety` | variety, balanced, reuse | non, défaut reuse |
| `allergens` | `household_allergen[]` | les 14 de la réglementation | non, défaut tableau vide |
| `diets` | `household_diet[]` | 3 valeurs | non, défaut tableau vide |
| `excluded_ingredients` | `text[]` | 20 entrées de 40 caractères | non, défaut tableau vide |
| `onboarding_done_at` | `timestamptz` | | oui |

Tout est nullable ou vide par défaut, parce que **toute étape du premier lancement peut être passée**, et parce que « pas répondu » ne vaut aucune valeur : un budget nul n'est pas l'absence de budget.

Deux exceptions, et elles ont leur raison. Le **nom** n'est jamais nul, l'ADR 0013 lui ayant donné « Mon foyer » à la création. L'**équilibre** ne l'est pas non plus : voir plus bas, c'est un poids qui a toujours une valeur.

Les trois tableaux ont un défaut vide plutôt que nul : « aucun allergène déclaré » et « la question n'a pas été posée » conduisent au même planning, et deux représentations du même état se paieraient en conditions partout.

### Les deux listes fermées, et d'où elles viennent

**Les allergènes sont les 14 de la réglementation européenne** (règlement 1169/2011), libellés en français : gluten, crustacés, œufs, poissons, arachides, soja, lait, fruits à coque, céleri, moutarde, graines de sésame, anhydride sulfureux et sulfites, lupin, mollusques.

C'est la seule liste qui soit à la fois fermée, stable, publique et légalement définie. Le vocabulaire `allergens[].type` de HelloFresh s'y rattachera en lot 2, avec sa distinction « contient » et « traces de » que `docs/lot-0/hellofresh.md` a relevée : c'est une table de correspondance à écrire là, pas une liste à deviner ici.

Écarté : **reprendre les 34 types relevés par l'échantillon HelloFresh**. Ils viennent de vingt recettes, ils mélangent « contient » et « traces de », et ils changeront à la collecte complète. Faire choisir un utilisateur dans une liste qui bougera est le meilleur moyen de perdre ce qu'il a déclaré.

**Les régimes sont trois** : végétarien, pescétarien, sans porc. Ce ne sont pas des préférences choisies au hasard, ce sont les tags que HelloFresh porte réellement (`veggie`, `pescatarian`, `pork-free`, relevés dans `docs/lot-0/hellofresh.md`), donc les trois seuls que le planning saura honorer.

Écarté : **végétalien**. Aucun tag `vegan` n'a été relevé. Proposer un régime que le planning ne saura pas respecter est pire que ne pas le proposer : la personne déclare, l'application promet, et le premier planning lui sert du fromage. Il entrera quand la collecte complète dira s'il est détectable.

Écartés aussi : **« sans gluten » et « sans œuf » comme régimes**, alors que `egg-free` existe en tag. Le gluten et les œufs sont deux des quatorze allergènes : les avoir aux deux endroits ferait deux vérités pour la même contrainte, et un planning devrait deviner laquelle gagne.

**Les ingrédients exclus restent du texte libre**, parce qu'aucune liste fermée n'existe avant la collecte des ingrédients (lot 2) et que « je n'aime pas la coriandre » n'est pas une contrainte réglementaire. Ils sont bornés à **20 entrées de 40 caractères**, normalisées (minuscules, espaces retirés, doublons supprimés) et **jamais interprétées dans cette story**.

### Ce que les données de santé ne deviennent pas

- **Des codes, et rien autour.** Pas de texte libre pour un allergène, pas de degré de gravité, pas de date de diagnostic, pas de commentaire. Ce qui n'est pas stocké ne fuit pas.
- **Facultatives en entier.** Aucun champ du profil n'est obligatoire, aucune étape ne bloque, et le parcours se termine même en passant tout.
- **Les journaux ne portent que `householdId`.** Ni les valeurs, ni **la liste des champs modifiés** : « ce foyer a changé ses allergènes » est déjà une information de santé. Un test relit les lignes écrites et refuse d'y trouver un code, un ingrédient ou le nom du foyer.
- **La réponse d'erreur ne renvoie aucune valeur soumise.** C'est déjà la propriété du pipe de validation, qui ne rend que le nom du champ et le message de zod ; un test la fige sur un code d'allergène invalide, parce que c'est précisément là qu'un message « valeur reçue : … » apparaîtrait un jour.
- **`Cache-Control: no-store`** sur les deux routes qui portent le profil.
- **Une phrase à l'écran, portée par la `legend` du groupe** : à quoi servent ces réponses (filtrer les recettes proposées), qu'elles sont facultatives, et que rien ne sort de l'application. Cette dernière affirmation est vraie aujourd'hui, aucun connecteur sortant n'existant dans ce lot, et elle devient **une contrainte pour le lot 2** : si un filtre par allergène partait un jour dans une requête vers un site tiers, la phrase deviendrait fausse, et c'est elle qu'il faudrait changer avant le code. À relire quand la correspondance avec le vocabulaire de HelloFresh s'écrira. Pas de page de politique de confidentialité dans cette story, il n'en existe aucune : l'export et la suppression des données ont leur issue, **#15**, qui est l'endroit du texte complet.
- **La garde de navigation ne charge jamais le profil.** Elle a besoin de savoir si le premier lancement est fait, et c'est tout : `GET /household/onboarding` ne rend qu'un booléen. Sans cette route, chaque démarrage de l'application aurait transporté des données de santé pour décider d'une redirection.

### Le PATCH est partiel, et l'absence n'est pas le vide

`PATCH /household/profile` accepte n'importe quel sous-ensemble des champs. **Un champ absent ne change rien. Un tableau vide efface.** Les deux cas sont testés sur les trois tableaux, allergènes, régimes et ingrédients exclus, en mémoire et contre une vraie base.

**La réponse, elle, porte le profil entier**, y compris les champs de santé que l'étape n'a pas envoyés. C'est ainsi que l'écran apprend la forme stockée (une liste normalisée et dédoublonnée, par exemple) et l'état du parcours, et les deux écrans ont de toute façon chargé le profil au montage. Le sens serveur vers client n'est donc pas minimisé de la même façon que l'autre, et c'est assumé : un 204 obligerait l'écran à deviner ce que le serveur a retenu.

Écarté : **un `PUT` qui remplace le profil entier.** Il obligerait chaque écran à renvoyer ce qu'il n'affiche pas, donc l'écran du premier lancement qui demande le budget devrait renvoyer les allergènes, qu'il n'a pas chargés. Deux issues, toutes deux mauvaises : les effacer sans le vouloir, ou les charger pour les reposer, c'est-à-dire faire voyager des données de santé pour rien. Le partiel est ce qui permet à chaque étape de n'envoyer que ses propres champs.

### Le nombre de personnes, et les six portions

Entier de 1 à 35, borné par le schéma partagé, donc refusé par l'API comme par l'écran.

**Au-delà de 6, cette story ne calcule rien, elle avertit.** Le cahier des charges décrit la mécanique : les paliers de HelloFresh vont de 1 à 6, ils ne sont pas proportionnels (épices inchangées, arrondis au conditionnement), et au-delà les quantités s'obtiennent en combinant des paliers réels (8 = 4 + 4, 10 = 6 + 4) puis s'affichent comme estimées. Rien de cela n'existe avant la collecte des recettes.

Ce qui est livré ici est donc une phrase, affichée dès que la valeur saisie dépasse 6 : les quantités seront estimées. L'attente est posée là où la personne choisit, et non découverte au premier planning.

### Le budget est mensuel, et son nom le dit

`monthly_budget_cents`, `monthlyBudgetCents`, « Budget mensuel ». La période est dans le nom de la colonne, du champ et du libellé, aux trois endroits : le cahier des charges ne connaît que le budget mensuel (sections 3, 4 et « Statistiques »), et une colonne `budget_cents` aurait laissé la question ouverte à chaque relecture.

**L'écran saisit des euros entiers, la colonne stocke des centimes.** Un budget de courses mensuel n'a pas besoin de la précision du centime, et l'entier évite la dérive du flottant : `Number('12.34') * 100` ne vaut pas 1234. La conversion vit à un seul endroit, elle est multipliée par 100, et elle est testée.

### L'équilibre variété et réutilisation : trois valeurs, et `reuse` par défaut

Trois valeurs, `variety`, `balanced`, `reuse`, et non un curseur de 0 à 100. Un curseur promettrait une précision que le planning n'exploitera pas, et `<input type="range">` n'est pas dans les composants de D2. Si le lot 2 a besoin d'un poids fin, trois valeurs se traduisent en poids sans migration de données.

**Le défaut est `reuse`**, et c'est un choix, pas une commodité. Le cahier des charges ne présente pas la réutilisation comme une préférence parmi d'autres : « c'est un objectif central du planning, pas un bonus : quelques recettes simples qui partagent leurs ingrédients, plutôt que des dizaines d'ingrédients achetés pour un seul plat ». Un défaut à `balanced` aurait contredit cette phrase pour tout foyer qui n'ouvre jamais son profil, et le cas de référence du projet (une personne, 100 à 200 € par mois) est celui que la réutilisation sert le mieux. Le défaut vit dans le schéma et dans la colonne : il se déplace en une ligne si le lot 2 mesure de la monotonie.

### Le premier lancement est un écran à étapes, pas une route par étape

Un seul écran, `/premier-lancement`, avec ses étapes dans la page, comme la connexion à deux étapes. Chaque étape enregistre ses propres champs par un PATCH, donc reprendre plus tard ne perd rien.

« Passer cette étape » avance sans rien écrire. « Terminer plus tard », disponible à chaque étape, pose `onboarding_done_at` et libère le parcours : sans cela, quelqu'un qui ne veut rien remplir reverrait le même écran à chaque connexion. Le profil, sur `/profil`, est la même donnée sous une autre forme, et c'est là qu'on reprend.

Un seul écran veut dire **un seul passage axe-core** pour le parcours, et un second pour le profil (ADR 0007).

### Les formulaires n'ajoutent aucun composant

| Champ | Composant de D2 |
| --- | --- |
| Nom du foyer, ingrédients exclus | `BaseField` |
| Personnes, budget, temps par repas | `BaseField`, texte avec `inputmode="numeric"` |
| Objectif, équilibre | `BaseRadioGroup` |
| Allergènes, régimes | `BaseFieldset` et `BaseCheckbox` |

**Du texte avec un clavier numérique, et non `type="number"`**, et la raison est mesurée : Vue applique d'office la conversion numérique à la valeur d'un champ de ce type, donc le modèle de `BaseField`, qui est une chaîne, recevait un nombre et la première lecture de texte échouait. `inputmode` donne le clavier sur mobile sans ce piège, et les bornes sont dites par l'aide puis appliquées par le schéma partagé. Le type `number` reste offert par `BaseField` et démontré sur la page du design system : c'est cette note, reprise dans `docs/design-system.md`, qui fait foi.

La sélection multiple d'une liste déroulante est une limite connue et assumée du design system. La réponse n'est pas de l'écrire : c'est un groupe de cases dans un `fieldset`, soit du HTML natif, ce que la rule d'accessibilité demande en premier. L'aide et l'erreur d'un groupe sont reliées au groupe par `useFieldAria`, pas répétées sur chaque option.

## Conséquences

- La migration `0007` ajoute neuf colonnes à `household`, quatre énumérations (`household_goal`, `household_variety`, `household_allergen`, `household_diet`) et aucun index : rien ne cherche un foyer par son contenu.
- Les bornes et les listes vivent dans `packages/shared`, donc l'écran et l'API appliquent la même règle, comme l'exige l'issue.
- Un module de plus, `households`, avec son service et son dépôt. Le module d'authentification n'y touche pas (ADR 0015).
- Deux écrans de plus, donc deux passages axe-core, et une entrée « Profil » dans la navigation.
- Aucune variable d'environnement, aucune dépendance nouvelle.
- `docs/design-system.md` gagne une ligne : la sélection multiple se fait par un groupe de cases, et c'est désormais employé.

## Quand revoir cette décision

- **Quand les recettes seront collectées** (lot 2) : la correspondance entre les 14 allergènes et le vocabulaire de HelloFresh s'écrit là, le calcul des quantités au-delà de 6 personnes aussi, et c'est là que les régimes pourront s'ouvrir si les tags le permettent, végétalien le premier.
- **Si le lot 2 a besoin d'un poids fin** pour l'équilibre : trois valeurs deviennent trois poids, et un curseur se discute à ce moment, pas avant.
- **Si le lot 2 mesure de la monotonie** avec le défaut `reuse` : le défaut se déplace, et c'est une ligne de migration.
- **Quand l'export et la suppression arriveront** (#15) : ils portent la mention d'information complète, et ils liront le profil entier, données de santé comprises.
- **Si un champ du profil devait devenir obligatoire** : c'est la promesse « toute étape peut être passée » qui tomberait, et elle vient de l'issue.
