<script setup lang="ts">
import { MAX_EXCLUDED_INGREDIENTS } from '@mijote/shared';

import { allergenOptions, dietOptions } from '../../household/fields';
import type { DraftErrors, ProfileDraft } from '../../household/draft';
import BaseCheckbox from '../base/BaseCheckbox.vue';
import BaseField from '../base/BaseField.vue';
import BaseFieldset from '../base/BaseFieldset.vue';

/*
  Les contraintes alimentaires : régimes, allergènes, ingrédients exclus.

  Ce sont les seules **données de santé** du projet. Ce qui se décide ici se lit
  dans l'ADR 0016, et tient en trois phrases : rien n'est obligatoire, rien
  n'est stocké autour des codes choisis (ni gravité, ni date, ni commentaire),
  et rien n'entre dans un journal.

  La phrase qui dit à quoi ces réponses servent est portée par la `legend` du
  groupe, donc reliée aux cases par le HTML, et non posée à côté comme un texte
  que rien ne rattache.
*/

const draft = defineModel<ProfileDraft>({ required: true });

const props = withDefaults(defineProps<{ errors?: DraftErrors }>(), { errors: () => ({}) });

const PURPOSE = 'Facultatif. Sert à écarter les recettes qui ne vous conviennent pas.';

const ALLERGEN_PURPOSE = `${PURPOSE} Ces réponses ne sortent pas de l'application.`;

/** Coche ou décoche un code, en place : la liste est celle du brouillon. */
function toggle(list: string[], value: string, checked: boolean): void {
  const index = list.indexOf(value);

  if (checked && index === -1) {
    list.push(value);
  }

  if (!checked && index !== -1) {
    list.splice(index, 1);
  }
}
</script>

<template>
  <div class="fields">
    <BaseFieldset legend="Régimes" :help="PURPOSE" :error="props.errors.diets">
      <BaseCheckbox
        v-for="option in dietOptions"
        :key="option.value"
        :label="option.label"
        :model-value="draft.diets.includes(option.value)"
        @update:model-value="(checked: boolean) => toggle(draft.diets, option.value, checked)"
      />
    </BaseFieldset>

    <BaseFieldset
      legend="Allergies et intolérances"
      :help="ALLERGEN_PURPOSE"
      :error="props.errors.allergens"
    >
      <BaseCheckbox
        v-for="option in allergenOptions"
        :key="option.value"
        :label="option.label"
        :model-value="draft.allergens.includes(option.value)"
        @update:model-value="(checked: boolean) => toggle(draft.allergens, option.value, checked)"
      />
    </BaseFieldset>

    <BaseField
      v-model="draft.excludedIngredients"
      label="Ingrédients à éviter"
      name="excludedIngredients"
      autocomplete="off"
      :help="`Facultatif, séparés par des virgules, ${String(MAX_EXCLUDED_INGREDIENTS)} au plus. Par exemple : coriandre, abats.`"
      :error="props.errors.excludedIngredients"
    />
  </div>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
