# Sécurité

## Secrets

- Ne jamais lire, afficher, copier ni commiter un fichier `.env`. Les variables attendues sont listées et commentées dans `.env.example`.
- Aucun secret en dur dans le code, les tests, les journaux ou la CI. En CI, uniquement des secrets GitHub, jamais affichés.
- Ne jamais demander à l'utilisateur de coller un mot de passe, un jeton ou une clé dans la conversation.

## Données personnelles

- Données personnelles : nom, adresse, e-mail, téléphone, numéro de carte de fidélité ou de paiement, adresse saisie pour trouver un magasin.
- Ne jamais les afficher, les recopier ni les journaliser, y compris dans un message d'erreur ou un rapport.
- À l'import d'un ticket ou d'une facture, filtrer dès l'extraction par liste blanche de sortie : seules les lignes d'articles, la date, le magasin et le total sortent du module. Le reste n'est jamais recopié.
- L'adresse saisie pour trouver un magasin est géocodée en mémoire puis oubliée : ni stockée, ni journalisée.

## Authentification et autorisations

- Mots de passe hachés avec Argon2id, jamais comparés en clair.
- Session en cookie `HttpOnly`, `Secure`, `SameSite=Lax` au minimum ; aucun jeton dans le `localStorage`.
- Protection CSRF sur toute requête qui modifie l'état ; limitation des tentatives de connexion.
- **Chaque accès à une ressource vérifie qu'elle appartient au foyer de l'utilisateur connecté**, côté serveur. Un identifiant reçu du client n'est jamais une preuve d'appartenance.
- Les routes d'administration exigent le rôle administrateur et la double authentification, et chaque action est tracée dans le journal d'audit.

## Entrées

- Toute entrée externe est validée côté serveur (corps, paramètres, en-têtes, fichiers importés, réponses des sites tiers).
- Requêtes SQL toujours paramétrées, par Drizzle ; jamais de concaténation de chaînes.
- Fichiers importés : type et taille vérifiés, traités en mémoire ou dans un dossier temporaire, supprimés après validation.

## Sites tiers

- `robots.txt` respecté sans exception. Aucun navigateur piloté pour passer une protection anti-robot.
- Arrêt immédiat au premier blocage (captcha, 403, 429) : on consigne, on ne contourne pas.
- Aucune collecte automatique chez Intermarché.

## Dépendances

- Toute dépendance a une version figée. `pnpm audit` doit rester propre ; une exception est documentée avec sa raison et une date de réexamen.
- Ajouter une dépendance hors de la stack du CLAUDE.md demande l'accord de Martin.
- Un skill, un agent ou un outil externe est lu, scanné avec SkillSpector et figé à une version précise avant installation.
