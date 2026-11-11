<script setup lang="ts">
import { loginSchema } from '@mijote/shared';
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { ApiError } from '../api/client';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseCheckbox from '../components/base/BaseCheckbox.vue';
import BaseField from '../components/base/BaseField.vue';
import { logIn, submitTwoFactorCode } from '../session/session';
import { DELETED_QUERY, DELETED_VALUE, NEXT_QUERY, safeNextPath } from '../session/session-guard';

const route = useRoute();
const router = useRouter();

/*
  Deux étapes dans une page : le mot de passe, puis le code quand le compte a
  un second facteur. Entre les deux, aucune session n'est ouverte : l'attente
  vit côté serveur et son cookie la porte (ADR 0012).
*/
const step = ref<'password' | 'code'>('password');

/*
  Le compte vient-il d'être supprimé ? L'adresse le dit, et c'est voulu : un
  état de module serait perdu au rechargement, et la suppression est justement
  le moment où l'on peut vouloir vérifier que l'écran dit bien ce qu'il s'est
  passé (ADR 0017).
*/
const deleted = computed(() => route.query[DELETED_QUERY] === DELETED_VALUE);

const DELETED_NOTICE = 'Votre compte a été supprimé, avec son foyer et toutes ses données.';

const email = ref('');
const password = ref('');
const remember = ref(false);
const code = ref('');
const emailError = ref('');
const passwordError = ref('');
const codeError = ref('');
const formError = ref('');
const submitting = ref(false);

/** Le bloc de la seconde étape, pour y amener le focus quand elle arrive. */
const codeStep = useTemplateRef<HTMLElement>('codeStep');

/*
  Les messages sont écrits ici, en français, et non repris de zod : la locale
  française de zod est posée côté API, dans le pipe de validation, et ces
  phrases-là sont les seules que cet écran a besoin de dire. Le schéma partagé
  reste la règle, il n'est que sa formulation qui change.
*/
const INVALID_EMAIL = 'Indiquez une adresse e-mail valide.';
const MISSING_PASSWORD = 'Indiquez votre mot de passe.';
const MISSING_CODE = 'Indiquez le code de votre application, ou un code de secours.';

/** Le message montré quand la connexion échoue pour une raison inattendue. */
const UNEXPECTED_FAILURE = "La connexion n'a pas pu aboutir. Réessayez dans un instant.";

/** Là où on allait avant d'être renvoyé ici. */
async function goOn(): Promise<void> {
  /*
    replace et non push : la page de connexion n'a pas à rester dans
    l'historique, où le bouton Retour y ramènerait une fois connecté.
  */
  await router.replace({ path: safeNextPath(route.query[NEXT_QUERY]) });
}

/** Ce que dit une erreur d'API, ou une phrase de repli. */
function messageOf(error: unknown): string {
  /*
    Le message vient de l'API, qui l'écrit en français et le fait exprès
    identique pour une adresse inconnue et un mot de passe faux, comme pour un
    code faux et un code déjà consommé : cet écran ne doit rien y ajouter qui
    distinguerait les cas.
  */
  return error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
}

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
    if ((await logIn(parsed.data)) === 'two-factor') {
      step.value = 'code';

      // Le focus suit l'écran : sans cela, il resterait sur un bouton qui
      // n'est plus là.
      await nextTick();
      codeStep.value?.querySelector('input')?.focus();

      return;
    }

    await goOn();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}

/** Repart du mot de passe, l'attente du code ayant expiré ou été épuisée. */
function restart(): void {
  step.value = 'password';
  password.value = '';
  code.value = '';
  codeError.value = '';
  formError.value = '';
}

async function submitCode(): Promise<void> {
  codeError.value = '';
  formError.value = '';

  if (code.value.trim() === '') {
    codeError.value = MISSING_CODE;

    return;
  }

  submitting.value = true;

  try {
    await submitTwoFactorCode(code.value);
    await goOn();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <h1>Connexion</h1>

  <!-- La suppression renvoie ici : le message est dans la page et non dans le
       formulaire, parce qu'il ne parle pas de la connexion en cours. Il n'a pas
       de région aria-live : il est déjà là au chargement, donc rien ne change,
       et il se lit dans l'ordre du document. -->
  <p v-if="deleted" class="login__deleted">{{ DELETED_NOTICE }}</p>

  <form v-if="step === 'password'" class="login" novalidate @submit.prevent="submit">
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

    <!-- Sans ce lien, la réinitialisation ne serait atteignable qu'en tapant
         son adresse. Il n'est pas dans la seconde étape : à ce stade le mot de
         passe est déjà bon, et c'est un code qui manque. -->
    <p class="login__forgot">
      <RouterLink to="/mot-de-passe-oublie">Mot de passe oublié ?</RouterLink>
    </p>
  </form>

  <div v-else ref="codeStep">
    <form class="login" novalidate @submit.prevent="submitCode">
      <BaseAlert variant="error" :message="formError" />

      <h2>Code de vérification</h2>

      <p class="login__hint">
        Ouvrez votre application d'authentification et recopiez le code à six chiffres. Un code de
        secours fonctionne aussi, numéro compris.
      </p>

      <!-- Pas d'`inputmode="numeric"` ici, contrairement à l'écran
           d'activation : un code de secours est fait de lettres, et un clavier
           limité aux chiffres rendrait le chemin du téléphone perdu intapable
           sur mobile. -->
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
        Vérifier
      </BaseButton>

      <!-- L'attente expire au bout de cinq minutes, et meurt au cinquième essai
           raté : le message dit alors de recommencer, et ceci est le moyen de le
           faire. Sans lui, l'écran ne garderait qu'un bouton qui échoue. -->
      <BaseButton variant="secondary" @click="restart">Recommencer la connexion</BaseButton>
    </form>
  </div>
</template>

<style scoped>
.login__deleted {
  max-width: 24rem;
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.login {
  display: flex;
  flex-direction: column;
  /* Le formulaire ne s'étire pas sur un grand écran : une colonne de saisie
     large est plus difficile à parcourir qu'une colonne étroite. */
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.login__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.login__forgot {
  margin: 0;
}
</style>
