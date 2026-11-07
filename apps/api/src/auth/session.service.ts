import { Inject, Injectable } from '@nestjs/common';

import { createSecret, hashSecret } from '../security/tokens.js';

import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS } from './auth.cookies.js';
import { type AccountRecord, AuthRepository, type SessionRecord } from './auth.repository.js';

/*
  Les sessions, stockées côté serveur (ADR 0010).

  Le cookie ne porte qu'un secret opaque de 32 octets ; tout l'état vit dans la
  table `session`, ce qui permet de la fermer vraiment à la déconnexion, là où
  un jeton signé resterait valide jusqu'à son expiration.
*/

/** Ce que les sessions lisent et écrivent, et rien de plus. */
export interface SessionStore {
  createSession(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    adminUnlockedAt?: Date;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<{ session: SessionRecord; account: AccountRecord } | undefined>;
  touchSession(id: string, seenAt: Date): Promise<void>;
  deleteSession(id: string): Promise<void>;
  unlockSession(id: string, at: Date): Promise<void>;
}

/** Une session valide et le compte auquel elle appartient. */
export interface Authenticated {
  session: SessionRecord;
  account: AccountRecord;
}

/** Ce qu'une session ouverte donne à poser dans les cookies. */
export interface OpenedSession {
  token: string;
  csrfSecret: string;
}

/*
  La dernière activité n'est réécrite que si elle a plus d'une minute. Sans ce
  seuil, chaque requête d'une page ferait un UPDATE, pour un champ qui ne sert
  qu'à comparer deux heures d'inactivité.
*/
const TOUCH_INTERVAL_MS = 60 * 1000;

@Injectable()
export class SessionService {
  constructor(@Inject(AuthRepository) private readonly store: SessionStore) {}

  /**
   * Ouvre une session et rend les secrets à poser en cookies.
   *
   * `adminUnlockedAt` n'est posé que lorsqu'un second facteur vient d'être
   * validé : une session ouverte sans lui vaut pour l'application, et aucune
   * route d'administration ne l'accepte (ADR 0012).
   */
  async open(accountId: string, adminUnlockedAt?: Date): Promise<OpenedSession> {
    const token = createSecret();
    const csrfSecret = createSecret();

    await this.store.createSession({
      accountId,
      tokenHash: hashSecret(token),
      csrfSecret,
      ...(adminUnlockedAt === undefined ? undefined : { adminUnlockedAt }),
      expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS),
    });

    return { token, csrfSecret };
  }

  /** Ouvre les droits d'administration d'une session déjà ouverte. */
  async unlockAdmin(sessionId: string): Promise<void> {
    await this.store.unlockSession(sessionId, new Date());
  }

  /**
   * La session que porte ce jeton, si elle est encore valable.
   *
   * Deux limites : deux heures sans requête, et douze heures depuis l'ouverture
   * quoi qu'il arrive. Une session hors délai est supprimée au passage, pour
   * qu'un jeton volé ne reste pas à attendre la purge.
   */
  async resolve(token: string): Promise<Authenticated | undefined> {
    const found = await this.store.findSessionByTokenHash(hashSecret(token));

    if (found === undefined) {
      return undefined;
    }

    const now = Date.now();
    const idleSince = now - found.session.lastSeenAt.getTime();

    if (found.session.expiresAt.getTime() <= now || idleSince >= IDLE_TIMEOUT_MS) {
      await this.store.deleteSession(found.session.id);

      return undefined;
    }

    if (idleSince >= TOUCH_INTERVAL_MS) {
      await this.store.touchSession(found.session.id, new Date(now));
    }

    return found;
  }

  async close(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
  }

  /**
   * Ferme la session que ce jeton désigne, s'il en désigne une.
   *
   * Appelée à la connexion : sans elle, la session précédente du même
   * navigateur resterait valable jusqu'à sa limite, et se reconnecter en
   * soupçonnant un vol ne fermerait rien.
   */
  async closePresented(token: string): Promise<void> {
    const found = await this.store.findSessionByTokenHash(hashSecret(token));

    if (found !== undefined) {
      await this.store.deleteSession(found.session.id);
    }
  }
}
