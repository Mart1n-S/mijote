// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

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
});
