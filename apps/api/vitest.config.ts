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
  },
});
