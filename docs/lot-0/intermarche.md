# Hypothèse 2 : prix et disponibilité Intermarché pour un magasin donné

Collecte du 28 octobre 2026. Prototype : `spikes/intermarche/`. Magasin de test : Intermarché SUPER Aix-en-Provence, avenue des Infirmeries, 13100, identifiant interne `11749`.

## 1. Verdict

**Invalidée pour la collecte automatique** : aucun prix n'est lisible sur les pages accessibles, le site bloque techniquement (DataDome, 403 puis captcha) dès la sixième requête, et la seule voie technique restante (navigateur réel) a été écartée par décision. Les prix Intermarché viendront des tickets de caisse et de la saisie après les courses.

## 2. Méthode

**Cadre appliqué.** Le CLAUDE.md autorise une exception au `robots.txt` d'Intermarché, limitée à la vérification du prix et de la disponibilité de produits précis dans un magasin donné. Cette exception est appliquée par le code et non par la discipline : `src/garde.ts` est le seul endroit du prototype qui appelle le réseau, et il impose quatre choses.

- Une **liste noire absolue** : catalogue drive, catalogues, localisateur, liste des magasins, paramètres de tri ou de pagination, ressources internes `/_next/`. Jamais appelés, même sous l'exception.
- Une **liste blanche** : toute URL doit correspondre à une règle, et chaque règle porte son cadre, `robots-autorise` ou `exception-intermarche`. Le journal note ce cadre à chaque ligne.
- Un **plafond de 30 requêtes** et un délai de 4 s intégrés à la fonction d'appel, donc impossibles à oublier.
- Un **arrêt immédiat** sur 401, 403, 429 ou page de captcha.

**Relecture du `robots.txt`, qui réduit la portée de l'exception.** Le fichier (412 octets, 16 `Disallow`, 1 `Allow`) interdit la recherche, l'API, la sélection de magasin et le localisateur, mais **pas** les fiches produit ni les pages de rayon.

| Chemin | Règle du site | Cadre utilisé |
| --- | --- | --- |
| `/magasins/*/*/infos-pratiques` | seul `Allow` du fichier | autorisé |
| `/produit/<slug>/<ean13>` | aucun `Disallow` | autorisé |
| `/rayons/...` | aucun `Disallow` | autorisé |
| `/recherche/*`, `/rechercheproduits/*` | `Disallow` | exception |
| `/api/*` | `Disallow` | exception |
| `/?pdvref=` | `Disallow` | exception |
| `/localisation/*`, `/tous-les-magasins/*` | `Disallow` | **jamais appelés** |

**Requêtes effectivement émises** : 6 vers `intermarche.com` en `fetch`, dont **2 seulement sous l'exception**, plus 4 vers Open Prices. Journal complet dans `data/requetes.log`. À quoi s'ajoutent **2 chargements de la page d'accueil par un navigateur réel** (section 4), qui ne sont pas dans ce journal et qui ont chacun entraîné le téléchargement des ressources de la page, scripts de DataDome compris, en nombre non mesuré.

| # | URL | Cadre | Résultat |
| --- | --- | --- | --- |
| 1 | `/robots.txt` | autorisé | 200, 412 o |
| 2 | `/magasins/11749/aix-en-provence-13100/infos-pratiques` | autorisé | 200, 456 ko |
| 3 | `/?pdvref=11749` | exception | 200, 342 ko |
| 4 | `/recherche/riz%20basmati` | exception | 200, 303 ko |
| 5 | `/produit/riz-basmati/3038354536002` | autorisé | 200, 329 ko |
| 6 | `/rayons/epicerie-salee/.../riz-basmati/5653` | autorisé | **403, DataDome** |

**État du prototype livré.** L'exception au `robots.txt` a été retirée du CLAUDE.md en même temps que la collecte était abandonnée. Dans le code commité, les trois chemins concernés (recherche, API, `?pdvref=`) sont donc passés en interdits absolus du garde-fou : les requêtes 3 et 4 du tableau ne sont plus reproductibles, et leurs réponses brutes restent dans `data/`.

L'hôte d'API trouvé dans la configuration du site, `api.internal.intermarche.com` (clé `API_HOST_DOMAIN`), **ne résout pas** depuis l'extérieur : échec DNS, aucune requête HTTP émise. Son `robots.txt` n'a donc pas pu être lu, et aucun appel `/api/` n'a été tenté faute de chemin connu.

**Ce que je n'ai pas fait**, après le 403 : aucun nouvel essai en `fetch`, aucun changement d'agent utilisateur, aucun proxy, aucune lecture des bundles `/_next/` pour y trouver les chemins d'API, aucun service de résolution de captcha. L'agent utilisateur est resté `mijote-spike-lot0/0.1` du début à la fin.

**Ce que j'ai fait ensuite, et qui mérite d'être dit clairement.** Une première version de ce rapport affirmait « aucun navigateur automatisé ». C'était vrai au moment où je l'ai écrite, et faux ensuite : Martin a autorisé explicitement un essai au navigateur réel, et **Playwright a bien été lancé contre `intermarche.com`**, deux fois, le 28 octobre 2026 entre 20 h 22 et 20 h 27. Le détail est en section 4.

## 3. Données disponibles

**Fiche magasin (`infos-pratiques`), rendue côté serveur : exploitable.** C'est la bonne surprise. Le HTML contient en clair le nom du magasin, la rue, le code postal et la ville, le téléphone, les horaires, la latitude et la longitude, et l'identifiant `11749` qui figure déjà dans l'URL. Aucun bloc JSON-LD, mais du HTML directement analysable. C'est de quoi servir l'hypothèse 4 sur les localisateurs.

**Fiche produit : identité oui, prix non.** La page est rendue côté client (Next.js App Router, flux `self.__next_f`, pas de `__NEXT_DATA__`), mais elle embarque un bloc JSON-LD `Product` utilisable :

| Champ | Contenu |
| --- | --- |
| `name`, `description`, `brand` | renseignés |
| `image`, `images[]` | URL CDN |
| `offers.itemId` | identifiant interne du produit (`15653` sur le témoin) |
| `offers.seller` | `{ id: "ITM", name: "Intermarché" }` |
| `price`, `priceCurrency` | **`0` et `EUR`**, sans magasin attaché |
| `BreadcrumbList` | arborescence de rayons, utilisable comme catégorie |
| code-barres | **dans l'URL**, pas dans le JSON-LD |

Aucune clé de disponibilité, aucun prix au kilo, aucune mention du magasin : ni `11749` ni « Aix-en-Provence » n'apparaissent dans la page, même après l'appel `/?pdvref=11749`.

**Rattachement du magasin : échoué.** `/?pdvref=11749` répond 200 mais sert la route `(prehome)` : le seul cookie reçu est `datadome`, aucun cookie de point de vente, et la page produit suivante reste sans magasin. Le magasin s'attache donc par un appel client que nous n'avons pas pu identifier.

**Recherche : inexploitable sans navigateur.** `/recherche/riz%20basmati` répond 200 (303 ko) mais ne contient **aucun lien `/produit/`** : les résultats sont chargés par l'API côté client.

**Open Prices (complément).** API ouverte et documentée, 30 champs par prix, dont `price`, `price_per`, `date`, `product_code`, `product_name`, `currency`, `price_is_discounted`, et un objet `location` complet (nom, marque, rue, ville, code postal, coordonnées, `price_count`).

## 4. Limites et risques

**Blocage technique, c'est le point bloquant.** Le 403 renvoie une page DataDome (`geo.captcha-delivery.com`, script `ct.captcha-delivery.com/c.js`, message « Please enable JS and disable any ad blocker »). Il est arrivé sur une page de rayon, c'est-à-dire un chemin **autorisé** par le `robots.txt` du site, à la sixième requête, 2 min 22 s après la précédente, à 4 s d'écart minimum et sans aucun parallélisme. Autrement dit, le rythme n'est pas en cause : c'est la détection de bot qui tranche, pas le volume.

**Conséquence sur la vérification en direct.** La section 4 du cahier des charges prévoit que l'app vérifie la disponibilité de chaque produit dans le magasin au moment de valider la liste. Pour Intermarché, ce n'est pas réalisable : les prix ne sont pas dans le HTML, l'API est sur un hôte interne non joignable, et la détection de bot coupe l'accès.

**Navigateur réel : testé, concluant techniquement, puis écarté.** Cet essai a été autorisé explicitement par Martin, mené sur sa machine avec Playwright et Chromium en fenêtre visible et profil persistant, puis abandonné. Voici exactement ce qui a été fait, parce qu'une première version de ce rapport laissait croire le contraire.

| Lancement | Quand | Ce qui a été chargé | Résultat |
| --- | --- | --- | --- |
| 1 | 28 octobre 2026, vers 20 h 22 | `https://www.intermarche.com/`, page d'accueil | captcha DataDome affiché immédiatement, script arrêté, navigateur fermé |
| 2 | 28 octobre 2026, 20 h 23 à 20 h 27 | la même page d'accueil | **le défi DataDome s'est levé tout seul**, sans aucune intervention, puis le script a attendu quatre minutes une sélection de magasin qui n'est pas venue, et s'est arrêté |

**Deux chargements de la page d'accueil, et rien d'autre** : aucune recherche, aucune fiche produit, aucun appel d'API, et **zéro donnée captée** (`reponsesApiCaptees: 0` dans la trace `data/navigateur.json`). Chaque chargement a néanmoins entraîné le téléchargement des ressources de la page, dont les scripts de DataDome, en nombre que je n'ai pas instrumenté.

Ce que l'essai a prouvé : **un vrai navigateur lève le défi DataDome sans intervention**, parce qu'il exécute le JavaScript que `fetch` ignore. Ce qu'il n'a pas prouvé : rien sur les prix, puisque la sélection du magasin demande un clic humain au premier lancement et que personne n'a cliqué.

La voie a été **abandonnée par décision** : elle imposait un composant local hors de la PWA, elle cassait à chaque refonte du site, et elle revenait à neutraliser un dispositif anti-robot. Le code de l'essai (`src/navigateur.ts`) et la dépendance Playwright ont été retirés du prototype ; seul ce constat est gardé.

**Reste sur la machine**, hors du dépôt Git : le profil Chromium créé pour cet essai, dans `spikes/intermarche/data/profil-chromium`, qui contient les cookies posés par le site, dont celui de DataDome. Il est ignoré par Git et peut être supprimé sans conséquence. Les navigateurs téléchargés par Playwright sont inventoriés dans `docs/lot-0/installations.md`, avec leur commande de retrait.

**Piste de l'API partenaire officielle.** Une demande d'accès a été déposée sur `developers.intermarche.com`. C'est la seule voie propre pour obtenir prix et disponibilité par magasin : accès autorisé, contrat de données stable, pas de détection de bot à affronter. Statut à ce jour : demande envoyée, réponse inconnue. Tant qu'elle n'est pas accordée, rien ne change pour l'application ; si elle l'est, elle se branche derrière l'interface de connecteur existante, sans toucher au reste.

**Open Prices ne couvre pas ce magasin.** Mesuré sur la base complète : 337 466 prix, 229 lieux nommés Intermarché en France, et sur les 100 premiers de ces lieux 12 459 prix cumulés, avec un maximum de 3 857 prix pour un seul magasin très suivi. Mais à Aix-en-Provence, 7 lieux référencés et **zéro Intermarché**. Et le code-barres relevé avant le blocage (`3038354536002`, riz basmati Lustucru) n'a qu'**un seul prix dans toute la base** : 4,59 €, relevé le 12 février 2024, dans un Carrefour de Lille. Donnée ni locale, ni fraîche, ni de la bonne enseigne.

**Échantillon réduit.** Le blocage est tombé avant les 10 produits : les mesures de prix portent sur 1 produit témoin, pas sur 10. Le verdict ne porte donc pas sur la qualité des données de prix, qui reste inconnue, mais sur leur **accessibilité**, qui est tranchée.

## 5. Décisions prises

1. **Abandonner la collecte Intermarché.** Aucun appel automatique au site, ni par requête, ni par navigateur. Intermarché reste une enseigne de la liste de courses, avec ses produits et ses sections, mais l'application ne contacte jamais le site.
2. **Les prix Intermarché viennent des tickets et de la saisie après les courses**, c'est leur seule source :
   - produit déjà connu dans ce magasin : son prix est mis à jour et l'ancien est conservé en historique, ce qui donne l'évolution dans le temps ;
   - produit inconnu : il est créé à partir de la ligne de ticket ou de la saisie, puis rattaché à un ingrédient canonique ;
   - chaque prix porte sa date et son magasin, et passe en « ancien » au-delà de 30 jours, selon le tableau des niveaux de prix de la section 6 du cahier des charges.
3. **Demander l'accès à l'API partenaire officielle** (`developers.intermarche.com`), déjà déposée. Si elle est accordée, elle se branche derrière l'interface de connecteur sans rien changer d'autre. Tant qu'elle ne l'est pas, le point 2 reste la seule source.
4. **Garder l'interface de connecteur** de la section 5, mais le connecteur Intermarché n'implémente que « rechercher les magasins », à partir de la page `infos-pratiques` autorisée. Les méthodes de prix et de disponibilité renvoient « non disponible pour cette enseigne », sans appel réseau.
5. **Open Prices : pas une source de prix**, mais un enrichissement facultatif, à ne jamais présenter comme le prix du magasin de l'utilisateur. À reconsidérer si la couverture d'Aix progresse.
6. **Réutiliser l'URL d'un produit trouvé, sans repasser par la recherche** (voir le détail ci-dessous). C'est ce qui permettra au futur connecteur de ne chercher qu'une seule fois par ingrédient.
7. **Picard devient l'enseigne principale** pour les prix : son `robots.txt` n'interdit que la recherche et les pages de compte, et il publie un sitemap (`https://www.picard.fr/sitemap_0.xml`). C'est l'hypothèse 3, la prochaine.

### L'URL d'un produit, reconstructible depuis le code-barres

L'URL d'une fiche produit a la forme **`https://www.intermarche.com/produit/<slug>/<ean13>`**, et c'est un chemin **autorisé par le `robots.txt`**, contrairement à la recherche. Comme le code-barres est dans l'URL, il n'y a pas besoin de la recherche pour atteindre une fiche : il suffit de connaître le code-barres.

Or le code-barres, on l'obtient sans toucher au site : il est lu sur le ticket de caisse ou scanné en magasin (hypothèse 7), et Open Food Facts le relie déjà à un nom de produit. D'où le schéma retenu, qui ne contient aucune recherche :

1. le produit entre dans la base par un ticket ou une saisie, avec son code-barres quand il est disponible ;
2. l'application mémorise ce code-barres et le rattache à un ingrédient canonique ;
3. pour montrer la fiche à l'utilisateur, elle reconstruit l'URL et **lui propose le lien à ouvrir lui-même**, comme le prévoit désormais l'étape 4 du parcours principal. Elle ne l'appelle pas elle-même.

Une réserve honnête : le `slug` est-il significatif, ou le code-barres suffit-il dans l'URL ? Non vérifié, le blocage est arrivé avant. Si le `slug` compte, il faudra le mémoriser lui aussi, et il n'est récupérable que depuis une fiche déjà vue. Tant que ce n'est pas tranché, le lien proposé à l'utilisateur sera une recherche sur le site plutôt qu'une fiche directe, ce qui est de toute façon plus robuste : c'est son navigateur qui ouvre la page, pas nous.

## 6. Impact sur le cahier des charges

Ces modifications ont été appliquées au cahier des charges le 28 octobre 2026. Le tableau reste comme trace de ce que l'hypothèse a changé.

| Section | Modification à apporter |
| --- | --- |
| 5, tableau des sources | Ligne Intermarché : remplacer « Lecture du site pour le magasin sélectionné » par « pas de collecte automatisée, prix issus des tickets et de la saisie manuelle ». Ligne Intermarché (magasin) : seule la fiche `infos-pratiques` est exploitable, pour les coordonnées du magasin |
| 4, parcours principal, étape 4 | Retirer la vérification en direct de la disponibilité pour Intermarché : afficher le dernier prix connu avec sa date, sans appel au site |
| 3, tableau des fonctionnalités | La vérification en direct des prix et de la disponibilité devient propre à chaque enseigne, et non une fonction générale |
| 6, règles métier | Renforcer la règle du prix daté : pour Intermarché, c'est le seul mécanisme, le vieillissement à 30 jours devient structurant et non un garde-fou |
| 14, analyse des outils | Ajouter le constat DataDome : détection de bot active sur intermarche.com, y compris sur des chemins autorisés par leur `robots.txt` |
| 15, hypothèses | Marquer l'hypothèse Intermarché comme invalidée, et noter que la conclusion « rien de bloquant trouvé » ne tient plus pour cette enseigne |
| 5, multi-enseigne | Préciser qu'un connecteur peut n'implémenter qu'une partie de l'interface, les autres méthodes répondant « non disponible » |

## 7. Résumé de suivi

- Hypothèse 2 invalidée pour la collecte automatique : aucun prix dans le HTML accessible, blocage DataDome (403 puis captcha) dès la 6e requête, sur un chemin autorisé par leur propre `robots.txt`, à 4 s d'écart et sans parallélisme.
- Un navigateur réel (Chromium, fenêtre visible) a bien été lancé, deux fois le 28 octobre, avec l'autorisation explicite de Martin : **deux chargements de la page d'accueil, rien d'autre, zéro donnée captée**. Le défi DataDome s'est levé tout seul, donc la voie était techniquement ouverte, mais elle est abandonnée par décision, car elle imposait un composant local hors de la PWA et revenait à neutraliser un anti-robot. Le code de l'essai et la dépendance Playwright ont été retirés.
- Décision : Intermarché reste une enseigne de la liste, mais ses prix viennent uniquement des tickets et de la saisie après les courses, produit connu mis à jour avec historique, produit inconnu créé. Accès à l'API partenaire officielle demandé sur developers.intermarche.com, à brancher s'il est accordé.
- Exploitable malgré tout : la fiche magasin `infos-pratiques` est rendue côté serveur (adresse, téléphone, horaires, coordonnées GPS, identifiant), et le code-barres est dans l'URL des fiches produit, qui sont sur un chemin autorisé.
- Open Prices ne remplace pas : 337 466 prix et 229 Intermarché en France, mais zéro Intermarché à Aix-en-Provence, et le seul prix du produit témoin date de février 2024, dans un Carrefour de Lille. Prochaine hypothèse : Picard.
