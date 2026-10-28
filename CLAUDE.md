# App Repas

PWA de planification de repas sur 7 ou 14 jours : recettes HelloFresh, liste de courses par magasin (Picard, Intermarché), prix et valeurs nutritionnelles par repas, suivi des dépenses.

Référence complète : `docs/cahier-des-charges.md`. Ne le lis pas en entier à chaque fois : va chercher la section utile.

## Phase actuelle : lot 0, faisabilité

Objectif : valider les hypothèses de la section 15 du cahier des charges avec des prototypes jetables.

- Le code de `spikes/` ne sera pas réutilisé dans l'application.
- Seuls les rapports de `docs/lot-0/` sont conservés.
- Branche de travail : `lot-0`.

Ordre des hypothèses, une à la fois :

1. HelloFresh : API interne en France (ingrédients, quantités, nutrition)
2. Intermarché : prix et disponibilité pour un magasin donné
3. Picard : fiches produits, disponibilité par magasin ou non
4. Localisateurs de magasins des deux enseignes
5. Couverture Open Food Facts sur 50 produits
6. Correspondance ingrédient vers produit, avec les données des étapes 1 à 3
7. OCR sur 5 tickets de caisse réels

Avant d'écrire du code pour une hypothèse : présenter le plan et attendre ma validation.

## Structure

```text
CLAUDE.md
docs/
  cahier-des-charges.md
  lot-0/              # un rapport par hypothèse (conservé)
spikes/
  <hypothese>/        # prototype autonome (jetable)
    package.json
    src/
    data/             # données collectées, ignorées par Git
```

## Règles du lot 0

- Chaque prototype est autonome : son propre `package.json`, TypeScript exécuté avec `tsx`, aucune dépendance partagée entre prototypes.
- Dépendances minimales : préférer le `fetch` natif de Node.
- Données collectées uniquement dans `spikes/<hypothese>/data/`. Ne jamais les commiter.
- Collecte respectueuse : une requête toutes les 3 secondes minimum, jamais en parallèle, échantillons limités (20 recettes, 10 produits).
- Code tiers (dépôts clonés, scripts trouvés en ligne) : le lire pour comprendre, ne jamais l'exécuter ni installer ses dépendances.
- Si un site bloque techniquement (captcha, 403, 429, adresse IP bloquée) : ne jamais contourner, s'arrêter et le consigner dans le rapport.
- robots.txt respecté par défaut. Exception décidée par Martin pour Intermarché : les chemins interdits peuvent être consultés uniquement pour vérifier le prix et la disponibilité de produits précis dans un magasin donné, au rythme d'un humain (3 s minimum entre deux requêtes, jamais en parallèle, agent utilisateur honnête). Pas de collecte du catalogue complet.
- Aucun secret dans le dépôt : clés éventuelles dans `.env` (ignoré), variables listées dans `.env.example`.

## Rapport par hypothèse

Fichier `docs/lot-0/<hypothese>.md`, toujours dans cet ordre :

1. **Verdict** : validée, partielle ou invalidée, en une phrase.
2. **Méthode** : URL, endpoints, paramètres, jetons utilisés.
3. **Données disponibles** : liste des champs et leur format (structure seulement, pas de contenu recopié).
4. **Limites et risques**.
5. **Décisions prises** et pourquoi.
6. **Impact sur le cahier des charges** : sections à modifier.
7. **Résumé de suivi** : 5 lignes maximum, à copier dans claude.ai.

## Conventions

- Français partout : commentaires, documentation, commits, rapports.
- Jamais de tiret long (—) ni de tiret moyen (–) : utiliser deux-points, virgules ou parenthèses.
- Commits au format Conventional Commits, en français, à l'impératif présent et en minuscules : `type(portée): description`.
  - Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.
  - Exemples : `chore(spikes): initialise le prototype hellofresh`, `docs(lot-0): ajoute le rapport hellofresh`.
- Chaque fichier de prototype commence par un commentaire qui dit ce qu'il teste.
- Commenter ce qui n'est pas évident : origine d'un endpoint, rôle d'un jeton, raison d'un délai.
- Proposer les commits, ne jamais faire `git push` sans demande.