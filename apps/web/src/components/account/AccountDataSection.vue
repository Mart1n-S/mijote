<script setup lang="ts">
import { LAST_ADMIN_REFUSAL } from '@mijote/shared';
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { saveFile } from '../../account/download';
import { ApiError } from '../../api/client';
import { deleteAccount, fetchAccountExport, fetchDeletionBlocked } from '../../api/privacy';
import { forgetDeletedAccount, isTwoFactorActive } from '../../session/session';
import { DELETED_QUERY, DELETED_VALUE, LOGIN_ROUTE } from '../../session/session-guard';
import BaseAlert from '../base/BaseAlert.vue';
import BaseButton from '../base/BaseButton.vue';
import BaseCheckbox from '../base/BaseCheckbox.vue';
import BaseDialog from '../base/BaseDialog.vue';
import BaseField from '../base/BaseField.vue';

/*
  Les deux droits du RGPD, à l'écran : récupérer ses données, et supprimer son
  compte.

  Un composant et non une page : il vit sous le profil du foyer, parce que
  l'export doit être proposé au-dessus du bouton de suppression, sur le même
  écran (ADR 0017). Le profil est déjà la page des données du foyer, et une page
  « mon compte » de plus n'aurait rien d'autre à montrer.
*/

const router = useRouter();

/** L'identifiant du formulaire du dialogue, repris par son bouton d'envoi. */
const FORM_ID = 'delete-account-form';

const exporting = ref(false);
const exported = ref(false);
const exportError = ref('');

/** La suppression est-elle fermée à ce compte ? C'est le serveur qui le dit. */
const blocked = ref(false);

const dialogOpen = ref(false);
const password = ref('');
const code = ref('');
const confirmed = ref(false);
const passwordError = ref('');
const codeError = ref('');
const confirmedError = ref('');
const deleteError = ref('');
const deleting = ref(false);

/*
  Le dialogue se vide à la fermeture : le mot de passe et le code n'ont pas à
  vivre dans la page une fois le dialogue parti, et la case à cocher est la
  friction voulue (ADR 0017), donc elle doit redemander à chaque ouverture.
*/
watch(dialogOpen, (open) => {
  if (open) {
    return;
  }

  password.value = '';
  code.value = '';
  confirmed.value = false;
  passwordError.value = '';
  codeError.value = '';
  confirmedError.value = '';
  deleteError.value = '';
});

const EXPORTED = 'Fichier téléchargé.';
const EXPORT_FAILURE = "L'export n'a pas pu être téléchargé. Réessayez dans un instant.";
const DELETE_FAILURE = "La suppression n'a pas pu aboutir. Réessayez dans un instant.";
const MISSING_CONFIRMATION = 'Cochez la case pour confirmer la suppression.';
const MISSING_PASSWORD = 'Indiquez votre mot de passe.';
const MISSING_CODE = 'Indiquez le code de votre application, ou un code de secours.';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.userMessage : fallback;
}

/*
  L'état est demandé pour tout le monde, et non seulement pour un
  administrateur : c'est le serveur qui sait qui peut être le dernier
  administrateur, et l'écran le lui demande plutôt que de recopier sa règle. Le
  jour où elle change, par exemple avec plusieurs comptes par foyer, l'écran
  suit sans être retouché. Le serveur court-circuite déjà pour un compte
  ordinaire, sans interroger la base.
*/
onMounted(async () => {
  try {
    blocked.value = await fetchDeletionBlocked();
  } catch (error) {
    /*
      L'état n'a pas pu être lu : le bouton reste donc actif, et c'est le bon
      défaut. Ce bouton n'est pas ce qui protège le compte, le serveur refusant
      de son côté ; le désactiver sur une panne de lecture empêcherait une
      suppression légitime pour rien.
    */
    console.error('état de la suppression illisible', error);
  }
});

/** Télécharge l'export, et le fait enregistrer par le navigateur. */
async function download(): Promise<void> {
  exportError.value = '';
  exported.value = false;
  exporting.value = true;

  try {
    const file = await fetchAccountExport();

    saveFile(file.blob, file.filename);
    exported.value = true;
  } catch (error) {
    exportError.value = messageOf(error, EXPORT_FAILURE);
  } finally {
    exporting.value = false;
  }
}

/**
 * Supprime le compte, puis quitte vers la connexion.
 *
 * Les trois conditions du serveur sont vérifiées avant l'appel, pour éviter un
 * aller-retour ; ce qui décide reste le serveur (ADR 0017).
 */
async function confirmDeletion(): Promise<void> {
  passwordError.value = '';
  codeError.value = '';
  confirmedError.value = '';
  deleteError.value = '';

  if (!confirmed.value) {
    confirmedError.value = MISSING_CONFIRMATION;

    return;
  }

  if (password.value === '') {
    passwordError.value = MISSING_PASSWORD;

    return;
  }

  if (isTwoFactorActive.value && code.value.trim() === '') {
    codeError.value = MISSING_CODE;

    return;
  }

  deleting.value = true;

  try {
    await deleteAccount({
      password: password.value,
      confirmed: true,
      ...(isTwoFactorActive.value ? { code: code.value.trim() } : {}),
    });

    /*
      Tout l'état local part avant la redirection, l'état du premier lancement
      compris : la suppression ne recharge pas la page, et un état qui
      survivrait ferait décider la garde pour le compte suivant connecté dans
      le même onglet (ADR 0017).
    */
    forgetDeletedAccount();

    // replace et non push : le profil d'un compte supprimé n'a rien à faire
    // dans l'historique, où le bouton Retour y ramènerait.
    await router.replace({ name: LOGIN_ROUTE, query: { [DELETED_QUERY]: DELETED_VALUE } });
  } catch (error) {
    // Le dialogue reste ouvert : le message est dedans, et le fermer le ferait
    // disparaître avec lui.
    deleteError.value = messageOf(error, DELETE_FAILURE);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="data">
    <h2>Mes données</h2>

    <p>
      Vous pouvez récupérer une copie de tout ce que Mijote sait de vous, ou supprimer votre compte.
      La
      <RouterLink :to="{ name: 'privacy' }">page de confidentialité</RouterLink>
      dit ce qui est conservé, et combien de temps.
    </p>

    <!-- Deux régions aria-live, montées avant tout message : une région dont la
         variante change en même temps que le message changerait son `role` sous
         le lecteur d'écran (voir docs/design-system.md). -->
    <BaseAlert variant="error" :message="exportError" />
    <BaseAlert variant="success" :message="exported ? EXPORTED : ''" />

    <p class="data__row">
      <BaseButton
        variant="secondary"
        :loading="exporting"
        loading-label="téléchargement en cours"
        @click="download"
      >
        Télécharger mes données
      </BaseButton>
    </p>

    <p>
      La suppression du compte est immédiate et sans retour : le compte, le foyer et son profil sont
      effacés. Téléchargez vos données avant, si vous voulez les garder.
    </p>

    <!-- Le refus est dit avant l'essai, et c'est la phrase du serveur, partagée
         pour que l'écran et l'API n'en donnent pas deux versions. -->
    <p v-if="blocked" class="data__blocked">{{ LAST_ADMIN_REFUSAL }}</p>

    <BaseDialog
      v-model:open="dialogOpen"
      title="Supprimer mon compte"
      description="Cette action est immédiate et sans retour. Le compte, le foyer et son profil seront effacés."
      close-label="Annuler"
    >
      <template #trigger>
        <BaseButton variant="danger" :disabled="blocked">Supprimer mon compte</BaseButton>
      </template>

      <BaseAlert variant="error" :message="deleteError" />

      <form :id="FORM_ID" class="data__form" novalidate @submit.prevent="confirmDeletion">
        <BaseCheckbox
          v-model="confirmed"
          label="Je comprends que la suppression est définitive."
          required
          :error="confirmedError"
        />

        <BaseField
          v-model="password"
          label="Votre mot de passe"
          type="password"
          autocomplete="current-password"
          required
          :error="passwordError"
        />

        <!-- Le code n'est demandé que si le second facteur est actif : le
             serveur l'exige dans ce cas, et dans ce cas seulement. -->
        <BaseField
          v-if="isTwoFactorActive"
          v-model="code"
          label="Code de double authentification"
          inputmode="numeric"
          autocomplete="one-time-code"
          required
          help="Le code de votre application, ou un code de secours."
          :error="codeError"
        />
      </form>

      <template #actions>
        <!-- Hors du formulaire, mais rattaché à lui par `form` : le bouton
             d'envoi appartient à la rangée d'actions du dialogue, et la touche
             Entrée dans un champ doit envoyer malgré tout. -->
        <BaseButton
          type="submit"
          :form="FORM_ID"
          variant="danger"
          :loading="deleting"
          loading-label="suppression en cours"
        >
          Supprimer définitivement
        </BaseButton>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.data {
  display: flex;
  flex-direction: column;
  max-width: 34rem;
  gap: var(--space-3);
}

/* Le bouton est seul dans son paragraphe : sans cela, il s'étirerait sur toute
   la largeur de la colonne, les enfants d'un conteneur flex en colonne
   s'étirant par défaut. */
.data__row {
  margin: 0;
}

.data__blocked {
  margin: 0;
  color: var(--color-text-muted);
}

.data__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
