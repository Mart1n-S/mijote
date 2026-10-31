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

  // Les trois accès sont sûrs : channels vient d'un map sur trois indices
  // littéraux, donc linear a exactement trois éléments. TypeScript ne le
  // déduit pas d'un map, d'où les assertions.
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Ratio de contraste entre deux couleurs, de 1:1 à 21:1. */
function contrastRatio(a: string, b: string): number {
  // Trier deux éléments en rend deux : l'assertion dit au compilateur ce que
  // la ligne garantit, elle ne masque pas un doute.
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Les noms de jetons de couleur déclarés dans un fragment de CSS, quelle que
 * soit la forme de leur valeur. Le voile est en `rgb()` : ne lire que les
 * valeurs hexadécimales le ferait échapper au contrôle des noms.
 */
function colorNamesIn(fragment: string): Set<string> {
  // Le nom est sûr : le groupe est obligatoire dans le motif.
  return new Set([...fragment.matchAll(/--color-([\w-]+):/g)].map(([, name]) => name!));
}

/** Les déclarations `--color-*: #rrggbb` d'un fragment de CSS. */
function colorsIn(fragment: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const [, name, value] of fragment.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
    // Les deux groupes sont obligatoires dans le motif.
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
  Les noms déclarés de chaque côté, sans union cette fois : le test plus bas
  compare le bloc sombre au clair, et une union aurait toujours contenu le
  clair.
*/
const lightNames = colorNamesIn(SOURCE.slice(0, darkBlockStart));
const darkNames = colorNamesIn(SOURCE.slice(darkBlockStart));

/*
  Jetons volontairement déclarés en clair seulement. Le voile est identique
  dans les deux thèmes : il assombrit l'écran, et le contraste du dialogue se
  mesure contre sa propre surface, pas contre lui.

  Ajouter un nom ici est une décision, pas un ajustement : ce nom cesse d'être
  surveillé.
*/
const WITHOUT_DARK_OVERRIDE = ['overlay'];

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

/** Les cinq fonds sur lesquels du contenu peut être posé. */
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
  ...SURFACES.map((surface) => ui('border-hover', surface, `contour survolé sur ${surface}`)),
  ...SURFACES.map((surface) => ui('focus', surface, `anneau de focus sur ${surface}`)),

  // Repères d'état : liserés et pastilles des messages.
  ...SURFACES.map((surface) => ui('success', surface, `repère de succès sur ${surface}`)),
  ...SURFACES.map((surface) => ui('warning', surface, `repère d'avertissement sur ${surface}`)),
  // danger sert aussi de contour à un champ invalide : c'est le même jeton sur
  // les mêmes fonds, donc les couples ci-dessus le couvrent déjà.
  ...SURFACES.map((surface) => ui('danger', surface, `repère d'erreur sur ${surface}`)),
];

describe('jetons de couleur', () => {
  it('déclare un thème sombre', () => {
    expect(darkBlockStart).toBeGreaterThan(0);
    expect(lightTheme.size).toBeGreaterThan(0);
  });

  it('surcharge en sombre chaque jeton de couleur, sauf exception déclarée', () => {
    // Un nom présent en clair mais pas en sombre laisserait un composant avec
    // la couleur du thème clair sur un fond sombre. Le contrôle porte sur les
    // noms et non sur les valeurs mesurables, pour couvrir aussi le voile,
    // déclaré en rgb().
    //
    // Les noms du bloc sombre sont comparés à ceux du clair, et non à leur
    // union : jusqu'au 31 octobre 2026, ce test comparait l'union au clair,
    // qu'elle contient toujours. Il ne pouvait donc pas échouer dans le sens
    // qu'il annonçait, et `overlay` était déjà dans ce cas sans que rien ne le
    // dise. L'égalité couvre aussi le sens inverse : un nom qui n'existerait
    // qu'en sombre n'aurait aucune valeur en clair.
    const expected = [...lightNames].filter((name) => !WITHOUT_DARK_OVERRIDE.includes(name));

    expect([...darkNames].sort()).toEqual(expected.sort());
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
