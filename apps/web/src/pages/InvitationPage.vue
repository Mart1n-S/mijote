<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '@mijote/shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { ApiError } from '../api/client';
import { previewInvitation } from '../api/invitations';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';
import { signUpWithInvitation } from '../session/session';

/*
  L'inscription par invitation : la seule porte d'entrée de la V1.

  Le jeton arrive dans le **fragment** de l'adresse, après le `#`. Trois raisons
  à cela, et elles tiennent toutes à ce qu'un fragment n'est jamais envoyé au
  serveur : il ne part pas dans l'en-tête `Referer` d'une page tierce, il ne
  paraît pas dans les journaux du mandataire, et il ne se retrouve pas dans les
  statistiques d'un serveur frontal (ADR 0013).

  La page le lit, l'échange aussitôt contre un POST, puis l'efface de la barre
  d'adresse : ce qui reste dans l'historique du navigateur ne vaut plus rien.
*/

const router = useRouter();

/** Le jeton, lu une fois au montage et gardé en mémoire seulement. */
const token = ref('');

const email = ref('');
const password = ref('');
const passwordError = ref('');
const formError = ref('');
const loading = ref(true);
const submitting = ref(false);

const SHORT_PASSWORD = `Choisissez un mot de passe de ${String(MIN_PASSWORD_LENGTH)} caractères au moins.`;

const NO_TOKEN =
  "Ce lien est incomplet. Ouvrez-le depuis l'e-mail d'invitation, sans le recopier à la main.";

const UNEXPECTED_FAILURE = "L'inscription n'a pas pu aboutir. Réessayez dans un instant.";

function messageOf(error: unknown): string {
  // Le message vient de l'API, qui l'écrit en français et le fait exprès
  // identique pour un lien expiré, révoqué, déjà utilisé ou inconnu.
  return error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
}

onMounted(async () => {
  const found = window.location.hash.replace(/^#/, '');

  /*
    Effacé de la barre d'adresse avant tout appel : une invitation que l'on
    recharge ou que l'on garde en favori ne doit pas la laisser traîner.
    `replaceState` et non une navigation : rien d'autre ne change.
  */
  if (found !== '') {
    window.history.replaceState(null, '', window.location.pathname);
  }

  token.value = found;

  if (found === '') {
    formError.value = NO_TOKEN;
    loading.value = false;

    return;
  }

  try {
    email.value = (await previewInvitation(found)).email;
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    loading.value = false;
  }
});

async function submit(): Promise<void> {
  passwordError.value = '';
  formError.value = '';

  if (password.value.length < MIN_PASSWORD_LENGTH) {
    passwordError.value = SHORT_PASSWORD;

    return;
  }

  submitting.value = true;

  try {
    await signUpWithInvitation(token.value, password.value);
    // La session est ouverte : on entre dans l'application, et cette page n'a
    // pas à rester dans l'historique.
    await router.replace({ path: '/' });
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Créer votre compte</h1>

  <!-- La région aria-live est montée avec la page, avant tout message : sinon
       l'arrivée du message ne serait pas annoncée (voir BaseAlert). -->
  <BaseAlert variant="error" :message="formError" />

  <p v-if="loading">Vérification de votre invitation.</p>

  <form v-else-if="email !== ''" class="invitation" novalidate @submit.prevent="submit">
    <p class="invitation__email">
      Invitation pour <strong>{{ email }}</strong>
    </p>

    <!-- L'adresse est affichée, pas saisie : elle vient de l'invitation, et la
         changer ferait de ce formulaire une inscription libre. Pas de champ
         caché non plus, le serveur la relisant du jeton. -->
    <BaseField
      v-model="password"
      label="Mot de passe"
      type="password"
      name="password"
      autocomplete="new-password"
      :help="`${String(MIN_PASSWORD_LENGTH)} caractères au moins. Une phrase est plus sûre qu'un mot compliqué.`"
      required
      :error="passwordError"
    />

    <BaseButton type="submit" :loading="submitting" loading-label="création en cours">
      Créer mon compte
    </BaseButton>
  </form>

  <!-- Le lien ne vaut plus rien : il n'y a pas de formulaire à montrer, et rien
       à réessayer ici. La seule issue est une nouvelle invitation. -->
  <p v-else>
    Demandez une nouvelle invitation à la personne qui administre Mijote, puis ouvrez le lien du
    nouvel e-mail.
  </p>
</template>

<style scoped>
.invitation {
  display: flex;
  flex-direction: column;
  /* Comme la connexion : une colonne étroite se parcourt mieux. */
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.invitation__email {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
