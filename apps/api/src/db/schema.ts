import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
  Schéma Drizzle. Le lot 1 n'a de tables que pour les comptes et leur session :
  les tables métier (recettes, planning, courses) arriveront avec leurs stories.

  Toutes les dates sont en `timestamptz` : une date sans fuseau se lirait
  différemment selon le serveur, et une session expirerait au mauvais moment.
*/

export const accountRole = pgEnum('account_role', ['user', 'admin']);

/** L'issue d'une tentative de connexion, telle que la limitation la compte. */
export const loginOutcome = pgEnum('login_outcome', ['succeeded', 'failed', 'blocked']);

/**
 * Ce qui était vérifié par une tentative.
 *
 * Les trois compteurs restent séparés : cinq mots de passe faux à la
 * connexion, cinq codes faux et cinq mots de passe faux à la réauthentification
 * sont trois histoires différentes.
 *
 * `reauth` en particulier ne doit pas compter avec `password` : les deux ont la
 * même adresse IP, et un porteur de session volée pourrait sinon épuiser le
 * compteur de la connexion et verrouiller le vrai propriétaire dehors.
 *
 * `reset_request` et `reset` sont séparés pour la même raison : les deux routes
 * de la réinitialisation partagent l'adresse IP, et compter ensemble laisserait
 * quelqu'un épuiser le compteur des demandes pour empêcher les vraies
 * réinitialisations d'aboutir (ADR 0014).
 */
export const loginPurpose = pgEnum('login_purpose', [
  'password',
  'code',
  'reauth',
  'invitation',
  'reset_request',
  'reset',
]);

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
    /*
      Quand le second facteur a été validé **dans cette session**, et donc
      depuis quand elle a les droits d'administration. Nul, la session vaut
      pour l'application mais aucune route d'administration ne l'accepte.

      C'est ce qui permet au cookie de mémorisation de rouvrir l'application
      sans rouvrir l'administration (ADR 0012) : une session reprise naît avec
      cette colonne nulle.
    */
    adminUnlockedAt: timestamp('admin_unlocked_at', { withTimezone: true }),
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
    /*
      Au stade du code, le compte est déjà connu : l'empreinte porte alors sur
      son identifiant et non sur une adresse soumise. La colonne dit lequel des
      deux, pour que les deux compteurs ne se confondent pas.
    */
    purpose: loginPurpose('purpose').notNull().default('password'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('login_attempt_email_idx').on(table.emailFingerprint, table.attemptedAt),
    index('login_attempt_ip_idx').on(table.ipFingerprint, table.attemptedAt),
  ],
);

/**
 * La double authentification d'un compte. Une ligne par compte, au plus.
 *
 * Elle existe dès que quelqu'un commence l'inscription de son application :
 * `activated_at` nul veut dire « secret engendré, jamais confirmé », et un
 * nouveau `setup` l'écrase.
 */
export const accountTwoFactor = pgTable('account_two_factor', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => account.id, { onDelete: 'cascade' }),
  /*
    Le secret TOTP, **chiffré et non haché** : il doit être relu à chaque
    vérification. AES-256-GCM, avec une clé distincte du poivre et
    l'identifiant du compte en donnée authentifiée associée, de sorte qu'une
    ligne recopiée vers un autre compte ne se déchiffre pas. Format et raisons
    dans security/encryption.ts et l'ADR 0012.
  */
  secretCipher: text('secret_cipher').notNull(),
  /** Nul tant que le premier code n'a pas confirmé l'inscription. */
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  /*
    Le dernier pas de 30 secondes accepté. Un code dont le pas ne lui est pas
    strictement supérieur est refusé : c'est ce qui ferme le rejeu dans la
    fenêtre, sans avoir à retenir les codes vus ni à les purger.

    `integer` suffit : un pas vaut l'heure Unix divisée par 30, donc la borne
    de 2^31 est atteinte vers l'an 4000.
  */
  lastUsedStep: integer('last_used_step'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Les codes de secours, dix par compte, à usage unique.
 *
 * Le numéro est porté en clair par le code affiché : il dit quelle ligne
 * vérifier, et évite de hacher les dix à chaque essai (une seconde et 640 Mio
 * de mémoire, voir l'ADR 0012). Ce n'est pas un secret.
 */
export const twoFactorBackupCode = pgTable(
  'two_factor_backup_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    /*
      Empreinte Argon2id, et non SHA-256 comme les jetons de session : un code
      de secours fait 55 bits, donc il se casse hors ligne sur une base volée
      là où 32 octets tirés au hasard ne se cassent pas.
    */
    codeHash: text('code_hash').notNull(),
    /** Consommé une fois, la ligne reste : elle dit qu'il a servi, et quand. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('two_factor_backup_code_position_unique').on(table.accountId, table.position),
  ],
);

/**
 * L'attente entre un mot de passe validé et le second facteur.
 *
 * Ce n'est pas une session, et c'est tout l'intérêt : la garde de session ne
 * connaît que « une session ou rien », donc ce cookie ne peut rien autoriser
 * par mégarde. La ligne est détruite au moment où la vraie session s'ouvre,
 * qui reçoit un jeton neuf : aucune fixation possible (ADR 0012).
 */
export const pendingLogin = pgTable(
  'pending_login',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /** Empreinte SHA-256 du jeton du cookie, jamais le jeton. */
    tokenHash: text('token_hash').notNull(),
    /** Son propre secret CSRF : la soumission du code garde les trois barrières. */
    csrfSecret: text('csrf_secret').notNull(),
    /** Essais déjà faits sur cette attente. Au-delà de cinq, elle est détruite. */
    attempts: integer('attempts').notNull().default(0),
    /*
      « Se souvenir de moi » est demandé au mot de passe, mais la session ne
      s'ouvre qu'après le code : le choix attend donc ici. Le poser plus tôt
      reviendrait à remettre un jeton de trente jours à qui n'a pas encore
      prouvé son second facteur.
    */
    remember: boolean('remember').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('pending_login_token_hash_unique').on(table.tokenHash),
    index('pending_login_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * Une invitation à s'inscrire : un ticket, pour une V1 fermée.
 *
 * Elle ne rattache à rien. Chaque invité crée son compte **et son propre
 * foyer**, comme le cahier des charges le prévoit (« un compte correspond à un
 * foyer ») : les 1 à 35 personnes d'un foyer sont des mangeurs, un nombre de
 * portions du profil, pas des comptes (ADR 0013).
 */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /*
      L'adresse invitée, normalisée et **en clair** : c'est elle qui fixe le
      compte à créer, et la liste de l'administrateur l'affiche. C'est une
      donnée personnelle, d'où la purge des invitations terminées plus bas, et
      la règle qui lui interdit les journaux.
    */
    email: text('email').notNull(),
    /** Le rôle que le compte créé aura dans l'application. */
    role: accountRole('role').notNull().default('user'),
    /*
      Empreinte SHA-256 du jeton du lien, jamais le jeton : une fuite de cette
      table ne donne aucune invitation utilisable. L'empreinte suffit, le jeton
      étant tiré au hasard sur 32 octets.
    */
    tokenHash: text('token_hash').notNull(),
    /*
      Qui a invité. Nul si ce compte a été supprimé depuis : l'invitation reste,
      elle dit ce qui s'est passé.
    */
    invitedBy: uuid('invited_by').references(() => account.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Consommée : le compte existe. Le jeton ne vaut plus rien. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Révoquée par l'administrateur, ou remplacée par une invitation plus récente. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invitation_token_hash_unique').on(table.tokenHash),
    /*
      Une seule invitation vivante par adresse. Le prédicat ne regarde que les
      deux dates, et non l'expiration : un index ne peut pas contenir `now()`,
      qui n'est pas immuable. Une invitation expirée mais non révoquée reste
      donc dans l'index, et c'est la création qui la révoque d'abord, dans la
      même transaction (ADR 0013).
    */
    uniqueIndex('invitation_email_live_unique')
      .on(table.email)
      .where(sql`${table.usedAt} is null and ${table.revokedAt} is null`),
    // Les deux comptages de la limitation d'envoi : par invitant, et par adresse.
    index('invitation_inviter_idx').on(table.invitedBy, table.createdAt),
    index('invitation_email_idx').on(table.email, table.createdAt),
  ],
);

/**
 * Un jeton de réinitialisation de mot de passe, valable une heure.
 *
 * Contrairement à `invitation`, cette table ne porte **aucune adresse e-mail** :
 * le compte existe déjà, donc `account_id` suffit, et c'est lui qui dit à qui
 * écrire. Elle ne contient donc aucune donnée personnelle, et sa purge se
 * réduit à l'expiration (ADR 0014).
 */
export const passwordReset = pgTable(
  'password_reset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    /*
      Empreinte SHA-256 du jeton du lien, jamais le jeton : une fuite de cette
      table ne donne aucun lien utilisable. L'empreinte suffit, le jeton étant
      tiré au hasard sur 32 octets, donc sans dictionnaire à ralentir.
    */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Consommé : le mot de passe a changé. Le lien ne vaut plus rien. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Révoqué par une demande plus récente, ou par une réinitialisation. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_reset_token_hash_unique').on(table.tokenHash),
    /*
      Un seul jeton vivant par compte. Comme pour les invitations, le prédicat
      ne regarde que les deux dates et non l'expiration, `now()` n'étant pas
      immuable : c'est la demande qui révoque le vivant d'abord, dans la même
      transaction. Deux demandes simultanées ne peuvent donc pas poser deux
      jetons, la seconde insertion échouant en violation d'unicité (ADR 0014).
    */
    uniqueIndex('password_reset_account_live_unique')
      .on(table.accountId)
      .where(sql`${table.usedAt} is null and ${table.revokedAt} is null`),
    // La purge par expiration, accrochée à une connexion réussie comme les
    // autres (ADR 0010).
    index('password_reset_expires_at_idx').on(table.expiresAt),
  ],
);
