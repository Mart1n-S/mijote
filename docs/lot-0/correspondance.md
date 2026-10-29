# Hypothèse 6 : correspondance ingrédient vers produit

Analyse du 28 octobre 2026. Prototype : `spikes/correspondance/`. **Aucune requête réseau** : tout vient des `data/` des hypothèses 1, 3 et 5.

## 1. Verdict

**Validée** : le critère de 80 % est atteint sur la mesure principale. Sur le jeu de contrôle, la bonne correspondance figure dans les 3 premières suggestions pour **100 % des ingrédients côté Picard** et **89 % côté Ciqual**. Sur l'ensemble des 87 ingrédients, 86 % et 89 %. Le point de départ mesuré aux hypothèses 3 et 5, un simple rapprochement de mots, plafonnait à 64 % et 79 %.

Il reste une faiblesse réelle : quand un ingrédient n'a aucun équivalent dans la source, la méthode propose quand même quelque chose **deux fois sur trois côté Picard et une fois sur deux côté Ciqual**.

## 2. Méthode

### Critère, tel que précisé

| Mesure | Définition |
| --- | --- |
| **Principale** | un verdict « bon » parmi les **3 premières** suggestions, sur les ingrédients **à acheter** (hors placard) **et qui ont un équivalent « bon »** dans la source mesurée |
| Secondaire | la même, en acceptant les variantes utilisables dans la recette |
| Première suggestion | la même, limitée au premier rang, pour comparer |
| Sécurité | sur les ingrédients **sans aucun équivalent**, la méthode propose-t-elle quand même quelque chose ? |

La condition « qui ont un équivalent » est indispensable : sans elle, Picard plafonnerait mécaniquement à un tiers, puisqu'il ne vend ni farine, ni vinaigre, ni sucre. Et la restriction aux ingrédients à acheter écarte les 22 produits de placard que HelloFresh ne livre pas (`shipped: false`), ce qui laisse 65 ingrédients.

**Ce comptage remplace celui de `picard.md`.** Sur ces 65 ingrédients à acheter, **22 ont un équivalent « bon » chez Picard et 33 un équivalent utilisable**, verdicts affinés après la revue des 544 couples de cette hypothèse. Le rapport de l'hypothèse 3 annonçait 13 correspondances franches et 29 utilisables sur les 87 ingrédients, produits de placard compris : c'est le même catalogue vu avec une vérité de référence plus large et un périmètre différent, et ce sont les chiffres de cette hypothèse qui font foi.

### Vérité de référence

Les sept méthodes ont été lancées sur les 87 ingrédients et les deux sources, et l'union de leurs 3 premières suggestions forme **544 couples distincts**, tous relus un par un. Seuls les couples acceptables sont énumérés dans `src/verites.ts` ; **tout couple proposé et absent de ces listes est donc jugé faux**. Les couples jamais proposés n'ont pas de verdict et ne comptent ni pour ni contre.

Trois catégories, selon la définition retenue :

- **bon** : le candidat est l'ingrédient, éventuellement découpé, surgelé ou conditionné (oignons en cubes pour oignon) ;
- **variante** : ce n'est pas exactement l'ingrédient mais la recette s'en accommode (cacahuètes salées pour non salées, oignon rouge pour oignon) ;
- **faux** : une préparation qui contient l'ingrédient (riz cantonais pour riz, purée pour pommes de terre), ou un aliment différent.

Une préparation n'est jamais une variante : elle apporte d'autres ingrédients, donc elle ne remplace pas celui de la recette.

### Garde-fou contre le surajustement

Les 87 ingrédients sont partagés par une règle annoncée d'avance, le rang alphabétique modulo 3 : **58 pour le réglage, 29 pour le contrôle**. Les ingrédients de contrôle n'ont jamais servi à mettre au point une méthode, ni à calibrer un seuil, ni même à diagnostiquer une erreur : le diagnostic (`src/detail.ts`) et la calibration (`src/seuil.ts`) sont tous deux limités au jeu de réglage.

### Ce que les données permettent, et ce qu'elles interdisent

| Donnée | Portée réelle |
| --- | --- |
| 87 ingrédients HelloFresh, avec placard ou non | complète |
| 1 605 produits Picard | **slug d'URL seulement** |
| Noms réels des produits Picard | 50 seulement |
| Rayon Picard | **10 seulement** |
| 3 484 aliments Ciqual avec code de groupe | complète |

Deux conséquences. D'abord, exclure les plats cuisinés « par le rayon » est impossible côté Picard : il a fallu une liste de mots. Côté Ciqual, les groupes existent pour tous les aliments, donc le filtrage est propre. Ensuite, les noms réels n'étant connus que pour les 50 fiches récupérées, le rapprochement se fait partout sur le slug : utiliser les noms avantagerait justement les produits les plus susceptibles d'être la bonne réponse, ce qui fausserait la mesure. **Après une collecte complète, le connecteur disposera des noms et des catégories de tous les produits : les chiffres Picard de ce rapport sont donc un plancher.**

### Les sept méthodes, en couches

| Méthode | Ce qu'elle ajoute |
| --- | --- |
| **M0** | la méthode naïve des hypothèses 3 et 5 : mots communs, premier mot exigé |
| **M1** | normalisation : singulier, mots vides, et le bruit des libellés Picard (formats, origines, labels, `bio`, `msc`, `srp`) |
| **M2** | ingrédient canonique : parenthèses, première variante avant « ou », qualificatifs d'achat, et **mots d'unité** (gousse, brin, botte, pincée) |
| **M3** | pondération IDF, bonus si le mot principal est en tête, pénalité sur les mots du produit absents de l'ingrédient, et mot exigé = le **plus discriminant** au lieu du premier |
| **M4** | exclusion des plats cuisinés (mots pour Picard, **groupes** pour Ciqual) et accord d'état |
| **M5** | trigrammes de caractères en départage et en repli |
| **M6** | **recouvrement** : l'ingrédient doit expliquer au moins 40 % des mots de la partie principale du nom |
| **M7** | **état par défaut** (un ingrédient s'achète cru) et pénalité normalisée sur la part de nom non expliquée |

## 3. Résultats mesurés

Cette hypothèse ne découvre aucune source de données : elle mesure une méthode. La section « Données disponibles » du plan de rapport est donc remplacée par les mesures, les bugs rencontrés et les couples que j'ai tranchés à la main.

### Jeu de contrôle, les 29 ingrédients jamais utilisés pour régler

| Méthode | Picard : 3 premières | Picard : 1re | Ciqual : 3 premières | Ciqual : 1re |
| --- | --- | --- | --- | --- |
| M0 naïve | 5/9 (56 %) | 4/9 (44 %) | 13/18 (72 %) | 12/18 (67 %) |
| M1 normalisation | 5/9 (56 %) | 4/9 (44 %) | 14/18 (78 %) | 13/18 (72 %) |
| M2 canonique | 6/9 (67 %) | 5/9 (56 %) | 14/18 (78 %) | 13/18 (72 %) |
| M3 pondération | 9/9 (100 %) | 6/9 (67 %) | 15/18 (83 %) | 13/18 (72 %) |
| M4 plats et état | 9/9 (100 %) | 8/9 (89 %) | 17/18 (94 %) | 14/18 (78 %) |
| M5 trigrammes | 9/9 (100 %) | 8/9 (89 %) | **17/18 (94 %)** | 14/18 (78 %) |
| M6 recouvrement | 9/9 (100 %) | 8/9 (89 %) | 16/18 (89 %) | 13/18 (72 %) |
| **M7 état par défaut** | **9/9 (100 %)** | **9/9 (100 %)** | 16/18 (89 %) | **14/18 (78 %)** |

### Ensemble des 87 ingrédients, et taux de propositions absurdes

| Méthode | Source | 3 premières (bon) | 1re (bon) | 3 premières (utilisables) | Propositions absurdes |
| --- | --- | --- | --- | --- | --- |
| M0 naïve | Picard | 14/22 (64 %) | 10/22 (45 %) | 25/33 (76 %) | 24/32 (75 %) |
| M5 trigrammes | Picard | **21/22 (95 %)** | 19/22 (86 %) | 28/33 (85 %) | 28/32 (88 %) |
| M7 état par défaut | Picard | 19/22 (86 %) | 18/22 (82 %) | 25/33 (76 %) | **20/32 (63 %)** |
| M0 naïve | Ciqual | 37/47 (79 %) | 31/47 (66 %) | 50/55 (91 %) | 6/10 (60 %) |
| M5 trigrammes | Ciqual | **43/47 (91 %)** | 31/47 (66 %) | 50/55 (91 %) | 8/10 (80 %) |
| M7 état par défaut | Ciqual | 42/47 (89 %) | **35/47 (74 %)** | 48/55 (87 %) | **5/10 (50 %)** |

**Lecture.** Le critère des 80 % est atteint par M4 et au-delà. M5 a le meilleur rappel brut, M7 la meilleure tenue : il propose nettement moins d'absurdités (63 % contre 88 % côté Picard) et retrouve mieux la bonne réponse au premier rang côté Ciqual (74 % contre 66 %). C'est M7 que je retiens, parce qu'une suggestion absurde coûte plus cher qu'une suggestion manquante : elle demande à l'utilisateur de la rejeter, et elle entame sa confiance dans les suivantes.

### Ce que chaque couche apporte

Les deux sauts sont nets et instructifs. **M3** fait passer Picard de 67 à 100 % sur le contrôle : la pénalité sur les mots en trop écarte enfin « écrasée de pommes de terre à l'huile d'olive » proposée pour « huile d'olive ». **M4** fait gagner 11 points à Ciqual en écartant les groupes « entrées et plats composés », « glaces » et « aliments infantiles ». **M6 et M7** ne gagnent presque rien en rappel mais divisent les propositions absurdes par deux.

### Cinq bugs trouvés en route, tous instructifs

**Le pluriel en `-eaux`.** Ma règle « `-aux` devient `-al` » (chevaux, journaux) transformait « poireaux » en « poireal ». Résultat : plus aucun produit ne correspondait à l'ingrédient « Poireau », et l'erreur était invisible, puisqu'elle se traduisait seulement par une absence de suggestion. L'ordre des règles compte.

**Le mot d'unité plus lourd que l'aliment.** « Gousse d'ail » proposait « Vanille, gousse » : « gousse » est plus rare que « ail », donc plus lourd en IDF. En retirant les mots d'unité de l'ingrédient, « Ail, cru » et `ail-coupe` arrivent en tête.

**L'état traité comme du bruit.** J'avais mis `cuit` et `precuit` dans la liste du bruit Picard, avec les formats et les origines. Ils décrivent l'état de l'aliment : « Riz précuit » ne pouvait plus trouver « Riz blanc, précuit, cuit ».

**Le mot exigé absent du catalogue, trouvé par l'hypothèse 7.** La méthode exige la présence du mot le plus discriminant de l'ingrédient. Sur une entrée qui porte une marque, comme un libellé de facture de courses, le mot le plus rare **est** la marque, et aucun catalogue d'ingrédients ne la contient : la méthode se taisait alors complètement, sur les 79 lignes de factures de l'hypothèse 7. Corrigé en restreignant le mot exigé au vocabulaire du catalogue visé. L'effet sur les mesures de cette hypothèse est double et honnête : Ciqual gagne quelques points en rappel (M4 passe de 89 à 94 % sur le contrôle), mais les propositions absurdes côté Picard passent de 34 à 63 %, parce qu'une méthode qui se rabat sur un mot connu parle plus souvent. Les tableaux ci-dessus sont ceux d'après correction.

**Le seuil de score qui ne peut pas fonctionner.** J'ai voulu calibrer un seuil sous lequel ne rien proposer. Mesure faite : côté Picard, une bonne première suggestion score entre 3,0 et 5,7, et un ingrédient **sans équivalent** monte jusqu'à 8,9, parce que des dizaines de plats contiennent le mot « huile d'olive ». Les deux populations se chevauchent et s'inversent : un seuil absolu est inutilisable. C'est ce constat qui a mené au recouvrement, qui est une mesure relative, donc comparable d'un ingrédient à l'autre.

### Les 30 couples que j'ai tranchés moi-même

Ce sont les cas où mon verdict est discutable. Si tu en contredis un, les chiffres changent : ils sont dans `src/verites.ts`, modifiables en une ligne.

| Source | Ingrédient | Candidat | Mon verdict |
| --- | --- | --- | --- |
| Picard | Citron | `jus-citron` | variante |
| Picard | Chutney d'abricots | `chutney-figues-epices` | variante |
| Picard | Cacahuètes non salées | `cacahuete-grilee-salee` | variante |
| Picard | Mélange de cranberries et noix | `melange-noix` | variante |
| Picard | Noix concassées | `melange-noix` | variante |
| Picard | Oignon | `oignons-rouges-eminces` | variante |
| Picard | Pâte à tarte | `2-pates-brisee-pre-etalee` | bon |
| Picard | Pâte à tarte | `2-pates-pizza` | **faux**, corrigé par Martin |
| Picard | Pâte à pizza | `2-pates-feuilletees-bloc` | **faux**, corrigé par Martin |
| Picard | Riz | `riz-basmati-cuit` | variante |
| Picard | Riz précuit | `riz-basmati-cuit` | bon |
| Picard | Thym séché | `thym-coupe` (surgelé) | variante |
| Picard | Salade en sachet | `melange-pour-salade` | variante |
| Picard | Sauce soja au sésame | `sauce-soja-salee` | variante |
| Picard | Filet de poulet Label Rouge | `filets-poulet-7-10-pieces` | variante |
| Picard | Marrons | `marrons-entiers-750g` | bon |
| Picard | Bouillon de volaille | `1kg-bouillon-asiatique` | **faux** |
| Picard | Burrata | `burrata-al-forno` | **faux** |
| Picard | Edamame | `edamame-sauce-epicee` | **faux** |
| Picard | Panais | `trois-legumes-carottes-panais-betteraves` | **faux** |
| Picard | Pommes de terre | `pommes-terre-facon-rotissoire` | **faux** |
| Ciqual | Sel | Fleur de sel, non iodée | bon |
| Ciqual | Tranches de carré de porc | Porc, carré cru | bon |
| Ciqual | Sucre | Sucre blanc | bon, et Sucre roux en variante |
| Ciqual | Œuf | Oeuf dur, Oeuf poché | variante ; Oeuf en poudre **faux**, corrigé par Martin |
| Ciqual | Farine (non qualifiée) | Farine de riz, de maïs, de châtaigne | variante |
| Ciqual | Riz | Riz, mélange de variétés | variante |
| Ciqual | Lait | Lait de chèvre entier cru | variante |
| Ciqual | Poivre et sel | Poivre noir, poudre | variante |
| Ciqual | Épices à l'italienne | Épice (aliment moyen) | variante |

## 4. Limites et risques

**Les échantillons de contrôle sont petits.** 9 ingrédients dans le périmètre Picard, 18 dans le périmètre Ciqual. Le 100 % de Picard ne doit pas être lu comme une garantie : un seul échec ferait 89 %. C'est la cohérence entre le contrôle et l'ensemble (86 % et 89 %) qui donne confiance, pas le 100 % isolé.

**La vérité de référence est la mienne.** J'ai conçu les méthodes et étiqueté les couples. La convention « tout couple proposé et non listé est faux » protège contre l'oubli d'un bon couple à mon avantage, mais pas contre une définition trop généreuse de « variante ». Les 30 couples listés en section 3 sont là pour que tu puisses me contredire.

**Les propositions absurdes restent le point faible, et la correction venue de l'hypothèse 7 les a aggravées.** Pour les ingrédients que Picard ne vend pas, la méthode propose quelque chose dans 63 % des cas, contre 34 % avant correction : en acceptant de se rabattre sur un mot connu du catalogue quand le mot le plus rare en est absent, elle parle plus souvent, donc elle se trompe plus souvent aussi. La parade n'est pas technique mais d'interface : proposer, ne jamais imposer, et offrir « aucun de ces produits » comme premier choix.

**Un produit cuit rapproché d'un ingrédient cru demande une conversion de quantité.** « Riz basmati cuit » est une variante acceptable de « Riz », mais 100 g de riz cuit ne valent pas 100 g de riz cru : le riz gagne un facteur de **2,5 à 3 à la cuisson, à vérifier**, et la composition pour 100 g change d'autant. Deux conséquences. La liste de courses porte toujours la **forme d'achat, crue** : c'est elle qu'on met dans le panier et qu'on paie. Et tout rapprochement vers une forme cuite, chez Picard comme dans Ciqual, doit porter un facteur de conversion, sans quoi les quantités et la nutrition seront fausses. Ce facteur n'est pas mesuré ici : il relève de la table d'équivalences de la section 6 du cahier des charges.

**Le rapprochement par les slugs sous-estime Picard.** Les slugs perdent les accents, la ponctuation et parfois des mots (`1kg-puree-carotte-srp`). Avec les noms réels et les catégories d'une collecte complète, les résultats devraient monter.

**Les mots de plats sont une liste, donc une dette.** Elle compte aujourd'hui une centaine d'entrées, bricolées à partir de ce catalogue. Elle sera fausse sur un autre catalogue, et elle bloque au passage des ingrédients légitimes : « pain » est dans la liste, donc du pain de mie comme ingrédient serait écarté. Côté Ciqual, le filtrage par groupe est bien plus propre et devrait servir de modèle : il faudra donc les catégories Picard.

**Deux ingrédients résistent côté Ciqual** même avec M7, sur le jeu de contrôle. Je ne les détaille pas ici : les examiner reviendrait à me servir du jeu de contrôle pour améliorer la méthode, ce qui annulerait sa valeur.

**Aucune mesure sur Intermarché.** Il n'y a pas de catalogue à rapprocher, puisque la collecte y est abandonnée. C'est le choix manuel de l'utilisateur, décidé à l'hypothèse 3, qui tient ce rôle.

## 5. Décisions prises

1. **Retenir M7** comme méthode de suggestion : normalisation, ingrédient canonique, pondération IDF, exclusion des plats, accord d'état avec préférence par défaut pour le cru, recouvrement minimum de 40 % et pénalité normalisée.
2. **Proposer trois suggestions, jamais une seule.** L'écart entre la première suggestion et les trois premières est de 7 à 18 points : c'est l'utilisateur qui tranche, et le gain est réel.
3. **Offrir « aucun de ces produits » en premier choix**, et ne jamais préselectionner une suggestion. C'est la seule parade honnête aux deux tiers de propositions absurdes côté Picard, et à la moitié côté Ciqual.
4. **Mémoriser le choix par ingrédient canonique**, comme déjà décidé, et ne plus jamais reposer la question.
5. **Deux sources, deux usages** : Picard pour le produit à acheter, Ciqual pour la nutrition d'un ingrédient sans code-barres. Les deux rapprochements sont indépendants et tous deux validés une fois à la main.
6. **Préférer le filtrage par catégorie à la liste de mots** dès que les catégories Picard seront collectées, et conserver la liste comme repli.
7. **Garder la mesure comme test de non-régression** : les 544 couples étiquetés et le partage réglage/contrôle sont reproductibles. Toute évolution de la méthode devra être mesurée sur le même jeu, et le jeu de contrôle devra rester intouché.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 6, correspondance ingrédient vers produit | Remplacer « proposition automatique du produit le plus proche » par « trois suggestions classées, avec « aucun de ces produits » en premier choix », et inscrire la méthode retenue (normalisation, canonique, IDF, exclusion des plats, accord d'état, recouvrement minimum) |
| 6, correspondance | Inscrire le résultat mesuré : la bonne correspondance est dans les trois premières suggestions dans 86 % des cas côté Picard et 89 % côté Ciqual, et les ingrédients sans équivalent reçoivent encore une proposition inutile deux fois sur trois côté Picard, une fois sur deux côté Ciqual |
| 3, fonctionnalités | Préciser que l'association se valide une fois par ingrédient canonique, et qu'elle est modifiable ensuite |
| 11, stack technique | Noter que la suggestion est un calcul local sur le catalogue déjà collecté : aucun service externe, aucun modèle d'IA |
| 12, agents et skills | La correspondance ne nécessite pas d'IA : une mesure reproductible et sept couches de règles suffisent à dépasser le critère. À reconsidérer seulement si le catalogue complet dégrade les chiffres |
| 15, hypothèses | Cocher l'hypothèse 6 avec le critère atteint, en précisant la définition retenue : verdict « bon » dans les trois premières suggestions, sur les ingrédients à acheter qui ont un équivalent dans la source |

## 7. Résumé de suivi

- Hypothèse 6 validée, sans aucune requête réseau. Le critère de 80 % est atteint : la bonne correspondance est dans les **3 premières suggestions** pour 100 % des ingrédients Picard et 89 % des Ciqual sur le jeu de contrôle, 86 % et 89 % sur l'ensemble des 87. Le rapprochement naïf des hypothèses 3 et 5 plafonnait à 64 % et 79 %.
- Sept méthodes comparées en couches sur 544 couples étiquetés à la main, avec 29 ingrédients de contrôle jamais utilisés pour le réglage. Les deux gains décisifs : pénaliser les mots du produit absents de l'ingrédient (Picard, 67 à 100 %) et écarter les groupes de plats composés (Ciqual, plus 11 points).
- Méthode retenue, M7 : normalisation du bruit commercial, ingrédient canonique avec retrait des mots d'unité, pondération IDF, exclusion des plats, préférence par défaut pour l'aliment cru, et recouvrement minimum de 40 % du nom du produit.
- Faiblesse assumée : pour un ingrédient que la source ne vend pas, la méthode propose quelque chose deux fois sur trois côté Picard, et une fois sur deux côté Ciqual. Un seuil de score ne peut pas y remédier, c'est mesuré : les scores des bonnes réponses et des absurdités se chevauchent et s'inversent. La parade est l'interface, avec « aucun de ces produits » en premier choix.
- Cinq bugs trouvés et consignés, dont un pluriel « poireaux » devenu « poireal » qui rendait l'ingrédient introuvable sans jamais lever d'erreur, et le mot exigé absent du catalogue, remonté par l'hypothèse 7 sur des libellés portant une marque.
