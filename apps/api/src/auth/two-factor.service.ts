import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from '../errors/problem.exception.js';
import { type BackupCode, createBackupCodes, parseBackupCode } from '../security/backup-codes.js';
import { decrypt, encrypt, readEncryptionKey } from '../security/encryption.js';
import { decoyPasswordDigest, hashPassword, verifyPassword } from '../security/passwords.js';
import { createTotpSecret, totpUri, verifyTotpCode } from '../security/totp.js';

import type { AuthLog } from './auth.log.js';
import {
  type AccountRecord,
  AuthRepository,
  type BackupCodeRecord,
  type TwoFactorRecord,
} from './auth.repository.js';

/*
  La double authentification : inscription, activation, vérification.

  Elle ne concerne que l'administrateur dans ce lot, et pour lui elle est
  obligatoire : sans elle, aucune route d'administration ne l'accepte (ADR
  0012).
*/

/** Le nom qui apparaît dans l'application d'authentification. */
const ISSUER = 'Mijote';

/** Six chiffres : la forme d'un code du téléphone. */
const TOTP_CODE = /^\d{6}$/;

/**
 * Le verdict d'un code soumis.
 *
 * `invalid` couvre tout ce qui dépend de la base : un code faux, un code de
 * secours déjà consommé, un numéro qui n'existe pas, un rejeu. Ils partagent
 * le même message et le même temps de réponse. `malformed` est le seul cas
 * distinct, parce qu'il ne dépend d'aucune donnée : une suite de lettres sans
 * son numéro.
 */
export type CodeVerdict = 'totp' | 'backup' | 'invalid' | 'malformed';

const ALREADY_ACTIVE = 'La double authentification est déjà active sur ce compte.';
const NOT_ACTIVE = "La double authentification n'est pas active sur ce compte.";
const NO_SETUP = "Aucune inscription en cours : recommencez l'activation.";

/** Ce que la double authentification lit et écrit, et rien de plus. */
export interface TwoFactorStore {
  findTwoFactor(accountId: string): Promise<TwoFactorRecord | undefined>;
  upsertInactiveTwoFactor(accountId: string, secretCipher: string): Promise<boolean>;
  activateTwoFactor(
    accountId: string,
    at: Date,
    verifiedCipher: string,
    codes: { position: number; codeHash: string }[],
  ): Promise<boolean>;
  deleteTwoFactor(accountId: string): Promise<void>;
  claimTotpStep(accountId: string, step: number): Promise<boolean>;
  findBackupCode(accountId: string, position: number): Promise<BackupCodeRecord | undefined>;
  consumeBackupCode(id: string, at: Date): Promise<boolean>;
}

@Injectable()
export class TwoFactorService {
  /*
    La clé est lue au démarrage : une API qui démarrerait sans elle refuserait
    toutes les connexions des administrateurs, et le dirait au premier code
    plutôt qu'au lancement.
  */
  private readonly key = readEncryptionKey(process.env);

  constructor(
    @Inject(AuthRepository) private readonly store: TwoFactorStore,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(TwoFactorService.name);
  }

  async isActive(accountId: string): Promise<boolean> {
    const record = await this.store.findTwoFactor(accountId);

    /*
      Les deux conditions, écrites en entier : une ligne absente et une ligne
      inactive sont deux choses différentes, et `?.activatedAt !== null` rendait
      vrai pour la première, `undefined` n'étant pas `null`. Mesuré par les
      tests de la connexion, qui réclamaient un code à des comptes sans second
      facteur.
    */
    return record !== undefined && record.activatedAt !== null;
  }

  /**
   * Depuis quand le second facteur est actif, ou `null` s'il ne l'est pas.
   *
   * Une ligne absente et une ligne inactive donnent le même `null` : du point
   * de vue de l'appelant, les deux veulent dire « pas de second facteur ».
   */
  async activatedAt(accountId: string): Promise<Date | null> {
    return (await this.store.findTwoFactor(accountId))?.activatedAt ?? null;
  }

  /**
   * Engendre un secret et rend de quoi l'inscrire.
   *
   * L'appelant a déjà vérifié le mot de passe : sans cela, une session volée
   * d'un administrateur sans second facteur inscrirait l'application de
   * l'attaquant, obtiendrait l'administration et verrouillerait le
   * propriétaire.
   *
   * Ni l'URI ni la clé ne sont journalisées : elles contiennent le secret.
   */
  async startSetup(account: AccountRecord): Promise<{ uri: string; key: string }> {
    const secret = createTotpSecret();
    const written = await this.store.upsertInactiveTwoFactor(
      account.id,
      encrypt(this.key, account.id, secret),
    );

    if (!written) {
      // La ligne existe et elle est active : seule la désactivation en change.
      throw new ProblemException(HttpStatus.CONFLICT, ALREADY_ACTIVE);
    }

    this.logger.info({ accountId: account.id }, 'inscription de la double authentification');

    return { uri: totpUri({ secret, account: account.email, issuer: ISSUER }), key: secret };
  }

  /**
   * Confirme l'inscription par un premier code, et rend les codes de secours.
   *
   * Rend un verdict et non un tableau vide quand le code est faux : c'est
   * l'appelant qui compte l'essai et qui refuse, comme sur les trois autres
   * chemins de code.
   *
   * Les dix empreintes Argon2id coûtent un peu plus d'une seconde, une fois
   * par activation : c'est le prix de codes qui résistent à une base volée.
   */
  async activate(
    accountId: string,
    code: string,
  ): Promise<{ verdict: CodeVerdict; codes: BackupCode[] }> {
    const record = await this.store.findTwoFactor(accountId);

    if (record === undefined) {
      throw new ProblemException(HttpStatus.CONFLICT, NO_SETUP);
    }

    if (record.activatedAt !== null) {
      throw new ProblemException(HttpStatus.CONFLICT, ALREADY_ACTIVE);
    }

    const verdict = await this.verifyTotp(record, code);

    if (verdict !== 'totp') {
      return { verdict, codes: [] };
    }

    const codes = createBackupCodes();
    const hashed = await Promise.all(
      codes.map(async (backup) => ({
        position: backup.position,
        codeHash: await hashPassword(backup.secret),
      })),
    );

    /*
      Le secret vérifié est repassé au dépôt : s'il a changé entre-temps, par un
      `setup` simultané, l'activation ne confirme rien et les codes ne sont pas
      posés.
    */
    if (!(await this.store.activateTwoFactor(accountId, new Date(), record.secretCipher, hashed))) {
      throw new ProblemException(HttpStatus.CONFLICT, NO_SETUP);
    }

    this.logger.info({ accountId }, 'double authentification activée');

    return { verdict, codes };
  }

  /**
   * Vérifie un code du téléphone ou un code de secours.
   *
   * La forme du code décide du chemin : six chiffres pour le téléphone, un
   * numéro suivi de douze lettres pour un code de secours. Les deux répondent
   * la même chose quand ils échouent.
   *
   * Le temps, lui, est égal **à l'intérieur** de chaque chemin, et non entre
   * les deux : le code de secours paie une empreinte Argon2id que le code du
   * téléphone ne paie pas. Ce n'est pas une fuite, la forme de la saisie disant
   * déjà lequel a été pris, mais il ne faut pas croire cette égalité garantie.
   */
  async verifyCode(accountId: string, code: string): Promise<CodeVerdict> {
    const record = await this.store.findTwoFactor(accountId);

    if (record === undefined || record.activatedAt === null) {
      return 'invalid';
    }

    if (TOTP_CODE.test(code.replace(/\s/g, ''))) {
      return this.verifyTotp(record, code);
    }

    return this.verifyBackupCode(accountId, code);
  }

  async disable(accountId: string): Promise<void> {
    const record = await this.store.findTwoFactor(accountId);

    if (record === undefined || record.activatedAt === null) {
      throw new ProblemException(HttpStatus.CONFLICT, NOT_ACTIVE);
    }

    await this.store.deleteTwoFactor(accountId);
    this.logger.warn({ accountId }, 'double authentification désactivée');
  }

  /**
   * Le code du téléphone, et la fermeture du rejeu.
   *
   * Le pas accepté est retenu par une seule requête conditionnelle : deux
   * soumissions simultanées du même code ne peuvent pas passer toutes les
   * deux, et le même code ne repasse pas dans sa fenêtre.
   */
  private async verifyTotp(record: TwoFactorRecord, code: string): Promise<CodeVerdict> {
    const secret = decrypt(this.key, record.accountId, record.secretCipher);
    const step = verifyTotpCode(secret, code, new Date());

    if (step === undefined) {
      return 'invalid';
    }

    return (await this.store.claimTotpStep(record.accountId, step)) ? 'totp' : 'invalid';
  }

  private async verifyBackupCode(accountId: string, code: string): Promise<CodeVerdict> {
    const presented = parseBackupCode(code);

    if (presented === undefined) {
      return 'malformed';
    }

    const row = await this.store.findBackupCode(accountId, presented.position);
    /*
      Un numéro qui n'existe pas paie quand même une vérification, contre
      l'empreinte leurre : sans cela, le temps de réponse dirait combien de
      codes existent, et lesquels ont déjà servi.
    */
    const digest = row?.codeHash ?? (await decoyPasswordDigest());
    const matches = await verifyPassword(digest, presented.secret);

    if (row === undefined || row.usedAt !== null || !matches) {
      return 'invalid';
    }

    if (!(await this.store.consumeBackupCode(row.id, new Date()))) {
      // Consommé entre-temps par une requête sœur : un code ne sert qu'une fois.
      return 'invalid';
    }

    this.logger.warn({ accountId, position: presented.position }, 'code de secours utilisé');

    return 'backup';
  }
}
