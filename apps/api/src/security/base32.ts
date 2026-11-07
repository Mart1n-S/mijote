/*
  Base32, RFC 4648, parce que c'est l'alphabet que les applications
  d'authentification attendent pour un secret TOTP : trente-deux symboles sans
  minuscules, qui se lisent et se dictent sans ambiguïté.

  Écrit ici plutôt que pris ailleurs : la RFC publie ses vecteurs de test, donc
  cette implémentation se mesure contre une référence officielle, ce qu'aucune
  relecture de dépendance ne donne (ADR 0012).
*/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Cinq bits par symbole : c'est toute la base32. */
const BITS = 5;

/**
 * Encode en base32, **sans remplissage**.
 *
 * Le remplissage par `=` est accepté par la RFC mais les applications
 * d'authentification le recopient dans l'URI, où il devrait être échappé : on
 * s'en passe, et le décodeur l'accepte quand même.
 */
export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let encoded = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= BITS) {
      bits -= BITS;
      encoded += ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    // Les bits qui restent sont complétés par des zéros à droite.
    encoded += ALPHABET[(value << (BITS - bits)) & 0x1f];
  }

  return encoded;
}

/**
 * Décode de la base32, en tolérant ce qu'un humain recopie.
 *
 * Les minuscules, les espaces et le remplissage sont acceptés : une clé est
 * affichée en groupes de quatre caractères, et quelqu'un qui la retape ne doit
 * pas être puni d'avoir gardé les espaces.
 */
export function decodeBase32(encoded: string): Buffer {
  const cleaned = encoded.replace(/[\s=]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const symbol of cleaned) {
    const index = ALPHABET.indexOf(symbol);

    if (index === -1) {
      throw new Error('base32 invalide : symbole inattendu');
    }

    value = (value << BITS) | index;
    bits += BITS;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}
