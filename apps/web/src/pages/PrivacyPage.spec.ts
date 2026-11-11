// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PrivacyPage from './PrivacyPage.vue';

/*
  La page de confidentialité ne fait rien : elle dit. Ce qui se mesure est donc
  ce qu'elle dit, parce que c'est un engagement.

  Les durées annoncées engagent l'exploitation du homelab (ADR 0017), et les
  sept jours de sauvegarde en particulier : une page qui promettrait moins que
  la rotation réelle serait fausse. Le rendu dans un vrai navigateur, avec
  axe-core, vit dans e2e/privacy.spec.ts.
*/

describe('PrivacyPage', () => {
  it('dit les quatre choses, et où sont les deux droits', () => {
    const text = mount(PrivacyPage).text();

    // Quelles données, pourquoi, combien de temps, et où agir.
    expect(text).toContain('Ce qui est conservé');
    expect(text).toContain('Pourquoi');
    expect(text).toContain('Combien de temps');
    expect(text).toContain('Mes données');
  });

  it('annonce les durées sur lesquelles le projet est engagé', () => {
    const text = mount(PrivacyPage).text();

    expect(text).toContain('sept jours');
    expect(text).toContain('trente jours');
    expect(text).toContain('un an');
    // La conséquence qu'on n'aime pas écrire : une sauvegarde déjà prise n'est
    // pas réécrite par une suppression.
    expect(text).toContain('peut subsister');
  });

  it("dit que les données de santé ne servent qu'à écarter des recettes", () => {
    const text = mount(PrivacyPage).text();

    expect(text).toContain('données de santé');
    expect(text).toContain('écarter des recettes');
    expect(text).toContain('jamais écrites dans les journaux');
  });

  it('ne nomme ni responsable du traitement ni autorité de contrôle', () => {
    /*
      Et ce n'est pas un oubli : Mijote tourne sur un réseau local, sans
      exposition à Internet, pour son auteur et sa famille, ce qui relève de
      l'usage domestique que le RGPD écarte de son champ. Nommer un responsable
      du traitement et une voie de réclamation donnerait à croire le contraire
      (ADR 0017, qui dit aussi quand y revenir).
    */
    const text = mount(PrivacyPage).text();

    expect(text).not.toContain('CNIL');
    expect(text).not.toContain('responsable du traitement');
    expect(text).not.toContain('réclamation');
  });
});
