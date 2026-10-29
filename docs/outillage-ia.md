# Outillage IA du projet

Agents, skills, rules et outils externes utilisés pour développer App Repas, avec leur origine, leur version et leur contrôle de sécurité. Tenu à jour à chaque ajout.

Règle : un skill, un agent ou un outil externe est **lu**, **scanné avec SkillSpector**, puis **figé à une version précise** (commit ou étiquette) avant installation. Jamais la branche `main` d'un dépôt tiers.

## 1. Ce qui est en place

| Élément | Type | Origine | Version figée | Scan SkillSpector | Date |
| --- | --- | --- | --- | --- | --- |
| `writing-style`, `security` | rules (toujours chargées) | écrites pour le projet | dépôt | sans objet | |
| `typescript`, `vue-accessibility`, `api` | rules (selon les chemins) | écrites pour le projet | dépôt | sans objet | |
| `code-reviewer` | agent, lecture seule | écrit pour le projet | dépôt | sans objet | |

## 2. Calendrier des outils externes

| Quand | Outil | Usage prévu |
| --- | --- | --- |
| Lot 1, en premier | [SkillSpector](https://github.com/nvidia/skillspector) | Scanner tout skill ou agent externe avant installation, en `--no-llm` pour rester en local. |
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
