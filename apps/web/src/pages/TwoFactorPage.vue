<script setup lang="ts">
import {
  backupCodesResponseSchema,
  twoFactorSetupResponseSchema,
  type TwoFactorSetupResponse,
} from '@mijote/shared';
import { computed, ref } from 'vue';
import { renderSVG } from 'uqr';

import { ApiError, apiRequest } from '../api/client';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';
import { ensureSessionLoaded, isTwoFactorActive } from '../session/session';

/*
  L'activation de la double authentification, en trois temps : le mot de passe,
  l'inscription de l'application, puis les codes de secours montrés une seule
  fois.

  Le mot de passe est demandé une fois et gardé en mémoire le temps du
  parcours : les deux appels l'exigent (ADR 0012), et le redemander à la
  seconde étape n'ajouterait rien qu'une gêne.
*/
const step = ref<'password' | 'enroll' | 'codes'>('password');

const password = ref('');
const code = ref('');
const passwordError = ref('');
const codeError = ref('');
const formError = ref('');
const submitting = ref(false);
const copied = ref(false);

const enrollment = ref<TwoFactorSetupResponse | undefined>(undefined);
const backupCodes = ref<string[]>([]);

const MISSING_PASSWORD = 'Indiquez votre mot de passe.';
const MISSING_CODE = 'Indiquez le code affiché par votre application.';
const UNEXPECTED_FAILURE = "L'opération n'a pas pu aboutir. Réessayez dans un instant.";

/**
 * Le QR code, dessiné ici et servi en image.
 *
 * Rien ne part vers un service distant : cette URI **contient le secret**. Et
 * une image de données plutôt qu'un SVG injecté dans la page : un `img` ne peut
 * rien exécuter, là où `v-html` demanderait de faire confiance à une chaîne.
 */
const qrCode = computed(() => {
  const uri = enrollment.value?.uri;

  return uri === undefined
    ? undefined
    : `data:image/svg+xml,${encodeURIComponent(renderSVG(uri, { border: 1 }))}`;
});

/** La clé en groupes de quatre : c'est ainsi qu'on la recopie sans se perdre. */
const readableKey = computed(() => (enrollment.value?.key.match(/.{1,4}/g) ?? []).join(' '));

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : UNEXPECTED_FAILURE;
}

async function startEnrollment(): Promise<void> {
  passwordError.value = '';
  formError.value = '';

  if (password.value === '') {
    passwordError.value = MISSING_PASSWORD;

    return;
  }

  submitting.value = true;

  try {
    const response = await apiRequest('/auth/two-factor/setup', {
      method: 'POST',
      body: JSON.stringify({ password: password.value }),
    });

    enrollment.value = twoFactorSetupResponseSchema.parse(await response.json());
    step.value = 'enroll';
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}

async function confirmEnrollment(): Promise<void> {
  codeError.value = '';
  formError.value = '';

  if (code.value.trim() === '') {
    codeError.value = MISSING_CODE;

    return;
  }

  submitting.value = true;

  try {
    const response = await apiRequest('/auth/two-factor/activate', {
      method: 'POST',
      body: JSON.stringify({ password: password.value, code: code.value }),
    });

    backupCodes.value = backupCodesResponseSchema.parse(await response.json()).codes;
    /*
      Le secret et le mot de passe n'ont plus rien à faire en mémoire : la page
      ne les redemandera pas, et un onglet laissé ouvert ne les garde pas.
    */
    enrollment.value = undefined;
    password.value = '';
    code.value = '';
    step.value = 'codes';

    // L'état du compte a changé : la prochaine lecture doit venir du serveur.
    await refreshSession();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    submitting.value = false;
  }
}

async function refreshSession(): Promise<void> {
  try {
    await ensureSessionLoaded();
  } catch (error) {
    // L'affichage des codes de secours compte plus que cette mise à jour : ils
    // ne seront plus montrés.
    console.error('relecture de la session impossible', error);
  }
}

async function copyCodes(): Promise<void> {
  try {
    await navigator.clipboard.writeText(backupCodes.value.join('\n'));
    copied.value = true;
  } catch (error) {
    /*
      Le presse-papiers peut être refusé par le navigateur. Les codes sont déjà
      à l'écran : on le dit, et on n'en fait pas une erreur.
    */
    copied.value = false;
    console.error('copie impossible', error);
  }
}
</script>

<template>
  <h1>Double authentification</h1>

  <BaseAlert variant="error" :message="formError" />

  <p v-if="isTwoFactorActive && step !== 'codes'" class="two-factor__state">
    La double authentification est active sur ce compte.
  </p>

  <form
    v-else-if="step === 'password'"
    class="two-factor__form"
    novalidate
    @submit.prevent="startEnrollment"
  >
    <p class="two-factor__hint">
      Elle protège l'espace d'administration. Confirmez votre mot de passe pour inscrire une
      application d'authentification.
    </p>

    <BaseField
      v-model="password"
      label="Mot de passe"
      type="password"
      name="password"
      autocomplete="current-password"
      required
      :error="passwordError"
    />

    <BaseButton type="submit" :loading="submitting" loading-label="vérification en cours">
      Continuer
    </BaseButton>
  </form>

  <form
    v-else-if="step === 'enroll'"
    class="two-factor__form"
    novalidate
    @submit.prevent="confirmEnrollment"
  >
    <h2>Inscrivez votre application</h2>

    <!-- Le QR code n'apporte rien de plus que la clé affichée juste en dessous,
         qui est lisible par un lecteur d'écran : il est donc décoratif, et son
         alternative est vide. -->
    <img
      v-if="qrCode !== undefined"
      class="two-factor__qr"
      :src="qrCode"
      alt=""
      width="200"
      height="200"
    />

    <p class="two-factor__hint">Scannez ce code, ou saisissez cette clé à la main :</p>

    <p class="two-factor__key">{{ readableKey }}</p>

    <BaseField
      v-model="code"
      label="Code affiché par l'application"
      name="code"
      inputmode="numeric"
      autocomplete="one-time-code"
      spellcheck="false"
      required
      :error="codeError"
    />

    <BaseButton type="submit" :loading="submitting" loading-label="activation en cours">
      Activer
    </BaseButton>
  </form>

  <div v-else class="two-factor__form">
    <h2>Vos codes de secours</h2>

    <p class="two-factor__hint">
      Ils remplacent l'application si vous perdez votre téléphone. Chacun ne sert qu'une fois, et
      ils ne seront plus affichés : notez-les maintenant.
    </p>

    <ul class="list-reset two-factor__codes">
      <li v-for="backup in backupCodes" :key="backup">{{ backup }}</li>
    </ul>

    <BaseButton variant="secondary" @click="copyCodes">Copier les codes</BaseButton>

    <!-- La confirmation est annoncée, et elle n'est pas une erreur. -->
    <BaseAlert variant="success" :message="copied ? 'Codes copiés dans le presse-papiers.' : ''" />
  </div>
</template>

<style scoped>
.two-factor__form {
  display: flex;
  flex-direction: column;
  max-width: 24rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.two-factor__hint,
.two-factor__state {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

/*
  Aucune couleur ici : le SVG porte son propre fond blanc et ses carrés noirs,
  et c'est ce contraste qui le rend lisible par un appareil photo. Il ne suit
  donc pas les jetons de surface, y compris en thème sombre, et il n'a pas
  besoin d'en écrire une seule en dur.
*/
.two-factor__qr {
  align-self: flex-start;
  border-radius: var(--radius-md);
}

/*
  La clé se lit caractère par caractère : une police à chasse fixe évite de
  confondre les groupes, et l'espacement les sépare sans tiret, qui se
  recopierait.
*/
.two-factor__key {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  letter-spacing: 0.08em;
  overflow-wrap: anywhere;
}

.two-factor__codes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  font-family: var(--font-mono);
  gap: var(--space-2);
}
</style>
