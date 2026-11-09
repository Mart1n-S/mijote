import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  /*
    Rolldown, le transformateur par défaut de Vitest, traduit la syntaxe des
    décorateurs mais n'émet pas les métadonnées de `emitDecoratorMetadata`, dont
    dépend l'injection de dépendances de NestJS. C'est la limite écrite dans
    l'ADR 0002, qui annonçait ce jour : swc émet ces métadonnées, et
    app.http.spec.ts peut monter l'application entière pour mesurer le format
    d'erreur tel qu'un client le reçoit.

    Les options de décorateurs ne sont pas répétées ici : swc lit le
    tsconfig.json du paquet, qui porte déjà experimentalDecorators et
    emitDecoratorMetadata.
  */
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    /*
      Trente secondes pour les hooks, au lieu des dix par défaut.

      Les `beforeAll` des tests d'intégration préparent une vraie base et vident
      une boîte Mailpit, et ils hachent au passage un mot de passe en Argon2id,
      qui réserve 64 Mio et prend une centaine de millisecondes (ADR 0011). Avec
      un fichier de test par worker, une cinquantaine de workers se disputent le
      processeur au démarrage, et dix secondes ne suffisaient plus : le hook des
      invitations échouait une fois sur deux sur le poste de développement, sans
      que rien ne soit cassé.

      C'est la préparation qu'on allonge, pas les tests : `testTimeout` reste à
      cinq secondes, donc un test qui attend vraiment quelque chose échoue
      toujours vite.
    */
    hookTimeout: 30_000,
  },
});
