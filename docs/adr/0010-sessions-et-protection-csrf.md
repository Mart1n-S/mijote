# ADR 0010 : sessions opaques en base, et protection CSRF à trois barrières

- Statut : acceptée
- Date : 3 novembre 2026

## Contexte

La story #10 ouvre la connexion : il faut décider où vit une session, ce que « se souvenir de moi » change, et comment une requête qui modifie l'état prouve qu'elle vient de l'application.

Le cahier des charges et `.claude/rules/security.md` posaient déjà le cadre : cookie `HttpOnly`, `Secure`, `SameSite=Lax` au minimum, aucun jeton dans le `localStorage`, protection CSRF sur toute requête qui modifie l'état, limitation des tentatives de connexion. L'issue elle-même notait que le mode de stockage des sessions méritait un ADR.

L'API est servie sous `/api` sur la même origine que la PWA, par le mandataire de `vite.config.ts` en développement et par le serveur frontal du homelab en production. Il n'y a donc aucune requête entre origines, et **aucun CORS n'est ouvert**. Ce point n'est pas un détail de déploiement : la première des trois barrières ci-dessous en dépend.

## Décision

### La session vit en base, le cookie ne porte qu'un secret opaque

Une ligne dans la table `session`, et un cookie de 32 octets tirés au hasard. Seule l'empreinte SHA-256 du jeton est stockée : une fuite de la table ne donne aucune session utilisable. SHA-256 suffit là où un mot de passe demande Argon2, 32 octets aléatoires n'ayant pas de dictionnaire à ralentir (ADR 0011).

Écarté : **un jeton signé (JWT) sans état.** Il ne se révoque pas. La déconnexion doit fermer la session côté serveur, et l'issue le demande explicitement ; avec un jeton signé, il faudrait tenir une liste de révocation, c'est-à-dire la table qu'on cherchait à éviter.

Durées, validées le 3 novembre 2026 :

| Limite                | Valeur | Pourquoi                                                         |
| --------------------- | ------ | ---------------------------------------------------------------- |
| Inactivité            | 2 h    | Un poste laissé ouvert se referme seul.                          |
| Absolue               | 12 h   | Indépendante de l'activité : une session ne vit pas une journée. |
| Cookie de session     | aucune | Sans `Max-Age`, il meurt à la fermeture du navigateur.           |
| Cookie de mémorisation| 30 j   | Le seul moyen de reprendre une session après fermeture.          |

La dernière activité n'est réécrite qu'au-delà d'une minute : sans ce seuil, chaque requête d'une page ferait un `UPDATE` pour un champ qui ne sert qu'à comparer deux heures.

### « Se souvenir de moi » : des familles de jetons, à rotation

Le cookie porte deux choses, séparées par un point : la famille, en clair, qui retrouve la ligne, et un secret, dont seule l'empreinte est stockée. Le secret est **remplacé à chaque usage**, et l'ancien reste accepté pendant **30 secondes** après la rotation.

Ce délai de grâce n'est pas une facilité : deux onglets qui se chargent en même temps présentent le même cookie, et sans lui le second passerait pour un vol et déconnecterait l'appareil. La requête qui arrive dans la grâce ouvre bien sa session, mais **ne repose pas le cookie de mémorisation** : le navigateur a déjà reçu le nouveau, et lui en poser un ancien le défairait.

La grâce ne couvre que l'enchaînement, une requête lisant après que l'autre a écrit. Deux requêtes **vraiment simultanées** lisent le même secret avant qu'aucune n'écrive, et la grâce ne les voit pas, puisqu'elle compare au secret précédent, qui n'existe pas encore. D'où la seconde protection : **la rotation est conditionnée au secret qu'on vient de lire** (`update ... where family = ? and secret_hash = ?`). La requête qui ne modifie aucune ligne sait qu'une sœur est passée avant elle, et elle la laisse gagner, sans reposer de cookie et sans crier au vol. Sans cette condition, les deux écrivaient, le navigateur ne gardait qu'un cookie, et le suivant déclenchait la révocation de la famille : une alerte de vol fausse déconnecte, et apprend à ne plus croire l'alerte.

Un secret qui ne correspond plus, hors grâce, ne peut venir que d'une copie du cookie : toute la famille est révoquée et un avertissement est journalisé, avec la famille et le compte, jamais le secret. Sans les familles, un vol ne se verrait jamais.

**La reprise n'a lieu que sur `GET /auth/session`**, que le front appelle au démarrage. Une garde qui poserait des cookies au passage de n'importe quelle requête serait beaucoup plus difficile à suivre, et la rotation deviendrait un effet de bord de la navigation.

La déconnexion ne ferme que l'appareil courant : sa session et sa famille. Révoquer les autres appareils est hors périmètre.

### Le CSRF, trois barrières, et ce qu'elles supposent

1. **Le type de média.** Toute requête qui modifie l'état doit être du `application/json`, sinon 415. Un formulaire d'un autre site ne peut envoyer que trois types, dont aucun n'est celui-là ; une requête `fetch` qui le déclarerait demanderait d'abord la permission par une requête préalable, à laquelle l'API ne répond pas. Un `text/plain` dont le corps serait du JSON valide est refusé pour ce qu'il est, et non pour ce qu'il contient.
2. **L'origine.** `Origin` est un en-tête interdit : une page ne peut pas le choisir, seul le navigateur l'écrit. La comparaison porte sur l'origine **complète**, schéma, hôte et port. En repli, quand `Origin` manque, seul `Sec-Fetch-Site: same-origin` est accepté, jamais `same-site` : un autre service sur un sous-domaine voisin passerait. Les deux en-têtes absents, la requête est refusée.
3. **Le jeton.** Le cookie `mijote_csrf`, le seul lisible par le script, porte le secret CSRF de la session ; le front le relit et le renvoie en en-tête `X-CSRF-Token`, et le serveur compare les deux à temps constant. Une page d'un autre site ne peut ni lire ce cookie, ni écrire cet en-tête.

**La barrière du type de média, et elle seule, suppose qu'aucun CORS n'est ouvert sur l'API.** Une origine autorisée, avec l'en-tête `content-type` dans sa liste permise, ferait approuver la requête préalable : un autre site pourrait alors envoyer du `application/json`, et cette barrière cesserait d'en être une. C'est la condition à relire en traitant l'issue #31 : si une origine doit être ouverte un jour, cette décision est à reprendre, pas à contourner.

Les deux autres ne dépendent pas du CORS. La comparaison d'origine porte sur l'en-tête `Origin` de la requête reçue, que le navigateur écrit de lui-même sur toute requête inter-origines, et elle ne consulte aucune liste d'origines permises : elle tient avec ou sans CORS. Le jeton, lui, n'est lisible que par une page de cette origine.

Et il faut dire ce que l'absence de CORS ne fait pas : elle n'empêche pas une requête de **partir**, ni le serveur de l'exécuter. Le navigateur n'y cache que la lecture de la réponse. Une requête simple d'un autre site, en `text/plain`, arrive donc bien jusqu'ici : c'est exactement ce que la barrière du type de média refuse, et la raison pour laquelle elle est la première.

**La connexion est la seule route exemptée de l'en-tête**, parce qu'aucune session n'existe encore pour porter un secret. Elle garde les deux premières barrières et la limitation des tentatives. La liste `CSRF_EXEMPT_ROUTES` est énumérée par un test : elle ne s'allonge pas sans que quelqu'un s'en aperçoive.

**Aucune pré-session n'est ouverte avant la connexion.** C'était la solution classique du jeton de formulaire, et elle demanderait une ligne en base par visiteur, plus le renouvellement de son identifiant à la connexion pour éviter la fixation de session. Les trois barrières ci-dessus protègent la connexion sans état, donc sans rien à fixer.

Écarté : **`csurf`**, déprécié depuis 2022, et toute bibliothèque équivalente. Le besoin tient en une garde de quarante lignes, et il vaut mieux l'écrire que dépendre d'un paquet non maintenu sur le chemin le plus sensible de l'application. C'est le même arbitrage que `helmet` pour les en-têtes de sécurité, et que la sérialisation des cookies, écrite à la main pour trois cookies connus.

### La limitation des tentatives compte des empreintes

Deux compteurs sur une fenêtre glissante de 15 minutes : **5 échecs par adresse soumise**, **20 par adresse IP**. L'écart est voulu : un foyer partage une IP, et deux personnes qui se trompent ne doivent pas se bloquer l'une l'autre.

Les deux clés sont des **empreintes HMAC-SHA256 avec le poivre du serveur**, jamais les valeurs : une adresse e-mail et une adresse IP sont des données personnelles. Un SHA nu ne suffirait pas pour une adresse e-mail, qui se retrouverait au dictionnaire en quelques secondes.

L'empreinte porte sur l'adresse **soumise**, et non sur un compte trouvé : sinon une adresse inconnue ne serait pas comptée, et un 429 qui n'arrive que sur les comptes existants dirait lesquels existent. Seuls les `failed` sont comptés ; compter aussi les `blocked` laisserait un inconnu tenir un compte fermé en insistant.

Écarté : **`@nestjs/throttler`**. Il compte en mémoire par défaut, donc il repartirait de zéro à chaque redémarrage, et sa clé est l'IP. Il faudrait de toute façon écrire le compteur par adresse et le stockage persistant, c'est-à-dire tout ce qui fait le travail.

La purge des lignes périmées (sessions, jetons, tentatives de plus d'un jour) se fait à l'occasion d'une connexion réussie : pas d'ordonnanceur, et une purge accrochée à chaque tentative offrirait à un inconnu le moyen de faire travailler la base.

### Le même message, et le même temps

Adresse inconnue ou mot de passe faux : le même 401 et le même détail, « Adresse e-mail ou mot de passe incorrect. » Le message identique ne suffit pas, le temps doit l'être aussi : une adresse inconnue fait donc vérifier le mot de passe contre une **empreinte leurre**, calculée une fois sur un secret que personne ne connaît. Sans elle, le temps de réponse dirait quels comptes existent.

### Les gardes sont globales et fermées par défaut

Trois gardes, dans cet ordre : session, CSRF, rôle. Une route nouvelle demande une session sans que personne ait à y penser, et c'est `@Public()` qui l'ouvre. Oublier ce décorateur ferme une route ; l'oubli inverse l'ouvrirait.

Le réglage `trust proxy` d'Express est **explicite** : derrière le mandataire du homelab, `X-Forwarded-For` dit la vérité, mais seulement quand c'est bien le mandataire qui parle. Avec une confiance aveugle, n'importe qui écrirait l'en-tête lui-même et se donnerait une IP neuve à chaque essai.

Trois écritures sont donc refusées au démarrage, parce qu'elles reviennent toutes au même : `true`, un préfixe qui couvre tout l'espace d'adresses (`0.0.0.0/0`, `::/0`, `*`), et un nombre de sauts invraisemblable (plus de dix). Le contrôle s'arrête là : un `/8` trop large passe, et c'est au déploiement de nommer le mandataire. Il attrape l'erreur évidente, pas une plage mal choisie.

### Ce qui n'est pas haché, et pourquoi

`session.csrf_secret` est la seule valeur de ces tables gardée en clair. Elle n'est pas un authentifiant à elle seule : le serveur ne la compare qu'au secret de **la** session déjà résolue par un jeton, lui haché. Une fuite de la table ne donne donc aucune session utilisable, et la hacher n'ajouterait rien, la comparaison se faisant de serveur à serveur.

### Deux durcissements écartés pour l'instant

- **Le préfixe `__Host-` sur les trois cookies.** Les attributs posés le permettraient sans autre changement, et il empêcherait un service voisin d'un sous-domaine de poser un cookie homonyme. Il est écarté de cette story faute d'avoir mesuré ce que Chromium en fait sur `http://localhost`, que la prévisualisation des tests de bout en bout sert en clair. `readCookie` garde déjà le premier cookie, comme les navigateurs, et le serveur ne croit jamais le jeton CSRF venu du cookie : la portée se limite à une connexion forcée. À reprendre avec l'issue #31.
- **La dérivation du secret CSRF** par HMAC du poivre et de l'identifiant de session, qui éviterait de le stocker. Elle ne change rien à ce qu'un attaquant peut faire, et elle couple la session au poivre, dont le changement invaliderait toutes les sessions ouvertes.

## Conséquences

- Deux variables entrent dans `.env.example` : `SECURITY_PEPPER`, sans laquelle l'API refuse de démarrer, et `TRUST_PROXY`, dont le défaut est `loopback`.
- La migration `0001_comptes_sessions` crée cinq tables : `household`, `account`, `session`, `remember_token`, `login_attempt`.
- La CI gagne un service PostgreSQL et une étape de migration : `auth.integration.spec.ts` et `admin-account.spec.ts` sont les seuls tests qui mesurent le SQL et le parcours complet, et comme `mailpit.spec.ts`, ils ne se sautent jamais en CI.
- Le front appelle `GET /auth/session` au démarrage, dans la garde de navigation. **Un échec qui n'est pas un 401 laisse l'application anonyme** : sans réponse du serveur, on ne peut pas affirmer qu'une session existe, donc on montre la page de connexion, et c'est le bandeau de service qui explique la panne.
- Le client HTTP du front pose lui-même le type `application/json` et l'en-tête `X-CSRF-Token` sur toute requête qui modifie l'état : ce sont des barrières de sécurité, pas des détails d'appel, et elles n'ont pas à être répétées à chaque usage.
- Les adresses visibles par l'utilisateur sont en français : la connexion est sur `/connexion`, et le paramètre de retour s'appelle `suivant`. Ce paramètre n'accepte qu'un chemin de l'application, pour que l'adresse de connexion ne puisse pas servir de redirection ouverte. Il recopie le chemin demandé avec sa chaîne de requête, donc **aucun écran ne doit porter de donnée personnelle en paramètre de route** : l'adresse saisie pour trouver un magasin, en particulier, se passe dans un corps de requête et non dans une URL.
- Les réponses des trois routes d'authentification portent `Cache-Control: no-store`. Elles portent un `Set-Cookie`, donc le jeton de session, et l'adresse du compte : ni le disque du poste ni un intermédiaire n'ont à en garder une copie après la session. Les autres en-têtes de sécurité restent le sujet de l'issue #31.
- **Se connecter ferme la session que le navigateur présentait.** Sans cela, la précédente restait valable jusqu'à sa limite, et se reconnecter en soupçonnant un vol ne fermait rien. Les autres appareils, eux, gardent la leur : c'est le périmètre de la story.
- Les paramètres d'une requête SQL ne doivent jamais entrer dans un journal : depuis cette story, ce sont des adresses e-mail. Le sérialiseur d'erreurs de `logging/logger-options.ts` traite donc l'erreur de requête de Drizzle à part, et ne garde que la requête paramétrée, le code de PostgreSQL et les lignes d'appel de la pile. La commande `admin:create` fait de même sur sa sortie.

## Quand revoir cette décision

- **Si une origine différente doit appeler l'API** (application mobile, sous-domaine séparé) : la barrière du type de média tombe, et il faut alors reprendre cette décision, à l'occasion de l'issue #31. Les deux autres barrières survivraient, mais une protection CSRF à deux étages n'est pas celle qui est écrite ici. **Tranché le 7 novembre 2026, par Martin : pas de CORS, la PWA partage l'origine de l'API.** L'issue #31, qui demandait une liste blanche d'origines, a été corrigée en conséquence et renvoie désormais à cet ADR.
- Si l'API tourne sur plusieurs instances : la session en base tient déjà, mais la purge opportuniste serait à revoir.
- À l'arrivée de la double authentification des routes d'administration, que `security.md` exige et que la story #10 laisse hors périmètre.
- Si la révocation de tous les appareils est demandée : elle ajoute une route et une colonne, pas une décision.
