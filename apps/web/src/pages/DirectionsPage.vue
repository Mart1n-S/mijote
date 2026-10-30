<script setup lang="ts">
/*
  PAGE TEMPORAIRE. Elle sert à choisir une direction visuelle et disparaît
  avant la fusion de la PR #17, avec sa route et ce fichier. Seule la direction
  retenue entre dans tokens.css.

  Les trois palettes sont posées ici en dur, et c'est volontaire : il faut
  pouvoir afficher les six thèmes en même temps, donc sans dépendre de
  prefers-color-scheme ni des jetons du projet. Chaque cadre redéfinit les
  mêmes noms de jetons dans sa propre portée.
*/

type ThemeId = 'light' | 'dark';

interface ThemeSpec {
  /** Les jetons de couleur, sans le préfixe `--color-`. */
  colors: Record<string, string>;
  /** Deux niveaux d'ombre, le second pour ce qui flotte au-dessus du reste. */
  shadows: { 1: string; 2: string };
  /** Comment l'élévation se marque dans ce thème. */
  elevation: string;
}

interface Direction {
  id: string;
  name: string;
  tagline: string;
  rationale: string;
  /** L'unique endroit où cette direction se permet d'être forte. */
  bold: string;
  radii: { sm: string; md: string; lg: string; pill: string };
  typography: {
    body: number;
    label: number;
    heading: number;
    tracking: string;
    leading: string;
    scale: string;
  };
  /** Comment la page courante se signale, en plus de la couleur. */
  navIndicator: 'bar' | 'pill' | 'underline';
  themes: Record<ThemeId, ThemeSpec>;
  tightest: { light: string[]; dark: string[] };
}

const FONT = "'Atkinson Hyperlegible Next', system-ui, sans-serif";

const DIRECTIONS: Direction[] = [
  {
    id: 'marmite',
    name: 'Marmite',
    tagline: 'roux de fonte',
    rationale:
      "Un roux profond, couleur d'oignon revenu, posé sur des neutres tirés vers le brun. La " +
      "direction la plus proche de la cuisine, mais tenue à l'écart du terracotta : l'accent est " +
      'plus foncé et plus saturé, et le fond est un blanc à peine tiède, pas une crème.',
    bold: 'Le prix par personne, seul élément mis en couleur et en gros. Le reste est calme.',
    radii: { sm: '3px', md: '6px', lg: '10px', pill: '999px' },
    typography: {
      body: 400,
      label: 600,
      heading: 800,
      tracking: '-0.01em',
      leading: '1.5',
      scale: 'resserrée, titres compacts',
    },
    navIndicator: 'bar',
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
        shadows: {
          1: '0 1px 2px rgb(42 33 28 / 8%)',
          2: '0 4px 14px rgb(42 33 28 / 14%)',
        },
        elevation: 'ombre portée, teintée du brun du texte',
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
        shadows: {
          1: '0 1px 2px rgb(0 0 0 / 30%)',
          2: '0 4px 14px rgb(0 0 0 / 38%)',
        },
        elevation: 'surface plus claire que le fond, ombre réduite au minimum',
      },
    },
    tightest: {
      light: [
        'accent sur surface survolée, 4,79:1 pour 4,5',
        'liseré de contrôle sur surface, 3,50:1 pour 3',
      ],
      dark: [
        'liseré de contrôle sur surface surélevée, 3,48:1 pour 3',
        'liseré de contrôle sur surface, 3,75:1 pour 3',
      ],
    },
  },
  {
    id: 'aubergine',
    name: 'Aubergine',
    tagline: 'prune et rondeur',
    rationale:
      "Une prune sourde, chaude parce qu'elle penche vers le rouge et non vers le bleu. C'est la " +
      "direction la plus inattendue des trois, et celle qui ne risque jamais d'être confondue " +
      'avec un avertissement ou une erreur. Formes plus rondes, transitions plus douces.',
    bold: "L'action principale, seule forme en pilule pleine de la page.",
    radii: { sm: '6px', md: '12px', lg: '18px', pill: '999px' },
    typography: {
      body: 400,
      label: 500,
      heading: 700,
      tracking: '0',
      leading: '1.6',
      scale: 'aérée, interlignes larges',
    },
    navIndicator: 'pill',
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
        shadows: {
          1: '0 1px 3px rgb(43 34 41 / 7%)',
          2: '0 6px 20px rgb(43 34 41 / 12%)',
        },
        elevation: 'ombre large et très douce',
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
        shadows: {
          1: '0 1px 3px rgb(0 0 0 / 28%)',
          2: '0 6px 20px rgb(0 0 0 / 35%)',
        },
        elevation: 'surface plus claire, à peine ombrée',
      },
    },
    tightest: {
      light: [
        'liseré de contrôle sur surface, 3,45:1 pour 3',
        'liseré de contrôle sur fond, 3,80:1 pour 3',
      ],
      dark: [
        'liseré de contrôle sur surface surélevée, 3,49:1 pour 3',
        'liseré de contrôle sur surface, 3,78:1 pour 3',
      ],
    },
  },
  {
    id: 'cafe',
    name: 'Café',
    tagline: 'brun torréfié',
    rationale:
      "Un brun de café très foncé comme couleur de marque, et le jaune réservé à l'avertissement. " +
      "L'accent y sert de chrome plutôt que de tache de couleur, ce qui laisse toute la place au " +
      'titrage. La plus sobre des trois, et la plus contrastée.',
    bold: 'Le titre, en graisse 800, qui porte seul la personnalité de la page.',
    radii: { sm: '4px', md: '8px', lg: '12px', pill: '999px' },
    typography: {
      body: 400,
      label: 600,
      heading: 800,
      tracking: '-0.02em',
      leading: '1.55',
      scale: 'contrastée, grand écart entre titre et texte',
    },
    navIndicator: 'underline',
    themes: {
      light: {
        colors: {
          background: '#fbfaf8',
          surface: '#f0eee9',
          'surface-hover': '#e6e3dc',
          raised: '#ffffff',
          border: '#dedad2',
          'border-strong': '#857f74',
          text: '#231f1a',
          'text-muted': '#58524a',
          accent: '#5a3a28',
          'accent-hover': '#452b1d',
          'on-accent': '#ffffff',
          success: '#2a6b33',
          warning: '#8a5a00',
          danger: '#b3261e',
          'danger-hover': '#8f1e17',
          'on-danger': '#ffffff',
          focus: '#5a3a28',
        },
        shadows: {
          1: '0 1px 1px rgb(35 31 26 / 6%)',
          2: '0 2px 8px rgb(35 31 26 / 10%)',
        },
        elevation: 'liseré net, ombre presque absente',
      },
      dark: {
        colors: {
          background: '#1a1713',
          surface: '#241f19',
          'surface-hover': '#2d2821',
          raised: '#2a241d',
          border: '#38322a',
          'border-strong': '#7c7466',
          text: '#f0ece3',
          'text-muted': '#b6ae9f',
          accent: '#d9b38c',
          'accent-hover': '#e6c7a6',
          'on-accent': '#2a1b0e',
          success: '#78c98a',
          warning: '#e3b35a',
          danger: '#ff9287',
          'danger-hover': '#ffafa6',
          'on-danger': '#330d08',
          focus: '#d9b38c',
        },
        shadows: {
          1: '0 1px 1px rgb(0 0 0 / 25%)',
          2: '0 2px 8px rgb(0 0 0 / 30%)',
        },
        elevation: 'surface plus claire, pas d ombre visible',
      },
    },
    tightest: {
      light: [
        'liseré de contrôle sur surface, 3,43:1 pour 3',
        'liseré de contrôle sur fond, 3,81:1 pour 3',
      ],
      dark: [
        'liseré de contrôle sur surface surélevée, 3,32:1 pour 3',
        'liseré de contrôle sur surface, 3,54:1 pour 3',
      ],
    },
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

/** Les jetons d'une direction et d'un thème, en propriétés personnalisées. */
function tokensFor(direction: Direction, theme: ThemeId): Record<string, string> {
  const spec = direction.themes[theme];
  const vars: Record<string, string> = {
    '--font-sans': FONT,
    '--radius-sm': direction.radii.sm,
    '--radius-md': direction.radii.md,
    '--radius-lg': direction.radii.lg,
    '--radius-pill': direction.radii.pill,
    '--shadow-1': spec.shadows[1],
    '--shadow-2': spec.shadows[2],
    '--weight-body': String(direction.typography.body),
    '--weight-label': String(direction.typography.label),
    '--weight-heading': String(direction.typography.heading),
    '--tracking-heading': direction.typography.tracking,
    '--leading': direction.typography.leading,
  };

  for (const [name, value] of Object.entries(spec.colors)) {
    vars[`--color-${name}`] = value;
  }

  return vars;
}
</script>

<template>
  <h1>Trois directions visuelles</h1>

  <p class="lead">
    Page temporaire. Chaque direction est montrée sur le même écran réaliste, en clair et en sombre,
    à 320 px de large avec sa barre de navigation basse. Les trois palettes passent les trente
    couples de contraste exigés, dans les deux thèmes. Seule celle que vous retenez entrera dans
    <code>tokens.css</code>.
  </p>

  <section v-for="direction in DIRECTIONS" :key="direction.id" class="direction">
    <h2>{{ direction.name }}, {{ direction.tagline }}</h2>

    <p>{{ direction.rationale }}</p>

    <dl class="spec">
      <div>
        <dt>Audace</dt>
        <dd>{{ direction.bold }}</dd>
      </div>
      <div>
        <dt>Arrondis</dt>
        <dd>
          {{ direction.radii.sm }}, {{ direction.radii.md }}, {{ direction.radii.lg }}, et une
          pilule pour les formes pleines
        </dd>
      </div>
      <div>
        <dt>Ombres, en clair</dt>
        <dd>{{ direction.themes.light.elevation }}</dd>
      </div>
      <div>
        <dt>Ombres, en sombre</dt>
        <dd>{{ direction.themes.dark.elevation }}</dd>
      </div>
      <div>
        <dt>Typographie</dt>
        <dd>
          Atkinson Hyperlegible Next, graisses {{ direction.typography.body }},
          {{ direction.typography.label }} et {{ direction.typography.heading }}, échelle
          {{ direction.typography.scale }}
        </dd>
      </div>
      <div>
        <dt>Contrastes les plus serrés</dt>
        <dd>
          <ul class="tight">
            <li v-for="line in direction.tightest.light" :key="line">Clair : {{ line }}</li>
            <li v-for="line in direction.tightest.dark" :key="line">Sombre : {{ line }}</li>
          </ul>
        </dd>
      </div>
    </dl>

    <div class="frames">
      <figure v-for="theme in THEMES" :key="theme.id" class="figure">
        <figcaption>Mode {{ theme.label }}</figcaption>

        <div class="frame" :style="tokensFor(direction, theme.id)">
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

            <!-- Alerte d'erreur. Aucune région aria-live ici : c'est une
                 maquette, et six régions vivantes se parleraient par-dessus. -->
            <div class="alert">
              <span class="alert__mark" aria-hidden="true">!</span>
              <p><strong>Erreur :</strong> le prix du thym n'a pas pu être récupéré.</p>
            </div>

            <!-- Champ en erreur. -->
            <div class="field">
              <label :for="`${direction.id}-${theme.id}-budget`">Budget par semaine</label>
              <input
                :id="`${direction.id}-${theme.id}-budget`"
                class="field__input"
                type="text"
                value="0"
                :aria-describedby="`${direction.id}-${theme.id}-budget-error`"
                aria-invalid="true"
              />
              <p :id="`${direction.id}-${theme.id}-budget-error`" class="field__error">
                <span class="field__error-mark" aria-hidden="true">!</span>
                <span>Erreur : indiquez un montant supérieur à zéro.</span>
              </p>
            </div>
          </div>

          <!-- Barre basse mobile. -->
          <nav
            class="bottom"
            :aria-label="`Maquette de navigation, ${direction.name}, mode ${theme.label}`"
          >
            <ul>
              <li v-for="item in NAV_ITEMS" :key="item">
                <a
                  href="#"
                  :class="['bottom__link', `bottom__link--${direction.navIndicator}`]"
                  :aria-current="item === CURRENT_NAV ? 'page' : undefined"
                  @click.prevent
                >
                  <span class="bottom__dot" aria-hidden="true" />
                  {{ item }}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.lead,
.direction > p,
.spec {
  max-width: 70ch;
}

.direction {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.spec {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.spec div {
  display: grid;
  grid-template-columns: 12rem 1fr;
  gap: var(--space-3);
}

.spec dt {
  font-weight: var(--weight-medium);
}

.spec dd {
  margin: 0;
}

.tight {
  margin: 0;
  padding-left: var(--space-5);
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
  Le cadre est la fenêtre d'un téléphone : 320 px de large, la largeur la plus
  étroite que le projet vise. Tout ce qu'il contient lit les jetons posés en
  ligne, et non ceux du projet.
*/
.frame {
  position: relative;
  width: 320px;
  /* Plus haut qu'un téléphone réel, pour que l'écran entier soit visible sans
     défiler : la largeur est ce qui compte ici, pas la hauteur. */
  height: 880px;
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

.card__price-value {
  color: var(--color-accent);
  font-size: 15px;
  font-weight: var(--weight-label);
}

/* Marmite dépense son audace ici : le prix, grand et en couleur. */
.frame:has(.bottom__link--bar) .card__price-value {
  font-size: 30px;
  font-weight: var(--weight-heading);
  letter-spacing: var(--tracking-heading);
}

/* Café la dépense sur le titre. */
.frame:has(.bottom__link--underline) .card__title {
  font-size: 25px;
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

/* Aubergine dépense son audace ici : la seule pilule pleine de l'écran. */
.frame:has(.bottom__link--pill) .btn--primary {
  border-radius: var(--radius-pill);
  padding: 0 20px;
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  /* Zone tactile de 44 px minimum, dans 80 px de large. */
  min-height: 56px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: var(--weight-label);
  text-decoration: none;
}

.bottom__link[aria-current='page'] {
  color: var(--color-accent);
  font-weight: var(--weight-heading);
}

.bottom__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background-color: transparent;
}

/* Trois façons de marquer la page courante sans compter sur la couleur. */
.bottom__link--bar[aria-current='page'] {
  box-shadow: inset 0 3px 0 0 var(--color-accent);
}

.bottom__link--pill[aria-current='page'] {
  background-color: var(--color-surface-hover);
  border-radius: var(--radius-pill);
  margin: 4px;
  min-height: 48px;
}

.bottom__link--underline[aria-current='page'] {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.bottom__link--underline[aria-current='page'] .bottom__dot {
  background-color: var(--color-accent);
}
</style>
