import { z } from 'zod';

/*
  La connexion, vue des deux côtés.

  apps/api valide le corps reçu avec ces schémas, apps/web construit son
  formulaire sur les mêmes : une règle de longueur ou de forme ne peut donc pas
  diverger entre l'écran et le serveur.
*/

/** Longueur minimale d'un mot de passe, à la création d'un compte (issue #10). */
export const MIN_PASSWORD_LENGTH = 12;

/*
  Deux bornes de longueur, qui ne sont pas des règles de forme mais des
  garde-fous : au-delà, c'est du travail offert à un inconnu. 254 caractères est
  la longueur maximale d'une adresse e-mail (RFC 5321), et 200 caractères
  laissent largement la place à une phrase de passe sans faire hacher un
  méga-octet par Argon2.
*/
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 200;

/*
  L'adresse est normalisée avant d'être validée : espaces retirés, minuscules.
  C'est la forme sous laquelle elle est écrite en base, donc la seule qui
  retrouve un compte, et la connexion ne doit pas dépendre de la façon de taper
  son adresse.
*/
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(MAX_EMAIL_LENGTH));

export const loginSchema = z.object({
  email: emailSchema,
  /*
    Un seul caractère suffit ici, là où la création d'un compte en exige douze :
    refuser un mot de passe court à la connexion n'empêcherait aucune attaque,
    et empêcherait un ancien compte de se connecter.
  */
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  /** « Se souvenir de moi », décoché par défaut. */
  remember: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/*
  La double authentification, telle que l'écran la voit.

  Le second facteur ne concerne que l'administrateur dans ce lot : pour les
  autres comptes, `active` reste faux et aucun écran ne le propose.
*/
export const twoFactorStateSchema = z.object({
  /** Inscrite et confirmée par un premier code. */
  active: z.boolean(),
});

export type TwoFactorState = z.infer<typeof twoFactorStateSchema>;

/*
  Le compte connecté, tel que l'API le renvoie.

  Le strict nécessaire pour l'interface : qui est connecté, à quel foyer, avec
  quel rôle. Son adresse en fait partie, parce que l'écran l'affiche à la
  personne qui est déjà connectée ; elle ne sort jamais dans un journal.
*/
export const sessionAccountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  householdId: z.uuid(),
  role: z.enum(['user', 'admin']),
});

export type SessionAccount = z.infer<typeof sessionAccountSchema>;

/** Corps des réponses de /auth/login et /auth/session. */
export const sessionResponseSchema = z.object({
  account: sessionAccountSchema,
  twoFactor: twoFactorStateSchema,
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Ce que /auth/login répond quand le mot de passe est bon mais qu'un second
 * facteur est attendu.
 *
 * Aucune session n'est ouverte à ce moment-là : l'attente vit dans sa propre
 * table, et son cookie ne permet que de soumettre le code (ADR 0012).
 */
export const twoFactorRequiredSchema = z.object({ twoFactorRequired: z.literal(true) });

export const loginResponseSchema = z.union([sessionResponseSchema, twoFactorRequiredSchema]);

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Un code de second facteur : six chiffres du téléphone, ou un code de secours.
 *
 * Le serveur reconnaît lequel des deux à sa forme. La borne haute est là pour
 * ne pas faire travailler le serveur sur une chaîne quelconque.
 */
export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(1).max(64) });

export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>;

/**
 * Le mot de passe, redemandé.
 *
 * L'activation et la désactivation l'exigent toutes deux : sans cela, une
 * session volée d'un administrateur sans second facteur inscrirait
 * l'application de l'attaquant, obtiendrait l'administration et verrouillerait
 * le propriétaire.
 */
export const passwordConfirmationSchema = z.object({
  password: z.string().min(1).max(200),
});

/** Corps de /auth/two-factor/setup : le mot de passe, et rien d'autre. */
export const twoFactorSetupSchema = passwordConfirmationSchema;

/** Corps de /auth/two-factor/activate et de la désactivation. */
export const twoFactorConfirmSchema = passwordConfirmationSchema.extend(twoFactorCodeSchema.shape);

export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmSchema>;

/**
 * Ce que l'inscription renvoie : l'URI que lit l'application, et la clé en
 * texte pour qui ne peut pas viser un QR code.
 *
 * Les deux contiennent le secret : la réponse porte `Cache-Control: no-store`,
 * et ni l'une ni l'autre n'est journalisée.
 */
export const twoFactorSetupResponseSchema = z.object({
  uri: z.string(),
  key: z.string(),
});

export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

/** Les dix codes de secours, montrés une seule fois. */
export const backupCodesResponseSchema = z.object({ codes: z.array(z.string()) });

export type BackupCodesResponse = z.infer<typeof backupCodesResponseSchema>;

/** En-tête qui porte le jeton CSRF, renvoyé depuis le cookie lisible. */
export const CSRF_HEADER = 'X-CSRF-Token';

/** Nom du cookie lisible par le script, qui porte le jeton CSRF. */
export const CSRF_COOKIE = 'mijote_csrf';
