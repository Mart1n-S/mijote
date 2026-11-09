import { describe, expect, it } from 'vitest';

import { passwordResetEmail } from './password-reset.js';

/*
  Le gabarit du lien de réinitialisation. Les mêmes exigences que l'invitation :
  l'échappement est à notre charge (ADR 0009), aucune ressource distante, et
  l'adresse du destinataire ne sort que dans l'enveloppe.

  Une exigence de plus, propre à celui-ci : il ne doit rien apprendre à
  quelqu'un qui le recevrait sans l'avoir demandé.
*/

const TO = 'titulaire@exemple.test';

function reset(overrides: Partial<Parameters<typeof passwordResetEmail>[0]> = {}) {
  return passwordResetEmail({
    to: TO,
    resetUrl: 'https://mijote.local/mot-de-passe/reinitialisation#jeton',
    ...overrides,
  });
}

describe('passwordResetEmail', () => {
  it("dit que le lien ne sert qu'une fois et expire dans une heure", () => {
    const message = reset();

    expect(message.subject).toBe('Réinitialiser votre mot de passe Mijote');
    expect(message.text).toContain("ne sert qu'une fois");
    expect(message.text).toContain('une heure');
    expect(message.html).toContain('une heure');
  });

  it("dit que rien ne change si on l'ignore", () => {
    /*
      C'est la seule chose utile pour quelqu'un qui n'a rien demandé : le
      message ne lui apprend pas qu'un compte existe, mais il le rassure sur ce
      qui se passe s'il ne fait rien.
    */
    expect(reset().text).toContain("Si vous n'avez rien\ndemandé");
    expect(reset().html).toContain("vous n'avez");
  });

  it("échappe l'adresse du lien, qui est un attribut HTML", () => {
    const message = reset({ resetUrl: 'https://mijote.local/r?a=1&b="2"' });

    expect(message.html).toContain('href="https://mijote.local/r?a=1&amp;b=&quot;2&quot;"');
  });

  it("n'échappe rien dans la version texte, où une entité s'afficherait", () => {
    const message = reset({ resetUrl: 'https://mijote.local/r?a=1&b=2#jeton' });

    expect(message.text).toContain('a=1&b=2');
    expect(message.text).not.toContain('&amp;');
  });

  it('porte les deux versions, en français', () => {
    const message = reset();

    expect(message.text).toContain('réinitialisation de mot de passe');
    expect(message.html).toContain('<html lang="fr">');
  });

  it('ne charge aucune ressource distante, ni pixel de suivi', () => {
    const message = reset();

    expect(message.html).not.toContain('<img');
    expect(message.html).not.toMatch(/<link|<script|background-image/i);
    // Le seul lien http est celui de la réinitialisation, que l'utilisateur
    // ouvre lui-même.
    expect(message.html.match(/https?:\/\//g)).toEqual(['https://']);
  });

  it("refuse un lien qui n'est pas http ou https", () => {
    /*
      L'échappement ne dit rien du schéma : « javascript:alert(1) » ne contient
      aucun des cinq caractères et ressortirait intact dans le href.
    */
    expect(() => reset({ resetUrl: 'javascript:alert(1)' })).toThrow(/http ou https/);
    expect(() => reset({ resetUrl: 'pas une adresse' })).toThrow(/http ou https/);
  });

  it("garde l'adresse du destinataire dans l'enveloppe, et nulle part ailleurs", () => {
    const message = reset();

    expect(message.to).toBe(TO);
    expect(message.subject).not.toContain(TO);
    expect(message.text).not.toContain(TO);
    expect(message.html).not.toContain(TO);
    // Pas même un « @ » : le message ne décrit pas le compte visé.
    expect(message.text).not.toContain('@');
    expect(message.html).not.toContain('@');
  });
});
