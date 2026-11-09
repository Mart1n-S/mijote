import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { isUniqueViolation, readPostgresCode } from '../db/postgres-error.js';
import { readAppBaseUrl } from '../env.js';
import { ProblemException } from '../errors/problem.exception.js';
import { type Mailer, MAILER } from '../mail/mailer.js';
import { passwordResetEmail } from '../mail/templates/password-reset.js';
import { createSecret, hashSecret } from '../security/tokens.js';

import { type AttemptKeys, AttemptsService } from './attempts.service.js';
import type { AuthLog } from './auth.log.js';
import { type AccountRecord, AuthRepository } from './auth.repository.js';

/*
  La réinitialisation d'un mot de passe oublié (ADR 0014).

  Tout ce fichier tourne autour d'une contrainte : **la réponse ne doit pas dire
  si l'adresse a un compte**, ni par son message, ni par son statut, ni par son
  temps. L'empreinte leurre qui égalise le temps de la connexion ne se
  transpose pas ici, faute d'envoi d'e-mail leurre : la demande ne fait donc
  que compter, répondre, et lancer le reste détaché.
*/

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Une heure, comme l'exige l'issue #13.
 *
 * En constante et non en variable d'environnement, contrairement à la durée
 * d'une invitation : une invitation s'envoie à l'avance et s'attend parfois un
 * jour ou deux, une réinitialisation se fait dans la minute où on l'a
 * demandée. Une heure laisse la place à un e-mail qui tarde sans laisser un
 * lien utilisable traîner dans une boîte.
 */
export const RESET_TTL_MS = HOUR_MS;

/*
  Trois plafonds, et chacun sa raison.

  Les trois par heure et par adresse bornent une rafale : personne ne demande
  mieux que trois fois en une heure de bonne foi. Les dix par jour bornent
  l'acharnement, que l'heure ne borne pas (vingt-quatre heures en donneraient
  soixante-douze). Ce n'est pas le trois par jour des invitations, et la
  différence est dans qui demande : une invitation est subie, une
  réinitialisation est demandée par celui qui tape l'adresse, et quelqu'un qui
  cherche vraiment son e-mail peut légitimement redemander dans la journée.

  Les vingt par heure et par IP freinent un balayage. Pas de plafond quotidien
  par IP : un foyer partage une adresse, un réseau d'opérateur mobile en partage
  une pour des milliers de personnes, et l'heure borne déjà ce chemin.
*/
export const MAX_PER_EMAIL_PER_HOUR = 3;
export const MAX_PER_EMAIL_PER_DAY = 10;
export const MAX_PER_IP_PER_HOUR = 20;

/**
 * Le chemin de l'écran qui reçoit le lien.
 *
 * Il doit rester celui de la route `reset-password` de apps/web/src/routes.ts :
 * les deux ne peuvent pas être lus au même endroit, apps/api et apps/web ne
 * s'important jamais l'un l'autre.
 */
const RESET_PATH = '/mot-de-passe/reinitialisation';

const TOO_MANY_REQUESTS = 'Trop de demandes de réinitialisation. Réessayez dans un petit moment.';

/** Ce que la réinitialisation lit des comptes, et rien de plus. */
export interface ResetAccountStore {
  findAccountByEmail(email: string): Promise<AccountRecord | undefined>;
}

/** Ce qu'elle écrit de ses jetons, et rien de plus. */
export interface PasswordResetStore {
  replaceLivePasswordReset(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
    at: Date;
  }): Promise<{ id: string }>;
}

@Injectable()
export class PasswordResetService {
  /*
    Lue au démarrage, comme pour les invitations : c'est elle qui décide du
    domaine vers lequel part un jeton, et jamais l'en-tête `Host`.
  */
  private readonly baseUrl = readAppBaseUrl(process.env);

  /*
    Les travaux détachés en cours. Rien ne les attend en production, c'est tout
    leur intérêt : ils existent ici pour que les tests puissent les attendre, et
    donc mesurer ce qui part après la réponse.
  */
  private readonly running = new Set<Promise<void>>();

  constructor(
    @Inject(AuthRepository) private readonly accounts: ResetAccountStore,
    @Inject(AuthRepository) private readonly resets: PasswordResetStore,
    private readonly attempts: AttemptsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(PasswordResetService.name);
  }

  /**
   * Demande un lien de réinitialisation pour cette adresse.
   *
   * Trois choses, et elles sont **identiques que l'adresse ait un compte ou
   * non** : la limitation est consultée, la demande est comptée, et le reste
   * part détaché. Les deux chemins exécutent donc le même nombre de requêtes
   * SQL, et la réponse n'attend aucun envoi.
   *
   * Sans cela, le temps de réponse publierait la liste des comptes : un envoi
   * SMTP prend de quelques dizaines de millisecondes à dix secondes, et il
   * n'aurait lieu que pour une adresse connue.
   */
  async request(email: string, clientIp: string): Promise<void> {
    const keys = this.attempts.keysFor(email, clientIp);

    await this.refuseIfTooMany(keys);
    await this.attempts.record(keys, 'succeeded', 'reset_request');

    /*
      Rien n'est journalisé ici, pas même les empreintes. Avec une ligne
      « demande reçue » portant l'empreinte et une ligne « lien envoyé »
      portant l'identifiant du compte, le même identifiant de requête
      relierait les deux : qui lit les journaux et détient le poivre pourrait
      confirmer qu'une adresse devinée a un compte ici (ADR 0010, ADR 0014).
    */
    this.detach(this.sendLink(email));
  }

  /**
   * Attend les travaux détachés en cours. **Réservé aux tests.**
   *
   * En production personne n'attend : une route qui attendrait son envoi
   * redonnerait au temps de réponse le moyen de dire quels comptes existent.
   */
  async waitForDetachedWork(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all([...this.running]);
    }
  }

  /**
   * Lance un travail que la réponse n'attend pas.
   *
   * `sendLink` n'échoue jamais : il attrape tout. C'est indispensable, une
   * promesse rejetée sans gestionnaire faisant tomber le processus Node, ce qui
   * donnerait à une route publique le moyen de l'arrêter.
   */
  private detach(task: Promise<void>): void {
    this.running.add(task);

    // Pas attendue, c'est le principe. Le `finally` ne peut pas rejeter, la
    // tâche ne rejetant jamais.
    void task.finally(() => this.running.delete(task));
  }

  /** Pose le jeton et envoie le lien, s'il y a un compte derrière cette adresse. */
  private async sendLink(email: string): Promise<void> {
    let accountId: string | undefined;

    try {
      const account = await this.accounts.findAccountByEmail(email);

      if (account === undefined) {
        /*
          Rien à faire, et surtout rien à dire : la réponse est déjà partie, et
          c'était la même que pour une adresse connue.
        */
        return;
      }

      accountId = account.id;

      const token = createSecret();
      const now = new Date();
      const created = await this.resets.replaceLivePasswordReset({
        accountId: account.id,
        tokenHash: hashSecret(token),
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
        at: now,
      });

      /*
        Le jeton part dans le **fragment** du lien : un fragment n'est jamais
        envoyé au serveur, donc il ne paraît ni dans l'en-tête `Referer`, ni
        dans les journaux du mandataire. La page le lit et l'échange contre un
        POST (ADR 0013, ADR 0014).
      */
      await this.mailer.send(
        passwordResetEmail({
          to: account.email,
          resetUrl: `${this.baseUrl}${RESET_PATH}#${token}`,
        }),
      );

      // De quoi retrouver la ligne, et rien d'autre : ni le jeton, ni
      // l'adresse, ni son empreinte.
      this.logger.info(
        { resetId: created.id, accountId: account.id },
        'lien de réinitialisation envoyé',
      );
    } catch (error) {
      this.giveUp(error, accountId);
    }
  }

  /**
   * Abandonne le travail détaché, en disant pourquoi au journal.
   *
   * L'erreur ne remonte pas : la réponse est partie depuis longtemps, et rien
   * ne peut plus la changer.
   */
  private giveUp(error: unknown, accountId: string | undefined): void {
    if (isUniqueViolation(error)) {
      /*
        Deux demandes simultanées pour la même adresse : aucune des deux
        transactions n'a vu le jeton de sa voisine, et l'index unique partiel en
        a fait perdre une. On s'arrête là, et **aucun second e-mail ne part** :
        l'autre demande vient de poser un jeton valable et d'écrire à la même
        adresse. Réessayer révoquerait ce jeton tout neuf et enverrait un second
        message dont le premier lien serait déjà mort (ADR 0014).
      */
      this.logger.info({ accountId }, 'demande de réinitialisation déjà traitée par une autre');

      return;
    }

    /*
      Le type et le code de PostgreSQL, jamais le message : Drizzle place la
      requête **et ses paramètres** dans le message de ses erreurs, et l'un de
      ces paramètres est une adresse e-mail (ADR 0010, et le même soin que dans
      `smtp.mailer.ts`).
    */
    this.logger.warn(
      {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
        code: readPostgresCode(error),
      },
      'envoi du lien de réinitialisation impossible',
    );
  }

  /**
   * Refuse quand un plafond est atteint, et compte le refus.
   *
   * Les demandes **acceptées** sont ce qui compte, et non des échecs : une
   * demande n'échoue jamais du point de vue du client. Les `blocked` sont
   * écrites pour la trace et jamais comptées, sinon un inconnu maintiendrait
   * une adresse bloquée en insistant (ADR 0010).
   *
   * Le sujet compté est l'adresse **soumise**, jamais un compte trouvé : sinon
   * une adresse inconnue ne serait pas comptée du tout, et un 429 qui n'arrive
   * que sur les comptes existants dirait lesquels existent.
   */
  private async refuseIfTooMany(keys: AttemptKeys): Promise<void> {
    const [hour, day] = await Promise.all([
      this.attempts.countRecent(keys, {
        purpose: 'reset_request',
        outcome: 'succeeded',
        windowMs: HOUR_MS,
      }),
      this.attempts.countRecent(keys, {
        purpose: 'reset_request',
        outcome: 'succeeded',
        windowMs: DAY_MS,
      }),
    ]);

    if (
      hour.byEmail >= MAX_PER_EMAIL_PER_HOUR ||
      hour.byIp >= MAX_PER_IP_PER_HOUR ||
      day.byEmail >= MAX_PER_EMAIL_PER_DAY
    ) {
      await this.attempts.record(keys, 'blocked', 'reset_request');
      // Les empreintes et rien d'autre, comme la connexion bloquée : elles
      // suffisent à relier les lignes sans écrire ni l'adresse ni l'IP.
      this.logger.warn(keys, 'demande de réinitialisation bloquée par la limitation');

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_REQUESTS);
    }
  }
}
