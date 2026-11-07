import { describe, expect, it } from 'vitest';

import { decodeBase32, encodeBase32 } from './base32.js';
import {
  createTotpSecret,
  stepAt,
  STEP_SECONDS,
  TOLERANCE_STEPS,
  totpCode,
  totpUri,
  verifyTotpCode,
} from './totp.js';

/*
  Les deux implémentations sont mesurées contre les vecteurs de leurs RFC. C'est
  la raison pour laquelle le projet les écrit au lieu de prendre une
  bibliothèque : une référence officielle vaut mieux qu'une relecture.
*/

describe('base32, vecteurs de la RFC 4648', () => {
  /** Section 10 de la RFC, sans le remplissage que nous n'écrivons pas. */
  const VECTORS: [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it('encode comme la RFC', () => {
    for (const [clear, encoded] of VECTORS) {
      expect(encodeBase32(Buffer.from(clear, 'utf8')), clear).toBe(encoded);
    }
  });

  it('décode comme la RFC, remplissage compris', () => {
    for (const [clear, encoded] of VECTORS) {
      expect(decodeBase32(encoded).toString('utf8'), encoded).toBe(clear);
    }

    // Le remplissage par `=` reste accepté, ainsi que les minuscules et les
    // espaces : une clé affichée en groupes de quatre se retape avec.
    expect(decodeBase32('MZXW6YTBOI======').toString('utf8')).toBe('foobar');
    expect(decodeBase32('mzxw 6ytb oi').toString('utf8')).toBe('foobar');
  });

  it("refuse un symbole qui n'est pas de la base32", () => {
    // 0, 1, 8 et 9 n'en font pas partie : c'est ce qui rend l'alphabet
    // dictable sans confondre O et 0.
    expect(() => decodeBase32('MZXW0')).toThrow(/base32/);
    expect(() => decodeBase32('MZXW!')).toThrow(/base32/);
  });
});

describe('TOTP, vecteurs de la RFC 6238', () => {
  /*
    Appendice B de la RFC : le secret est la chaîne ASCII « 12345678901234567890 »,
    soit vingt octets, et les codes sont donnés sur huit chiffres pour SHA-1.
  */
  const SECRET = encodeBase32(Buffer.from('12345678901234567890', 'utf8'));

  const VECTORS: [number, string][] = [
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ];

  it('rend les codes de la RFC, sur huit chiffres', () => {
    for (const [seconds, expected] of VECTORS) {
      expect(totpCode(SECRET, stepAt(new Date(seconds * 1000)), 8), String(seconds)).toBe(expected);
    }
  });

  it('rend les six derniers chiffres pour un code de six', () => {
    // Ce que l'application affiche : la troncature est la même, seul le modulo
    // change.
    for (const [seconds, expected] of VECTORS) {
      expect(totpCode(SECRET, stepAt(new Date(seconds * 1000))), String(seconds)).toBe(
        expected.slice(-6),
      );
    }
  });

  it('découpe le temps en pas de trente secondes', () => {
    expect(STEP_SECONDS).toBe(30);
    expect(stepAt(new Date(59_000))).toBe(1);
    expect(stepAt(new Date(60_000))).toBe(2);
    expect(stepAt(new Date(89_999))).toBe(2);
  });
});

describe('createTotpSecret', () => {
  it('tire vingt octets, comme la RFC 4226', () => {
    const secret = createTotpSecret();

    expect(decodeBase32(secret)).toHaveLength(20);
    // 32 symboles de base32 pour 20 octets, sans remplissage.
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(createTotpSecret()).not.toBe(secret);
  });
});

describe('verifyTotpCode', () => {
  const SECRET = createTotpSecret();
  const NOW = new Date('2026-11-07T12:00:00Z');
  const CURRENT = stepAt(NOW);

  it('accepte le code du moment, et rend son pas', () => {
    expect(verifyTotpCode(SECRET, totpCode(SECRET, CURRENT), NOW)).toBe(CURRENT);
  });

  it("accepte un décalage d'une fenêtre, de part et d'autre", () => {
    expect(TOLERANCE_STEPS).toBe(1);
    expect(verifyTotpCode(SECRET, totpCode(SECRET, CURRENT - 1), NOW)).toBe(CURRENT - 1);
    expect(verifyTotpCode(SECRET, totpCode(SECRET, CURRENT + 1), NOW)).toBe(CURRENT + 1);
  });

  it('refuse au-delà, et ne glisse pas la fenêtre', () => {
    /*
      Deux fenêtres doubleraient les codes valables à un instant donné. Une
      horloge qui dérive davantage est un cas rare, que le code de secours
      couvre.
    */
    expect(verifyTotpCode(SECRET, totpCode(SECRET, CURRENT - 2), NOW)).toBeUndefined();
    expect(verifyTotpCode(SECRET, totpCode(SECRET, CURRENT + 2), NOW)).toBeUndefined();
  });

  it('refuse un code faux, vide ou mal formé, sans rien dire de plus', () => {
    expect(verifyTotpCode(SECRET, '000000', NOW)).toBeUndefined();
    expect(verifyTotpCode(SECRET, '', NOW)).toBeUndefined();
    expect(verifyTotpCode(SECRET, 'pas un code', NOW)).toBeUndefined();
    // Un code trop court ou trop long est refusé par la comparaison, qui
    // compare les longueurs avant le contenu.
    expect(verifyTotpCode(SECRET, '12345', NOW)).toBeUndefined();
    expect(verifyTotpCode(SECRET, `0${totpCode(SECRET, CURRENT)}`, NOW)).toBeUndefined();
  });

  it('tolère les espaces, que les applications affichent', () => {
    const code = totpCode(SECRET, CURRENT);

    expect(verifyTotpCode(SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, NOW)).toBe(CURRENT);
  });

  it("refuse le code du secret de quelqu'un d'autre", () => {
    expect(verifyTotpCode(SECRET, totpCode(createTotpSecret(), CURRENT), NOW)).toBeUndefined();
  });
});

describe('totpUri', () => {
  it("porte ce qu'une application attend, et son secret", () => {
    const uri = totpUri({ secret: 'ABCD', account: 'martin@exemple.test', issuer: 'Mijote' });

    expect(uri).toBe(
      'otpauth://totp/Mijote%3Amartin%40exemple.test?secret=ABCD&issuer=Mijote&algorithm=SHA1&digits=6&period=30',
    );
  });
});
