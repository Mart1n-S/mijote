import { computed, type ComputedRef, ref } from 'vue';

import { ApiError } from '../api/client';
import { fetchOnboardingState } from '../api/household';

/*
  L'état du premier lancement, pour la garde de navigation.

  Un module et non un magasin d'état : il n'y a qu'un foyer par session, et
  cette valeur vit aussi longtemps que la page. Le serveur en reste la source de
  vérité.

  **Le profil n'est pas chargé ici**, et c'est le point : la garde a besoin de
  savoir si le parcours est fait, pas des allergènes du foyer, qui sont des
  données de santé (ADR 0015).
*/

const done = ref(true);

/** L'appel en cours, pour que plusieurs navigations ne le lancent qu'une fois. */
let pending: Promise<void> | undefined;
let loaded = false;

/**
 * Le parcours de premier lancement reste-t-il à proposer ?
 *
 * Faux par défaut, et faux quand le serveur ne répond pas : mieux vaut laisser
 * quelqu'un sur la page qu'il demandait que l'envoyer remplir un formulaire
 * sur la foi d'une panne.
 */
export const needsOnboarding: ComputedRef<boolean> = computed(() => !done.value);

async function load(): Promise<void> {
  try {
    done.value = await fetchOnboardingState();
  } catch (error) {
    done.value = true;

    if (!(error instanceof ApiError)) {
      console.error("lecture de l'état du premier lancement impossible", error);
    }
  } finally {
    loaded = true;
    pending = undefined;
  }
}

/** Demande l'état au serveur, une fois. */
export async function ensureOnboardingLoaded(): Promise<void> {
  if (loaded) {
    return;
  }

  pending ??= load();

  await pending;
}

/**
 * Note que le parcours est derrière nous, sans redemander au serveur.
 *
 * Appelée par l'écran quand il vient de poser la date : sans cela, la garde
 * renverrait sur le parcours à la navigation suivante.
 */
export function markOnboardingDone(): void {
  done.value = true;
  loaded = true;
}

/**
 * Oublie l'état, pour que la prochaine session le redemande.
 *
 * Appelée quand la session change de compte, et c'est nécessaire : la
 * déconnexion ne recharge pas la page, donc sans cet oubli la garde décidait
 * pour le compte suivant avec le booléen du foyer précédent. Le second compte
 * n'était jamais conduit au parcours, ou y était conduit à tort et sa date de
 * fin était réécrite. Aucune donnée de foyer ne traversait pour autant, le
 * serveur refiltrant à chaque requête (ADR 0015).
 */
export function forgetOnboarding(): void {
  done.value = true;
  pending = undefined;
  loaded = false;
}
