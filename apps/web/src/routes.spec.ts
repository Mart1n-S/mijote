import { describe, expect, it } from 'vitest';

import { routes } from './routes';

describe('routes', () => {
  it("déclare la page d'accueil sur la racine", () => {
    const home = routes.find((route) => route.name === 'home');

    expect(home?.path).toBe('/');
  });

  it("n'expose encore aucune autre route", () => {
    expect(routes).toHaveLength(1);
  });

  it('donne un titre à chaque page', () => {
    // Le titre du document en dépend, à chaque changement de page.
    for (const route of routes) {
      expect(route.meta?.title).toBeTruthy();
    }
  });
});
