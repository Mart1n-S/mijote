import { describe, expect, it } from 'vitest';

import {
  decoyPasswordDigest,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from './passwords.js';

const PASSWORD = 'un mot de passe assez long';

describe('hashPassword', () => {
  it("écrit les paramètres choisis dans l'empreinte", async () => {
    /*
      L'empreinte porte ses propres paramètres : c'est ce qui permettra de les
      augmenter plus tard sans invalider les comptes existants, et c'est la
      seule façon de vérifier ici que les valeurs de l'ADR 0011 sont bien celles
      qui s'appliquent.
    */
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('sale chaque empreinte', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('exige douze caractères', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });
});

describe('verifyPassword', () => {
  it('accepte le bon mot de passe et refuse les autres', async () => {
    const digest = await hashPassword(PASSWORD);

    expect(await verifyPassword(digest, PASSWORD)).toBe(true);
    expect(await verifyPassword(digest, 'un mot de passe assez lonh')).toBe(false);
    expect(await verifyPassword(digest, '')).toBe(false);
  });

  it('laisse remonter une empreinte illisible', async () => {
    // Une ligne abîmée en base est un incident, pas un échec de connexion :
    // elle doit faire un 500 journalisé, pas « identifiants incorrects ».
    await expect(verifyPassword('pas une empreinte', PASSWORD)).rejects.toThrow();
  });
});

describe('decoyPasswordDigest', () => {
  it('rend toujours la même empreinte, que personne ne peut satisfaire', async () => {
    const digest = await decoyPasswordDigest();

    expect(await decoyPasswordDigest()).toBe(digest);
    expect(digest).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword(digest, '')).toBe(false);
    expect(await verifyPassword(digest, PASSWORD)).toBe(false);
  });
});
