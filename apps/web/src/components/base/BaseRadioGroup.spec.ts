// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseRadioGroup from './BaseRadioGroup.vue';

/*
  Le point qui compte ici est le regroupement : un groupe de boutons radio sans
  fieldset ni legend laisse son intitulé flotter à côté, que rien ne relie aux
  options. Le composant doit le rendre sans que l'appelant y pense.
*/
const OPTIONS = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Administrateur' },
  { value: 'guest', label: 'Invité', disabled: true },
];

function mountGroup(props: Record<string, unknown> = {}) {
  return mount(BaseRadioGroup, {
    props: { legend: 'Rôle dans le foyer', options: OPTIONS, ...props },
  });
}

describe('BaseRadioGroup', () => {
  it("rend un fieldset et sa legend, sans que l'appelant le demande", () => {
    const wrapper = mountGroup();

    expect(wrapper.find('fieldset').exists()).toBe(true);
    expect(wrapper.get('legend').text()).toContain('Rôle dans le foyer');
  });

  it('relie chaque étiquette à son bouton', () => {
    const wrapper = mountGroup();
    const inputs = wrapper.findAll('input[type="radio"]');
    const labels = wrapper.findAll('label');

    expect(inputs).toHaveLength(3);

    for (const [index, input] of inputs.entries()) {
      expect(labels[index]?.attributes('for')).toBe(input.attributes('id'));
    }
  });

  it('donne un nom commun aux boutons du groupe', () => {
    /*
      Sans nom commun, le navigateur ne relie pas les boutons : les flèches ne
      circulent pas entre eux, et plusieurs peuvent être cochés à la fois.
    */
    const names = new Set(
      mountGroup()
        .findAll('input[type="radio"]')
        .map((input) => input.attributes('name')),
    );

    expect(names.size).toBe(1);
    expect([...names][0]).toBeDefined();
  });

  it("ne coche que l'option du modèle", () => {
    const wrapper = mountGroup({ modelValue: 'admin' });
    const checked = wrapper
      .findAll<HTMLInputElement>('input[type="radio"]')
      .filter((input) => input.element.checked);

    expect(checked).toHaveLength(1);
    expect(checked[0]?.attributes('value')).toBe('admin');
  });

  it('annonce la valeur choisie', async () => {
    const wrapper = mountGroup({ modelValue: '' });

    await wrapper.findAll('input[type="radio"]')[1]?.setValue(true);

    expect(wrapper.emitted('update:modelValue')).toEqual([['admin']]);
  });

  it('désactive une option indisponible sans toucher aux autres', () => {
    const inputs = mountGroup().findAll('input[type="radio"]');

    expect(inputs[2]?.attributes('disabled')).toBeDefined();
    expect(inputs[0]?.attributes('disabled')).toBeUndefined();
  });

  it('désactive tout le groupe quand il est indisponible', () => {
    const wrapper = mountGroup({ disabled: true });

    // Le fieldset désactivé suffit pour le navigateur, mais chaque bouton le
    // porte aussi : un test comme un lecteur d'écran lit l'attribut du contrôle.
    expect(wrapper.attributes('disabled')).toBeDefined();

    for (const input of wrapper.findAll('input[type="radio"]')) {
      expect(input.attributes('disabled')).toBeDefined();
    }
  });

  it('relie son aide et son erreur au groupe, pas à chaque option', () => {
    /*
      Reliées à chaque bouton, la consigne et l'erreur seraient répétées à
      chaque option par le lecteur d'écran. Sur le groupe, elles sont dites une
      fois, à l'entrée.
    */
    const wrapper = mountGroup({ help: 'Il faut un administrateur.', error: 'Choix requis.' });
    const described = wrapper.attributes('aria-describedby')?.split(' ') ?? [];

    expect(described).toHaveLength(2);
    expect(wrapper.get(`#${described[0] ?? ''}`).text()).toBe('Il faut un administrateur.');
    expect(wrapper.get(`#${described[1] ?? ''}`).text()).toContain('Choix requis.');
    expect(wrapper.attributes('aria-invalid')).toBe('true');

    for (const input of wrapper.findAll('input[type="radio"]')) {
      expect(input.attributes('aria-describedby')).toBeUndefined();
    }
  });

  it('signale une erreur en mots, pas par la seule couleur', () => {
    expect(mountGroup({ error: 'Choix requis.' }).text()).toContain('Erreur : Choix requis.');
  });

  it('ne tient pas une chaîne vide pour une erreur', () => {
    const wrapper = mountGroup({ error: '', help: '' });

    expect(wrapper.attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.attributes('aria-describedby')).toBeUndefined();
  });
});
