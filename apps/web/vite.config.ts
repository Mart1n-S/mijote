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
        // Un manifeste ne lit pas une propriété CSS personnalisée : ces deux
        // valeurs sont donc recopiées à la main des jetons du thème clair,
        // --color-background et --color-accent, qui est ce que le système
        // d'exploitation affiche au lancement, avant que la page ne soit
        // rendue. Toute refonte du coloris doit repasser ici : c'est le seul
        // endroit du projet où une couleur vit hors de tokens.css, et
        // docs/design-system.md le signale.
        background_color: '#fbfbfe',
        theme_color: '#44367d',
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
