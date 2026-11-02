import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createSecret, hashesMatch, hashSecret } from '../security/tokens.js';

import { REMEMBER_TTL_MS } from './auth.cookies.js';
import type { AuthLog } from './auth.log.js';
import { AuthRepository, type RememberRecord } from './auth.repository.js';

/*
  « Se souvenir de moi », par familles de jetons.

  Le cookie porte deux choses : la famille, en clair, qui retrouve la ligne, et
  un secret, dont seule l'empreinte est stockée. Le secret est remplacé à chaque
  usage, et l'ancien reste accepté pendant un court délai de grâce.

  C'est ce couple qui permet de distinguer un rejeu d'un jeton inconnu : un
  secret périmé **pour une famille qui existe** ne peut venir que d'une copie du
  cookie, donc toute la famille est révoquée. Sans les familles, un vol ne se
  verrait jamais.
*/

/** Le séparateur du cookie. Ni l'UUID ni le base64url ne contiennent de point. */
const SEPARATOR = '.';

/*
  Trente secondes de grâce après une rotation.

  Deux onglets qui se chargent en même temps présentent le même cookie : le
  premier fait tourner le secret, le second arrive avec l'ancien. Sans ce délai,
  ce second appel passerait pour un vol et déconnecterait l'appareil.
*/
export const REMEMBER_GRACE_MS = 30 * 1000;

/** Ce que la mémorisation lit et écrit, et rien de plus. */
export interface RememberStore {
  createRememberToken(input: {
    accountId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<string>;
  findRememberFamily(family: string): Promise<RememberRecord | undefined>;
  rotateRememberSecret(
    family: string,
    change: { secretHash: string; previousSecretHash: string; rotatedAt: Date },
  ): Promise<void>;
  deleteRememberFamily(family: string): Promise<void>;
}

/**
 * Le résultat d'un cookie de mémorisation présenté.
 *
 * `refreshed` ne porte un cookie que lorsque le secret a tourné. Dans le délai
 * de grâce, il n'y en a pas : le navigateur a déjà reçu le nouveau cookie de la
 * requête qui a fait tourner le secret, et lui en poser un ancien le défairait.
 */
export interface ResumedFamily {
  accountId: string;
  refreshed: string | undefined;
}

@Injectable()
export class RememberService {
  constructor(
    @Inject(AuthRepository) private readonly store: RememberStore,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(RememberService.name);
  }

  /** Ouvre une famille et rend la valeur du cookie. */
  async issue(accountId: string): Promise<string> {
    const secret = createSecret();
    const family = await this.store.createRememberToken({
      accountId,
      secretHash: hashSecret(secret),
      expiresAt: new Date(Date.now() + REMEMBER_TTL_MS),
    });

    return `${family}${SEPARATOR}${secret}`;
  }

  async consume(cookieValue: string): Promise<ResumedFamily | undefined> {
    const presented = split(cookieValue);

    if (presented === undefined) {
      return undefined;
    }

    const record = await this.store.findRememberFamily(presented.family);

    if (record === undefined) {
      // Famille inconnue : un cookie périmé qu'une purge a déjà effacé, ou une
      // valeur inventée. Rien à révoquer, rien à signaler.
      return undefined;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.store.deleteRememberFamily(record.family);

      return undefined;
    }

    const secretHash = hashSecret(presented.secret);

    if (hashesMatch(record.secretHash, secretHash)) {
      return { accountId: record.accountId, refreshed: await this.rotate(record) };
    }

    if (this.isWithinGrace(record, secretHash)) {
      return { accountId: record.accountId, refreshed: undefined };
    }

    /*
      Un secret qui ne correspond plus, hors délai de grâce : le cookie a été
      copié, et c'est le voleur ou la victime qui arrive ici. On ne peut pas
      savoir lequel, donc on ferme la famille entière.

      La ligne de journal ne porte que des identifiants internes : le compte
      visé doit être retrouvable, mais ni l'adresse ni le secret n'ont à y être.
    */
    await this.store.deleteRememberFamily(record.family);
    this.logger.warn(
      { family: record.family, accountId: record.accountId },
      'jeton de mémorisation rejoué : famille révoquée',
    );

    return undefined;
  }

  /** Ferme la famille portée par ce cookie, si elle appartient au compte. */
  async revoke(cookieValue: string, accountId: string): Promise<void> {
    const presented = split(cookieValue);

    if (presented === undefined) {
      return;
    }

    const record = await this.store.findRememberFamily(presented.family);

    /*
      L'appartenance est vérifiée côté serveur : la famille vient d'un cookie,
      donc du client, et un identifiant reçu du client n'est jamais une preuve
      d'appartenance (security.md). Sans ce contrôle, une valeur fabriquée
      déconnecterait l'appareil de quelqu'un d'autre.
    */
    if (record !== undefined && record.accountId === accountId) {
      await this.store.deleteRememberFamily(record.family);
    }
  }

  private async rotate(record: RememberRecord): Promise<string> {
    const secret = createSecret();

    await this.store.rotateRememberSecret(record.family, {
      secretHash: hashSecret(secret),
      previousSecretHash: record.secretHash,
      rotatedAt: new Date(),
    });

    return `${record.family}${SEPARATOR}${secret}`;
  }

  private isWithinGrace(record: RememberRecord, secretHash: string): boolean {
    if (record.previousSecretHash === null || record.rotatedAt === null) {
      return false;
    }

    return (
      hashesMatch(record.previousSecretHash, secretHash) &&
      Date.now() - record.rotatedAt.getTime() <= REMEMBER_GRACE_MS
    );
  }
}

/** Sépare la famille du secret, ou rien si la valeur n'a pas cette forme. */
function split(cookieValue: string): { family: string; secret: string } | undefined {
  const separator = cookieValue.indexOf(SEPARATOR);

  if (separator <= 0 || separator === cookieValue.length - 1) {
    return undefined;
  }

  return {
    family: cookieValue.slice(0, separator),
    secret: cookieValue.slice(separator + 1),
  };
}
