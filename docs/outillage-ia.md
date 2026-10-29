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

Le commit est figé, et non l'étiquette : une étiquette Git peut être déplacée
sur un autre commit, une empreinte non. L'emplacement sur le poste et la
commande de retrait sont dans `docs/poste-de-dev.md`.

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

### Ce qui est prévu

Un hook `PreToolUse` à la story 3 (comptes sur invitation), en même temps que
celui qui limitera le test-writer aux fichiers de test. Le sandbox n'est pas
retenu pour l'instant.
