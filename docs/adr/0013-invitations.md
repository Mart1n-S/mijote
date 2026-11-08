# ADR 0013 : les invitations, ticket d'inscription d'une V1 fermée

- Statut : acceptée
- Date : 8 novembre 2026

## Contexte

La story #12 ouvre l'inscription, et elle l'ouvre à peine : « en V1, l'inscription se fait uniquement sur invitation » (cahier des charges, section 3). C'est la seule porte d'entrée de l'application, et elle est franchie par quelqu'un qui n'a pas encore de compte, donc pas de session, donc aucune des protections que l'ADR 0010 a posées autour d'une session.

Trois décisions antérieures la cadrent. L'ADR 0010 a posé la session, le cookie opaque et les trois barrières CSRF, dont une liste d'exemptions qui ne comptait qu'une entrée. L'ADR 0011 a mesuré Argon2id. L'ADR 0012 a rendu la double authentification obligatoire pour l'administrateur, et a laissé son déverrouillage sans écran, faute de route d'administration dans le lot : envoyer une invitation en est une, donc cet écran arrive ici.

## Décision

### Une invitation ne rattache à rien

L'invitation est un **ticket d'inscription**, et rien d'autre. Celui qui l'accepte crée son compte **et son propre foyer**, comme le prévoit le cahier des charges : « un compte correspond à un foyer de 1 à 35 personnes » (section 3).

Les 35 sont donc des **mangeurs** d'un même foyer, que le profil du foyer décrira (issue #14), et non des comptes. Il n'y a par conséquent **aucun plafond de comptes** dans ce lot, et l'invitation ne porte pas d'identifiant de foyer.

Écarté : **l'invitation qui fait rejoindre le foyer de l'invitant**. Ce serait un partage de foyer entre plusieurs comptes, que ni le cahier des charges ni l'issue #12 ne décrivent, et qui demanderait de décider qui voit et modifie quoi dans un foyer partagé. Le jour où ce besoin existera, ce sera une autre fonctionnalité, avec son propre ADR, et non une variante de celle-ci.

Le **rôle choisi à l'invitation est le rôle dans l'application** : inviter quelqu'un comme administrateur en fait un administrateur, qui devra activer sa double authentification avant d'entrer en administration (ADR 0012).

Le foyer naît avec un **nom par défaut**, « Mon foyer », renommable au profil (issue #14). Écarté : le demander sur la page d'acceptation. Rien ne lit encore ce nom, et réclamer une donnée inutilisée sur le premier écran d'une personne est de la friction là où l'abandon coûte le plus. Écarté aussi : le dériver de l'adresse, qui recopierait une donnée personnelle dans une seconde colonne.

**Le lien vaut la vérification de l'e-mail** que demande la section 7 du cahier des charges : il n'arrive que dans la boîte visée, et l'accepter prouve qu'on la contrôle. Aucun second message de vérification n'est donc envoyé.

### Le jeton est opaque, haché, à usage unique et révocable

32 octets tirés au hasard, en base64url, comme les jetons de session de l'ADR 0010, et stockés en **empreinte SHA-256** : pas d'Argon2 ici, un jeton de 256 bits n'ayant pas de dictionnaire à ralentir. Le jeton en clair n'existe que dans l'e-mail parti et dans la barre d'adresse de qui l'a reçu : ni la base, ni les journaux, ni l'écran d'administration ne le montrent.

**Soixante-douze heures** par défaut, réglables par `INVITATION_TTL_HOURS` entre 1 et 720. **Usage unique**, et **révocable** tant qu'elle n'a pas servi.

L'état d'une invitation (en attente, utilisée, expirée, révoquée) se **déduit de ses dates**, et n'est pas stocké : une colonne de statut serait une seconde vérité, qu'il faudrait tenir à jour au passage de chaque heure.

### Le jeton voyage dans le fragment, et s'échange contre un POST

Le lien est `https…/invitation#<jeton>`, et le jeton est dans le **fragment**. Un fragment n'est jamais envoyé au serveur : il ne part donc ni dans l'en-tête `Referer` d'une ressource tierce, ni dans les journaux du mandataire, ni dans les statistiques d'un serveur frontal, et il n'apparaît dans aucune ligne de journal d'accès.

La page le lit, l'**efface aussitôt** de la barre d'adresse (`history.replaceState`), et l'échange contre un `POST /invitations/preview`, puis un `POST /invitations/accept`. Les deux routes prennent le jeton dans le **corps**, y compris celle qui ne fait que lire : une adresse appelée se retrouve dans l'historique du navigateur et dans les journaux, un corps non.

Écarté : **le jeton en paramètre de requête** (`?token=…`), la façon la plus répandue. C'est précisément celle qui fuit : l'en-tête `Referer` l'emporte vers toute ressource tierce de la page, et les mandataires journalisent la chaîne de requête. Le projet n'a aucune ressource tierce (`e2e/third-party.spec.ts` le mesure), mais la protection ne doit pas dépendre de cela.

Écarté aussi : **compter sur `Referrer-Policy`**. L'en-tête est une bonne idée et viendra avec les en-têtes de sécurité (issue #31), mais il ne protège ni les journaux du mandataire, ni l'historique. Le fragment, lui, ne dépend d'aucun réglage.

### L'adresse publique vient de la configuration, jamais de la requête

`APP_BASE_URL` est lue au démarrage, et l'API refuse de démarrer sans elle. C'est elle, et elle seule, qui construit le lien envoyé.

**Pas l'en-tête `Host`**, qui est écrit par le client : le construire avec lui laisserait quelqu'un demander une invitation pour une adresse qu'il contrôle, avec un `Host` à lui, et faire partir le jeton vers son domaine. C'est l'erreur classique des e-mails de réinitialisation de mot de passe, et elle se paie par un compte.

### Un seul refus pour cinq cas, et pas d'oracle

Expiré, révoqué, déjà utilisé, inconnu, ou dont l'adresse a entre-temps un compte : les cinq reçoivent **le même message et le même statut** (410). Les distinguer dirait à qui tient un lien si un compte existe pour cette adresse, et l'appartenance à cette application est précisément ce qu'une V1 fermée ne publie pas. Un test les parcourt tous les cinq et compare les réponses.

Côté administrateur, le message est au contraire **explicite** : inviter une adresse qui a déjà un compte est refusé par un 409 qui le dit. Ce n'est pas un oracle : la route exige le rôle administrateur et son second facteur, et l'administrateur est justement la personne qui doit savoir pourquoi son invitation ne part pas.

### L'index unique partiel, et ce qu'il ne peut pas dire

Une seule invitation **vivante** par adresse, garantie par un index unique partiel (`where used_at is null and revoked_at is null`). La contrainte vit dans la base et non dans une lecture préalable, qui laisserait passer deux écritures simultanées.

Son prédicat **ne peut pas exclure les invitations expirées** : `now()` n'est pas immuable, et PostgreSQL refuse une fonction volatile dans un index. Une invitation expirée mais non révoquée occupe donc encore la place, et sans traitement une adresse ne pourrait plus jamais être réinvitée après l'expiration de son premier lien.

D'où la décision : **la création révoque l'invitation vivante de la même adresse, dans la même transaction**, puis insère la neuve. Un test contre une vraie base part d'une invitation expirée que personne n'a révoquée, et vérifie qu'elle cède la place.

### L'acceptation consomme avant de créer

L'ordre est inversé par rapport à l'intuition : l'invitation est consommée **avant** la création du compte, par une requête conditionnelle (`where used_at is null and revoked_at is null and expires_at >= ?`). Deux acceptations simultanées du même lien ne peuvent donc pas créer deux comptes : la seconde ne modifie aucune ligne et est refusée.

Créer d'abord aurait laissé la seconde échouer sur l'unicité de l'adresse, **après** avoir payé un hachage Argon2id, et sur une erreur de contrainte plutôt que sur un refus écrit. Un test envoie les deux requêtes ensemble contre une vraie base.

### La session s'ouvre au bout, sans mémorisation ni déverrouillage

L'acceptation ouvre la session du compte créé : la personne vient de prouver qu'elle contrôle son adresse et de choisir son mot de passe, lui redemander de se connecter serait de la friction sans gain.

Sans « se souvenir de moi », qui est un choix à faire en connaissance de cause, et **sans droits d'administration** : un compte invité comme administrateur devra d'abord inscrire son second facteur, puis se déverrouiller par un code (ADR 0012).

### Les deux routes publiques sont exemptées du jeton CSRF, et de lui seul

La liste des routes exemptées passe de une à trois entrées : la connexion, l'aperçu et l'acceptation. La raison est la même pour les trois, et elle est structurelle : elles sont appelées **avant** qu'une session existe, donc aucun secret CSRF ne leur a été remis. Le pouvoir de l'acceptation vient du jeton que son corps porte, et non d'un cookie, donc il n'y a rien à détourner.

Les **deux autres barrières sont gardées**, et ce n'est pas une précaution de style : l'acceptation **ouvre une session**. Sans elles, une page d'un autre site pourrait soumettre un jeton qu'elle possède et connecter une victime à un compte qu'elle contrôle, ce qui lui ferait ensuite voir ou saisir dans ce compte ce qu'elle croit être le sien. L'origine est donc comparée, et le type `application/json` exigé. Un test contre une vraie base refuse les deux cas, et le test suivant, qui appelle les mêmes routes sans jeton CSRF et obtient 200 puis 201, est ce qui prouve que l'exemption existe bel et bien.

Le test qui énumère la liste mot pour mot (ADR 0010) reste la condition pour l'allonger : y ajouter une route demande de changer ce test, donc d'écrire pourquoi elle ne peut pas porter de jeton.

### La limitation : par invitant, par adresse, et par IP à l'acceptation

Trois compteurs, chacun pour une menace distincte.

- **Dix envois par heure et par administrateur**, et **trois par jour et par adresse invitée**. Pas de table nouvelle : les invitations sont des lignes datées, donc elles se comptent elles-mêmes. La limite par adresse est la plus importante des deux : sans elle, notre serveur deviendrait un moyen d'inonder la boîte de quelqu'un.
- **Cinq acceptations ratées par IP et par quart d'heure**, dans la table `login_attempt` sous un quatrième motif, `invitation`. Le jeton est hors de portée d'une recherche exhaustive, ce n'est donc pas lui que ce compteur protège : c'est la mémoire du serveur, cette route hachant un mot de passe en Argon2id. Un motif à part, comme `reauth` dans l'ADR 0012, pour qu'une acceptation ratée ne rapproche personne du blocage de la connexion.

L'IP est passée comme sujet **et** comme IP : les deux compteurs de la limitation tiennent alors la même valeur, et la borne effective est la plus basse des deux. Il n'y a pas de sujet utile à compter ici, l'adresse invitée n'étant connue qu'après la résolution du jeton.

### Les journaux ne portent ni le jeton ni l'adresse

Sont journalisés : l'envoi, la révocation, l'acceptation, et un envoi bloqué par la limitation. Chaque ligne porte l'identifiant de l'invitation, celui du compte créé et le rôle, **jamais le jeton, jamais l'adresse e-mail**. Un test relit les lignes écrites et refuse d'y trouver l'un ou l'autre.

### Les invitations terminées sont effacées

Une invitation porte une **adresse e-mail en clair**, puisque c'est à elle qu'il faut écrire. Celles qui sont utilisées, expirées ou révoquées depuis plus de **trente jours** sont donc supprimées, par une purge accrochée à l'envoi d'une invitation : assez fréquent pour que rien ne s'accumule, assez rare pour ne rien coûter, comme la purge des tentatives de connexion (ADR 0010).

### Ce que cette story embarque de l'issue #48

L'ADR 0012 laissait `POST /auth/two-factor/unlock` sans écran, faute de route d'administration. Envoyer une invitation en est une, donc cette story embarque le minimum nécessaire : le champ `adminUnlocked` dans la réponse de session, l'écran de déverrouillage, et l'entrée de l'espace d'administration.

Le reste de l'issue #48 ne bouge pas : la gestion des comptes, le journal d'audit à l'écran, et la péremption propre des droits d'administration.

La garde de navigation vérifie trois choses dans cet ordre, le rôle, le second facteur, puis le déverrouillage, et conduit à l'écran qui corrige ce qui manque. Un compte ordinaire reçoit la page introuvable : lui annoncer qu'une page existe mais lui est fermée ne lui apprendrait rien d'utile. Ce n'est pas ce qui protège l'administration, et aucun test ne le laisse croire : le serveur refuse ces routes de son côté.

## Conséquences

- `APP_BASE_URL` entre dans `.env.example`, et son absence **arrête le démarrage**. Une invitation partie vers le mauvais domaine ne se rattrape pas. `INVITATION_TTL_HOURS` y entre aussi, facultative.
- La migration `0005` ajoute la table `invitation`, ses deux index uniques et le motif `invitation` de `login_attempt`.
- La création d'un compte vit désormais dans un seul endroit, `accounts/account-creation.ts`, appelé par la commande `admin:create` et par l'acceptation d'une invitation : même hachage, même transaction, même normalisation.
- La liste des routes exemptées du jeton CSRF compte trois entrées, et le test qui l'énumère les nomme.
- L'écran d'administration des invitations **ne montre aucun lien**. Un administrateur qui veut relancer quelqu'un renvoie une invitation, ce qui révoque la précédente : il n'y a pas de « copier le lien », et c'est volontaire.
- Le gabarit d'e-mail de la story #9 a été corrigé : « Invitation à rejoindre Mijote », sans nom de foyer, et **sans l'adresse de l'invitant**, qui serait exposée à chaque invité. Le message est signé par Mijote.
- Quatre écrans nouveaux, donc quatre passages axe-core, un par écran, comme le veut le socle d'accessibilité (ADR 0007).

## Quand revoir cette décision

- Quand l'inscription s'ouvrira au-delà de l'invitation : la V2 peut vouloir un lien public ou une liste d'attente, et le ticket d'inscription cesse alors d'être la seule porte.
- Si plusieurs comptes doivent partager un foyer : c'est la fonctionnalité que cette décision écarte, et elle demandera son propre ADR, avec les droits de chacun dans un foyer partagé.
- Si une invitation doit porter autre chose qu'un rôle (un foyer, un quota, une durée choisie) : la table est faite pour une invitation sans contexte, et l'ajout se discute.
- À l'issue #48, qui reprendra l'espace d'administration dont cette story ne pose que l'entrée.
