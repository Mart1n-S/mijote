<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';

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
  FOOD_KEYS,
  fromProblem,
  HOUSEHOLD_KEYS,
  PLANNING_KEYS,
  toDraft,
  type DraftErrors,
  type PatchKey,
  type ProfileDraft,
} from '../household/draft';
import { markOnboardingDone } from '../household/onboarding';

/*
  Le premier lancement, en étapes.

  Un seul écran, et des étapes dans la page, comme la connexion à deux étapes :
  une route par étape multiplierait les adresses et les passages axe-core pour
  un parcours qui ne se partage pas (ADR 0016).

  **Chaque étape n'envoie que ses propres champs.** C'est ce que permet le PATCH
  partiel, et ce qui évite à l'étape du budget de faire voyager des allergènes
  qu'elle n'affiche pas.

  Toute étape peut être passée, et « Terminer plus tard » libère le parcours
  depuis n'importe laquelle : sans cela, quelqu'un qui ne veut rien remplir
  reverrait cet écran à chaque connexion.
*/

const STEPS = [
  {
    title: 'Votre foyer',
    hint: 'Pour adapter les quantités des recettes.',
    keys: HOUSEHOLD_KEYS,
  },
  {
    title: 'Ce que vous ne mangez pas',
    hint: 'Pour écarter les recettes qui ne vous conviennent pas. Tout est facultatif.',
    keys: FOOD_KEYS,
  },
  {
    title: 'Ce qui guide vos plannings',
    hint: 'Pour choisir entre économiser, manger équilibré ou aller vite.',
    keys: PLANNING_KEYS,
  },
] as const;

const router = useRouter();

const draft = ref<ProfileDraft | undefined>(undefined);
const errors = ref<DraftErrors>({});
const formError = ref('');
const loading = ref(true);
const saving = ref(false);
const step = ref(0);

const LOAD_FAILURE = "Le profil n'a pas pu être chargé. Réessayez dans un instant.";
const SAVE_FAILURE = "Cette étape n'a pas pu être enregistrée. Réessayez dans un instant.";

const current = computed(() => STEPS[step.value] ?? STEPS[0]);
const isLast = computed(() => step.value === STEPS.length - 1);

/** Le bloc de l'étape, pour y amener le focus quand elle arrive. */
const stepBlock = useTemplateRef<HTMLElement>('stepBlock');

/**
 * Avance d'une étape, et le focus suit.
 *
 * Sans cela, le focus resterait sur le bouton cliqué, qui est **sous** les
 * nouveaux champs : au clavier il faudrait revenir en arrière pour les
 * trouver. C'est le même traitement que la seconde étape de la connexion.
 */
async function goToNextStep(): Promise<void> {
  step.value += 1;

  await nextTick();
  stepBlock.value?.querySelector('input')?.focus();
}

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

/** Entre dans l'application, le parcours étant derrière nous. */
async function leave(): Promise<void> {
  markOnboardingDone();

  await router.replace({ path: '/' });
}

/**
 * Envoie un corps, et dit si c'est passé.
 *
 * Les refus de champ de l'API reviennent sous leur champ, et non résumés en un
 * message de formulaire.
 */
async function send(keys: readonly PatchKey[], finish: boolean): Promise<boolean> {
  const value = draft.value;

  if (value === undefined) {
    return false;
  }

  errors.value = {};
  formError.value = '';

  const built = buildPatch(value, keys);

  if (!built.ok) {
    errors.value = Object.fromEntries(built.issues.map((issue) => [issue.key, issue.message]));

    return false;
  }

  const refused = checkPatch(built.patch);

  if (Object.keys(refused).length > 0) {
    errors.value = refused;

    return false;
  }

  saving.value = true;

  try {
    draft.value = toDraft(
      await updateHouseholdProfile(finish ? { ...built.patch, onboardingDone: true } : built.patch),
    );

    return true;
  } catch (error) {
    const byField = error instanceof ApiError ? fromProblem(error.problem?.errors) : {};

    if (Object.keys(byField).length > 0) {
      errors.value = byField;
    } else {
      formError.value = messageOf(error, SAVE_FAILURE);
    }

    return false;
  } finally {
    saving.value = false;
  }
}

/** Enregistre l'étape, puis avance ou termine. */
async function submit(): Promise<void> {
  if (!(await send(current.value.keys, isLast.value))) {
    return;
  }

  if (isLast.value) {
    await leave();

    return;
  }

  await goToNextStep();
}

/** Passe l'étape sans rien écrire, et termine si c'était la dernière. */
async function skip(): Promise<void> {
  errors.value = {};
  formError.value = '';

  if (isLast.value) {
    await finishLater();

    return;
  }

  await goToNextStep();
}

/** Abandonne le parcours : la date est posée, et il ne reviendra pas. */
async function finishLater(): Promise<void> {
  errors.value = {};
  formError.value = '';
  saving.value = true;

  try {
    await updateHouseholdProfile({ onboardingDone: true });
    await leave();
  } catch (error) {
    formError.value = messageOf(error, SAVE_FAILURE);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <h1>Bienvenue sur Mijote</h1>

  <BaseAlert variant="error" :message="formError" />

  <p v-if="loading">Chargement de votre profil.</p>

  <template v-else-if="draft !== undefined">
    <p class="onboarding__progress">
      Étape {{ step + 1 }} sur {{ STEPS.length }}. Tout se modifie plus tard dans votre profil.
    </p>

    <form class="onboarding" novalidate @submit.prevent="submit">
      <h2>{{ current.title }}</h2>
      <p class="onboarding__hint">{{ current.hint }}</p>

      <div ref="stepBlock">
        <HouseholdIdentityFields v-if="step === 0" v-model="draft" :errors="errors" />
        <HouseholdFoodFields v-else-if="step === 1" v-model="draft" :errors="errors" />
        <HouseholdPlanningFields v-else v-model="draft" :errors="errors" />
      </div>

      <div class="onboarding__actions">
        <BaseButton type="submit" :loading="saving" loading-label="enregistrement en cours">
          {{ isLast ? 'Terminer' : 'Enregistrer et continuer' }}
        </BaseButton>

        <BaseButton variant="secondary" @click="skip">Passer cette étape</BaseButton>
      </div>

      <!-- Disponible à chaque étape : quelqu'un qui ne veut rien remplir doit
           pouvoir en sortir pour de bon. -->
      <BaseButton variant="secondary" @click="finishLater">Terminer plus tard</BaseButton>
    </form>
  </template>
</template>

<style scoped>
.onboarding {
  display: flex;
  flex-direction: column;
  max-width: 34rem;
  margin-top: var(--space-5);
  gap: var(--space-5);
}

.onboarding__progress {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
}

.onboarding__hint {
  margin: 0;
  color: var(--color-text-muted);
}

.onboarding__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
