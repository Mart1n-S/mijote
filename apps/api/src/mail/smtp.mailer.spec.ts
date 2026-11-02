import { HttpStatus } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { ProblemException } from '../errors/problem.exception.js';

import { MemoryMailer } from './memory.mailer.js';
import type { MailMessage } from './mailer.js';
import { readSmtpSettings, SmtpMailer, type MailTransport } from './smtp.mailer.js';
import { invitationEmail } from './templates/invitation.js';

/*
  L'envoyeur est instancié directement, avec un faux transport : ce qui est
  mesuré ici est ce qu'il journalise et ce qu'il lève, pas le protocole SMTP.
  Qu'un message arrive vraiment est mesuré par mailpit.spec.ts.
*/

const MESSAGE: MailMessage = {
  to: 'invitee@exemple.test',
  subject: 'Invitation',
  text: 'texte',
  html: '<p>texte</p>',
};

function mailerWith(transport: MailTransport) {
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const info = vi.spyOn(logger, 'info');
  const error = vi.spyOn(logger, 'error');

  return {
    mailer: new SmtpMailer(transport, 'Mijote <no-reply@mijote.local>', logger),
    info,
    error,
  };
}

const accepting: MailTransport = {
  sendMail: () => Promise.resolve({ messageId: '<abc@mijote.local>', rejected: [] }),
};

describe('readSmtpSettings', () => {
  const complete = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    MAIL_FROM: 'Mijote <no-reply@mijote.local>',
  };

  it('lit les réglages et traite un identifiant vide comme absent', () => {
    // Mailpit n'authentifie personne : un identifiant vide passé à nodemailer
    // le ferait tenter une authentification, et l'envoi échouerait.
    const settings = readSmtpSettings({ ...complete, SMTP_USER: '', SMTP_PASSWORD: '' });

    expect(settings.user).toBeUndefined();
    expect(settings.password).toBeUndefined();
    expect(settings.secure).toBe(false);
  });

  it('ne passe en TLS immédiat que sur SMTP_SECURE=true', () => {
    expect(readSmtpSettings({ ...complete, SMTP_SECURE: 'true' }).secure).toBe(true);
    expect(readSmtpSettings({ ...complete, SMTP_SECURE: 'false' }).secure).toBe(false);
  });

  it('refuse une configuration incomplète en renvoyant à .env.example', () => {
    expect(() => readSmtpSettings({ SMTP_PORT: '1025', MAIL_FROM: 'x' })).toThrow(
      /SMTP_HOST.*\.env\.example/,
    );
    expect(() => readSmtpSettings({ ...complete, SMTP_PORT: 'mille' })).toThrow(
      /SMTP_PORT.*\.env\.example/,
    );
  });
});

describe('SmtpMailer', () => {
  it("journalise l'identifiant du message, et jamais l'adresse", async () => {
    const { mailer, info } = mailerWith(accepting);

    await mailer.send(MESSAGE);

    expect(info).toHaveBeenCalledWith({ messageId: '<abc@mijote.local>' }, 'e-mail envoyé');
    // La garantie du critère : l'adresse du destinataire est une donnée
    // personnelle et ne doit entrer dans aucune ligne de journal.
    expect(JSON.stringify(info.mock.calls)).not.toContain('invitee@exemple.test');
  });

  it("lève un problème RFC 9457 quand le serveur ne répond pas, sans faire tomber l'API", async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1025'), {
      code: 'ECONNREFUSED',
    });
    const { mailer, error } = mailerWith({ sendMail: () => Promise.reject(refused) });

    await expect(mailer.send(MESSAGE)).rejects.toBeInstanceOf(ProblemException);
    // L'erreur d'origine n'est pas avalée : elle part au journal.
    expect(error).toHaveBeenCalledWith({ err: refused }, "envoi d'e-mail en échec");
  });

  it('rend un 503 et un message en français, sans détail technique', async () => {
    const { mailer } = mailerWith({
      sendMail: () => Promise.reject(new Error('550 relay denied')),
    });

    try {
      await mailer.send(MESSAGE);
      expect.unreachable("l'envoi devait échouer");
    } catch (failure) {
      expect(failure).toBeInstanceOf(ProblemException);
      const problem = failure instanceof ProblemException ? failure : undefined;

      expect(problem?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(problem?.message).toBe("L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.");
      expect(problem?.message).not.toContain('relay');
    }
  });

  it('traite un destinataire refusé comme un échec, en ne journalisant que le nombre', async () => {
    const { mailer, error } = mailerWith({
      sendMail: () =>
        Promise.resolve({ messageId: '<def@mijote.local>', rejected: ['invitee@exemple.test'] }),
    });

    await expect(mailer.send(MESSAGE)).rejects.toBeInstanceOf(ProblemException);
    expect(error).toHaveBeenCalledWith(
      { messageId: '<def@mijote.local>', rejected: 1 },
      'destinataire refusé par le serveur SMTP',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('invitee@exemple.test');
  });
});

describe('MemoryMailer', () => {
  it("garde les messages sans rien envoyer, et c'est ce que les tests emploient", async () => {
    const mailer = new MemoryMailer();

    await mailer.send(
      invitationEmail({
        to: 'invitee@exemple.test',
        householdName: 'Foyer Simon',
        inviterName: 'Martin',
        invitationUrl: 'https://mijote.local/invitations/jeton',
      }),
    );

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.subject).toContain('Foyer Simon');
  });
});
