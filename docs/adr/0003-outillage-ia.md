# ADR 0003 : outillage IA et chaîne de relecture

- Statut : acceptée
- Date : 30 octobre 2026

## Contexte

Le lot 1 met en place un pipeline d'agents : relecteur de code, relecteur de
sécurité, relecteur d'accessibilité, planificateur et rédacteur de tests. Ces
agents, et les skills qu'ils appelleront, viennent en partie de dépôts tiers.
Un skill n'est pas une bibliothèque : c'est du texte qui devient des
instructions pour un agent ayant accès au dépôt, au réseau et au shell. Une
injection d'instructions y est aussi dangereuse qu'une porte dérobée dans du
code.

Le projet est développé par une seule personne assistée d'agents, sans second
relecteur humain. L'outillage doit donc porter lui-même les garde-fous que
d'habitude une équipe assure.

## Options étudiées

| Sujet                              | Options                                                        | Retenue                        |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------ |
| Contrôle d'un outil tiers          | confiance ; lecture manuelle seule ; lecture et scan automatique | lecture et scan automatique    |
| Scanner de skills                  | aucun ; SkillSpector                                           | SkillSpector, en `--no-llm`    |
| Épinglage de l'outillage           | branche par défaut ; étiquette ; empreinte de commit           | empreinte de commit            |
| Exécuteur de la CI                 | `ubuntu-latest` ; version figée                                | `ubuntu-24.04`                 |
| Épinglage des actions GitHub       | étiquette ; empreinte de commit                                | empreinte de commit            |
| Frontière d'exécution des agents   | permissions seules ; hook `PreToolUse` ; sandbox                | permissions seules, pour l'instant |
| Méthodes d'agents tierces complètes | adopter en bloc ; piocher ; ignorer                            | piocher, sans jamais installer |

## Décision

### Lire, scanner, figer

Tout skill, agent ou outil externe passe par trois étapes avant d'être
installé, dans cet ordre :

1. **Lire** son contenu. Un skill non lu n'est pas installé, quelle que soit sa
   popularité.
2. **Scanner** avec SkillSpector, en `--no-llm`.
3. **Figer** à une version précise.

Le registre opérationnel est `docs/outillage-ia.md` : origine, version figée,
scan et date pour chaque élément. Les outils installés sur la machine, avec
leur emplacement et leur commande de retrait, sont dans
`docs/poste-de-dev.md`.

### Figer par l'empreinte du commit, et non par l'étiquette

**Une étiquette Git peut être déplacée sur un autre commit, une empreinte non.**
C'est la seule raison de cette règle, et elle vaut partout : outils externes,
actions GitHub, versions de dépendances quand le gestionnaire le permet. Les
autres documents du dépôt renvoient ici plutôt que de la répéter.

Conséquence pratique : une version publiée sert à savoir ce qu'on prend, mais
c'est l'empreinte du commit qu'elle désigne qui est écrite dans le dépôt.

### SkillSpector comme scanner

[NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector), Apache-2.0, figé
au commit `abd82935b67f765a9541013c0866c6349251dcdf`, qui porte l'étiquette
v2.13.2. Il fait de l'analyse statique de skills et d'agents : motifs
malveillants, injection d'instructions, exfiltration de données, risques de
chaîne d'approvisionnement.

Toujours en `--no-llm`. Sans cette option, le contenu des fichiers scannés part
vers un service d'inférence, ce qui est exactement ce qu'on cherche à éviter en
scannant.

**Limite assumée : `--no-llm` ne supprime pas tout appel réseau.** Le contrôle
de vulnérabilités connues (SC4) interroge `https://api.osv.dev/v1/querybatch`,
et cet appel appartient à l'analyse statique, pas à l'étape de modèle de
langage. Aucune option ne le désactive. Ce qui part est une liste de noms de
dépendances, jamais le contenu scanné, et l'outil se replie sur une liste
statique si l'API est injoignable. C'est acceptable : des noms de paquets
publics ne sont pas une donnée du projet. Pour zéro trafic sortant, il faudrait
bloquer au niveau du réseau et accepter le repli.

Le scanner lui-même n'est pas scanné : il n'y a pas de second scanner, et
s'auto-scanner ne prouverait rien. Son README a été lu à la place, et son
origine est un dépôt d'éditeur identifié sous licence libre.

### Méthodes d'agents tierces : piocher, jamais installer

`superpowers` et les collections du même genre proposent une méthode de travail
complète, avec ses propres déroulés et ses propres hooks. Les installer en bloc
mettrait deux pipelines en concurrence dans le même dépôt, et le nôtre perdrait,
parce qu'il est plus jeune et moins détaillé. Ces dépôts restent des sources
d'inspiration : on en reprend une idée à la fois, réécrite pour le projet.

### Frontière d'exécution : les permissions, pour l'instant

Les agents sont encadrés par `.claude/settings.json` et par leurs instructions.
Ni hook `PreToolUse`, ni sandbox pour l'instant.

C'est un choix assumé, pas un oubli. La documentation de Claude Code est
explicite : une règle de permission couvre l'invocation habituelle et n'est pas
une frontière de sécurité autour du programme. La liste des contournements
connus est dans la section « Limites connues » de `docs/outillage-ia.md`, avec
les mesures qui les établissent et leur date.

Le hook `PreToolUse` est prévu à la story 3 du lot 1 (comptes sur invitation),
en même temps que celui qui limitera le test-writer aux fichiers de test. Le
sandbox est écarté tant que le pipeline n'est pas stable : il changerait la
façon dont toutes les commandes s'exécutent, pour un gain nul sur le risque
principal, qui est un skill tiers mal intentionné et non une commande qui
déraille.

### CI : exécuteur et actions figés

L'exécuteur est `ubuntu-24.04` et non `ubuntu-latest`. L'étiquette `latest` a
commencé à basculer vers Ubuntu 26 le 19 octobre 2026, ce que la CI signalait en
annotation. Une image qui change sous les pieds enlève toute valeur de preuve à
une vérification verte.

Les six références d'actions GitHub sont figées par l'empreinte complète de leur
commit, la version en commentaire à côté, pour la raison donnée plus haut.

## Conséquences

- Installer un outil d'IA demande un aller-retour : lecture, scan, inscription
  au registre, puis installation. C'est lent exprès.
- `docs/outillage-ia.md` et `docs/poste-de-dev.md` doivent être tenus à jour à
  chaque ajout, sans quoi la règle devient décorative.
- Les options écartées ici (`superpowers` en installation, le sandbox) ne se
  reproposent pas sans un nouvel ADR.
- La mise à jour de l'exécuteur de la CI devient un geste explicite, à faire
  avant la fin de vie d'Ubuntu 24.04.
- Le scan en `--no-llm` laisse passer ce qu'une analyse sémantique verrait : une
  instruction malveillante formulée en langage naturel, sans motif technique. La
  lecture humaine de l'étape 1 n'est donc pas optionnelle.

## Quand revoir cette décision

- **SkillSpector** : à chaque mise à jour envisagée, revérifier la licence, le
  comportement de `--no-llm` et l'appel OSV.dev, qui peuvent changer d'une
  version à l'autre.
- **Le hook `PreToolUse`** : à la story 3 du lot 1. Si la frontière obtenue
  suffit, le sandbox reste écarté ; sinon, il revient dans la discussion par un
  nouvel ADR.
- **Le sandbox** : si un agent écrit hors de son périmètre malgré les
  permissions, ou avant la première invitation d'un utilisateur extérieur.
- **`ubuntu-24.04`** : avant la fin du support de cette image par GitHub
  Actions.
- **La règle « piocher, jamais installer »** : si une collection tierce devient
  une dépendance que le projet ne peut plus réécrire lui-même.
