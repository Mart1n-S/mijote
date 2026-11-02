// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseSelect from './BaseSelect.vue';

const OPTIONS = [
  { value: '2', label: '2 personnes' },
  { value: '4', label: '4 personnes' },
  { value: '35', label: '35 personnes', disabled: true },
];

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(BaseSelect, {
    props: { label: 'Taille du foyer', options: OPTIONS, ...props },
    attachTo: document.body,
  });
}

/** Le conteneur lu dans le document : wrapper.element n'est pas typé. */
function selectRoot(): Element {
  const root = document.body.querySelector('.select');

  if (root === null) {
    throw new Error('la liste doit être rendue');
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

describe('BaseSelect', () => {
  it('relie son étiquette à la liste', () => {
    const wrapper = mountSelect();

    expect(wrapper.get('label').attributes('for')).toBe(wrapper.get('select').attributes('id'));
  });

  it('propose une option vide, sélectionnée et non choisissable', () => {
    /*
      Sans elle, la première option serait sélectionnée d'office et
      l'utilisateur pourrait valider un choix qu'il n'a pas fait. Désactivée, on
      en sort sans pouvoir y revenir.
    */
    const first = mountSelect().findAll('option')[0];

    expect(first?.attributes('value')).toBe('');
    expect(first?.attributes('disabled')).toBeDefined();
    expect(first?.text()).toBe('Choisissez');
    expect(mountSelect().get('select').element.value).toBe('');
  });

  it('accepte un autre intitulé pour cette option vide', () => {
    expect(mountSelect({ placeholder: 'Nombre de personnes' }).findAll('option')[0]?.text()).toBe(
      'Nombre de personnes',
    );
  });

  it('rend une option par choix, et désactive celles qui le sont', () => {
    const options = mountSelect().findAll('option');

    // Les trois choix, plus l'option vide.
    expect(options).toHaveLength(4);
    expect(options[1]?.text()).toBe('2 personnes');
    expect(options[3]?.attributes('disabled')).toBeDefined();
    expect(options[1]?.attributes('disabled')).toBeUndefined();
  });

  it('suit le modèle dans les deux sens', async () => {
    const wrapper = mountSelect({ modelValue: '' });

    await wrapper.get('select').setValue('4');

    expect(wrapper.emitted('update:modelValue')).toEqual([['4']]);

    await wrapper.setProps({ modelValue: '2' });

    expect(wrapper.get('select').element.value).toBe('2');
  });

  it('relie son aide puis son erreur, dans cet ordre', () => {
    const wrapper = mountSelect({ help: "Jusqu'à 35 personnes.", error: 'Choix requis.' });
    const described = wrapper.get('select').attributes('aria-describedby')?.split(' ') ?? [];

    expect(described).toHaveLength(2);
    expect(wrapper.get(`#${described[0] ?? ''}`).text()).toBe("Jusqu'à 35 personnes.");
    expect(wrapper.get(`#${described[1] ?? ''}`).text()).toContain('Choix requis.');
  });

  it("place l'aide avant la liste et l'erreur après", () => {
    // L'ordre visuel suit l'ordre de lecture : la consigne avant de répondre,
    // ce qui cloche après.
    mountSelect({ help: "Jusqu'à 35 personnes.", error: 'Choix requis.' });

    const children = [...selectRoot().children];
    const controlRank = children.findIndex((element) => element.tagName === 'SELECT');
    const helpRank = children.findIndex((element) =>
      element.textContent?.includes("Jusqu'à 35 personnes."),
    );
    const errorRank = children.findIndex((element) =>
      element.textContent?.includes('Choix requis.'),
    );

    expect(helpRank).toBeLessThan(controlRank);
    expect(errorRank).toBeGreaterThan(controlRank);
  });

  it('signale une erreur sans la seule couleur', () => {
    const wrapper = mountSelect({ error: 'Choix requis.' });

    expect(wrapper.get('select').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('select').classes()).toContain('select__control--invalid');
    expect(wrapper.text()).toContain('Erreur : Choix requis.');
  });

  it('ne tient pas une chaîne vide pour une erreur', () => {
    const wrapper = mountSelect({ error: '', help: '' });

    expect(wrapper.get('select').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.get('select').classes()).not.toContain('select__control--invalid');
  });

  it("sort de l'ordre de tabulation quand elle est indisponible", () => {
    expect(mountSelect({ disabled: true }).get('select').attributes('disabled')).toBeDefined();
  });

  it('pose les attributs reçus sur la liste, et non sur son conteneur', () => {
    // Sans inheritAttrs: false, name atterrirait sur le div et n'aurait aucun
    // effet à l'envoi du formulaire.
    const wrapper = mountSelect({ name: 'household-size' });

    expect(wrapper.get('select').attributes('name')).toBe('household-size');
    expect(wrapper.attributes('name')).toBeUndefined();
  });
});
