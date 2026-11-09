import type { MailMessage } from '../mailer.js';

import { emailLayout, escapeHtml, isWebUrl } from './html.js';

/** Ce qu'une invitation a besoin de dire. */
export interface InvitationEmail {
  /** L'adresse invitée. Elle ne sort d'ici que dans l'enveloppe du message. */
  to: string;
  /** Lien d'inscription, construit par l'application. */
  invitationUrl: string;
}

/**
 * L'e-mail d'invitation à s'inscrire sur Mijote.
 *
 * Il ne nomme personne, et c'est voulu : nommer l'invitant exposerait l'adresse
 * de l'administrateur à chaque invité, et l'invitation n'est pas un
 * rattachement à son foyer mais un ticket d'inscription, chaque compte ayant le
 * sien (ADR 0013). Le message est signé par Mijote, ce que fait l'enveloppe.
 *
 * Le lien est la seule valeur insérée dans le HTML, et il y est échappé : c'est
 * un attribut, et l'application le construit, mais la règle de l'ADR 0009 ne
 * souffre pas d'exception.
 */
export function invitationEmail(data: InvitationEmail): MailMessage {
  if (!isWebUrl(data.invitationUrl)) {
    throw new Error("le lien d'invitation doit être une adresse http ou https");
  }

  const subject = 'Invitation à rejoindre Mijote';

  const text = `Bonjour,

Vous êtes invité à créer votre compte sur Mijote, pour planifier vos repas et
votre liste de courses.

Pour vous inscrire, ouvrez ce lien :
${data.invitationUrl}

Ce lien ne sert qu'une fois, et il expire. Si vous n'attendiez pas cette
invitation, ignorez ce message : rien ne sera créé.

Mijote, planification de repas.
`;

  const url = escapeHtml(data.invitationUrl);

  const html = emailLayout(
    'Invitation à rejoindre Mijote',
    `<p>Bonjour,</p>
    <p>
      Vous êtes invité à créer votre compte sur Mijote, pour planifier vos repas
      et votre liste de courses.
    </p>
    <p><a href="${url}">Créer mon compte</a></p>
    <p>
      Ce lien ne sert qu'une fois, et il expire. Si vous n'attendiez pas cette
      invitation, ignorez ce message : rien ne sera créé.
    </p>`,
  );

  return { to: data.to, subject, text, html };
}
