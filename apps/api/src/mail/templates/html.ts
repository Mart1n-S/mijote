/*
  Les gabarits sont des fonctions TypeScript, pas un moteur de gabarits : le lot
  1 en compte un seul, et un moteur en amènerait trois de plus (ADR 0009).

  Le prix de ce choix est ici : un moteur échappe les valeurs tout seul, nos
  fonctions doivent le faire explicitement. D'où `escapeHtml`, et d'où la règle
  qui va avec : **toute valeur venue d'un utilisateur passe par elle avant
  d'entrer dans du HTML**, et jamais dans la version texte, où elle n'aurait
  aucun sens.
*/

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Échappe les cinq caractères qui changent le sens d'un fragment HTML.
 *
 * Un seul passage, et c'est ce qui compte : aucun remplacement ne peut réécrire
 * une entité posée par un autre, donc jamais de « &amp;amp; ». Un échappement
 * fait en plusieurs passes aurait ce défaut.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}

/**
 * Cette adresse est-elle une adresse du web ?
 *
 * L'échappement HTML ne dit rien du schéma d'une adresse : « javascript:alert(1) »
 * ne contient aucun des cinq caractères échappés et ressortirait intact dans le
 * `href`. Les clients de messagerie n'exécutent pas ce schéma, mais un aperçu
 * HTML le ferait, Mailpit compris.
 *
 * Les deux gabarits qui portent un lien le vérifient, et c'est ce qui fait de
 * « l'application construit cette adresse » une garantie au lieu d'une
 * convention.
 */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === 'https:' || protocol === 'http:';
  } catch {
    // Une adresse qu'un navigateur ne saurait pas lire davantage.
    return false;
  }
}

/**
 * L'enveloppe HTML commune à tous les e-mails.
 *
 * Aucune ressource distante : ni image, ni feuille de style, ni police. Ce
 * n'est pas qu'une question de rendu, c'est ce qui empêche un e-mail de
 * signaler au serveur qu'il a été ouvert, et par qui.
 *
 * `content` est du HTML déjà échappé par l'appelant.
 */
export function emailLayout(title: string, content: string): string {
  /*
    Aucune couleur, et c'est volontaire : un e-mail ne peut pas lire les jetons
    de design (ni propriété personnalisée, ni feuille de style distante), et une
    valeur écrite en dur ici divergerait du thème sans que rien ne le voie. Le
    manifeste de la PWA reste donc le seul endroit du projet où une couleur vit
    hors de tokens.css. Ce qui est posé ici ne touche qu'à la lisibilité.
  */
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: sans-serif; line-height: 1.5">
    <h1 style="font-size: 1.25rem">${escapeHtml(title)}</h1>
    ${content}
    <p style="font-size: 0.875rem">Mijote, planification de repas.</p>
  </body>
</html>
`;
}
