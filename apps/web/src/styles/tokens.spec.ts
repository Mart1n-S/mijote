import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
  Les seuils de contraste du RGAA sont une garantie, pas une relecture : ce
  test lit tokens.css et mesure chaque couple de couleurs réellement utilisé,
  dans les deux thèmes. Une couleur changée à la main qui ferait tomber un
  seuil fait tomber ce test.

  Les ratios qu'il mesure sont ceux consignés dans docs/design-system.md.
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

/*
  Chaque couple est un usage réel : du texte posé sur un fond (seuil 4,5:1),
  ou un élément d'interface qui porte une information visuelle (seuil 3:1).
  Ajouter un usage dans un composant veut dire ajouter son couple ici.
*/
const PAIRS: ReadonlyArray<{
  foreground: string;
  background: string;
  threshold: number;
  usage: string;
}> = [
  { foreground: 'text', background: 'background', threshold: 4.5, usage: 'texte courant' },
  { foreground: 'text', background: 'surface', threshold: 4.5, usage: 'texte sur surface' },
  {
    foreground: 'text',
    background: 'surface-hover',
    threshold: 4.5,
    usage: 'texte sur surface survolée',
  },
  {
    foreground: 'text-muted',
    background: 'background',
    threshold: 4.5,
    usage: 'texte secondaire',
  },
  {
    foreground: 'text-muted',
    background: 'surface',
    threshold: 4.5,
    usage: 'texte secondaire sur surface',
  },
  {
    foreground: 'text-muted',
    background: 'surface-hover',
    threshold: 4.5,
    usage: 'texte secondaire sur surface survolée',
  },
  { foreground: 'accent', background: 'background', threshold: 4.5, usage: 'lien' },
  { foreground: 'accent', background: 'surface', threshold: 4.5, usage: 'lien sur surface' },
  {
    foreground: 'on-accent',
    background: 'accent',
    threshold: 4.5,
    usage: 'libellé du bouton principal',
  },
  {
    foreground: 'on-accent',
    background: 'accent-hover',
    threshold: 4.5,
    usage: 'libellé du bouton principal survolé',
  },
  {
    foreground: 'on-danger',
    background: 'danger',
    threshold: 4.5,
    usage: 'libellé du bouton de danger',
  },
  {
    foreground: 'on-danger',
    background: 'danger-hover',
    threshold: 4.5,
    usage: 'libellé du bouton de danger survolé',
  },
  {
    foreground: 'border-strong',
    background: 'background',
    threshold: 3,
    usage: "contour d'un champ",
  },
  {
    foreground: 'border-strong',
    background: 'surface',
    threshold: 3,
    usage: "contour d'un champ sur surface",
  },
  { foreground: 'focus', background: 'background', threshold: 3, usage: 'anneau de focus' },
  {
    foreground: 'focus',
    background: 'surface',
    threshold: 3,
    usage: 'anneau de focus sur surface',
  },
  { foreground: 'success', background: 'background', threshold: 3, usage: 'repère de succès' },
  {
    foreground: 'success',
    background: 'surface',
    threshold: 3,
    usage: 'repère de succès sur surface',
  },
  {
    foreground: 'warning',
    background: 'background',
    threshold: 3,
    usage: "repère d'avertissement",
  },
  {
    foreground: 'warning',
    background: 'surface',
    threshold: 3,
    usage: "repère d'avertissement sur surface",
  },
  { foreground: 'danger', background: 'background', threshold: 3, usage: "repère d'erreur" },
  {
    foreground: 'danger',
    background: 'surface',
    threshold: 3,
    usage: "repère d'erreur sur surface",
  },
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
