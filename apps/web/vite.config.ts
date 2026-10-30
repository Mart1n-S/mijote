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
        // valeurs sont donc recopiées des jetons du thème clair, qui est
        // celui que le système d'exploitation affiche au lancement, avant que
        // la page ne soit rendue. Voir apps/web/src/styles/tokens.css.
        background_color: '#ffffff',
        theme_color: '#0f6b58',
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
