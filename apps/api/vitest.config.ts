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
      Des délais plus larges que les défauts de Vitest (5 s par test, 10 s par
      crochet), et la raison est une seule : **Argon2id**.

      Chaque hachage réserve 64 Mio et prend une centaine de millisecondes
      (ADR 0011). Or certains tests en paient dix ou quinze : l'activation du
      second facteur hache à elle seule dix codes de secours, un peu plus d'une
      seconde (ADR 0012), et les crochets des tests d'intégration créent
      plusieurs comptes. Avec un fichier de test par worker, une cinquantaine de
      workers se disputent le processeur et la mémoire, et ces tests dépassaient
      les cinq secondes par rafales, sans que rien ne soit cassé : un échec sur
      deux exécutions, sur un test différent à chaque fois.

      Ces délais ne cachent donc pas une lenteur à corriger, ils disent le coût
      d'un hachage qu'on a choisi lent exprès. Ce qu'ils protègent reste entier :
      un test qui attend pour de bon, comme celui de l'envoyeur bloquant de la
      réinitialisation, échoue toujours, quinze secondes plus tard.
    */
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
