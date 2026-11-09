import { describe, expect, it } from 'vitest';

import { passwordChangedEmail } from './password-changed.js';

/*
  La notification de changement de mot de passe. Son exigence propre : **aucun
  lien**, parce qu'un e-mail de notification cliquable est le support rêvé d'un
  hameçonnage qui imiterait celui-ci (ADR 0014).
*/

const TO = 'titulaire@exemple.test';

describe('passwordChangedEmail', () => {
  it('dit ce qui a changé et ce que ça a fermé', () => {
    const message = passwordChangedEmail({ to: TO });

    expect(message.subject).toBe('Votre mot de passe Mijote a été changé');
    expect(message.text).toContain("vient d'être changé");
    expect(message.text).toContain('sessions');
  });

  it("dit quoi faire quand ce n'était pas vous", () => {
    /*
      C'est la raison d'être du message : une réinitialisation ferme toutes les
      sessions, mais personne ne saurait qu'elle a eu lieu.
    */
    const message = passwordChangedEmail({ to: TO });

    expect(message.text).toContain("Si ce n'était pas vous");
    expect(message.html).toContain("Si ce n'était pas vous");
  });

  it('ne porte aucun lien, ni aucune ressource distante', () => {
    const message = passwordChangedEmail({ to: TO });

    expect(message.html).not.toContain('<a ');
    expect(message.html).not.toContain('<img');
    expect(message.html).not.toMatch(/<link|<script|background-image/i);
    expect(message.html).not.toMatch(/https?:\/\//);
    expect(message.text).not.toMatch(/https?:\/\//);
  });

  it('ne décrit ni le compte, ni la demande', () => {
    /*
      Ni l'adresse, ni l'IP, ni l'appareil : le message arrive dans la boîte
      visée, qui sait déjà de quel compte il s'agit.
    */
    const message = passwordChangedEmail({ to: TO });

    expect(message.to).toBe(TO);
    expect(message.subject).not.toContain('@');
    expect(message.text).not.toContain('@');
    expect(message.html).not.toContain('@');
  });

  it('porte les deux versions, en français', () => {
    const message = passwordChangedEmail({ to: TO });

    expect(message.text).toContain('Bonjour');
    expect(message.html).toContain('<html lang="fr">');
  });
});
