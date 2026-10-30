# Lot 1 : socle

> Issues créées le 30 octobre 2026 (#7 à #15) ; la référence est désormais GitHub.

Jalon : Lot 1
Tableau : Mijote

## Story : Poser le design system et les jetons de design

Labels : feature, web
Dépend de : rien
Taille : L

### Pourquoi

Tous les écrans du projet doivent partager une apparence sobre et une accessibilité RGAA 4.1 niveau AA. Les poser une fois, dans des jetons et quelques composants de base, évite de refaire ces choix écran par écran et rend la conformité vérifiable dès le premier écran métier.

### Critères d'acceptation

- [ ] Les jetons de design sont des propriétés CSS personnalisées dans un fichier unique de `apps/web` : couleurs (fond, surface, texte, texte secondaire, une seule couleur d'accent, succès, avertissement, erreur, focus), typographie, tailles de texte, espacements, rayons.
- [ ] Un mode sombre suit le réglage du système (`prefers-color-scheme`) avec les mêmes noms de jetons.
- [ ] Chaque couple texte et fond utilisé respecte 4,5:1, et chaque élément d'interface 3:1, en clair comme en sombre ; les ratios mesurés sont consignés dans `docs/design-system.md`.
- [ ] La police est une pile système ou une police auto-hébergée : aucune requête vers un service tiers.
- [ ] Composants de base, fondés sur Reka UI quand un comportement complexe est en jeu : bouton (principal, secondaire, danger, désactivé, en cours), champ de saisie (label visible, aide, erreur reliée par `aria-describedby`), message d'information annoncé par une région `aria-live`, dialogue modal.
- [ ] Une mise en page commune : en-tête, navigation, contenu principal, lien d'évitement ; barre de navigation en bas sous 640 px, latérale au-delà.
- [ ] Le focus est visible sur tout élément interactif, les zones tactiles font au moins 44 × 44 px, et les animations sont coupées sous `prefers-reduced-motion: reduce`.
- [ ] Une page de démonstration des composants, disponible uniquement en développement, est couverte par un test Playwright avec contrôle axe-core, en mode clair et en mode sombre, sans aucune violation.
- [ ] Des tests de composants vérifient le clavier, le focus et les attributs ARIA du bouton, du champ de saisie et du dialogue.
- [ ] `docs/design-system.md` décrit les jetons, les composants et leurs règles d'usage.

### Hors périmètre

- Les écrans métier.
- Une bibliothèque d'icônes complète.
- Les animations au-delà des transitions d'état.

### Références

- `docs/cahier-des-charges.md`, section 7 (design, responsive et accessibilité).
- `.claude/rules/vue-accessibility.md`.
- ADR 0001 (Reka UI avec styles maison).
- Les tests de composants demandent des dépendances à approuver (environnement DOM et utilitaires de test Vue).

## Story : Uniformiser les erreurs et la journalisation

Labels : feature, api, web, shared
Dépend de : rien
Taille : M

### Pourquoi

Toute erreur doit être soit expliquée à l'utilisateur, soit journalisée avec assez de contexte pour être reproduite, sans jamais divulguer de trace technique ni de donnée personnelle. Les stories suivantes s'appuient toutes sur ce socle.

### Critères d'acceptation

- [ ] Un filtre d'exceptions global renvoie toute erreur de l'API au format RFC 9457 (`application/problem+json`) : `type`, `title`, `status`, `detail` et l'identifiant de requête.
- [ ] Une erreur de validation renvoie la liste des champs en erreur, chacun avec un message en français.
- [ ] Une erreur inattendue renvoie un statut 500 avec un message générique ; la trace et le détail ne partent qu'au journal.
- [ ] Chaque requête reçoit un identifiant, renvoyé dans l'en-tête `X-Request-Id` et présent sur chaque ligne de journal qu'elle produit.
- [ ] Les journaux passent par pino, au format JSON, avec un niveau réglé par variable d'environnement documentée dans `.env.example` ; le niveau `debug` est coupé en production.
- [ ] Les en-têtes `Authorization`, `Cookie` et `Set-Cookie`, et les champs de mot de passe, de jeton et d'adresse e-mail sont masqués dans les journaux, ce qu'un test vérifie.
- [ ] Chaque requête HTTP produit une ligne d'accès : méthode, route, statut, durée, identifiant de requête, sans le corps.
- [ ] `GET /health` vérifie aussi la base de données : 200 si elle répond, 503 au format RFC 9457 sinon.
- [ ] Le type des erreurs RFC 9457 est déclaré dans `packages/shared` ; le front dispose d'un client HTTP unique qui le lit et affiche un message compréhensible en français.
- [ ] Des tests couvrent : route inconnue (404), validation (400), erreur inattendue (500 sans trace), masquage dans les journaux, base indisponible.

### Hors périmètre

- Loki, Grafana et le suivi d'erreurs auto-hébergé.
- Les alertes.
- La remontée des erreurs du navigateur vers l'API.
- Le journal d'audit.

### Références

- `docs/cahier-des-charges.md`, section 8 (gestion des erreurs et journalisation).
- `.claude/rules/api.md`, `.claude/rules/security.md`.

## Story : Envoyer des e-mails, avec Mailpit en développement

Labels : feature, api
Dépend de : Uniformiser les erreurs et la journalisation
Taille : S

### Pourquoi

Les invitations et la réinitialisation du mot de passe envoient des e-mails. En développement, Mailpit capture tous les messages en local, sans jamais rien envoyer à l'extérieur. Le fournisseur de production se choisira au déploiement, sans toucher au code.

### Critères d'acceptation

- [ ] Mailpit est ajouté à `docker-compose.yml`, version figée, avec son interface web en local.
- [ ] L'API envoie ses e-mails par une interface unique, branchée sur SMTP par des variables d'environnement documentées dans `.env.example` ; les tests utilisent une implémentation en mémoire.
- [ ] Les gabarits sont en français, en texte brut et en HTML simple, sans image distante ni pixel de suivi.
- [ ] Aucune adresse e-mail n'apparaît dans les journaux : seul l'identifiant du message y figure.
- [ ] Un échec d'envoi est journalisé et remonte à l'appelant sous forme d'erreur RFC 9457, sans faire tomber l'API.
- [ ] Un test vérifie qu'un e-mail envoyé arrive bien dans Mailpit.
- [ ] `docs/poste-de-dev.md` mentionne l'image Mailpit et sa commande de retrait.

### Hors périmètre

- Le choix du fournisseur SMTP de production.
- Une file d'attente avec nouvelles tentatives.

### Références

- `docs/cahier-des-charges.md`, sections 8 et 10.
- `.claude/rules/security.md` (données personnelles).
- La bibliothèque d'envoi SMTP est une dépendance à approuver.

## Story : Créer les comptes, la connexion et la session

Labels : feature, api, web, db
Dépend de : Poser le design system et les jetons de design; Uniformiser les erreurs et la journalisation
Taille : L

### Pourquoi

L'application est privée : tout passe par un compte. Cette story pose les comptes, la connexion et la session, ainsi que le premier administrateur, sans encore ouvrir l'inscription, qui passera par invitation.

### Critères d'acceptation

- [ ] Le schéma Drizzle et une migration versionnée créent les comptes (e-mail unique normalisé, empreinte du mot de passe, rôle utilisateur ou administrateur) et les foyers, un compte appartenant à un foyer.
- [ ] Le premier administrateur se crée par une commande en ligne de commande documentée dans le README ; le mot de passe est saisi de façon interactive, jamais passé en argument.
- [ ] Les mots de passe sont hachés en Argon2id et font au moins 12 caractères.
- [ ] La connexion ouvre une session stockée côté serveur, portée par un cookie `HttpOnly`, `Secure` et `SameSite=Lax` ; la déconnexion la supprime côté serveur.
- [ ] Toute requête qui modifie l'état est protégée contre le CSRF.
- [ ] Les tentatives de connexion sont limitées par compte et par adresse IP.
- [ ] Le message d'échec est identique pour un e-mail inconnu et pour un mot de passe faux.
- [ ] Une garde d'authentification et une garde de rôle réutilisables protègent les routes ; une route sans session renvoie 401 au format RFC 9457.
- [ ] La page de connexion et la déconnexion respectent le design system ; un test Playwright avec axe-core couvre la page de connexion, sans violation.
- [ ] Des tests couvrent la connexion réussie, l'échec, la limitation, la déconnexion et l'accès refusé sans session.

### Hors périmètre

- L'inscription (story des invitations).
- Le mot de passe oublié.
- La double authentification.
- La connexion par Google ou Apple.

### Références

- `docs/cahier-des-charges.md`, sections 2, 3 (Compte) et 10 (Sécurité).
- `.claude/rules/security.md`, `.claude/rules/api.md`.
- Le choix des bibliothèques (hachage, session, CSRF) est à approuver, et le mode de stockage des sessions mérite un ADR.

## Story : Protéger l'administrateur par la double authentification

Labels : feature, api, web, db
Dépend de : Créer les comptes, la connexion et la session
Taille : M

### Pourquoi

Le compte administrateur peut inviter des personnes et, plus tard, gérer les données de tous. C'est le compte le plus exposé : il est protégé par une double authentification dès le départ.

### Critères d'acceptation

- [ ] L'administrateur active la double authentification par TOTP : QR code et clé en texte, lisible par un lecteur d'écran, puis confirmation par un premier code avant activation.
- [ ] Des codes de secours sont générés, affichés une seule fois, stockés hachés, et chacun ne sert qu'une fois.
- [ ] Le secret TOTP est chiffré en base, avec une clé fournie par variable d'environnement documentée dans `.env.example`.
- [ ] À la connexion d'un administrateur, un code est demandé après le mot de passe ; la session n'obtient les droits d'administration qu'après ce code.
- [ ] Toute route d'administration exige le rôle administrateur et une double authentification validée ; un administrateur qui ne l'a pas encore activée est conduit à l'activer.
- [ ] Les essais de code sont limités.
- [ ] Des tests couvrent un code valide, un code invalide, un code hors de sa fenêtre de temps et la réutilisation d'un code de secours ; un test Playwright avec axe-core couvre les écrans d'activation et de saisie du code.

### Hors périmètre

- La double authentification des utilisateurs non administrateurs.
- Les clés d'accès (passkeys, WebAuthn).

### Références

- `docs/cahier-des-charges.md`, sections 9 (Espace admin) et 10 (Sécurité).
- `.claude/rules/security.md`.

## Story : Inviter et inscrire un utilisateur

Labels : feature, api, web, db
Dépend de : Envoyer des e-mails, avec Mailpit en développement; Protéger l'administrateur par la double authentification
Taille : L

### Pourquoi

La V1 est sur invitation : personne ne peut s'inscrire sans y avoir été invité. L'administrateur invite par e-mail, et l'invité crée son compte depuis le lien reçu.

### Critères d'acceptation

- [ ] Depuis l'espace d'administration, l'administrateur crée une invitation pour une adresse e-mail, liste les invitations avec leur statut (en attente, utilisée, expirée, révoquée) et révoque une invitation en attente.
- [ ] Le jeton d'invitation est tiré d'un générateur cryptographique, stocké sous forme hachée, à usage unique, et valable une durée configurable de 72 heures par défaut.
- [ ] L'e-mail d'invitation part par le module d'envoi, avec le lien d'inscription.
- [ ] Depuis le lien, l'invité choisit son mot de passe ; l'adresse e-mail est celle de l'invitation et ne se modifie pas ; le compte et son foyer sont créés, et l'adresse est considérée comme vérifiée.
- [ ] Un lien expiré, révoqué ou déjà utilisé affiche un message clair, sans dire si un compte existe.
- [ ] Aucune route publique ne permet de s'inscrire sans invitation valide.
- [ ] Des tests couvrent le parcours complet, un jeton invalide, expiré ou réutilisé, et le refus d'une invitation par un non-administrateur ; un test Playwright avec axe-core couvre la page d'inscription et la page des invitations.

### Hors périmètre

- Les invitations envoyées par un utilisateur non administrateur.
- Les invitations en masse.
- Le renvoi automatique d'une invitation.

### Références

- `docs/cahier-des-charges.md`, sections 2, 3 (Compte) et 9 (Utilisateurs).
- `.claude/rules/security.md`.

## Story : Réinitialiser un mot de passe oublié

Labels : feature, api, web
Dépend de : Envoyer des e-mails, avec Mailpit en développement; Créer les comptes, la connexion et la session
Taille : M

### Pourquoi

Un utilisateur qui a oublié son mot de passe doit pouvoir le changer seul, sans passer par l'administrateur, et sans que la fonction ne révèle quelles adresses ont un compte.

### Critères d'acceptation

- [ ] La demande se fait par adresse e-mail, et la réponse affichée est identique que l'adresse ait un compte ou non.
- [ ] Le lien de réinitialisation est à usage unique, stocké haché, et valable une heure.
- [ ] Le nouveau mot de passe respecte les mêmes règles qu'à la création, et son enregistrement ferme toutes les sessions ouvertes du compte.
- [ ] Les demandes sont limitées par adresse e-mail et par adresse IP.
- [ ] Des tests couvrent le parcours complet, un lien expiré ou réutilisé, et l'absence d'écart de réponse entre adresse connue et inconnue ; un test Playwright avec axe-core couvre les deux écrans.

### Hors périmètre

- Le changement de mot de passe depuis le profil, une fois connecté.
- La réinitialisation par l'administrateur.

### Références

- `docs/cahier-des-charges.md`, sections 3 (Compte) et 10 (Sécurité).
- `.claude/rules/security.md`.

## Story : Renseigner le profil du foyer

Labels : feature, api, web, shared, db
Dépend de : Créer les comptes, la connexion et la session
Taille : L

### Pourquoi

Le planning des lots suivants s'adapte au foyer : nombre de personnes, contraintes alimentaires, objectif, budget, temps disponible. Ces réglages se proposent au premier lancement et se modifient à tout moment dans le profil.

### Critères d'acceptation

- [ ] Le profil du foyer comprend : nombre de personnes de 1 à 35, contraintes alimentaires et allergènes choisis dans une liste fermée, ingrédients exclus, objectif (économie, équilibre, rapidité ou mélange), budget mensuel, temps de préparation maximum par repas, et équilibre entre variété et réutilisation des ingrédients.
- [ ] Les règles de validation sont déclarées une seule fois dans `packages/shared` et appliquées par l'API comme par le front.
- [ ] Le budget est stocké en centimes, en entier.
- [ ] Au premier lancement, ces réglages sont proposés en étapes qu'on peut passer et reprendre plus tard depuis le profil.
- [ ] Les contraintes alimentaires et les allergènes peuvent révéler des informations de santé : leur saisie est facultative, une phrase dit à quoi elles servent, et elles n'apparaissent jamais dans les journaux.
- [ ] Toute lecture et toute modification du profil sont limitées au foyer de l'utilisateur connecté ; un test vérifie qu'un utilisateur ne peut ni lire ni modifier le foyer d'un autre.
- [ ] Un test Playwright avec axe-core couvre le parcours de premier lancement et la page du profil.

### Hors périmètre

- Le choix des enseignes et des magasins (lot 3).
- Plusieurs comptes pour un même foyer.

### Références

- `docs/cahier-des-charges.md`, sections 3 (Profil), 4 (premier lancement) et 6 (réutilisation des ingrédients).
- `.claude/rules/security.md` (données personnelles), `.claude/rules/typescript.md` (montants en centimes).

## Story : Exporter et supprimer son compte

Labels : feature, api, web
Dépend de : Renseigner le profil du foyer
Taille : M

### Pourquoi

Le RGPD donne à chacun le droit de récupérer ses données et de les faire supprimer. Ces deux fonctions doivent exister avant d'inviter d'autres personnes que Martin.

### Critères d'acceptation

- [ ] Depuis son profil, l'utilisateur télécharge un fichier JSON contenant toutes les données de son compte et de son foyer.
- [ ] La suppression du compte demande une confirmation par le mot de passe, puis supprime effectivement les données du compte et du foyer, et ferme toutes ses sessions.
- [ ] Le dernier administrateur ne peut pas supprimer son compte.
- [ ] L'export et la suppression sont journalisés sans aucune donnée personnelle.
- [ ] Une page « Confidentialité », accessible sans être connecté, décrit les données collectées, leur usage, leur durée de conservation et ces deux droits.
- [ ] Des tests couvrent un export complet, une suppression effective (plus aucune donnée du foyer en base) et le refus pour le dernier administrateur ; un test Playwright avec axe-core couvre les écrans concernés.

### Hors périmètre

- La suppression d'un compte par l'administrateur.
- L'import de données.

### Références

- `docs/cahier-des-charges.md`, sections 3 (Compte) et 10 (RGPD).
- `.claude/rules/security.md`.
