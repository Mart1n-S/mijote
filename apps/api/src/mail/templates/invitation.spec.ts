import { describe, expect, it } from 'vitest';

import { escapeHtml } from './html.js';
import { invitationEmail } from './invitation.js';

/*
  Les gabarits sont des fonctions, donc l'échappement est à notre charge : un
  moteur de gabarits le ferait tout seul (ADR 0009). Ces tests sont ce qui
  garantit qu'on ne l'a pas oublié, sur chaque valeur qui vient d'une saisie.
*/

const HOSTILE = '<script>alert("xss")</script> & O\'Neil';

function invitation(overrides: Partial<Parameters<typeof invitationEmail>[0]> = {}) {
  return invitationEmail({
    to: 'invitee@exemple.test',
    invitationUrl: 'https://mijote.local/invitation#jeton',
    ...overrides,
  });
}

describe('escapeHtml', () => {
  it('échappe les cinq caractères qui changent le sens du HTML', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it("n'écrit pas les entités deux fois", () => {
    // L'esperluette est traitée dans la même passe que le reste : la traiter
    // après réécrirait les entités que les autres remplacements viennent de
    // poser, et « & » deviendrait « &amp;amp; ».
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('désarme une valeur hostile en entier', () => {
    /*
      Le gabarit de l'invitation n'insère plus qu'un lien, construit par
      l'application : c'est ici que la garantie de l'ADR 0009 est mesurée pour
      les gabarits à venir, qui porteront des valeurs saisies.
    */
    const escaped = escapeHtml(HOSTILE);

    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain("O'Neil");
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('O&#39;Neil');
  });
});

describe('invitationEmail', () => {
  it("ne nomme personne, et surtout pas l'invitant", () => {
    /*
      Nommer l'invitant exposerait l'adresse de l'administrateur à chaque
      invité, et l'invitation n'est pas un rattachement à son foyer mais un
      ticket d'inscription : chaque compte crée le sien (ADR 0013).
    */
    const message = invitation();

    expect(message.subject).toBe('Invitation à rejoindre Mijote');
    expect(message.html).not.toContain('@');
    expect(message.text).not.toContain('@');
    expect(message.html).not.toContain('foyer');
  });

  it("échappe l'adresse du lien, qui est un attribut HTML", () => {
    const message = invitation({ invitationUrl: 'https://mijote.local/i?a=1&b="2"' });

    expect(message.html).toContain('href="https://mijote.local/i?a=1&amp;b=&quot;2&quot;"');
  });

  it("n'échappe rien dans la version texte, où une entité s'afficherait", () => {
    const message = invitation({ invitationUrl: 'https://mijote.local/invitation?a=1&b=2#jeton' });

    expect(message.text).toContain('a=1&b=2');
    expect(message.text).not.toContain('&amp;');
  });

  it('porte les deux versions, en français', () => {
    const message = invitation();

    expect(message.text).toContain('créer votre compte sur Mijote');
    expect(message.html).toContain('créer votre compte sur Mijote');
    expect(message.html).toContain('<html lang="fr">');
    // Le lien ne sert qu'une fois, et le message le dit.
    expect(message.text).toContain("ne sert qu'une fois");
  });

  it('ne charge aucune ressource distante, ni pixel de suivi', () => {
    const message = invitation();

    // Une image distante, même d'un pixel, signale au serveur que le message a
    // été ouvert, et depuis quelle adresse IP.
    expect(message.html).not.toContain('<img');
    expect(message.html).not.toMatch(/<link|<script|background-image/i);
    // Le seul lien http est celui de l'invitation, que l'utilisateur ouvre
    // lui-même.
    expect(message.html.match(/https?:\/\//g)).toEqual(['https://']);
  });

  it("refuse un lien qui n'est pas http ou https", () => {
    /*
      L'échappement ne dit rien du schéma : « javascript:alert(1) » ne contient
      aucun des cinq caractères et ressortirait intact dans le href. Un client
      de messagerie ne l'exécuterait pas, un aperçu HTML le ferait.
    */
    expect(() => invitation({ invitationUrl: 'javascript:alert(1)' })).toThrow(/http ou https/);
    expect(() => invitation({ invitationUrl: 'pas une adresse' })).toThrow(/http ou https/);
  });

  it("garde l'adresse du destinataire dans l'enveloppe, et nulle part ailleurs", () => {
    const message = invitation({ to: 'invitee@exemple.test' });

    expect(message.to).toBe('invitee@exemple.test');
    expect(message.subject).not.toContain('invitee@exemple.test');
    expect(message.text).not.toContain('invitee@exemple.test');
    expect(message.html).not.toContain('invitee@exemple.test');
  });
});
