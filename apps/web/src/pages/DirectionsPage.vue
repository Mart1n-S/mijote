<script setup lang="ts">
/*
  PAGE TEMPORAIRE. Elle sert à choisir un coloris et disparaît avant la fusion
  de la PR #17, avec sa route et ce fichier. Seul le coloris retenu entre dans
  tokens.css.

  La structure est fixée : c'est celle de la direction Marmite, retenue le
  30 octobre 2026. Arrondis 3, 6 et 10 px, audace sur le prix, barre basse à
  trait épais, Atkinson Hyperlegible Next. Seules les couleurs changent d'un
  coloris à l'autre, et les neutres changent avec l'accent.

  Les palettes sont posées en dur, et c'est volontaire : il faut afficher les
  dix thèmes en même temps, donc sans dépendre de prefers-color-scheme ni des
  jetons du projet. Chaque cadre redéfinit les mêmes noms dans sa portée.
*/

type ThemeId = 'light' | 'dark';

/** Écarts perceptuels (dE2000) entre l'accent et les couleurs à ne pas confondre. */
interface Gaps {
  danger: number;
  warning: number;
  success: number;
  terracotta: number;
}

interface ThemeSpec {
  /** Les jetons de couleur, sans le préfixe `--color-`. */
  colors: Record<string, string>;
  /** Teinte des ombres, reprise de la couleur de texte du coloris. */
  shadowTint: string;
  tightest: string[];
  gaps: Gaps;
}

interface Colourway {
  id: string;
  name: string;
  tagline: string;
  /** Ce que j'en pense, réserves comprises. */
  note: string;
  themes: Record<ThemeId, ThemeSpec>;
}

/* Structure commune, celle de Marmite. */
const STRUCTURE = {
  radii: { sm: '3px', md: '6px', lg: '10px', pill: '999px' },
  weights: { body: '400', label: '600', heading: '800' },
  tracking: '-0.01em',
  leading: '1.5',
  font: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
};

const COLOURWAYS: Colourway[] = [
  {
    id: 'roux',
    name: 'Roux de fonte',
    tagline: 'la référence, celle que vous avez vue',
    note:
      "Contrastes tenus, mais c'est le coloris dont l'accent s'approche le plus des couleurs " +
      "d'état : 12,9 de l'erreur et 11,9 de l'avertissement en clair. Un repère orange et un " +
      "repère d'erreur rouge se ressemblent, surtout en petit.",
    themes: {
      light: {
        colors: {
          background: '#fdfbf9',
          surface: '#f3ede7',
          'surface-hover': '#e9e1d9',
          raised: '#ffffff',
          border: '#e0d6cc',
          'border-strong': '#8b7b6f',
          text: '#2a211c',
          'text-muted': '#5c4f46',
          accent: '#9a4b16',
          'accent-hover': '#7d3b10',
          'on-accent': '#ffffff',
          success: '#236b32',
          warning: '#8a5a00',
          danger: '#b22b20',
          'danger-hover': '#8f2219',
          'on-danger': '#ffffff',
          focus: '#9a4b16',
        },
        shadowTint: '42 33 28',
        tightest: ['accent sur surface survolée, 4,79:1', 'liseré de contrôle sur surface, 3,50:1'],
        gaps: { danger: 12.9, warning: 11.9, success: 44.3, terracotta: 20.5 },
      },
      dark: {
        colors: {
          background: '#1a1514',
          surface: '#241d1a',
          'surface-hover': '#2e2622',
          raised: '#2b2320',
          border: '#3a302b',
          'border-strong': '#85756a',
          text: '#f0e8e2',
          'text-muted': '#b5a79d',
          accent: '#f0a06a',
          'accent-hover': '#f7b98b',
          'on-accent': '#2a1709',
          success: '#74c98a',
          warning: '#e3ae5a',
          danger: '#ff9287',
          'danger-hover': '#ffafa6',
          'on-danger': '#330d08',
          focus: '#f0a06a',
        },
        shadowTint: '0 0 0',
        tightest: [
          'liseré de contrôle sur surface surélevée, 3,48:1',
          'liseré de contrôle sur surface, 3,75:1',
        ],
        gaps: { danger: 15.3, warning: 11.7, success: 42.7, terracotta: 12.9 },
      },
    },
  },
  {
    id: 'fonte',
    name: 'Bleu de fonte émaillée',
    tagline: 'un bleu franc, jamais bleu-vert',
    note:
      "Le plus net du lot sur tous les écarts : au moins 36,8 de chaque couleur d'état, dans les " +
      'deux thèmes. Un bleu pur, loin du bleu-vert des banques, et le seul coloris où la couleur ' +
      "d'accent ne peut jamais être lue comme un état.",
    themes: {
      light: {
        colors: {
          background: '#fbfcfe',
          surface: '#eef1f6',
          'surface-hover': '#e3e8f0',
          raised: '#ffffff',
          border: '#dde3ec',
          'border-strong': '#7a8496',
          text: '#1b202a',
          'text-muted': '#4e5665',
          accent: '#27548f',
          'accent-hover': '#1d4172',
          'on-accent': '#ffffff',
          success: '#1f6b3c',
          warning: '#8a5a00',
          danger: '#b3261e',
          'danger-hover': '#8f1e17',
          'on-danger': '#ffffff',
          focus: '#27548f',
        },
        shadowTint: '27 32 42',
        tightest: ['liseré de contrôle sur surface, 3,33:1', 'liseré de contrôle sur fond, 3,67:1'],
        gaps: { danger: 42.3, warning: 45.8, success: 39.8, terracotta: 46.8 },
      },
      dark: {
        colors: {
          background: '#11151b',
          surface: '#1a1f27',
          'surface-hover': '#232935',
          raised: '#202631',
          border: '#2e3642',
          'border-strong': '#78839a',
          text: '#e9edf3',
          'text-muted': '#a9b2c1',
          accent: '#8fb6e8',
          'accent-hover': '#adcbf2',
          'on-accent': '#0d1a2b',
          success: '#6fcb92',
          warning: '#e3ae5a',
          danger: '#ff9287',
          'danger-hover': '#ffafa6',
          'on-danger': '#330d08',
          focus: '#8fb6e8',
        },
        shadowTint: '0 0 0',
        tightest: [
          'liseré de contrôle sur surface surélevée, 3,99:1',
          'liseré de contrôle sur surface, 4,34:1',
        ],
        gaps: { danger: 38.2, warning: 42.3, success: 36.8, terracotta: 40.7 },
      },
    },
  },
  {
    id: 'prune',
    name: 'Prune',
    tagline: 'un violet qui penche vers le rouge',
    note:
      "Chaleureux sans être orange, et très loin de l'avertissement et du succès. Sa seule " +
      "faiblesse est en sombre, où le rose s'approche à 20,3 de l'erreur : c'est la limite basse " +
      'de ce qui reste distinguable.',
    themes: {
      light: {
        colors: {
          background: '#fdfafb',
          surface: '#f5eef2',
          'surface-hover': '#ede2e8',
          raised: '#ffffff',
          border: '#e6dae1',
          'border-strong': '#8e7b86',
          text: '#2b2229',
          'text-muted': '#5e5159',
          accent: '#6e2a52',
          'accent-hover': '#581f41',
          'on-accent': '#ffffff',
          success: '#216b3f',
          warning: '#8a5500',
          danger: '#b3261e',
          'danger-hover': '#8f1e17',
          'on-danger': '#ffffff',
          focus: '#6e2a52',
        },
        shadowTint: '43 34 41',
        tightest: ['liseré de contrôle sur surface, 3,45:1', 'liseré de contrôle sur fond, 3,80:1'],
        gaps: { danger: 26.4, warning: 40.3, success: 56.9, terracotta: 39.3 },
      },
      dark: {
        colors: {
          background: '#17141a',
          surface: '#201c24',
          'surface-hover': '#29242e',
          raised: '#272230',
          border: '#342e3a',
          'border-strong': '#7e7487',
          text: '#efe9f0',
          'text-muted': '#b4aab8',
          accent: '#dfa0c8',
          'accent-hover': '#ebbbd9',
          'on-accent': '#2a0f20',
          success: '#6fcb92',
          warning: '#e3a94a',
          danger: '#ff8b82',
          'danger-hover': '#ffa8a1',
          'on-danger': '#2a0a08',
          focus: '#dfa0c8',
        },
        shadowTint: '0 0 0',
        tightest: [
          'liseré de contrôle sur surface surélevée, 3,49:1',
          'liseré de contrôle sur surface, 3,78:1',
        ],
        gaps: { danger: 20.3, warning: 42.4, success: 56.7, terracotta: 27.9 },
      },
    },
  },
  {
    id: 'cassis',
    name: 'Cassis',
    tagline: 'un indigo profond, côté myrtille',
    note:
      "Deuxième meilleur jeu d'écarts après le bleu de fonte, et plus sombre que lui : la couleur " +
      "se fait remarquer sans éclairer la page. C'est le coloris le plus éloigné du terracotta du " +
      'skill, à 47,8.',
    themes: {
      light: {
        colors: {
          background: '#fbfbfe',
          surface: '#eeeef7',
          'surface-hover': '#e4e4f0',
          raised: '#ffffff',
          border: '#dcdcec',
          'border-strong': '#7c7d94',
          text: '#1d1c28',
          'text-muted': '#4e4d61',
          accent: '#44367d',
          'accent-hover': '#342864',
          'on-accent': '#ffffff',
          success: '#1f6b3c',
          warning: '#8a5a00',
          danger: '#b3261e',
          'danger-hover': '#8f1e17',
          'on-danger': '#ffffff',
          focus: '#44367d',
        },
        shadowTint: '29 28 40',
        tightest: ['liseré de contrôle sur surface, 3,49:1', 'liseré de contrôle sur fond, 3,90:1'],
        gaps: { danger: 38.3, warning: 49.8, success: 43.2, terracotta: 47.8 },
      },
      dark: {
        colors: {
          background: '#141320',
          surface: '#1d1b2b',
          'surface-hover': '#262436',
          raised: '#232135',
          border: '#322f45',
          'border-strong': '#7b7896',
          text: '#eceaf4',
          'text-muted': '#aba9bf',
          accent: '#aaa2ea',
          'accent-hover': '#c0baf2',
          'on-accent': '#15112e',
          success: '#6fcb92',
          warning: '#e3ae5a',
          danger: '#ff9287',
          'danger-hover': '#ffafa6',
          'on-danger': '#330d08',
          focus: '#aaa2ea',
        },
        shadowTint: '0 0 0',
        tightest: [
          'liseré de contrôle sur surface surélevée, 3,71:1',
          'liseré de contrôle sur surface, 3,99:1',
        ],
        gaps: { danger: 32.4, warning: 47.3, success: 41.3, terracotta: 37.2 },
      },
    },
  },
  {
    id: 'poivre',
    name: 'Poivre',
    tagline: 'mon choix, le graphite chaud',
    note:
      "Une stratégie plutôt qu'une teinte : l'accent est presque achromatique, et tout le budget " +
      "de couleur part dans les états, qui deviennent les seules taches de l'écran. Réserve " +
      "assumée : le prix, qui porte l'audace, y est quasi noir, donc fort par sa taille et sa " +
      'graisse, pas par sa couleur.',
    themes: {
      light: {
        colors: {
          background: '#fcfcfb',
          surface: '#f1f0ed',
          'surface-hover': '#e7e5e1',
          raised: '#ffffff',
          border: '#e1dfda',
          'border-strong': '#807c74',
          text: '#211f1b',
          'text-muted': '#55514a',
          accent: '#3f3a34',
          'accent-hover': '#2b2722',
          'on-accent': '#ffffff',
          success: '#1f6b3c',
          warning: '#8a5a00',
          danger: '#b3261e',
          'danger-hover': '#8f1e17',
          'on-danger': '#ffffff',
          focus: '#3f3a34',
        },
        shadowTint: '33 31 27',
        tightest: ['liseré de contrôle sur surface, 3,65:1', 'liseré de contrôle sur fond, 4,05:1'],
        gaps: { danger: 28.6, warning: 25.3, success: 26.6, terracotta: 39.4 },
      },
      dark: {
        colors: {
          background: '#16140f',
          surface: '#1f1d17',
          'surface-hover': '#2d2a22',
          raised: '#262319',
          border: '#342f26',
          'border-strong': '#7e7868',
          text: '#efece4',
          'text-muted': '#b3ada0',
          accent: '#e0d9ce',
          'accent-hover': '#efe9e0',
          'on-accent': '#1d1a14',
          success: '#6fcb92',
          warning: '#e3ae5a',
          danger: '#ff9287',
          'danger-hover': '#ffafa6',
          'on-danger': '#330d08',
          focus: '#e0d9ce',
        },
        shadowTint: '0 0 0',
        tightest: [
          'liseré de contrôle sur surface surélevée, 3,57:1',
          'liseré de contrôle sur surface, 3,83:1',
        ],
        gaps: { danger: 25.8, warning: 21.4, success: 25.2, terracotta: 29.7 },
      },
    },
  },
];

/** Coloris essayés puis écartés, avec la mesure qui les écarte. */
const REJECTED = [
  {
    name: 'Vert olive',
    reason:
      'accent à 14,3 du vert de succès en clair et 16,7 en sombre. Un repère de succès et la ' +
      "couleur de marque se ressembleraient, et le succès ne peut pas s'en éloigner sans virer " +
      'au bleu-vert, précisément ce que vous ne voulez pas.',
  },
  {
    name: 'Vert sauge',
    reason:
      "pire encore que l'olive, de 10,9 à 13,7 du vert de succès selon la nuance essayée. Le vert " +
      'gris est moins saturé, donc plus proche du succès et non plus loin.',
  },
  {
    name: 'Bordeaux',
    reason:
      "tenable en clair, à 22, mais pas en sombre : il s'y éclaircit en un rose à 10,9 du rouge " +
      "d'erreur. L'éloigner le sortirait du bordeaux.",
  },
];

const THEMES: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: 'light', label: 'clair' },
  { id: 'dark', label: 'sombre' },
];

const NAV_ITEMS = ['Planning', 'Courses', 'Recettes', 'Dépenses'];
const CURRENT_NAV = 'Courses';

const GROCERIES = [
  { name: 'Blancs de poulet', quantity: '600 g', price: '7,40 €' },
  { name: 'Citrons jaunes', quantity: '3 pièces', price: '1,20 €' },
  { name: 'Thym frais', quantity: '1 botte', price: '1,10 €' },
];

/** Les jetons d'un coloris et d'un thème, en propriétés personnalisées. */
function tokensFor(colourway: Colourway, theme: ThemeId): Record<string, string> {
  const spec = colourway.themes[theme];
  const tint = spec.shadowTint;
  const strong = theme === 'light' ? '14%' : '38%';
  const soft = theme === 'light' ? '8%' : '30%';

  const vars: Record<string, string> = {
    '--font-sans': STRUCTURE.font,
    '--radius-sm': STRUCTURE.radii.sm,
    '--radius-md': STRUCTURE.radii.md,
    '--radius-lg': STRUCTURE.radii.lg,
    '--radius-pill': STRUCTURE.radii.pill,
    '--weight-body': STRUCTURE.weights.body,
    '--weight-label': STRUCTURE.weights.label,
    '--weight-heading': STRUCTURE.weights.heading,
    '--tracking-heading': STRUCTURE.tracking,
    '--leading': STRUCTURE.leading,
    '--shadow-1': `0 1px 2px rgb(${tint} / ${soft})`,
    '--shadow-2': `0 4px 14px rgb(${tint} / ${strong})`,
  };

  for (const [name, value] of Object.entries(spec.colors)) {
    vars[`--color-${name}`] = value;
  }

  return vars;
}

/** Le plus petit écart aux couleurs d'état : c'est lui qui juge un coloris. */
function worstGap(gaps: Gaps): number {
  return Math.min(gaps.danger, gaps.warning, gaps.success);
}
</script>

<template>
  <h1>Cinq coloris, une seule structure</h1>

  <p class="lead">
    Page temporaire. La structure est celle de Marmite, retenue : arrondis 3, 6 et 10 px, audace sur
    le prix, barre basse à trait épais, Atkinson Hyperlegible Next. Seules les couleurs changent, et
    les neutres changent avec l'accent. Les cinq coloris passent les trente couples de contraste
    dans les deux thèmes, sans aucun échec. Seul celui que vous retenez entrera dans
    <code>tokens.css</code>.
  </p>

  <p class="lead">
    L'écart est un <abbr title="différence de couleur CIEDE2000">dE2000</abbr> : au-dessous de 20,
    deux couleurs restent parentes à l'oeil, surtout en petit. C'est le chiffre qui décide ici, et
    c'est lui qui a écarté trois coloris, listés en bas de page.
  </p>

  <section v-for="colourway in COLOURWAYS" :key="colourway.id" class="colourway">
    <h2>{{ colourway.name }}, {{ colourway.tagline }}</h2>

    <p>{{ colourway.note }}</p>

    <table class="gaps">
      <caption>
        Écarts de l'accent, en dE2000
      </caption>
      <thead>
        <tr>
          <th scope="col">Thème</th>
          <th scope="col" class="num">Erreur</th>
          <th scope="col" class="num">Avertissement</th>
          <th scope="col" class="num">Succès</th>
          <th scope="col" class="num">Terracotta</th>
          <th scope="col">Contrastes les plus serrés</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="theme in THEMES" :key="theme.id">
          <th scope="row">{{ theme.label }}</th>
          <td class="num" :class="{ weak: colourway.themes[theme.id].gaps.danger < 20 }">
            {{ colourway.themes[theme.id].gaps.danger.toFixed(1).replace('.', ',') }}
          </td>
          <td class="num" :class="{ weak: colourway.themes[theme.id].gaps.warning < 20 }">
            {{ colourway.themes[theme.id].gaps.warning.toFixed(1).replace('.', ',') }}
          </td>
          <td class="num" :class="{ weak: colourway.themes[theme.id].gaps.success < 20 }">
            {{ colourway.themes[theme.id].gaps.success.toFixed(1).replace('.', ',') }}
          </td>
          <td class="num">
            {{ colourway.themes[theme.id].gaps.terracotta.toFixed(1).replace('.', ',') }}
          </td>
          <td>{{ colourway.themes[theme.id].tightest.join(' ; ') }}</td>
        </tr>
      </tbody>
    </table>

    <p class="verdict">
      Écart le plus faible aux couleurs d'état :
      <strong>
        {{
          Math.min(worstGap(colourway.themes.light.gaps), worstGap(colourway.themes.dark.gaps))
            .toFixed(1)
            .replace('.', ',')
        }}
      </strong>
    </p>

    <div class="frames">
      <figure v-for="theme in THEMES" :key="theme.id" class="figure">
        <figcaption>Mode {{ theme.label }}</figcaption>

        <div class="frame" :style="tokensFor(colourway, theme.id)">
          <div class="screen">
            <!-- Carte de recette : la seule surface surélevée de l'écran. -->
            <article class="card">
              <h3 class="card__title">Poulet rôti au citron et au thym</h3>

              <dl class="card__meta">
                <div>
                  <dt>Pour</dt>
                  <dd>4 personnes</dd>
                </div>
                <div>
                  <dt>Préparation</dt>
                  <dd>45 minutes</dd>
                </div>
              </dl>

              <p class="card__price">
                <span class="card__price-value">6,80 €</span>
                <span class="card__price-unit">par personne</span>
              </p>

              <div class="card__actions">
                <button type="button" class="btn btn--primary">Ajouter au planning</button>
                <button type="button" class="btn btn--secondary">Voir la recette</button>
              </div>
            </article>

            <!-- Liste de courses : un vrai tableau, avec ses en-têtes. -->
            <section class="groceries">
              <h3 class="section-title">Courses, rayon frais</h3>

              <table>
                <thead>
                  <tr>
                    <th scope="col">Article</th>
                    <th scope="col">Quantité</th>
                    <th scope="col" class="num">Prix</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in GROCERIES" :key="item.name">
                    <td>{{ item.name }}</td>
                    <td>{{ item.quantity }}</td>
                    <td class="num">{{ item.price }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colspan="2">Total</th>
                    <td class="num">9,70 €</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <!-- Les trois états côte à côte : c'est là que l'accent doit rester
                 reconnaissable comme n'étant pas un état. -->
            <div class="states">
              <span class="chip chip--success">Succès</span>
              <span class="chip chip--warning">Attention</span>
              <span class="chip chip--danger">Erreur</span>
              <span class="chip chip--accent">Accent</span>
            </div>

            <!-- Alerte d'erreur. Aucune région aria-live ici : c'est une
                 maquette, et dix régions vivantes se parleraient par-dessus. -->
            <div class="alert">
              <span class="alert__mark" aria-hidden="true">!</span>
              <p><strong>Erreur :</strong> le prix du thym n'a pas pu être récupéré.</p>
            </div>

            <!-- Champ en erreur. -->
            <div class="field">
              <label :for="`${colourway.id}-${theme.id}-budget`">Budget par semaine</label>
              <input
                :id="`${colourway.id}-${theme.id}-budget`"
                class="field__input"
                type="text"
                value="0"
                :aria-describedby="`${colourway.id}-${theme.id}-budget-error`"
                aria-invalid="true"
              />
              <p :id="`${colourway.id}-${theme.id}-budget-error`" class="field__error">
                <span class="field__error-mark" aria-hidden="true">!</span>
                <span>Erreur : indiquez un montant supérieur à zéro.</span>
              </p>
            </div>
          </div>

          <!-- Barre basse mobile, trait épais sur la page courante. -->
          <nav
            class="bottom"
            :aria-label="`Maquette de navigation, ${colourway.name}, mode ${theme.label}`"
          >
            <ul>
              <li v-for="item in NAV_ITEMS" :key="item">
                <a
                  href="#"
                  class="bottom__link"
                  :aria-current="item === CURRENT_NAV ? 'page' : undefined"
                  @click.prevent
                >
                  {{ item }}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </figure>
    </div>
  </section>

  <section class="colourway">
    <h2>Écartés, et pourquoi</h2>

    <p>
      Trois coloris ont été construits puis mesurés, et abandonnés sur le chiffre. Aucun n'échouait
      sur les contrastes : ils échouaient tous sur la distance à une couleur d'état.
    </p>

    <dl class="rejected">
      <div v-for="item in REJECTED" :key="item.name">
        <dt>{{ item.name }}</dt>
        <dd>{{ item.reason }}</dd>
      </div>
    </dl>

    <p>
      Les deux verts tombent pour la même raison de fond : le vert de succès occupe déjà cette
      partie du spectre. Un accent vert oblige à choisir entre ressembler au succès et virer au
      bleu-vert. Poivre a pris la place laissée libre.
    </p>
  </section>
</template>

<style scoped>
.lead,
.colourway > p,
.rejected {
  max-width: 70ch;
}

.colourway {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.gaps {
  margin-top: var(--space-4);
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.gaps caption {
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  text-align: left;
}

.gaps th,
.gaps td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.gaps .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Un écart trop faible se lit aussi autrement que par la couleur. */
.gaps .weak {
  color: var(--color-danger);
  font-weight: var(--weight-bold);
  text-decoration: underline;
  text-decoration-style: wavy;
}

.verdict {
  margin-top: var(--space-3);
}

.rejected {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.rejected dt {
  font-weight: var(--weight-bold);
}

.rejected dd {
  margin: 0;
}

.frames {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin-top: var(--space-6);
}

.figure {
  margin: 0;
}

.figure figcaption {
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

/*
  Le cadre est la fenêtre d'un téléphone, à 320 px, la largeur la plus étroite
  que le projet vise. Tout ce qu'il contient lit les jetons posés en ligne.
*/
.frame {
  position: relative;
  width: 320px;
  height: 940px;
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-weight: var(--weight-body);
  line-height: var(--leading);
}

.screen {
  height: 100%;
  overflow-y: auto;
  padding: 14px 14px calc(58px + 14px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  padding: 14px;
  background-color: var(--color-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-2);
}

.card__title {
  margin: 0;
  font-size: 19px;
  font-weight: var(--weight-heading);
  letter-spacing: var(--tracking-heading);
  line-height: 1.25;
}

.card__meta {
  display: flex;
  gap: 16px;
  margin: 10px 0 0;
  font-size: 13px;
}

.card__meta div {
  display: flex;
  flex-direction: column;
}

.card__meta dt {
  color: var(--color-text-muted);
}

.card__meta dd {
  margin: 0;
  font-weight: var(--weight-label);
}

.card__price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 12px 0 0;
}

/* L'audace de la structure Marmite : le prix, seul élément grand et coloré. */
.card__price-value {
  color: var(--color-accent);
  font-size: 30px;
  font-weight: var(--weight-heading);
  letter-spacing: var(--tracking-heading);
}

.card__price-unit {
  color: var(--color-text-muted);
  font-size: 13px;
}

.card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: 14px;
  font-weight: var(--weight-label);
  cursor: pointer;
}

.btn--primary {
  background-color: var(--color-accent);
  color: var(--color-on-accent);
}

.btn--secondary {
  background-color: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: var(--weight-heading);
  letter-spacing: var(--tracking-heading);
}

.groceries table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.groceries th,
.groceries td {
  padding: 7px 0;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.groceries thead th {
  color: var(--color-text-muted);
  font-weight: var(--weight-label);
}

.groceries .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.groceries tfoot th,
.groceries tfoot td {
  border-bottom: 0;
  font-weight: var(--weight-heading);
}

/* Les quatre pastilles mises côte à côte : la comparaison qui décide. */
.states {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: var(--weight-label);
}

.chip--success {
  background-color: var(--color-success);
  color: var(--color-background);
}

.chip--warning {
  background-color: var(--color-warning);
  color: var(--color-background);
}

.chip--danger {
  background-color: var(--color-danger);
  color: var(--color-on-danger);
}

.chip--accent {
  background-color: var(--color-accent);
  color: var(--color-on-accent);
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--color-surface);
  border-left: 4px solid var(--color-danger);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.alert p {
  margin: 0;
}

.alert__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  background-color: var(--color-danger);
  border-radius: var(--radius-pill);
  color: var(--color-on-danger);
  font-weight: var(--weight-heading);
  font-size: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.field label {
  font-weight: var(--weight-label);
}

.field__input {
  min-height: 44px;
  padding: 0 10px;
  background-color: var(--color-background);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font: inherit;
}

.field__error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.field__error-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  background-color: var(--color-danger);
  border-radius: var(--radius-pill);
  color: var(--color-on-danger);
  font-size: 11px;
  font-weight: var(--weight-heading);
}

/* Barre basse, collée au bas du cadre comme elle le serait à l'écran. */
.bottom {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-2);
}

.bottom ul {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bottom li {
  flex: 1;
}

.bottom__link {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Zone tactile de 44 px minimum, dans 80 px de large. */
  min-height: 56px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: var(--weight-label);
  text-decoration: none;
}

/* La page courante se signale par un trait et une graisse, pas par la couleur. */
.bottom__link[aria-current='page'] {
  box-shadow: inset 0 3px 0 0 var(--color-accent);
  color: var(--color-accent);
  font-weight: var(--weight-heading);
}
</style>
