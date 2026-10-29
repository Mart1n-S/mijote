# Hypothèse 4 : localisateurs de magasins des deux enseignes

Collecte du 28 octobre 2026. Prototypes : `spikes/localisateurs/` pour Intermarché, et `spikes/picard/` pour Picard, dont les chiffres viennent de l'hypothèse 3.

## 1. Verdict

**Validée** : les deux enseignes sont énumérables avec leurs coordonnées, par deux voies différentes. Picard publie un sitemap de 1 267 fiches avec adresse complète, horaires et coordonnées. Intermarché est couvert par OpenStreetMap à hauteur de **2 280 magasins avec coordonnées sur 100 %**, mais la ville n'y figure que sur 26 % : il faut la compléter par géocodage inverse, ce qui fonctionne.

## 2. Méthode

**Contrainte posée pour cette hypothèse** : aucune requête vers `intermarche.com`. Le garde-fou (`src/garde.ts`) l'applique par construction, avec le domaine d'Intermarché en liste noire explicite et seulement trois hôtes en liste blanche : deux miroirs Overpass et le géocodage de l'IGN.

**Picard : rien à refaire.** L'hypothèse 3 avait déjà relevé `magasins.picard.fr`, son `robots.txt` permissif (`Allow: /search/*`), son sitemap en index de 4 fichiers, et ses **1 267 fiches de magasin**, avec sur la fiche d'Aix Malacrida : adresse, code postal, latitude, longitude, téléphone, horaires et un JSON-LD `LocalBusiness`. Aucune requête supplémentaire émise ici.

**Intermarché : OpenStreetMap via Overpass.** Trois requêtes utiles, plus les tâtonnements décrits ci-dessous.

| Requête | Résultat |
| --- | --- |
| Commerces des deux enseignes dans 8 km autour d'Aix | 17 objets, 9 Intermarché et 8 Picard |
| Tous les Intermarché de France | 4 457 objets bruts |
| Tous les Picard de France | 1 099 objets bruts |

**Géocodage inverse : adresse du service vérifiée avant appel**, comme demandé. L'API Adresse de la Base Adresse Nationale a été transférée de la DINUM à l'IGN, sur la Géoplateforme : l'adresse actuelle est `https://data.geopf.fr/geocodage/reverse`. L'ancien domaine `api-adresse.data.gouv.fr` répond encore, à l'identique au caractère près, mais il était annoncé comme maintenu jusqu'à janvier 2026 seulement : le prototype utilise la nouvelle adresse. 6 appels, dont 1 témoin de contrôle.

**Charge totale** : environ 11 appels Overpass, dont 5 refusés par saturation du service, et 6 appels de géocodage, tous en 200. À noter pour la relecture : le journal `data/requetes.log` est remis à zéro à chaque lancement de `src/overpass.ts`, il ne contient donc que la dernière passe.

**Trois tâtonnements, consignés parce qu'ils sont instructifs**

1. **Requête expirée.** La première version de la requête autour d'Aix filtrait par expression régulière sur `name`, `brand` et `operator`. Overpass a répondu 200 avec un corps vide et la remarque `Query timed out in "query" at line 3 after 76 seconds` : une regex seule n'est pas indexée, le moteur balaye tout. Corrigé en plaçant devant un filtre de clé indexé (`shop` ou `amenity`), qui restreint le jeu de données avant la regex. La requête passe alors en moins de 10 secondes.
2. **Miroir à couverture partielle.** Après plusieurs 502 du point d'accès principal, la bascule a atteint `overpass.osm.ch`, qui a répondu **200 avec zéro résultat**. Cette instance ne contient que la Suisse. Une réponse vide n'est donc pas forcément une absence de données : elle peut venir du miroir. Ce miroir a été retiré de la liste, et la leçon est écrite dans le code.
3. **Filtre géographique par le nom.** Le premier filtre « autour d'Aix » cherchait « aix » dans le nom de la ville. Il a retenu « Plourin-lès-Morl**aix**», à mille kilomètres. Remplacé par un filtre sur la distance réelle.

## 3. Données disponibles

### Les champs dont l'application a besoin

Pour que l'utilisateur choisisse un magasin, il faut le **nom**, la **ville** et les **coordonnées**. L'adresse complète est un confort : elle sert à afficher une fiche, pas à choisir. Les horaires et le téléphone sont du confort également.

| Enseigne | Nom | Ville | Coordonnées | Les trois ensemble |
| --- | --- | --- | --- | --- |
| Intermarché (OSM) | 100 % | **26 %** | 100 % | **26 %** |
| Picard (OSM) | 100 % | **24 %** | 100 % | **24 %** |
| Picard (sitemap officiel) | 100 % | 100 % | 100 % | 100 % |

C'est le constat central : OpenStreetMap place très bien les magasins, mais ne les adresse pas. La ville manque sur trois quarts des objets.

### Intermarché dans OpenStreetMap

Des 4 457 objets bruts, il faut écarter ce qui n'est pas un magasin, puis regrouper les doublons : le même magasin apparaît souvent deux fois, une fois en nœud (le commerce) et une fois en polygone (le bâtiment).

| Étape | Objets |
| --- | --- |
| Rendus par Overpass | 4 457 |
| Dont commerces (`supermarket`, `convenience`, `grocery`, `general`, `outpost`) | 2 556 |
| Écartés : `shop=gas` 1 040, `amenity=fuel` 322, `amenity=car_wash` 120, laveries, centres commerciaux, objets sans type | 1 901 |
| **Magasins après regroupement à moins de 80 m** | **2 280** |
| Objets fusionnés par ce regroupement | 276 |

Sous-enseignes reconnues : Intermarché 1 295, Super 519, Contact 210, Express 124, Hyper 56, Drive 14. Trois identifiants Wikidata cohabitent (`Q3153200` pour l'enseigne, plus deux pour des sous-enseignes), ce qui explique qu'un filtre par `brand:wikidata` seul en raterait une partie : le filtre par `brand` reste nécessaire.

Champs disponibles sur les 2 280 magasins :

| Champ | Présence |
| --- | --- |
| `name`, coordonnées | 100 % |
| `brand:wikidata` | 99 % |
| `opening_hours` | 95 % |
| `website` | 89 % |
| **`website` contenant l'identifiant interne du magasin** | **88 %** |
| `phone` | 48 % |
| `addr:street` | 39 % |
| `addr:postcode` | 28 % |
| `addr:city` | 26 % |
| `addr:housenumber` et `addr:street` ensemble | 25 % |

**Trouvaille utile** : le tag `website` contient l'URL de la fiche « infos pratiques », donc le `pdvref` du magasin, sur 88 % des objets. On récupère ainsi l'identifiant interne d'Intermarché **sans jamais appeler leur site**, ce qui donnerait plus tard un point de raccordement propre si l'accès à l'API partenaire était accordé.

### Le Super d'Aix, avenue des Infirmeries

Critère de réussite fixé pour cette hypothèse : retrouvé, et complet.

| Champ | Valeur |
| --- | --- |
| Objet OSM | `way/87801400` |
| `addr:street`, `addr:postcode`, `addr:city` | Avenue des Infirmeries, 13100, Aix-en-Provence |
| Coordonnées | 43.5164049, 5.4619253 |
| `opening_hours` | `Mo-Sa 08:30-21:00; Su 09:00-12:30` |
| `phone` | `+33 4 42 93 63 80` |
| `website` | `.../magasins/11749/aix-en-provence-13100/infos-pratiques` |
| `brand:wikidata` | `Q3153200` |
| `check_date` | 2026-02-27 |

Le téléphone et les horaires concordent avec ce que la fiche du site avait montré à l'hypothèse 2, et l'identifiant `11749` est le même. La concordance a été vérifiée **hors ligne**, sur les données déjà enregistrées dans `spikes/intermarche/data/`, sans rappeler leur site. Seul manque le numéro de rue.

### Géocodage inverse : ce qu'il apporte vraiment

Testé sur 5 magasins incomplets autour d'Aix, plus un témoin de contrôle dont l'adresse est connue.

| Magasin | Rue selon OSM | Rue rendue par le géocodage | Écart | Ville rendue |
| --- | --- | --- | --- | --- |
| Témoin : Picard Aix Malacrida | 11 avenue Henri Malacrida (connue) | **11 Avenue Henri Malacrida** | 20 m | Aix-en-Provence |
| Intermarché Super, Velaux | Avenue Marcel Pagnol | Avenue Jean Moulin | 64 m | Velaux |
| Intermarché Contact, Meyreuil | Impasse La Croix | **Impasse de la Croix** | 31 m | Meyreuil |
| Intermarché, Aix (11749) | Avenue des Infirmeries | Avenue Saint-Jérôme | 59 m | Aix-en-Provence |
| Intermarché, Fuveau | absente | Impasse du Grand Vallat | 14 m | Fuveau |
| Intermarché, Mimet | absente | Chemin des Fabres | 61 m | Mimet |

**La ville et le code postal sont fiables : 5 réponses sur 5, toutes cohérentes avec la commune du magasin.** La rue, non : sur les trois cas vérifiables, elle est juste une fois (à 31 m) et fausse deux fois (à 59 et 64 m). Le centroïde d'un bâtiment commercial tombe souvent à plus de 50 m du point d'adresse le plus proche, qui appartient alors à une autre rue. Seules 2 réponses sur 5 sont à moins de 50 mètres.

## 4. Limites et risques

**OpenStreetMap n'est pas exhaustif, et on peut le mesurer.** Picard sert d'étalon : 1 090 magasins dans OSM contre **1 267 fiches officielles** relevées dans son sitemap, soit **86 % de complétude**. **Ce taux ne se transpose pas à Intermarché**, et je ne l'extrapole donc pas. Il supposerait que les deux enseignes sont cartographiées avec le même soin, et surtout il entrerait en contradiction avec le soupçon exprimé plus bas : les 2 280 magasins Intermarché dépassent déjà l'ordre de grandeur attendu, ce qui suggère un surcomptage plutôt qu'un manque. Les deux corrections joueraient en sens inverse, et rien ne permet de les chiffrer.

**Pas de liste de référence pour Intermarché.** C'est la conséquence directe de la décision d'arrêter toute collecte chez eux : on ne peut pas vérifier le compte OSM contre une source officielle, comme on l'a fait pour Picard.

**La rue issue du géocodage inverse ne doit pas être affichée comme l'adresse du magasin.** Deux cas sur trois sont faux dans l'échantillon. L'utiliser reviendrait à inventer une adresse plausible, ce qui est pire qu'une adresse absente.

**Fraîcheur variable.** `check_date` existe mais n'est pas systématique : sur le Super d'Aix il date du 27 février 2026. Un magasin fermé peut rester des mois dans OSM, et un magasin récent y manquer.

**Overpass est un service gratuit et fragile.** Sur cette session, 5 appels sur 11 ont été refusés (502 ou 504), sur deux points d'accès différents. Toute collecte régulière doit prévoir la bascule entre miroirs, l'attente, et surtout ne pas en dépendre pour une fonction interactive. La fréquence mensuelle prévue par le cahier des charges est le bon ordre.

**Le tag `website` n'est pas une garantie.** Les 88 % qui portent le `pdvref` viennent de contributeurs : un identifiant peut être périmé si le magasin a changé de référence.

**Réseau Intermarché à vérifier autrement.** 2 280 magasins dans OSM dépasse l'ordre de grandeur généralement cité pour l'enseigne, ce qui suggère la présence de doublons non regroupés, de drives comptés comme magasins, ou d'objets obsolètes. Le chiffre est utilisable pour proposer un magasin proche, pas pour annoncer une couverture nationale.

## 5. Décisions prises

1. **Deux connecteurs de localisateur, deux méthodes.** Picard : son sitemap officiel, qui donne tout. Intermarché : OpenStreetMap, et rien d'autre.
2. **Les trois champs indispensables sont nom, ville, coordonnées.** L'adresse complète est un confort, affiché quand il existe et omis sinon. Un magasin sans adresse postale reste choisissable, puisqu'on le situe par ses coordonnées et sa ville.
3. **Le géocodage inverse ne sert qu'à la ville et au code postal**, jamais à la rue. Il fait passer la couverture du trio indispensable de 26 % à pratiquement 100 % pour Intermarché, ce qui est exactement ce dont l'application a besoin.
4. **Le géocodage s'appelle à la demande, puis on garde le résultat**, avec sa date et son écart en mètres. Le cahier des charges prévoit déjà de ne pas stocker l'adresse saisie par l'utilisateur ; ici il s'agit de la ville d'un magasin, donnée publique, que l'on peut mettre en cache sans difficulté.
5. **Filtrer les objets OSM sur le type de commerce et regrouper à 80 m** avant de compter ou d'afficher : sans ça, on affiche des stations de lavage et des doublons.
6. **Conserver le `pdvref` lu dans le tag `website`** quand il est présent : c'est le point de raccordement si l'API partenaire Intermarché est accordée un jour.
7. **Afficher la provenance et la fraîcheur** de chaque magasin : sitemap officiel pour Picard, contribution OpenStreetMap avec sa `check_date` pour Intermarché. L'utilisateur doit pouvoir signaler un magasin fermé, et ce signalement doit primer sur la donnée.
8. **Fréquence mensuelle** pour les deux enseignes, conformément au cahier des charges, avec bascule entre miroirs Overpass et aucune dépendance interactive à ce service.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 5, tableau des sources | Ligne Magasins : préciser deux méthodes distinctes. Picard par son sitemap officiel (1 267 fiches, adresse complète). Intermarché par OpenStreetMap (2 280 magasins, coordonnées complètes, ville sur 26 %), complété par géocodage inverse pour la ville |
| 5, tableau des sources | Ligne Adresse saisie : le géocodage de la BAN est désormais porté par l'IGN sur `data.geopf.fr/geocodage`, et il sert aussi au géocodage inverse des magasins |
| 3 et 4, choix du magasin | Écrire les champs minimaux : nom, ville, coordonnées. L'adresse complète est optionnelle, et un magasin sans adresse postale reste sélectionnable |
| 8, gestion des erreurs | Ajouter le cas Overpass indisponible : la mise à jour mensuelle échoue sans conséquence, les magasins déjà en base restent utilisables |
| 9, espace admin | Prévoir le signalement d'un magasin fermé ou mal placé, qui prime sur la donnée OpenStreetMap |
| 15, hypothèses | Cocher l'hypothèse 4, en précisant que la complétude d'OSM est mesurée à 86 % sur l'étalon Picard |

## 7. Résumé de suivi

- Hypothèse 4 validée. Picard : sitemap officiel, 1 267 magasins, adresse complète, horaires, coordonnées, rien à refaire depuis l'hypothèse 3. Intermarché : OpenStreetMap seulement, zéro requête vers leur site.
- Intermarché dans OSM : 4 457 objets bruts, ramenés à **2 280 magasins** après avoir écarté les stations-service et les laveries, et regroupé les doublons nœud et polygone. Coordonnées et noms à 100 %, horaires à 95 %, mais **ville à 26 %** seulement.
- Le Super d'Aix avenue des Infirmeries est bien là (`way/87801400`), avec adresse, coordonnées, horaires et téléphone concordant avec ce qu'on avait relevé à l'hypothèse 2, et son identifiant `11749` lisible dans le tag `website` : on récupère le `pdvref` de 88 % des magasins sans appeler Intermarché.
- Géocodage inverse (BAN, désormais chez l'IGN sur `data.geopf.fr/geocodage`, adresse vérifiée avant appel) : testé sur 5 magasins plus un témoin. **La ville est fiable, 5 sur 5 ; la rue ne l'est pas**, fausse 2 fois sur 3 là où on pouvait vérifier, parce que le centroïde du bâtiment tombe à plus de 50 m du point d'adresse. Décision : géocodage pour la ville et le code postal, jamais pour la rue.
- Champs minimaux retenus pour le choix d'un magasin : nom, ville, coordonnées. Complétude mesurée d'OSM : 86 %, étalonnée sur les 1 267 fiches officielles de Picard.
