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
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
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
      },
    },
  },
  {
    // Les fichiers de configuration n'appartiennent à aucun tsconfig de paquet :
    // les règles typées n'ont pas de programme sur lequel s'appuyer.
    files: ['*.js', '*.ts', '**/*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Le service de types d'ESLint ne sait pas lire un composant monofichier :
    // il faudrait pour cela le greffon TypeScript de Vue, une dépendance de
    // plus. Les règles typées sont donc coupées sur le front, où vue-tsc est
    // déjà le vérificateur de types, dans pnpm typecheck comme dans le build.
    files: ['apps/web/**/*.ts', 'apps/web/**/*.vue'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
