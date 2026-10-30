import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.vite/**',
      'playwright-report/**',
      'test-results/**',
      'spikes/**',
      'apps/api/drizzle/**',
      'apps/web/dev-dist/**',
    ],
  },
  js.configs.recommended,
  {
    // Règles typées sur les .ts seulement, jamais sur les .vue : voir plus bas.
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          // Charge les greffons déclarés dans les tsconfig, dont celui de Vue
          // pour apps/web. Sans lui, un composant monofichier importé depuis un
          // .ts est vu comme un type en erreur. Désactivé par défaut, pour la
          // vitesse.
          loadTypeScriptPlugins: true,
        },
        tsconfigRootDir: import.meta.dirname,
        // Sans quoi le service de types ignore les composants monofichiers, et
        // les fichiers .ts qui en importent n'ont plus de types.
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // Garantie plutôt que relecture : une fonction exportée sans type de
      // retour est un oubli mécanique, que personne ne doit avoir à repérer
      // à l'oeil. La rule typescript.md le demande déjà, le lint le tient.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  pluginVue.configs['flat/recommended'],

  // Les violations évidentes du RGAA dans un gabarit (champ sans label, image
  // sans alternative, div cliquable) sont attrapées ici et non en relecture.
  // La configuration du plugin pose une base sans `files`, qui verserait 1200
  // variables globales de navigateur dans tout le dépôt, apps/api comprise :
  // on la restreint aux composants.
  ...pluginVueA11y.configs['flat/recommended'].map((config) => ({
    files: ['**/*.vue'],
    ...config,
  })),
  {
    files: ['**/*.vue'],
    // Les règles non typées de typescript-eslint, dont no-explicit-any,
    // s'appliquent aussi aux composants : elles lisent la source du <script>,
    // pas le TypeScript que le greffon de Vue génère derrière lui, donc elles
    // ne réveillent pas ses identifiants __VLS_*. Seules les règles typées
    // restent dehors, pour la raison dite juste en dessous.
    extends: [tseslint.configs.recommended],
    languageOptions: {
      // tseslint.configs.recommended pose son propre parseur. On remet
      // vue-eslint-parser, qui doit rester le parseur de premier niveau d'un
      // composant monofichier, et qui délègue le <script> au parseur
      // TypeScript.
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        // Les composants sont analysés sur leur source par vue-eslint-parser.
        // Leur donner le service de types ferait linter le TypeScript que le
        // greffon de Vue génère derrière eux, avec ses identifiants __VLS_*,
        // au lieu du composant réellement écrit. Leurs types sont couverts par
        // vue-tsc, dans pnpm typecheck comme dans le build.
        projectService: false,
      },
    },
    rules: {
      // Par défaut, la règle exige à la fois l'imbrication du champ dans le
      // label et le couple for/id. Le RGAA se contente de l'un des deux, et
      // l'imbrication interdirait de placer l'aide du champ entre le label et
      // le champ, où le lecteur d'écran la restitue au bon moment. On garde
      // donc for/id, qui est l'association explicite.
      'vuejs-accessibility/label-has-for': ['error', { required: { some: ['nesting', 'id'] } }],
    },
  },
  {
    // Les fichiers de configuration n'appartiennent à aucun tsconfig de paquet :
    // les règles typées n'ont pas de programme sur lequel s'appuyer.
    files: ['*.js', '*.ts', '**/*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
