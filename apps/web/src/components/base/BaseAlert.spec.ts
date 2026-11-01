// @vitest-environment jsdom

import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BaseAlert from './BaseAlert.vue';

/*
  Le point à garantir est contre-intuitif : une région aria-live n'annonce que
  ce qui change après son arrivée dans le DOM. Montée en même temps que son
  message, elle est lue comme du texte déjà là, donc passée sous silence.

  Les tests ci-dessous vérifient donc que la région existe avant le message et
  qu'elle survit à son arrivée, et pas seulement que le message s'affiche.
*/

function mountAlert(props: Record<string, unknown> = {}) {
  return mount(BaseAlert, { props, attachTo: document.body });
}

/**
 * La région aria-live telle qu'elle est rendue, lue dans le document et non
 * par wrapper.element, qui n'est pas typé.
 */
function regionElement(): Element {
  const region = document.body.querySelector('[aria-live]');

  if (region === null) {
    throw new Error('la région aria-live doit être rendue');
  }

  return region;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseAlert', () => {
  it('rend sa région avant tout message', () => {
    const wrapper = mountAlert();

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toBe('');
  });

  it('garde la même région quand le message arrive', async () => {
    const wrapper = mountAlert();
    const regionBefore = regionElement();

    await wrapper.setProps({ message: 'La liste de courses est à jour.' });

    // Si la région était recréée avec son contenu, le lecteur d'écran
    // n'annoncerait rien.
    expect(regionElement()).toBe(regionBefore);
    expect(wrapper.text()).toContain('La liste de courses est à jour.');
  });

  it('garde la même région entre deux messages', async () => {
    const wrapper = mountAlert({ message: 'Premier message.' });
    const regionBefore = regionElement();

    await wrapper.setProps({ message: 'Deuxième message.' });

    expect(regionElement()).toBe(regionBefore);
    expect(wrapper.text()).toContain('Deuxième message.');
  });

  it('interrompt la lecture pour un avertissement ou une erreur', () => {
    for (const variant of ['warning', 'error'] as const) {
      const wrapper = mountAlert({ variant, message: 'Quelque chose cloche.' });

      expect(wrapper.attributes('role')).toBe('alert');
      expect(wrapper.attributes('aria-live')).toBe('assertive');
    }
  });

  it('attend son tour pour une information ou un succès', () => {
    for (const variant of ['info', 'success'] as const) {
      const wrapper = mountAlert({ variant, message: 'Tout va bien.' });

      expect(wrapper.attributes('role')).toBe('status');
      expect(wrapper.attributes('aria-live')).toBe('polite');
    }
  });

  it.each([
    { variant: 'info', prefix: 'Information :' },
    { variant: 'success', prefix: 'Succès :' },
    { variant: 'warning', prefix: 'Attention :' },
    { variant: 'error', prefix: 'Erreur :' },
  ] as const)('nomme en clair un message de type $variant', ({ variant, prefix }) => {
    const wrapper = mountAlert({ variant, message: 'Un message.' });

    // L'état ne tient jamais à la seule couleur.
    expect(wrapper.text()).toContain(prefix);
  });

  it("cache le repère visuel aux technologies d'assistance", () => {
    const wrapper = mountAlert({ variant: 'success', message: 'Un message.' });

    // Le préfixe textuel dit déjà l'état : le repère le répéterait.
    expect(wrapper.get('.alert__mark').attributes('aria-hidden')).toBe('true');
  });

  /*
    La réannonce passe par un minuteur : ces tests le pilotent plutôt que
    d'attendre, sinon ils dureraient plus longtemps qu'ils ne vérifient.

    Ce qu'ils ne disent pas, et qu'aucun test ne dira : ce qu'un lecteur
    d'écran annonce vraiment. Seule l'écoute réelle le dit.
  */
  describe('réannonce', () => {
    const MESSAGE = 'Identifiants incorrects.';

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('vide la région puis y repose le même message', async () => {
      const wrapper = mountAlert({ message: MESSAGE });
      const regionBefore = regionElement();

      wrapper.vm.reannounce();
      await nextTick();

      // L'état vide est le premier des deux changements de contenu : sans lui,
      // le DOM ne bougerait pas et la région resterait muette.
      expect(wrapper.text()).toBe('');

      await vi.advanceTimersByTimeAsync(50);

      expect(wrapper.text()).toContain(MESSAGE);
      // Et toujours la même région : une région recréée n'annonce rien.
      expect(regionElement()).toBe(regionBefore);
    });

    it('repart de zéro quand on réannonce deux fois de suite', async () => {
      const wrapper = mountAlert({ message: MESSAGE });

      wrapper.vm.reannounce();
      await vi.advanceTimersByTimeAsync(30);
      wrapper.vm.reannounce();
      await vi.advanceTimersByTimeAsync(30);

      // Le premier minuteur aurait reposé le texte à 50 ms : il a été annulé,
      // donc le second cycle n'est pas coupé en deux par le premier.
      expect(wrapper.text()).toBe('');

      await vi.advanceTimersByTimeAsync(30);

      expect(wrapper.text()).toContain(MESSAGE);
    });

    it('nettoie son minuteur au démontage', () => {
      const wrapper = mountAlert({ message: MESSAGE });

      wrapper.vm.reannounce();
      expect(vi.getTimerCount()).toBe(1);

      wrapper.unmount();

      // Un minuteur qui survit au composant écrirait dans une instance
      // démontée, et en test il déborderait sur le cas suivant.
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
