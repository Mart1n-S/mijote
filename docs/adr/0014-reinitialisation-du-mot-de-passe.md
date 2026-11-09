# ADR 0014 : la réinitialisation d'un mot de passe oublié

- Statut : acceptée
- Date : 9 novembre 2026

## Contexte

La story #13 ouvre le dernier chemin de la section « Compte » du cahier des charges (section 3) : « connexion, déconnexion, mot de passe oublié ». C'est une fonction que personne ne regarde et que tout le monde attaque, parce qu'elle réunit trois choses rares ailleurs : elle est publique, elle prend une adresse e-mail en entrée, et elle finit par changer un authentifiant.

Quatre décisions la cadrent, et elle ne doit en défaire aucune.

L'ADR 0010 a posé la session en base, les trois barrières CSRF et la limitation des tentatives, avec une exigence qui revient ici mot pour mot : « le message identique ne suffit pas, le temps doit l'être aussi ». L'ADR 0011 a mesuré Argon2id et écrit l'empreinte leurre qui égalise ce temps à la connexion. L'ADR 0012 a rendu la double authentification obligatoire pour l'administrateur. L'ADR 0013 a posé le jeton opaque haché à usage unique, le transport par le fragment de l'adresse, le refus unique et la purge, pour un chemin public lui aussi.

La différence avec tous ceux-là est le point de départ de cette décision : **l'empreinte leurre ne se transpose pas.** À la connexion, une adresse inconnue paie quand même les 110 ms d'Argon2, parce qu'il existe une empreinte contre laquelle vérifier pour rien. Ici, le travail coûteux est un envoi SMTP, et il n'existe pas d'envoi leurre : on ne peut pas écrire à personne. Un envoi prend de quelques dizaines de millisecondes à dix secondes (c'est le `socketTimeout` de `smtp.mailer.ts`), et `SmtpMailer` lève un 503 quand il échoue. Une route qui attendrait son envoi publierait donc la liste des comptes deux fois : par son temps de réponse, et par son statut.

## Décision

### La réponse ne dépend d'aucun travail qui dépend du compte

`POST /auth/password/forgot` fait exactement trois choses, et elles sont identiques que l'adresse ait un compte ou non :

1. valider et normaliser l'adresse, par le schéma partagé, sans aucun accès en base ;
2. consulter puis écrire la limitation, sur l'empreinte de l'adresse **soumise** et sur celle de l'IP ;
3. répondre **202** avec un corps vide et `Cache-Control: no-store`.

Tout le reste part dans un **travail détaché**, lancé après que la réponse est rendue : chercher le compte, remplacer le jeton, envoyer l'e-mail. Les deux chemins exécutent alors le même nombre de requêtes SQL, deux comptages et une insertion de tentative, et pas une de plus pour une adresse connue.

C'est plus strict que ce que l'ADR 0013 avait accepté sur les invitations, où un refus coûtait une requête de plus dans un cas sur cinq. L'écart y était observable par le seul détenteur du jeton, qui connaissait déjà l'adresse invitée. Ici l'observateur est n'importe qui devant un formulaire public, et l'issue #13 en fait un critère d'acceptation.

Ce que ce choix coûte, et il faut l'écrire :

- **Un échec d'envoi ne se voit pas dans la réponse.** Il est journalisé par `SmtpMailer`, qui sait déjà ne pas y écrire l'adresse, et la personne lit le même message que si tout s'était bien passé. Il n'existe aucune façon de lui signaler cet échec sans lui dire que l'adresse a un compte.
- **Un arrêt du processus pendant le travail détaché perd le message.** La personne redemande. Une table de sortie, écrite dans la transaction et vidée par un envoyeur, serait la bonne réponse si cela devenait un sujet ; elle est hors de proportion pour ce lot.

Le travail détaché attrape ses propres erreurs, sans exception : une promesse rejetée sans gestionnaire fait tomber le processus Node, et une route publique offrirait alors le moyen de l'arrêter. Le service donne de quoi l'attendre, et c'est **réservé aux tests** : sans cela, aucun test ne peut vérifier ce qui part. C'est le même procédé que `resetSessionForTests` côté front.

Le message affiché est fixe, et le front n'en décide rien : « Si un compte existe pour cette adresse, un e-mail vient de partir. Pensez à regarder vos indésirables. »

Écarté : **retarder la réponse jusqu'à une durée constante.** C'est la parade classique au temps qui parle, et elle est plus fragile qu'elle n'en a l'air. Il faudrait choisir un plancher supérieur au pire envoi, donc de l'ordre de dix secondes, ce qui rend la fonction désagréable pour tout le monde ; et un envoi plus lent que le plancher laisserait l'écart reparaître sans que rien ne le signale. Ne rien attendre du tout ne demande aucun réglage et ne peut pas dériver.

Écarté aussi : **ne journaliser aucun échec d'envoi**, pour que les journaux ne disent pas non plus quels comptes existent. Les journaux sont du côté du serveur, et un envoi qui échoue en silence est un incident qu'on ne verrait jamais. La ligne existe donc, et c'est la section sur les journaux, plus bas, qui règle ce qu'elle porte.

### Le jeton : opaque, haché, une heure, un seul vivant par compte

32 octets tirés au hasard, en base64url, stockés en **empreinte SHA-256**, par `createSecret` et `hashSecret` sans un caractère de changé. Pas d'Argon2 : 256 bits tirés au hasard n'ont pas de dictionnaire à ralentir, c'est le même arbitrage que pour les jetons de session (ADR 0010) et d'invitation (ADR 0013).

**Une heure**, comme l'exige l'issue #13, et en constante plutôt qu'en variable d'environnement, contrairement à `INVITATION_TTL_HOURS`. Une invitation s'envoie à l'avance et s'attend parfois un jour ou deux ; une réinitialisation se fait dans la minute où on l'a demandée. Une heure laisse la place à un e-mail qui tarde sans laisser un lien utilisable traîner dans une boîte.

**Usage unique**, par une requête conditionnelle (`where used_at is null and revoked_at is null and expires_at >= ?`), et non par une lecture suivie d'une écriture : deux soumissions simultanées du même lien ne peuvent pas passer toutes les deux, la seconde ne modifiant aucune ligne. C'est le procédé de `consume` des invitations, et de toutes les écritures de ce genre dans le projet.

**Un seul jeton vivant par compte**, garanti par un index unique partiel (`where used_at is null and revoked_at is null`), et une nouvelle demande **révoque le vivant puis insère le neuf, dans la même transaction**. La raison est celle de l'ADR 0013 : le prédicat de l'index ne peut pas exclure les jetons expirés, `now()` n'étant pas immuable, donc un jeton expiré que personne n'a révoqué occuperait la place et empêcherait toute nouvelle demande.

Le refus est **unique pour les quatre cas** : inconnu, expiré, révoqué, déjà utilisé reçoivent le même 410 et « Ce lien n'est plus valable. Demandez une nouvelle réinitialisation. » Les distinguer n'apprendrait rien d'utile à qui tient un lien mort, et « déjà utilisé » dirait à un attaquant qui a trouvé un vieux lien que sa cible s'en est servie.

La table ne porte **que `account_id`**, jamais l'adresse. C'est la différence avec `invitation`, qui doit garder l'adresse puisqu'aucun compte n'existe encore, et qui a donc eu droit à sa purge trentenaire. Ici il n'y a aucune donnée personnelle à faire disparaître, et la purge se réduit à une ligne de plus dans `purgeExpired` de `AuthRepository`, qui efface déjà sessions, jetons de mémorisation, tentatives et attentes à chaque connexion réussie. Un jeton consommé ou révoqué expire de toute façon dans l'heure, donc `where expires_at < now()` suffit à tout nettoyer, sans mécanisme nouveau.

Le lien est `https…/mot-de-passe/reinitialisation#<jeton>`, et le jeton voyage dans le **fragment**, que le navigateur n'envoie jamais au serveur : il ne part donc pas dans l'en-tête `Referer`, ni dans les journaux du mandataire, ni dans les statistiques d'un serveur frontal. La page le lit, l'efface aussitôt de la barre d'adresse par `history.replaceState`, et l'échange contre un POST qui le porte dans son corps. Tout cela est recopié de l'ADR 0013, y compris les deux options qu'il écarte, le paramètre de requête et la confiance en `Referrer-Policy`.

L'adresse du lien vient de `APP_BASE_URL`, lue au démarrage, et **jamais de l'en-tête `Host`**. L'ADR 0013 nommait déjà le risque : « c'est l'erreur classique des e-mails de réinitialisation de mot de passe, et elle se paie par un compte ». C'est maintenant littéralement l'e-mail dont il parlait.

### Deux demandes à la fois, et le conflit de l'index

Rien n'empêche deux demandes simultanées pour la même adresse : un double clic suffit. Les deux travaux détachés tournent alors en parallèle, et l'index unique partiel entre en jeu. Deux entrelacements existent, et les deux sont traités.

**Les deux transactions se chevauchent.** La première ne voit aucun jeton vivant à révoquer et insère le sien. La seconde ne voit rien non plus, la première n'étant pas encore validée, et son insertion **bloque sur l'index** puis échoue en violation d'unicité quand la première est validée. Ce conflit est attrapé par son code PostgreSQL (`23505`), et le travail s'arrête là : **aucun second e-mail ne part**, et une ligne de journal le note. C'est le bon comportement, parce que l'autre demande vient de poser un jeton valable et d'écrire à la même adresse. Réessayer serait pire : cela révoquerait le jeton tout neuf et enverrait un second message dont le premier lien serait déjà mort.

**Les deux transactions se suivent.** La seconde voit le jeton de la première, le révoque, et insère le sien. Deux e-mails partent, et seul le lien du second fonctionne. C'est exactement ce que `replaceLive` fait pour les invitations, et c'est assumé : le dernier lien demandé est celui qui marche, ce qui est aussi ce à quoi on s'attend en redemandant.

Dans les deux cas l'invariant tient : **un seul jeton vivant par compte, et aucune erreur non gérée.** Un test lance deux demandes en parallèle contre une vraie base et le vérifie.

La lecture du code d'erreur de PostgreSQL existe déjà, dans `cli/admin-account.ts` : le code vit sur l'erreur ou sur sa cause, Drizzle enveloppant celle du pilote. Elle sort donc dans `db/` pour être lue aux deux endroits, et c'est la seule extraction que cette story se permet dans l'existant.

### La réinitialisation révoque tout, dans une transaction

On réinitialise souvent parce qu'on soupçonne un vol. Le nouveau mot de passe et la révocation sont donc **une seule transaction**, et elle ferme tout ce que l'ancien mot de passe avait pu ouvrir :

- `account.password_hash` reçoit la nouvelle empreinte ;
- toutes les **sessions** du compte sont supprimées, sur tous les appareils ;
- toutes les **familles de jetons de mémorisation** le sont aussi ;
- toutes les **attentes de connexion** (`pending_login`) le sont ;
- tous les autres **jetons de réinitialisation** du compte le sont.

Les attentes de connexion sont dans la liste et ce n'est pas du zèle : une attente est un mot de passe déjà validé qui n'attend plus qu'un code, donc un état que le mot de passe qu'on vient de remplacer a ouvert.

L'ordre des quatre étapes est celui-ci, et chacune a sa raison :

1. résoudre le jeton, et refuser d'un seul refus s'il est mort ;
2. hacher le nouveau mot de passe, **hors de toute transaction** (ADR 0011 : une centaine de millisecondes n'a rien à faire dedans) ;
3. consommer le jeton par la requête conditionnelle ;
4. la transaction ci-dessus.

Le prix de cet ordre est le même que celui de l'acceptation d'une invitation : si l'étape 4 échoue, le jeton est brûlé et le mot de passe n'a pas changé. La personne redemande. L'ordre inverse échangerait ce cas rare contre deux réinitialisations concurrentes dont on ne saurait pas laquelle a gagné.

### Les échecs de connexion comptés sur l'adresse sont effacés

Dans la même transaction, les tentatives `failed` de motif `password` portant l'empreinte de l'adresse du compte sont supprimées.

Sans cela, la fonction ne tient pas sa promesse : quelqu'un se trompe cinq fois, se fait bloquer un quart d'heure, réinitialise son mot de passe pour s'en sortir, et reste bloqué avec le mot de passe tout neuf qu'il vient de choisir. Le blocage protège un compte contre des essais de mot de passe ; il n'a plus rien à protéger quand le mot de passe vient d'être remplacé par son titulaire, qui a prouvé qu'il contrôle la boîte.

Seules ces lignes-là partent. Les motifs `code` et `reauth` restent : ils sont comptés sur l'identifiant du compte, ils protègent le second facteur, et cette story ne touche pas au second facteur. Les lignes `blocked` restent elles aussi, pour la trace, et elles n'ont jamais été comptées (ADR 0010).

**Un point à dire précisément, parce qu'il se lit mal.** Une ligne de `login_attempt` porte les deux empreintes à la fois, celle de l'adresse et celle de l'IP. Supprimer les lignes d'une adresse retire donc aussi ces lignes du compte de leur IP. On ne vide pas le compteur d'une IP, mais les lignes qu'elle partageait avec cette adresse disparaissent avec elles.

Cela ne donne rien à un attaquant, et le raisonnement tient en une phrase : pour effacer les lignes qu'il a produites en devinant le mot de passe d'une adresse, il lui faut réussir la réinitialisation de cette adresse, c'est-à-dire lire la boîte en question. Les essais qu'il a menés contre ses cibles portent l'empreinte de **leurs** adresses, et il ne peut pas les atteindre. Ce qu'il peut effacer, ce sont ses propres essais contre sa propre adresse, qu'il n'avait aucune raison de faire.

### La double authentification n'est pas touchée, et la réinitialisation n'ouvre pas de session

La réinitialisation ne touche ni `account_two_factor` ni `two_factor_backup_code`, et ne pose jamais `session.admin_unlocked_at`. Un administrateur qui réinitialise son mot de passe devra toujours son code, et n'obtient aucun droit d'administration par ce chemin. Un test vérifie que la ligne du second facteur est intacte après une réinitialisation.

**La réinitialisation renvoie vers la connexion, et n'ouvre aucune session.** La route répond 204, et l'écran conduit à `/connexion` avec un message qui dit que le mot de passe est à jour.

C'est le choix qui rend le contournement du second facteur **structurellement impossible**, au lieu de le faire dépendre d'une condition que la route ne doit jamais oublier. Ouvrir une session ici obligerait à rejouer tout l'embranchement de `AuthService.login` sur une route publique : compte avec second facteur actif, donc ouvrir une attente, poser son cookie, conduire à l'écran du code ; sinon ouvrir la session. C'est la partie la plus délicate de la connexion, et c'est exactement là que les contournements se logent. Second argument : on vient de fermer toutes les sessions du compte parce qu'on soupçonne un vol, et en rouvrir une aussitôt pour le porteur du lien affaiblit ce geste.

Écarté : **ouvrir la session comme le fait l'acceptation d'une invitation** (ADR 0013). La différence entre les deux cas est nette, et c'est elle qui justifie de trancher autrement. À l'invitation, le compte **vient de naître** : il n'a par construction ni second facteur, ni droits acquis, ni session ailleurs, et la personne n'a rien d'autre à faire. Ici, le compte existe et peut tout avoir. Le prix de ce choix est un écran de plus pour quelqu'un qui connaît déjà le mot de passe qu'il vient de taper.

Tranché par Martin le 9 novembre 2026, sur les raisons ci-dessus.

### La notification part après, et son échec ne défait rien

Un second e-mail part une fois le mot de passe changé, à l'adresse du compte : il dit que le mot de passe a été changé, et quoi faire si ce n'était pas vous. C'est la seule chose qui prévient le titulaire légitime quand ce n'était pas lui.

Il ne porte **aucun lien**, et c'est voulu. Un e-mail de notification cliquable est le support rêvé d'un hameçonnage qui imiterait celui-ci, et la personne qui n'est pas à l'origine du changement n'a rien à cliquer : elle doit joindre la personne qui administre Mijote, le temps que le lot 1 n'ait ni changement d'adresse ni réinitialisation par l'administrateur.

Son envoi est **détaché lui aussi**, pour une raison différente de celle de la demande : le mot de passe est déjà changé et les sessions déjà fermées. Faire échouer la requête sur un SMTP en panne rendrait une erreur pour une opération qui a parfaitement réussi, et la personne croirait devoir recommencer avec un jeton désormais consommé. L'échec est journalisé, la réponse reste un succès.

### La limitation : deux motifs, trois plafonds

Deux valeurs nouvelles dans `login_purpose`, et non une seule.

| Motif          | Ce qui est compté            | Fenêtre | Par sujet                          | Par IP |
| -------------- | ---------------------------- | ------- | ---------------------------------- | ------ |
| `reset_request`| demandes **acceptées**       | 1 h     | 3 par empreinte d'adresse soumise  | 20     |
| `reset_request`| demandes **acceptées**       | 24 h    | 10 par empreinte d'adresse soumise | aucun  |
| `reset`        | **échecs** (jeton mort)      | 15 min  | 5, le sujet étant l'IP             | 5      |

Deux motifs séparés, pour la raison qui avait fait créer `reauth` dans l'ADR 0012 : les deux routes partagent l'adresse IP, et compter ensemble laisserait quelqu'un épuiser le compteur des demandes pour empêcher les vraies réinitialisations d'aboutir, ou l'inverse.

Trois points que cette décision fixe :

- **Le sujet d'une demande est l'adresse soumise**, jamais un compte trouvé. Sinon une adresse inconnue ne serait pas comptée du tout, et un 429 qui n'arrive que sur les comptes existants dirait lesquels existent. C'est le raisonnement de l'ADR 0010, et il vaut d'autant plus ici que l'absence d'oracle est un critère de l'issue.
- **Seules les demandes acceptées comptent.** Les `blocked` sont écrites pour la trace et jamais comptées : les compter laisserait un inconnu maintenir une adresse bloquée en insistant, défaut que l'ADR 0010 avait déjà écarté en ne comptant que les `failed`. C'est aussi pourquoi `AttemptsService` gagne un comptage qui prend sa fenêtre et l'issue à compter en paramètres : `isBlocked` ne sait compter que des échecs, et une demande de réinitialisation n'échoue jamais du point de vue du client.
- **`reset` compte l'IP comme sujet et comme IP**, faute de sujet utile avant la résolution du jeton, exactement comme le motif `invitation`. Ce que ce compteur protège n'est pas le jeton, hors de portée d'une recherche exhaustive, mais la mémoire du serveur : la réinitialisation hache un mot de passe en Argon2id, donc elle réserve 64 Mio par essai.

**Le plafond quotidien, et sa valeur.** Les 3 par heure bornent une rafale, pas l'acharnement : vingt-quatre heures en donnent 72. Le plafond quotidien existe pour cela, et il est à **10**. Ce n'est pas le 3 par jour que l'ADR 0013 a posé pour les invitations, et la différence est dans qui demande : une invitation est subie par celui qui la reçoit, et trois messages non sollicités par jour sont déjà beaucoup ; une réinitialisation est demandée par celui qui tape l'adresse, et quelqu'un qui cherche vraiment son e-mail peut légitimement redemander plusieurs fois dans la journée, après l'avoir cherché dans ses indésirables ou s'être trompé d'adresse une première fois. Dix laisse la place à cette personne et borne une boîte à dix messages par jour venus de chez nous.

**Pas de plafond quotidien par IP.** Un foyer partage une adresse, un réseau d'opérateur mobile en partage une pour des milliers de personnes, et les 20 par heure bornent déjà ce chemin. Un plafond quotidien par IP bloquerait d'abord des gens de bonne foi.

Les trois valeurs vivent dans le service, avec leurs raisons en commentaire, et non dans cet ADR : un seuil chiffré se documente là où il est écrit (ADR 0004).

### Les deux routes sont exemptées du jeton CSRF, et de lui seul

La liste `CSRF_EXEMPT_ROUTES` passe de trois entrées à cinq. La raison est la même que pour la connexion et les deux routes d'invitation, et elle est structurelle : ces routes sont appelées **avant** qu'une session existe, donc aucun secret CSRF ne leur a été remis.

Les **deux autres barrières sont gardées**, l'origine et le type `application/json`. Elles ne protègent pas ici ce qu'elles protégeaient dans l'ADR 0013, puisque la réinitialisation n'ouvre aucune session : il n'y a pas de victime à connecter à un compte qu'un autre contrôle. Elles restent parce que ces routes changent l'état d'un compte et font partir des e-mails, et qu'une page d'un autre site n'a rien à faire là.

Le test qui énumère la liste mot pour mot (ADR 0010) reste la condition pour l'allonger : y ajouter une route demande de changer ce test, donc d'écrire pourquoi elle ne peut pas porter de jeton.

### Les journaux ne portent rien sur le chemin normal

Jamais le jeton, jamais l'adresse en clair, jamais le mot de passe. Sont journalisés :

| Ligne                                       | Champs                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| demande bloquée par la limitation           | les deux empreintes, comme `connexion bloquée`                |
| lien de réinitialisation envoyé             | `resetId`, `accountId`                                        |
| demande abandonnée sur un conflit d'unicité | `accountId`                                                   |
| lien refusé                                 | rien d'identifiant, le jeton étant le seul élément en main    |
| mot de passe réinitialisé                   | `resetId`, `accountId`, le nombre de sessions et de familles fermées |
| envoi impossible                            | les champs de l'erreur SMTP, par `SmtpMailer`                 |

**Une demande acceptée ne journalise rien**, pas même les empreintes, et c'est le point que cette section tranche. L'ADR 0010 avait identifié l'oracle des journaux : qui les lit et détient le poivre peut calculer l'empreinte d'une adresse devinée. Si la ligne « demande reçue » portait l'empreinte et que la ligne « lien envoyé » portait l'`accountId`, le même identifiant de requête relierait les deux et confirmerait que l'adresse a un compte ici. En ne journalisant l'empreinte que sur un 429, qui est déjà visible dans la réponse, cette corrélation n'existe pas.

Un test relit les lignes écrites et refuse d'y trouver le jeton, l'adresse et l'empreinte sur le chemin normal, comme le font déjà les stories #11 et #12.

## Conséquences

- **Aucune variable d'environnement nouvelle.** `APP_BASE_URL` porte déjà le lien, `SECURITY_PEPPER` les empreintes, et la durée d'une heure est une constante. `.env.example` et le README ne changent pas.
- La migration `0006` ajoute la table `password_reset`, son index unique sur l'empreinte, son index unique partiel par compte, et les deux valeurs `reset_request` et `reset` de `login_purpose`.
- `AuthRepository` gagne les requêtes du jeton, quatre révocations en masse par compte, le changement d'empreinte de mot de passe, la suppression des échecs `password` d'une empreinte d'adresse, et une ligne dans `purgeExpired`. Les tables touchées sont les siennes.
- `AttemptsService` gagne un comptage paramétré par fenêtre et par issue. `isBlocked`, `record` et `purge` ne changent pas, et les trois limitations existantes gardent leurs valeurs.
- Un contrôleur à part, `auth/password-reset.controller.ts`, et non deux routes de plus dans `auth.controller.ts`, qui porte déjà huit routes : le préfixe `auth/password` a sa propre politique, publique, sans session à poser et avec sa limitation.
- Deux gabarits d'e-mail de plus, et `isWebUrl` sort de `invitation.ts` vers `html.ts`, les trois gabarits en ayant désormais besoin.
- Deux écrans nouveaux, donc **deux passages axe-core**, un par écran, comme le veut le socle d'accessibilité (ADR 0007). La page de connexion gagne le lien qui y conduit : sans lui, la fonction n'est atteignable qu'en tapant l'adresse.
- Les adresses visibles sont en français, `/mot-de-passe-oublie` et `/mot-de-passe/reinitialisation`, les routes de l'API en anglais, `POST /auth/password/forgot` et `POST /auth/password/reset`.
- Les deux routes répondent `Cache-Control: no-store` : la demande reçoit une adresse e-mail dans son corps, et la réinitialisation un mot de passe.
- **Pas de route d'aperçu du jeton**, contrairement aux invitations. L'aperçu y existait pour afficher l'adresse invitée ; ici il n'y a rien à montrer, et une route qui dirait « ce jeton est valable » serait une route publique de plus à garder et à limiter pour aucun gain. Le formulaire s'affiche, et la soumission tranche. Un fragment absent, lui, se voit sans appel.
- La garantie d'égalité des temps est **structurelle, et c'est un test qui la tient** : un envoyeur qui ne résout jamais, et une réponse qui arrive quand même. Une mesure de temps vient en plus, dans le test d'intégration, avec ses relevés en commentaire ; elle confirme, elle ne garantit pas, un chronomètre étant instable par nature.

## Quand revoir cette décision

- **Si la fiabilité d'envoi devient un sujet** : le travail détaché perd son message quand le processus s'arrête, et la réponse ne peut rien en dire. Une table de sortie, écrite dans la transaction et vidée par un envoyeur, est la suite naturelle, et elle vaudra pour les invitations autant que pour la réinitialisation.
- **Quand le changement de mot de passe depuis le profil arrivera** : il partagera le changement d'empreinte et la révocation, mais il connaît son compte et exige l'ancien mot de passe, donc il n'a ni jeton ni oracle à traiter.
- **Quand la réinitialisation par l'administrateur arrivera** (issue #48) : elle ne doit pas devenir un moyen de prendre un compte, et c'est une décision à part, avec son journal d'audit.
- **Si le second facteur s'ouvre aux comptes ordinaires** : la question « la réinitialisation ouvre-t-elle une session » se reposera pour eux comme elle s'est posée ici, et la réponse donnée reste la plus simple à tenir.
- **Si l'API tourne sur plusieurs instances** : le travail détaché vit dans le processus qui a reçu la demande, ce qui ne change rien à son fonctionnement, mais la purge opportuniste de l'ADR 0010 reste le point à revoir.
