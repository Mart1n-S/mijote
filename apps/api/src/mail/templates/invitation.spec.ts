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
    householdName: 'Foyer Simon',
    inviterName: 'Martin',
    invitationUrl: 'https://mijote.local/invitations/jeton',
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
});

describe('invitationEmail', () => {
  it('échappe le nom du foyer et celui de la personne qui invite', () => {
    const message = invitation({ householdName: HOSTILE, inviterName: HOSTILE });

    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain("O'Neil");
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('O&#39;Neil');
  });

  it("échappe aussi l'adresse du lien, qui est une attribut HTML", () => {
    const message = invitation({ invitationUrl: 'https://mijote.local/i?a=1&b="2"' });

    expect(message.html).toContain('href="https://mijote.local/i?a=1&amp;b=&quot;2&quot;"');
  });

  it("n'échappe rien dans la version texte, où une entité s'afficherait", () => {
    const message = invitation({ householdName: 'Tom & Jerry' });

    expect(message.text).toContain('Tom & Jerry');
    expect(message.text).not.toContain('&amp;');
  });

  it('porte les deux versions, en français', () => {
    const message = invitation();

    expect(message.subject).toBe('Invitation à rejoindre le foyer Foyer Simon sur Mijote');
    expect(message.text).toContain('vous invite à rejoindre le foyer');
    expect(message.html).toContain('vous invite à rejoindre le foyer');
    expect(message.html).toContain('<html lang="fr">');
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

  it("garde l'adresse du destinataire dans l'enveloppe, et nulle part ailleurs", () => {
    const message = invitation({ to: 'invitee@exemple.test' });

    expect(message.to).toBe('invitee@exemple.test');
    expect(message.subject).not.toContain('invitee@exemple.test');
    expect(message.text).not.toContain('invitee@exemple.test');
    expect(message.html).not.toContain('invitee@exemple.test');
  });
});
