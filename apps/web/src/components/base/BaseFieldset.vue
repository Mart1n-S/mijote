<script setup lang="ts">
import FieldError from './FieldError.vue';
import FieldHelp from './FieldHelp.vue';
import { useFieldAria } from './useFieldAria';

/*
  Un regroupement de champs de même nature, avec son intitulé.

  C'est le `fieldset` et sa `legend` du HTML, et rien d'autre : sans eux,
  l'intitulé d'un groupe n'est qu'un texte posé à côté, que rien ne relie aux
  champs. BaseRadioGroup s'appuie dessus, et un formulaire peut l'employer
  directement pour grouper deux champs liés.
*/
const props = withDefaults(
  defineProps<{
    legend: string;
    help?: string;
    error?: string;
    required?: boolean;
    /** Indisponible : un fieldset désactivé désactive tout ce qu'il contient. */
    disabled?: boolean;
  }>(),
  { help: undefined, error: undefined, required: false, disabled: false },
);

/*
  L'aide et l'erreur sont reliées au groupe, pas à chacun de ses champs : le
  lecteur d'écran les restitue à l'entrée dans le groupe, une fois, au lieu de
  les répéter à chaque option.
*/
const { helpId, errorId, hasHelp, hasError, describedBy } = useFieldAria(props);
</script>

<template>
  <fieldset
    class="fieldset"
    :disabled="disabled"
    :aria-describedby="describedBy"
    :aria-invalid="hasError ? 'true' : undefined"
  >
    <legend class="fieldset__legend">
      {{ legend }}
      <span v-if="required" class="fieldset__required">(obligatoire)</span>
    </legend>

    <FieldHelp v-if="hasHelp" :id="helpId" :text="help ?? ''" />

    <div class="fieldset__content">
      <slot />
    </div>

    <FieldError v-if="hasError" :id="errorId" :text="error ?? ''" />
  </fieldset>
</template>

<style scoped>
/*
  Un fieldset arrive avec un contour et des marges du navigateur, qui n'ont rien
  à voir avec les jetons du projet : ils sont retirés, et l'intitulé porte seul
  le regroupement. Un contour reviendra si un groupe doit se détacher
  visuellement, et ce sera une décision, pas un reste.
*/
.fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.fieldset__legend {
  /* Le remplissage latéral par défaut d'une legend la décale de deux pixels. */
  padding: 0;
  font-weight: var(--weight-semibold);
}

.fieldset__required {
  color: var(--color-text-muted);
  font-weight: var(--weight-normal);
  font-size: var(--text-sm);
}

.fieldset__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
