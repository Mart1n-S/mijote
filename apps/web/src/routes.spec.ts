import { describe, expect, it } from 'vitest';

import { createRoutes } from './routes';

describe('createRoutes', () => {
  it("déclare la page d'accueil sur la racine", () => {
    const home = createRoutes(false).find((route) => route.name === 'home');

    expect(home?.path).toBe('/');
  });

  it("n'expose aucune page métier", () => {
    expect(createRoutes(false)).toHaveLength(1);
  });

  it('ajoute la page de démonstration quand on la demande', () => {
    const demo = createRoutes(true).find((route) => route.name === 'design-system');

    expect(demo?.path).toBe('/design-system');
  });

  it("n'ajoute pas la page de démonstration autrement", () => {
    // C'est ce que la production passe : la page ne doit pas y être atteignable.
    expect(createRoutes(false).some((route) => route.name === 'design-system')).toBe(false);
  });

  it('donne un titre à chaque page', () => {
    // Le titre du document en dépend, à chaque changement de page.
    for (const route of createRoutes(true)) {
      expect(route.meta?.title).toBeTruthy();
    }
  });
});
