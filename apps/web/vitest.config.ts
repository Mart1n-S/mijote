import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Le greffon Vue est nécessaire ici aussi : le test du routeur importe la
  // page d'accueil, donc un composant monofichier.
  plugins: [vue()],
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
