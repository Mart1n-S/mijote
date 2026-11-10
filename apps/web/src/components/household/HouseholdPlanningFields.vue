<script setup lang="ts">
import { MAX_MEAL_MINUTES, MIN_MEAL_MINUTES } from '@mijote/shared';

import { goalOptions, varietyOptions } from '../../household/fields';
import type { DraftErrors, ProfileDraft } from '../../household/draft';
import BaseField from '../base/BaseField.vue';
import BaseRadioGroup from '../base/BaseRadioGroup.vue';

/*
  Ce qui guide le planning : l'objectif, le budget, le temps, et l'équilibre
  entre variété et réutilisation des ingrédients.

  Le budget se saisit en **euros entiers** et se stocke en centimes : un budget
  de courses mensuel n'a pas besoin de la précision du centime, et l'entier
  évite la dérive du flottant (ADR 0016). Son libellé dit sa période, comme la
  colonne et le champ de l'API.
*/

const draft = defineModel<ProfileDraft>({ required: true });

const props = withDefaults(defineProps<{ errors?: DraftErrors }>(), { errors: () => ({}) });
</script>

<template>
  <div class="fields">
    <BaseRadioGroup
      v-model="draft.goal"
      legend="Objectif"
      :options="goalOptions"
      help="Facultatif."
      :error="props.errors.goal"
    />

    <!-- Du texte avec un clavier numérique, et non `type="number"` : voir
         HouseholdIdentityFields, Vue convertirait la valeur en nombre. -->
    <BaseField
      v-model="draft.monthlyBudgetEuros"
      label="Budget mensuel, en euros"
      name="monthlyBudget"
      inputmode="numeric"
      autocomplete="off"
      help="Facultatif. Pour les courses d'un mois, en euros entiers."
      :error="props.errors.monthlyBudgetCents"
    />

    <BaseField
      v-model="draft.maxMealMinutes"
      label="Temps maximum par repas, en minutes"
      name="maxMealMinutes"
      inputmode="numeric"
      autocomplete="off"
      :help="`Facultatif, de ${String(MIN_MEAL_MINUTES)} à ${String(MAX_MEAL_MINUTES)} minutes.`"
      :error="props.errors.maxMealMinutes"
    />

    <BaseRadioGroup
      v-model="draft.varietyBalance"
      legend="Variété ou réutilisation des ingrédients"
      :options="varietyOptions"
      help="Réutiliser limite le nombre d'ingrédients achetés, et le gaspillage."
      :error="props.errors.varietyBalance"
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
