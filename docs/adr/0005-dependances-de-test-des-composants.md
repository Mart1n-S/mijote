# ADR 0005 : dépendances de test des composants

- Statut : acceptée
- Date : 30 octobre 2026

## Contexte

Le design system (story #7) demande des tests qui vérifient le clavier, le focus et les attributs ARIA du bouton, du champ de saisie et du dialogue. Ces tests ont besoin de deux choses que la stack du lot 0 ne fournit pas : un environnement DOM pour Vitest, et de quoi monter un composant Vue.

Le CLAUDE.md exige un accord explicite pour toute dépendance hors de la stack. Cet ADR consigne le choix et, surtout, les options écartées.

## Décision

Deux dépendances de développement de `apps/web`, à version figée :

| Paquet             | Version  | Rôle                                      |
| ------------------ | -------- | ----------------------------------------- |
| `jsdom`            | `30.1.3` | environnement DOM de Vitest               |
| `@vue/test-utils`  | `2.5.1`  | montage d'un composant Vue dans un test   |

L'environnement est choisi par fichier, avec `// @vitest-environment jsdom` en tête des tests qui en ont besoin. Le reste de `apps/web` reste en environnement Node, qui est plus rapide.

## Options étudiées

### happy-dom plutôt que jsdom

Écarté. Plus rapide, mais moins fidèle sur le focus et sur les événements clavier, qui sont précisément l'objet de ces tests. Le gain de vitesse ne vaut pas un doute sur ce qu'on mesure.

### @testing-library/vue et @testing-library/user-event

Écartés. Deux paquets de plus, dont un qui simule les interactions, pour une ergonomie de test dont `@vue/test-utils` nous dispense ici. `@vue/test-utils` est l'outil officiel du framework et suffit à ce que ces tests vérifient.

À reconsidérer si les tests se mettent à décrire de vraies séquences d'interaction (saisie, puis tabulation, puis envoi), où `user-event` évite d'enchaîner les événements à la main.

### Le mode navigateur de Vitest

Écarté. Il ferait tourner Playwright dans la chaîne des tests unitaires, pour le même service que `pnpm test:e2e` rend déjà, et doublerait le temps de retour.

Conséquence assumée : deux comportements ne sont pas vérifiables en jsdom et relèvent donc du test Playwright. L'activation d'un bouton natif par Entrée ou Espace, que le navigateur traduit en clic, et le démontage du dialogue avec le retour du focus sur son déclencheur, que Reka UI fait à la fin de l'animation de sortie. Les deux sont couverts par `apps/web/e2e/design-system.spec.ts`, et la limite est écrite dans les fichiers de test concernés.

### Storybook

Écarté pour l'instant. Un catalogue de composants navigable, avec ses variantes et sa documentation vivante, est utile, mais :

- il apporte un volume de dépendances et une configuration à maintenir hors de proportion avec quatre composants ;
- la page de démonstration (`/design-system`) rend déjà le service de les voir réunis, et elle est construite avec l'application, donc jamais en retard sur elle ;
- Playwright avec axe-core couvre déjà le contrôle d'accessibilité, qui est la raison principale de regarder les composants ensemble.

À reconsidérer dans deux cas : au-delà d'une quinzaine de composants, où une page unique devient difficile à parcourir, ou si le projet veut des tests de régression visuelle, que Storybook outille bien.

## Conséquences

- La page de démonstration tient le rôle de catalogue. Un composant de base ajouté y est ajouté aussi, sinon il sort du contrôle axe-core.
- Un test de composant qui a besoin du DOM le déclare en tête de fichier. Sans cette ligne, il tourne en environnement Node et échoue sur `document`.
- Les limites de jsdom sont documentées là où elles se rencontrent, et ce qui en dépend est vérifié par Playwright plutôt que simulé.
