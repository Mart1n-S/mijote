import { randomInt } from 'node:crypto';

/*
  Les codes de secours : ce qui reste quand le téléphone est perdu.

  Dix codes, numérotés. Le numéro est porté en clair par le code affiché et
  n'est pas un secret : il dit quelle empreinte vérifier. Sans lui, un essai
  demanderait les dix vérifications Argon2id, soit plus d'une seconde et
  640 Mio de mémoire par essai (ADR 0012).
*/

export const BACKUP_CODE_COUNT = 10;

/*
  Vingt-quatre lettres : l'alphabet latin sans `I` ni `O`, qui se confondent
  avec 1 et 0. Aucun chiffre non plus, et c'est voulu : le numéro en tête reste
  ainsi lisible sans ambiguïté, même si la personne oublie le tiret.
*/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Douze lettres de cet alphabet, soit environ 55 bits. */
const CODE_LENGTH = 12;

/** Un code de secours, tel qu'il est stocké et tel qu'il est montré. */
export interface BackupCode {
  /** Son numéro, de 1 à 10, affiché avec lui. */
  position: number;
  /** Les douze lettres, la seule partie secrète : c'est elle qui est hachée. */
  secret: string;
  /** Ce qui est montré une fois, et que la personne recopie. */
  display: string;
}

/**
 * Dix codes neufs.
 *
 * `randomInt` et non un octet au hasard modulo la taille de l'alphabet :
 * vingt-quatre n'étant pas une puissance de deux, le modulo favoriserait les
 * premières lettres.
 */
export function createBackupCodes(): BackupCode[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, (_unused, index) => {
    let secret = '';

    for (let letter = 0; letter < CODE_LENGTH; letter += 1) {
      secret += ALPHABET[randomInt(ALPHABET.length)];
    }

    const position = index + 1;

    return { position, secret, display: formatBackupCode(position, secret) };
  });
}

/**
 * Le code tel qu'il s'affiche : son numéro, puis des groupes de quatre.
 *
 * Les groupes sont là pour être recopiés sans se perdre ; le lecteur les
 * ignore, comme il ignore la casse.
 */
export function formatBackupCode(position: number, secret: string): string {
  const groups = secret.match(/.{1,4}/g) ?? [];

  return `${position.toString()}-${groups.join('-')}`;
}

/**
 * Ce qu'une saisie désigne, ou rien si elle n'a pas la forme d'un code.
 *
 * La saisie est passée en majuscules et débarrassée de tout ce qui n'est pas
 * alphanumérique : les tirets, les espaces et les minuscules sont donc
 * acceptés. Les chiffres de tête font le numéro, le reste doit faire exactement
 * douze lettres.
 *
 * Un numéro hors plage n'est **pas** refusé ici : c'est au service de le
 * traiter comme un code inconnu, avec le même message et le même temps qu'un
 * code faux. Seul le défaut de forme se distingue, parce qu'il ne dépend
 * d'aucune donnée en base.
 */
export function parseBackupCode(input: string): { position: number; secret: string } | undefined {
  const cleaned = input.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const match = /^(\d{1,2})([A-Z]+)$/.exec(cleaned);

  if (match === null) {
    return undefined;
  }

  const [, digits, secret] = match;

  if (secret === undefined || secret.length !== CODE_LENGTH) {
    return undefined;
  }

  for (const letter of secret) {
    if (!ALPHABET.includes(letter)) {
      return undefined;
    }
  }

  return { position: Number(digits), secret };
}
