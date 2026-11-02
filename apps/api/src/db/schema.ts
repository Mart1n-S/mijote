import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/*
  Schéma Drizzle. Le lot 1 n'a de tables que pour les comptes et leur session :
  les tables métier (recettes, planning, courses) arriveront avec leurs stories.

  Toutes les dates sont en `timestamptz` : une date sans fuseau se lirait
  différemment selon le serveur, et une session expirerait au mauvais moment.
*/

export const accountRole = pgEnum('account_role', ['user', 'admin']);

/** L'issue d'une tentative de connexion, telle que la limitation la compte. */
export const loginOutcome = pgEnum('login_outcome', ['succeeded', 'failed', 'blocked']);

/** Un foyer. Un compte en fait partie, et tout ce qui est partagé lui appartient. */
export const household = pgTable('household', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    /*
      L'adresse est normalisée avant d'être écrite (minuscules, espaces
      retirés) : sans cela, deux comptes pourraient coexister pour la même
      boîte, et la connexion dépendrait de la façon de taper son adresse.
    */
    email: text('email').notNull(),
    /** Empreinte Argon2id, jamais le mot de passe. Voir security/passwords.ts. */
    passwordHash: text('password_hash').notNull(),
    role: accountRole('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('account_email_unique').on(table.email)],
);

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /*
      Empreinte SHA-256 de la valeur du cookie, jamais la valeur : une fuite de
      cette table ne donne aucune session utilisable. L'empreinte suffit, le
      jeton étant tiré au hasard sur 32 octets, donc hors de portée d'un
      dictionnaire (contrairement à un mot de passe, d'où Argon2 pour lui).
    */
    tokenHash: text('token_hash').notNull(),
    /** Secret CSRF de cette session, dont le cookie lisible porte la valeur. */
    csrfSecret: text('csrf_secret').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Dernière requête vue : c'est elle qui porte la limite d'inactivité. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Limite absolue, indépendante de l'activité. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('session_token_hash_unique').on(table.tokenHash),
    index('session_expires_at_idx').on(table.expiresAt),
  ],
);

export const rememberToken = pgTable(
  'remember_token',
  {
    /*
      La famille est portée en clair par le cookie, et sert à retrouver la
      ligne. Le secret, lui, n'est connu que du navigateur : c'est ce couple
      qui permet de distinguer un jeton volé d'un jeton inconnu, et donc de
      révoquer une famille entière quand un ancien secret est rejoué.
    */
    family: uuid('family').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    /*
      Le secret précédent reste accepté pendant un court délai de grâce après
      la rotation : deux onglets qui se chargent en même temps présentent le
      même cookie, et sans cela le second passerait pour un vol.
    */
    previousSecretHash: text('previous_secret_hash'),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('remember_token_expires_at_idx').on(table.expiresAt)],
);

export const loginAttempt = pgTable(
  'login_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /*
      Deux empreintes HMAC, jamais les valeurs : une adresse e-mail et une
      adresse IP sont des données personnelles (security.md). Un HMAC avec le
      poivre du serveur et non un SHA nu, qui se retrouverait au dictionnaire
      pour une adresse e-mail.

      L'empreinte porte sur l'adresse **soumise** et non sur un compte : sinon
      un compte inconnu ne serait pas compté, et le 429 dirait quels comptes
      existent.
    */
    emailFingerprint: text('email_fingerprint').notNull(),
    ipFingerprint: text('ip_fingerprint').notNull(),
    outcome: loginOutcome('outcome').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('login_attempt_email_idx').on(table.emailFingerprint, table.attemptedAt),
    index('login_attempt_ip_idx').on(table.ipFingerprint, table.attemptedAt),
  ],
);
