import type { MailMessage } from '../mailer.js';

import { emailLayout } from './html.js';

/** Ce qu'une notification de changement a besoin de dire. */
export interface PasswordChangedEmail {
  /** L'adresse du compte. Elle ne sort d'ici que dans l'enveloppe du message. */
  to: string;
}

/**
 * L'e-mail qui prévient que le mot de passe vient de changer.
 *
 * C'est la seule chose qui avertit le titulaire légitime quand ce n'était pas
 * lui, et c'est pour cela qu'il existe : une réinitialisation réussie ferme
 * toutes les sessions, mais personne ne saurait qu'elle a eu lieu.
 *
 * **Il ne porte aucun lien**, et c'est voulu. Un e-mail de notification
 * cliquable est le support rêvé d'un hameçonnage qui imiterait celui-ci, et la
 * personne qui n'est pas à l'origine du changement n'a rien à cliquer : elle
 * doit joindre la personne qui administre Mijote (ADR 0014).
 *
 * Aucune valeur n'entre dans le HTML, donc rien à échapper : le message ne
 * décrit ni le compte, ni l'appareil, ni l'adresse IP d'où venait la demande.
 */
export function passwordChangedEmail(data: PasswordChangedEmail): MailMessage {
  const subject = 'Votre mot de passe Mijote a été changé';

  const text = `Bonjour,

Le mot de passe de ce compte Mijote vient d'être changé, et toutes les sessions
ouvertes ont été fermées.

Si c'était bien vous, il n'y a rien à faire.

Si ce n'était pas vous, quelqu'un a pu accéder à votre boîte e-mail : changez
son mot de passe, puis demandez une nouvelle réinitialisation depuis la page de
connexion de Mijote. Prévenez la personne qui administre Mijote.

Mijote, planification de repas.
`;

  const html = emailLayout(
    'Votre mot de passe a été changé',
    `<p>Bonjour,</p>
    <p>
      Le mot de passe de ce compte Mijote vient d'être changé, et toutes les
      sessions ouvertes ont été fermées.
    </p>
    <p>Si c'était bien vous, il n'y a rien à faire.</p>
    <p>
      Si ce n'était pas vous, quelqu'un a pu accéder à votre boîte e-mail :
      changez son mot de passe, puis demandez une nouvelle réinitialisation
      depuis la page de connexion de Mijote. Prévenez la personne qui administre
      Mijote.
    </p>`,
  );

  return { to: data.to, subject, text, html };
}
