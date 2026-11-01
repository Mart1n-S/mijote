import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
  La largeur du dialogue ne se garde pas par une mesure, et ce n'est pas une
  supposition : mesuré le 1er novembre 2026, Reka UI verrouille le défilement du
  corps à l'ouverture d'un dialogue modal (overflow: hidden et padding-right
  compensatoire). La barre de défilement disparaît donc le temps du dialogue, et
  une unité de fenêtre y donne exactement la même largeur qu'un pourcentage.
  Aucun test géométrique ne peut départager les deux écritures.

  Ce qui se garde alors, c'est la source, dans l'idiome que tokens.spec.ts
  emploie déjà. Le pourcentage reste le bon justement parce qu'il ne dépend pas
  du verrou de la bibliothèque : un dialogue non modal, ou un Reka UI qui
  cesserait de verrouiller, remettrait l'écart de la largeur de la barre.

  Fichier à part et non dans BaseDialog.spec.ts, qui tourne sous jsdom : son
  import.meta.url n'y est pas une URL de fichier, donc readFileSync la refuse.
*/

const SOURCE = readFileSync(new URL('./BaseDialog.vue', import.meta.url), 'utf8');

/** Les unités de largeur de fenêtre, qui comptent toutes la barre de défilement. */
const WINDOW_WIDTH_UNITS = /\b\d*\.?\d+(?:vw|dvw|svw|lvw)\b/;

describe('largeur du dialogue', () => {
  it("ne dépend d'aucune unité de fenêtre", () => {
    // La déclaration seule, et non le commentaire qui la précède : lui doit
    // justement nommer les unités qu'il écarte.
    const declaration = /^\s*width:\s*(?<value>[^;]+);/m.exec(SOURCE)?.groups?.['value'];

    expect(declaration, 'la règle .dialog doit déclarer une largeur').toBeDefined();
    expect(declaration).not.toMatch(WINDOW_WIDTH_UNITS);
  });

  it('se mesure sur le bloc conteneur', () => {
    // Un pourcentage, pour un élément en position fixed, est celui du bloc
    // conteneur initial, dont la largeur exclut la barre de défilement.
    const declaration = /^\s*width:\s*(?<value>[^;]+);/m.exec(SOURCE)?.groups?.['value'];

    expect(declaration).toContain('100%');
  });
});
