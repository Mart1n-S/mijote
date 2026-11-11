import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';

import type { Database, Transaction } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import { invitation } from '../db/schema.js';

/*
  Les requêtes SQL des invitations.

  Le service ne voit jamais Drizzle : il déclare l'interface étroite de ce qu'il
  lit et écrit, et ce dépôt l'implémente. C'est le même procédé que pour la
  connexion, et c'est ce qui permet de mesurer la logique en mémoire tout en
  mesurant le SQL une fois, contre une vraie base.
*/

/** Une invitation, telle que le service la lit. */
export interface InvitationRecord {
  id: string;
  email: string;
  role: 'user' | 'admin';
  invitedBy: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const COLUMNS = {
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  invitedBy: invitation.invitedBy,
  expiresAt: invitation.expiresAt,
  usedAt: invitation.usedAt,
  revokedAt: invitation.revokedAt,
  createdAt: invitation.createdAt,
};

@Injectable()
export class InvitationRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * Révoque l'invitation vivante de cette adresse, puis en écrit une neuve.
   *
   * Les deux dans la même transaction, et dans cet ordre : l'index unique
   * partiel n'autorise qu'une invitation vivante par adresse, et son prédicat ne
   * peut pas tenir compte de l'expiration, `now()` n'étant pas immuable. Une
   * invitation expirée mais non révoquée occupe donc encore l'index, et c'est
   * ici qu'elle lui cède la place (ADR 0013).
   */
  async replaceLive(input: {
    email: string;
    role: 'user' | 'admin';
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
    at: Date;
  }): Promise<InvitationRecord> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(invitation)
        .set({ revokedAt: input.at })
        .where(
          and(
            eq(invitation.email, input.email),
            isNull(invitation.usedAt),
            isNull(invitation.revokedAt),
          ),
        );

      const [created] = await transaction
        .insert(invitation)
        .values({
          email: input.email,
          role: input.role,
          tokenHash: input.tokenHash,
          invitedBy: input.invitedBy,
          expiresAt: input.expiresAt,
        })
        .returning(COLUMNS);

      if (created === undefined) {
        throw new Error("l'insertion de l'invitation n'a rien renvoyé");
      }

      return created;
    });
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined> {
    const [row] = await this.database
      .select(COLUMNS)
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash))
      .limit(1);

    return row;
  }

  /**
   * L'invitation consommée de cette adresse, la plus récente.
   *
   * Lue par l'export : c'est celle qui a créé le compte, et elle appartient à la
   * personne qui part. Son jeton et son invitant ne sortent pas (ADR 0017).
   */
  async findUsedByEmail(email: string): Promise<InvitationRecord | undefined> {
    const [row] = await this.database
      .select(COLUMNS)
      .from(invitation)
      .where(and(eq(invitation.email, email), isNotNull(invitation.usedAt)))
      .orderBy(desc(invitation.usedAt))
      .limit(1);

    return row;
  }

  /** Les invitations, la plus récente d'abord. */
  async list(limit: number): Promise<InvitationRecord[]> {
    return this.database
      .select(COLUMNS)
      .from(invitation)
      .orderBy(desc(invitation.createdAt))
      .limit(limit);
  }

  /**
   * Révoque une invitation, à condition qu'elle soit encore en attente.
   *
   * Conditionnelle, comme toutes les écritures de ce genre dans le projet :
   * deux révocations simultanées ne peuvent pas toutes deux réussir, et une
   * invitation déjà consommée ne se révoque pas après coup.
   */
  async revoke(id: string, at: Date): Promise<boolean> {
    const revoked = await this.database
      .update(invitation)
      .set({ revokedAt: at })
      .where(and(eq(invitation.id, id), isNull(invitation.usedAt), isNull(invitation.revokedAt)))
      .returning({ id: invitation.id });

    return revoked.length > 0;
  }

  /**
   * Consomme une invitation, à condition qu'elle soit vivante et non expirée.
   *
   * L'expiration est comparée ici, dans la même requête : la lire puis écrire
   * laisserait deux acceptations simultanées créer deux comptes.
   */
  async consume(id: string, at: Date): Promise<boolean> {
    const used = await this.database
      .update(invitation)
      .set({ usedAt: at })
      .where(
        and(
          eq(invitation.id, id),
          isNull(invitation.usedAt),
          isNull(invitation.revokedAt),
          gte(invitation.expiresAt, at),
        ),
      )
      .returning({ id: invitation.id });

    return used.length > 0;
  }

  /** Combien cet administrateur en a envoyé depuis cette date. */
  async countByInviter(invitedBy: string, since: Date): Promise<number> {
    const [row] = await this.database
      .select({ sent: count() })
      .from(invitation)
      .where(and(eq(invitation.invitedBy, invitedBy), gte(invitation.createdAt, since)));

    return row?.sent ?? 0;
  }

  /** Combien cette adresse en a reçu depuis cette date. */
  async countByEmail(email: string, since: Date): Promise<number> {
    const [row] = await this.database
      .select({ received: count() })
      .from(invitation)
      .where(and(eq(invitation.email, email), gte(invitation.createdAt, since)));

    return row?.received ?? 0;
  }

  /**
   * Supprime les invitations **adressées** à cette adresse.
   *
   * Celles que ce compte a envoyées ne sont pas visées : elles portent
   * l'adresse d'autres personnes, et leur `invited_by` passe à `null` par la
   * clé étrangère (ADR 0017).
   */
  async deleteByEmailWithin(transaction: Transaction, email: string): Promise<number> {
    const deleted = await transaction
      .delete(invitation)
      .where(eq(invitation.email, email))
      .returning({ id: invitation.id });

    return deleted.length;
  }

  /**
   * Efface les invitations terminées, plus anciennes que ce seuil.
   *
   * Terminées veut dire consommées, révoquées ou expirées : elles ne servent
   * plus à rien, et elles portent une adresse e-mail en clair, donc elles n'ont
   * pas à rester (ADR 0013).
   */
  async purgeFinished(before: Date): Promise<void> {
    await this.database
      .delete(invitation)
      .where(
        and(
          lt(invitation.createdAt, before),
          or(
            lt(invitation.expiresAt, before),
            lt(invitation.usedAt, before),
            lt(invitation.revokedAt, before),
          ),
        ),
      );
  }
}
