---
paths:
  - "apps/web/**/*.vue"
  - "apps/web/**/*.css"
---

# Vue et accessibilité : le socle de base

La priorité du projet est la sécurité, puis l'UX/UI. L'accessibilité se limite à ce qui suit, et à rien de plus : aucune conformité RGAA n'est visée, et un point qui bloque trop peut être abandonné (ADR 0007).

Ce socle est gardé pour l'essentiel par l'outillage : le lint `vuejs-accessibility`, le test des couples de jetons, axe-core en CI. Ce qui suit dit ce que l'outillage ne peut pas décider à ta place.

## HTML d'abord

- HTML sémantique : `header`, `nav`, `main`, `footer`, titres hiérarchisés sans saut de niveau, vraies listes, tableaux avec en-têtes.
- Un bouton est un `<button>`, un lien est un `<a href>`. Jamais de `div` ou de `span` cliquable.
- ARIA seulement quand le HTML natif ne suffit pas. Un attribut ARIA faux est pire qu'aucun attribut.
- Composants complexes (dialogue, liste déroulante, combobox, menu, onglets) : utiliser Reka UI, qui gère le clavier et ARIA. Ne pas les réécrire à la main.

## Clavier et focus

- Tout se fait au clavier, dans un ordre logique. Le focus est toujours visible.
- Un lien d'évitement mène au contenu principal.
- À l'ouverture d'un dialogue, le focus y entre ; à la fermeture, il revient sur l'élément qui l'a ouvert.
- À chaque changement de page, le titre du document change et le focus est placé de façon prévisible.

## Formulaires

- Chaque champ a un label visible, relié au champ.
- Une erreur est affichée sous le champ concerné et reliée par `aria-describedby`.
- Jamais d'information portée par la couleur seule (erreur, statut, disponibilité).

## Jetons et visuel

- Couleurs uniquement par les jetons de design : leurs contrastes sont garantis par `tokens.spec.ts`, donc ne jamais écrire une couleur en dur.
- Les images utiles ont un texte alternatif qui dit ce qu'elles apportent ; les images décoratives ont `alt=""`.
- Zones tactiles d'au moins 44 px par `--tap-min`, sur tout ce qui se clique : c'est de l'UX mobile autant que de l'accessibilité.
- La page déclare `lang="fr"`.
- Les animations sont coupées sous `prefers-reduced-motion: reduce`, ce que `base.css` fait déjà pour toute l'application.

## Vérification

- Un écran nouveau : **un seul passage axe-core** suffit. La matrice à cinq contextes de `e2e/accessibility.ts` reste sur les écrans qui l'ont déjà ; on ne l'étend pas.
- axe-core ne voit qu'une partie des problèmes. C'est accepté : on ne complète pas par un audit manuel.

## Ce qui n'est plus exigé

- La conformité RGAA 4.1 niveau AA, et donc la grille des 106 critères. Le skill `rgaa-checklist` reste installé, mais il ne sert qu'à l'agent `a11y-reviewer`, lancé seulement quand Martin le demande.
- L'audit manuel au lecteur d'écran.
- Le texte agrandi à 200 %, en particulier sur une fenêtre de petite hauteur.
- Les régions `aria-live` posées par principe : une annonce se justifie par un besoin réel, pas par la règle.

Un défaut hors de ce socle se consigne dans les limites connues de `docs/design-system.md`, avec sa mesure. Il n'ouvre pas d'issue.
