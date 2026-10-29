import { describe, expect, it } from 'vitest';

// Test de fumée : le paquet ne contient encore aucun type, donc la seule chose
// vérifiable est que son point d'entrée se résout et s'importe.
describe('@mijote/shared', () => {
  it("expose un point d'entrée importable", async () => {
    const entree = await import('./index.js');

    expect(entree).toBeDefined();
  });
});
