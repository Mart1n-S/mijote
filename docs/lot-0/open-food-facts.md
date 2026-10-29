# Hypothèse 5 : couverture d'Open Food Facts, et Ciqual en secours

Collecte du 28 octobre 2026. Prototype : `spikes/open-food-facts/`, plus les 40 fiches Picard supplémentaires récupérées par `spikes/picard/src/codes-barres.ts`.

## 1. Verdict

**Validée** : pour les produits dont on connaît le code-barres, Open Food Facts donne les valeurs pour 100 g sur **47 des 50 codes testés**, et sur ces 47 les quatre valeurs indispensables (énergie, protéines, glucides, lipides) sont **toutes présentes et toutes lues sur l'emballage**, jamais estimées. Une seule anomalie réelle sur 47. En secours, la table Ciqual 2025 couvre **58 des 87 ingrédients** HelloFresh après revue manuelle, ce qui en fait la bonne source pour les ingrédients sans code-barres.

## 2. Méthode

### Conditions d'Open Food Facts, lues avant d'écrire la moindre ligne

| Règle, telle que documentée | Ce qu'on en a fait |
| --- | --- |
| « 15 req/min/IP address for all read product queries » | 5 s entre deux requêtes, soit 12 par minute |
| « always use a custom User-Agent », format `AppName/Version (ContactEmail)` | agent utilisateur **sans adresse de contact** (voir ci-dessous) |
| « If you need to fetch more than a few hundred products, we ask you to download the data as a CSV or JSONL file » | 50 codes, très en dessous du seuil : l'API est le bon outil |
| « While testing your applications, make all API requests to the staging environment » | mise au point sur `openfoodfacts.net`, mesure sur la production (voir ci-dessous) |
| v2 « Deprecated », v3.6 « Current, recommended » | API v3.6 |
| Base sous **ODbL**, contenus sous DbCL | attribution obligatoire, voir section 4 |

**Écart assumé sur l'agent utilisateur.** Leur format demande une adresse de contact ; le prototype s'annonce `mijote-spike-lot0/0.1 (prototype de faisabilité, usage personnel)`, sans adresse. C'est une décision de Martin, qui ne souhaite pas voir son adresse personnelle partir dans un en-tête HTTP. La question devra être tranchée pour l'application elle-même, au lot concerné : soit une adresse dédiée au projet, soit un contact collectif.

**Pourquoi la mesure est faite sur la production.** Leur documentation demande de tester sur l'environnement de recette, ce que j'ai fait pour mettre le script au point. Mais sur cet environnement, le produit témoin revient avec un objet `nutriments` **vide** : c'est une copie partielle, inutilisable pour mesurer une couverture. La question posée porte sur les vraies données, donc la mesure a été lancée sur la production, avec 50 lectures espacées de 5 s.

### Piège d'API, découvert en sondant avant de coder

En **v3.6, `product.nutriments` est vide**. Les valeurs ont déménagé dans `product.nutrition.aggregated_set.nutrients`, où chaque nutriment est un objet :

```
"proteins": { "value": 23, "unit": "g", "source": "packaging", "source_per": "100g" }
```

Les noms de champs en `_100g` que l'on trouve partout (`energy-kcal_100g`, `proteins_100g`) appartiennent à la **v2, dépréciée**. Deux conséquences heureuses de cette nouvelle structure : `source` distingue une valeur **lue sur l'emballage** d'une valeur **estimée** à partir des ingrédients, et `source_per` dit sur quelle base elle est donnée. Ce sont exactement les deux informations qu'il faut pour juger de la fiabilité. Le paramètre `fields=` fonctionne et permet de ne demander que ce qu'on utilise.

### Échantillon de 50 codes-barres

| Origine | Nombre |
| --- | --- |
| Fiches Picard de l'hypothèse 3 | 10 |
| Fiches Picard supplémentaires, autorisées pour cette hypothèse | 40 |
| Code-barres Intermarché relevé à l'hypothèse 2 | 1 |
| Perdu : une fiche Picard a répondu « Une erreur technique est survenue » | -1 |
| **Total interrogé** | **50** |

Les 40 fiches supplémentaires dépassent le plafond de 10 produits du CLAUDE.md, ce que Martin a autorisé explicitement pour cette hypothèse, avec les mêmes règles. Elles ont été choisies **hors ligne** dans le sitemap déjà enregistré, filtrées sur les rayons d'ingrédients puis revues une par une pour écarter les plats cuisinés, et leurs URL viennent telles quelles du sitemap. 40 requêtes à 4 s d'écart, toutes en 200.

### Ciqual

Le jeu de données de data.gouv.fr est la version 2020, explicitement remplacée. La version courante est déposée sur l'entrepôt recherche.data.gouv : **Ciqual 2025**, DOI `10.57745/RDMHWY`, publiée le 19 novembre 2025, sous **licence Etalab 2.0**. Pas d'API, uniquement des fichiers.

Les fichiers XML existent, donc **aucune dépendance de lecture de tableur n'a été ajoutée** : trois téléchargements, `alim` (1,5 Mo, les aliments), `const` (18 ko, les constituants) et `compo` (69 Mo, les teneurs). Tout le reste se fait hors ligne.

### Charge totale

54 requêtes journalisées : 50 vers Open Food Facts (47 en 200, 3 en 404) et 4 vers l'entrepôt (3 en 200, 1 en 406 corrigé). Plus 40 requêtes vers picard.fr pour les fiches, et 5 sondages exploratoires avant écriture du code (2 sur l'environnement de recette, 3 sur la production). Aucun blocage, aucune limite de débit atteinte.

## 3. Données disponibles

### Open Food Facts, sur les 50 codes

| Mesure | Résultat |
| --- | --- |
| Produit trouvé | **47/50 (94 %)** |
| Les quatre valeurs indispensables (kcal, protéines, glucides, lipides) | **47/50 (94 %)**, soit 47/47 des produits trouvés |
| Ces quatre valeurs **lues sur l'emballage** et non estimées | **47/47 (100 %)** |
| Sucres | 47/47 (100 %) |
| Sel | 47/47 (100 %) |
| Fibres | 44/47 (94 %) |
| Nutri-Score | 47/47 (100 %) |
| Quantité en grammes (`product_quantity`) | 45/47 (96 %) |
| Catégories renseignées | 43/47 (91 %) |
| Dernière modification | entre le 28 mai 2025 et le 24 septembre 2026 |
| Produits avec au moins une alerte de cohérence | **1/47 (2 %)** |

Noms de champs utiles, en v3.6 : `nutrition.aggregated_set.nutrients` avec les clés `energy-kcal`, `energy-kj`, `proteins`, `carbohydrates`, `fat`, `sugars`, `fiber`, `salt`, `saturated-fat`, `sodium`, chacune portant `value`, `unit`, `source` et `source_per` ; plus `product_name`, `brands`, `quantity`, `product_quantity`, `categories_tags`, `nutriscore_grade`, `last_modified_t`.

### Ciqual 2025

| Mesure | Valeur |
| --- | --- |
| Aliments | **3 484** |
| Constituants | 74 |
| Aliments avec des teneurs lues | 3 484 |
| Codes des constituants utilisés | énergie kcal `328`, protéines `25000`, glucides `31000`, lipides `40000`, sucres `32000`, fibres `34100`, sel `10004` |

Structure : un fichier d'aliments (`alim_code`, `alim_nom_fr`, groupes), un fichier de constituants (`const_code`, `const_nom_fr`, code INFOODS), et un fichier de teneurs reliant les deux. Les libellés portent l'unité et la référence réglementaire (« Protéines, N x facteur de Jones (g/100 g) ») : on désigne donc les constituants **par leur code**, jamais par une expression régulière sur leur nom.

**Couverture des 87 ingrédients HelloFresh**

| Verdict | Nombre | Exemples |
| --- | --- | --- |
| Automatique : au moins un candidat | 83/87 (95 %) | chiffre à ne pas publier seul |
| **Bon** : l'aliment Ciqual est l'ingrédient | **41/87 (47 %)** | Carotte crue, Épinard cru, Oignon cru, Poireau cru, Poulet filet sans peau cru, Crevette crue, Œuf cru, Persil frais, Farine de blé T65, Semoule de blé dur crue, Huile d'olive vierge extra, Mozzarella, Burrata, Miel, Moutarde |
| **Variante** : même aliment sous une autre forme | **17/87 (20 %)** | Pomme sèche pour pomme fraîche, Gingembre poudre pour frais, Ciboulette séchée pour fraîche, Cacahuète grillée salée pour non salée, Sucre roux pour sucre blanc |
| **Faux** | **25/87 (29 %)** | « Gousse d'ail » rapproché de « Vanille, gousse », « Lait » de « Lait de coco », « Pommes de terre » de « Fécule de pomme de terre », « Tranches de carré de porc » de « Bœuf, tende de tranche » |
| Aucun candidat | 4/87 | chutney d'abricots, edamame, plateau de charcuterie, prosciutto crudo |
| **Utilisables, bons plus variantes** | **58/87 (67 %)** | |

**Forme des teneurs**, mesurée sur les 58 rapprochements retenus : les valeurs ne sont pas toujours des nombres.

| Nutriment | Chiffrée | « traces » | « inférieure à » | Non déterminée |
| --- | --- | --- | --- | --- |
| Énergie kcal | 56 | | | 2 |
| Protéines | 56 | | | 2 |
| Glucides | 53 | 5 | | |
| Lipides | 50 | | 8 | |
| Sucres | 51 | 6 | | 1 |
| Fibres | 57 | | 1 | |
| Sel | 52 | | 5 | 1 |

## 4. Limites et risques

**Trois produits absents d'Open Food Facts** : bananes en rondelles, côtelettes d'agneau et farce pur porc, toutes de marque Picard. Ce sont des produits bruts surgelés, les moins scannés par les contributeurs. Il faudra donc un repli, et c'est précisément le rôle de Ciqual.

**Une anomalie réelle, et elle est vicieuse.** Le produit « Oignons émincés » porte toutes ses valeurs avec `source_per: "serving"` et non `"100g"`. Utilisées telles quelles, elles donneraient une nutrition fausse sans qu'aucun contrôle de vraisemblance ne s'en aperçoive. **Tout code qui lit Open Food Facts doit vérifier `source_per` avant d'utiliser une valeur**, et refuser ou convertir sinon.

**Mon propre contrôle de cohérence était faux, et je le consigne.** La règle 4/4/9 (4 kcal/g pour les protéines et les glucides, 9 pour les lipides) ignore les fibres, qui apportent environ 2 kcal/g. Elle signalait trois produits à tort : fonds d'artichauts (35 kcal déclarées contre 22 calculées), myrtilles (46 contre 32) et menthe (36 contre 22). Avec les fibres comptées, les trois concordent : 38, 42 et 36. La règle appliquée est donc 4/4/9 plus 2 pour les fibres, et après correction il ne reste **aucune valeur manifestement fausse** dans l'échantillon.

**Les données sont communautaires.** Une valeur peut être erronée sans être détectablement erronée : une saisie de 0,5 au lieu de 5 passe tous les contrôles. La fraîcheur est bonne sur cet échantillon (toutes les fiches modifiées en 2025 ou 2026), mais rien ne garantit qu'un produit reste à jour. Les contrôles de cohérence réduisent le risque, ils ne l'annulent pas.

**Limite de débit basse : 15 lectures par minute.** L'application ne peut pas interroger Open Food Facts à l'affichage d'une page. Il faut mettre en cache, et pour un volume important leur documentation renvoie explicitement vers l'export complet plutôt que l'API.

**Attribution ODbL obligatoire.** La base est sous Open Database License, les contenus sous Database Contents License, les images sous CC-BY-SA. L'attribution est exigée pour tout usage public, avec une formule du type « Contains data from Open Food Facts, available under the Open Database License », et leur documentation demande une attribution visible dans l'interface, avec des liens cliquables vers Open Food Facts et vers la licence. La clause de partage à l'identique s'applique si l'on publie une base dérivée. Pour Ciqual, c'est la licence Etalab 2.0, qui impose également la mention de la source et de la date de la version.

**Ciqual : le rapprochement textuel reste le point faible.** 95 % de candidats automatiques, mais 29 % de faux après revue. Comme pour les produits Picard, la validation manuelle par ingrédient canonique n'est pas une précaution, c'est le mécanisme.

**Ciqual décrit des aliments génériques, pas des produits.** L'état compte énormément : « Riz blanc, cru » et « Riz blanc, cuit » n'ont pas la même composition pour 100 g. Le rapprochement doit porter sur l'ingrédient **dans l'état où la recette l'utilise**.

**Teneurs textuelles.** « traces », « < 0,5 » et « - » doivent être interprétés, et un « - » veut dire non déterminé, pas zéro.

**Volume et absence d'API.** Le fichier des teneurs pèse 69 Mo, en téléchargement manuel versionné par DOI. Il faudra surveiller les nouvelles versions à la main : la 2020 est restée référencée sur data.gouv.fr des années après avoir été remplacée.

## 5. Décisions prises

1. **Open Food Facts est la source de nutrition dès qu'un code-barres est connu**, en API v3.6, par `nutrition.aggregated_set.nutrients`. Jamais les champs `_100g` de la v2 dépréciée.
2. **Vérifier `source_per` systématiquement**, et n'utiliser une valeur que si elle est donnée pour 100 g. Sinon, convertir si la portion est connue, et à défaut traiter la valeur comme absente.
3. **Conserver `source` et l'afficher** : une valeur `packaging` et une valeur `estimate` n'ont pas le même statut. Sur notre échantillon, tout était en `packaging`, mais ce ne sera pas toujours le cas.
4. **Contrôle de cohérence à l'import** : énergie recalculée en 4/4/9 plus 2 pour les fibres, somme des macronutriments inférieure à 100 g, aucune valeur négative. Au-delà de 30 % d'écart, la fiche est marquée douteuse et signalée à l'utilisateur, pas rejetée en silence.
5. **Cache obligatoire**, avec `last_modified_t` comme clé de fraîcheur et rafraîchissement mensuel. Aucune requête Open Food Facts dans le chemin d'affichage. Si le volume dépasse quelques centaines de produits, passer à leur export complet, comme leur documentation le demande.
6. **Ciqual 2025 en secours**, pour les ingrédients sans code-barres, c'est-à-dire la majorité du côté Intermarché. Chargement unique des trois fichiers XML, conservation des sept constituants par aliment, désignés par leur code.
7. **Interprétation des teneurs textuelles** : « traces » et « < x » valent zéro pour le calcul, « - » vaut inconnu et se propage comme tel jusqu'à l'affichage.
8. **Un rapprochement ingrédient canonique vers aliment Ciqual, validé à la main une fois**, en tenant compte de l'état (cru ou cuit). Même mécanisme que pour les produits magasin.
9. **Attribution dans l'interface** : mention et liens vers Open Food Facts et l'ODbL, mention de Ciqual et de la licence Etalab 2.0 avec la version et sa date. À inscrire au cahier des charges, pas à improviser.
10. **Agent utilisateur de l'application** : à trancher au lot concerné, avec une adresse dédiée au projet et non l'adresse personnelle de Martin.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 5, tableau des sources | Ligne Nutrition : préciser Open Food Facts **API v3.6**, par `nutrition.aggregated_set.nutrients`, couverture mesurée 47/50 sur des produits surgelés, limite de 15 lectures par minute, cache obligatoire. Ciqual : version **2025**, DOI `10.57745/RDMHWY`, trois fichiers XML, 3 484 aliments, licence Etalab 2.0 |
| 6, règles métier, nutrition | Ajouter la vérification de `source_per`, la distinction `packaging` contre `estimate`, le contrôle 4/4/9 plus 2 pour les fibres, et l'interprétation de « traces », « < x » et « - » |
| 6, correspondance | Ajouter le rapprochement ingrédient canonique vers aliment Ciqual, validé à la main, en tenant compte de l'état cru ou cuit |
| 3 et 7, interface | Ajouter l'attribution obligatoire : Open Food Facts et ODbL avec liens cliquables, Ciqual et Etalab 2.0 avec la version |
| 10, exigences non fonctionnelles | Inscrire les limites de débit des sources tierces et l'obligation de cache |
| 13, découpage en lots | Ajouter une intention de contribution en retour : produits manquants vers Open Food Facts, prix adossés aux tickets vers Open Prices, hors V1, avec anonymisation préalable |
| 15, hypothèses | Cocher l'hypothèse 5, avec les deux chiffres : 47/50 pour les codes-barres, 58/87 pour Ciqual après revue manuelle |

## 7. Résumé de suivi

- Hypothèse 5 validée. Sur 50 codes-barres (10 fiches Picard de l'hypothèse 3, 40 nouvelles, 1 Intermarché), Open Food Facts trouve **47 produits**, et pour tous les 47 les quatre valeurs pour 100 g sont présentes et **lues sur l'emballage**, pas estimées. Sucres et sel à 100 %, fibres à 94 %, Nutri-Score à 100 %, fiches toutes modifiées en 2025 ou 2026.
- Piège d'API : en v3.6 `product.nutriments` est **vide**, tout est dans `nutrition.aggregated_set.nutrients`, où chaque valeur porte sa provenance (`packaging` ou `estimate`) et sa base (`source_per`). Un produit de l'échantillon donne tout **par portion** : il faut vérifier `source_per` avant d'utiliser une valeur.
- Mon contrôle 4/4/9 signalait trois produits à tort en oubliant les fibres (2 kcal/g). Corrigé, il ne reste **aucune valeur manifestement fausse** dans l'échantillon.
- Ciqual 2025 (3 484 aliments, licence Etalab 2.0, XML, pas d'API) couvre **58 des 87 ingrédients** HelloFresh après revue manuelle, dont 41 franchement, là où le rapprochement automatique annonçait 83. Certaines teneurs sont textuelles : « traces », « < 0,5 », « - ».
- Obligations : attribution ODbL visible pour Open Food Facts, Etalab 2.0 pour Ciqual, cache obligatoire (15 lectures/min). Contribuer en retour est possible, produits par leur API d'écriture et prix par Open Prices avec preuve de ticket, mais hors V1 et seulement après anonymisation.

## Annexe : contribuer en retour, et pas seulement lire

La question se pose parce que nos tickets de caisse produiront exactement ce qui manque à ces bases. Réponse : **oui, les deux types de contribution sont prévus par le projet Open Food Facts.**

- **Produits** : leur API documente les écritures, et précise même « There is no limit on product write queries », là où les lectures sont plafonnées à 15 par minute. Leur page de données demande explicitement aux réutilisateurs de renvoyer leurs contributions. Les trois produits Picard absents de la base sont donc des candidats naturels : nous en connaissons le code-barres, le nom, la marque, le conditionnement et le prix.
- **Prix** : c'est le rôle d'Open Prices, mesuré à l'hypothèse 2 (337 466 prix, 229 lieux Intermarché, mais zéro à Aix-en-Provence). Son modèle de données porte les champs `proof`, `proof_id` et `receipt_quantity` : un prix peut être **adossé à une preuve**, dont une photo de ticket de caisse. C'est précisément notre cas d'usage.

**Trois réserves avant d'y aller.** Contribuer signifie publier sous licence ouverte, donc de façon irréversible. Une photo de ticket contient des informations personnelles, à commencer par le magasin, la date, l'heure, un numéro de carte de fidélité et parfois les derniers chiffres d'une carte bancaire : il faudrait un découpage ou un floutage avant tout envoi, et le consentement explicite de l'utilisateur. Enfin, la qualité de ce qu'on renvoie engage le projet : mieux vaut peu de contributions vérifiées que beaucoup d'automatique.

**Décision** : hors V1, mais à inscrire comme intention au cahier des charges, parce que ça change la conception du stockage des tickets. Si on sait dès maintenant qu'un ticket pourra un jour être exporté, on le stocke avec ses lignes séparées de son image, et on prépare le découpage.

Cette annexe est hors du plan de rapport imposé : elle répond à une question posée en plus, et elle ne conditionne aucune décision du lot 0.
