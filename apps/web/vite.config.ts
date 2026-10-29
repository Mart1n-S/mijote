import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mijote',
        short_name: 'Mijote',
        description:
          'Planification de repas sur 7 ou 14 jours, liste de courses par magasin, prix et valeurs nutritionnelles par repas.',
        lang: 'fr',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Couleurs provisoires : elles seront reprises aux jetons de design
        // avec la story du design system.
        background_color: '#ffffff',
        theme_color: '#111111',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
