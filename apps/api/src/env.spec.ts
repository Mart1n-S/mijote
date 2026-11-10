import { describe, expect, it } from 'vitest';

import { readAppBaseUrl } from './env.js';

/*
  L'adresse publique de l'application décide du domaine vers lequel part un
  jeton, d'invitation comme de réinitialisation. Ces cas étaient mesurés avec
  les invitations ; ils ont suivi la fonction quand la réinitialisation en a eu
  besoin à son tour.
*/
describe("l'adresse publique de l'application", () => {
  it("refuse une adresse absente ou qui n'est pas du web", () => {
    /*
      Une valeur douteuse arrête le démarrage, elle ne se corrige pas à
      l'envoi : un jeton parti vers le mauvais domaine ne se rattrape pas.
    */
    expect(() => readAppBaseUrl({})).toThrow(/APP_BASE_URL.*\.env\.example/);
    expect(() => readAppBaseUrl({ APP_BASE_URL: '   ' })).toThrow(/APP_BASE_URL/);
    expect(() => readAppBaseUrl({ APP_BASE_URL: 'mijote.local' })).toThrow(/adresse lisible/);
    expect(() => readAppBaseUrl({ APP_BASE_URL: 'javascript:alert(1)' })).toThrow(/http/);
    expect(() => readAppBaseUrl({ APP_BASE_URL: 'file:///etc/passwd' })).toThrow(/http/);
  });

  it("refuse une adresse qu'on ne saurait pas compléter", () => {
    /*
      Le lien se construit en ajoutant un chemin et un fragment : une chaîne de
      requête ou un fragment donnerait une adresse cassée, et un jeton qui ne
      mène nulle part.
    */
    expect(() => readAppBaseUrl({ APP_BASE_URL: 'https://mijote.local/?x=1' })).toThrow(
      /paramètre de requête ni fragment/,
    );
    expect(() => readAppBaseUrl({ APP_BASE_URL: 'https://mijote.local/#ici' })).toThrow(
      /paramètre de requête ni fragment/,
    );
  });

  it('enlève la barre oblique finale, que les liens rajoutent', () => {
    expect(readAppBaseUrl({ APP_BASE_URL: 'https://mijote.local//' })).toBe('https://mijote.local');
  });
});
