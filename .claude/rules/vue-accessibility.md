---
paths:
  - "apps/web/**/*.vue"
  - "apps/web/**/*.css"
---

# Vue et accessibilité (RGAA 4.1, niveau AA)

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
- Une erreur est affichée sous le champ concerné, reliée par `aria-describedby`, et résumée en haut du formulaire à l'envoi.
- Jamais d'information portée par la couleur seule (erreur, statut, disponibilité).

## Contenu dynamique

- Les changements importants (prix recalculé, article coché, erreur, fin de chargement) sont annoncés par une région `aria-live`.
- Les images utiles ont un texte alternatif qui dit ce qu'elles apportent ; les images décoratives ont `alt=""`.

## Visuel

- Couleurs uniquement par les jetons de design. Contraste de 4,5:1 pour le texte courant, 3:1 pour les grands textes et les éléments d'interface.
- Zones tactiles d'au moins 44 × 44 px. Zoom à 200 % sans perte de contenu ni défilement horizontal.
- Animations courtes, coupées sous `prefers-reduced-motion: reduce`.
- La page déclare `lang="fr"`.

## Vérification

- Tout nouvel écran a un test Playwright avec contrôle axe-core.
- axe-core ne trouve qu'une partie des problèmes : le clavier et le lecteur d'écran se testent aussi à la main.
