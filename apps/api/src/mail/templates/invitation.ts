import type { MailMessage } from '../mailer.js';

import { emailLayout, escapeHtml } from './html.js';

/** Ce qu'une invitation a besoin de dire. */
export interface InvitationEmail {
  /** L'adresse invitée. Elle ne sort d'ici que dans l'enveloppe du message. */
  to: string;
  /** Nom du foyer, saisi par un utilisateur. */
  householdName: string;
  /** Nom de la personne qui invite, saisi par un utilisateur. */
  inviterName: string;
  /** Lien d'acceptation, construit par l'application. */
  invitationUrl: string;
}

/**
 * L'e-mail d'invitation à rejoindre un foyer.
 *
 * Le nom du foyer et celui de la personne qui invite viennent d'une saisie :
 * ils sont échappés dans la version HTML, et laissés tels quels dans la version
 * texte, où une entité HTML s'afficherait littéralement.
 */
export function invitationEmail(data: InvitationEmail): MailMessage {
  const subject = `Invitation à rejoindre le foyer ${data.householdName} sur Mijote`;

  const text = `Bonjour,

${data.inviterName} vous invite à rejoindre le foyer « ${data.householdName} » sur Mijote,
pour planifier les repas et la liste de courses ensemble.

Pour accepter, ouvrez ce lien :
${data.invitationUrl}

Si vous n'attendiez pas cette invitation, ignorez ce message : rien ne sera créé.

Mijote, planification de repas.
`;

  const household = escapeHtml(data.householdName);
  const inviter = escapeHtml(data.inviterName);
  const url = escapeHtml(data.invitationUrl);

  const html = emailLayout(
    'Invitation à rejoindre un foyer',
    `<p>Bonjour,</p>
    <p>
      ${inviter} vous invite à rejoindre le foyer « ${household} » sur Mijote, pour
      planifier les repas et la liste de courses ensemble.
    </p>
    <p><a href="${url}">Accepter l'invitation</a></p>
    <p>Si vous n'attendiez pas cette invitation, ignorez ce message : rien ne sera créé.</p>`,
  );

  return { to: data.to, subject, text, html };
}
