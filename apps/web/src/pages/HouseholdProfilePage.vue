<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { ApiError } from '../api/client';
import { fetchHouseholdProfile, updateHouseholdProfile } from '../api/household';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import HouseholdFoodFields from '../components/household/HouseholdFoodFields.vue';
import HouseholdIdentityFields from '../components/household/HouseholdIdentityFields.vue';
import HouseholdPlanningFields from '../components/household/HouseholdPlanningFields.vue';
import {
  buildPatch,
  checkPatch,
  fromProblem,
  PATCH_KEYS,
  toDraft,
  type DraftErrors,
  type ProfileDraft,
} from '../household/draft';

/*
  Le profil du foyer, en entier et modifiable.

  Le premier lancement montre les mêmes champs une étape à la fois : les trois
  groupes sont donc des composants, et cet écran les assemble.

  Aucune donnée de foyer n'est demandée par identifiant : le serveur sert celui
  de la session (ADR 0015).
*/

const draft = ref<ProfileDraft | undefined>(undefined);
const errors = ref<DraftErrors>({});
const formError = ref('');
const saved = ref(false);
const loading = ref(true);
const saving = ref(false);

const LOAD_FAILURE = "Le profil n'a pas pu être chargé. Réessayez dans un instant.";
const SAVE_FAILURE = "Les modifications n'ont pas pu être enregistrées. Réessayez dans un instant.";
const SAVED = 'Profil enregistré.';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.userMessage : fallback;
}

onMounted(async () => {
  try {
    draft.value = toDraft(await fetchHouseholdProfile());
  } catch (error) {
    formError.value = messageOf(error, LOAD_FAILURE);
  } finally {
    loading.value = false;
  }
});

async function submit(): Promise<void> {
  const current = draft.value;

  if (current === undefined) {
    return;
  }

  errors.value = {};
  formError.value = '';
  saved.value = false;

  const built = buildPatch(current, PATCH_KEYS);

  if (!built.ok) {
    errors.value = Object.fromEntries(built.issues.map((issue) => [issue.key, issue.message]));

    return;
  }

  // La même règle que celle du serveur, avant l'aller-retour.
  const refused = checkPatch(built.patch);

  if (Object.keys(refused).length > 0) {
    errors.value = refused;

    return;
  }

  saving.value = true;

  try {
    draft.value = toDraft(await updateHouseholdProfile(built.patch));
    saved.value = true;
  } catch (error) {
    /*
      Les refus de champ de l'API reviennent dans le problème RFC 9457 : ils
      sont remis sous leur champ, et non résumés en un message de formulaire.
    */
    const byField = error instanceof ApiError ? fromProblem(error.problem?.errors) : {};

    if (Object.keys(byField).length > 0) {
      errors.value = byField;
    } else {
      formError.value = messageOf(error, SAVE_FAILURE);
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <h1>Profil du foyer</h1>

  <!-- Deux régions aria-live, montées avec la page avant tout message : une
       région dont la variante change en même temps que le message changerait
       son `role` sous le lecteur d'écran (voir docs/design-system.md). -->
  <BaseAlert variant="error" :message="formError" />
  <BaseAlert variant="success" :message="saved ? SAVED : ''" />

  <p v-if="loading">Chargement du profil.</p>

  <form v-else-if="draft !== undefined" class="profile" novalidate @submit.prevent="submit">
    <HouseholdIdentityFields v-model="draft" :errors="errors" />
    <HouseholdFoodFields v-model="draft" :errors="errors" />
    <HouseholdPlanningFields v-model="draft" :errors="errors" />

    <BaseButton type="submit" :loading="saving" loading-label="enregistrement en cours">
      Enregistrer
    </BaseButton>
  </form>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  /* Plus large que les formulaires d'authentification : il y a trois groupes,
     dont deux listes de cases. */
  max-width: 34rem;
  margin-top: var(--space-5);
  gap: var(--space-6);
}
</style>
