import { type LoginInput, type SessionAccount, sessionResponseSchema } from '@mijote/shared';
import { computed, type ComputedRef, ref } from 'vue';

import { ApiError, apiRequest } from '../api/client';

/*
  Qui est connecté, pour toute l'application.

  Un module et non un magasin d'état : il n'y a qu'une session à la fois, et
  elle vit aussi longtemps que la page. Le serveur en reste la source de
  vérité, ces valeurs n'en sont que le reflet, le temps d'un affichage.
*/

const account = ref<SessionAccount | undefined>(undefined);

/** L'appel en cours, pour que plusieurs navigations ne le lancent qu'une fois. */
let pending: Promise<void> | undefined;
let loaded = false;

export const currentAccount: ComputedRef<SessionAccount | undefined> = computed(
  () => account.value,
);

export const isAuthenticated: ComputedRef<boolean> = computed(() => account.value !== undefined);

async function load(): Promise<void> {
  try {
    const response = await apiRequest('/auth/session');

    account.value = sessionResponseSchema.parse(await response.json()).account;
  } catch (error) {
    /*
      Un 401 veut dire « personne n'est connecté » : c'est une réponse, pas une
      panne. Tout autre échec est une panne, et on ne peut alors pas affirmer
      qu'une session existe : on reste donc anonyme, et c'est le bandeau de
      service qui dit à l'utilisateur que l'API ne répond pas.

      L'erreur n'est pas avalée pour autant : elle décide de l'état, et une
      erreur qui ne serait pas une ApiError ne peut venir que d'un défaut du
      client ou du schéma, que la console montrera.
    */
    account.value = undefined;

    if (!(error instanceof ApiError)) {
      console.error('lecture de la session impossible', error);
    }
  } finally {
    loaded = true;
    pending = undefined;
  }
}

/**
 * Demande au serveur qui est connecté, une fois.
 *
 * C'est aussi l'appel qui reprend une session mémorisée : le cookie de
 * mémorisation n'ouvre une session que sur cette route (voir l'ADR 0010).
 */
export async function ensureSessionLoaded(): Promise<void> {
  if (loaded) {
    return;
  }

  pending ??= load();

  await pending;
}

export async function logIn(input: LoginInput): Promise<void> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  account.value = sessionResponseSchema.parse(await response.json()).account;
  loaded = true;
}

/**
 * Ferme la session de cet appareil.
 *
 * L'état local est vidé quoi qu'il arrive : si l'appel échoue, laisser
 * l'interface affirmer que quelqu'un est connecté serait pire que de la
 * remettre à zéro, la prochaine requête se faisant refuser de toute façon.
 */
export async function logOut(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    account.value = undefined;
    loaded = true;
  }
}

/** Remet l'état à zéro. Réservé aux tests, qui partagent ce module. */
export function resetSessionForTests(): void {
  account.value = undefined;
  pending = undefined;
  loaded = false;
}
