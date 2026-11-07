import { describe, expect, it } from 'vitest';

import {
  BACKUP_CODE_COUNT,
  createBackupCodes,
  formatBackupCode,
  parseBackupCode,
} from './backup-codes.js';

describe('createBackupCodes', () => {
  it('rend dix codes numérotés de 1 à 10', () => {
    const codes = createBackupCodes();

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(codes.map((code) => code.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('tire douze lettres sans ambiguïté, et jamais deux fois les mêmes', () => {
    const codes = createBackupCodes();

    for (const code of codes) {
      // Ni I ni O, ni chiffre : le numéro en tête reste lisible même sans tiret.
      expect(code.secret).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
    }

    expect(new Set(codes.map((code) => code.secret)).size).toBe(BACKUP_CODE_COUNT);
    expect(createBackupCodes()[0]?.secret).not.toBe(codes[0]?.secret);
  });

  it('montre le numéro et des groupes de quatre', () => {
    const code = createBackupCodes()[6];

    expect(code?.display).toBe(formatBackupCode(7, code?.secret ?? ''));
    expect(code?.display).toMatch(/^7-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$/);
  });
});

describe('parseBackupCode', () => {
  const SECRET = 'KMXQPTBVZRDC';

  it("lit un code recopié tel qu'il est affiché", () => {
    expect(parseBackupCode(`7-KMXQ-PTBV-ZRDC`)).toEqual({ position: 7, secret: SECRET });
  });

  it('accepte les minuscules', () => {
    // Un clavier de téléphone met une majuscule au premier caractère et plus
    // rien ensuite : punir cela n'aurait aucun sens.
    expect(parseBackupCode('7-kmxq-ptbv-zrdc')).toEqual({ position: 7, secret: SECRET });
    expect(parseBackupCode('7KmXqPtBvZrDc')).toEqual({ position: 7, secret: SECRET });
  });

  it('accepte les espaces, les tirets en trop, et leur absence', () => {
    expect(parseBackupCode(' 7 KMXQ PTBV ZRDC ')).toEqual({ position: 7, secret: SECRET });
    expect(parseBackupCode('7KMXQPTBVZRDC')).toEqual({ position: 7, secret: SECRET });
    expect(parseBackupCode('7--KMXQ--PTBV--ZRDC')).toEqual({ position: 7, secret: SECRET });
  });

  it('lit le numéro à deux chiffres', () => {
    expect(parseBackupCode(`10-${SECRET}`)).toEqual({ position: 10, secret: SECRET });
  });

  it('rend un numéro hors plage sans le refuser', () => {
    /*
      Ce n'est pas à la lecture d'en juger : un numéro qui n'existe pas doit
      recevoir le même message et le même temps qu'un code faux, et c'est le
      service qui s'en charge. Refuser ici dirait combien de codes existent.
    */
    expect(parseBackupCode(`42-${SECRET}`)).toEqual({ position: 42, secret: SECRET });
  });

  it("refuse ce qui n'a pas la forme d'un code", () => {
    // Le numéro manquant est le seul défaut qui se distingue, parce qu'il ne
    // dépend d'aucune donnée en base.
    expect(parseBackupCode(SECRET)).toBeUndefined();
    expect(parseBackupCode('')).toBeUndefined();
    // Trop court, trop long, ou une lettre hors alphabet.
    expect(parseBackupCode('7-KMXQ-PTBV-ZRD')).toBeUndefined();
    expect(parseBackupCode('7-KMXQ-PTBV-ZRDCE')).toBeUndefined();
    expect(parseBackupCode('7-KMXQ-PTBV-ZRDI')).toBeUndefined();
    expect(parseBackupCode('7-KMXQ-PTBV-ZRD0')).toBeUndefined();
  });
});
