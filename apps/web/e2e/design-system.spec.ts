import { expect, test, type Locator, type Page } from '@playwright/test';

import { accessibilityMatrix, accessibilityViolations } from './accessibility';

/*
  La page de démonstration du design system sert de support au contrôle
  d'accessibilité automatisé. Elle n'existe pas en production : les tests
  servent une construction build:demo, qui ne diffère que par cette page
  (voir playwright.config.ts).

  Ce fichier porte aussi ce que jsdom ne peut pas vérifier : l'activation d'un
  bouton natif au clavier, et le démontage du dialogue avec le retour du focus,
  que Reka UI fait à la fin de l'animation de sortie.
*/

accessibilityMatrix('/design-system');

test.describe('page de démonstration du design system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  });

  test("mène au contenu principal par le lien d'évitement", async ({ page }) => {
    // Le lien d'évitement doit être le premier élément focusable du document.
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skipLink).toBeFocused();
    // Masqué au repos, il doit devenir visible dès qu'il a le focus.
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
  });

  test('active un bouton par Entrée et par Espace', async ({ page }) => {
    // Le tableau des états montre lui aussi des boutons « Enregistrer » :
    // on vise celui de la section « Action en cours », et lui seul.
    const section = page.getByRole('region', { name: 'Action en cours' });
    const toggle = section.getByRole('button', { name: 'Mettre Enregistrer en cours' });
    const save = section.getByRole('button', { name: /^Enregistrer/ });

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');

    await toggle.focus();
    await page.keyboard.press('Enter');

    // En cours, le bouton garde le focus et reste atteignable : il porte
    // aria-disabled, jamais l'attribut disabled.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).not.toHaveAttribute('disabled', '');

    await section.getByRole('button', { name: "Arrêter l'action en cours" }).focus();
    await page.keyboard.press(' ');

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('annonce un message dans une région aria-live déjà présente', async ({ page }) => {
    // La région doit préexister au message, sinon il n'est pas annoncé.
    const region = page.locator('[role="status"]').last();
    await expect(region).toBeAttached();
    await expect(region).toHaveText('');

    await page.getByRole('button', { name: 'Annoncer un message' }).click();

    await expect(region).toContainText('Message annoncé 1 fois');
  });

  test.describe('dialogue modal', () => {
    test('entre le focus, puis le rend au déclencheur à la fermeture', async ({ page }) => {
      const trigger = page.getByRole('button', { name: 'Supprimer la semaine' });

      await trigger.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Supprimer la semaine du 3 novembre ?');

      // Le focus doit être entré dans le dialogue.
      await expect(dialog.locator(':focus')).toBeAttached();

      await page.keyboard.press('Escape');

      // C'est ce que jsdom ne montre pas : le contenu est réellement démonté,
      // et le focus revient sur le bouton qui a ouvert le dialogue.
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test("n'a aucune violation d'accessibilité une fois ouvert", async ({ page }) => {
      await page.getByRole('button', { name: 'Supprimer la semaine' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });

    /*
      Sous 640 px, le dialogue est le seul composant qui partage l'écran avec la
      barre de navigation fixe. Jusqu'au 31 octobre 2026, la barre se peignait
      par-dessus le voile et le dialogue, et le seul test qui ouvrait le
      dialogue tournait à 1280 px, largeur à laquelle la barre repasse dans le
      flux et perd son z-index : rien ne pouvait le voir.

      Les deux hauteurs ne mesurent pas la même chose. À 640 px le dialogue
      tient en entier ; à 256 px il atteint sa hauteur maximale et c'est lui
      qui défile, le cas où son titre ou ses boutons pourraient devenir
      inatteignables.
    */
    test.describe('sous 640 px', () => {
      const PETITES_FENETRES = [
        { width: 320, height: 640 },
        { width: 320, height: 256 },
      ] as const;

      interface PlaceDansLaFenetre {
        haut: number;
        bas: number;
        gauche: number;
        droite: number;
        fenetre: { largeur: number; hauteur: number };
        recouvert: boolean;
        sommet: string;
      }

      /**
       * Rend la barre de navigation sensible au pointeur, le temps de la mesure.
       *
       * Sans cela, aucune mesure par `elementFromPoint` ne peut voir la barre :
       * Reka UI pose `pointer-events: none` sur l'arrière-plan d'un dialogue
       * modal, et un test de pointage ignore ce qui n'est pas pointable. Une
       * première version de ces tests passait donc au vert sur la version
       * défectueuse, où la barre se peignait par-dessus le voile : elle
       * mesurait le `pointer-events`, pas l'ordre de peinture.
       *
       * Avec la barre pointable, le pointage suit l'ordre de peinture, qui est
       * la question posée : qu'est-ce qui est devant.
       */
      async function rendLaBarrePointable(page: Page): Promise<void> {
        await page.evaluate(() => {
          document.querySelector('nav')?.style.setProperty('pointer-events', 'auto');
        });
      }

      /** Amène un élément dans la vue, puis mesure sa place dans la fenêtre. */
      async function amenerDansLaVue(cible: Locator): Promise<PlaceDansLaFenetre> {
        // Le contenu du dialogue défile dans le dialogue : une partie hors de
        // la vue n'est pas un défaut tant qu'on peut l'y amener.
        await cible.scrollIntoViewIfNeeded();

        return cible.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          /*
            elementFromPoint répond à la seconde question, celle qu'un
            rectangle ne dit pas : l'élément est-il recouvert. Une boîte bien
            placée dans la fenêtre mais peinte sous la barre de navigation
            n'est pas atteignable, et c'est exactement le défaut corrigé ici.
          */
          const sommet = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );

          return {
            haut: rect.top,
            bas: rect.bottom,
            gauche: rect.left,
            droite: rect.right,
            fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
            recouvert: sommet === null || !(element === sommet || element.contains(sommet)),
            sommet: sommet === null ? 'rien' : sommet.tagName.toLowerCase(),
          };
        });
      }

      /** Exige qu'un élément soit entier dans la fenêtre et non recouvert. */
      function attendVisible(place: PlaceDansLaFenetre, quoi: string): void {
        expect(place.haut, `${quoi} sort par le haut`).toBeGreaterThanOrEqual(0);
        expect(place.bas, `${quoi} sort par le bas`).toBeLessThanOrEqual(place.fenetre.hauteur);
        expect(place.gauche, `${quoi} sort à gauche`).toBeGreaterThanOrEqual(0);
        expect(place.droite, `${quoi} sort à droite`).toBeLessThanOrEqual(place.fenetre.largeur);
        expect(place.recouvert, `${quoi} est recouvert par un ${place.sommet}`).toBe(false);
      }

      /** Dit si un contrôle est atteint par tabulations, dans le piège de focus. */
      async function atteintParTabulation(page: Page, cible: Locator): Promise<boolean> {
        // Le piège de focus de Reka UI boucle sur les contrôles du dialogue,
        // qui sont trois : huit tabulations en font plus que le tour.
        for (let essai = 0; essai < 8; essai += 1) {
          if (await cible.evaluate((element) => element === document.activeElement)) {
            return true;
          }

          await page.keyboard.press('Tab');
        }

        return false;
      }

      test('fait passer le voile au-dessus de la barre de navigation', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await page.getByRole('button', { name: 'Supprimer la semaine' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        await rendLaBarrePointable(page);

        const sommet = await page.evaluate(() => {
          const nav = document.querySelector('nav');

          if (nav === null) {
            return null;
          }

          const rect = nav.getBoundingClientRect();
          const element = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );

          if (element === null) {
            return null;
          }

          return {
            dansLaBarre: nav.contains(element),
            dansLaModalite: element.closest('.dialog__overlay, .dialog') !== null,
          };
        });

        expect(sommet).not.toBeNull();
        // Ce que voit l'oeil doit dire la même chose que ce qu'annonce le
        // lecteur d'écran, auquel Reka UI a déjà retiré la barre.
        expect(sommet?.dansLaBarre, 'la barre est encore au-dessus du voile').toBe(false);
        expect(sommet?.dansLaModalite).toBe(true);
      });

      for (const fenetre of PETITES_FENETRES) {
        test(`garde tout le dialogue atteignable à ${fenetre.width} x ${fenetre.height}`, async ({
          page,
        }) => {
          await page.setViewportSize(fenetre);
          await page.getByRole('button', { name: 'Supprimer la semaine' }).click();

          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();

          // À 320 x 256, le dialogue descend jusque sur la barre : sans cette
          // ligne, un titre ou un bouton peint sous elle passerait pour
          // atteignable.
          await rendLaBarrePointable(page);

          attendVisible(await amenerDansLaVue(dialog), 'le dialogue');

          const parties: ReadonlyArray<readonly [string, Locator]> = [
            ['le titre', dialog.getByRole('heading', { level: 2 })],
            ['la description', dialog.locator('.dialog__description')],
            ['le contenu', dialog.getByText('Cette démonstration ne supprime rien.')],
            ['le bouton Supprimer', dialog.getByRole('button', { name: 'Supprimer', exact: true })],
            ['le bouton Annuler', dialog.getByRole('button', { name: 'Annuler' })],
          ];

          for (const [quoi, cible] of parties) {
            attendVisible(await amenerDansLaVue(cible), quoi);
          }

          for (const [quoi, cible] of parties.slice(-2)) {
            expect(
              await atteintParTabulation(page, cible),
              `${quoi} n'est pas atteint par tabulation`,
            ).toBe(true);
          }

          // Le dialogue reste dans la largeur de la fenêtre, dialogue ouvert
          // compris. Attention : ce contrôle ne départage pas les unités de
          // fenêtre du pourcentage, parce que Chromium sans tête n'a pas de
          // barre de défilement classique, qui est toute la différence entre
          // les deux (voir le commentaire de largeur dans BaseDialog).
          const debordement = await page.evaluate(() => {
            const root = document.documentElement;

            return root.scrollWidth - root.clientWidth;
          });

          expect(debordement).toBeLessThanOrEqual(0);
        });
      }
    });
  });

  /*
    La copie figée des états recopie à la main les règles des composants, et
    rien ne la gardait : trois divergences y ont vécu sans être vues jusqu'au
    31 octobre 2026.

    Ces tests comparent chaque état figé à ce que le composant vivant de la
    ligne « Repos » produit réellement, en thème sombre. Le thème sombre et
    non le clair, parce que l'une des trois divergences portait sur deux
    jetons qui ont la même valeur en clair : en thème clair, ce test l'aurait
    manquée.
  */
  test.describe('copie figée des états', () => {
    test.use({ colorScheme: 'dark' });

    const FIELD_PROPERTIES = ['border-color', 'background-color'];
    const FOCUS_PROPERTIES = [
      'outline-color',
      'outline-style',
      'outline-width',
      'outline-offset',
      // Le rayon aussi : une des divergences était un border-radius posé sur
      // l'anneau figé, que base.css refuse justement de poser.
      'border-radius',
    ];
    const VARIANTS = ['primary', 'secondary', 'danger'] as const;

    /** Les propriétés calculées d'un élément, dans son état courant. */
    async function computedStyle(
      locator: Locator,
      properties: readonly string[],
    ): Promise<Record<string, string>> {
      return locator.evaluate(async (element, names: readonly string[]) => {
        /*
          La lecture attend la fin des transitions en cours. Le survol et
          l'enfoncement passent par une transition de --duration-fast, donc
          une lecture immédiate après le geste attrape une couleur
          intermédiaire, qui n'est celle d'aucun état : c'est ce que mesurait
          une première version de ces tests.

          Attendre la fin plutôt que sonder jusqu'à coïncidence : un sondage
          réussit dès qu'une lecture correspond, donc une valeur figée qui
          tomberait par hasard sur le trajet de la transition le ferait
          passer. Ici, la valeur lue est toujours celle de l'état d'arrivée.

          Une transition annulée rejette sa promesse. Ce n'est pas une erreur :
          cela veut dire que l'état a changé entre temps, et la lecture qui
          suit dira lequel.
        */
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        );

        const style = getComputedStyle(element);
        const found: Record<string, string> = {};

        for (const name of names) {
          found[name] = style.getPropertyValue(name);
        }

        return found;
      }, properties);
    }

    test('fige le survol du champ comme le composant le produit', async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Survol', { exact: true }),
        FIELD_PROPERTIES,
      );

      const live = page.getByLabel('Repos', { exact: true });
      await live.hover();

      expect(await computedStyle(live, FIELD_PROPERTIES)).toEqual(frozen);
    });

    test("fige l'enfoncement du champ comme le composant le produit", async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Actif', { exact: true }),
        FIELD_PROPERTIES,
      );

      // Un champ enfoncé est forcément survolé au même instant : les deux
      // règles de BaseField s'appliquent ensemble, et la copie figée doit donc
      // porter le contour autant que le fond.
      const live = page.getByLabel('Repos', { exact: true });
      await live.hover();
      await page.mouse.down();

      try {
        expect(await computedStyle(live, FIELD_PROPERTIES)).toEqual(frozen);
      } finally {
        await page.mouse.up();
      }
    });

    test('fige le focus du champ comme le composant le produit', async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Focus visible', { exact: true }),
        FOCUS_PROPERTIES,
      );

      const live = page.getByLabel('Repos', { exact: true });
      await live.focus();

      expect(await computedStyle(live, FOCUS_PROPERTIES)).toEqual(frozen);
    });

    test('fige les états du bouton comme le composant les produit', async ({ page }) => {
      // La ligne vivante est désignée par son en-tête et non par sa place :
      // une ligne insérée avant elle ferait sinon comparer le figé au mauvais
      // exemplaire, sans rien casser de visible.
      const restRow = page.locator('.states tbody tr', {
        has: page.getByRole('rowheader', { name: 'Repos' }),
      });

      for (const variant of VARIANTS) {
        const live = restRow.locator(`.button--${variant}`);

        const frozenHover = await computedStyle(page.locator(`.row-hover .button--${variant}`), [
          'background-color',
        ]);
        // translate : l'enfoncement se voit aussi sans la couleur, le bouton
        // descend d'un pixel.
        const frozenActive = await computedStyle(page.locator(`.row-active .button--${variant}`), [
          'background-color',
          'translate',
        ]);

        await live.hover();
        expect(
          await computedStyle(live, ['background-color']),
          `survol du bouton ${variant}`,
        ).toEqual(frozenHover);

        await page.mouse.down();

        try {
          expect(
            await computedStyle(live, ['background-color', 'translate']),
            `enfoncement du bouton ${variant}`,
          ).toEqual(frozenActive);
        } finally {
          await page.mouse.up();
        }
      }
    });
  });

  test.describe('navigation', () => {
    test('est une barre fixe en bas sous 640 px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 700 });

      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      const box = await nav.boundingBox();

      expect(box).not.toBeNull();
      // Collée au bas de la fenêtre, sur toute sa largeur.
      expect(box?.x).toBeCloseTo(0, 0);
      expect(box?.width).toBeCloseTo(375, 0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(700, 0);
    });

    test('est une colonne latérale au-delà de 640 px', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 700 });

      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      const navBox = await nav.boundingBox();
      const mainBox = await page.locator('main').boundingBox();

      expect(navBox).not.toBeNull();
      expect(mainBox).not.toBeNull();
      // La navigation est à gauche du contenu, et non au-dessus de lui.
      expect((navBox?.x ?? 0) + (navBox?.width ?? 0)).toBeLessThanOrEqual((mainBox?.x ?? 0) + 1);
    });

    /*
      La barre basse est un conteneur de défilement sur les deux axes, parce
      qu'elle porte overflow-x: auto. Elle rogne donc ce qui dépasse d'elle,
      anneau de focus compris : mesuré le 31 octobre 2026 à 375 x 667, il
      restait 1 px au-dessus de la première entrée et 0 en dessous comme à
      gauche, pour un anneau qui demande 4 px.

      Le test ne compare pas à 4 px écrits en dur : il lit ce que l'anneau
      demande vraiment à l'entrée focalisée, épaisseur plus écart, et exige
      cette place de chaque côté. Changer l'anneau dans base.css change donc
      les deux côtés de la comparaison, et la barre devra suivre.
    */
    for (const fenetre of [
      { width: 375, height: 667 },
      { width: 320, height: 640 },
    ]) {
      test(`laisse l'anneau de focus entier à ${fenetre.width} x ${fenetre.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(fenetre);

        const liens = page
          .getByRole('navigation', { name: 'Navigation principale' })
          .getByRole('link');
        const nombre = await liens.count();

        expect(nombre).toBeGreaterThan(1);

        // La première et la dernière entrée : ce sont les deux qui touchent un
        // bord de la zone rognée, donc les seules à pouvoir être coupées.
        for (const [quoi, index] of [
          ['la première entrée', 0],
          ['la dernière entrée', nombre - 1],
        ] as const) {
          const lien = liens.nth(index);

          await lien.scrollIntoViewIfNeeded();
          await lien.focus();

          const mesure = await lien.evaluate((element) => {
            const nav = element.closest('nav');

            if (nav === null) {
              return null;
            }

            const style = getComputedStyle(nav);
            const anneau = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const navRect = nav.getBoundingClientRect();

            /*
              La zone de rognage d'un conteneur de défilement est son bloc de
              remplissage : le remplissage en fait partie, les liserés non.
            */
            const bord = (cote: string): number =>
              Number.parseFloat(style.getPropertyValue(`border-${cote}-width`));

            return {
              demande:
                Number.parseFloat(anneau.outlineWidth) + Number.parseFloat(anneau.outlineOffset),
              marges: {
                haut: rect.top - (navRect.top + bord('top')),
                bas: navRect.bottom - bord('bottom') - rect.bottom,
                gauche: rect.left - (navRect.left + bord('left')),
                droite: navRect.right - bord('right') - rect.right,
              },
            };
          });

          expect(mesure).not.toBeNull();
          // 2 px d'épaisseur posés à 2 px d'écart : si ce chiffre bouge, c'est
          // base.css qui a changé, et la place réservée dans la barre aussi.
          expect(mesure?.demande, "l'anneau de base.css fait 4 px au-delà de la boîte").toBe(4);

          for (const [cote, marge] of Object.entries(mesure?.marges ?? {})) {
            expect(marge, `${quoi} est rognée du côté ${cote}`).toBeGreaterThanOrEqual(
              mesure?.demande ?? 4,
            );
          }
        }
      });
    }
  });

  /*
    RGAA 10.4 : le texte doit pouvoir doubler sans perte de contenu ni de
    fonction. Doubler la taille de base du document est exactement ce que fait
    l'agrandissement de texte d'un navigateur sur des tailles en rem, ce que
    le projet utilise partout.
  */
  test.describe('au texte agrandi à 200 %', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    /*
      Le débordement horizontal et le recouvrement par la barre sont mesurés
      pour tous les écrans par la matrice partagée (e2e/accessibility.ts). Ce
      qui reste ici est propre à la barre elle-même : sa hauteur, dont dépend
      la réserve de place, et le fait que ses libellés ont vraiment doublé.
    */
    test('garde la barre de navigation sur une seule ligne', async ({ page }) => {
      const mesure = await page.evaluate(() => {
        document.documentElement.style.fontSize = '32px';

        const nav = document.querySelector('nav');

        if (nav === null) {
          return null;
        }

        return {
          // La barre garde la hauteur d'une seule ligne, donc la réserve de
          // place reste exacte et rien ne passe dessous.
          hauteurBarre: Math.round(nav.getBoundingClientRect().height),
          // Les libellés doublent vraiment : sans cela, le test ne mesurerait
          // rien.
          taillePolice: getComputedStyle(nav.querySelector('a') ?? nav).fontSize,
        };
      });

      expect(mesure).not.toBeNull();
      expect(mesure?.taillePolice).toBe('28px');
      // 44 px de zone tactile doublés, la marge de l'anneau de focus doublée
      // de chaque côté, plus le liseré, qui ne suit pas le texte : 88 + 16 + 1.
      expect(mesure?.hauteurBarre).toBe(105);
    });
  });
});
