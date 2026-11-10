import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import {
  account,
  accountTwoFactor,
  loginAttempt,
  passwordReset,
  pendingLogin,
  rememberToken,
  session,
  twoFactorBackupCode,
} from '../db/schema.js';

/*
  Toutes les requêtes SQL de la connexion, réunies ici.

  Les services ne voient jamais Drizzle : chacun déclare l'interface étroite de
  ce qu'il lit et écrit (`AccountStore`, `SessionStore`, ...), et c'est ce
  dépôt qui les implémente. C'est le même procédé que `DatabaseProbe` pour la
  sonde de santé : les tests de la logique tournent sur une mémoire de quelques
  lignes, sans PostgreSQL, et le SQL se mesure une fois, dans
  auth.integration.spec.ts, contre une vraie base.
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
  /** Quand le second facteur a été validé dans cette session, ou jamais. */
  adminUnlockedAt: Date | null;
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

/**
 * Ce qui était vérifié : le mot de passe à la connexion, le code du second
 * facteur, le mot de passe redemandé à une réauthentification, le jeton d'une
 * invitation que l'on accepte, une demande de réinitialisation, ou le jeton de
 * cette réinitialisation.
 *
 * Les comptages restent séparés par motif : une acceptation ratée ne doit pas
 * rapprocher qui que ce soit du blocage de la connexion, et une rafale de
 * demandes de réinitialisation ne doit pas empêcher les vraies
 * réinitialisations d'aboutir (ADR 0014).
 */
export type LoginPurpose =
  'password' | 'code' | 'reauth' | 'invitation' | 'reset_request' | 'reset';

/** La double authentification d'un compte, telle que le service la lit. */
export interface TwoFactorRecord {
  accountId: string;
  secretCipher: string;
  activatedAt: Date | null;
  lastUsedStep: number | null;
}

/** Un code de secours, retrouvé par son numéro. */
export interface BackupCodeRecord {
  id: string;
  codeHash: string;
  usedAt: Date | null;
}

/**
 * Un jeton de réinitialisation, tel que le service le lit.
 *
 * L'empreinte n'en fait pas partie : le service la calcule pour chercher la
 * ligne, il n'a jamais à la relire.
 */
export interface PasswordResetRecord {
  id: string;
  accountId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** L'attente entre le mot de passe et le code. */
export interface PendingLoginRecord {
  id: string;
  accountId: string;
  csrfSecret: string;
  attempts: number;
  remember: boolean;
  expiresAt: Date;
}

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
    adminUnlockedAt?: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const [row] = await this.database.insert(session).values(input).returning({
      id: session.id,
      accountId: session.accountId,
      csrfSecret: session.csrfSecret,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      adminUnlockedAt: session.adminUnlockedAt,
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
          adminUnlockedAt: session.adminUnlockedAt,
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

  /**
   * Fait tourner le secret, à condition que ce soit bien celui qu'on a lu.
   *
   * La condition sur `secret_hash` est ce qui rend la rotation sûre entre deux
   * requêtes vraiment simultanées : la seconde ne trouve aucune ligne à
   * modifier, et le sait. Sans elle, les deux écriraient, et le cookie que le
   * navigateur garde pourrait ne correspondre à aucune des deux.
   *
   * Rend vrai si la ligne a été modifiée.
   */
  async rotateRememberSecret(
    family: string,
    change: { secretHash: string; previousSecretHash: string; rotatedAt: Date },
  ): Promise<boolean> {
    const rotated = await this.database
      .update(rememberToken)
      .set(change)
      .where(
        and(
          eq(rememberToken.family, family),
          eq(rememberToken.secretHash, change.previousSecretHash),
        ),
      )
      .returning({ family: rememberToken.family });

    return rotated.length > 0;
  }

  async deleteRememberFamily(family: string): Promise<void> {
    await this.database.delete(rememberToken).where(eq(rememberToken.family, family));
  }

  async recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
    purpose: LoginPurpose;
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
    purpose: LoginPurpose;
  }): Promise<{ byEmail: number; byIp: number }> {
    return this.countAttempts({ ...input, outcome: 'failed' });
  }

  /**
   * Les tentatives d'une issue donnée, par sujet et par IP.
   *
   * La demande de réinitialisation compte ses **demandes acceptées** et non des
   * échecs : elle n'échoue jamais du point de vue du client (ADR 0014). Les
   * `blocked` ne sont comptées nulle part, ici comme ailleurs.
   */
  async countAttempts(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
    purpose: LoginPurpose;
    outcome: LoginOutcome;
  }): Promise<{ byEmail: number; byIp: number }> {
    const [byEmail, byIp] = await Promise.all([
      this.countAttemptsWhere(
        eq(loginAttempt.emailFingerprint, input.emailFingerprint),
        input.since,
        input.purpose,
        input.outcome,
      ),
      this.countAttemptsWhere(
        eq(loginAttempt.ipFingerprint, input.ipFingerprint),
        input.since,
        input.purpose,
        input.outcome,
      ),
    ]);

    return { byEmail, byIp };
  }

  // La double authentification, les codes de secours, et l'attente du code.

  async findTwoFactor(accountId: string): Promise<TwoFactorRecord | undefined> {
    const [row] = await this.database
      .select({
        accountId: accountTwoFactor.accountId,
        secretCipher: accountTwoFactor.secretCipher,
        activatedAt: accountTwoFactor.activatedAt,
        lastUsedStep: accountTwoFactor.lastUsedStep,
      })
      .from(accountTwoFactor)
      .where(eq(accountTwoFactor.accountId, accountId))
      .limit(1);

    return row;
  }

  /**
   * Écrit un secret neuf, inactif, en écrasant une inscription inachevée.
   *
   * Une inscription déjà confirmée n'est jamais écrasée, d'où le `setWhere` :
   * la désactivation est le seul chemin pour en changer, et elle demande le mot
   * de passe. Sans cette condition, un `setup` suffirait à remplacer le second
   * facteur de quelqu'un.
   */
  async upsertInactiveTwoFactor(accountId: string, secretCipher: string): Promise<boolean> {
    const written = await this.database
      .insert(accountTwoFactor)
      .values({ accountId, secretCipher })
      .onConflictDoUpdate({
        target: accountTwoFactor.accountId,
        set: { secretCipher, lastUsedStep: null },
        setWhere: isNull(accountTwoFactor.activatedAt),
      })
      .returning({ accountId: accountTwoFactor.accountId });

    return written.length > 0;
  }

  /**
   * Active le second facteur et pose ses codes de secours, en une transaction.
   *
   * En une seule, parce que les deux vont ensemble : dix codes affichés à
   * quelqu'un dont la ligne serait restée inactive lui feraient croire qu'il
   * est protégé, alors que `verifyCode` les refuserait tous.
   *
   * Et sous condition, comme toutes les écritures de cette décision : le
   * secret doit être resté celui qu'un code vient de vérifier. Entre cette
   * vérification et ici s'écoule plus d'une seconde, le temps de hacher les
   * dix codes, et un `setup` simultané pourrait l'avoir remplacé. Rend faux
   * quand la ligne n'a pas bougé.
   */
  async activateTwoFactor(
    accountId: string,
    at: Date,
    verifiedCipher: string,
    codes: { position: number; codeHash: string }[],
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const activated = await transaction
        .update(accountTwoFactor)
        .set({ activatedAt: at })
        .where(
          and(
            eq(accountTwoFactor.accountId, accountId),
            isNull(accountTwoFactor.activatedAt),
            eq(accountTwoFactor.secretCipher, verifiedCipher),
          ),
        )
        .returning({ accountId: accountTwoFactor.accountId });

      if (activated.length === 0) {
        return false;
      }

      await transaction
        .delete(twoFactorBackupCode)
        .where(eq(twoFactorBackupCode.accountId, accountId));
      await transaction
        .insert(twoFactorBackupCode)
        .values(codes.map((code) => ({ accountId, ...code })));

      return true;
    });
  }

  async deleteTwoFactor(accountId: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .delete(twoFactorBackupCode)
        .where(eq(twoFactorBackupCode.accountId, accountId));
      await transaction.delete(accountTwoFactor).where(eq(accountTwoFactor.accountId, accountId));
    });
  }

  /**
   * Retient le pas d'un code accepté, à condition qu'il soit plus récent.
   *
   * Une seule requête conditionnelle, comme la rotation du jeton de
   * mémorisation : deux soumissions simultanées du même code ne peuvent pas
   * passer toutes les deux, la seconde ne modifiant aucune ligne.
   */
  async claimTotpStep(accountId: string, step: number): Promise<boolean> {
    const claimed = await this.database
      .update(accountTwoFactor)
      .set({ lastUsedStep: step })
      .where(
        and(
          eq(accountTwoFactor.accountId, accountId),
          or(isNull(accountTwoFactor.lastUsedStep), lt(accountTwoFactor.lastUsedStep, step)),
        ),
      )
      .returning({ accountId: accountTwoFactor.accountId });

    return claimed.length > 0;
  }

  async findBackupCode(accountId: string, position: number): Promise<BackupCodeRecord | undefined> {
    const [row] = await this.database
      .select({
        id: twoFactorBackupCode.id,
        codeHash: twoFactorBackupCode.codeHash,
        usedAt: twoFactorBackupCode.usedAt,
      })
      .from(twoFactorBackupCode)
      .where(
        and(
          eq(twoFactorBackupCode.accountId, accountId),
          eq(twoFactorBackupCode.position, position),
        ),
      )
      .limit(1);

    return row;
  }

  /** Consomme un code, à condition qu'il ne l'ait pas déjà été. */
  async consumeBackupCode(id: string, at: Date): Promise<boolean> {
    const consumed = await this.database
      .update(twoFactorBackupCode)
      .set({ usedAt: at })
      .where(and(eq(twoFactorBackupCode.id, id), isNull(twoFactorBackupCode.usedAt)))
      .returning({ id: twoFactorBackupCode.id });

    return consumed.length > 0;
  }

  async createPendingLogin(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    remember: boolean;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.insert(pendingLogin).values(input);
  }

  async findPendingLoginByTokenHash(
    tokenHash: string,
  ): Promise<{ pending: PendingLoginRecord; account: AccountRecord } | undefined> {
    const [row] = await this.database
      .select({
        pending: {
          id: pendingLogin.id,
          accountId: pendingLogin.accountId,
          csrfSecret: pendingLogin.csrfSecret,
          attempts: pendingLogin.attempts,
          remember: pendingLogin.remember,
          expiresAt: pendingLogin.expiresAt,
        },
        account: {
          id: account.id,
          householdId: account.householdId,
          email: account.email,
          passwordHash: account.passwordHash,
          role: account.role,
        },
      })
      .from(pendingLogin)
      .innerJoin(account, eq(account.id, pendingLogin.accountId))
      .where(eq(pendingLogin.tokenHash, tokenHash))
      .limit(1);

    return row;
  }

  /** Compte un essai de plus sur cette attente, et rend le total. */
  async countPendingAttempt(id: string): Promise<number> {
    const [row] = await this.database
      .update(pendingLogin)
      .set({ attempts: sql`${pendingLogin.attempts} + 1` })
      .where(eq(pendingLogin.id, id))
      .returning({ attempts: pendingLogin.attempts });

    return row?.attempts ?? 0;
  }

  async deletePendingLogin(id: string): Promise<void> {
    await this.database.delete(pendingLogin).where(eq(pendingLogin.id, id));
  }

  /** Ouvre les droits d'administration de cette session. */
  async unlockSession(id: string, at: Date): Promise<void> {
    await this.database.update(session).set({ adminUnlockedAt: at }).where(eq(session.id, id));
  }

  /*
    Ce que l'export lit, et rien de plus.

    Des dates, jamais une empreinte : ce que la personne peut vouloir savoir est
    « depuis quand et jusqu'à quand », pas de quoi rejouer une session
    (ADR 0017).
  */

  async listSessionsOf(
    accountId: string,
  ): Promise<{ createdAt: Date; lastSeenAt: Date; expiresAt: Date }[]> {
    return this.database
      .select({
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .where(eq(session.accountId, accountId))
      .orderBy(session.createdAt);
  }

  async listRememberedOf(accountId: string): Promise<{ createdAt: Date; expiresAt: Date }[]> {
    return this.database
      .select({ createdAt: rememberToken.createdAt, expiresAt: rememberToken.expiresAt })
      .from(rememberToken)
      .where(eq(rememberToken.accountId, accountId))
      .orderBy(rememberToken.createdAt);
  }

  /** Les codes de secours par leur numéro, et la date de leur usage. */
  async listBackupCodesOf(accountId: string): Promise<{ position: number; usedAt: Date | null }[]> {
    return this.database
      .select({ position: twoFactorBackupCode.position, usedAt: twoFactorBackupCode.usedAt })
      .from(twoFactorBackupCode)
      .where(eq(twoFactorBackupCode.accountId, accountId))
      .orderBy(twoFactorBackupCode.position);
  }

  // La réinitialisation d'un mot de passe oublié (ADR 0014).

  /**
   * Révoque le jeton vivant de ce compte, puis en écrit un neuf.
   *
   * Les deux dans la même transaction, et dans cet ordre, pour la raison de
   * l'ADR 0013 : l'index unique partiel n'autorise qu'un jeton vivant par
   * compte, et son prédicat ne peut pas tenir compte de l'expiration, `now()`
   * n'étant pas immuable. Un jeton expiré mais non révoqué occupe donc encore
   * l'index, et c'est ici qu'il cède la place.
   *
   * **L'insertion peut échouer en violation d'unicité**, et c'est voulu : deux
   * demandes simultanées ne voient ni l'une ni l'autre le jeton de sa voisine,
   * et l'index fait perdre la seconde. L'appelant reconnaît ce conflit et
   * s'arrête là, sans envoyer de second e-mail (ADR 0014).
   */
  async replaceLivePasswordReset(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
    at: Date;
  }): Promise<{ id: string }> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(passwordReset)
        .set({ revokedAt: input.at })
        .where(
          and(
            eq(passwordReset.accountId, input.accountId),
            isNull(passwordReset.usedAt),
            isNull(passwordReset.revokedAt),
          ),
        );

      const [created] = await transaction
        .insert(passwordReset)
        .values({
          accountId: input.accountId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning({ id: passwordReset.id });

      if (created === undefined) {
        throw new Error("l'insertion du jeton de réinitialisation n'a rien renvoyé");
      }

      return created;
    });
  }

  async findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRecord | undefined> {
    const [row] = await this.database
      .select({
        id: passwordReset.id,
        accountId: passwordReset.accountId,
        expiresAt: passwordReset.expiresAt,
        usedAt: passwordReset.usedAt,
        revokedAt: passwordReset.revokedAt,
      })
      .from(passwordReset)
      .where(eq(passwordReset.tokenHash, tokenHash))
      .limit(1);

    return row;
  }

  /**
   * Consomme un jeton, à condition qu'il soit vivant et non expiré.
   *
   * L'expiration est comparée ici, dans la même requête : la lire puis écrire
   * laisserait deux réinitialisations simultanées passer toutes les deux, et on
   * ne saurait pas lequel des deux mots de passe a gagné.
   */
  async consumePasswordReset(id: string, at: Date): Promise<boolean> {
    const used = await this.database
      .update(passwordReset)
      .set({ usedAt: at })
      .where(
        and(
          eq(passwordReset.id, id),
          isNull(passwordReset.usedAt),
          isNull(passwordReset.revokedAt),
          gte(passwordReset.expiresAt, at),
        ),
      )
      .returning({ id: passwordReset.id });

    return used.length > 0;
  }

  /**
   * Écrit le nouveau mot de passe et ferme tout ce que l'ancien avait ouvert.
   *
   * Une seule transaction, parce qu'on réinitialise souvent en soupçonnant un
   * vol : un mot de passe changé sans que les sessions tombent laisserait le
   * voleur dedans, et des sessions tombées sans que le mot de passe change
   * déconnecteraient le propriétaire pour rien (ADR 0014).
   *
   * Les attentes de connexion sont dans la liste, et ce n'est pas du zèle : une
   * attente est un mot de passe déjà validé qui n'attend plus qu'un code, donc
   * un état que le mot de passe qu'on remplace a ouvert.
   *
   * La double authentification, elle, n'est pas touchée : réinitialiser un mot
   * de passe ne désactive pas le second facteur.
   */
  async applyPasswordReset(input: {
    accountId: string;
    passwordHash: string;
    emailFingerprint: string;
    /** Depuis quand effacer les échecs : la fenêtre qui bloque, et rien avant. */
    failuresSince: Date;
  }): Promise<{ sessions: number; families: number }> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(account)
        .set({ passwordHash: input.passwordHash })
        .where(eq(account.id, input.accountId));

      const closedSessions = await transaction
        .delete(session)
        .where(eq(session.accountId, input.accountId))
        .returning({ id: session.id });

      const closedFamilies = await transaction
        .delete(rememberToken)
        .where(eq(rememberToken.accountId, input.accountId))
        .returning({ family: rememberToken.family });

      await transaction.delete(pendingLogin).where(eq(pendingLogin.accountId, input.accountId));

      // Les autres jetons du compte, qui ne valent plus rien. Celui qu'on vient
      // de consommer porte sa date d'usage, donc il reste : il dit ce qui s'est
      // passé, et il disparaîtra à son expiration.
      await transaction
        .delete(passwordReset)
        .where(and(eq(passwordReset.accountId, input.accountId), isNull(passwordReset.usedAt)));

      /*
        Les échecs de connexion comptés sur l'adresse de ce compte s'effacent.
        Sans cela, quelqu'un qui s'est trompé cinq fois avant de réinitialiser
        resterait bloqué avec le mot de passe tout neuf qu'il vient de choisir.

        Seul le motif `password` : `code` et `reauth` protègent le second
        facteur, que cette story ne touche pas. Les lignes `blocked` restent,
        pour la trace, et elles n'ont jamais été comptées (ADR 0014).

        Et seulement la fenêtre qui bloque : les échecs plus anciens ne
        comptent plus pour personne, et les effacer ferait perdre la trace de
        ce qui s'est passé avant, que la purge emporte de toute façon au bout
        d'un jour.
      */
      await transaction
        .delete(loginAttempt)
        .where(
          and(
            eq(loginAttempt.emailFingerprint, input.emailFingerprint),
            eq(loginAttempt.purpose, 'password'),
            eq(loginAttempt.outcome, 'failed'),
            gte(loginAttempt.attemptedAt, input.failuresSince),
          ),
        );

      return { sessions: closedSessions.length, families: closedFamilies.length };
    });
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
      this.database.delete(pendingLogin).where(lt(pendingLogin.expiresAt, now)),
      /*
        Les jetons de réinitialisation n'ont besoin de rien de plus que leur
        expiration : consommés ou révoqués, ils expirent de toute façon dans
        l'heure, et la table ne porte aucune adresse e-mail (ADR 0014).
      */
      this.database.delete(passwordReset).where(lt(passwordReset.expiresAt, now)),
    ]);
  }

  private async countAttemptsWhere(
    matches: SQL,
    since: Date,
    purpose: LoginPurpose,
    outcome: LoginOutcome,
  ): Promise<number> {
    const [row] = await this.database
      .select({ attempts: count() })
      .from(loginAttempt)
      .where(
        and(
          matches,
          eq(loginAttempt.outcome, outcome),
          eq(loginAttempt.purpose, purpose),
          gte(loginAttempt.attemptedAt, since),
        ),
      );

    return row?.attempts ?? 0;
  }
}
