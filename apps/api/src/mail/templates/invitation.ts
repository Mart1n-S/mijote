import type { MailMessage } from '../mailer.js';

import { emailLayout, escapeHtml } from './html.js';

/*
  L'échappement HTML ne dit rien du schéma d'une adresse : « javascript:alert(1) »
  ne contient aucun des cinq caractères échappés et ressortirait intact dans le
  href. Les clients de messagerie n'exécutent pas ce schéma, mais un aperçu HTML
  le ferait, Mailpit compris.

  Le commentaire de `invitationUrl` dit que l'adresse est construite par
  l'application : ceci en fait une garantie au lieu d'une convention, pour
  l'appelant d'aujourd'hui comme pour celui de la story #12.
*/
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === 'https:' || protocol === 'http:';
  } catch {
    // Une adresse qu'un navigateur ne saurait pas lire davantage.
    return false;
  }
}

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
  if (!isWebUrl(data.invitationUrl)) {
    throw new Error("le lien d'invitation doit être une adresse http ou https");
  }

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
