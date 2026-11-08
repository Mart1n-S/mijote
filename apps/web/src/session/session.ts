import {
  loginResponseSchema,
  sessionResponseSchema,
  type LoginInput,
  type SessionAccount,
  type TwoFactorState,
} from '@mijote/shared';
import { computed, type ComputedRef, ref } from 'vue';

import { ApiError, apiRequest } from '../api/client';

/*
  Qui est connecté, pour toute l'application.

  Un module et non un magasin d'état : il n'y a qu'une session à la fois, et
  elle vit aussi longtemps que la page. Le serveur en reste la source de
  vérité, ces valeurs n'en sont que le reflet, le temps d'un affichage.
*/

const account = ref<SessionAccount | undefined>(undefined);

/** La double authentification du compte connecté, telle que l'API la dit. */
const twoFactorActive = ref(false);

/** Un code a-t-il été validé dans cette session ? */
const adminUnlocked = ref(false);

/** L'appel en cours, pour que plusieurs navigations ne le lancent qu'une fois. */
let pending: Promise<void> | undefined;
let loaded = false;

export const currentAccount: ComputedRef<SessionAccount | undefined> = computed(
  () => account.value,
);

export const isAuthenticated: ComputedRef<boolean> = computed(() => account.value !== undefined);

/** Le second facteur est-il inscrit et confirmé sur ce compte ? */
export const isTwoFactorActive: ComputedRef<boolean> = computed(() => twoFactorActive.value);

/**
 * Un administrateur qui doit taper un code avant d'entrer en administration.
 *
 * C'est le cas d'une session reprise par le cookie de mémorisation : elle vaut
 * pour l'application, pas pour l'administration (ADR 0012). L'interface le
 * conduit alors à l'écran de déverrouillage, plutôt que de le laisser se faire
 * refuser par le serveur.
 */
export const mustUnlockAdmin: ComputedRef<boolean> = computed(
  () => account.value?.role === 'admin' && twoFactorActive.value && !adminUnlocked.value,
);

/**
 * Un administrateur sans second facteur : il garde l'application, mais aucune
 * route d'administration ne l'accepte, et l'interface le conduit à l'activer.
 */
export const mustActivateTwoFactor: ComputedRef<boolean> = computed(
  () => account.value?.role === 'admin' && !twoFactorActive.value,
);

function remember(session: { account: SessionAccount; twoFactor: TwoFactorState }): void {
  account.value = session.account;
  twoFactorActive.value = session.twoFactor.active;
  adminUnlocked.value = session.twoFactor.adminUnlocked;
  loaded = true;
}

function forget(): void {
  account.value = undefined;
  twoFactorActive.value = false;
  adminUnlocked.value = false;
}

async function load(): Promise<void> {
  try {
    const response = await apiRequest('/auth/session');

    remember(sessionResponseSchema.parse(await response.json()));
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
    forget();

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

/**
 * Relit la session depuis le serveur, même si elle a déjà été lue.
 *
 * `ensureSessionLoaded` ne sert qu'une fois : il sort aussitôt dès que la garde
 * de navigation a fait sa lecture, c'est-à-dire presque toujours. Après une
 * activation, il faut donc forcer la relecture, sans quoi l'en-tête continue
 * d'inviter à activer ce qui vient de l'être.
 */
export async function reloadSession(): Promise<void> {
  pending = load();

  await pending;
}

/**
 * Ce que la connexion a donné.
 *
 * `two-factor` veut dire que le mot de passe est bon et qu'un code est
 * attendu : aucune session n'est ouverte à ce moment-là (ADR 0012).
 */
export type LogInOutcome = 'session' | 'two-factor';

export async function logIn(input: LoginInput): Promise<LogInOutcome> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = loginResponseSchema.parse(await response.json());

  if ('twoFactorRequired' in body) {
    // Rien à retenir : il n'y a pas de session, seulement une attente côté
    // serveur, que son cookie porte.
    return 'two-factor';
  }

  remember(body);

  return 'session';
}

/**
 * Crée le compte que cette invitation autorise, et ouvre sa session.
 *
 * Le jeton part dans le corps : il vient du fragment de l'adresse, qui n'est
 * jamais envoyé au serveur, et il n'a pas à se retrouver dans une URL appelée
 * (ADR 0013).
 */
export async function signUpWithInvitation(token: string, password: string): Promise<void> {
  const response = await apiRequest('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

  remember(sessionResponseSchema.parse(await response.json()));
}

/**
 * Ouvre les droits d'administration de cette session, par un code.
 *
 * La session est relue ensuite : c'est le serveur qui dit si elle est
 * déverrouillée, et l'interface ne doit pas le décider de son côté.
 */
export async function unlockAdmin(code: string): Promise<void> {
  await apiRequest('/auth/two-factor/unlock', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  await reloadSession();
}

/** Soumet le code du second facteur, et ouvre la session s'il est bon. */
export async function submitTwoFactorCode(code: string): Promise<void> {
  const response = await apiRequest('/auth/two-factor', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  remember(sessionResponseSchema.parse(await response.json()));
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
    forget();
    loaded = true;
  }
}

/** Remet l'état à zéro. Réservé aux tests, qui partagent ce module. */
export function resetSessionForTests(): void {
  forget();
  pending = undefined;
  loaded = false;
}
