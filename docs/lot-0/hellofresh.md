# Hypothèse 1 : API interne HelloFresh pour la France

Collecte du 28 octobre 2026. Prototype : `spikes/hellofresh/`.

## 1. Verdict

**Validée** : l'API interne répond pour la France sans compte ni clé, et un seul appel de recherche renvoie déjà ingrédients, quantités par palier de portions, unités, nutrition, temps, photos et URL publique.

## 2. Méthode

Deux étapes, exactement le principe lu dans `alexcodito/HelloFreshCrawler` (code lu, jamais exécuté).

**Jeton.** `GET https://www.hellofresh.fr` (page d'accueil, 577 ko de HTML), puis extraction par l'expression `"access_token":"([^"]+)"`. Le domaine français suffit : le repli sur `.com` prévu dans le prototype n'a pas servi.

**API.** `GET https://gw.hellofresh.com/api/recipes/search`, en-tête `Authorization: Bearer <jeton>`.

| Paramètre | Valeur utilisée | Rôle |
| --- | --- | --- |
| `locale` | `fr-FR` | langue des contenus |
| `country` | `fr` | catalogue français |
| `offset`, `limit` | `0`, `10` puis `10`, `10` | pagination |
| `product` | testé puis écarté | filtre par type de box |
| `max-prep-time` | testé puis écarté | filtre par temps de préparation |
| `sort` | testé, ignoré par l'API | voir limites |

**Fiche détaillée.** `GET https://gw.hellofresh.com/api/recipes/{id}` répond aussi, mais renvoie exactement le même objet qu'un item de recherche (comparaison octet par octet : identique, zéro champ en plus). Un second appel par recette est donc inutile.

**Jeton, durée de vie.** C'est un JWT de 205 caractères, charge utile `iat`, `exp`, `iss`, `jti` (aucune donnée personnelle, aucune portée). Durée de vie annoncée : 2 629 743 s, soit 30,4 jours. Le jeton obtenu était déjà émis depuis quelques minutes au moment de la collecte, donc il est mis en cache côté site et partagé entre visiteurs. Il n'a été écrit ni dans `data/`, ni dans le journal, ni ici : seules ses dates sortent du module `src/jeton.ts`.

**Charge appliquée.** 9 requêtes par le prototype, strictement séquentielles, 4 s d'attente entre chacune (au-dessus du minimum de 3 s), agent utilisateur honnête annonçant le prototype. Aucun statut 403, 429 ni captcha. Aucun PDF de fiche recette téléchargé. Journal complet dans `data/requetes.log`. S'y ajoutent 3 appels manuels à des pages publiques du site, pour vérifier les URL de recettes (section 4), soit 12 requêtes pour toute l'hypothèse.

**Total de recettes FR annoncé** par le champ `total`, mesuré trois fois pour isoler l'effet des filtres :

| Requête | `total` |
| --- | --- |
| Sans filtre | **14 856** |
| Avec le filtre `product` du dépôt tiers | 12 019 |
| Avec `max-prep-time=60` | 14 696 |

Les 14 856 sont donc le chiffre brut du catalogue FR, mais ce n'est pas le nombre de repas exploitables (section 4).

## 3. Données disponibles

Enveloppe de réponse : `items[]`, `total`, `skip`, `take`, `count`. Pagination vérifiée sur deux pages de 10 : `skip` reflète l'`offset`, 20 identifiants distincts, **zéro doublon entre les deux pages**.

109 chemins de champs relevés sur l'échantillon de 20 recettes. Inventaire complet avec types et taux de présence : `data/inventaire-champs.json`, produit par `src/champs.ts`.

**Champs demandés**

| Besoin | Champ | Format | Présence |
| --- | --- | --- | --- |
| Ingrédients | `ingredients[]` : `id`, `uuid`, `name`, `slug`, `type`, `country`, `imageLink`, `shipped`, `allergens[]`, `family{}` | objets, catalogue de la recette sans quantité | 20/20 |
| Quantités et unités | `yields[]` : `{ yields: nombre de portions, ingredients: [{ id, amount, unit }] }` | `amount` numérique ou `null`, `id` renvoie vers `ingredients[]` | 20/20 |
| Nutrition | `nutrition[]` : `{ type, name, amount, unit }` | 9 nutriments, toujours les mêmes | 20/20 |
| Temps | `prepTime`, `totalTime` | durée ISO 8601, par exemple `PT35M` | 20/20 |
| Photo | `imageLink` et `imagePath` (CDN CloudFront, taille dans l'URL), plus `steps[].images[]` | URL | 20/20 (étapes : 17/20) |
| URL d'origine | `websiteUrl` | `https://www.hellofresh.fr/recipes/{slug}-{id}`, règle conforme sur 20/20 | 20/20 |

Les 9 nutriments, identiques sur les 20 recettes : énergie en kJ, énergie en kcal, matières grasses, dont acides gras saturés, glucides, dont sucres, fibres alimentaires, protéines, sel. Ils couvrent les quatre valeurs exigées par la section 3 du cahier des charges.

**Valeurs par portion.** Les montants de `nutrition` sont par portion, et `servingSize` est le poids d'une portion en grammes : la page du site étiquette ce bloc `par portion ({{servingSize}}g)`. Ce ne sont donc pas des valeurs pour 100 g.

**Quantités selon le nombre de portions.** Chaque palier porte ses propres quantités, il n'y a pas de quantité de base à multiplier. Deux configurations seulement dans l'échantillon : 14 recettes offrent les paliers 1, 2, 3, 4, 5 et 6, et 6 recettes n'offrent que le palier 2 (ce sont les extras et produits d'épicerie).

Comparaison ligne par ligne entre les paliers 2 et 4 portions, sur les 14 recettes comparables (195 lignes) :

| Facteur observé | Lignes |
| --- | --- |
| ×2, proportionnel | 145 |
| ×1, quantité inchangée (épices, sachets) | 26 |
| quantité `null` (« selon le goût ») | 14 |
| ×2,02, ×1,67 ou ×2,67, arrondis au conditionnement | 10 |

**Aucune recette ne double toutes ses lignes.** Calculer les quantités par multiplication fausserait donc chaque recette : il faut stocker les paliers tels quels.

**Allergènes.** Présents à deux niveaux : `allergens[]` sur la recette (19/20 recettes, 34 types distincts dont 22 en « traces de ») et `ingredients[].allergens[]` sur chaque ingrédient (53 références concernées sur 223). Chaque entrée porte `type`, `name`, `slug`, `tracesOf` et `triggersTracesOf`, donc le « contient » et le « peut contenir des traces » sont distinguables. Vocabulaire fermé, directement utilisable comme filtre de contraintes alimentaires.

**Tags.** 20/20 recettes, 24 types distincts dans l'échantillon, avec `type`, `name`, `slug`, `preferences[]` et `displayLabel`. Les types utiles au filtrage sont présents : `veggie`, `pescatarian`, `quick`, `healthy`, `high-protein`, `family-friendly`, `pork-free`, `egg-free`, `spicy`, `soup-stew`, `mediterranean`, `christmas`. Les types `addon-recipe`, `grocery-dairy`, `breakfast-kits` et `sides-delicacies` servent au contraire à exclure ce qui n'est pas un repas.

**Autres champs exploitables** : `steps[]` (`index`, `instructions`, versions HTML et Markdown, images), `utensils[]`, `cuisines[]`, `difficulty` (1 ou 2 dans l'échantillon), `averageRating`, `ratingsCount`, `favoritesCount`, `uniqueRecipeCode`, `clonedFrom`, `isAddon`, `active`, `isPublished`.

**Dates et tri.** `createdAt` et `updatedAt` sont renseignés sur 20/20, au format ISO 8601 avec fuseau. L'échantillon va du 16 septembre au 19 octobre 2026 en création, avec une mise à jour datée du jour même de la collecte : le catalogue bouge en continu. En revanche le paramètre `sort` est **ignoré** : `sort=-createdAt` et `sort=createdAt` renvoient tous deux une réponse identique, octet pour octet, à celle sans tri. Aucun filtre par date n'a été trouvé. Point positif : l'ordre par défaut est déjà du plus récent au plus ancien, vérifié sur les 20 recettes dans l'ordre rendu.

**Champs toujours nuls pour la France** : `cardLink`, `videoLink`, `category`, `label`, `comment`, `promotion`, `isComplete`, `seoName`, `seoDescription`. Les `canonical` et `canonicalLink` ne sont renseignés que sur 3/20.

## 4. Limites et risques

**Le total de 14 856 ne correspond pas à 14 856 repas.** Deux raisons mesurées sur l'échantillon.

- Hors repas : 6 recettes sur 20 sont des extras ou des produits d'épicerie (`isAddon`, tags `addon-recipe`, `grocery-dairy`, `breakfast-kits`, `sides-delicacies`). Trois d'entre elles n'ont qu'un seul ingrédient, et ce sont les mêmes 6 qui n'offrent aucun choix de portions.
- Doublons : 20 identifiants distincts pour seulement **14 noms distincts**. Le même plat est republié d'une saison à l'autre, avec `clonedFrom` renseigné sur 20/20. Le préfixe de `uniqueRecipeCode` (`RFR60402-SS-1-10` et `RFR60402-10` partagent `RFR60402`) regroupe 13 préfixes pour 20 recettes, mais ni le préfixe ni le nom ne suffisent seuls : 2 préfixes portent plusieurs noms, et deux recettes de même nom ont des préfixes différents.

Ordre de grandeur après nettoyage : nettement moins de 10 000 recettes réellement distinctes et cuisinables. À mesurer sur la collecte complète.

**Portions limitées à 6.** Le cahier des charges prévoit des foyers de 1 à 35 personnes, l'API s'arrête à 6 portions, et les quantités ne sont pas proportionnelles. Au-delà de 6 portions, toute quantité sera une extrapolation de notre part.

**Pas de collecte incrémentale par requête.** `sort` ignoré, aucun filtre par date : impossible de demander « les recettes créées depuis telle date ». Il faut parcourir les pages dans l'ordre par défaut et s'arrêter quand on retombe sur du connu. Ce comportement n'est pas garanti par un contrat d'API, il est seulement observé.

**URL publique peu fiable.** La règle `{slug}-{id}` est conforme sur 20/20, mais sur 3 URL réellement appelées, 2 répondent 404 alors que `active` et `isPublished` valent `true`. Une recette présente dans l'API n'a donc pas forcément de page publique en ligne.

**Temps contradictoires.** `prepTime` est supérieur à `totalTime` sur 10 recettes sur 20, par exemple 45 min de préparation pour 35 min au total. Un des deux champs ne veut pas dire ce que son nom suggère. Aucun minuteur n'est renseigné dans les étapes (0/20), alors que le champ existe.

**Le dépôt tiers ne récupérerait rien en France** : `cardLink` est nul sur 20/20, donc il n'y a aucun PDF de fiche recette à télécharger sur le catalogue FR. Décision confirmée : on réécrit, on ne réutilise pas.

**API interne, non documentée.** Elle peut changer sans préavis : noms de paramètres, forme du jeton, domaine. Le jeton actuel vit 30 jours, mais rien ne garantit cette durée ; il faut le relire si un appel renvoie 401.

**Aucune donnée de prix.** Rien de surprenant, mais cela confirme que le coût viendra entièrement de Picard et d'Intermarché.

**Volume.** Environ 25 ko de JSON par recette (260 ko pour 10 recettes). Pour 14 856 recettes, prévoir de l'ordre de 371 Mo de JSON brut. En pages de 10, cela fait 1 486 requêtes, soit 1 h 40 à 4 s d'écart : la collecte initiale tient en une soirée, mais le plafond de `limit` n'a pas été testé (le dépôt tiers demandait 500 par page), car l'échantillon du lot 0 est plafonné à 20 recettes.

## 5. Décisions prises

1. **Un seul appel par lot de recettes.** La recherche renvoie le même objet que la fiche détaillée : pas d'appel par recette, ce qui divise la collecte par 10.
2. **Stocker le JSON brut par recette, clé `id`**, et normaliser ensuite. `uuid` existe aussi mais `id` est ce que l'API accepte en chemin.
3. **Stocker chaque palier de `yields` tel quel**, sans jamais multiplier une quantité de base. Pour un foyer de plus de 6 personnes, extrapoler depuis le plus grand palier disponible et le signaler à l'utilisateur. Règle d'arrondi à définir au lot des recettes.
4. **Dédoublonner en deux temps** : regroupement automatique par préfixe de `uniqueRecipeCode` et par nom normalisé, puis revue manuelle des groupes litigieux. On garde la plus récente par `updatedAt`.
5. **Exclure du planning** les recettes `isAddon` ou portant un tag hors repas, sans les supprimer de la base.
6. **Collecte incrémentale par recoupement** : parcourir les pages depuis `offset=0` dans l'ordre par défaut et s'arrêter après une page entièrement déjà connue, avec une marge de deux pages. Détecter les mises à jour par `updatedAt`. Pas de confiance au paramètre `sort`.
7. **Marquer « placard » les ingrédients `shipped: false`** : 76 références sur 223 dans l'échantillon, ce qui donne une base de départ gratuite pour la règle de la section 6 du cahier des charges, à affiner à la main.
8. **Nutrition HelloFresh conservée comme valeur de référence par portion**, pour recouper notre propre calcul fondé sur les produits magasin. Ne pas la confondre avec des valeurs pour 100 g.
9. **Ne pas afficher `websiteUrl` comme lien cliquable** sans vérification, vu les 404. Le conserver comme provenance de la donnée.
10. **Temps de recette : ne pas se fier aux noms des champs.** Retenir le maximum des deux valeurs comme durée affichée, en attendant un recoupement avec les pages publiques.
11. **Rythme de collecte** : requêtes séquentielles, 4 s d'écart, agent utilisateur honnête, relecture du jeton sur 401. Tester une `limit` plus élevée au moment de la collecte réelle, en partant de 50 et en vérifiant que `total` et `count` restent cohérents.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 5, tableau des sources | Ligne HelloFresh : préciser qu'un seul appel de recherche suffit (pas d'appel par recette), que la mise à jour se fait par recoupement des pages récentes et non par filtre de date, et que le volume brut est de l'ordre de 371 Mo |
| 5, modèle de données | Recette → Ingrédient doit porter la quantité **par palier de portions** (1 à 6), et non une quantité unique : ajouter le palier à la relation |
| 6, correspondance et conversions | Ajouter les unités réellement rendues par HelloFresh : `g`, `ml`, `pièce(s)`, `cc`, `cs`, `sachet(s)`, `paquet(s)`, `pot(s)`, `cm`, `selon le goût`. Les deux dernières ne sont pas convertibles : prévoir le cas « quantité non chiffrée » |
| 6, produits « placard » | Noter que `shipped: false` donne une première liste automatique |
| 6, nutrition | Préciser que HelloFresh fournit du **par portion** (plus `servingSize` en grammes) alors que notre calcul part des valeurs pour 100 g des produits : les deux sources se recoupent mais ne se cumulent pas |
| 3 et 4, foyer de 1 à 35 personnes | Ajouter la limite : au-delà de 6 portions, les quantités sont extrapolées et doivent être signalées comme telles |
| 14, analyse des outils | Corriger le constat : en France `cardLink` est nul, le dépôt tiers ne téléchargerait donc aucun PDF. Le jeton se lit bien sur hellofresh.fr |
| 15, hypothèses | Cocher l'hypothèse 1, et remplacer « toutes les recettes FR » par « 14 856 annoncées, nettement moins après exclusion des extras et des doublons » |

## 7. Résumé de suivi

- Hypothèse 1 validée : API interne HelloFresh accessible pour la FR, jeton JWT lu sur hellofresh.fr (valide 30 jours), 14 856 recettes annoncées, 20 collectées.
- Un seul appel `recipes/search` renvoie tout : ingrédients, quantités par palier de portions, unités, nutrition (9 valeurs par portion), temps, photos, allergènes, tags, étapes, `websiteUrl`.
- Les quantités ne sont pas proportionnelles au nombre de portions (145 lignes ×2, 26 inchangées, 10 arrondies sur 195) : stocker chaque palier de 1 à 6 tel quel, extrapoler au-delà.
- Limites : total gonflé par les extras et les doublons (14 noms pour 20 recettes), `sort` et filtres de date ignorés donc mise à jour par recoupement, `websiteUrl` en 404 sur 2 des 3 URL testées, `prepTime` incohérent sur 10/20, aucun PDF en FR.
- Aucun blocage rencontré : 12 requêtes espacées de 4 s, zéro 403, zéro captcha. Prochaine hypothèse : Intermarché.
