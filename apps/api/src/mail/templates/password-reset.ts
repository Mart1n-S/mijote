import type { MailMessage } from '../mailer.js';

import { emailLayout, escapeHtml, isWebUrl } from './html.js';

/** Ce qu'un lien de réinitialisation a besoin de dire. */
export interface PasswordResetEmail {
  /** L'adresse du compte. Elle ne sort d'ici que dans l'enveloppe du message. */
  to: string;
  /** Lien de réinitialisation, construit par l'application. */
  resetUrl: string;
}

/**
 * L'e-mail qui porte le lien de réinitialisation.
 *
 * Il ne nomme personne et ne décrit pas le compte : il n'arrive que dans la
 * boîte visée, et quelqu'un qui le reçoit sans l'avoir demandé n'a pas à
 * apprendre de lui qu'un compte existe ici. Il dit en revanche que rien ne
 * change si on l'ignore, ce qui est la seule chose utile dans ce cas.
 *
 * Le lien est la seule valeur insérée dans le HTML, et il y est échappé : c'est
 * un attribut, et l'application le construit, mais la règle de l'ADR 0009 ne
 * souffre pas d'exception.
 */
export function passwordResetEmail(data: PasswordResetEmail): MailMessage {
  if (!isWebUrl(data.resetUrl)) {
    throw new Error('le lien de réinitialisation doit être une adresse http ou https');
  }

  const subject = 'Réinitialiser votre mot de passe Mijote';

  const text = `Bonjour,

Une réinitialisation de mot de passe a été demandée pour ce compte Mijote.

Pour choisir un nouveau mot de passe, ouvrez ce lien :
${data.resetUrl}

Ce lien ne sert qu'une fois, et il expire dans une heure. Si vous n'avez rien
demandé, ignorez ce message : votre mot de passe reste celui que vous
connaissez.

Mijote, planification de repas.
`;

  const url = escapeHtml(data.resetUrl);

  const html = emailLayout(
    'Réinitialiser votre mot de passe',
    `<p>Bonjour,</p>
    <p>Une réinitialisation de mot de passe a été demandée pour ce compte Mijote.</p>
    <p><a href="${url}">Choisir un nouveau mot de passe</a></p>
    <p>
      Ce lien ne sert qu'une fois, et il expire dans une heure. Si vous n'avez
      rien demandé, ignorez ce message : votre mot de passe reste celui que vous
      connaissez.
    </p>`,
  );

  return { to: data.to, subject, text, html };
}
