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
export const sessionResponseSchema = z.object({ account: sessionAccountSchema });

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** En-tête qui porte le jeton CSRF, renvoyé depuis le cookie lisible. */
export const CSRF_HEADER = 'X-CSRF-Token';

/** Nom du cookie lisible par le script, qui porte le jeton CSRF. */
export const CSRF_COOKIE = 'mijote_csrf';
