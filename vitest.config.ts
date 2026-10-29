import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Un projet par paquet du monorepo : chacun porte sa propre configuration.
    projects: ['apps/api', 'apps/web', 'packages/shared'],
  },
});
