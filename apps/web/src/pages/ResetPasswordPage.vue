<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '@mijote/shared';
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { ApiError } from '../api/client';
import { resetPassword } from '../api/password';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';
import { reloadSession } from '../session/session';

/*
  Le choix du nouveau mot de passe.

  Le jeton arrive dans le **fragment** de l'adresse, après le `#`, pour la même
  raison que celui d'une invitation : un fragment n'est jamais envoyé au
  serveur, donc il ne part pas dans l'en-tête `Referer`, il ne paraît pas dans
  les journaux du mandataire, et il ne se retrouve pas dans les statistiques
  d'un serveur frontal (ADR 0014).

  La page le lit, l'efface aussitôt de la barre d'adresse, puis l'échange contre
  un POST. **Aucune session n'est ouverte au bout** : on vient de fermer toutes
  celles du compte, et rouvrir aussitôt celle du porteur du lien affaiblirait ce
  geste. L'écran renvoie donc vers la connexion.
*/

/** Le jeton, lu une fois au montage et gardé en mémoire seulement. */
const token = ref('');

const password = ref('');
const passwordError = ref('');
const formError = ref('');
const submitting = ref(false);
const done = ref(false);

const SHORT_PASSWORD = `Choisissez un mot de passe de ${String(MIN_PASSWORD_LENGTH)} caractères au moins.`;

const NO_TOKEN =
  "Ce lien est incomplet. Ouvrez-le depuis l'e-mail reçu, sans le recopier à la main.";

const UNEXPECTED_FAILURE = "La réinitialisation n'a pas pu aboutir. Réessayez dans un instant.";

function messageOf(error: unknown): string {
  /*
    Le message vient de l'API, qui l'écrit en français et le fait exprès
    identique pour un lien inconnu, expiré, révoqué ou déjà utilisé : cet écran
    ne doit rien y ajouter qui distinguerait les cas.
  */
  return error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
}

onMounted(() => {
  const found = window.location.hash.replace(/^#/, '');

  /*
    Effacé de la barre d'adresse avant tout appel : un lien qu'on recharge ou
    qu'on garde en favori ne doit pas le laisser traîner. `replaceState` et non
    une navigation : rien d'autre ne change.
  */
  if (found !== '') {
    window.history.replaceState(null, '', window.location.pathname);
  }

  token.value = found;

  if (found === '') {
    formError.value = NO_TOKEN;
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
    await resetPassword(token.value, password.value);
    done.value = true;

    /*
      Toutes les sessions du compte viennent d'être fermées, celle de ce
      navigateur comprise s'il en avait une : on redemande au serveur qui est
      connecté, et il répond « personne ». Sans cela, l'en-tête continuerait
      d'afficher un compte dont la session est morte.
    */
    await reloadSession();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Nouveau mot de passe</h1>

  <!-- La région aria-live est montée avec la page, avant tout message : sinon
       l'arrivée du message ne serait pas annoncée (voir BaseAlert). -->
  <BaseAlert variant="error" :message="formError" />

  <template v-if="done">
    <p class="reset__hint">
      Votre mot de passe est à jour, et toutes les sessions ouvertes ont été fermées. Connectez-vous
      avec votre nouveau mot de passe.
    </p>

    <p>
      <RouterLink to="/connexion">Se connecter</RouterLink>
    </p>
  </template>

  <template v-else>
    <!-- Sans jeton, il n'y a pas de formulaire à montrer : la seule issue est
         un nouveau lien. -->
    <form v-if="token !== ''" class="reset" novalidate @submit.prevent="submit">
      <BaseField
        v-model="password"
        label="Nouveau mot de passe"
        type="password"
        name="password"
        autocomplete="new-password"
        :help="`${String(MIN_PASSWORD_LENGTH)} caractères au moins. Une phrase est plus sûre qu'un mot compliqué.`"
        required
        :error="passwordError"
      />

      <BaseButton type="submit" :loading="submitting" loading-label="enregistrement en cours">
        Enregistrer
      </BaseButton>
    </form>

    <!-- Toujours là, et pas seulement sans jeton : un lien expiré, révoqué ou
         déjà utilisé ne se rattrape pas ici, il se redemande. -->
    <p class="reset__again">
      <RouterLink to="/mot-de-passe-oublie">Demander un nouveau lien</RouterLink>
    </p>
  </template>
</template>

<style scoped>
.reset {
  display: flex;
  flex-direction: column;
  /* Comme la connexion : une colonne étroite se parcourt mieux. */
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.reset__hint {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
}

.reset__again {
  margin-top: var(--space-4);
}
</style>
