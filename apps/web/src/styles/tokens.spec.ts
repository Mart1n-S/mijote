import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
  Les seuils de contraste du RGAA sont une garantie, pas une relecture : ce
  test lit tokens.css et mesure chaque couple de couleurs réellement utilisé,
  dans les deux thèmes. Une couleur changée à la main qui ferait tomber un
  seuil fait tomber ce test.

  Il tient les seuils, pas les valeurs : les ratios consignés dans
  docs/design-system.md sont saisis à la main et sont à reporter avec la
  couleur.
*/

const SOURCE = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Luminance relative d'une couleur `#rrggbb`, formule WCAG 2.1. */
function luminance(color: string): number {
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(color.slice(start, start + 2), 16) / 255,
  );

  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Ratio de contraste entre deux couleurs, de 1:1 à 21:1. */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
}

/** Les déclarations `--color-*: #rrggbb` d'un fragment de CSS. */
function colorsIn(fragment: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const [, name, value] of fragment.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
    found.set(name!, value!);
  }

  return found;
}

const DARK_BLOCK = '@media (prefers-color-scheme: dark)';
const darkBlockStart = SOURCE.indexOf(DARK_BLOCK);

/*
  Le thème clair est le bloc `:root` de tête ; le thème sombre est le même
  bloc redéfini sous prefers-color-scheme, donc une surcharge partielle qu'on
  applique par-dessus le clair.
*/
const lightTheme = colorsIn(SOURCE.slice(0, darkBlockStart));
const darkTheme = new Map([...lightTheme, ...colorsIn(SOURCE.slice(darkBlockStart))]);

interface Pair {
  foreground: string;
  background: string;
  threshold: number;
  usage: string;
}

/** Du texte posé sur un fond : seuil 4,5:1. */
function text(foreground: string, background: string, usage: string): Pair {
  return { foreground, background, threshold: 4.5, usage };
}

/** Un élément d'interface qui porte une information visuelle : seuil 3:1. */
function ui(foreground: string, background: string, usage: string): Pair {
  return { foreground, background, threshold: 3, usage };
}

/** Les quatre fonds sur lesquels du contenu peut être posé. */
const SURFACES = ['background', 'surface', 'surface-hover', 'surface-active', 'raised'] as const;

/*
  Chaque couple est un usage réel. Ajouter un usage dans un composant veut dire
  ajouter son couple ici, et une ligne dans le tableau de docs/design-system.md.
*/
const PAIRS: readonly Pair[] = [
  // Texte courant et texte secondaire, sur chacun des fonds possibles.
  ...SURFACES.map((surface) => text('text', surface, `texte courant sur ${surface}`)),
  ...SURFACES.map((surface) => text('text-muted', surface, `texte secondaire sur ${surface}`)),

  // L'accent sert de couleur de lien, donc de texte, sur chacun des fonds.
  ...SURFACES.map((surface) => text('accent', surface, `lien sur ${surface}`)),

  // Les trois états d'un bouton plein, dans les deux familles.
  text('on-accent', 'accent', 'libellé du bouton principal au repos'),
  text('on-accent', 'accent-hover', 'libellé du bouton principal survolé'),
  text('on-accent', 'accent-active', 'libellé du bouton principal enfoncé'),
  text('on-danger', 'danger', 'libellé du bouton de danger au repos'),
  text('on-danger', 'danger-hover', 'libellé du bouton de danger survolé'),
  text('on-danger', 'danger-active', 'libellé du bouton de danger enfoncé'),

  // Contours de contrôle et anneau de focus, sur chacun des fonds.
  ...SURFACES.map((surface) => ui('border-strong', surface, `contour d'un champ sur ${surface}`)),
  ...SURFACES.map((surface) => ui('focus', surface, `anneau de focus sur ${surface}`)),

  // Repères d'état : liserés et pastilles des messages.
  ...SURFACES.map((surface) => ui('success', surface, `repère de succès sur ${surface}`)),
  ...SURFACES.map((surface) => ui('warning', surface, `repère d'avertissement sur ${surface}`)),
  ...SURFACES.map((surface) => ui('danger', surface, `repère d'erreur sur ${surface}`)),

  // Le contour d'un champ invalide, qui est le repère d'erreur lui-même.
  ui('danger', 'background', "contour d'un champ invalide"),
];

describe('jetons de couleur', () => {
  it('déclare un thème sombre', () => {
    expect(darkBlockStart).toBeGreaterThan(0);
    expect(lightTheme.size).toBeGreaterThan(0);
  });

  it('déclare les mêmes noms dans les deux thèmes', () => {
    // Un nom présent en clair mais pas en sombre laisserait un composant avec
    // la couleur du thème clair sur un fond sombre.
    expect([...darkTheme.keys()].sort()).toEqual([...lightTheme.keys()].sort());
  });

  it('couvre chaque fond sur lequel du contenu est posé', () => {
    // Un fond ajouté à tokens.css sans être ajouté ici passerait sans mesure.
    for (const surface of SURFACES) {
      expect(lightTheme.get(surface), `--color-${surface} doit être déclaré`).toBeDefined();
    }
  });

  describe.each([
    { theme: 'clair', palette: lightTheme },
    { theme: 'sombre', palette: darkTheme },
  ])('thème $theme', ({ palette }) => {
    it.each(PAIRS)('$usage respecte $threshold:1', ({ foreground, background, threshold }) => {
      const front = palette.get(foreground);
      const back = palette.get(background);

      expect(front, `--color-${foreground} doit être déclaré`).toBeDefined();
      expect(back, `--color-${background} doit être déclaré`).toBeDefined();

      expect(contrastRatio(front!, back!)).toBeGreaterThanOrEqual(threshold);
    });
  });
});
