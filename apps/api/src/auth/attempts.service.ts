import { Inject, Injectable } from '@nestjs/common';

import { fingerprint, readPepper } from '../security/pepper.js';

import { AuthRepository, type LoginOutcome, type LoginPurpose } from './auth.repository.js';

/*
  La limitation des tentatives de connexion.

  Elle compte deux choses séparément : les échecs sur une adresse soumise, et
  les échecs venus d'une IP. La première protège un compte visé, la seconde
  freine un balayage qui essaie beaucoup d'adresses.

  Les deux clés sont des empreintes HMAC, jamais les valeurs : une adresse
  e-mail et une adresse IP sont des données personnelles (security.md).
*/

/** Fenêtre glissante : les échecs plus anciens ne comptent plus. */
const WINDOW_MS = 15 * 60 * 1000;

/*
  Cinq échecs par adresse, vingt par IP. L'écart est voulu : un foyer partage
  une IP, et deux personnes qui se trompent ne doivent pas se bloquer
  l'une l'autre, là où cinq essais sur une même adresse en quinze minutes ne
  sont plus une main qui tremble.
*/
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** Les tentatives ne sont gardées qu'un jour, bien après la fenêtre. */
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Ce que la limitation lit et écrit, et rien de plus. */
export interface AttemptStore {
  countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
    purpose: LoginPurpose;
  }): Promise<{ byEmail: number; byIp: number }>;
  recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
    purpose: LoginPurpose;
  }): Promise<void>;
  purgeExpired(now: Date, attemptRetention: Date): Promise<void>;
}

/** Les deux clés d'une tentative, telles que la table les porte. */
export interface AttemptKeys {
  emailFingerprint: string;
  ipFingerprint: string;
}

@Injectable()
export class AttemptsService {
  /*
    Le poivre est lu au démarrage : sans lui, la limitation ne saurait pas
    compter, et l'application refuse de démarrer plutôt que de s'ouvrir sans
    cette protection.
  */
  private readonly pepper = readPepper(process.env);

  constructor(@Inject(AuthRepository) private readonly store: AttemptStore) {}

  /**
   * Les empreintes d'une tentative.
   *
   * Au stade du mot de passe, le sujet est l'adresse **soumise**, et non un
   * compte trouvé : sinon une adresse inconnue ne serait pas comptée, et un 429
   * qui n'arrive que sur les comptes existants dirait lesquels existent.
   *
   * Au stade du code, le compte est déjà connu, et c'est son identifiant qui
   * est compté. Les deux comptages restent séparés par `purpose` : un code mal
   * tapé ne doit pas rapprocher du blocage de la connexion elle-même.
   */
  keysFor(subject: string, ip: string): AttemptKeys {
    return {
      emailFingerprint: fingerprint(this.pepper, subject),
      ipFingerprint: fingerprint(this.pepper, ip),
    };
  }

  async isBlocked(keys: AttemptKeys, purpose: LoginPurpose = 'password'): Promise<boolean> {
    const since = new Date(Date.now() - WINDOW_MS);
    const failures = await this.store.countFailures({ ...keys, since, purpose });

    return failures.byEmail >= MAX_FAILURES_PER_EMAIL || failures.byIp >= MAX_FAILURES_PER_IP;
  }

  async record(
    keys: AttemptKeys,
    outcome: LoginOutcome,
    purpose: LoginPurpose = 'password',
  ): Promise<void> {
    await this.store.recordAttempt({ ...keys, outcome, purpose });
  }

  /**
   * Efface ce qui est périmé, à l'occasion d'une connexion réussie.
   *
   * Pas d'ordonnanceur : une connexion réussie est assez fréquente pour que
   * rien ne s'accumule, et assez rare pour que trois DELETE indexés ne coûtent
   * rien. Une purge accrochée à chaque tentative, elle, offrirait à un inconnu
   * le moyen de faire travailler la base.
   */
  async purge(): Promise<void> {
    const now = new Date();

    await this.store.purgeExpired(now, new Date(now.getTime() - ATTEMPT_RETENTION_MS));
  }
}
