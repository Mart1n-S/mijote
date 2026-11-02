<script setup lang="ts">
/*
  La case à cocher et le bouton radio, dessinés. Interne aux champs de base :
  les deux partagent tout sauf la forme de leur boîte et de leur marque, et une
  seule écriture évite qu'un correctif n'arrive que dans l'un des deux.

  Pas de v-model ici : une case porte un booléen, un radio porte la valeur de
  son groupe. Le composant rend donc son état et signale son changement, et
  c'est l'appelant qui sait ce que cela veut dire pour son modèle.
*/
const props = withDefaults(
  defineProps<{
    id: string;
    type: 'checkbox' | 'radio';
    checked: boolean;
    /** Obligatoire pour un radio : c'est ce qui en fait un groupe. */
    name?: string;
    value?: string;
    required?: boolean;
    disabled?: boolean;
    /** Le champ est en erreur : le contour double d'épaisseur. */
    invalid?: boolean;
    describedBy?: string;
  }>(),
  {
    name: undefined,
    value: undefined,
    required: false,
    disabled: false,
    invalid: false,
    describedBy: undefined,
  },
);

const emit = defineEmits<{ change: [checked: boolean] }>();

function onChange(event: Event): void {
  const target = event.target;

  emit('change', target instanceof HTMLInputElement ? target.checked : !props.checked);
}
</script>

<template>
  <span class="choice" :class="`choice--${type}`">
    <!--
      L'input porte la zone cliquable et reste transparent ; c'est le span qui
      suit qui dessine la boîte. C'est ce qui permet d'avoir 44 px de cible
      tactile sans grossir la marque, qui elle suit la taille du texte.

      checked est lié et non géré par l'input : l'état vient du modèle de
      l'appelant, et le navigateur ne le change pas de son côté.
    -->
    <input
      :id="id"
      class="choice__input"
      :type="type"
      :name="name"
      :value="value"
      :checked="checked"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      @change="onChange"
    />

    <span class="choice__box" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.choice {
  position: relative;
  display: inline-flex;
  flex: none;
  /*
    Zone tactile de 44 px, portée par le contrôle lui-même et non par son
    label : c'est de l'UX mobile autant que de l'accessibilité, une case de
    13 px ne se cochant pas au doigt.
  */
  width: var(--tap-min);
  height: var(--tap-min);
}

.choice__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  /*
    Le rendu natif est remplacé, pas teinté : l'input devient une surface
    transparente, et la boîte visible est le span voisin. Sans appearance: none,
    le navigateur dessinerait sa propre case par-dessus, avec ses couleurs.
  */
  appearance: none;
  background: none;
  border: 0;
  cursor: pointer;
  /*
    L'anneau de focus est retiré d'ici pour être posé sur la boîte, juste en
    dessous : autour de la zone de 44 px, il serait plus de deux fois plus large
    que la marque qu'il désigne. C'est la seule exception à l'anneau unique de
    base.css, et elle réemploie ses jetons sans rien écrire en dur, donc
    l'anneau ne peut pas diverger. Voir docs/design-system.md.
  */
  outline: none;
}

.choice__box {
  position: absolute;
  /* Centrée dans la zone cliquable par les quatre côtés plus margin: auto. */
  inset: 0;
  margin: auto;
  /*
    En em et non en rem : la marque suit la taille du texte à côté d'elle, donc
    elle grandit avec lui au texte agrandi.
  */
  width: 1.25em;
  height: 1.25em;
  background-color: var(--color-background);
  /* Le contour le plus fin reste lisible, comme celui d'un champ de saisie. */
  border: 1px solid var(--color-border-strong);
  pointer-events: none;
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

/* La forme distingue les deux familles avant toute couleur : un carré se
   coche, un cercle se choisit parmi d'autres. */
.choice--checkbox .choice__box {
  border-radius: var(--radius-sm);
}

.choice--radio .choice__box {
  border-radius: var(--radius-full);
}

/*
  L'anneau de focus, avec les jetons de base.css et rien d'autre. L'ordre
  compte : cette règle vient avant les états, pour qu'un anneau ne masque pas un
  changement de contour, et après le repos, pour exister au repos comme coché.
*/
.choice__input:focus-visible + .choice__box {
  outline: var(--focus-ring-width) solid var(--color-focus);
  outline-offset: var(--focus-ring-offset);
}

/*
  Le survol et l'enfoncement excluent l'état invalide, et ce n'est pas un détail
  de style : sans cela, leur spécificité plus forte remplacerait le contour
  rouge au moment précis où l'utilisateur pointe le champ à corriger. C'est la
  leçon déjà apprise sur BaseField.
*/
.choice__input:hover:not(:disabled, [aria-invalid='true']) + .choice__box {
  border-color: var(--color-border-hover);
}

.choice__input:active:not(:disabled, :checked) + .choice__box {
  background-color: var(--color-surface-hover);
}

.choice__input:checked + .choice__box {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
}

.choice__input:checked:active:not(:disabled) + .choice__box {
  background-color: var(--color-accent-active);
  border-color: var(--color-accent-active);
}

/*
  La marque de l'état coché est une forme, et c'est ce qui compte : l'état se
  lit sur un écran monochrome et avec un daltonisme, où le fond d'accent ne dit
  rien (principe 4 du design system).
*/
.choice__input:checked + .choice__box::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
}

/* Une coche : deux bordures d'un carré, tournées d'un huitième de tour. */
.choice--checkbox .choice__input:checked + .choice__box::after {
  width: 0.3em;
  height: 0.6em;
  /* Même épaisseur que le contour d'un champ invalide, la plus fine qui reste
     lisible une fois tournée. */
  border: 2px solid var(--color-on-accent);
  border-top: 0;
  border-left: 0;
  transform: rotate(45deg) translate(-10%, -15%);
}

/* Un point plein, concentrique à son cercle. */
.choice--radio .choice__input:checked + .choice__box::after {
  width: 0.5em;
  height: 0.5em;
  background-color: var(--color-on-accent);
  border-radius: var(--radius-full);
}

.choice__input:disabled {
  cursor: not-allowed;
}

/*
  Indisponible : contour et fond s'effacent, et la marque garde la couleur du
  texte atténué plutôt que le blanc, qui ne se verrait plus sur ce fond.
*/
.choice__input:disabled + .choice__box {
  background-color: var(--color-surface);
  border-color: var(--color-border);
}

.choice--checkbox .choice__input:disabled:checked + .choice__box::after {
  border-color: var(--color-text-muted);
}

.choice--radio .choice__input:disabled:checked + .choice__box::after {
  background-color: var(--color-text-muted);
}

.choice__input[aria-invalid='true'] + .choice__box {
  /* Deux épaisseurs différentes : l'état se voit aussi sans la couleur. */
  border-width: 2px;
  border-color: var(--color-danger);
}
</style>
