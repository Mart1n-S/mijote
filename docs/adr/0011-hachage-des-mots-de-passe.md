# ADR 0011 : Argon2id par @node-rs/argon2, avec ses paramètres mesurés

- Statut : acceptée
- Date : 3 novembre 2026

## Contexte

`.claude/rules/security.md` impose Argon2id pour les mots de passe. Node 24 n'en a pas : `node:crypto` offre `scrypt` et `pbkdf2`, pas Argon2. Il faut donc une dépendance, et des paramètres chiffrés plutôt qu'un réglage repris au hasard.

## Décision

### `@node-rs/argon2` 2.2.2

Un module natif compilé par napi-rs, dont les binaires sont livrés **précompilés** en dépendances optionnelles, une par plateforme. Aucune compilation à l'installation, donc aucun script d'installation à autoriser et aucun compilateur C sur le poste ni dans la CI.

Écartés :

- **`argon2`** (le paquet du même nom). Il compile par `node-gyp` quand aucun binaire ne correspond : il faudrait Python et un compilateur, sur le poste Windows comme dans l'image Docker, et un script d'installation à autoriser.
- **`argon2-browser` et les variantes WebAssembly.** Plus lentes, et faites pour le navigateur, où le hachage d'un mot de passe n'a rien à faire.
- **`scrypt` de `node:crypto`**, sans dépendance. L'OWASP l'accepte comme second choix, mais la règle du projet dit Argon2id, et une règle de sécurité ne se contourne pas pour économiser une dépendance.

### Les paramètres : 64 MiB, trois passes, un degré de parallélisme

```text
memoryCost = 65536   (64 MiB)
timeCost   = 3
parallelism = 1
algorithm  = Argon2id
```

C'est nettement au-dessus du minimum de l'OWASP pour Argon2id (19 MiB, deux passes, un degré de parallélisme), et le choix vient de mesures, pas d'une intuition.

Sur le poste de développement (Windows, 20 cœurs logiques), médiane sur dix hachages :

| Paramètres                | Temps  |
| ------------------------- | ------ |
| m=19456, t=2 (minimum OWASP) | 27 ms  |
| m=47104, t=1              | 36 ms  |
| m=65536, t=2              | 91 ms  |
| **m=65536, t=3 (retenu)** | 140 ms |

Dans un conteneur `node:24-bookworm-slim`, avec les paramètres retenus et le paquet installé à neuf :

```json
{
  "node": "v24.22.2",
  "cpus": 20,
  "memoireTotaleMo": 7812,
  "parametres": "m=65536,t=3,p=1",
  "hachageMedianMs": 109,
  "verificationMedianeMs": 124
}
```

Une centaine de millisecondes est le bon ordre de grandeur pour une connexion : assez pour qu'une attaque par dictionnaire coûte cher, assez peu pour que personne ne l'attende.

**La mémoire est la vraie contrainte, pas le temps.** Chaque hachage réserve 64 MiB, et le fil de travail de Node en traite quatre à la fois : jusqu'à 256 MiB de pointe sur une rafale de connexions. C'est la limitation des tentatives qui borne le reste (ADR 0010), et c'est le chiffre à surveiller si le homelab est serré en mémoire.

**L'empreinte porte ses propres paramètres** (`$argon2id$v=19$m=65536,t=3,p=1$...`). Les augmenter plus tard n'invalide donc aucun compte existant, et c'est aussi la seule façon de vérifier dans un test que les valeurs appliquées sont bien celles-ci.

### Deux détails qui ont une raison

**La valeur d'Argon2id est écrite en clair dans le code** (`2`), et non lue dans l'énumération de la bibliothèque. Son `Algorithm` est un `const enum` ambiant : TypeScript refuse d'y accéder sous `isolatedModules`, et à l'exécution l'objet exporté est vide, donc `Algorithm.Argon2id` vaut `undefined`. La bibliothèque retomberait sur son défaut, qui est bien Argon2id, mais par chance et non par choix. Mesuré : avant correction, l'empreinte produite était la bonne sans que le paramètre ait été transmis.

**Une empreinte illisible n'est pas attrapée.** Elle ne peut venir que d'une ligne abîmée en base, et répondre « identifiants incorrects » la cacherait : elle remonte en 500 générique, journalisée par le filtre (ADR 0008).

### L'empreinte leurre

Une adresse inconnue fait quand même vérifier un mot de passe, contre une empreinte calculée une fois au hasard. Sans elle, elle répondrait sans payer ces 110 ms, et le temps de réponse dirait quels comptes existent. Le message identique ne suffit pas (ADR 0010).

### Douze caractères au minimum

À la création d'un compte, comme l'exige l'issue #10. **Pas à la connexion** : refuser un mot de passe court là n'empêcherait aucune attaque, et empêcherait un ancien compte de se connecter. La longueur est aussi bornée en haut, à 200 caractères, pour ne pas faire hacher un méga-octet par Argon2 sur simple demande.

## Conséquences

- Une dépendance d'exécution de plus, figée à l'exact, avec ses binaires précompilés en dépendances optionnelles. `pnpm audit` reste propre.
- Le premier compte administrateur se crée par `pnpm admin:create`, documentée dans le README. Le mot de passe se saisit sans écho et n'est jamais un argument : un argument resterait dans l'historique du shell et dans la liste des processus. La commande exige un terminal.
- Le hachage sort de toute transaction ouverte : une centaine de millisecondes n'a rien à faire dans une transaction.

## Quand revoir cette décision

- Si le matériel du homelab change : les paramètres se remesurent, et la mémoire de pointe se recalcule.
- Si l'OWASP relève son minimum : l'empreinte portant ses paramètres, l'augmentation se fait sans migration.
- Si une connexion devient perceptiblement lente sous charge : c'est la mémoire qu'il faut regarder d'abord, pas le temps.
