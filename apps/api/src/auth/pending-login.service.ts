import { Inject, Injectable } from '@nestjs/common';

import { createSecret, hashSecret } from '../security/tokens.js';

import { type AccountRecord, AuthRepository, type PendingLoginRecord } from './auth.repository.js';

/*
  L'attente entre un mot de passe validé et le second facteur.

  L'ADR 0010 avait écarté toute pré-session, pour deux raisons : une ligne par
  visiteur, et un identifiant à renouveler à la connexion. Celle-ci n'a ni
  l'une ni l'autre. Elle n'existe qu'après un mot de passe correct, pour un
  compte connu, et elle est **détruite** au moment où la vraie session s'ouvre,
  qui reçoit un jeton neuf : aucune fixation possible (ADR 0012).

  Ce qu'elle permet : une seule route, la soumission du code. Rien d'autre.
*/

/**
 * Cinq minutes. Le temps d'ouvrir son application d'authentification, pas
 * celui d'oublier la page ouverte sur un poste partagé.
 */
export const PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * Cinq essais sur une même attente, puis elle est détruite et il faut
 * recommencer par le mot de passe.
 *
 * Cette borne est immédiate ; la fenêtre glissante de quinze minutes, elle,
 * survit à la destruction de l'attente et empêche donc de la contourner en
 * recommençant (voir AttemptsService).
 */
export const MAX_PENDING_ATTEMPTS = 5;

/** Une attente valide, et le compte qu'elle désigne. */
export interface PendingLogin {
  id: string;
  accountId: string;
  csrfSecret: string;
  attempts: number;
  account: AccountRecord;
  /** « Se souvenir de moi », demandé au mot de passe et honoré après le code. */
  remember: boolean;
}

/** Ce que l'attente lit et écrit, et rien de plus. */
export interface PendingLoginStore {
  createPendingLogin(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    remember: boolean;
    expiresAt: Date;
  }): Promise<void>;
  findPendingLoginByTokenHash(
    tokenHash: string,
  ): Promise<{ pending: PendingLoginRecord; account: AccountRecord } | undefined>;
  countPendingAttempt(id: string): Promise<number>;
  deletePendingLogin(id: string): Promise<void>;
}

@Injectable()
export class PendingLoginService {
  constructor(@Inject(AuthRepository) private readonly store: PendingLoginStore) {}

  /** Ouvre une attente et rend les secrets à poser en cookies. */
  async open(accountId: string, remember: boolean): Promise<{ token: string; csrfSecret: string }> {
    const token = createSecret();
    const csrfSecret = createSecret();

    await this.store.createPendingLogin({
      accountId,
      tokenHash: hashSecret(token),
      csrfSecret,
      remember,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    });

    return { token, csrfSecret };
  }

  /**
   * L'attente que porte ce jeton, si elle est encore valable.
   *
   * Une attente périmée est supprimée au passage : elle ne vaut plus rien, et
   * la laisser traîner jusqu'à la purge n'apporte rien.
   */
  async resolve(token: string): Promise<PendingLogin | undefined> {
    const found = await this.store.findPendingLoginByTokenHash(hashSecret(token));

    if (found === undefined) {
      return undefined;
    }

    if (found.pending.expiresAt.getTime() <= Date.now()) {
      await this.store.deletePendingLogin(found.pending.id);

      return undefined;
    }

    return {
      id: found.pending.id,
      accountId: found.pending.accountId,
      csrfSecret: found.pending.csrfSecret,
      attempts: found.pending.attempts,
      remember: found.pending.remember,
      account: found.account,
    };
  }

  /**
   * Compte un essai raté, et dit si l'attente survit.
   *
   * L'incrément est fait par la base, en une requête : deux essais simultanés
   * ne peuvent pas lire le même compteur et écrire la même valeur.
   */
  async countFailedAttempt(id: string): Promise<boolean> {
    if ((await this.store.countPendingAttempt(id)) >= MAX_PENDING_ATTEMPTS) {
      await this.store.deletePendingLogin(id);

      return false;
    }

    return true;
  }

  async close(id: string): Promise<void> {
    await this.store.deletePendingLogin(id);
  }
}
