<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/client';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';
import { unlockAdmin } from '../session/session';
import { NEXT_QUERY, safeNextPath } from '../session/session-guard';

/*
  Le déverrouillage de l'administration.

  Une session reprise par le cookie de mémorisation vaut pour l'application,
  pas pour l'administration : il faut un code pour y entrer (ADR 0012). C'est
  l'écran de ce passage, et la garde de navigation y conduit.
*/

const route = useRoute();
const router = useRouter();

const code = ref('');
const codeError = ref('');
const formError = ref('');
const submitting = ref(false);

const MISSING_CODE = 'Indiquez le code de votre application, ou un code de secours.';

const UNEXPECTED_FAILURE = "Le déverrouillage n'a pas pu aboutir. Réessayez dans un instant.";

async function submit(): Promise<void> {
  codeError.value = '';
  formError.value = '';

  if (code.value.trim() === '') {
    codeError.value = MISSING_CODE;

    return;
  }

  submitting.value = true;

  try {
    await unlockAdmin(code.value);
    /*
      replace et non push : une fois déverrouillé, cet écran n'a plus de raison
      d'être dans l'historique, où le bouton Retour y ramènerait.
    */
    await router.replace({ path: safeNextPath(route.query[NEXT_QUERY]) });
  } catch (error) {
    // Le message vient de l'API, identique pour un code faux, déjà consommé ou
    // hors plage.
    formError.value = error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Déverrouiller l'administration</h1>

  <form class="unlock" novalidate @submit.prevent="submit">
    <BaseAlert variant="error" :message="formError" />

    <p class="unlock__hint">
      Cette session a été rouverte depuis cet appareil. Recopiez le code de votre application
      d'authentification pour accéder à l'administration. Un code de secours fonctionne aussi,
      numéro compris.
    </p>

    <!-- Pas d'inputmode numérique : un code de secours est fait de lettres, et
         un clavier limité aux chiffres le rendrait intapable sur mobile. -->
    <BaseField
      v-model="code"
      label="Code"
      name="code"
      autocomplete="one-time-code"
      autocapitalize="characters"
      spellcheck="false"
      required
      :error="codeError"
    />

    <BaseButton type="submit" :loading="submitting" loading-label="vérification en cours">
      Déverrouiller
    </BaseButton>
  </form>
</template>

<style scoped>
.unlock {
  display: flex;
  flex-direction: column;
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.unlock__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
