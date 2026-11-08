import {
  invitationListSchema,
  invitationPreviewSchema,
  invitationSchema,
  type CreateInvitationInput,
  type Invitation,
} from '@mijote/shared';

import { apiRequest } from './client';

/*
  Les invitations, côté navigateur.

  L'acceptation ne vit pas ici mais dans le magasin de session : elle ouvre une
  session, donc elle a un effet sur l'état de l'application.

  Le jeton n'apparaît dans aucune adresse appelée : il part dans le corps d'un
  POST, y compris pour une simple lecture. Une adresse se retrouve dans
  l'historique du navigateur, dans l'en-tête `Referer` et dans les journaux du
  mandataire (ADR 0013).
*/

/** L'adresse qu'un lien invite, avant de demander un mot de passe. */
export async function previewInvitation(token: string): Promise<{ email: string }> {
  const response = await apiRequest('/invitations/preview', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  return invitationPreviewSchema.parse(await response.json());
}

export async function listInvitations(): Promise<Invitation[]> {
  const response = await apiRequest('/invitations');

  return invitationListSchema.parse(await response.json()).invitations;
}

export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
  const response = await apiRequest('/invitations', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return invitationSchema.parse(await response.json());
}

export async function revokeInvitation(id: string): Promise<void> {
  await apiRequest(`/invitations/${id}/revoke`, { method: 'POST' });
}
