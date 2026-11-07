import { describe, expect, it } from 'vitest';

import { expireCookie, readCookie, serializeCookie } from './cookies.js';
import { isSameOrigin, type RequestOrigin } from './origin.js';
import { fingerprint, readPepper } from './pepper.js';
import { createSecret, hashSecret, hashesMatch } from './tokens.js';

const PEPPER = Buffer.alloc(32, 7).toString('base64');

describe('readPepper', () => {
  it('rend le poivre décodé', () => {
    expect(readPepper({ SECURITY_PEPPER: PEPPER })).toHaveLength(32);
  });

  it('refuse un poivre absent ou trop court, en renvoyant à .env.example', () => {
    expect(() => readPepper({})).toThrow(/SECURITY_PEPPER.*\.env\.example/);
    expect(() => readPepper({ SECURITY_PEPPER: '   ' })).toThrow(/\.env\.example/);
    // Huit octets : un poivre qu'on pourrait énumérer.
    expect(() => readPepper({ SECURITY_PEPPER: Buffer.alloc(8).toString('base64') })).toThrow(
      /octets décodés/,
    );
  });
});

describe('fingerprint', () => {
  const pepper = readPepper({ SECURITY_PEPPER: PEPPER });

  it('rend la même empreinte pour la même valeur', () => {
    expect(fingerprint(pepper, 'qui@exemple.fr')).toBe(fingerprint(pepper, 'qui@exemple.fr'));
  });

  it('ne laisse pas retrouver la valeur, ni sans le poivre ni avec un autre', () => {
    const other = readPepper({ SECURITY_PEPPER: Buffer.alloc(32, 9).toString('base64') });

    expect(fingerprint(pepper, 'qui@exemple.fr')).not.toContain('exemple');
    /*
      Le poivre est ce qui distingue cette empreinte d'un SHA nu : sans lui, la
      même adresse donnerait partout la même valeur, et un dictionnaire des
      adresses courantes suffirait à lire la table des tentatives.
    */
    expect(fingerprint(other, 'qui@exemple.fr')).not.toBe(fingerprint(pepper, 'qui@exemple.fr'));
  });
});

describe('les jetons opaques', () => {
  it('tire un secret différent à chaque fois', () => {
    expect(createSecret()).not.toBe(createSecret());
    // 32 octets en base64url, sans remplissage.
    expect(createSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('compare deux empreintes à temps constant, longueurs différentes comprises', () => {
    const digest = hashSecret('un secret');

    expect(hashesMatch(digest, hashSecret('un secret'))).toBe(true);
    expect(hashesMatch(digest, hashSecret('un autre'))).toBe(false);
    // Sans le contrôle de longueur, timingSafeEqual lèverait.
    expect(hashesMatch(digest, 'court')).toBe(false);
  });
});

describe('serializeCookie', () => {
  it('pose les attributs du projet sur tous les cookies', () => {
    const header = serializeCookie('mijote_session', 'abc', {});

    expect(header).toContain('mijote_session=abc');
    expect(header).toContain('Path=/');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
    expect(header).toContain('HttpOnly');
  });

  it("n'écrit Max-Age que lorsqu'une durée est demandée", () => {
    // Sans Max-Age, le cookie meurt à la fermeture du navigateur : c'est la
    // durée courte par défaut de la session.
    expect(serializeCookie('mijote_session', 'abc', {})).not.toContain('Max-Age');
    expect(serializeCookie('mijote_remember', 'abc', { maxAgeSeconds: 60 })).toContain(
      'Max-Age=60',
    );
  });

  it('laisse le jeton CSRF lisible par le script, et lui seul', () => {
    expect(serializeCookie('mijote_csrf', 'abc', { readableByScript: true })).not.toContain(
      'HttpOnly',
    );
  });

  it('refuse une valeur qui pourrait écrire un autre en-tête', () => {
    expect(() => serializeCookie('mijote_session', 'a; HttpOnly=non', {})).toThrow(
      /caractère interdit/,
    );
    expect(() => serializeCookie('mijote_session', 'a\r\nSet-Cookie: x=y', {})).toThrow(
      /caractère interdit/,
    );
  });

  it('efface un cookie avec les mêmes attributs que sa pose', () => {
    const header = expireCookie('mijote_remember');

    expect(header).toContain('mijote_remember=;');
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Secure');
  });
});

describe('readCookie', () => {
  it('lit la valeur demandée parmi plusieurs', () => {
    const header = 'autre=1; mijote_session=abc; mijote_csrf=def';

    expect(readCookie(header, 'mijote_session')).toBe('abc');
    expect(readCookie(header, 'mijote_csrf')).toBe('def');
    expect(readCookie(header, 'absent')).toBeUndefined();
    expect(readCookie(undefined, 'mijote_session')).toBeUndefined();
  });

  it('garde le premier quand le nom est posé deux fois', () => {
    /*
      C'est ce que font les navigateurs, et ça compte : un attaquant qui
      réussirait à poser un second cookie de même nom ne doit pas remplacer
      celui du domaine.
    */
    expect(readCookie('mijote_session=bon; mijote_session=planté', 'mijote_session')).toBe('bon');
  });

  it('ignore une valeur qui ne peut pas être un de nos jetons', () => {
    expect(readCookie('mijote_session=a b c', 'mijote_session')).toBeUndefined();
  });
});

describe('isSameOrigin', () => {
  const request: RequestOrigin = {
    origin: 'https://mijote.lan',
    secFetchSite: undefined,
    protocol: 'https',
    host: 'mijote.lan',
  };

  it('accepte la même origine complète', () => {
    expect(isSameOrigin(request)).toBe(true);
    expect(
      isSameOrigin({
        ...request,
        origin: 'http://localhost:5173',
        protocol: 'http',
        host: 'localhost:5173',
      }),
    ).toBe(true);
  });

  it('refuse un schéma, un hôte ou un port différent', () => {
    // Le port fait partie de l'origine : un autre service sur la même machine
    // n'est pas la même origine.
    expect(isSameOrigin({ ...request, origin: 'http://mijote.lan' })).toBe(false);
    expect(isSameOrigin({ ...request, origin: 'https://autre.lan' })).toBe(false);
    expect(
      isSameOrigin({
        ...request,
        origin: 'http://localhost:5174',
        protocol: 'http',
        host: 'localhost:5173',
      }),
    ).toBe(false);
  });

  it("n'accepte en repli que same-origin, jamais same-site", () => {
    /*
      Un service voisin sur un sous-domaine du même domaine est « same-site » :
      l'accepter lui donnerait le droit d'appeler cette API.
    */
    expect(isSameOrigin({ ...request, origin: undefined, secFetchSite: 'same-origin' })).toBe(true);
    expect(isSameOrigin({ ...request, origin: undefined, secFetchSite: 'same-site' })).toBe(false);
    expect(isSameOrigin({ ...request, origin: undefined, secFetchSite: 'cross-site' })).toBe(false);
  });

  it("refuse quand les deux en-têtes manquent, ou quand l'hôte manque", () => {
    expect(isSameOrigin({ ...request, origin: undefined, secFetchSite: undefined })).toBe(false);
    expect(isSameOrigin({ ...request, host: undefined })).toBe(false);
  });
});
