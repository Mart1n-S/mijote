// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseField from './BaseField.vue';

/*
  Ce que vérifie ce fichier est le câblage qui rend le champ utilisable au
  lecteur d'écran : le label relié, l'aide et l'erreur reliées dans le bon
  ordre, et l'état invalide. Un identifiant qui pointe dans le vide ne se voit
  pas à l'écran, d'où ces tests.

  Les éléments sont lus dans le document et non par wrapper.element, qui n'est
  pas typé.
*/

function mountField(props: Record<string, unknown> = {}) {
  return mount(BaseField, {
    props: { label: 'Quantité', ...props },
    attachTo: document.body,
  });
}

function inputElement(): HTMLInputElement {
  const input = document.body.querySelector('input');

  if (input === null) {
    throw new Error('le champ doit être rendu');
  }

  return input;
}

function fieldRoot(): Element {
  const root = document.body.querySelector('.field');

  if (root === null) {
    throw new Error('le champ doit être rendu');
  }

  return root;
}

/** Les éléments effectivement désignés par aria-describedby du champ. */
function describedElements(): Element[] {
  const ids = inputElement().getAttribute('aria-describedby')?.split(' ') ?? [];

  return ids.map((id) => {
    const element = document.getElementById(id);

    if (element === null) {
      throw new Error(`aria-describedby désigne ${id}, qui n'existe pas`);
    }

    return element;
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseField', () => {
  it('relie un label visible au champ', () => {
    const wrapper = mountField();
    const label = wrapper.get('label');

    expect(label.text()).toContain('Quantité');
    expect(label.attributes('for')).toBe(inputElement().id);
  });

  it('donne un identifiant propre à chaque champ de la page', () => {
    // Deux champs de même label ne doivent pas se voler leur label ni leur
    // message d'erreur. Les deux sont montés dans la même application, parce
    // que c'est à cette échelle que useId garantit l'unicité.
    const page = mount(
      {
        components: { BaseField },
        template: '<div><BaseField label="Quantité" /><BaseField label="Quantité" /></div>',
      },
      { attachTo: document.body },
    );

    const [first, second] = page.findAll('input').map((input) => input.attributes('id'));

    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });

  it("ne relie rien quand il n'y a ni aide ni erreur", () => {
    const wrapper = mountField();

    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined();
  });

  it('ne tient pas une chaîne vide pour une erreur', () => {
    // Une validation qui rend « rien à signaler » sous forme de chaîne vide ne
    // doit pas faire s'annoncer le champ comme invalide sans dire pourquoi.
    const wrapper = mountField({ error: '', help: '' });

    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.get('input').classes()).not.toContain('field__input--invalid');
    expect(wrapper.text()).not.toContain('Erreur');
  });

  it("relie l'aide au champ", () => {
    mountField({ help: 'En grammes.' });

    expect(describedElements().map((element) => element.textContent)).toEqual(['En grammes.']);
  });

  describe('en erreur', () => {
    it('marque le champ comme invalide', () => {
      const wrapper = mountField({ error: 'Indiquez un nombre.' });

      expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    });

    it("relie l'aide puis l'erreur, dans cet ordre", () => {
      mountField({ help: 'En grammes.', error: 'Indiquez un nombre.' });

      // La consigne d'abord, ce qui cloche ensuite : c'est l'ordre dans lequel
      // le lecteur d'écran les restitue.
      const textes = describedElements().map((element) => element.textContent?.trim());

      expect(textes[0]).toBe('En grammes.');
      expect(textes[1]).toContain('Indiquez un nombre.');
    });

    it("nomme l'erreur en clair, sans la laisser à la seule couleur", () => {
      const wrapper = mountField({ error: 'Indiquez un nombre.' });

      expect(wrapper.text()).toContain('Erreur : Indiquez un nombre.');
    });

    it("affiche l'erreur après le champ", () => {
      mountField({ error: 'Indiquez un nombre.' });

      const children = [...fieldRoot().children];
      const inputRank = children.findIndex((element) => element.tagName === 'INPUT');
      const errorRank = children.findIndex((element) =>
        element.textContent?.includes('Indiquez un nombre.'),
      );

      expect(inputRank).toBeGreaterThanOrEqual(0);
      expect(errorRank).toBeGreaterThan(inputRank);
    });
  });

  describe("attributs passés par l'appelant", () => {
    it('les pose sur le champ et non sur le conteneur', () => {
      // Le composant n'a qu'une racine : sans inheritAttrs: false, name,
      // inputmode, maxlength ou pattern atterrissaient sur le div et
      // n'avaient donc aucun effet.
      mountField({ name: 'quantity' });

      expect(inputElement().getAttribute('name')).toBe('quantity');
      expect(fieldRoot().hasAttribute('name')).toBe(false);
    });

    it("ne laisse pas remplacer le lien vers l'aide et l'erreur", () => {
      mountField({
        help: 'En grammes.',
        error: 'Indiquez un nombre.',
        'aria-describedby': 'ailleurs',
        'aria-invalid': 'false',
      });

      // Le composant seul sait quels éléments il rend : un aria-describedby
      // venu de l'appelant couperait le champ de son aide et de son erreur.
      const textes = describedElements().map((element) => element.textContent?.trim());

      expect(textes[0]).toBe('En grammes.');
      expect(textes[1]).toContain('Indiquez un nombre.');
      expect(inputElement().getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('remonte la saisie au modèle', async () => {
    const wrapper = mountField();

    await wrapper.get('input').setValue('250');

    // Sans parent qui lie le modèle, c'est l'événement qu'il faut lire : le
    // prop ne revient que par la liaison v-model de l'appelant.
    expect(wrapper.emitted('update:modelValue')).toEqual([['250']]);
  });

  it("sort de l'ordre de tabulation quand il est désactivé", () => {
    const wrapper = mountField({ disabled: true });

    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
  });

  it('reste atteignable au clavier, même en erreur', () => {
    // Un champ en erreur est précisément celui qu'il faut pouvoir corriger :
    // ni disabled, ni readonly, ni sorti de l'ordre de tabulation.
    const wrapper = mountField({ error: 'Indiquez un nombre.' });
    const input = wrapper.get('input');

    expect(input.attributes('disabled')).toBeUndefined();
    expect(input.attributes('readonly')).toBeUndefined();
    expect(input.attributes('tabindex')).toBeUndefined();
  });
});
