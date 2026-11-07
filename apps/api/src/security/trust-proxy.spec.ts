import { describe, expect, it } from 'vitest';

import { DEFAULT_TRUST_PROXY, resolveTrustProxy } from './trust-proxy.js';

describe('resolveTrustProxy', () => {
  it('ne croit que la boucle locale par défaut', () => {
    expect(resolveTrustProxy({})).toBe(DEFAULT_TRUST_PROXY);
    expect(resolveTrustProxy({ TRUST_PROXY: '  ' })).toBe(DEFAULT_TRUST_PROXY);
  });

  it('refuse la confiance aveugle, et dit quoi mettre à la place', () => {
    /*
      `true` revient à croire X-Forwarded-For de n'importe quel client : chacun
      se donnerait une IP neuve à chaque essai, et la limitation des tentatives
      par IP ne compterait plus rien.
    */
    expect(() => resolveTrustProxy({ TRUST_PROXY: 'true' })).toThrow(/loopback.*\.env\.example/s);
  });

  it('refuse la même confiance aveugle écrite autrement', () => {
    /*
      `true` n'est pas la seule façon de croire tout le monde : un préfixe qui
      couvre tout l'espace d'adresses, ou un nombre de sauts invraisemblable,
      laissent le client choisir l'adresse qu'on comptera.
    */
    expect(() => resolveTrustProxy({ TRUST_PROXY: '0.0.0.0/0' })).toThrow(/couvre tout/);
    expect(() => resolveTrustProxy({ TRUST_PROXY: '::/0' })).toThrow(/couvre tout/);
    expect(() => resolveTrustProxy({ TRUST_PROXY: '10.0.0.4, ::/0' })).toThrow(/couvre tout/);
    expect(() => resolveTrustProxy({ TRUST_PROXY: '42' })).toThrow(/intermédiaires/);
  });

  it('laisse passer une plage trop large, et ne prétend pas le contraire', () => {
    // Le contrôle attrape l'erreur évidente, pas une plage mal choisie : c'est
    // au déploiement de nommer le mandataire.
    expect(resolveTrustProxy({ TRUST_PROXY: '10.0.0.0/8' })).toBe('10.0.0.0/8');
  });

  it('accepte une adresse, un nombre de sauts, ou aucune confiance', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '10.0.0.4' })).toBe('10.0.0.4');
    expect(resolveTrustProxy({ TRUST_PROXY: 'uniquelocal' })).toBe('uniquelocal');
    // Un nombre doit arriver en nombre : Express lit une chaîne comme une
    // liste d'adresses, et « 1 » n'en est pas une.
    expect(resolveTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: 'false' })).toBe(false);
  });
});
