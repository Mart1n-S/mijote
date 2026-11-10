import {
  householdOnboardingSchema,
  householdProfileSchema,
  type HouseholdProfile,
  type UpdateHouseholdProfileInput,
} from '@mijote/shared';

import { apiRequest } from './client';

/*
  Le profil du foyer, côté navigateur.

  Aucun appel ne nomme un foyer : le serveur le tient de la session, et il n'y
  a pas d'identifiant à passer (ADR 0015).
*/

/**
 * L'état du premier lancement, et rien d'autre.
 *
 * C'est ce que la garde de navigation appelle au démarrage. Elle n'appelle
 * **pas** le profil : il porte des données de santé, qui n'ont pas à voyager
 * pour décider d'une redirection (ADR 0015).
 */
export async function fetchOnboardingState(): Promise<boolean> {
  const response = await apiRequest('/household/onboarding');

  return householdOnboardingSchema.parse(await response.json()).done;
}

export async function fetchHouseholdProfile(): Promise<HouseholdProfile> {
  const response = await apiRequest('/household/profile');

  return householdProfileSchema.parse(await response.json());
}

/**
 * Modifie les champs donnés, et rend le profil à jour.
 *
 * Partiel : ce qui n'est pas passé n'est pas touché, ce qui vaut `null` est
 * effacé, et un tableau vide efface une liste (ADR 0016).
 */
export async function updateHouseholdProfile(
  changes: UpdateHouseholdProfileInput,
): Promise<HouseholdProfile> {
  const response = await apiRequest('/household/profile', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });

  return householdProfileSchema.parse(await response.json());
}
