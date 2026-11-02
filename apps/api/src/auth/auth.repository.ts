import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, lt, type SQL } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import { account, loginAttempt, rememberToken, session } from '../db/schema.js';

/*
  Toutes les requêtes SQL de la connexion, réunies ici.

  Les services ne voient jamais Drizzle : chacun déclare l'interface étroite de
  ce qu'il lit et écrit (`AccountStore`, `SessionStore`, ...), et c'est ce
  dépôt qui les implémente. C'est le même procédé que `DatabaseProbe` pour la
  sonde de santé : les tests de la logique tournent sur une mémoire de quelques
  lignes, sans PostgreSQL, et le SQL se mesure une fois, dans
  auth.repository.spec.ts, contre une vraie base.
*/

/** Un compte, tel que la connexion a besoin de le lire. */
export interface AccountRecord {
  id: string;
  householdId: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
}

export interface SessionRecord {
  id: string;
  accountId: string;
  csrfSecret: string;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface RememberRecord {
  family: string;
  accountId: string;
  secretHash: string;
  previousSecretHash: string | null;
  rotatedAt: Date | null;
  expiresAt: Date;
}

/** L'issue d'une tentative, telle que la table la compte. */
export type LoginOutcome = 'succeeded' | 'failed' | 'blocked';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findAccountByEmail(email: string): Promise<AccountRecord | undefined> {
    const [row] = await this.database
      .select({
        id: account.id,
        householdId: account.householdId,
        email: account.email,
        passwordHash: account.passwordHash,
        role: account.role,
      })
      .from(account)
      .where(eq(account.email, email))
      .limit(1);

    return row;
  }

  async findAccountById(id: string): Promise<AccountRecord | undefined> {
    const [row] = await this.database
      .select({
        id: account.id,
        householdId: account.householdId,
        email: account.email,
        passwordHash: account.passwordHash,
        role: account.role,
      })
      .from(account)
      .where(eq(account.id, id))
      .limit(1);

    return row;
  }

  async createSession(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const [row] = await this.database.insert(session).values(input).returning({
      id: session.id,
      accountId: session.accountId,
      csrfSecret: session.csrfSecret,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    });

    if (row === undefined) {
      throw new Error("l'insertion de la session n'a rien renvoyé");
    }

    return row;
  }

  /**
   * La session et son compte en une seule requête.
   *
   * La garde en a besoin à chaque requête : une jointure plutôt que deux
   * allers-retours.
   */
  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<{ session: SessionRecord; account: AccountRecord } | undefined> {
    const [row] = await this.database
      .select({
        session: {
          id: session.id,
          accountId: session.accountId,
          csrfSecret: session.csrfSecret,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
        },
        account: {
          id: account.id,
          householdId: account.householdId,
          email: account.email,
          passwordHash: account.passwordHash,
          role: account.role,
        },
      })
      .from(session)
      .innerJoin(account, eq(account.id, session.accountId))
      .where(eq(session.tokenHash, tokenHash))
      .limit(1);

    return row;
  }

  async touchSession(id: string, seenAt: Date): Promise<void> {
    await this.database.update(session).set({ lastSeenAt: seenAt }).where(eq(session.id, id));
  }

  async deleteSession(id: string): Promise<void> {
    await this.database.delete(session).where(eq(session.id, id));
  }

  async createRememberToken(input: {
    accountId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<string> {
    const [row] = await this.database
      .insert(rememberToken)
      .values(input)
      .returning({ family: rememberToken.family });

    if (row === undefined) {
      throw new Error("l'insertion du jeton de mémorisation n'a rien renvoyé");
    }

    return row.family;
  }

  async findRememberFamily(family: string): Promise<RememberRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(rememberToken)
      .where(eq(rememberToken.family, family))
      .limit(1);

    return row;
  }

  async rotateRememberSecret(
    family: string,
    change: { secretHash: string; previousSecretHash: string; rotatedAt: Date },
  ): Promise<void> {
    await this.database.update(rememberToken).set(change).where(eq(rememberToken.family, family));
  }

  async deleteRememberFamily(family: string): Promise<void> {
    await this.database.delete(rememberToken).where(eq(rememberToken.family, family));
  }

  async recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
  }): Promise<void> {
    await this.database.insert(loginAttempt).values(input);
  }

  /**
   * Les échecs de la fenêtre glissante, par adresse soumise et par IP.
   *
   * Seuls les `failed` sont comptés. Compter aussi les `blocked` ferait durer
   * le blocage tant que quelqu'un insiste : un inconnu pourrait tenir un compte
   * fermé indéfiniment. Les lignes `blocked` restent écrites, pour la trace.
   */
  async countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
  }): Promise<{ byEmail: number; byIp: number }> {
    const [byEmail, byIp] = await Promise.all([
      this.countFailuresWhere(
        eq(loginAttempt.emailFingerprint, input.emailFingerprint),
        input.since,
      ),
      this.countFailuresWhere(eq(loginAttempt.ipFingerprint, input.ipFingerprint), input.since),
    ]);

    return { byEmail, byIp };
  }

  /**
   * Efface ce qui est périmé : sessions, jetons de mémorisation et tentatives.
   *
   * Les tentatives ne sont gardées que `attemptRetention` : ce sont des
   * empreintes de données personnelles, elles n'ont pas à s'accumuler une fois
   * la fenêtre de limitation passée.
   */
  async purgeExpired(now: Date, attemptRetention: Date): Promise<void> {
    await Promise.all([
      this.database.delete(session).where(lt(session.expiresAt, now)),
      this.database.delete(rememberToken).where(lt(rememberToken.expiresAt, now)),
      this.database.delete(loginAttempt).where(lt(loginAttempt.attemptedAt, attemptRetention)),
    ]);
  }

  private async countFailuresWhere(matches: SQL, since: Date): Promise<number> {
    const [row] = await this.database
      .select({ failures: count() })
      .from(loginAttempt)
      .where(
        and(matches, eq(loginAttempt.outcome, 'failed'), gte(loginAttempt.attemptedAt, since)),
      );

    return row?.failures ?? 0;
  }
}
