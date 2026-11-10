import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Un projet par paquet du monorepo : chacun porte sa propre configuration.
    projects: ['apps/api', 'apps/web', 'packages/shared'],
    /*
      Six workers au plus, là où Vitest en lance un par cœur logique, soit une
      vingtaine sur le poste de développement. La raison est **Argon2id**.

      Chaque hachage réserve 64 Mio et prend une centaine de millisecondes
      (ADR 0011), et certains tests en paient dix ou quinze : l'activation du
      second facteur hache à elle seule dix codes de secours, un peu plus d'une
      seconde (ADR 0012). Sans borne, un worker par fichier et autant de
      workers que de cœurs se disputaient la mémoire, et ces tests dépassaient
      le délai par défaut de cinq secondes par rafales, sans que rien ne soit
      cassé : un échec par exécution ou deux, sur un test différent à chaque
      fois.

      La borne est ici et non dans `apps/api` pour deux raisons : la mémoire se
      partage entre tous les projets, et Vitest refuse un `maxWorkers` propre à
      un projet sans lui donner son propre `sequence.groupOrder`, ce qui
      sérialiserait les projets pour un gain nul.

      Borner les workers traite la cause plutôt que le symptôme : moins de
      hachages simultanés, donc des tests qui tiennent dans les délais par
      défaut, qui ne sont donc pas touchés. Mesuré le 10 novembre 2026 : six
      exécutions de suite sans un échec, et la suite passe de 45 à 21 secondes,
      la contention coûtant plus que le parallélisme ne rapportait.

      C'est un plafond, pas un plancher : en CI, où le runner a deux cœurs,
      Vitest en lançait déjà moins que six et la borne ne change rien.
    */
    maxWorkers: 6,
  },
});
