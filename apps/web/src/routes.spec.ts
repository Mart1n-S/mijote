import { describe, expect, it } from 'vitest';

import { routes } from './routes';

describe('routes', () => {
  it("déclare la page d'accueil sur la racine", () => {
    const accueil = routes.find((route) => route.name === 'home');

    expect(accueil?.path).toBe('/');
  });

  it("n'expose encore aucune autre route", () => {
    expect(routes).toHaveLength(1);
  });
});
