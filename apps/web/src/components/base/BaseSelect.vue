<script setup lang="ts">
import FieldError from './FieldError.vue';
import FieldHelp from './FieldHelp.vue';
import type { ChoiceOption } from './choice';
import { useFieldAria } from './useFieldAria';

const props = withDefaults(
  defineProps<{
    label: string;
    options: readonly ChoiceOption[];
    /**
     * Intitulé de l'option vide, sélectionnée tant que rien n'est choisi.
     *
     * Elle est désactivée, donc on en sort sans pouvoir y revenir : sans elle,
     * la première option serait sélectionnée d'office et l'utilisateur pourrait
     * valider un choix qu'il n'a pas fait.
     */
    placeholder?: string;
    help?: string;
    error?: string;
    required?: boolean;
    /** Indisponible : la liste sort de l'ordre de tabulation. */
    disabled?: boolean;
  }>(),
  {
    placeholder: 'Choisissez',
    help: undefined,
    error: undefined,
    required: false,
    disabled: false,
  },
);

const value = defineModel<string>({ default: '' });

/*
  Comme BaseField : sans cette ligne, un attribut non déclaré (name,
  autocomplete) atterrirait sur le conteneur au lieu de la liste, et n'aurait
  aucun effet.
*/
defineOptions({ inheritAttrs: false });

const { controlId, helpId, errorId, hasHelp, hasError, describedBy } = useFieldAria(props);
</script>

<template>
  <div class="select">
    <label class="select__label" :for="controlId">
      {{ label }}
      <span v-if="required" class="select__required">(obligatoire)</span>
    </label>

    <FieldHelp v-if="hasHelp" :id="helpId" :text="help ?? ''" />

    <!-- $attrs avant les attributs calculés, et pour la même raison que
         BaseField : ce qui vient après gagne, donc le lien vers l'aide et vers
         l'erreur reste sous le contrôle du composant. -->
    <select
      v-bind="$attrs"
      :id="controlId"
      v-model="value"
      class="select__control"
      :class="{ 'select__control--invalid': hasError }"
      :required="required"
      :disabled="disabled"
      :aria-describedby="describedBy"
      :aria-invalid="hasError ? 'true' : undefined"
    >
      <option value="" disabled>{{ placeholder }}</option>

      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled === true"
      >
        {{ option.label }}
      </option>
    </select>

    <FieldError v-if="hasError" :id="errorId" :text="error ?? ''" />
  </div>
</template>

<style scoped>
.select {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.select__label {
  font-weight: var(--weight-semibold);
}

.select__required {
  color: var(--color-text-muted);
  font-weight: var(--weight-normal);
  font-size: var(--text-sm);
}

/*
  Le rendu natif est habillé, pas remplacé : la flèche reste celle du système,
  et le panneau d'options aussi. Les remplacer demanderait de réécrire le
  composant entier, que l'ADR 0001 réserve à Reka UI, et aucun besoin ne le
  justifie (voir les limites connues de docs/design-system.md).
*/
.select__control {
  /* Zone tactile de 44 px minimum, comme tout ce qui se clique. */
  min-height: var(--tap-min);
  /*
    Sans cette limite, un select garde la largeur de sa plus large option et
    déborde de la page : mesuré au texte doublé à 320 px, où « Nombre de
    personnes » suffit à faire défiler l'écran entier.
  */
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-background);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

/*
  L'état invalide est exclu du survol, comme sur BaseField : sans cela, sa
  spécificité plus forte remplacerait le contour rouge au moment où
  l'utilisateur pointe le champ à corriger.
*/
.select__control:hover:not(:disabled, .select__control--invalid) {
  border-color: var(--color-border-hover);
}

.select__control:disabled {
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.select__control--invalid {
  /* Deux épaisseurs différentes : l'état se voit aussi sans la couleur. */
  border-width: 2px;
  border-color: var(--color-danger);
}
</style>
