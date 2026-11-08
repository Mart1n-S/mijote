import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMailTransport, SmtpMailer } from './smtp.mailer.js';
import { invitationEmail } from './templates/invitation.js';

/*
  Le seul test de ce dépôt qui envoie vraiment un e-mail : il traverse
  nodemailer, le protocole SMTP et Mailpit, puis va relire le message par son
  API. Tout le reste est mesuré avec un faux transport.

  Hors CI, il se saute quand Mailpit n'est pas joignable, pour qu'un
  `pnpm test` sans `docker compose up` reste vert. **En CI, il ne se saute
  jamais** : le service est déclaré dans .github/workflows/ci.yml, et s'il
  manquait, un saut silencieux laisserait le travail au vert en n'ayant rien
  mesuré. D'où l'échec franc plus bas.
*/

const HOST = process.env['SMTP_HOST'] ?? '127.0.0.1';
const SMTP_PORT = Number(process.env['MAILPIT_SMTP_PORT'] ?? '1025');
const WEB_URL = `http://${HOST}:${process.env['MAILPIT_WEB_PORT'] ?? '8025'}`;

/** Une adresse en .test : ce domaine est réservé et n'existe nulle part. */
const RECIPIENT = 'invitee@exemple.test';

/*
  Un lien avec des caractères qui changent le sens du HTML : c'est la seule
  valeur que le gabarit insère, et c'est elle qui prouve l'échappement de bout
  en bout, jusqu'au HTML que Mailpit a reçu.
*/
const INVITATION_URL = 'https://mijote.local/invitation?de="moi"&vers=toi#jeton';

const FROM = 'Mijote <no-reply@mijote.local>';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Le résumé d'un message, tel que l'API de Mailpit le liste. */
function readSummary(value: unknown): { id: string; subject: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { ID, Subject } = value;

  return typeof ID === 'string' && typeof Subject === 'string'
    ? { id: ID, subject: Subject }
    : undefined;
}

function readPart(value: unknown, key: 'HTML' | 'Text'): string {
  if (isRecord(value)) {
    const part = value[key];

    if (typeof part === 'string') {
      return part;
    }
  }

  return '';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Mailpit répond-il ? Plusieurs tentatives, le conteneur pouvant démarrer. */
async function mailpitReachable(): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(`${WEB_URL}/readyz`, { signal: AbortSignal.timeout(1_000) });

      if (response.ok) {
        return true;
      }
    } catch {
      // Pas encore prêt, ou pas lancé du tout : on retente.
    }

    await wait(300);
  }

  return false;
}

/**
 * Ne supprime que les messages de ce test.
 *
 * Un `DELETE /api/v1/messages` viderait la boîte entière, donc les messages de
 * développement que Martin est peut-être en train de lire.
 */
async function deleteTestMessages(): Promise<void> {
  await fetch(`${WEB_URL}/api/v1/search?query=${encodeURIComponent(`to:${RECIPIENT}`)}`, {
    method: 'DELETE',
  });
}

/** Attend qu'un message arrive : Mailpit ne le range pas forcément aussitôt. */
async function waitForMessage(): Promise<{ id: string; subject: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${WEB_URL}/api/v1/search?query=${encodeURIComponent(`to:${RECIPIENT}`)}`,
    );
    const body: unknown = await response.json();
    const messages = isRecord(body) ? body['messages'] : undefined;
    const summary = Array.isArray(messages) ? readSummary(messages[0]) : undefined;

    if (summary !== undefined) {
      return summary;
    }

    await wait(100);
  }

  throw new Error("aucun message n'est arrivé dans Mailpit");
}

const reachable = await mailpitReachable();

if (!reachable && process.env['CI'] === 'true') {
  throw new Error(
    `Mailpit est injoignable sur ${WEB_URL} alors que CI est posée : le service déclaré dans .github/workflows/ci.yml n'a pas démarré, et ce test ne doit pas se sauter en CI.`,
  );
}

describe.skipIf(!reachable)('envoi réel vers Mailpit', () => {
  beforeAll(deleteTestMessages);
  afterAll(deleteTestMessages);

  it('livre une invitation, avec ses deux versions et son lien échappé', async () => {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const mailer = new SmtpMailer(
      createMailTransport({
        host: HOST,
        port: SMTP_PORT,
        secure: false,
        user: undefined,
        password: undefined,
        from: FROM,
      }),
      FROM,
      logger,
    );

    await mailer.send(invitationEmail({ to: RECIPIENT, invitationUrl: INVITATION_URL }));

    const summary = await waitForMessage();

    expect(summary.subject).toBe('Invitation à rejoindre Mijote');

    const detail: unknown = await (await fetch(`${WEB_URL}/api/v1/message/${summary.id}`)).json();

    // Le HTML livré porte la valeur échappée, le texte la valeur brute.
    expect(readPart(detail, 'HTML')).toContain('de=&quot;moi&quot;&amp;vers=toi');
    expect(readPart(detail, 'HTML')).not.toContain('de="moi"');
    expect(readPart(detail, 'Text')).toContain(INVITATION_URL);
    // Le message ne nomme personne : aucune adresse n'y figure.
    expect(readPart(detail, 'HTML')).not.toContain('@');
  });
});
