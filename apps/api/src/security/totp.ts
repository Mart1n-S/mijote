import { createHmac, randomBytes } from 'node:crypto';

import { decodeBase32, encodeBase32 } from './base32.js';
import { hashesMatch } from './tokens.js';

/*
  TOTP, RFC 6238, par-dessus HOTP, RFC 4226.

  Écrit ici et non pris dans une bibliothèque, pour une raison qui n'est pas
  l'économie : **les deux RFC publient leurs vecteurs de test**. Cette
  implémentation se mesure donc contre une référence officielle, ce qu'aucune
  relecture de dépendance ne donne. L'algorithme tient en trente lignes et ne
  bougera plus (ADR 0012).
*/

/** Vingt octets, comme la RFC 4226 le prescrit pour HMAC-SHA1. */
const SECRET_BYTES = 20;

/** Trente secondes par pas, six chiffres : ce que font toutes les applications. */
export const STEP_SECONDS = 30;
const DIGITS = 6;

/*
  Une fenêtre de tolérance de part et d'autre, soit 90 secondes acceptées en
  tout. Pas deux : chaque pas de plus double les codes valables à un instant
  donné, et une horloge de téléphone qui dérive de plus de trente secondes est
  un cas rare, que le code de secours couvre.
*/
export const TOLERANCE_STEPS = 1;

/** Un secret TOTP neuf, en base32, prêt à être lu par une application. */
export function createTotpSecret(): string {
  return encodeBase32(randomBytes(SECRET_BYTES));
}

/** Le pas de trente secondes qui contient cette date. */
export function stepAt(date: Date): number {
  return Math.floor(date.getTime() / 1000 / STEP_SECONDS);
}

/**
 * Le code d'un pas donné, par la troncature dynamique de la RFC 4226.
 *
 * `digits` n'existe que pour les vecteurs de test, qui sont donnés sur huit
 * chiffres ; l'application n'en demande jamais que six.
 */
export function totpCode(secret: string, step: number, digits: number = DIGITS): string {
  const counter = Buffer.alloc(8);

  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  /*
    Les quatre bits de poids faible du dernier octet disent où lire : c'est la
    troncature dynamique, et c'est ce qui évite de toujours lire le même
    morceau du condensé.
  */
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7f_ff_ff_ff;

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/**
 * Le pas dont ce code est celui attendu, ou rien.
 *
 * Rend le pas, et non un booléen : c'est lui que la base retient pour refuser
 * le rejeu du même code dans sa fenêtre.
 *
 * Les trois candidats sont tous comparés, sans sortie anticipée, et à temps
 * constant : le temps de réponse ne doit pas dire quel pas a correspondu, ni
 * combien de chiffres étaient justes.
 */
export function verifyTotpCode(secret: string, code: string, now: Date): number | undefined {
  const presented = code.replace(/\s/g, '');
  const current = stepAt(now);
  let matched: number | undefined;

  for (let offset = -TOLERANCE_STEPS; offset <= TOLERANCE_STEPS; offset += 1) {
    const step = current + offset;

    if (hashesMatch(totpCode(secret, step), presented)) {
      matched = step;
    }
  }

  return matched;
}

/**
 * L'URI que lit une application d'authentification, et que le QR code dessine.
 *
 * Construite ici : rien n'est envoyé à un service distant, puisque cette chaîne
 * **contient le secret**. Elle ne doit pas plus être journalisée qu'un mot de
 * passe.
 */
export function totpUri(options: { secret: string; account: string; issuer: string }): string {
  const label = `${options.issuer}:${options.account}`;
  const parameters = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: DIGITS.toString(),
    period: STEP_SECONDS.toString(),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
}
