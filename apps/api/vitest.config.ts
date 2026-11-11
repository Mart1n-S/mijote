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
      Quinze secondes par test, et non les cinq par défaut. La raison est
      **Argon2id**, comme la borne de workers de la racine, mais le levier est
      ici parce que le coût n'est pas partagé : seul ce paquet hache.

      Les deux leviers servent ensemble, et la racine dit pourquoi elle borne.
      Ce qui se mesure ici est l'autre moitié : quelques tests d'intégration
      paient dix à quinze hachages, soit une seconde et demie à deux secondes de
      processeur incompressible (ADR 0011), l'activation du second facteur
      hachant à elle seule dix codes de secours (ADR 0012). Cinq secondes ne
      laissent alors presque pas de marge, et la moindre contention les dépasse.

      Mesure du 11 novembre 2026, sur 62 fichiers : à six workers et cinq
      secondes, deux tests tombaient par dépassement sans rien de cassé ; à
      quatre workers la suite passait mais montait de 63 à 90 secondes. Monter
      le délai garde les six workers et la durée, et ne cache rien : un test
      vraiment bloqué dépasse quinze secondes comme il dépassait cinq.

      Le délai des crochets monte pour la même raison, et il lui faut plus : un
      crochet d'intégration monte l'application NestJS entière, puis crée ses
      comptes, soit deux à trois secondes de démarrage et une poignée de
      hachages. Quatre fichiers font cela en parallèle, et trois d'entre eux
      dépassaient les dix secondes par défaut.
    */
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
