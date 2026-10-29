# Hypothèse 3 : fiches produits Picard et disponibilité par magasin

Collecte du 28 octobre 2026. Prototype : `spikes/picard/`. Magasin de test : Picard Aix Malacrida, 11 avenue Henri Malacrida, 13100 Aix-en-Provence.

## 1. Verdict

**Validée** : les fiches produit se lisent sans navigateur, avec nom, prix, prix au kilo, conditionnement, disponibilité et code-barres exposés en microdonnées `schema.org`, sur des chemins autorisés. Deux réserves importantes : la disponibilité **par magasin** n'est pas accessible sans emprunter un chemin interdit par leur `robots.txt`, et le catalogue Picard ne couvre qu'environ **un tiers** des ingrédients HelloFresh.

## 2. Méthode

**Cadre.** `robots.txt` respecté sans exception. Le garde-fou (`src/garde.ts`) est le seul point de sortie réseau : il refuse d'abord une liste noire recopiée ligne par ligne des `Disallow` du site, puis n'autorise que les URL **sans aucun paramètre de requête** sur `www.picard.fr` et `magasins.picard.fr`. C'est suffisant pour être conforme, car tous leurs `Disallow` visent soit un chemin (dans la liste noire), soit un paramètre de requête (impossible sans point d'interrogation). Plafond de 30 requêtes, 4 s d'écart, arrêt immédiat sur 401, 403, 429 ou page de blocage.

**Découverte par le sitemap, pas par la recherche.** `robots.txt` interdit `*/Search-Show*` et `*/recherche`, mais **publie un sitemap** : `https://www.picard.fr/sitemap_0.xml`. L'énumération des produits passe donc par le mécanisme que Picard fournit lui-même. Aucune zone grise, et aucune exception à demander.

**Charge réelle : 28 requêtes, 28 réponses 200.** Aucun 403, aucun captcha, aucune page de blocage. Journal complet dans `data/requetes.log`.

**À ces 28 requêtes s'en ajoutent 40**, émises plus tard sur `picard.fr` pour l'hypothèse 5, afin de récupérer 40 fiches produit de plus et leurs codes-barres (voir `docs/lot-0/open-food-facts.md`). **Soit 68 requêtes au total sur ce domaine pour le lot 0**, toutes en 200, toutes à 4 s d'écart.

| Étape | Script | Requêtes |
| --- | --- | --- |
| `robots.txt` et sitemap du catalogue | `src/sitemap.ts` | 2 |
| Extraction des ingrédients HelloFresh (hors ligne) | `src/ingredients.ts` | 0 |
| Rapprochement et choix des 10 fiches (hors ligne) | `src/choix.ts` | 0 |
| 10 fiches produit, plus une fiche de mise au point | `src/produits.ts` | 11 |
| Analyse des pages enregistrées (hors ligne) | `src/extraction.ts` | 0 |
| `robots.txt`, sitemaps et fiche du magasin | `src/magasin.ts` | 15 |

Les 15 requêtes du magasin incluent les tâtonnements sur la structure du sitemap du localisateur, qui est un index à quatre entrées. L'analyse des pages est volontairement séparée de leur récupération : `src/extraction.ts` relit les fichiers de `data/`, ce qui permet de corriger un extracteur sans jamais resolliciter le site.

**Choix des 10 fiches.** Elles ne sont pas prises au hasard : `src/choix.ts` rapproche hors ligne les 87 ingrédients distincts de l'échantillon HelloFresh des 1 605 slugs de produits du sitemap, puis j'ai **validé les correspondances à la main** avant de récupérer quoi que ce soit.

## 3. Données disponibles

### Catalogue

| Mesure | Valeur |
| --- | --- |
| URL dans `sitemap_0.xml` | 3 240 |
| Dont fiches produit (`/produits/<slug>-<18 chiffres>.html`) | **1 605** |
| Le reste | recettes, astuces, pages de rayon, pages éditoriales |
| `lastmod` présent | **1 605 / 1 605, soit 100 %** |
| Plage des `lastmod` | 5 juin 2020 au 26 octobre 2026 |
| `changefreq` rencontrées | `always`, `hourly`, `daily`, `weekly`, `monthly`, `never` |

**Le `lastmod` par produit existe et il est complet.** C'est la réponse à ta deuxième question : une mise à jour hebdomadaire incrémentale est possible, en ne rechargeant que les fiches dont le `lastmod` a bougé depuis le dernier passage. Sur l'échantillon, les dates récentes s'étalent du 16 au 26 octobre, donc le site touche ses fiches en continu.

### Fiche produit

Tout est rendu côté serveur. Les microdonnées `schema.org` sont la source la plus propre.

| Besoin | Champ | Exemple de format |
| --- | --- | --- |
| Nom | `<meta itemprop="name">` | « Filets de poulet, 5 à 10 pièces » |
| Marque | `itemprop="brand"` | « Picard » |
| **Code-barres** | **`itemprop="gtin13"`** | `3270160005451` |
| Prix | `itemprop="price"` plus `priceCurrency` | `18.99`, `EUR` |
| Validité du prix | `itemprop="priceValidUntil"` | `2026-11-15` |
| Disponibilité | `itemprop="availability"` | `https://schema.org/InStock` ou `OutOfStock` |
| Description | `itemprop="description"` | texte libre |
| Images | `itemprop="image"` | URL CDN |
| Prix au kilo | bloc `pi-ProductDetails-kiloPrice` | « 18,99 €/kg » |
| Conditionnement | bloc `pi-ProductDetails-weight` | « le sachet de 1 kg » |
| Référence interne | texte « Ref: » | `000545` |
| Catégorie | fil d'Ariane plus bloc `data-gtm` | « Viandes et poissons/Volailles/Poulet et dinde » |
| Planet-Score | `alt` d'une image | `A` à `E` |
| Nutri-Score | `alt` d'une image | absent sur les 10 (voir limites) |

Les 10 fiches récupérées, telles qu'extraites :

| Ingrédient HelloFresh | Produit Picard | Prix | Au kilo | Disponibilité | Code-barres | Planet |
| --- | --- | --- | --- | --- | --- | --- |
| Filet de poulet | Filets de poulet, 5 à 10 pièces | 18,99 € | 18,99 €/kg | InStock | 3270160005451 | D |
| Champignons de Paris | Champignons de Paris émincés | 3,80 € | 3,80 €/kg | InStock | 3270160065004 | B |
| Épinards | Épinards hachés, France | 1,99 € | 1,99 €/kg | InStock | 3270160005864 | C |
| Oignon | Oignons en cubes | 2,99 € | 6,64 €/kg | InStock | 3270160128747 | C |
| Persil | Persil coupé | 2,25 € | 9,00 €/kg | InStock | deux codes | C |
| Pâte à pizza | 2 pâtes à pizza | 1,99 € | 4,23 €/kg | InStock | 3270160439768 | C |
| Moutarde | Moutarde de Bourgogne IGP | 2,99 € | 14,23 €/kg | **OutOfStock** | 3230140003914 | absent |
| Banane | Bananes en rondelles, Vietnam | 2,20 € | 7,33 €/kg | InStock | 3270160100965 | C |
| Échalote | Échalote coupée | 3,70 € | 14,80 €/kg | InStock | deux codes | C |
| Gingembre frais | Gingembre coupé | 2,00 € | 26,66 €/kg | InStock | 3270160135684 | C |

**La disponibilité est relisible au moment des courses**, et c'est la réponse à ta troisième question : `itemprop="availability"` est dans le HTML d'un chemin autorisé, il suffit de recharger l'URL du produit. Le cas de la moutarde le prouve, elle est sortie en `OutOfStock` alors que les neuf autres sont `InStock`. Mais c'est une disponibilité **nationale**, pas celle du magasin d'Aix (voir limites).

### Localisateur de magasins

`magasins.picard.fr` est un hôte distinct, avec son propre `robots.txt`, bien plus permissif : `Allow: /search/*`, et il publie lui aussi un sitemap.

| Mesure | Valeur |
| --- | --- |
| Structure | index de 4 sitemaps : `mainsitemap` (régions et villes) et `locationsitemap1` à `3` (magasins) |
| Fiches de magasin | **1 267** |
| Forme des URL | `/<identifiant>-picard-<nom du lieu>` |
| Champs de la fiche d'Aix Malacrida | titre, adresse, code postal `13100`, latitude `43.5169999`, longitude `5.4665119`, téléphone `+33 4 42 91 42 20`, horaires, JSON-LD `LocalBusiness` |

L'hypothèse 4 est donc déjà à moitié traitée pour Picard. Attention au nommage : les URL portent le nom du lieu et non celui de la ville, « aix-malacrida » et non « aix-en-provence ». Il faudra passer par la ville de la fiche, pas par l'URL.

## 4. Limites et risques

**La disponibilité par magasin existe sur le site, mais pas pour nous.** Chaque fiche produit porte un bouton « Voir la disponibilité en magasin » (classe `js-gtm-store-availability`, avec l'identifiant du produit). Il ouvre une fenêtre servie par un contrôleur `/on/demandware.store/`, que leur `robots.txt` interdit explicitement. La réponse à la question posée par le CLAUDE.md, « disponibilité par magasin ou non », est donc : **l'information existe, elle n'est pas accessible dans nos règles.** On s'en tient au catalogue national.

**Couverture des ingrédients HelloFresh : le chiffre automatique est trompeur.** Le rapprochement textuel donne 85 % en mesure large et 76 % en mesure stricte. Les deux sont faux, parce qu'un produit dont le nom contient le mot n'est pas l'ingrédient : « huile d'olive » tombe sur des crevettes à l'huile d'olive, « pomme » sur un crumble. J'ai donc revu les 87 meilleures correspondances à la main.

| Verdict manuel | Nombre | Exemples |
| --- | --- | --- |
| **Bon produit** : le produit est l'ingrédient | **13** | filets de poulet, champignons de Paris émincés, épinards hachés, oignons en cubes, persil coupé, échalote coupée, gingembre coupé, thym coupé, ciboulette coupée, bananes en rondelles, moutarde de Bourgogne, 2 pâtes à pizza |
| **Forme ou variante différente**, utilisable avec réserve | **16** | riz → riz cantonais, pommes de terre → purée, citron → jus de citron, marrons → purée de marrons, cacahuètes non salées → cacahuètes salées, chutney d'abricots → chutney de figues |
| **Faux** : un plat qui contient le mot | **45** | beurre → sablés au beurre, crème liquide → crème vanillée, sel → chips sel et poivre, mozzarella → chaussons tomate-mozzarella, vinaigre → huîtres avec sachet de vinaigre |
| **Aucun candidat** | **13** | farine, œuf, gousse d'ail, levure chimique, flocons d'avoine, paprika fumé, chapelure panko, confiture, chair de tomates, charcuterie, carré de porc |

**Couverture réelle : 13 correspondances franches, 29 au mieux en acceptant les variantes, soit environ un tiers des 87 ingrédients.** C'est cohérent avec ce que vend Picard : des légumes et des herbes surgelés, de la viande et du poisson, des pâtes à dérouler. Tout l'épicier sec (farine, sucre, levure, épices, vinaigre, huile) et le frais (œufs, crème, fromages à la coupe) manquent. Les 45 faux positifs donnent au passage une mesure préliminaire de la difficulté de l'hypothèse 6 : **52 % des propositions automatiques sont à rejeter**, ce qui confirme la validation manuelle prévue en section 6 du cahier des charges.

**Nutri-Score absent, Planet-Score présent.** Aucune des 10 fiches ne porte de Nutri-Score, alors que 9 sur 10 portent un Planet-Score. Premier piège rencontré : le mot « Nutri-Score » apparaît dans le menu de navigation de toutes les pages (« Produits Nutri-Score A »), donc une extraction naïve en trouve un partout. Le vrai score est dans l'attribut `alt` d'une image. La nutrition détaillée pour 100 g n'a pas été vérifiée champ par champ sur cette passe.

**Deux codes-barres sur certains produits** (persil, échalote) : vraisemblablement deux fournisseurs pour la même référence. Le modèle de données doit accepter plusieurs codes-barres par produit, sinon on en perd un.

**Prix en ligne contre prix en magasin.** Les prix relevés sont ceux du site de vente en ligne. Rien ne garantit qu'ils soient identiques en magasin. À vérifier avec un ticket de caisse réel, ce que l'hypothèse 7 permettra de faire.

**Fragilité de l'extraction.** Les microdonnées `schema.org` devraient être plus stables, puisqu'un site les maintient pour les moteurs de recherche, mais ce n'est qu'une hypothèse, que rien ne garantit. Le prix au kilo et le conditionnement sont lus dans des classes CSS (`pi-ProductDetails-kiloPrice`, `pi-ProductDetails-weight`) qui disparaîtront à la première refonte. Il faut traiter ces deux champs comme optionnels et savoir recalculer le prix au kilo depuis le prix et le conditionnement.

**Volume.** Les fiches pèsent de 400 à 790 ko de HTML. Recharger les 1 605 fiches représente environ 800 Mo de transfert et, à 4 s d'écart, près de 2 heures. D'où l'intérêt du `lastmod` : en régime établi, seules quelques dizaines de fiches changent par semaine.

**`priceValidUntil` identique partout** (`2026-11-15`) sur les 10 fiches : c'est la fin de la période tarifaire en cours, pas une date propre au produit. Utile comme date de péremption du prix, à ne pas interpréter comme une promotion.

## 5. Décisions prises

1. **Picard devient la source de prix principale** du projet, puisque c'est la seule enseigne dont la collecte soit à la fois techniquement possible et conforme à son `robots.txt`.
2. **Collecte par le sitemap**, jamais par la recherche : une lecture de `sitemap_0.xml`, filtrage des URL `/produits/<slug>-<18 chiffres>.html`, puis récupération des fiches.
3. **Mise à jour hebdomadaire incrémentale par `lastmod`** : on ne recharge que les fiches dont la date a changé. La collecte initiale, elle, s'étale sur deux heures à 4 s d'écart.
4. **Extraction fondée sur les microdonnées** `schema.org` en priorité, et traitement du prix au kilo et du conditionnement comme champs optionnels issus du HTML d'affichage.
5. **Le code-barres `gtin13` devient la clé de rapprochement** vers Open Food Facts (hypothèse 5) et vers les lignes de ticket de caisse (hypothèse 7). Le modèle accepte plusieurs codes-barres par produit.
6. **Vérification de la disponibilité au moment des courses** : on recharge l'URL de la fiche et on relit `itemprop="availability"`. C'est la « vérification en direct » de la section 6, avec une mention explicite dans l'interface : disponibilité **nationale**, pas celle du magasin.
7. **Ne pas promettre la disponibilité par magasin** pour Picard, et ne pas emprunter le contrôleur interdit qui la porte.
8. **Pour chaque ingrédient, c'est l'utilisateur qui choisit son produit**, parmi trois voies, sans qu'on ajoute d'enseigne collectable :
   - un **produit Picard suggéré**, proposé depuis le catalogue local déjà collecté ;
   - **« chez Intermarché »**, soit en produit générique, soit en collant le lien d'un produit. Le lien a la forme `/produit/<slug>/<ean13>` : le code-barres s'en extrait par simple lecture de l'URL, **sans aucune requête** vers le site ;
   - ou **il cherche lui-même sur le site**, à partir d'un lien que l'application lui ouvre, puis revient valider son choix.

   Le choix est **mémorisé par ingrédient**, donc la question ne se pose qu'une fois. C'est ce qui permet de vivre avec un tiers du catalogue couvert sans dépendre d'une collecte supplémentaire.
9. **Localisateur Picard : acquis.** 1 267 magasins, coordonnées GPS et horaires sur un hôte permissif avec sitemap. L'hypothèse 4 n'a plus qu'à traiter Intermarché, et sans jamais appeler leur site : par les données ouvertes d'OpenStreetMap.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 5, tableau des sources | Ligne Picard : préciser la collecte par sitemap (1 605 fiches), la mise à jour hebdomadaire incrémentale par `lastmod`, et les champs réellement disponibles. Ligne Picard (magasin) : la disponibilité par magasin est exposée sur le site mais sur un chemin interdit, donc catalogue national seulement |
| 5, tableau des sources | Ligne Magasins : pour Picard, le localisateur est sur `magasins.picard.fr`, avec sitemap et 1 267 fiches, coordonnées GPS incluses |
| 4, parcours principal, étape 4 | Préciser que la vérification en direct chez Picard porte sur la disponibilité nationale, et qu'elle doit être affichée comme telle |
| 6, correspondance ingrédient vers produit | Ajouter la mesure : sur 87 ingrédients, 52 % des propositions automatiques par rapprochement textuel sont fausses. La validation manuelle n'est pas une précaution, c'est le mécanisme principal |
| 6, règles métier | Ajouter le code-barres comme clé de rapprochement, et prévoir plusieurs codes-barres par produit |
| 3, fonctionnalités | La couverture d'une seule enseigne ne permet pas une liste de courses complète : pour chaque ingrédient, l'utilisateur choisit un produit Picard suggéré, un produit générique ou un lien Intermarché collé, ou cherche lui-même sur le site puis valide. Choix mémorisé par ingrédient |
| 11, stack technique | Noter que le connecteur Picard n'a besoin d'aucun navigateur : `fetch` et extraction de microdonnées suffisent |
| 15, hypothèses | Cocher l'hypothèse 3, en précisant « fiches lisibles oui, disponibilité par magasin non » |

## 7. Résumé de suivi

- Hypothèse 3 validée : 28 requêtes, 28 réponses 200, aucun blocage. Les fiches produit sont rendues côté serveur avec microdonnées `schema.org` : nom, marque, prix, `priceValidUntil`, disponibilité, description, images, et surtout le **code-barres `gtin13`**, plus le prix au kilo et le conditionnement dans le HTML d'affichage.
- Catalogue énuméré par le sitemap que Picard publie lui-même (pas par la recherche, qui est interdite) : 1 605 fiches produit, avec un **`lastmod` sur 100 % des URL**, donc mise à jour hebdomadaire incrémentale possible.
- La disponibilité est relisible au moment des courses en rechargeant l'URL (`InStock` ou `OutOfStock`, vérifié : la moutarde est en rupture), mais c'est une disponibilité **nationale** : celle par magasin existe derrière un contrôleur interdit par leur `robots.txt`, donc écartée.
- Couverture des ingrédients HelloFresh : le rapprochement automatique annonce 85 %, mais la revue manuelle des 87 paires donne 13 correspondances franches et 16 variantes acceptables, soit **environ un tiers**. Manquent tout l'épicerie sèche (farine, sucre, levure, épices) et le frais (œufs, crème). Picard seul ne fait pas les courses.
- Au passage, le localisateur Picard est acquis pour l'hypothèse 4 : hôte permissif avec sitemap, 1 267 magasins, coordonnées GPS, horaires et téléphone.
