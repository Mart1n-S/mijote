# ADR 0015 : l'isolement des foyers, et le foyer qui vient de la session

- Statut : acceptée
- Date : 10 novembre 2026

## Contexte

La story #14 est la première où un utilisateur lit et modifie des données qui appartiennent à **son foyer**. Jusqu'ici, tout ce qui existait appartenait soit à un compte (sa session, son second facteur, son mot de passe), soit à personne (une invitation, qui ne rattache à rien, ADR 0013). La table `household` n'avait que trois colonnes et rien ne la lisait.

Or tout le reste de l'application est de la donnée de foyer : le planning, la liste de courses, les dépenses, les magasins choisis, le placard. Le motif posé ici sera recopié par chaque story des lots 2 et 3, et c'est la seule raison pour laquelle il mérite un ADR plutôt qu'un commentaire : une décision reprise vingt fois doit être écrite une fois.

`.claude/rules/security.md` et `.claude/rules/api.md` posent déjà l'exigence, dans les mêmes mots : « chaque accès à une ressource vérifie qu'elle appartient au foyer de l'utilisateur connecté, côté serveur », et « un identifiant reçu du client n'est jamais une preuve d'appartenance ». Cet ADR dit **comment**, parce que la façon la plus répandue de s'y conformer est aussi celle qui finit par échouer.

## Décision

### Aucune route ne nomme un foyer

Les routes du profil sont `GET /household/profile`, `GET /household/onboarding` et `PATCH /household/profile`. Pas d'identifiant dans le chemin, pas d'identifiant dans le corps, pas d'identifiant en paramètre de requête. **Le singulier de `household` est volontaire** : il n'y a, du point de vue d'une session, qu'un foyer, le sien.

Le foyer vient de `requireAuthenticated(request).account.householdId`, que la garde de session a résolu à partir du cookie. C'est la seule source, et il n'y en a pas d'autre à oublier.

Écarté : **`GET /households/:id/profile` avec un contrôle d'appartenance**, la forme REST habituelle. Elle fait reposer la sécurité sur une vérification que chaque route doit penser à faire, et il suffit d'une route sur vingt qui l'oublie. Le projet a déjà choisi l'inverse ailleurs, et pour la même raison : les gardes sont globales et fermées par défaut, « une route nouvelle demande une session sans que personne ait à y penser » (ADR 0010). Ici, une route nouvelle ne peut pas désigner un autre foyer, parce que la forme de l'URL ne le permet pas.

Second défaut de l'identifiant dans l'URL, plus discret : une adresse se retrouve dans l'historique du navigateur, dans l'en-tête `Referer` et dans les journaux du mandataire. C'est ce que les ADR 0013 et 0014 ont déjà refusé pour un jeton ; un identifiant de foyer est moins grave, mais il n'y a aucune raison de le promener.

### Le dépôt filtre quand même, sur chaque lecture et chaque écriture

`where household_id = ?` figure dans toutes les requêtes du profil, y compris celles qui ne peuvent en toucher qu'une ligne puisque l'identifiant vient de la session.

Ce n'est pas une redondance inutile, c'est ce qui rend la requête **juste par elle-même**. Une requête correcte uniquement parce que son appelant lui passe le bon identifiant devient fausse le jour où un autre appelant lui en passe un autre : une commande de maintenance, un travail d'export (#15), un écran d'administration. Avec le filtre, la requête dit ce qu'elle fait et ne peut pas en faire plus.

Pour les tables à venir, cela se lit ainsi : **toute table qui appartient à un foyer porte `household_id`**, et toute requête qui la lit ou l'écrit filtre par cette colonne. C'est la règle de `api.md`, et elle n'a pas d'exception dans le lot 1.

### Les schémas ne sont pas `.strict()`, et les clés inconnues sont retirées en silence

Un corps qui porterait `householdId` est accepté, et ce champ est **ignoré** : le schéma zod ne le déclare pas, donc zod le retire. Rien n'est renvoyé à son sujet.

Refuser bruyamment serait tentant, mais `.strict()` est écarté, et la raison est écrite dans `apps/api/src/errors/zod-validation.pipe.ts` : le champ `field` de la réponse d'erreur porte le chemin de l'issue zod, et avec un schéma strict ce chemin est **une clé envoyée par le client**. Il faudrait alors en borner la longueur, et le fichier dit qu'aucun schéma du projet n'est dans ce cas. Cette story ne change pas cela.

### Le test croisé est la condition, pas une précaution

Un test d'intégration monte deux foyers avec un compte chacun, contre une vraie base. Il vérifie trois choses :

1. chaque session lit le profil de **son** foyer, et jamais celui du voisin ;
2. une écriture faite par l'un ne change rien chez l'autre ;
3. un corps qui porte le `householdId` du voisin ne déplace rien : ni chez le voisin, ni chez l'auteur.

Le troisième point est celui qui tombe en premier si quelqu'un déclare un jour `householdId` dans le schéma pour « laisser le client préciser ». C'est sa raison d'être.

### Ce que l'administration ne fait pas

Aucune route d'administration ne lit un foyer dans le lot 1. Les invitations ne rattachent à rien et ne portent pas de foyer (ADR 0013), donc l'écran d'administration n'a jamais eu à en traverser un. Il n'y a par conséquent **aucune exception** à la règle ci-dessus aujourd'hui, et c'est volontaire : le jour où une route d'administration devra lire le foyer de quelqu'un, elle nommera ce foyer explicitement, elle sera tracée dans le journal d'audit (#48), et elle demandera son propre ADR. Une exception glissée dans la mécanique actuelle, elle, ne se verrait pas.

## Conséquences

- Les trois routes du profil exigent une session, le rôle ordinaire suffit, et **elles n'ajoutent rien à `CSRF_EXEMPT_ROUTES`** : une session existe, donc elle porte un secret CSRF. C'est la première story du lot dans ce cas, et un test l'énonce.
- `GET /household/profile` et `PATCH /household/profile` répondent `Cache-Control: no-store` : leur charge porte des données de santé (ADR 0016).
- La garde de navigation du front appelle `GET /household/onboarding`, qui ne rend qu'un booléen, et **jamais le profil complet** : l'état du premier lancement est ce qu'elle doit savoir, et le profil porte autre chose (ADR 0016).
- **La réponse de session porte encore `account.householdId`**, posé par la story #10, et aucun code du front ne le lit : la forme des routes retenue ici le rend inutile au navigateur. Il n'est pas retiré dans cette story, cela touchant les schémas d'authentification et six fichiers de test, et il ne nuit pas, un identifiant de foyer n'étant ni un secret ni une donnée personnelle. La première story qui touchera `sessionAccountSchema` est l'endroit pour l'enlever.
- Un module qui aura besoin d'une donnée de foyer passera par le service du module foyer, et non par sa table (`api.md`). C'est la raison pour laquelle l'état du premier lancement n'est pas ajouté à la réponse de session : le module d'authentification n'a pas à lire `household`.

## Quand revoir cette décision

- **Si plusieurs comptes doivent partager un foyer** : l'ADR 0013 a déjà écarté ce besoin, et il demanderait son propre ADR. La forme des routes ne changerait pas, mais « le foyer de la session » cesserait d'être unique du point de vue du compte.
- **Quand l'export et la suppression des données arriveront** (#15) : ils lisent un foyer entier, par définition, et c'est le premier appelant qui passera un identifiant au dépôt sans le tenir d'une session. C'est pour ce jour-là que le filtre est déjà dans les requêtes.
- **Quand une route d'administration devra lire un foyer** : elle le nommera, et c'est un ADR à part.
- **Si une table de foyer devient volumineuse** (le planning, les dépenses) : le filtre par `household_id` restera, mais il demandera son index, ce qui est une décision de schéma et non de sécurité.
