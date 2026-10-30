# Outillage IA du projet

Agents, skills, rules et outils externes utilisés pour développer App Repas, avec leur origine, leur version et leur contrôle de sécurité. Tenu à jour à chaque ajout.

Règle : un skill, un agent ou un outil externe est **lu**, **scanné avec SkillSpector**, puis **figé à une version précise** (commit ou étiquette) avant installation. Jamais la branche `main` d'un dépôt tiers.

## 1. Ce qui est en place

| Élément | Type | Origine | Version figée | Scan SkillSpector | Date |
| --- | --- | --- | --- | --- | --- |
| `writing-style`, `security` | rules (toujours chargées) | écrites pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `typescript`, `vue-accessibility`, `api` | rules (selon les chemins) | écrites pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `code-reviewer` | agent, lecture seule | écrit pour le projet | dépôt | sans objet | 30 octobre 2026 |
| `skillspector` | outil externe, scanner local | [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector), Apache-2.0 | commit `abd82935b67f765a9541013c0866c6349251dcdf`, qui porte l'étiquette v2.13.2 | sans objet : c'est le scanner lui-même, son README a été lu à la place | 30 octobre 2026 |

Le commit est figé, et non l'étiquette, pour la raison donnée dans l'ADR 0003.
L'emplacement sur le poste et la commande de retrait sont dans
`docs/poste-de-dev.md`.

## 2. Calendrier des outils externes

| Quand | Outil | Usage prévu |
| --- | --- | --- |
| Fait le 30 octobre 2026 | [SkillSpector](https://github.com/NVIDIA/SkillSpector) | Scanner tout skill ou agent externe avant installation, en `--no-llm` pour rester en local. Voir la section 1. |
| Lot 1, après SkillSpector | [anthropics/skills](https://github.com/anthropics/skills) (`skill-creator`) | Écrire et tester les skills du projet. |
| Lot 1, après SkillSpector | [context7-skill](https://github.com/netresearch/context7-skill) | Documentation à jour des bibliothèques. Appelle le service Context7 : seuls des noms de bibliothèques et des questions partent, jamais le code. |
| Lot 1, en écrivant les agents | [agent-skills](https://github.com/addyosmani/agent-skills), [ECC](https://github.com/affaan-m/ecc) | À piocher, jamais à installer en bloc : leurs déroulés et leurs hooks concurrenceraient le pipeline du projet. |
| Jamais en installation | [superpowers](https://github.com/obra/superpowers) | Source d'inspiration seulement : méthode complète et concurrente. |
| Fin du lot 1, avant la première invitation | [security-audit-skill](https://github.com/cloudflare/security-audit-skill) | Audit complet du code, puis avant chaque vague d'invitations. |
| Fin du lot 1, sur une préproduction | [Strix](https://github.com/usestrix/strix) | Test d'intrusion par agents, uniquement sur l'environnement de test, avec des données fictives. |
| Lot 3 ou plus tard | [Graphify](https://github.com/Graphify-Labs/graphify) | Graphe du code pour les agents, en `--code-only` pour rester local. |
| Quand le pipeline est stable | [Multica](https://github.com/multica-ai/multica) | Orchestration de plusieurs agents en parallèle. |

## 3. Pipeline cible, mis en place progressivement

| Story du lot 1 | Agent ajouté |
| --- | --- |
| Jetons de design et design system | `code-reviewer` |
| Format d'erreur et journalisation | `security-reviewer`, `a11y-reviewer` |
| Comptes sur invitation | `test-planner`, `test-writer` (limité aux fichiers de test par un hook) |
| Profil foyer | `code-writer`, `doc-writer`, `pr-manager` |
| Suivantes | skill `/feature <issue>`, qui enchaîne le pipeline |

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

### Ce qui est prévu

Un hook `PreToolUse` à la story 3 (comptes sur invitation), en même temps que
celui qui limitera le test-writer aux fichiers de test. Le sandbox n'est pas
retenu pour l'instant.

## 5. Banc d'essai du code-reviewer

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

### Passage 2 : à faire

À rejouer dans une session neuve, pour la raison dite en section 4 : le prompt
modifié n'est pas relu à chaud. Même consigne neutre, puis comparaison des
défauts trouvés, des gravités et des faux positifs avec le passage 1.
