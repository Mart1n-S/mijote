<script setup lang="ts">
import { MAX_PEOPLE, MIN_PEOPLE, PEOPLE_ESTIMATED_ABOVE } from '@mijote/shared';
import { computed } from 'vue';

import type { DraftErrors, ProfileDraft } from '../../household/draft';
import BaseField from '../base/BaseField.vue';

/*
  Le foyer lui-même : son nom, et combien de personnes y mangent.

  Les deux champs vivent dans un composant plutôt que dans chaque écran : le
  profil les montre tous, le premier lancement les montre une étape à la fois,
  et il n'y a aucune raison d'écrire le même formulaire deux fois.
*/

const draft = defineModel<ProfileDraft>({ required: true });

const props = withDefaults(defineProps<{ errors?: DraftErrors }>(), { errors: () => ({}) });

/**
 * Au-delà de six personnes, les quantités seront estimées.
 *
 * Les paliers de portions des recettes vont de 1 à 6 et ne sont pas
 * proportionnels : au-delà, les quantités s'obtiennent en combinant des
 * paliers réels (8 = 4 + 4) et s'affichent comme estimées. Rien ne calcule
 * cela avant le lot 2 : l'avertissement est là pour que l'attente soit posée au
 * moment du choix, et non découverte au premier planning (ADR 0016).
 */
const estimated = computed(() => {
  const count = Number(draft.value.peopleCount.trim());

  return Number.isInteger(count) && count > PEOPLE_ESTIMATED_ABOVE;
});
</script>

<template>
  <div class="fields">
    <BaseField
      v-model="draft.name"
      label="Nom du foyer"
      name="name"
      autocomplete="off"
      required
      :error="props.errors.name"
    />

    <!-- Du texte avec un clavier numérique, et non `type="number"` : Vue
         convertit d'office la valeur d'un champ de ce type en nombre, ce qui
         remplacerait la chaîne que le brouillon porte. `inputmode` donne le
         clavier sans ce piège, et les bornes sont dites par l'aide puis
         appliquées par le schéma partagé. -->
    <BaseField
      v-model="draft.peopleCount"
      label="Nombre de personnes"
      name="peopleCount"
      inputmode="numeric"
      autocomplete="off"
      :help="`De ${String(MIN_PEOPLE)} à ${String(MAX_PEOPLE)} personnes.`"
      :error="props.errors.peopleCount"
    />

    <!-- Annoncé poliment : le message arrive pendant la saisie, et il
         n'interrompt pas la lecture en cours. -->
    <p v-if="estimated" class="fields__note" role="status">
      Au-delà de {{ PEOPLE_ESTIMATED_ABOVE }} personnes, les quantités des recettes seront estimées
      en combinant des portions réelles.
    </p>
  </div>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.fields__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
