// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseButton from './BaseButton.vue';
import BaseDialog from './BaseDialog.vue';

/*
  Le comportement du dialogue vient de Reka UI (ADR 0001), mais le projet en
  dépend : ces tests vérifient que le câblage de BaseDialog laisse bien passer
  ce qu'on attend de lui, et surtout le va-et-vient du focus, que personne ne
  voit à la relecture.

  Deux particularités de l'environnement, constatées et non supposées :

  - le contenu est téléporté dans body par DialogPortal, il se cherche donc
    dans le document et pas dans le composant monté ;
  - la fermeture se lit sur data-state et non sur le retrait du noeud : Reka UI
    attend la fin de l'animation de sortie, qui ne se joue pas en jsdom.

  Cette seconde particularité a une conséquence : le retour du focus sur le
  déclencheur se produit au démontage du contenu, donc jamais ici. Le retrait
  du noeud et le retour du focus sont vérifiés par le test Playwright de la
  page de démonstration, dans un vrai navigateur.
*/

function mountDialog() {
  return mount(
    {
      components: { BaseDialog, BaseButton },
      template: `
        <BaseDialog
          title="Supprimer la semaine ?"
          description="Les sept repas seront retirés du planning."
          close-label="Annuler"
        >
          <template #trigger>
            <BaseButton variant="danger">Supprimer</BaseButton>
          </template>
          <p>Cette action est définitive.</p>
        </BaseDialog>
      `,
    },
    { attachTo: document.body },
  );
}

/** Le dialogue tel qu'il existe dans le document, ou null s'il n'est pas rendu. */
function dialogNode(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]');
}

function triggerButton(): HTMLButtonElement {
  const button = document.body.querySelector('button');

  if (button === null) {
    throw new Error('le déclencheur doit être rendu');
  }

  return button;
}

/** Ouvre le dialogue par son déclencheur, comme le ferait un utilisateur. */
async function openDialog(wrapper: ReturnType<typeof mountDialog>): Promise<HTMLElement> {
  triggerButton().click();
  await wrapper.vm.$nextTick();

  const dialog = dialogNode();

  if (dialog === null) {
    throw new Error('le dialogue doit être rendu après activation du déclencheur');
  }

  expect(dialog.dataset['state']).toBe('open');

  return dialog;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseDialog', () => {
  it("ne rend rien tant qu'il est fermé", () => {
    mountDialog();

    expect(dialogNode()).toBeNull();
    expect(triggerButton().textContent).toContain('Supprimer');
  });

  it('annonce son déclencheur comme ouvrant un dialogue', () => {
    mountDialog();

    expect(triggerButton().getAttribute('aria-haspopup')).toBe('dialog');
    expect(triggerButton().getAttribute('aria-expanded')).toBe('false');
  });

  describe('une fois ouvert', () => {
    it("retire l'arrière-plan de l'arbre d'accessibilité", async () => {
      const wrapper = mountDialog();

      await openDialog(wrapper);

      // C'est ainsi que Reka UI 2.11 rend le dialogue modal : il masque le
      // reste du document, plutôt que de poser aria-modal sur le dialogue.
      const appRoot = document.querySelector('[data-v-app]');

      expect(appRoot?.getAttribute('aria-hidden')).toBe('true');
    });

    it('porte son titre comme nom accessible', async () => {
      const wrapper = mountDialog();
      const dialog = await openDialog(wrapper);

      const labelId = dialog.getAttribute('aria-labelledby');

      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId ?? '')?.textContent).toContain(
        'Supprimer la semaine ?',
      );
    });

    it('relie sa description au dialogue', async () => {
      const wrapper = mountDialog();
      const dialog = await openDialog(wrapper);

      const describedId = dialog.getAttribute('aria-describedby');

      expect(describedId).toBeTruthy();
      expect(document.getElementById(describedId ?? '')?.textContent).toContain(
        'Les sept repas seront retirés du planning.',
      );
    });

    it('fait entrer le focus dans le dialogue', async () => {
      const wrapper = mountDialog();
      const dialog = await openDialog(wrapper);

      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Le retour du focus sur le déclencheur n'est pas vérifiable ici, pour la
    // raison dite en tête de fichier : il est couvert par le test Playwright.
    it('se ferme par Échap', async () => {
      const wrapper = mountDialog();
      const trigger = triggerButton();
      const dialog = await openDialog(wrapper);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(dialog.dataset['state']).toBe('closed');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('se ferme par son bouton de fermeture', async () => {
      const wrapper = mountDialog();
      const dialog = await openDialog(wrapper);

      const close = [...dialog.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Annuler'),
      );

      expect(close, 'le bouton de fermeture doit être rendu').toBeDefined();

      close?.click();
      await wrapper.vm.$nextTick();

      expect(dialog.dataset['state']).toBe('closed');
    });
  });
});
