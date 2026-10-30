import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const EN_CI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  forbidOnly: EN_CI,
  retries: EN_CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // Chromium seul : chaque navigateur de plus est un téléchargement de
  // plusieurs centaines de méga-octets sur le poste et en CI.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Les tests visent la construction livrée, servie par vite preview : c'est
  // la seule façon de voir la PWA telle qu'elle sera déployée. Le mode demo
  // n'en change qu'une chose, la page de démonstration du design system, que
  // la production exclut et que les tests doivent pourtant atteindre.
  webServer: {
    command: `pnpm --filter @mijote/web build:demo && pnpm --filter @mijote/web preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !EN_CI,
    timeout: 120_000,
  },
});
