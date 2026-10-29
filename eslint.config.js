import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

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
  },
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
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
  },
  {
    // Les fichiers de configuration n'appartiennent à aucun tsconfig de paquet :
    // les règles typées n'ont pas de programme sur lequel s'appuyer.
    files: ['*.js', '*.ts', '**/*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
