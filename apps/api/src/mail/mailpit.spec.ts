import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMailTransport, SmtpMailer } from './smtp.mailer.js';
import { invitationEmail } from './templates/invitation.js';

/*
  Le seul test de ce dépôt qui envoie vraiment un e-mail : il traverse
  nodemailer, le protocole SMTP et Mailpit, puis va relire le message par son
  API. Tout le reste est mesuré avec un faux transport.

  Il se saute quand Mailpit n'est pas joignable, pour qu'un `pnpm test` sans
  `docker compose up` reste vert. En CI, le service est déclaré dans
  .github/workflows/ci.yml, donc il tourne pour de bon.
*/

const WEB_URL = process.env['MAILPIT_WEB_URL'] ?? 'http://127.0.0.1:8025';
const SMTP_PORT = Number(process.env['MAILPIT_SMTP_PORT'] ?? '1025');

/** Une adresse en .test : ce domaine est réservé et n'existe nulle part. */
const RECIPIENT = 'invitee@exemple.test';

const HOUSEHOLD = 'Foyer <Simon> & fils';

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

async function mailpitReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${WEB_URL}/readyz`, { signal: AbortSignal.timeout(1_000) });

    return response.ok;
  } catch {
    // Mailpit n'est pas lancé : les tests de ce fichier se sautent.
    return false;
  }
}

async function deleteAllMessages(): Promise<void> {
  await fetch(`${WEB_URL}/api/v1/messages`, { method: 'DELETE' });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Attend qu'un message arrive : Mailpit ne le range pas forcément aussitôt. */
async function waitForMessage(): Promise<{ id: string; subject: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${WEB_URL}/api/v1/messages?limit=5`);
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

describe.skipIf(!reachable)('envoi réel vers Mailpit', () => {
  beforeAll(deleteAllMessages);
  afterAll(deleteAllMessages);

  it('livre une invitation, avec ses deux versions et son nom de foyer échappé', async () => {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const from = 'Mijote <no-reply@mijote.local>';
    const mailer = new SmtpMailer(
      createMailTransport({
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        user: undefined,
        password: undefined,
        from,
      }),
      from,
      logger,
    );

    await mailer.send(
      invitationEmail({
        to: RECIPIENT,
        householdName: HOUSEHOLD,
        inviterName: 'Martin',
        invitationUrl: 'https://mijote.local/invitations/jeton',
      }),
    );

    const summary = await waitForMessage();

    expect(summary.subject).toBe(`Invitation à rejoindre le foyer ${HOUSEHOLD} sur Mijote`);

    const detail: unknown = await (await fetch(`${WEB_URL}/api/v1/message/${summary.id}`)).json();

    // Le HTML livré porte la valeur échappée, le texte la valeur brute.
    expect(readPart(detail, 'HTML')).toContain('Foyer &lt;Simon&gt; &amp; fils');
    expect(readPart(detail, 'HTML')).not.toContain('<Simon>');
    expect(readPart(detail, 'Text')).toContain(HOUSEHOLD);
  });
});
