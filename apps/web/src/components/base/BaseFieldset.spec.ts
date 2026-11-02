// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseFieldset from './BaseFieldset.vue';

function mountFieldset(props: Record<string, unknown> = {}) {
  return mount(BaseFieldset, {
    props: { legend: 'Préférences de repas', ...props },
    slots: { default: '<input id="x" aria-label="un champ" />' },
    attachTo: document.body,
  });
}

/** Le fieldset lu dans le document : wrapper.element n'est pas typé. */
function fieldsetRoot(): Element {
  const root = document.body.querySelector('fieldset');

  if (root === null) {
    throw new Error('le regroupement doit être rendu');
  }

  return root;
}

/*
  Les composants sont attachés au document pour que leurs éléments s'y lisent
  (wrapper.element n'est pas typé) : il faut donc le vider entre deux tests,
  sans quoi le suivant lirait le rendu du précédent.
*/
afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseFieldset', () => {
  it('rend un fieldset avec sa legend et son contenu', () => {
    const wrapper = mountFieldset();

    expect(wrapper.find('fieldset').exists()).toBe(true);
    expect(wrapper.get('legend').text()).toContain('Préférences de repas');
    expect(wrapper.find('input').exists()).toBe(true);
  });

  it('dit que le groupe est obligatoire, en mots', () => {
    expect(mountFieldset({ required: true }).text()).toContain('(obligatoire)');
  });

  it("désactive tout ce qu'il contient", () => {
    // C'est le comportement natif d'un fieldset désactivé : chaque contrôle à
    // l'intérieur sort de l'ordre de tabulation, sans qu'on ait à le marquer.
    expect(mountFieldset({ disabled: true }).attributes('disabled')).toBeDefined();
  });

  it('relie son aide puis son erreur au groupe', () => {
    const wrapper = mountFieldset({ help: 'Deux choix au plus.', error: 'Choix requis.' });
    const described = wrapper.attributes('aria-describedby')?.split(' ') ?? [];

    expect(described).toHaveLength(2);
    expect(wrapper.get(`#${described[0] ?? ''}`).text()).toBe('Deux choix au plus.');
    expect(wrapper.get(`#${described[1] ?? ''}`).text()).toContain('Choix requis.');
    expect(wrapper.attributes('aria-invalid')).toBe('true');
  });

  it("place l'aide avant le contenu et l'erreur après", () => {
    mountFieldset({ help: 'Deux choix au plus.', error: 'Choix requis.' });

    const children = [...fieldsetRoot().children];
    const content = children.findIndex((element) => element.tagName === 'DIV');

    const ranks = children
      .map((element, rank) => (element.tagName === 'P' ? rank : -1))
      .filter((rank) => rank >= 0);

    expect(content).toBeGreaterThanOrEqual(0);
    expect(ranks[0]).toBeLessThan(content);
    expect(ranks[1]).toBeGreaterThan(content);
  });

  it('ne tient pas une chaîne vide pour une erreur', () => {
    const wrapper = mountFieldset({ error: '', help: '' });

    expect(wrapper.attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Erreur');
  });
});
