# ADR 0012 : la double authentification de l'administrateur

- Statut : acceptée
- Date : 7 novembre 2026

## Contexte

La story #11 protège le compte administrateur par une double authentification TOTP. Le cahier des charges conditionne l'accès à l'espace d'administration à ce second facteur (sections 9 et 10), et `.claude/rules/security.md` l'exige avec la traçabilité des actions.

L'ADR 0010 vient de poser la session : cookie opaque, session en base, trois barrières CSRF, limitation des tentatives. Il avait **écarté toute pré-session**, et c'est le premier point que cette décision doit traiter, puisqu'un second facteur crée par nature un état entre « mot de passe validé » et « session ouverte ».

## Décision

### L'état intermédiaire vit dans sa propre table

Une table `pending_login` (compte, empreinte du jeton, secret CSRF, nombre d'essais, mémorisation demandée, expiration) et un cookie à elle, `mijote_pending`, `HttpOnly`, `Secure`, `SameSite=Lax`, sans `Max-Age`. **Cinq minutes**, usage unique.

Ce n'est pas la pré-session que l'ADR 0010 avait écartée. Celle-là aurait existé pour chaque visiteur, avant toute identification, et il aurait fallu renouveler son identifiant à la connexion. Celle-ci n'existe qu'après un mot de passe correct, pour un compte connu, et elle est **détruite** au moment où la session s'ouvre, qui reçoit un jeton neuf : aucune fixation possible.

Écarté : **une colonne `two_factor_pending` sur `session`**. Elle aurait réutilisé toute la mécanique existante, et c'est précisément le danger : une session qui existe et vaut « presque » fait reposer la sécurité sur une condition que la garde ne doit jamais oublier. Avec une table séparée, la garde de session continue de ne connaître que « une session ou rien », et le cookie d'attente ne peut rien autoriser par mégarde. Il ne permet qu'une route, la soumission du code.

**L'attente porte son propre secret CSRF.** C'est ce qui garde la liste des routes exemptées à une seule entrée, la connexion : la soumission du code présente un jeton comme n'importe quelle autre route, et garde donc les trois barrières. Mesuré : sans attente valide, la garde de session refuse en 401 avant que le type de média ou l'origine ne soient regardés, et c'est `auth.integration.spec.ts`, où une vraie attente existe, qui mesure le 415 et le 403.

### Le secret TOTP est chiffré, avec une clé qui n'est pas le poivre

AES-256-GCM de `node:crypto`, donc aucune dépendance. GCM et non CBC : il authentifie ce qu'il chiffre, donc une ligne modifiée en base est refusée au déchiffrement au lieu de rendre un secret différent, qui ferait échouer tous les codes sans qu'on sache pourquoi. L'identifiant du compte entre en donnée authentifiée associée : une ligne recopiée vers un autre compte est illisible.

La clé vit dans `SECURITY_TOTP_KEY`, 32 octets en base64, **distincte de `SECURITY_PEPPER`**. Le poivre sert à compter des empreintes, cette clé à relire un secret : les mélanger ferait qu'un changement de poivre rendrait illisibles toutes les double authentifications. L'API refuse de démarrer sans elle, et `.env.example` écrit la conséquence de sa perte : chaque administrateur doit réinscrire son application.

Le format stocké porte sa version (`v1.<iv>.<tag>.<chiffré>`), pour qu'un changement de clé ou d'algorithme puisse relire les anciennes lignes.

### Le TOTP est écrit ici, et mesuré contre les RFC

Trente lignes de `node:crypto` pour TOTP (RFC 6238, par-dessus HOTP RFC 4226), vingt pour le base32 (RFC 4648). Secret de **vingt octets**, comme la RFC 4226 le prescrit.

La raison n'est pas l'économie d'une dépendance : **les deux RFC publient leurs vecteurs de test**. L'implémentation se mesure donc contre une référence officielle, ce qu'aucune relecture de dépendance ne donne. Les six vecteurs de l'appendice B de la RFC 6238 sont vérifiés sur huit chiffres, et les sept vecteurs de la section 10 de la RFC 4648 dans les deux sens.

Écartée : `otpauth`, zéro dépendance et bien maintenue, pour cette seule raison.

La comparaison du code se fait **à temps constant** et sans sortie anticipée sur les trois candidats de la fenêtre : le temps de réponse ne dit ni quel pas a correspondu, ni combien de chiffres étaient justes.

### Le rejeu et le décalage d'horloge

Tolérance de **plus ou moins une fenêtre de 30 secondes**, soit 90 secondes acceptées. Pas deux : chaque pas de plus double les codes valables à un instant donné, et une horloge de téléphone qui dérive davantage est un cas rare, que le code de secours couvre.

Le rejeu est fermé par la colonne `last_used_step`, et la mise à jour est **une seule requête conditionnelle** (`where last_used_step is null or last_used_step < ?`), comme la rotation du jeton de mémorisation de l'ADR 0010. Deux soumissions simultanées du même code ne peuvent donc pas passer toutes les deux : la seconde ne modifie aucune ligne et est refusée. Un test parallèle le mesure, et un autre contre le vrai SQL.

### Les codes de secours : dix, numérotés, hachés en Argon2id

Dix codes de **douze lettres** tirées d'un alphabet de vingt-quatre (l'alphabet latin sans `I` ni `O`), soit environ 2^55. Affichés une seule fois, stockés hachés, usage unique, consommés par une requête conditionnelle elle aussi.

Le code porte **son numéro en clair** : `7-KMXQ-PTBV-ZRDC`. Ce n'est pas un secret, et c'est ce qui permet de ne vérifier **qu'une** empreinte par essai. Sans lui, un essai demanderait les dix : plus d'une seconde et 640 Mio de mémoire, pour un chemin qu'un inconnu peut solliciter.

**Hachés en Argon2id, et non par un HMAC**, contrairement aux jetons de session que l'ADR 0010 hache en SHA-256. La différence est la longueur : 32 octets tirés au hasard n'ont pas de dictionnaire à ralentir, 55 bits si. Le calcul, pour qu'il soit écrit plutôt que cru :

| | Espace | Coût par essai | Temps pour l'espace entier |
| --- | --- | --- | --- |
| HMAC-SHA256, clé fuitée | 24^12 ≈ 3,6 × 10^16 | ~10^-10 s sur une carte graphique récente | ~3,6 × 10^6 s, soit de l'ordre de **mille heures** (quelques dizaines de jours) |
| Argon2id (64 MiB, 3 passes) | 24^12 ≈ 3,6 × 10^16 | 0,11 s mesurée (ADR 0011) | ~4 × 10^15 s, soit **plus de cent millions d'années** |

Le HMAC seul déplacerait donc la protection du secret vers la clé. Or cette clé vivrait dans le même `.env` que les sauvegardes côtoient : une fuite complète donnerait les codes de secours en quelques dizaines de jours, c'est-à-dire ce qui reste quand le téléphone est perdu, le dernier verrou de l'administration. Avec Argon2id, elle ne les donne pas.

Écartée aussi : **la combinaison des deux** (HMAC pour trouver la ligne, Argon2id pour la vérifier). Un attaquant hors ligne ne cherche pas quelle ligne correspond à un code, il attaque une ligne choisie : la clé ne protège alors que la recherche, pour le même coût par essai que le numéro. Deux primitives et une colonne de plus pour une garantie identique.

**Le prix du numéro**, et il est écrit ici : il fait partie du code. Qui ne recopie que les lettres reçoit un message qui le dit, et c'est le **seul** message distinct de cet écran. Un numéro hors plage, un code faux, un code déjà consommé et un rejeu partagent le même message **et le même temps de réponse**, une empreinte leurre étant vérifiée quand la ligne n'existe pas. La saisie est passée en majuscules et débarrassée de ses tirets et de ses espaces : un code tapé en minuscules passe.

### La limitation réutilise celle de la connexion

La même table `login_attempt`, avec une colonne `purpose` (`password` ou `code`) : les deux compteurs restent séparés, pour qu'un code mal tapé ne rapproche pas du blocage de la connexion elle-même. Au stade du code, le sujet compté est l'empreinte de l'identifiant de compte, le compte étant déjà connu.

Deux limites se superposent : **cinq essais sur une même attente**, qui la détruisent et renvoient au mot de passe, et la fenêtre glissante de quinze minutes de l'ADR 0010, qui survit à cette destruction et empêche donc de la contourner en recommençant.

### L'activation et la désactivation exigent le mot de passe

Les deux, et c'est le point le plus important de cette décision. Sans cela, une session volée d'un administrateur **sans** second facteur suffirait à inscrire l'application de l'attaquant : il obtiendrait l'administration, et le propriétaire se retrouverait verrouillé hors de son propre compte. Le mot de passe est donc redemandé à l'inscription **et** à la confirmation, pour que chaque route soit sûre par elle-même et non parce que l'autre l'est. L'écran ne le demande qu'une fois et le renvoie avec le code.

La désactivation exige le mot de passe **et** un code, du téléphone ou de secours. C'est aussi le chemin du téléphone perdu : le code de secours y sert, et le mot de passe empêche qu'une session volée la désactive.

Une inscription déjà confirmée n'est jamais écrasée par une nouvelle : la condition est dans le SQL (`on conflict ... where activated_at is null`), et seule la désactivation en change.

### La mémorisation rouvre l'application, pas l'administration

Le cookie de mémorisation de l'ADR 0010 ne dispense pas du second facteur, mais il ne le réclame pas non plus pour consulter son planning. Une session reprise naît **sans** droits d'administration (`session.admin_unlocked_at` nul), et la première route d'administration réclame un code, que `POST /auth/two-factor/unlock` valide.

C'est ce que l'issue #11 décrivait déjà : « la session n'obtient les droits d'administration qu'après ce code ». Un cookie de mémorisation volé donne donc l'application, jamais l'administration.

Écartée : **la dispense totale** (l'appareil comme second facteur), qui ferait d'un cookie volé un accès administrateur complet. Écartée aussi : **le code à chaque réouverture du navigateur**, plus simple, mais qui réclame un code pour consulter une liste de courses.

Une route d'administration demande donc trois choses, et non une : le rôle, un second facteur **actif**, et une session qui l'a **validé**. Les deux refus portent des messages différents, pour que l'interface conduise au bon écran.

### Obligatoire pour l'administrateur, et pour lui seul

Un administrateur sans second facteur garde sa session et toute l'application ; **aucune** route d'administration ne l'accepte, et l'en-tête le conduit à l'activer. La double authentification des autres comptes est hors périmètre de la story #11, et aucun écran ne la propose.

### Les journaux

Jamais le secret, jamais l'URI d'inscription (elle le contient), jamais un code, jamais un code de secours. Sont journalisés : l'inscription, l'activation, la désactivation, un code refusé, l'usage d'un code de secours avec son numéro, et le déverrouillage. Un test relit les lignes écrites et refuse d'y trouver le secret, le code ou l'adresse.

## Conséquences

- `SECURITY_TOTP_KEY` entre dans `.env.example`, et son absence arrête le démarrage. La perdre rend tous les secrets illisibles : les administrateurs doivent réinscrire leur application, et c'est écrit là où la variable est documentée.
- Les migrations `0002` et `0003` ajoutent trois tables (`account_two_factor`, `two_factor_backup_code`, `pending_login`), la colonne `purpose` de `login_attempt` et la colonne `admin_unlocked_at` de `session`.
- Une dépendance de plus, **côté front seulement** : `uqr` 0.1.3, MIT, sans dépendance, pour dessiner le QR code. Le secret ne quitte donc pas la page, et l'API n'a rien gagné.
- Le QR code est servi en **image de données** (`data:image/svg+xml,...`) et non injecté par `v-html` : une image ne peut rien exécuter. **La CSP de l'issue #31 devra donc autoriser `img-src 'self' data:`**, sans quoi le QR ne s'affichera pas en production.
- L'activation hache dix codes de secours, soit un peu plus d'une seconde : c'est une fois par inscription, et c'est le prix de codes qui résistent à une base volée.
- `POST /auth/two-factor/unlock` n'a pas encore d'écran : il n'y a aucune route d'administration dans le lot 1. La route et sa garde sont mesurées par les tests, et l'écran viendra avec le premier écran d'administration.

## Quand revoir cette décision

- À l'arrivée du premier écran d'administration : c'est là que le déverrouillage aura une interface, et que la distinction entre « pas encore activée » et « session à déverrouiller » devra devenir lisible par le front autrement que par le texte du message.
- Si la double authentification est ouverte aux comptes non administrateurs : l'obligation et le parcours changent, pas la mécanique.
- Si les clés d'accès (WebAuthn) deviennent le second facteur : elles remplacent le TOTP, et cette décision est à reprendre entièrement.
- Si une rotation de la clé de chiffrement devient nécessaire : le format porte sa version pour cela, mais la procédure reste à écrire.
