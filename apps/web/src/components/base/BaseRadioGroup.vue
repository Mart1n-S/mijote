<script setup lang="ts">
import { useId } from 'vue';

import BaseFieldset from './BaseFieldset.vue';
import ChoiceControl from './ChoiceControl.vue';
import type { ChoiceOption } from './choice';

/*
  Un choix unique parmi plusieurs, en boutons radio natifs.

  Le fieldset et sa legend viennent de BaseFieldset, qui porte aussi l'aide et
  l'erreur : un groupe de boutons radio est le cas d'usage pour lequel ces deux
  éléments existent, et l'appelant n'a donc rien à grouper lui-même.
*/
withDefaults(
  defineProps<{
    legend: string;
    options: readonly ChoiceOption[];
    help?: string;
    error?: string;
    required?: boolean;
    /** Indisponible : tout le groupe sort de l'ordre de tabulation. */
    disabled?: boolean;
  }>(),
  { help: undefined, error: undefined, required: false, disabled: false },
);

/*
  La valeur du groupe, et non un booléen par bouton : c'est ce que choisir une
  option veut dire. Une chaîne vide est l'état « rien de choisi ».
*/
const value = defineModel<string>({ default: '' });

const uid = useId();

/*
  Un nom commun à tous les boutons du groupe, engendré ici : sans lui, le
  navigateur ne les relie pas, les flèches ne circulent pas entre eux et
  plusieurs peuvent être cochés à la fois. L'appelant n'a donc pas à y penser.
*/
const name = `${uid}-radio`;

/** Un identifiant par option, par son rang : une valeur peut contenir n'importe quoi. */
function optionId(index: number): string {
  return `${uid}-option-${index.toString()}`;
}
</script>

<template>
  <BaseFieldset
    :legend="legend"
    :help="help"
    :error="error"
    :required="required"
    :disabled="disabled"
  >
    <div v-for="(option, index) in options" :key="option.value" class="radio">
      <ChoiceControl
        :id="optionId(index)"
        type="radio"
        :name="name"
        :value="option.value"
        :checked="value === option.value"
        :required="required"
        :disabled="disabled || option.disabled === true"
        @change="value = option.value"
      />

      <label
        class="radio__label"
        :class="{ 'radio__label--disabled': disabled || option.disabled === true }"
        :for="optionId(index)"
      >
        {{ option.label }}
      </label>
    </div>
  </BaseFieldset>
</template>

<style scoped>
.radio {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.radio__label {
  display: flex;
  align-items: center;
  min-height: var(--tap-min);
  /*
    Deux réglages pour la même raison, mesurée au texte doublé à 320 px, où
    l'étiquette débordait de 28 px et faisait défiler la page entière.

    min-width: 0 autorise l'étiquette, élément de flex, à rétrécir sous sa
    largeur minimale de contenu. Et `anywhere` plutôt que `break-word` parce que
    seul le premier entre dans le calcul de cette largeur minimale : avec
    `break-word`, le mot le plus long la fixait encore, et il reste des mots
    plus larges que la place disponible à cette taille de texte.
  */
  min-width: 0;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.radio__label--disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}
</style>
