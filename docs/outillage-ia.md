# Outillage IA du projet

Agents, skills, rules et outils externes utilisés pour développer App Repas, avec leur origine, leur version et leur contrôle de sécurité. Tenu à jour à chaque ajout.

Règle : un skill, un agent ou un outil externe est **lu**, **scanné avec SkillSpector**, puis **figé à une version précise** (commit ou étiquette) avant installation. Jamais la branche `main` d'un dépôt tiers.

## 1. Ce qui est en place

| Élément | Type | Origine | Version figée | Scan SkillSpector | Date |
| --- | --- | --- | --- | --- | --- |
| `writing-style`, `security` | rules (toujours chargées) | écrites pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `typescript`, `vue-accessibility`, `api` | rules (selon les chemins) | écrites pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `code-reviewer` | agent, lecture seule | écrit pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `backlog-manager` | agent, écrit dans GitHub, jamais dans le dépôt | écrit pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `security-reviewer` | agent, lecture seule | écrit pour le projet | dépôt | sans objet | 31 octobre 2026 |
| `a11y-reviewer` | agent, lecture seule. S'appuie sur le skill `rgaa-checklist` | écrit pour le projet | dépôt | sans objet | 31 octobre 2026 |
| `skillspector` | outil externe, scanner local | [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector), Apache-2.0 | commit `abd82935b67f765a9541013c0866c6349251dcdf`, qui porte l'étiquette v2.13.2 | sans objet : c'est le scanner lui-même, son README a été lu à la place | 30 octobre 2026 |
| `frontend-design` | skill externe, conseils de design | [anthropics/skills](https://github.com/anthropics/skills), `skills/frontend-design`, Apache-2.0 | commit `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`, dernier commit qui touche ce skill (3 septembre 2026) | 13/100, LOW, SAFE. Un signalement HIGH à 55 % analysé et écarté, voir section 6 | 30 octobre 2026 |
| `context7` | skill externe, documentation de bibliothèques | [netresearch/context7-skill](https://github.com/netresearch/context7-skill), `skills/context7`, (MIT AND CC-BY-SA-4.0) | commit `3ff120aa168ac75fc7a110c589ff53dff0b6f284`, dernier commit qui touche `skills/` (7 octobre 2026) | 24/100, MEDIUM, CAUTION. Un signalement HIGH à 75 % analysé et écarté, voir section 6 | 31 octobre 2026 |
| `rgaa-checklist` | skill, grille d'accessibilité | écrit pour le projet. Sa liste de critères est recopiée du dépôt [DISIC/accessibilite.numerique.gouv.fr](https://github.com/DISIC/accessibilite.numerique.gouv.fr), `RGAA/criteres.json`, Licence Ouverte Etalab 2.0 | dépôt. La liste de critères est figée au commit amont `ca4019f95073b6cbd2482a16e9f12b52d8de678d` (18 août 2026) | sans objet : écrit pour le projet. Voir la section 6 pour le contrôle de la source | 31 octobre 2026 |

Le commit est figé, et non l'étiquette, pour la raison donnée dans l'ADR 0003.
L'emplacement sur le poste et la commande de retrait sont dans
`docs/poste-de-dev.md`.

## 2. Calendrier des outils externes

| Quand | Outil | Usage prévu |
| --- | --- | --- |
| Fait le 30 octobre 2026 | [SkillSpector](https://github.com/NVIDIA/SkillSpector) | Scanner tout skill ou agent externe avant installation, en `--no-llm` pour rester en local. Voir la section 1. |
| Fait le 30 octobre 2026 | [anthropics/skills](https://github.com/anthropics/skills) (`frontend-design`) | Direction visuelle du design system, story #7. Voir les sections 1 et 6. |
| Fait le 31 octobre 2026 | [context7-skill](https://github.com/netresearch/context7-skill) | Documentation à jour des bibliothèques. Appelle le service Context7 : seuls des noms de bibliothèques et des questions partent, jamais le code, ce que la lecture du script a vérifié. Voir les sections 1 et 6. |
| Fait le 31 octobre 2026 | [DISIC/accessibilite.numerique.gouv.fr](https://github.com/DISIC/accessibilite.numerique.gouv.fr) | Source des 106 critères du RGAA 4.1.2, recopiés dans le skill `rgaa-checklist`. Rien n'est installé ni exécuté : un fichier de données est repris, sous Licence Ouverte Etalab 2.0. À réexaminer à la parution de RGAA 5, annoncée pour fin 2026. Voir les sections 1 et 6. |
| Lot 1, en écrivant les agents | [agent-skills](https://github.com/addyosmani/agent-skills), [ECC](https://github.com/affaan-m/ecc) | À piocher, jamais à installer en bloc : leurs déroulés et leurs hooks concurrenceraient le pipeline du projet. |
| Jamais en installation | [superpowers](https://github.com/obra/superpowers) | Source d'inspiration seulement : méthode complète et concurrente. |
| Jamais en installation | [anthropics/skills](https://github.com/anthropics/skills) (`skill-creator`) | Source d'inspiration seulement. Écarté le 31 octobre 2026 sur mesure, pas sur principe : SkillSpector le classe 100/100, CRITICAL, DO NOT INSTALL. Voir la section 6. |
| Fin du lot 1, avant la première invitation | [security-audit-skill](https://github.com/cloudflare/security-audit-skill) | Audit complet du code, puis avant chaque vague d'invitations. |
| Fin du lot 1, sur une préproduction | [Strix](https://github.com/usestrix/strix) | Test d'intrusion par agents, uniquement sur l'environnement de test, avec des données fictives. |
| Lot 3 ou plus tard | [Graphify](https://github.com/Graphify-Labs/graphify) | Graphe du code pour les agents, en `--code-only` pour rester local. |
| Quand le pipeline est stable | [Multica](https://github.com/multica-ai/multica) | Orchestration de plusieurs agents en parallèle. |

## 3. Pipeline cible, mis en place progressivement

Les numéros renvoient à l'ordre des neuf stories de `docs/backlog/lot-1.md`.

| Story du lot 1 | Agent ajouté |
| --- | --- |
| 1, poser le design system et les jetons de design | `code-reviewer` (en place) |
| 2, uniformiser les erreurs et la journalisation | `security-reviewer` (en place), `a11y-reviewer` (en place) |
| 4, créer les comptes, la connexion et la session | `test-planner`, `test-writer` (limité aux fichiers de test par un hook) |
| 6, inviter et inscrire un utilisateur | `code-writer`, `doc-writer`, `pr-manager` |
| À partir de 7 | skill `/feature <issue>`, qui enchaîne le pipeline |

Les deux relecteurs de la story 2 sont posés avant elle, le 31 octobre 2026 :
le format d'erreur et la journalisation sont justement ce qu'ils doivent
relire, donc ils doivent exister et avoir passé leur banc d'essai avant que la
story commence. Leur banc est en section 5.

## 4. Limites connues

Ces limites sont assumées, pas oubliées.

### Les règles de permission ne sont pas une frontière de sécurité

La documentation de Claude Code le dit explicitement : une règle `deny` couvre
l'invocation que Claude produit habituellement, et n'est pas une frontière de
sécurité autour du programme. Concrètement, dans `.claude/settings.json` :

- le refus de `git push --force` ne couvre ni `git -C . push --force`, ni un
  chemin absolu vers l'exécutable, ni `bash -c '...'` ;
- `npm install -g` ne couvre ni `npm i -g`, ni `npm install --global` ;
- `pip install` ne couvre pas `python -m pip install`.

Ces règles servent à éviter l'accident, pas à résister à quelqu'un qui cherche
à les contourner.

**Les deux listes se tiennent en miroir.** Sur Windows, `Bash` et `PowerShell`
sont deux matchers distincts : une règle `Bash(...)` ne couvre pas l'outil
PowerShell. Toute entrée s'ajoute donc des deux côtés, dans `allow`, `ask`
comme `deny`. Un oubli d'un seul côté ne produit aucune erreur, et JSON
n'accepte pas de commentaire pour le rappeler sur place. Pour contrôler :

```bash
node -e "const p=require('./.claude/settings.json').permissions;
for (const k of ['allow','ask','deny']) {
  const b = p[k].filter(r => r.startsWith('Bash(')).map(r => r.slice(5,-1));
  const w = new Set(p[k].filter(r => r.startsWith('PowerShell(')).map(r => r.slice(11,-1)));
  for (const c of b) if (!w.has(c)) console.log('sans miroir dans', k, ':', c);
}"
```

Mesuré le 30 octobre 2026 sur Claude Code 2.1.175 : le refus de lecture du
`.env` tient pour les commandes qui nomment le fichier, en Bash
(`wc -l < .env`) comme en PowerShell (`Get-Content .env`), et pour l'outil de
lecture. Il ne couvre pas une lecture indirecte : le 29 octobre 2026, un script
appelant `process.loadEnvFile('.env')` est passé au travers des règles, et
c'est le classificateur du mode automatique qui l'a arrêté.

### La lecture seule du code-reviewer est une consigne

L'agent se déclare en lecture seule, mais il a l'outil `Bash`, dont il a besoin
pour `git diff`, `pnpm lint` et `gh issue view`. Rien dans son frontmatter ne
l'empêche d'écrire : d'après la documentation, une entrée
`disallowedTools: Bash(...)` retirerait l'outil Bash en entier, pas seulement
les commandes visées. La garantie repose donc sur ses instructions et sur les
règles `deny` des réglages.

### Le prompt d'un agent est mis en cache au démarrage de la session

Mesuré le 30 octobre 2026 sur Claude Code 2.1.175 : modifier
`.claude/agents/code-reviewer.md` pendant une session ne change pas le
comportement de l'agent lancé ensuite. Interrogé sur son barème de gravité
juste après l'édition, il a recopié mot pour mot l'ancienne version. Les
définitions sont donc lues au démarrage, pas à chaque lancement.

Conséquence pratique : toute modification du prompt d'un agent demande un
redémarrage du CLI avant d'être testée. C'est le piège à éviter quand on règle
un agent et qu'on mesure l'effet dans la même session : on mesure l'ancien
prompt.

**Nuance, mesurée le 31 octobre 2026 : un agent nouveau, lui, est pris en
compte sans redémarrage.** `security-reviewer` et `a11y-reviewer` ont été
écrits, installés et lancés dans une même session : ils sont devenus
disponibles dès que leurs fichiers ont été sur `main`, et leur banc d'essai a
montré qu'ils répondaient bien avec leur prompt réel, corrections de dernière
minute comprises (format de rapport, barème à quatre gravités, refus de
recopier la valeur d'un secret trouvé).

La mise en cache porte donc sur le contenu d'une définition déjà connue, pas
sur la liste des agents. Ajouter un agent ne demande rien ; en modifier un
demande toujours un redémarrage, et ce point n'a pas été remesuré.

### Une étape de CI a disparu sans bruit, et rien ne l'a vue

Trouvé le 31 octobre 2026 par l'audit des trois relecteurs sur `main`. Toutes
les heures de cette sous-section sont en UTC.

L'étape qui construit la production et vérifie que la page de démonstration en
est absente a été ajoutée par `fa24697` le 30 octobre à 13:31, dans la PR #17.
Elle a bien tourné : au commit `c5495a7`, le même jour à 17:14, les deux étapes
figurent en succès dans le journal du travail de CI.

Quatre heures plus tard, à 17:35, `a2a5f9a` l'a supprimée. L'étape du contrôle des tirets a été
écrite **par-dessus** les deux étapes de construction au lieu d'être ajoutée à
leur suite, et le message de commit n'en disait rien : il décrivait longuement
le nouveau contrôle, ses octets UTF-8 et ses exclusions. La PR #19, qui le
portait, n'a pas été soumise au code-reviewer.

Rien n'a protesté. La CI est restée verte, puisque c'est elle qui avait perdu
l'étape, et `docs/design-system.md` a continué d'affirmer à deux endroits que
« la CI construit les deux ». La garantie a vécu seize heures et quarante-deux
minutes sur `main`, du merge de la PR #17 le 30 octobre à 17:14 à celui de la
PR #19 le 31 octobre à 09:56, et son retrait n'a été vu que cinq PR plus tard.

**La règle qui en découle : toute PR passe par le code-reviewer avant fusion, y
compris une PR d'outillage ou de documentation.** C'est précisément une PR
d'outillage, qui ne touchait aucune ligne de code applicatif, qui a retiré une
garantie de la CI. Le périmètre d'une PR ne dit rien du risque qu'elle porte.

Un second enseignement, inscrit dans `ci.yml` lui-même : dans un fichier de CI,
on ajoute une étape, on n'en remplace jamais une.

### Ce qui est prévu

Un hook `PreToolUse` à la story 3 (comptes sur invitation), en même temps que
celui qui limitera le test-writer aux fichiers de test. Le sandbox n'est pas
retenu pour l'instant.

## 5. Bancs d'essai des relecteurs

Deux bancs : celui du code-reviewer, ci-dessous, et celui des deux relecteurs
spécialisés, à la fin de cette section.

### Banc du code-reviewer

La branche `test/code-reviewer`, locale et jamais poussée, sert de banc d'essai.
Elle porte un changement réaliste (création d'invitation : point d'API, écran,
tests) qui passe `pnpm lint`, `pnpm typecheck` et `pnpm test`, dans lequel six
défauts d'une nature chacun sont semés, plus un élément correct mais inhabituel
(une promesse ignorée avec `void` et un commentaire qui dit pourquoi) pour
mesurer les faux positifs. La liste des défauts reste hors du dépôt et n'est
jamais donnée à l'agent.

Le banc est rejoué à chaque modification du prompt du relecteur.

### Passage 1 : 30 octobre 2026, Claude Code 2.1.175

Prompt du commit `976735a`. Consigne donnée, rien de plus : « Relis la branche
test/code-reviewer contre main. »

| Défaut semé | Trouvé | Gravité rendue | Gravité attendue |
| --- | --- | --- | --- |
| `any` sur un paramètre, dans un `.vue` | oui | bloquant | bloquant ou important |
| Fonction exportée sans type de retour | **non** | sans objet | important |
| Promesse non attendue, succès annoncé à tort | oui | bloquant | bloquant |
| Champ de formulaire sans label | oui | important, « à confirmer par a11y-reviewer » | bloquant |
| Adresse e-mail journalisée | oui | bloquant | bloquant |
| Affirmation invérifiable sur une bibliothèque | oui | important, source citée | à vérifier |

Résultats : **cinq défauts sur six**, **aucun faux positif**. L'élément correct
mais inhabituel n'a pas été signalé : il figure dans « Ce qui est bien fait »,
avec la règle qui l'autorise. Vingt-et-un points rendus en tout, dont quinze
hors de la liste semée, tous vérifiés exacts, et quatre qui correspondaient à
des défauts introduits sans le vouloir en fabriquant le banc.

Trois enseignements, qui ont donné le commit `1d96bc9` :

1. Sept points sur vingt-et-un en bloquant, dont des règles dont
   l'infrastructure n'existe pas encore dans le dépôt (pino, filtre RFC 9457).
   Le barème parlait de « règle non négociable enfreinte » : il parle
   maintenant de l'effet sur un utilisateur.
2. Le champ sans label est parti en « important à confirmer par a11y-reviewer »,
   alors que le RGAA 4.1 niveau AA est non négociable. La phrase qui invitait à
   renvoyer vers les relecteurs spécialisés a été resserrée.
3. Le type de retour manquant a été manqué alors que le fichier était lu et la
   ligne citée pour un autre motif : la signature n'était pas une ligne ajoutée
   du diff. Le prompt dit maintenant que les rules portent sur tout ce que le
   diff touche, contexte compris.

Le piège invérifiable n'a pas tenu, et c'est un bon résultat : l'agent est allé
citer `crypto.d.ts` dans `node_modules`, qui recopie la documentation Node, et a
tranché au lieu de supposer. Un piège de ce genre doit viser un comportement
absent des typages installés.

Contrôle annexe, même date et même version : interrogé sur ses outils, l'agent
a listé `Read`, `Grep`, `Glob`, `Bash` et l'outil de remise de rapport, soit
exactement son frontmatter, et n'a rien relu.

### Ce que le lint attrape seul depuis les garanties du 30 octobre 2026

Trois des six défauts semés, sans aucun faux positif :

| Défaut | Règle qui l'attrape |
| --- | --- |
| Fonction exportée sans type de retour | `@typescript-eslint/explicit-module-boundary-types` |
| `any` sur un paramètre, dans un `.vue` | `@typescript-eslint/no-explicit-any` |
| Champ de formulaire sans label | `vuejs-accessibility/form-control-has-label` |

Les trois autres restent au jugement du relecteur. La promesse flottante
échappe au lint parce que `no-floating-promises` a besoin des types, et que les
règles typées restent hors des `.vue` : elles liraient le TypeScript généré
derrière le composant. L'adresse e-mail journalisée et le commentaire faux
demandent, eux, de comprendre ce que le code raconte.

Mesure faite en superposant `eslint.config.js`, `package.json` et
`pnpm-lock.yaml` de `chore/lint-garanties` sur la copie de travail du banc, sans
toucher à son commit : la configuration du lint est versionnée, donc une
branche sortie ramène la sienne.

### Passage 2 : 30 octobre 2026, Claude Code 2.1.175

Prompt du commit `1d96bc9`, session neuve. Les garanties de lint de `main`
(`eslint.config.js`, `package.json`, `pnpm-lock.yaml`) étaient superposées sur
la copie de travail du banc, son commit inchangé. Consigne donnée, rien de
plus : « Relis la branche test/code-reviewer contre main. »

| Défaut semé | Passage 1 | Passage 2 | Gravité attendue |
| --- | --- | --- | --- |
| `any` sur un paramètre, dans un `.vue` | oui, bloquant | oui, par le lint, bloquant | bloquant ou important |
| Fonction exportée sans type de retour | **non** | oui, par le lint, bloquant | important |
| Promesse non attendue, succès annoncé à tort | oui, bloquant | oui, bloquant | bloquant |
| Champ de formulaire sans label | important, « à confirmer par a11y-reviewer » | oui, par le lint, bloquant, jugé sur le fond | bloquant |
| Adresse e-mail journalisée | oui, bloquant | oui, bloquant | bloquant |
| Affirmation invérifiable sur une bibliothèque | important, source citée | suggestion, source citée | à vérifier |

Résultats : **six défauts sur six**, **aucun faux positif**. Vingt points rendus
en tout, contre vingt-et-un au passage 1, dont trois bloquants contre sept.

Les trois enseignements du passage 1, repris un par un :

1. **Le barème resserré tient.** Les trois règles dont l'infrastructure manque
   sont exactement là où le prompt les attend : pino, le filtre RFC 9457 et la
   garde d'authentification en Important, chacune avec sa story du lot 1 citée.
   C'est le correctif le plus net.
2. **Le renvoi vers les relecteurs spécialisés a disparu.** Plus une seule
   mention « à confirmer par a11y-reviewer » ou « security-reviewer ». Le champ
   sans label est jugé sur le fond (« champ inutilisable au lecteur d'écran »).
   Réserve : le lint l'attrapait aussi, donc on ne sait pas si la phrase
   resserrée aurait suffi seule.
3. **La consigne sur le contexte du diff n'est pas démontrée.** Le type de
   retour manquant est trouvé, mais par
   `@typescript-eslint/explicit-module-boundary-types`, pas à l'oeil. La
   garantie de lint masque ce test.

Trois des six défauts arrivent désormais par la sortie de `pnpm lint`, groupés
en un seul point bloquant, comme le prompt le demande (« signale seulement
qu'ils échouent »). La prédiction de la sous-section précédente est donc
confirmée en passage réel. Le banc ne mesure plus le jugement du relecteur sur
ces trois défauts, seulement sa lecture d'une sortie d'outil.

L'élément correct mais inhabituel a tenu : la promesse ignorée avec `void` n'est
pas signalée comme un défaut. Mais elle ne figure plus dans « Ce qui est bien
fait » : le contrôle positif est devenu un simple silence. L'agent a en revanche
relevé, à juste titre, que la première phrase du même commentaire annonce un
comportement absent (rien ne lit le paramètre d'URL `envoye`).

Quatre constats hors liste semée ont été recontrôlés à la main, tous exacts :
la valeur par défaut `max: 10` de `pg-pool` à la ligne citée, le conflit de
fusion sur `apps/api/src/db/client.ts` (confirmé par `git merge-tree`),
l'absence de `useGlobalFilters` dans `apps/api/src/main.ts` et l'absence
d'`afterEach` dans `apps/web/src/router.ts`.

Écarts de forme, mineurs : deux sections hors format en tête du rapport
(l'avertissement sur l'issue manquante, qui est demandé, et une note de
méthode, qui ne l'est pas) et une en fin (« Fichiers relus »).

### Passage 3 : banc v2, à construire

Décisions du 30 octobre 2026. À construire et à jouer à la prochaine
modification du prompt du code-reviewer, pas avant.

- **Banc v2 reconstruit depuis `main`.** Plus de superposition sur la copie de
  travail : la branche porte elle-même la configuration du lint. Elle se remet
  à niveau par `git rebase main` quand `main` évolue.
- **Défauts semés surtout hors de portée du lint**, selon l'ADR 0004 : une
  promesse non attendue dans un `.vue`, une adresse e-mail journalisée, la
  lecture d'une ressource par identifiant sans vérifier l'appartenance au
  foyer, un montant manipulé en nombre décimal au lieu de centimes, une erreur
  de formulaire signalée par la couleur seule. Un seul défaut attrapé par le
  lint, le `any`, pour vérifier que l'agent rapporte bien l'échec.
- **Piège** : une affirmation qu'aucune source locale ne tranche, par exemple
  « l'API HelloFresh accepte jusqu'à 500 résultats par page ». Gravité attendue
  « À vérifier », avec renvoi à `docs/lot-0/hellofresh.md`.
- **Deux témoins corrects mais inhabituels**, dont la promesse ignorée avec
  `void` et son commentaire.

Toujours à faire au 31 octobre 2026 : le prompt du code-reviewer n'a pas bougé
depuis le passage 2, donc le banc v2 n'a pas encore eu de raison d'être joué.
La méthode décrite ci-dessus a servi telle quelle au banc des deux relecteurs
spécialisés, qui est la première application de l'ADR 0004 à un banc.

### Banc des deux relecteurs spécialisés

Branche `test/reviewers`, locale, jamais poussée, supprimée après la mesure.
Partie de `main` au commit `115a65b`, un seul commit, `ad06122`.

Changement joué : une story de réinitialisation de mot de passe (#13), API et
écran. Il passe `pnpm lint`, `pnpm typecheck`, `pnpm test` (158 tests) et
`pnpm test:e2e` (19 tests). Douze défauts semés hors de portée du lint et
d'axe-core, six par domaine, plus deux témoins corrects : une requête Drizzle
paramétrée et un `alt=""` sur une icône décorative. Aucun commentaire du code
ne désigne un défaut, et deux commentaires justifient innocemment un défaut (le
sel « pour qu'un jeton sorti de la base ne vaille rien ailleurs », le SQL brut
« pour rester insensible à la casse »). La liste des défauts est restée hors du
dépôt et n'a jamais été donnée aux agents.

#### Passage 1 : 31 octobre 2026, Claude Code 2.1.175

Prompts installés par la PR #26. Consigne donnée à chacun, rien de plus :
« Relis la branche test/reviewers contre main. »

| | security-reviewer | a11y-reviewer |
| --- | --- | --- |
| Défauts de son domaine trouvés | 6 sur 6 | 6 sur 6 |
| Faux positifs | 0 | 0 |
| Témoin correct non signalé | oui | oui |
| Gravités conformes au barème | 6 sur 6 | 6 sur 6 |
| Règle ou critère cité juste | 6 sur 6 | 6 sur 6 |
| Points rendus en tout | 19 | 20 |
| Verdict | Changements demandés | Changements demandés |

Défauts de sécurité, tous rendus Bloquants : accès à une ressource par
identifiant sans filtre de foyer, adresse e-mail journalisée, secret en dur,
SQL construit par concaténation, jeton de réinitialisation stocké en clair,
trace technique renvoyée dans une erreur. L'absence de durée de vie du jeton a
été séparée du stockage en clair et rendue en Important, ce qui est plus fin
que la grille et se défend : le stockage en clair suffit à une fuite de base,
l'absence d'expiration demande en plus de retrouver un vieux lien.

Défauts d'accessibilité : titre de page générique (RGAA 8.6), erreur signalée
par la couleur seule (3.1), région `aria-live` créée en même temps que son
message (7.5), alternative non pertinente (1.2), `outline: none` sans
remplacement (10.7), groupe de champs sans `fieldset` ni `legend` (11.5 et
11.6). Les deux premiers sont rendus en Bloquant, les autres en Important. Les
intitulés sont recopiés de `references/criteres-rgaa-4.1.2.md`, pas rédigés de
mémoire, et chaque numéro correspond.

**Les trois écarts corrigés avant installation tiennent à l'usage.** Les deux
vulnérabilités de `pnpm audit` sont mentionnées en une ligne sans devenir un
point relevé, parce que le diff ne touche aucune dépendance. Les renvois « à
confirmer par » portent chacun leur gravité réelle, jamais une gravité baissée.
Le a11y-reviewer a lancé `pnpm test:e2e` sans rien écrire dans le dépôt.

#### Ce qu'ils ont trouvé hors de la liste semée

Tous les points rendus ont été recontrôlés à la main, et tous sont exacts.
Quatre sont des défauts réels introduits sans le vouloir en fabriquant le banc,
ce qui est le meilleur signe du passage :

1. **La migration n'était pas jouable.** Le fichier SQL avait été écrit à la
   main, `drizzle/meta/_journal.json` ne portait que l'entrée `0000` et aucun
   snapshot `0001` n'existait : `pnpm db:migrate` l'aurait ignoré.
2. **Deux pools PostgreSQL**, le fournisseur de base étant déclaré dans deux
   modules.
3. **`currentColor` ne traverse pas une image `data:`** : les deux SVG se
   dessinaient en noir, l'un quasi invisible en thème sombre.
4. **Les boutons radio sans attribut `name`** ne formaient pas un groupe natif,
   donc deux arrêts de tabulation et pas de circulation aux flèches.

S'y ajoutent, côté sécurité : le jeton qui circule en paramètre d'URL, donc
dans les journaux du proxy et l'historique ; l'incohérence entre la contrainte
d'unicité sensible à la casse sur `users.email` et la recherche en
`lower(email)` ; l'absence de limitation de débit ; l'absence de format
RFC 9457. Côté accessibilité : l'attribut `disabled` posé pendant l'envoi, qui
fait tomber le focus sur le `body` ; le champ obligatoire dont rien ne
l'indique avant la saisie ; les cibles des boutons radio sous 44 px ; l'écran
non couvert par axe-core. Les deux ont vu que la page envoie un canal que l'API
ne lit pas.

**Une seule imprécision.** Le a11y-reviewer annonce « `#ff9287` sur `#141320`
environ 9:1 » là où le calcul donne 8,5:1. Il avait marqué l'approximation, et
son autre ratio est juste au centième. Sa conclusion n'en dépendait pas : il
relevait que `--color-danger` sert de couleur de texte alors que
`tokens.spec.ts` ne mesure ce jeton qu'au seuil de 3:1, donc que le seuil passe
aujourd'hui sans que rien ne le garde.

#### Ce que ce banc ne mesure pas

Deux limites, à garder en tête avant de conclure quoi que ce soit de ces douze
sur douze.

- **Les défauts ont été écrits par quelqu'un qui connaissait la grille.** Ils
  tombent donc sur les cases que les prompts annoncent, et un défaut réel
  arrive rarement aussi bien cadré. Le banc mesure que les agents couvrent leur
  propre grille, pas qu'ils trouvent ce qu'elle ne prévoit pas. Les quatre
  trouvailles ci-dessus sont le seul indice en ce sens, et elles n'étaient pas
  volontaires.
- **La notation a été faite par le même agent que celui qui a fabriqué le
  banc**, moi, qui savais où regarder. Juge et partie : un faux positif que je
  n'aurais pas reconnu comme tel serait passé en « point légitime ». Les
  affirmations vérifiables ont été recontrôlées une par une (citations de
  règles, numéros de critères, ratios de contraste, journal des migrations,
  contenu de l'issue #13), ce qui limite le risque sans l'annuler.

À refaire autrement la prochaine fois : des défauts choisis par Martin, ou un
banc sorti d'un vrai diff passé, et la notation faite hors de la session qui a
construit le banc.

## 6. Scans de skills externes

Un rapport par skill installé, avec ce que le scan a trouvé et ce qu'en a
conclu la lecture humaine, que l'ADR 0003 rend obligatoire. Un skill écrit pour
le projet n'a pas de scan à passer, mais s'il recopie une source extérieure,
cette source est contrôlée et son rapport figure ici aussi.

### `frontend-design`, 30 octobre 2026

- Origine : `anthropics/skills`, chemin `skills/frontend-design`.
- Commit figé : `41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f`, dernier commit qui
  touche ce skill, du 3 septembre 2026. Le dépôt n'a pas de licence à sa
  racine, mais le dossier du skill porte son propre `LICENSE.txt`, en
  Apache-2.0, repris dans le dépôt comme cette licence l'exige.
- Contenu : deux fichiers, `SKILL.md` et `LICENSE.txt`. Aucun script, aucune
  commande, aucune adresse réseau. SkillSpector le confirme :
  « Executable scripts: No », couverture 100 %.
- Empreintes SHA-256 de ce qui est installé, identiques à ce qui a été scanné :
  `d919706...` pour `SKILL.md`, `0d542e0...` pour `LICENSE.txt`.
- Scan SkillSpector v2.13.2, en `--no-llm` : **13/100, LOW, SAFE**.

**Le seul signalement, AR2 « Anti-Refusal Statement » sur `SKILL.md:69`, est un
faux positif.** Confiance annoncée : 55 %. Le contrôle cherche une consigne qui
empêcherait l'agent de remonter un avertissement à l'utilisateur. La ligne
visée parle de la rédaction des messages d'erreur **de l'interface** :

> Errors don't apologize, and they are never vague about what happened.

C'est une consigne de rédaction produit, du même ordre que « pas de filler » ou
« voix active » dans les lignes voisines, et non une consigne adressée à
l'agent sur sa propre parole. Rien dans le reste du fichier ne demande de taire
quoi que ce soit. Le motif déclenche sur la forme de la phrase, pas sur son
sens, ce qui est exactement la limite que l'ADR 0003 prête au mode `--no-llm`,
dans l'autre sens que prévu : ici l'analyse statique crie, et c'est la lecture
qui rassure.

Rien n'est modifié dans le fichier installé : il est gardé tel que le commit
épinglé le livre, pour que son empreinte reste vérifiable.

**Non installés, sur décision de Martin le 30 octobre 2026** : `impeccable` et
`taste-skill`. Ils ne sont pas non plus au calendrier de la section 2.

### `context7`, 31 octobre 2026

- Origine : `netresearch/context7-skill`, chemin `skills/context7`. Seul ce dossier
  est repris : le dépôt porte aussi un greffon complet, des tests, des crochets
  pre-commit et un `verify-harness.sh` de 18 ko, que l'ADR 0003 interdit
  d'installer en bloc.
- Commit figé : `3ff120aa168ac75fc7a110c589ff53dff0b6f284`, dernier commit qui
  touche `skills/`, du 7 octobre 2026.
- Licence : `(MIT AND CC-BY-SA-4.0)`, déclarée dans le frontmatter. Les en-têtes
  SPDX donnent MIT pour le script et CC-BY-SA-4.0 pour le `SKILL.md`. Les deux
  fichiers de licence vivent à la racine du dépôt amont et sont repris à côté du
  skill.
- Contenu : deux fichiers, `SKILL.md` et `scripts/context7.sh`.
- Empreintes SHA-256 de ce qui est installé, identiques à ce qui a été scanné :
  `b58517d3...` pour `SKILL.md`, `809fdff8...` pour `scripts/context7.sh`.
- Scan SkillSpector v2.13.2, en `--no-llm` : **24/100, MEDIUM, CAUTION**,
  couverture 100 %.

**Ce que le script fait, établi par lecture et non par confiance.** Il n'appelle
que `curl`, `jq` et `printf`. Deux adresses, toutes deux sur `context7.com` :
`GET /api/v2/search?query=...` et `GET /api/v2/docs/<mode>/<org>/<lib>?type=txt`.
Il ne lit aucun fichier : pas de `cat`, pas de redirection d'entrée, pas de
lecture du répertoire courant. **Il ne peut donc pas faire sortir du code ni un
chemin du dépôt** ; il n'envoie que ses propres arguments. La responsabilité se
déplace sur l'appelant, d'où la règle ajoutée à `.claude/rules/security.md`.

Il n'écrit rien sur le disque, et ne lit qu'une variable d'environnement,
`CONTEXT7_API_KEY`, facultative. Celle-ci est passée à `curl` par l'entrée
standard (`-H @-`) et non sur la ligne de commande, que les autres utilisateurs
locaux liraient dans la liste des processus.

**Le signalement unique, LP1 à 75 %, est un faux positif.** Il annonce une
capacité « shell » non couverte par `allowed-tools`. Or le frontmatter déclare
`Bash(${CLAUDE_SKILL_DIR}/scripts/context7.sh:*)`, `Bash(bash ...)` et `Read`.
Le scanner ne résout pas `${CLAUDE_SKILL_DIR}` et ne rapproche donc pas ce
`Bash(...)` paramétré d'une capacité générique. Le skill déclare en réalité une
portée **plus étroite** qu'un `Bash` nu.

**Prérequis, satisfaits.** Le skill exige `curl` 7.55 ou plus, présent en 8.4.0,
et `jq`, qui manquait au moment du scan et a été installé le 31 octobre 2026 en
1.8.2. Les deux figurent dans `docs/poste-de-dev.md` avec leur commande de
retrait. Sans `jq`, le script échouerait dès sa première commande.

**Règles de permission, ajoutées le 31 octobre 2026.** Six entrées en `ask`
dans `.claude/settings.json`, trois pour Bash et leurs trois miroirs PowerShell :

```text
Bash(.claude/skills/context7/scripts/context7.sh:*)
Bash(bash .claude/skills/context7/scripts/context7.sh:*)
Bash(curl:*context7.com*)
```

Elles sont écrites ici et non dans le fichier parce que `settings.json` est du
JSON strict, qui n'accepte pas de commentaire : c'est la même limite que celle
déjà notée à la section 4.

Deux formes d'invocation pour le script, avec et sans `bash` devant, parce que
le `SKILL.md` du skill déclare les deux. Elles utilisent le suffixe `:*` et non
` *` comme le reste du fichier : c'est la forme que le skill emploie lui-même
dans son `allowed-tools`, et elle couvre aussi l'appel sans argument.

**Pas de règle `deny` sur `curl`**, décidé le 31 octobre 2026. Elle serait
massivement contournable et gênerait le travail courant, pour un gain nul sur le
risque réel.

**La règle sur `curl` est un filet, pas une barrière.** Un `curl` lancé depuis
l'intérieur du script shell ne passe pas par l'outil Bash et n'est donc pas
intercepté. La règle qui compte est la première, sur l'exécution du script :
c'est le point de passage réel. Voir la section 4, qui dit déjà qu'une règle de
permission couvre l'invocation habituelle et n'est pas une frontière de sécurité.

**Deux points à vérifier au premier usage réel, en story #8.** Ils ne sont pas
vérifiables sans exécuter le skill, ce qui a été exclu à l'installation.

1. **Le chemin correspond-il aux motifs ?** Le `SKILL.md` invoque le script par
   `${CLAUDE_SKILL_DIR}/scripts/context7.sh`. Si la variable est développée avant
   que la règle soit évaluée, les motifs ci-dessus correspondent. Sinon il faudra
   les réécrire sur `${CLAUDE_SKILL_DIR}`.
2. **L'accord est-il réellement demandé ?** Le skill déclare lui-même
   `allowed-tools` sur son script. Si cette déclaration pré-autorise l'exécution,
   elle passerait devant la règle `ask` et Martin ne verrait jamais la demande.
   C'est l'hypothèse à infirmer ou confirmer en premier, parce qu'elle viderait
   les six règles de leur effet.

### `skill-creator`, 31 octobre 2026 : écarté

Lu, scanné, **non installé**. Classé « source d'inspiration, jamais en
installation », comme `superpowers`, mais pour une raison différente : non pas
une méthode concurrente, mais ce que l'outil fait sur la machine.

- Origine : `anthropics/skills`, chemin `skills/skill-creator`, Apache-2.0.
- Commit examiné : `b9e19e6f44773509fbdd7001d77ff41a49a486c1`, du 20 avril 2026.
- Contenu : 18 fichiers, dont 10 scripts Python et deux pages HTML.
- Scan SkillSpector v2.13.2, en `--no-llm` : **100/100, CRITICAL, DO NOT
  INSTALL**, 9 signalements, couverture **88,9 %**.

**Ce qui a motivé le refus**, établi par lecture :

1. **Deux scripts appellent le CLI `claude`** en lui passant l'environnement
   entier moins la seule variable `CLAUDECODE` : `scripts/run_eval.py:85` par
   `Popen`, en parallèle, et `scripts/improve_description.py:35`, qui lui envoie
   le corps entier d'un `SKILL.md`. Le code dit lui-même qu'il réutilise
   l'authentification de la session Claude Code.
2. **`run_eval.py` écrit dans le dépôt** : il remonte jusqu'au dossier `.claude/`,
   y crée `commands/` et y écrit un fichier avant chaque requête.
3. **`eval-viewer/generate_review.py` ouvre un serveur HTTP local** et le
   `SKILL.md` recommande de le lancer détaché par `nohup`. Sa fonction
   `_kill_port` exécute `lsof -ti :<port>` puis `os.kill(pid, SIGTERM)` : elle
   termine le processus qui écoute sur ce port, quel qu'il soit.
4. **Deux appels vers l'extérieur** dans les pages engendrées : Google Fonts dans
   `generate_report.py`, et un script distant depuis `cdn.sheetjs.com` dans
   `eval-viewer/viewer.html`, avec un attribut `integrity`.
5. **Aucune portée d'outils déclarée** : le frontmatter n'a que `name` et
   `description`, sans `allowed-tools`.

**Les neuf signalements, analysés** : AE1 (artefact non entièrement inspecté),
deux E2 (moisson de variables d'environnement), AS1 (accès au dossier de
configuration de l'agent), LP3 (aucune portée d'outils), RA2 (persistance), et
trois AST4 (appels `subprocess`). Tous correspondent à un fait du code. Les trois
AST4 signalent une capacité et non une faute : les appels sont écrits
correctement, liste d'arguments explicite, jamais `shell=True`.

**Rien de malveillant n'a été trouvé.** C'est l'outil d'Anthropic pour écrire des
skills, et il doit imbriquer `claude` pour mesurer des déclenchements : ces
capacités sont inhérentes à sa fonction. Le refus porte sur l'étendue de ces
capacités au regard des règles du projet, pas sur une intention.

**Une leçon sur le scan lui-même.** La couverture n'était que de 88,9 % : le
scanner a buté sur les deux pages HTML (`static_parse_limit`), et c'est
précisément dans l'une d'elles que se trouve le script distant. **Le scan seul
n'aurait pas suffi**, ce qui confirme que l'étape de lecture de l'ADR 0003 n'est
pas décorative.

**Limite pratique, accessoire** : `run_eval.py` utilise `select.select()` sur un
tube, ce que Windows n'accepte que pour des sockets. Ce script ne fonctionnerait
pas sur le poste de toute façon.

### `rgaa-checklist`, 31 octobre 2026 : écrit pour le projet

Pas de scan : le skill est écrit pour le projet, comme les rules et les deux
agents. Ce qui est contrôlé ici, c'est la source extérieure qu'il recopie.

- Contenu : deux fichiers, `SKILL.md` et `references/criteres-rgaa-4.1.2.md`.
  Aucun script, aucune commande, aucune adresse réseau appelée.
- Empreintes SHA-256 de ce qui est installé :
  `f7c1c6b1...` pour `SKILL.md`,
  `967731ca...` pour `references/criteres-rgaa-4.1.2.md`.

**La source des critères, vérifiée le 31 octobre 2026.** Les 106 critères
viennent du dépôt `DISIC/accessibilite.numerique.gouv.fr`, fichier
`RGAA/criteres.json`, au commit `ca4019f95073b6cbd2482a16e9f12b52d8de678d`.
Contrôlé par lecture de l'API GitHub, sans rien télécharger :

- le commit existe et date du 18 août 2026, conforme à ce que le fichier
  annonce ;
- `RGAA/criteres.json` est bien présent à ce commit, 243 156 octets,
  empreinte de blob `24e2149541e6fae6b0ac0c8eb92c36e43f991773` ;
- le commit lui-même ne touche pas `criteres.json` mais
  `src/infos/mentions-legales.md`. C'est donc un **état du dépôt épinglé**, et
  non le dernier commit qui modifie le référentiel. L'empreinte du blob
  ci-dessus est ce qui fixe réellement le contenu repris ;
- la licence n'est pas déclarée par un fichier à la racine du dépôt. Elle est
  énoncée dans ces mêmes mentions légales : « les contenus de ce site sont
  proposés sous licence ouverte 2.0 ». La page y recommande de citer la source
  explicitement, ce que le fichier fait.

**Le contenu recopié, recompté.** 106 entrées, réparties en 9, 2, 3, 13, 8, 2,
5, 10, 4, 14, 13, 11 et 12 par thème, ce qui est la structure du RGAA 4.1.2.

**Deux écarts relevés à l'installation, laissés tels quels.** Le fichier n'est
pas retouché, pour que son empreinte reste celle qui a été lue.

1. Le `SKILL.md` renvoie à l'agent `a11y-reviewer` au présent, alors qu'il
   n'existe pas encore : il est prévu à la story #8, voir la section 3. La
   phrase est gardée, l'agent arrive à l'étape suivante.
2. Le contrôle des tirets de la CI excluait tout `.claude/skills/`. Ce skill
   étant écrit pour le projet, l'exclusion a été resserrée aux deux dossiers
   tiers au lieu de laisser passer le nouveau. Les deux fichiers installés ne
   contiennent de toute façon aucun tiret long ni moyen.
