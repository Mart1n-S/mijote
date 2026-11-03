<script setup lang="ts">
import { loginSchema } from '@mijote/shared';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/client';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseCheckbox from '../components/base/BaseCheckbox.vue';
import BaseField from '../components/base/BaseField.vue';
import { logIn } from '../session/session';
import { NEXT_QUERY, safeNextPath } from '../session/session-guard';

const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const remember = ref(false);
const emailError = ref('');
const passwordError = ref('');
const formError = ref('');
const submitting = ref(false);

/*
  Les messages sont écrits ici, en français, et non repris de zod : la locale
  française de zod est posée côté API, dans le pipe de validation, et ces deux
  phrases-là sont les seules que cet écran a besoin de dire. Le schéma partagé
  reste la règle, il n'est que sa formulation qui change.
*/
const INVALID_EMAIL = 'Indiquez une adresse e-mail valide.';
const MISSING_PASSWORD = 'Indiquez votre mot de passe.';

/** Le message montré quand la connexion échoue pour une raison inattendue. */
const UNEXPECTED_FAILURE = "La connexion n'a pas pu aboutir. Réessayez dans un instant.";

async function submit(): Promise<void> {
  emailError.value = '';
  passwordError.value = '';
  formError.value = '';

  const parsed = loginSchema.safeParse({
    email: email.value,
    password: password.value,
    remember: remember.value,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'email') {
        emailError.value = INVALID_EMAIL;
      }

      if (issue.path[0] === 'password') {
        passwordError.value = MISSING_PASSWORD;
      }
    }

    return;
  }

  submitting.value = true;

  try {
    await logIn(parsed.data);
    /*
      replace et non push : la page de connexion n'a pas à rester dans
      l'historique, où le bouton Retour y ramènerait une fois connecté.
    */
    await router.replace({ path: safeNextPath(route.query[NEXT_QUERY]) });
  } catch (error) {
    /*
      Le message vient de l'API, qui l'écrit en français et le fait exprès
      identique pour une adresse inconnue et un mot de passe faux : cet écran ne
      doit donc rien y ajouter qui distinguerait les deux cas.
    */
    formError.value = error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Connexion</h1>

  <form class="login" novalidate @submit.prevent="submit">
    <!-- L'erreur du formulaire vit dans le formulaire, et non dans la page :
         c'est de lui qu'elle parle, et le bandeau d'état du service a déjà sa
         propre région dans le gabarit.

         La région aria-live est montée avec la page, avant tout message : sinon
         l'arrivée du message ne serait pas annoncée (voir BaseAlert). -->
    <BaseAlert variant="error" :message="formError" />
    <BaseField
      v-model="email"
      label="Adresse e-mail"
      type="email"
      name="email"
      autocomplete="username"
      required
      :error="emailError"
    />

    <BaseField
      v-model="password"
      label="Mot de passe"
      type="password"
      name="password"
      autocomplete="current-password"
      required
      :error="passwordError"
    />

    <BaseCheckbox
      v-model="remember"
      label="Se souvenir de moi"
      help="Sur cet appareil, pendant 30 jours. À éviter sur un ordinateur partagé."
    />

    <BaseButton type="submit" :loading="submitting" loading-label="connexion en cours">
      Se connecter
    </BaseButton>
  </form>
</template>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  /* Le formulaire ne s'étire pas sur un grand écran : une colonne de saisie
     large est plus difficile à parcourir qu'une colonne étroite. */
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}
</style>
