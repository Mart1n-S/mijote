import { resolve } from 'node:path';

import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Le .env vit à la racine du monorepo, et non dans apps/web : le chemin est
// calculé depuis ce fichier, comme le fait apps/api/src/env.ts.
const ENV_DIR = resolve(import.meta.dirname, '../..');

const DEFAULT_API_TARGET = 'http://localhost:3000';

export default defineConfig(({ mode }) => {
  /*
    L'API est appelée sous /api, sur la même origine que la PWA : par ce
    mandataire en développement et en prévisualisation, par le serveur frontal
    du homelab en production. Le navigateur n'a donc aucune adresse d'API à
    connaître, il n'y a aucune requête entre origines, et donc aucun CORS à
    ouvrir (les en-têtes de sécurité sont l'issue #31).

    La cible est lue dans le .env de la racine, et non dans l'environnement du
    shell : sans cela, changer VITE_API_URL n'aurait eu aucun effet, ce qui est
    exactement le genre de réglage qui ment en silence.
  */
  // Vide et absente se traitent pareil : .env.example apprend au lecteur
  // qu'une variable peut être laissée vide, et une cible vide ferait échouer
  // le mandataire au premier appel.
  const asked = loadEnv(mode, ENV_DIR, 'VITE_')['VITE_API_URL']?.trim();
  const target = asked === undefined || asked === '' ? DEFAULT_API_TARGET : asked;
  const proxy = {
    '/api': {
      target,
      // L'API sert `/health` : le préfixe `/api` ne sert qu'à distinguer ses
      // appels de ceux de la PWA, et ne fait pas partie de ses routes.
      rewrite: (path: string): string => path.replace(/^\/api/, ''),
    },
  };

  return {
    server: { proxy },
    preview: { proxy },
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
        workbox: {
          // L'API n'est pas servie par le service worker : sans cette
          // exclusion, un appel à /api pourrait recevoir index.html depuis le
          // cache de navigation, et le client lirait une page HTML là où il
          // attend du JSON.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  };
});
