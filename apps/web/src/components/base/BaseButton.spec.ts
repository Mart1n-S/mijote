// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseButton from './BaseButton.vue';

/*
  jsdom ne rejoue pas l'activation d'un bouton natif par Entrée ou par Espace :
  c'est le navigateur qui transforme la touche en clic. Tester cette touche ici
  testerait jsdom et non ce composant, et c'est pourquoi le test Playwright de
  la page de démonstration l'exerce dans un vrai navigateur.

  Ce qui se teste ici est ce que le composant décide lui-même : les attributs
  posés, le refus du clic, et le fait que le focus ne s'échappe pas.
*/

function mountButton(props: Record<string, unknown> = {}) {
  return mount(BaseButton, {
    props,
    slots: { default: 'Enregistrer' },
    // Le focus n'existe que pour un élément attaché au document.
    attachTo: document.body,
  });
}

/**
 * Le bouton rendu, lu dans le document et non par wrapper.element, qui n'est
 * pas typé : querySelector, lui, rend bien un HTMLButtonElement.
 */
function buttonElement(): HTMLButtonElement {
  const button = document.body.querySelector('button');

  if (button === null) {
    throw new Error('le bouton doit être rendu');
  }

  return button;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseButton', () => {
  it('rend un bouton natif avec son libellé', () => {
    const wrapper = mountButton();

    expect(wrapper.find('button').exists()).toBe(true);
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.text()).toContain('Enregistrer');
  });

  it('émet son clic quand il est disponible', async () => {
    const wrapper = mountButton();

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  describe('désactivé durablement', () => {
    it("porte l'attribut disabled, qui le sort de l'ordre de tabulation", () => {
      const wrapper = mountButton({ disabled: true });

      expect(wrapper.attributes('disabled')).toBeDefined();
    });

    it("n'émet pas de clic", async () => {
      const wrapper = mountButton({ disabled: true });

      await wrapper.trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });
  });

  describe('action en cours', () => {
    it('porte aria-disabled et aria-busy', () => {
      const wrapper = mountButton({ loading: true });

      expect(wrapper.attributes('aria-disabled')).toBe('true');
      expect(wrapper.attributes('aria-busy')).toBe('true');
    });

    it("ne porte pas l'attribut disabled, qui le rendrait inatteignable", () => {
      const wrapper = mountButton({ loading: true });

      // C'est tout l'intérêt de aria-disabled : le bouton reste focusable et
      // reste annoncé pendant l'action.
      expect(wrapper.attributes('disabled')).toBeUndefined();
    });

    it("n'émet pas de clic, puisque le bouton en reçoit encore", async () => {
      const wrapper = mountButton({ loading: true });

      await wrapper.trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('garde le focus quand il passe en cours', async () => {
      const wrapper = mountButton();
      const button = buttonElement();

      button.focus();
      expect(document.activeElement).toBe(button);

      await wrapper.setProps({ loading: true });

      expect(document.activeElement).toBe(button);
    });

    it("annonce l'action en cours par du texte, et pas seulement par aria-busy", () => {
      const wrapper = mountButton({ loading: true, loadingLabel: 'enregistrement en cours' });

      // aria-busy n'est pas restitué par tous les lecteurs d'écran.
      expect(wrapper.text()).toContain('enregistrement en cours');
    });

    it("cache le témoin visuel aux technologies d'assistance", () => {
      const wrapper = mountButton({ loading: true });

      expect(wrapper.get('.button__spinner').attributes('aria-hidden')).toBe('true');
    });
  });
});
