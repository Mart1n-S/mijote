import { createHmac } from 'node:crypto';

/*
  Le poivre du serveur, et les empreintes qu'il permet.

  Une adresse e-mail et une adresse IP sont des données personnelles : la
  limitation des tentatives a besoin de les **compter**, pas de les lire. Un
  HMAC avec un secret du serveur donne exactement cela, là où un SHA-256 nu
  d'une adresse e-mail se retrouverait au dictionnaire en quelques secondes.
*/

/** 32 octets, soit la taille de bloc de SHA-256 : en dessous, le HMAC perd. */
const MIN_PEPPER_BYTES = 32;

/**
 * Lit le poivre et refuse de démarrer sans lui.
 *
 * Un poivre absent ferait tomber la limitation des tentatives, et un poivre
 * changé en ferait perdre le compte : c'est une valeur à garder, pas à
 * regénérer, et sa place est le `.env`.
 */
export function readPepper(env: NodeJS.ProcessEnv): Buffer {
  const raw = env['SECURITY_PEPPER']?.trim();

  if (raw === undefined || raw === '') {
    throw new Error("SECURITY_PEPPER est absente de l'environnement. Voir .env.example.");
  }

  // Base64 : une chaîne qui n'en est pas donne moins d'octets que prévu, et
  // tombe donc sur le contrôle de taille juste en dessous.
  const pepper = Buffer.from(raw, 'base64');

  if (pepper.length < MIN_PEPPER_BYTES) {
    throw new Error(
      `SECURITY_PEPPER fait ${pepper.length.toString()} octets décodés, il en faut au moins ${MIN_PEPPER_BYTES.toString()}. Voir .env.example.`,
    );
  }

  return pepper;
}

/**
 * Empreinte stable et non réversible d'une donnée personnelle.
 *
 * Stable, pour que deux tentatives sur la même adresse se comptent ensemble ;
 * non réversible, pour que la table des tentatives ne dise pas qui a essayé.
 */
export function fingerprint(pepper: Buffer, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}
