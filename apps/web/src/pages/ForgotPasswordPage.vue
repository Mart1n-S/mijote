<script setup lang="ts">
import { emailSchema } from '@mijote/shared';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { ApiError } from '../api/client';
import { requestPasswordReset } from '../api/password';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';

/*
  La demande de réinitialisation.

  Un seul message en retour, et il ne dit pas si l'adresse a un compte : c'est
  la contrepartie à l'écran de ce que le serveur garantit par ailleurs, même
  réponse, même statut et même temps dans les deux cas (ADR 0014).
*/

const email = ref('');
const emailError = ref('');
const formError = ref('');
const submitting = ref(false);
const sent = ref(false);

const INVALID_EMAIL = 'Indiquez une adresse e-mail valide.';

/**
 * Le seul message de retour, et il est volontairement identique dans tous les
 * cas : il parle de ce qui a été fait, pas de ce qui existe.
 */
const SENT =
  'Si un compte existe pour cette adresse, un e-mail vient de partir. Pensez à regarder vos indésirables.';

const UNEXPECTED_FAILURE = "La demande n'a pas pu aboutir. Réessayez dans un instant.";

/** Ce que la région annonce : l'échec s'il y en a un, le retour sinon. */
const announced = computed(() =>
  formError.value === '' ? (sent.value ? SENT : '') : formError.value,
);

function messageOf(error: unknown): string {
  // Le message vient de l'API, qui l'écrit en français. Le seul qu'elle rende
  // ici est celui de la limitation, qui ne dit rien d'un compte.
  return error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
}

async function submit(): Promise<void> {
  emailError.value = '';
  formError.value = '';

  const parsed = emailSchema.safeParse(email.value);

  if (!parsed.success) {
    emailError.value = INVALID_EMAIL;

    return;
  }

  submitting.value = true;

  try {
    await requestPasswordReset(parsed.data);
    sent.value = true;
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Mot de passe oublié</h1>

  <!-- Une seule région aria-live, montée avec la page avant tout message :
       sinon l'arrivée du message ne serait pas annoncée (voir BaseAlert). Les
       deux cas ne coexistent jamais, donc deux régions n'auraient rien
       ajouté. -->
  <BaseAlert :variant="formError === '' ? 'success' : 'error'" :message="announced" />

  <template v-if="sent">
    <p class="forgot__hint">
      Le lien ne sert qu'une fois, et il expire dans une heure. Sans e-mail au bout de quelques
      minutes, redemandez-en un.
    </p>

    <p>
      <RouterLink to="/connexion">Retour à la connexion</RouterLink>
    </p>
  </template>

  <form v-else class="forgot" novalidate @submit.prevent="submit">
    <p class="forgot__hint">
      Indiquez l'adresse de votre compte. Vous recevrez un lien pour choisir un nouveau mot de
      passe.
    </p>

    <BaseField
      v-model="email"
      label="Adresse e-mail"
      type="email"
      name="email"
      autocomplete="username"
      required
      :error="emailError"
    />

    <BaseButton type="submit" :loading="submitting" loading-label="envoi en cours">
      Envoyer le lien
    </BaseButton>

    <p>
      <RouterLink to="/connexion">Retour à la connexion</RouterLink>
    </p>
  </form>
</template>

<style scoped>
.forgot {
  display: flex;
  flex-direction: column;
  /* Comme la connexion : une colonne étroite se parcourt mieux. */
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.forgot__hint {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
}
</style>
