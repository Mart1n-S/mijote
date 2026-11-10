import { type CreateInvitationInput, type Invitation, type InvitationStatus } from '@mijote/shared';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  type CreatedAccount,
  DEFAULT_HOUSEHOLD_NAME,
  type NewAccount,
} from '../accounts/account-creation.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { type AttemptKeys, AttemptsService } from '../auth/attempts.service.js';
import type { AuthLog } from '../auth/auth.log.js';
import type { AccountRecord } from '../auth/auth.repository.js';
import { readAppBaseUrl } from '../env.js';
import { ProblemException } from '../errors/problem.exception.js';
import { invitationEmail } from '../mail/templates/invitation.js';
import { type Mailer, MAILER } from '../mail/mailer.js';
import { createSecret, hashSecret } from '../security/tokens.js';

import { type InvitationRecord, InvitationRepository } from './invitation.repository.js';

/*
  Les invitations : la V1 est fermée, personne ne s'inscrit sans ticket.

  Une invitation ne rattache à rien : chaque invité crée son compte et son
  propre foyer, et le rôle choisi à l'invitation est son rôle dans
  l'application (ADR 0013).
*/

/** Soixante-douze heures, et c'est configurable. */
export const DEFAULT_TTL_HOURS = 72;

/*
  Dix par administrateur et par heure, trois par adresse et par jour.

  Pas de compteur nouveau : les invitations sont des lignes datées, donc elles
  se comptent elles-mêmes. La limite par adresse est la plus importante des
  deux : sans elle, notre serveur deviendrait un moyen d'inonder la boîte de
  quelqu'un.
*/
export const MAX_PER_INVITER_PER_HOUR = 10;
export const MAX_PER_EMAIL_PER_DAY = 3;

/** Les invitations terminées sont effacées après trente jours. */
export const FINISHED_RETENTION_DAYS = 30;

/** Combien la liste de l'administrateur en montre. */
const LIST_LIMIT = 200;

/**
 * Le seul message d'un lien qui ne vaut plus rien.
 *
 * Expiré, révoqué, déjà utilisé, inconnu, ou dont l'adresse a entre-temps un
 * compte : les cinq reçoivent celui-ci. Les distinguer dirait à qui tient le
 * lien si un compte existe (issue #12).
 */
const UNUSABLE = "Ce lien n'est plus valable. Demandez une nouvelle invitation.";

const EMAIL_TAKEN = 'Un compte existe déjà pour cette adresse.';

const TOO_MANY_SENT = "Trop d'invitations envoyées pour le moment. Réessayez dans un petit moment.";

const NOT_PENDING = "Cette invitation n'existe pas, ou elle n'est plus en attente.";

const TOO_MANY_ATTEMPTS = 'Trop de tentatives. Réessayez dans quelques minutes.';

/** L'état d'une invitation, déduit de ses dates. */
export function statusOf(record: InvitationRecord, now: Date): InvitationStatus {
  if (record.usedAt !== null) {
    return 'used';
  }

  if (record.revokedAt !== null) {
    return 'revoked';
  }

  return record.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending';
}

/**
 * Lit la durée de vie d'une invitation.
 *
 * Bornée : une invitation d'une heure serait inutilisable, et une invitation
 * d'un an n'est plus une invitation, c'est une porte ouverte.
 */
export function readTtlHours(env: NodeJS.ProcessEnv): number {
  const raw = env['INVITATION_TTL_HOURS']?.trim();

  if (raw === undefined || raw === '') {
    return DEFAULT_TTL_HOURS;
  }

  const hours = Number(raw);

  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new Error(
      `INVITATION_TTL_HOURS doit être un nombre entier d'heures entre 1 et 720. Voir .env.example.`,
    );
  }

  return hours;
}

/** Ce que les invitations lisent et écrivent des invitations, et rien de plus. */
export interface InvitationStore {
  findUsedByEmail(email: string): Promise<InvitationRecord | undefined>;
  replaceLive(input: {
    email: string;
    role: 'user' | 'admin';
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
    at: Date;
  }): Promise<InvitationRecord>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined>;
  list(limit: number): Promise<InvitationRecord[]>;
  revoke(id: string, at: Date): Promise<boolean>;
  consume(id: string, at: Date): Promise<boolean>;
  countByInviter(invitedBy: string, since: Date): Promise<number>;
  countByEmail(email: string, since: Date): Promise<number>;
  purgeFinished(before: Date): Promise<void>;
}

/** Ce qu'elles demandent au module des comptes, et rien de plus. */
export interface AccountGateway {
  isEmailTaken(email: string): Promise<boolean>;
  create(input: NewAccount): Promise<CreatedAccount>;
}

@Injectable()
export class InvitationsService {
  private readonly ttlHours = readTtlHours(process.env);

  /*
    Lue au démarrage, comme les autres réglages qui décident d'une adresse : une
    invitation partie vers le mauvais domaine ne se rattrape pas.
  */
  private readonly baseUrl = readAppBaseUrl(process.env);

  constructor(
    @Inject(InvitationRepository) private readonly invitations: InvitationStore,
    @Inject(AccountsService) private readonly accounts: AccountGateway,
    private readonly attempts: AttemptsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(InvitationsService.name);
  }

  /**
   * Crée une invitation et l'envoie.
   *
   * L'adresse qui a déjà un compte fait refuser, et avec un message clair :
   * l'administrateur est précisément la personne qui doit le savoir. Ce n'est
   * pas un oracle, la route demandant le rôle administrateur et son second
   * facteur.
   */
  async create(inviter: AccountRecord, input: CreateInvitationInput): Promise<Invitation> {
    if (await this.accounts.isEmailTaken(input.email)) {
      throw new ProblemException(HttpStatus.CONFLICT, EMAIL_TAKEN);
    }

    await this.refuseIfTooMany(inviter.id, input.email);

    const token = createSecret();
    const now = new Date();
    const record = await this.invitations.replaceLive({
      email: input.email,
      role: input.role,
      tokenHash: hashSecret(token),
      invitedBy: inviter.id,
      expiresAt: new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000),
      at: now,
    });

    /*
      Le jeton part dans le **fragment** du lien : un fragment n'est jamais
      envoyé au serveur, donc il ne paraît ni dans l'en-tête `Referer`, ni dans
      les journaux du mandataire. La page le lit et l'échange contre un POST.
    */
    await this.mailer.send(
      invitationEmail({ to: record.email, invitationUrl: `${this.baseUrl}/invitation#${token}` }),
    );

    // Ni le jeton, ni l'adresse : seulement de quoi retrouver la ligne.
    this.logger.info(
      { invitationId: record.id, role: record.role, invitedBy: inviter.id },
      'invitation envoyée',
    );

    await this.purge();

    return this.toView(record, now);
  }

  /**
   * L'invitation qui a créé le compte de cette adresse, pour l'export.
   *
   * Trois champs seulement : ni le jeton, qui est un authentifiant, ni qui a
   * invité, qui est l'identifiant de quelqu'un d'autre (ADR 0017).
   */
  async exportableFor(
    email: string,
  ): Promise<{ createdAt: string; usedAt: string | null; role: 'user' | 'admin' } | null> {
    const record = await this.invitations.findUsedByEmail(email);

    if (record === undefined) {
      return null;
    }

    return {
      createdAt: record.createdAt.toISOString(),
      usedAt: record.usedAt?.toISOString() ?? null,
      role: record.role,
    };
  }

  async list(): Promise<Invitation[]> {
    const now = new Date();

    return (await this.invitations.list(LIST_LIMIT)).map((record) => this.toView(record, now));
  }

  async revoke(actor: AccountRecord, id: string): Promise<void> {
    if (!(await this.invitations.revoke(id, new Date()))) {
      /*
        Déjà consommée, déjà révoquée, ou inexistante : le même refus. Un
        administrateur n'a pas besoin de savoir laquelle des trois, et le
        distinguer demanderait une lecture de plus.
      */
      throw new ProblemException(HttpStatus.NOT_FOUND, NOT_PENDING);
    }

    /*
      Qui a révoqué, et pas seulement quoi : c'est une action d'administration,
      donc elle est attribuée, comme l'envoi l'est par `invitedBy`
      (security.md). Les administrateurs administrent les invitations en
      commun, donc sans ce champ une révocation serait inattribuable.
    */
    this.logger.info({ invitationId: id, revokedBy: actor.id }, 'invitation révoquée');
  }

  /**
   * L'adresse que ce lien invite, pour que la page le dise avant de demander un
   * mot de passe.
   *
   * Rien d'autre ne sort : ni le rôle, ni qui a invité, ni la date.
   */
  async preview(token: string, clientIp: string): Promise<{ email: string }> {
    const keys = await this.guard(clientIp);
    const record = await this.usable(keys, token);

    await this.attempts.record(keys, 'succeeded', 'invitation');

    return { email: record.email };
  }

  /**
   * Accepte l'invitation : crée le compte et son foyer.
   *
   * L'ordre compte. L'invitation est consommée **avant** la création, par une
   * requête conditionnelle : deux acceptations simultanées ne peuvent donc pas
   * créer deux comptes, là où créer d'abord laisserait la seconde échouer sur
   * l'unicité de l'adresse après avoir haché un mot de passe.
   */
  async accept(token: string, password: string, clientIp: string): Promise<{ accountId: string }> {
    const keys = await this.guard(clientIp);
    const record = await this.usable(keys, token);

    if (!(await this.invitations.consume(record.id, new Date()))) {
      throw await this.countedRefusal(keys);
    }

    await this.attempts.record(keys, 'succeeded', 'invitation');

    const created = await this.accounts.create({
      email: record.email,
      password,
      role: record.role,
      householdName: DEFAULT_HOUSEHOLD_NAME,
    });

    this.logger.info(
      { invitationId: record.id, accountId: created.accountId, role: record.role },
      'invitation acceptée',
    );

    // Le seul identifiant, et rien de plus : l'adresse n'a aucune raison de
    // traverser une frontière de module pour n'y servir à personne.
    return { accountId: created.accountId };
  }

  /**
   * Efface les invitations terminées depuis trente jours.
   *
   * Accrochée à la création d'une invitation : c'est assez fréquent pour que
   * rien ne s'accumule, et assez rare pour ne rien coûter. Le même procédé que
   * la purge de la connexion.
   */
  async purge(): Promise<void> {
    const before = new Date(Date.now() - FINISHED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      await this.invitations.purgeFinished(before);
    } catch (error) {
      /*
        L'erreur s'arrête ici, et c'est voulu : la purge vient après un e-mail
        parti et une ligne écrite. La laisser remonter rendrait un 500 à
        l'administrateur pour une invitation qui est, elle, bien chez l'invité.
      */
      this.logger.warn({ reason: String(error) }, 'purge des invitations impossible');
    }
  }

  /**
   * La limitation des deux routes publiques, et les clés qui comptent.
   *
   * Elle porte sur l'adresse IP, et sur elle seule : le jeton est hors de
   * portée d'une recherche exhaustive, mais l'acceptation hache un mot de
   * passe et l'aperçu lit en base, et aucune des deux n'a à pouvoir être
   * sollicitée sans borne par un inconnu.
   *
   * L'IP est passée comme sujet **et** comme IP : les deux compteurs de
   * `AttemptsService` tiennent alors la même valeur, et la borne effective est
   * la plus basse des deux, cinq essais ratés par quart d'heure. Personne n'en
   * fait plus d'un ou deux de bonne foi.
   */
  private async guard(clientIp: string): Promise<AttemptKeys> {
    const keys = this.attempts.keysFor(clientIp, clientIp);

    if (await this.attempts.isBlocked(keys, 'invitation')) {
      await this.attempts.record(keys, 'blocked', 'invitation');

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    return keys;
  }

  /**
   * L'invitation que ce jeton désigne, si elle vaut encore quelque chose.
   *
   * Les cinq cas sont traités ici, pour les deux routes publiques : un lien
   * inconnu, expiré, révoqué, déjà utilisé, ou dont l'adresse a entre-temps un
   * compte. Le même refus pour les cinq, et au même endroit, pour que l'aperçu
   * ne dise pas oui à ce que l'acceptation refusera.
   */
  private async usable(keys: AttemptKeys, token: string): Promise<InvitationRecord> {
    const record = await this.refuseAndCount(keys, () => this.live(token));

    /*
      L'adresse a pu obtenir un compte entre l'envoi et la lecture du lien. Le
      refus est le même que pour un lien expiré : dire « un compte existe
      déjà » apprendrait à qui tient le lien qu'il en existe un.
    */
    if (await this.accounts.isEmailTaken(record.email)) {
      throw await this.countedRefusal(keys);
    }

    return record;
  }

  /** Compte l'échec, et rend le refus à lever. */
  private async countedRefusal(keys: AttemptKeys): Promise<ProblemException> {
    await this.attempts.record(keys, 'failed', 'invitation');

    return new ProblemException(HttpStatus.GONE, UNUSABLE);
  }

  /** Compte l'échec quand l'appel refuse, et laisse passer le refus. */
  private async refuseAndCount<Result>(
    keys: AttemptKeys,
    run: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await run();
    } catch (error) {
      await this.attempts.record(keys, 'failed', 'invitation');

      throw error;
    }
  }

  /** L'invitation que porte ce jeton, si elle est encore en attente. */
  private async live(token: string): Promise<InvitationRecord> {
    const record = await this.invitations.findByTokenHash(hashSecret(token));

    if (record === undefined || statusOf(record, new Date()) !== 'pending') {
      throw new ProblemException(HttpStatus.GONE, UNUSABLE);
    }

    return record;
  }

  private async refuseIfTooMany(inviterId: string, email: string): Promise<void> {
    const now = Date.now();
    const [byInviter, byEmail] = await Promise.all([
      this.invitations.countByInviter(inviterId, new Date(now - 60 * 60 * 1000)),
      this.invitations.countByEmail(email, new Date(now - 24 * 60 * 60 * 1000)),
    ]);

    if (byInviter >= MAX_PER_INVITER_PER_HOUR || byEmail >= MAX_PER_EMAIL_PER_DAY) {
      this.logger.warn({ invitedBy: inviterId }, "envoi d'invitation bloqué par la limitation");

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_SENT);
    }
  }

  private toView(record: InvitationRecord, now: Date): Invitation {
    return {
      id: record.id,
      email: record.email,
      role: record.role,
      status: statusOf(record, now),
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
    };
  }
}
