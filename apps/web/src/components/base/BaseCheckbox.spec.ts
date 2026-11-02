// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseCheckbox from './BaseCheckbox.vue';

/*
  Ce que ces tests gardent : le lien entre l'étiquette et la case, le modèle
  dans les deux sens, et les conventions d'aide et d'erreur, identiques à celles
  de BaseField. Ce qui ne se mesure qu'en navigateur (zone cliquable de 44 px,
  marque dessinée, anneau de focus) vit dans e2e/design-system.spec.ts.
*/
function mountCheckbox(props: Record<string, unknown> = {}) {
  return mount(BaseCheckbox, { props: { label: 'Figer les états', ...props } });
}

describe('BaseCheckbox', () => {
  it('relie son étiquette à une vraie case à cocher', () => {
    const wrapper = mountCheckbox();
    const input = wrapper.get('input');

    expect(input.attributes('type')).toBe('checkbox');
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
  });

  it('donne un identifiant propre à chaque case de la page', () => {
    /*
      Sans identifiant unique, les deux étiquettes pointeraient sur la même
      case, et cliquer l'une cocherait l'autre. Les deux sont montées dans la
      même application, parce que c'est à cette échelle que useId garantit
      l'unicité.
    */
    const page = mount({
      components: { BaseCheckbox },
      template: '<div><BaseCheckbox label="Figer" /><BaseCheckbox label="Figer" /></div>',
    });
    const [first, second] = page.findAll('input');

    expect(first?.attributes('id')).toBeDefined();
    expect(first?.attributes('id')).not.toBe(second?.attributes('id'));
  });

  it('suit le modèle dans les deux sens', async () => {
    const wrapper = mountCheckbox({ modelValue: false });

    await wrapper.get('input').setValue(true);

    expect(wrapper.props('modelValue')).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

    await wrapper.setProps({ modelValue: true });

    expect(wrapper.get('input').element.checked).toBe(true);
  });

  it('dessine sa boîte à côté de la case, et non par elle', () => {
    // La case porte la zone cliquable et reste transparente : c'est ce span qui
    // est visible, et il est masqué aux technologies d'assistance.
    const box = mountCheckbox().get('.choice__box');

    expect(box.attributes('aria-hidden')).toBe('true');
  });

  it('dit que la réponse est obligatoire, en mots', () => {
    const wrapper = mountCheckbox({ required: true });

    expect(wrapper.get('input').attributes('required')).toBeDefined();
    expect(wrapper.text()).toContain('(obligatoire)');
  });

  it("sort de l'ordre de tabulation quand elle est indisponible", () => {
    expect(mountCheckbox({ disabled: true }).get('input').attributes('disabled')).toBeDefined();
  });

  it('relie son aide puis son erreur, dans cet ordre', () => {
    const wrapper = mountCheckbox({ help: 'Pour comparer les états.', error: 'Choix requis.' });
    const described = wrapper.get('input').attributes('aria-describedby')?.split(' ') ?? [];

    expect(described).toHaveLength(2);
    expect(wrapper.get(`#${described[0] ?? ''}`).text()).toBe('Pour comparer les états.');
    expect(wrapper.get(`#${described[1] ?? ''}`).text()).toContain('Choix requis.');
  });

  it('ne relie que ce qui existe', () => {
    const wrapper = mountCheckbox({ help: 'Pour comparer les états.' });

    expect(wrapper.get('input').attributes('aria-describedby')?.split(' ')).toHaveLength(1);
    expect(mountCheckbox().get('input').attributes('aria-describedby')).toBeUndefined();
  });

  it('signale une erreur sans la seule couleur, et la marque invalide', () => {
    const wrapper = mountCheckbox({ error: 'Choix requis.' });

    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain('Erreur : Choix requis.');
  });

  it('ne tient pas une chaîne vide pour une erreur', () => {
    // Une validation qui rend « rien à signaler » sous cette forme ne doit pas
    // rendre le champ invalide, sans quoi il s'annonce invalide sans dire
    // pourquoi.
    const wrapper = mountCheckbox({ error: '', help: '' });

    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Erreur');
  });
});
