<script setup lang="ts">
import { createInvitationSchema, type Invitation, type InvitationStatus } from '@mijote/shared';
import { onMounted, ref } from 'vue';

import { ApiError } from '../api/client';
import { createInvitation, listInvitations, revokeInvitation } from '../api/invitations';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseField from '../components/base/BaseField.vue';
import BaseSelect from '../components/base/BaseSelect.vue';

/*
  Les invitations, vues par l'administrateur : en envoyer, les suivre, les
  révoquer.

  Le lien n'apparaît jamais ici, et ce n'est pas un oubli : le jeton n'existe
  qu'une fois, dans l'e-mail de l'invité. L'afficher reviendrait à le ranger
  dans l'historique du navigateur et dans les captures d'écran (ADR 0013).
*/

const ROLE_OPTIONS = [
  { value: 'user', label: 'Membre du foyer' },
  { value: 'admin', label: 'Administrateur' },
] as const;

/** Les libellés d'état : du texte, et non une couleur seule. */
const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'En attente',
  used: 'Utilisée',
  expired: 'Expirée',
  revoked: 'Révoquée',
};

const invitations = ref<Invitation[]>([]);
const email = ref('');
const role = ref('user');
const emailError = ref('');
const formError = ref('');
const listError = ref('');
const notice = ref('');
const loading = ref(true);
const submitting = ref(false);
/** L'invitation en cours de révocation, pour n'occuper qu'un bouton. */
const revoking = ref('');

const INVALID_EMAIL = 'Indiquez une adresse e-mail valide.';

const UNEXPECTED_FAILURE = "L'invitation n'a pas pu être envoyée. Réessayez dans un instant.";

const LIST_FAILURE = "La liste des invitations n'a pas pu être lue.";

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.userMessage : fallback;
}

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

async function refresh(): Promise<void> {
  listError.value = '';

  try {
    invitations.value = await listInvitations();
  } catch (error) {
    listError.value = messageOf(error, LIST_FAILURE);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

async function submit(): Promise<void> {
  emailError.value = '';
  formError.value = '';
  notice.value = '';

  const parsed = createInvitationSchema.safeParse({ email: email.value, role: role.value });

  if (!parsed.success) {
    emailError.value = INVALID_EMAIL;

    return;
  }

  submitting.value = true;

  try {
    const created = await createInvitation(parsed.data);

    /*
      L'adresse est répétée à l'administrateur, qui vient de la saisir et doit
      pouvoir vérifier qu'il ne s'est pas trompé : c'est la seule personne à qui
      elle est montrée.
    */
    notice.value = `Invitation envoyée à ${created.email}. Le lien expire le ${formatDate(created.expiresAt)}.`;
    email.value = '';
    role.value = 'user';

    await refresh();
  } catch (error) {
    formError.value = messageOf(error, UNEXPECTED_FAILURE);
  } finally {
    submitting.value = false;
  }
}

async function revoke(invitation: Invitation): Promise<void> {
  formError.value = '';
  notice.value = '';
  revoking.value = invitation.id;

  try {
    await revokeInvitation(invitation.id);
    notice.value = `Invitation de ${invitation.email} révoquée. Son lien ne vaut plus rien.`;

    await refresh();
  } catch (error) {
    formError.value = messageOf(error, "L'invitation n'a pas pu être révoquée.");
  } finally {
    revoking.value = '';
  }
}
</script>

<template>
  <h1>Invitations</h1>

  <!-- Les deux régions aria-live sont montées avec la page, avant tout
       message : sinon l'arrivée du message ne serait pas annoncée. -->
  <BaseAlert variant="error" :message="formError" />
  <BaseAlert variant="success" :message="notice" />

  <form class="invite" novalidate @submit.prevent="submit">
    <h2>Inviter quelqu'un</h2>

    <BaseField
      v-model="email"
      label="Adresse e-mail"
      type="email"
      name="email"
      autocomplete="off"
      help="Un lien lui sera envoyé. Il expire au bout de trois jours."
      required
      :error="emailError"
    />

    <BaseSelect
      v-model="role"
      label="Rôle"
      name="role"
      :options="ROLE_OPTIONS"
      help="Un administrateur peut inviter d'autres personnes, et devra activer la double authentification."
      required
    />

    <BaseButton type="submit" :loading="submitting" loading-label="envoi en cours">
      Envoyer l'invitation
    </BaseButton>
  </form>

  <h2 class="invite__list-title">Invitations envoyées</h2>

  <BaseAlert variant="error" :message="listError" />

  <p v-if="loading">Lecture des invitations.</p>

  <p v-else-if="invitations.length === 0">Aucune invitation pour le moment.</p>

  <!-- Un vrai tableau, avec ses en-têtes : ce sont des données tabulaires, et
       les en-têtes sont ce qui relie chaque cellule à sa colonne. -->
  <table v-else class="invite__table">
    <caption class="invite__caption">
      Le lien d'une invitation n'est visible que dans l'e-mail envoyé.
    </caption>
    <thead>
      <tr>
        <th scope="col">Adresse</th>
        <th scope="col">Rôle</th>
        <th scope="col">État</th>
        <th scope="col">Expire le</th>
        <th scope="col">
          <!-- Une colonne d'actions : son en-tête n'a rien à annoncer, mais il
               doit exister pour que les cellules aient une colonne. -->
          <span class="visually-hidden">Actions</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="invitation in invitations" :key="invitation.id">
        <td>{{ invitation.email }}</td>
        <td>{{ invitation.role === 'admin' ? 'Administrateur' : 'Membre du foyer' }}</td>
        <td>{{ STATUS_LABELS[invitation.status] }}</td>
        <td>{{ formatDate(invitation.expiresAt) }}</td>
        <td>
          <!-- Révoquer n'a de sens que sur une invitation en attente : une
               invitation utilisée, expirée ou déjà révoquée ne vaut plus rien,
               et le serveur refuserait de toute façon. -->
          <BaseButton
            v-if="invitation.status === 'pending'"
            variant="danger"
            :loading="revoking === invitation.id"
            loading-label="révocation en cours"
            @click="revoke(invitation)"
          >
            Révoquer
          </BaseButton>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.invite {
  display: flex;
  flex-direction: column;
  max-width: 28rem;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.invite__list-title {
  margin-top: var(--space-7);
}

.invite__table {
  width: 100%;
  margin-top: var(--space-4);
  border-collapse: collapse;
}

.invite__caption {
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: left;
}

.invite__table :is(th, td) {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: middle;
}

.invite__table th {
  font-size: var(--text-sm);
}
</style>
