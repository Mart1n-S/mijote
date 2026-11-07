import { MIN_PASSWORD_LENGTH } from '@mijote/shared';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { createDatabase } from '../db/client.js';
import { loadEnvFile } from '../env.js';

import { createAdminAccount } from './admin-account.js';

/*
  La création du premier administrateur, à la main.

  L'application est privée et l'inscription passera par invitation : il faut
  donc un premier compte, et une commande est le seul endroit où le poser sans
  ouvrir une route qui n'aurait plus lieu d'exister ensuite.

  Ce fichier ne fait que la saisie ; ce qu'il écrit en base vit dans
  admin-account.ts, avec son test.
*/

const USAGE = 'Usage : pnpm admin:create';

/** Entrée, retour chariot, effacement, Ctrl+C et Ctrl+D. */
const ENTER = ['\r', '\n'];
const ERASE = ['\u007f', '\b'];
const ABORT = ['\u0003', '\u0004'];

/**
 * Lit une ligne sans l'afficher, caractère par caractère.
 *
 * Le mot de passe n'est jamais un argument de la commande : un argument reste
 * dans l'historique du shell et dans la liste des processus.
 */
function readSecret(question: string): Promise<string> {
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    const typed: string[] = [];

    /*
      Un écouteur et non `for await` : l'itérateur asynchrone de stdin rend des
      morceaux non typés, qu'il faudrait examiner avant d'y toucher. Ici le type
      du paramètre est déclaré une fois, et le reste suit.
    */
    function onData(chunk: Buffer): void {
      for (const character of chunk.toString('utf8')) {
        if (ENTER.includes(character)) {
          finish({ value: typed.join('') });

          return;
        }

        if (ABORT.includes(character)) {
          finish({ error: new Error('saisie interrompue') });

          return;
        }

        if (ERASE.includes(character)) {
          typed.pop();
        } else if (character >= ' ') {
          // Les caractères de contrôle restants (flèches, tabulation) sont
          // ignorés : ils n'ont pas de sens dans un mot de passe.
          typed.push(character);
        }
      }
    }

    const finish = (outcome: { value: string } | { error: Error }): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      // La saisie n'a rien affiché : c'est ici que la ligne se termine.
      stdout.write('\n');

      if ('error' in outcome) {
        reject(outcome.error);

        return;
      }

      resolve(outcome.value);
    };

    stdin.on('data', onData);
  });
}

function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];

  if (url === undefined || url.trim() === '') {
    throw new Error("DATABASE_URL est absente de l'environnement. Voir .env.example.");
  }

  return url;
}

async function main(): Promise<void> {
  /*
    Le terminal est exigé d'emblée. Sans lui, le mot de passe ne peut pas être
    saisi sans écho, et une entrée venue d'un tube laisserait surtout une
    question sans réponse : readline n'abandonne pas une question quand son
    entrée se termine, et la commande resterait suspendue.
  */
  if (!stdin.isTTY) {
    throw new Error(
      `${USAGE}, dans un terminal : les réponses se saisissent de façon interactive, et le mot de passe ne se passe ni en argument ni par un tube.`,
    );
  }

  loadEnvFile();

  const url = requireDatabaseUrl();
  const prompts = createInterface({ input: stdin, output: stdout });
  const householdName = await prompts.question('Nom du foyer : ');
  const email = await prompts.question('Adresse e-mail : ');

  prompts.close();

  const password = await readSecret(
    `Mot de passe (au moins ${String(MIN_PASSWORD_LENGTH)} caractères) : `,
  );

  if ((await readSecret('Confirmation : ')) !== password) {
    throw new Error('les deux saisies ne correspondent pas');
  }

  const database = createDatabase(url);

  try {
    const created = await createAdminAccount(database, { householdName, email, password });

    /*
      Ni l'adresse ni le mot de passe ne sont réaffichés : les identifiants
      suffisent à retrouver les lignes, et la sortie d'une commande se retrouve
      dans un historique ou une capture d'écran.
    */
    stdout.write(
      `Compte administrateur créé.\n  foyer  : ${created.householdId}\n  compte : ${created.accountId}\n`,
    );
  } finally {
    await database.$client.end();
  }
}

try {
  await main();
} catch (error) {
  /*
    Le message seul, sans la trace : ce qui compte ici est ce qu'il faut
    corriger, et la trace d'une erreur de saisie n'apprend rien.
  */
  process.exitCode = 1;
  stdout.write(`${error instanceof Error ? error.message : String(error)}\n`);
}
