import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, readEncryptionKey } from './encryption.js';

/*
  Une clé de test, faite de zéros. Ce n'est pas un secret : elle ne protège rien
  ici, et la vraie vit dans le .env, que ce dépôt ne lit jamais (security.md).
*/
const KEY = readEncryptionKey({ SECURITY_TOTP_KEY: Buffer.alloc(32).toString('base64') });

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('readEncryptionKey', () => {
  it('exige exactement 32 octets, et renvoie à .env.example', () => {
    expect(() => readEncryptionKey({})).toThrow(/SECURITY_TOTP_KEY.*\.env\.example/);
    expect(() => readEncryptionKey({ SECURITY_TOTP_KEY: '   ' })).toThrow(/\.env\.example/);
    // Seize octets : une clé qui n'est pas celle d'AES-256.
    expect(() =>
      readEncryptionKey({ SECURITY_TOTP_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/octets décodés/);
  });

  it('est une clé à part, et non le poivre', () => {
    /*
      Le poivre sert à compter des empreintes, cette clé à relire un secret.
      Les mélanger ferait qu'un changement de poivre rendrait illisibles toutes
      les double authentifications.
    */
    expect(() =>
      readEncryptionKey({ SECURITY_PEPPER: Buffer.alloc(32).toString('base64') }),
    ).toThrow(/SECURITY_TOTP_KEY/);
  });
});

describe('encrypt', () => {
  it('rend une valeur relisible, et jamais la même deux fois', () => {
    const first = encrypt(KEY, ACCOUNT, SECRET);
    const second = encrypt(KEY, ACCOUNT, SECRET);

    expect(decrypt(KEY, ACCOUNT, first)).toBe(SECRET);
    expect(decrypt(KEY, ACCOUNT, second)).toBe(SECRET);
    // Vecteur d'initialisation tiré à chaque écriture : deux lignes identiques
    // en base ne diraient sinon rien de moins que « même secret ».
    expect(first).not.toBe(second);
  });

  it('ne laisse pas le secret paraître dans ce qui est stocké', () => {
    expect(encrypt(KEY, ACCOUNT, SECRET)).not.toContain(SECRET);
    expect(encrypt(KEY, ACCOUNT, SECRET)).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe('decrypt', () => {
  it("refuse la ligne d'un autre compte", () => {
    /*
      L'identifiant du compte entre en donnée authentifiée associée : une ligne
      recopiée d'un compte à l'autre serait autrement parfaitement valable, et
      donnerait la double authentification de quelqu'un d'autre.
    */
    const stored = encrypt(KEY, ACCOUNT, SECRET);

    expect(() => decrypt(KEY, OTHER_ACCOUNT, stored)).toThrow();
  });

  it('refuse une valeur modifiée, et une étiquette modifiée', () => {
    const [version, iv, tag, encrypted] = encrypt(KEY, ACCOUNT, SECRET).split('.');

    // Un octet du chiffré retourné : GCM le voit, là où CBC rendrait un secret
    // différent et ferait échouer tous les codes sans dire pourquoi.
    const altered = Buffer.from(encrypted ?? '', 'base64url');

    altered.writeUInt8((altered.at(0) ?? 0) ^ 1, 0);

    expect(() =>
      decrypt(KEY, ACCOUNT, [version, iv, tag, altered.toString('base64url')].join('.')),
    ).toThrow();
    expect(() =>
      decrypt(KEY, ACCOUNT, [version, iv, 'AAAAAAAAAAAAAAAAAAAAAA', encrypted].join('.')),
    ).toThrow();
  });

  it('refuse une autre clé', () => {
    const other = readEncryptionKey({ SECURITY_TOTP_KEY: Buffer.alloc(32, 9).toString('base64') });

    expect(() => decrypt(other, ACCOUNT, encrypt(KEY, ACCOUNT, SECRET))).toThrow();
  });

  it('refuse un format ou une version inattendus', () => {
    expect(() => decrypt(KEY, ACCOUNT, 'pas un chiffré')).toThrow(/format ou version/);
    expect(() => decrypt(KEY, ACCOUNT, 'v2.a.b.c')).toThrow(/format ou version/);
    // La version est ce qui permettra de relire les anciennes lignes après un
    // changement de clé : une ligne sans elle n'est pas lisible à l'aveugle.
    expect(() => decrypt(KEY, ACCOUNT, 'a.b.c')).toThrow(/format ou version/);
  });
});
