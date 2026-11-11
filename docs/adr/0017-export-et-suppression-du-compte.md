# ADR 0017 : l'export de ses données et la suppression de son compte

- Statut : acceptée
- Date : 10 novembre 2026

## Contexte

La story #15 pose les deux droits que le RGPD donne à chacun : récupérer ses données, et les faire supprimer. Le cahier des charges les veut « en libre-service », avec une politique de confidentialité (section 10), et l'issue les place avant toute invitation d'une autre personne que Martin.

C'est la dernière story du socle à toucher des données personnelles, et elle arrive après celle qui en a ajouté les plus sensibles : l'ADR 0016 a stocké des allergies et des intolérances, donc des données de santé, et il a renvoyé ici la mention d'information complète. Elle arrive aussi après l'ADR 0015, qui a posé que le foyer vient de la session et que rien ne le nomme.

Deux choses du socle existant rendent cette story plus simple qu'elle n'en a l'air, et une la rend plus délicate.

Plus simple : **la cascade fait l'essentiel du travail**. Supprimer la ligne `household` emporte le compte, et le compte emporte ses sessions, ses familles de mémorisation, ses attentes de connexion, son second facteur, ses codes de secours et ses jetons de réinitialisation. Et **la réauthentification est déjà écrite** : `disableTwoFactor` exige depuis l'ADR 0012 le mot de passe et un code, avec leur limitation, parce qu'une session volée ne doit pas suffire à une action irréversible.

Plus délicate : ce qu'il faut supprimer ne tient pas dans un seul module. Les tentatives de connexion appartiennent à l'authentification, les invitations au module des invitations, le foyer au sien. Or `api.md` interdit à un module de toucher les tables d'un autre, et la suppression doit être **une seule transaction**.

## Décision

### La suppression est immédiate

Pas de délai, pas de corbeille, pas d'annulation. La transaction part, et au bout il ne reste rien.

Écarté : **la suppression différée**, avec un compte marqué puis effacé plus tard. Le projet n'a aucun ordonnanceur, et c'est une décision assumée : toutes ses purges sont accrochées à un événement fréquent (ADR 0010, 0013, 0014). Le différé demanderait donc soit un ordonnanceur, soit une purge opportuniste, plus un état « compte présent mais mort » que chaque garde devrait connaître sans l'oublier, plus un chemin d'annulation et son écran. C'est beaucoup de mécanique, et surtout une occasion de se tromper, pour une fonction qu'on espère rare.

Le prix de l'immédiat est qu'il n'y a pas de retour, et il est payé par quatre choses : le mot de passe, le code quand le second facteur est actif, une case à cocher que le serveur exige, et **l'export proposé sur le même écran, au-dessus du bouton**. Tranché par Martin le 10 novembre 2026.

### La confirmation demande ce qu'une session volée n'a pas

`POST /account/delete` exige trois choses dans son corps :

1. le **mot de passe**, vérifié par la réauthentification existante sous le motif `reauth`, avec sa limitation : sans elle, une session volée devinerait le mot de passe sans borne, et chaque essai réserverait 64 Mio d'Argon2 (ADR 0012) ;
2. le **code du second facteur**, quand il est actif, sous le motif `code` ;
3. `confirmed: true`, une valeur littérale.

Le troisième point mérite sa phrase : la case à cocher de l'écran n'est pas qu'un garde-fou d'interface, c'est une **condition du serveur**. Le même procédé que `onboardingDone` dans l'ADR 0016 : seule la valeur vraie est acceptée, donc un client ne peut pas supprimer un compte sans l'avoir explicitement confirmé.

C'est un `POST` et non un `DELETE` : la requête porte un corps, et un corps sur `DELETE`, bien que légal, est jeté par nombre de mandataires. L'ADR 0012 a tranché ainsi pour la désactivation du second facteur, pour la même raison.

À l'écran, c'est un `BaseDialog` qui porte la case, le mot de passe et le code. C'est le **premier usage réel** de ce composant hors de la page de démonstration, et il apporte ce qu'on ne réécrira pas à la main : le piège de focus, le retour du focus à la fermeture, et l'ARIA d'un dialogue modal (ADR 0001).

### Le dernier administrateur ne peut pas partir, et on lui dit par où passer

Un refus en 409 : « Vous êtes le seul administrateur. Invitez un compte avec le rôle administrateur, puis réessayez. »

Le message nomme **le chemin qui existe**, et c'est tout l'intérêt de l'avoir écrit ici : aucun écran ne permet de changer le rôle d'un compte existant avant l'issue #48. Le seul moyen, dans le lot 1, est d'envoyer une invitation en choisissant le rôle administrateur (ADR 0013), ce que l'écran d'administration des invitations sait faire. Un message qui dirait « nommez un autre administrateur » enverrait chercher un écran qui n'existe pas.

**Le compte est verrouillé dans la transaction** : `select id from account where role = 'admin' for update`. Sans ce verrou, deux derniers administrateurs qui se suppriment en même temps verraient chacun deux comptes, et l'application se retrouverait sans administrateur. C'est le même réflexe que les écritures conditionnelles des ADR 0012 à 0014.

Ce verrou est **pris mais pas sérialisé par un test**, et il faut le dire : « il ne reste qu'un administrateur » est une propriété globale à la base, et la base de test est partagée par les fichiers qui tournent en parallèle, chacun y créant ses propres administrateurs. Le refus se mesure donc sur un magasin en mémoire (`privacy.service.spec.ts`), qui vérifie que le verrou est pris avant toute suppression et que lever annule la transaction. Deux suppressions réellement concurrentes demanderaient une base dédiée à ce seul fichier, ce que le projet n'a pas.

L'écran n'attend pas le refus pour le dire : le bouton est **désactivé** pour le seul administrateur, avec la même phrase à côté. Ce n'est pas ce qui protège quoi que ce soit, le serveur refusant de son côté, et le test le mesure là.

### Une seule transaction, et chaque module y apporte ses requêtes

`PrivacyService` ouvre la transaction, puis appelle les services des modules qui détiennent les données, en leur passant la transaction. Chacun garde ses propres requêtes, et il n'y en a qu'une à valider.

Écarté : **un dépôt qui écrirait dans les quatre tables.** Ce serait contre `api.md`, et surtout ce serait l'endroit où l'on oublierait une table le jour où une story en ajoute une. Écarté aussi : **quatre transactions à la suite**, qui laisseraient un compte à moitié supprimé si la troisième échouait.

Le type de la transaction est exporté par `db/client.ts`, à côté de `Database` : c'est une vue de ce que le client offre, pas un besoin propre à un module.

**Un module à part, `privacy/`**, porte les trois routes. Les mettre dans `accounts/` créerait un cycle, le module des invitations dépendant déjà de lui. Rien ne dépend de `privacy/`, qui dépend de tout le reste : c'est la forme qui va avec « ce module connaît toutes les données personnelles ».

### Une troisième route, qui ne rend qu'un booléen

`GET /account/deletion` répond `{ blocked: boolean }`, et c'est ce qui permet à l'écran de désactiver son bouton pour le seul administrateur plutôt que de laisser remplir un dialogue pour se faire refuser au bout.

C'est la forme de `GET /household/onboarding` (ADR 0015) : une route à part qui ne rend que ce qu'un écran a besoin de savoir, plutôt qu'un objet plus gros dont il n'utiliserait qu'un champ. Elle ne révèle rien de plus que le refus lui-même : un compte ordinaire reçoit toujours `false`, sans que la base soit interrogée, donc elle ne dit pas combien d'administrateurs existent.

**La phrase du refus vit dans `packages/shared`.** L'écran doit donner exactement celle que le serveur rendrait, et deux copies finiraient par ne plus dire la même chose. C'est aussi pourquoi l'écran demande cet état **pour tout le monde** et non seulement pour un administrateur : la règle appartient au serveur, et l'écran la lui demande au lieu de la recopier.

### Ce qui est supprimé, et ce qui reste

La cascade emporte, depuis le foyer : le compte, le profil et ses données de santé, les sessions, les familles de mémorisation, les attentes de connexion, le second facteur, les codes de secours et les jetons de réinitialisation.

Deux choses n'ont pas de clé étrangère vers le compte, et chacune a sa décision.

**Les invitations adressées à cette adresse sont supprimées.** Une ligne d'invitation porte l'adresse en clair (ADR 0013) : c'est une donnée personnelle de la personne qui part.

**Les invitations qu'elle a envoyées restent**, avec `invited_by` à `null`, ce que la clé étrangère fait déjà. Elles portent l'adresse d'**autres personnes**, qui n'ont rien demandé : les supprimer effacerait le ticket d'inscription de quelqu'un d'autre, parfois encore utilisable. Elles s'effaceront par la purge des trente jours de l'ADR 0013.

**Les lignes de tentatives de cette personne sont supprimées** : celles qui portent l'empreinte de son adresse, et celles qui portent l'empreinte de son identifiant de compte, les motifs `code` et `reauth` comptant sur lui. Ce sont des empreintes HMAC, donc des données personnelles pseudonymisées, puisque le poivre qui les calcule est à nous. Retirer ces lignes retire aussi leur contribution au compteur de leur IP : c'est sans effet exploitable, puisqu'il faut avoir supprimé son propre compte pour y arriver, et l'analyse est la même que celle de l'ADR 0014 sur l'effacement des échecs.

Un test contre une vraie base interroge **chaque table** après la suppression et vérifie qu'il ne reste aucune ligne rattachée au foyer, au compte ou à ses empreintes, et que l'invitation envoyée à un tiers est toujours là, orpheline.

### La réponse efface les cookies, et le front oublie tout

La réponse de suppression porte les quatre cookies expirés, exactement comme la déconnexion : la session, la mémorisation, l'attente de code et le jeton CSRF lisible : la session vient d'être supprimée côté serveur, et le navigateur n'a aucune raison de garder un jeton qui ne désigne plus rien.

**Et le front remet à zéro tout son état avant de rediriger vers la connexion**, avec un message qui dit que le compte est supprimé. Tout, c'est-à-dire la session **et l'état du premier lancement** : ce second point est le défaut que la story #14 a connu et corrigé, et il se reproduirait à l'identique ici. La suppression ne recharge pas la page, donc un état de module qui survivrait ferait décider la garde, pour le compte suivant connecté dans le même onglet, avec la valeur du foyer qui vient d'être détruit. Un test le mesure : suppression, puis connexion d'un autre compte dans le même onglet.

### L'export : un fichier JSON, et ce qu'il ne contient pas

`POST /account/export`, depuis une session, `Cache-Control: no-store` et `Content-Disposition: attachment`. Un seul fichier JSON, portant son numéro de format et sa date.

**Un `POST` bien que la route ne fasse que lire**, et c'est la seule entorse à REST de cette décision. La raison est la protection CSRF : une méthode sûre passe hors des trois barrières (ADR 0010), parce qu'une lecture ne change rien et qu'aucun CORS n'autorise un autre site à lire la réponse. Ce raisonnement ne tient plus pour cette route-ci : son effet n'est pas dans la réponse, il est dans le **fichier déposé sur le disque**. Avec des cookies `SameSite=Lax`, une navigation de premier niveau depuis une page tierce suffit à faire partir la requête avec la session de la victime, et à écrire dans son dossier de téléchargements un fichier qui porte des données de santé. L'attaquant ne le lit pas, mais il n'a pas besoin de le lire pour avoir fait du dégât.

Le `POST` remet donc la route derrière le type de média, l'origine et le jeton. Il ne coûte rien au front, qui passe déjà par le client HTTP et un blob, et qui pose le jeton pour toute méthode non sûre. Un test mesure qu'un export sans jeton est refusé en 403, un autre qu'une origine étrangère l'est aussi, et le test qui énumère les routes exemptées de CSRF affirme que celle-ci n'y est pas.

Tranché par Martin le 11 novembre 2026, sur une remarque de la relecture de sécurité. C'est le même réflexe que l'ADR 0012 pour la désactivation du second facteur, pour une raison voisine.

**Jamais envoyé par e-mail.** Un e-mail traverse des serveurs qui ne sont pas les nôtres et reste dans des boîtes que nous ne contrôlons pas, et ce fichier porte des données de santé.

Ce qu'il contient : le compte (identifiant, adresse, rôle, date de création), l'état du second facteur et la date de son activation, le nombre de codes de secours et ceux qui ont servi par leur numéro, le foyer avec son nom et **tout son profil**, les dates des sessions et des mémorisations en cours, et l'invitation qui a créé ce compte.

Ce qu'il **exclut**, et c'est la partie à ne pas se tromper :

- **l'empreinte du mot de passe** ;
- **le secret TOTP**, même chiffré, et les empreintes des codes de secours ;
- **les empreintes des jetons** de session, de mémorisation et de réinitialisation ;
- **le jeton de l'invitation** qui a créé le compte, et **qui a invité** ;
- **les invitations envoyées** par ce compte, qui portent l'adresse d'autres personnes : un export ne doit pas livrer les données d'un tiers ;
- **les tentatives de connexion**, qui sont des empreintes illisibles sans contenu propre.

Une règle tient tout cela : **rien de ce qui sert à s'authentifier ne sort**, même sous forme d'empreinte. Un test parcourt l'export produit et refuse d'y trouver une empreinte Argon2, une empreinte SHA-256, un secret chiffré ou l'adresse de quelqu'un d'autre.

**L'export ne demande pas de réauthentification**, et c'est un choix argumenté : la session peut déjà lire le profil complet à l'écran, donc l'export n'élargit pas ce qu'elle obtient. Ce qu'il faut protéger par un mot de passe, c'est l'écriture irréversible, pas la lecture de ce qui est déjà affiché. Le téléchargement passe par un appel du client HTTP et un objet blob, et non par un lien direct : un lien ferait afficher du JSON brut à la moindre erreur, là où le client rend les phrases françaises du projet.

### La page de confidentialité, courte, et sans mentions légales

Une page `/confidentialite`, **publique**, liée depuis le pied de page : elle doit se lire avant de créer un compte, donc sans en avoir un. C'est le renvoi que l'ADR 0016 avait laissé.

Elle dit quatre choses, et s'arrête là : **quelles données** sont stockées, **pourquoi**, **combien de temps**, et **où se trouvent l'export et la suppression**. Les durées qu'elle annonce ne sont pas inventées ici : elles viennent des décisions déjà prises, invitations terminées trente jours (ADR 0013), tentatives un jour (ADR 0010), journaux applicatifs trente jours (cahier des charges, section 8), et sauvegardes sept jours (plus bas).

Elle ne parle **pas** du journal d'audit conservé un an, et c'est délibéré : ce journal n'existe pas encore, l'administration des comptes étant au lot 6. La ligne « compte supprimé » est écrite aujourd'hui par le journal applicatif, donc par celui dont la page annonce trente jours. L'annoncer à un an promettrait une conservation que le code ne tient pas. La rétention des journaux applicatifs devient un critère de l'issue #31, comme la rotation des sauvegardes.

**Pas de responsable du traitement, pas de mention de la CNIL, aucune mention légale.** Ce n'est pas un oubli, c'est le régime dans lequel Mijote tourne : elle est hébergée sur un réseau local, sans exposition à Internet, pour son auteur et éventuellement sa famille. Le RGPD écarte de son champ d'application le traitement effectué par une personne physique dans le cadre d'une activité strictement personnelle ou domestique (article 2, paragraphe 2, point c), et c'est exactement ce cadre. Désigner un responsable du traitement et afficher une voie de réclamation donnerait à croire le contraire, ce qui serait trompeur plutôt que protecteur.

La page reste écrite malgré cela, et pour une raison simple : **dire ce qui est stocké est utile même en famille**. Quelqu'un qui déclare une allergie a le droit de savoir où elle va, combien de temps elle reste, et comment la retirer, sans qu'aucun texte l'y oblige.

Tranché par Martin le 11 novembre 2026. **Quand y revenir** : le jour où l'application est exposée à Internet, ou le jour où son cercle d'utilisateurs dépasse la famille. L'un ou l'autre fait sortir du cadre domestique, et il faut alors un responsable du traitement nommé, son contact, la voie de réclamation auprès de la CNIL, et la relecture de cette page en entier.

### Les sauvegardes : sept jours, et ce qu'une restauration défait

La base est sauvegardée chaque jour (cahier des charges, section 10). Une suppression ne réécrit pas les sauvegardes déjà prises : une copie des données subsiste donc jusqu'à l'expiration de la plus ancienne. **La page annonce sept jours au plus**, tranché par Martin le 10 novembre 2026, ce qui engage la rotation du homelab à sept jours : le critère est ajouté à l'issue #31, qui porte `docs/deploiement.md`.

Il faut dire la conséquence que personne n'aime écrire : **une restauration fait réapparaître les comptes supprimés depuis la sauvegarde restaurée**, avec leur foyer et leurs données de santé. Il n'existe aucune façon d'y échapper par le code, puisque la suppression est faite et oubliée. La seule réponse est une consigne d'exploitation : après une restauration, les suppressions survenues entre la sauvegarde et l'incident doivent être refaites à la main. Elle est écrite dans `docs/deploiement.md`, à côté du test de restauration mensuel.

### Les journaux ne portent que des identifiants

| Ligne | Champs |
| --- | --- |
| export demandé | `accountId` |
| compte supprimé | `accountId`, `householdId`, et le nombre de lignes retirées par table |
| suppression refusée, dernier administrateur | `accountId` |
| mot de passe ou code refusé | déjà écrit par `AuthService`, par `accountId` |

Rien du contenu exporté, aucune adresse, aucun code d'allergène, aucun nom de foyer. Un test relit les lignes écrites et refuse d'y trouver l'un ou l'autre.

La suppression de compte est l'une des « actions sensibles » du cahier des charges, que son journal d'audit conservera un an. **Ce journal n'existe pas encore** : ces quatre lignes sont écrites par le journal applicatif, conservé trente jours, et la ligne de suppression y survit donc au compte pendant ce temps. Elle ne porte qu'un identifiant qui ne désigne plus rien, ce qui est exactement ce qu'une trace doit être après un effacement. Quand le journal d'audit arrivera, avec l'administration des comptes, ces lignes devront y passer.

## Conséquences

- Un module de plus, `privacy/`, avec trois routes sous `/account`, qui répondent toutes `Cache-Control: no-store`. Deux sont des `POST`, dont l'export, qui ne lit pourtant rien d'autre. Il dépend des modules des comptes, des foyers, des invitations et de l'authentification ; rien ne dépend de lui.
- `AuthService` gagne trois méthodes publiques (`requirePassword`, `requireSecondFactor`, `exportSecurity`), dont deux enveloppent la réauthentification et la vérification de code déjà écrites et testées : rien n'est dupliqué, et la limitation reste à un seul endroit.
- `db/client.ts` exporte le type d'une transaction, pour qu'elle traverse les frontières de modules sans que chacun redéclare le sien.
- Deux écrans touchés et un nouveau : le profil gagne une section « Mes données », et `/confidentialite` arrive. Deux passages axe-core, dont un avec le dialogue ouvert.
- Les routes du compte répondent `Cache-Control: no-store` : l'une porte l'export, l'autre un mot de passe.
- Aucune variable d'environnement, aucune dépendance nouvelle.
- L'issue #31 gagne un critère : rotation des sauvegardes à sept jours au plus, puisque la page de confidentialité l'annonce.

## Quand revoir cette décision

- **Quand l'administration gérera les comptes** (#48) : changer le rôle d'un compte existant deviendra possible, et le message du dernier administrateur devra nommer ce chemin plutôt que l'invitation.
- **Quand une table de foyer sera ajoutée** (planning, courses, dépenses, placard) : elle entre dans la cascade si elle porte `household_id`, et dans l'export. La liste des tables du test de suppression est ce qui le rappellera, puisqu'il faudra l'allonger.
- **Si plusieurs comptes partagent un foyer** : cette suppression ne tient plus. Elle efface la ligne `household` et laisse la cascade emporter le compte, ce qui est exact tant que chaque création de compte crée son foyer (ADR 0013, ADR 0015 : le partage est écarté et demande un nouvel ADR). Le jour où il arrive, il faudra supprimer le compte et ne supprimer le foyer que s'il devient vide, sans quoi partir effacerait les données des autres membres.
- **Si la suppression différée devient souhaitable** : elle demandera un ordonnanceur ou une purge opportuniste, et c'est une décision à reprendre entièrement.
- **Si l'export devient volumineux** (des années de planning et de tickets) : le rendre en une seule réponse JSON cessera d'être raisonnable, et il faudra l'engendrer en tâche de fond. Le format porte un numéro de version pour cela.
- **Si l'application est exposée à Internet, ou ouverte au-delà de la famille** : le cadre domestique tombe, et la page de confidentialité doit alors nommer un responsable du traitement, son contact et la voie de réclamation auprès de la CNIL. C'est la seule partie de cette décision qui dépend d'un choix de déploiement, et non du code.
- **Si l'application sort du homelab** : les sous-traitants et les durées de conservation changent, et la page est à reprendre avec eux.
