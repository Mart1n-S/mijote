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
  /**
   * Un code a été validé dans **cette** session.
   *
   * Les routes d'administration l'exigent, et une session reprise par le
   * cookie de mémorisation ne l'a pas : elle rouvre l'application, pas
   * l'administration (ADR 0012). C'est ce qui conduit l'interface à l'écran de
   * déverrouillage plutôt qu'à un refus.
   */
  adminUnlocked: z.boolean(),
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

/*
  Les invitations : un ticket d'inscription pour une V1 fermée.

  L'invitation ne rattache à rien. Chaque invité crée son compte et son propre
  foyer, comme le prévoit le cahier des charges, et le rôle choisi à
  l'invitation est son rôle dans l'application (ADR 0013).
*/

/**
 * L'état d'une invitation, déduit de ses dates et non stocké.
 *
 * Une colonne de statut ferait une seconde vérité, qu'il faudrait tenir à jour
 * au passage de chaque heure.
 */
export const invitationStatusSchema = z.enum(['pending', 'used', 'expired', 'revoked']);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** Corps de la création d'une invitation, par un administrateur. */
export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['user', 'admin']).default('user'),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/** Une invitation, telle que la liste de l'administrateur la montre. */
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(['user', 'admin']),
  status: invitationStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
});

export type Invitation = z.infer<typeof invitationSchema>;

export const invitationListSchema = z.object({ invitations: z.array(invitationSchema) });

export type InvitationList = z.infer<typeof invitationListSchema>;

/**
 * Un jeton opaque reçu dans le corps d'une requête.
 *
 * Il arrive dans le **corps**, jamais dans l'URL : un jeton dans une adresse
 * fuit par l'en-tête `Referer` et par les journaux du mandataire. Le lien de
 * l'e-mail le porte donc dans son fragment, que le navigateur ne transmet
 * jamais (ADR 0013 pour l'invitation, ADR 0014 pour la réinitialisation).
 *
 * La borne haute ne décrit pas le jeton, qui fait 43 caractères : elle évite
 * de faire hacher et chercher une chaîne quelconque.
 */
const opaqueTokenSchema = z.object({ token: z.string().trim().min(1).max(200) });

/** Le jeton d'une invitation, tel que la page d'inscription le présente. */
export const invitationTokenSchema = opaqueTokenSchema;

/** Ce que la page d'inscription affiche avant de demander un mot de passe. */
export const invitationPreviewSchema = z.object({ email: z.string() });

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** Corps de l'acceptation : le jeton, et le mot de passe choisi. */
export const acceptInvitationSchema = invitationTokenSchema.extend({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/*
  La réinitialisation d'un mot de passe oublié.

  Deux routes, et aucune réponse qui dise si l'adresse a un compte : la demande
  répond toujours la même chose, et le même temps, l'envoi de l'e-mail ne
  retenant pas la réponse (ADR 0014).
*/

/**
 * Corps de la demande : l'adresse, et rien d'autre.
 *
 * Même schéma d'adresse qu'à la connexion, donc même normalisation : c'est la
 * forme sous laquelle un compte se retrouve, et la demande ne doit pas dépendre
 * de la façon de taper son adresse.
 */
export const forgotPasswordSchema = z.object({ email: emailSchema });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Corps de la réinitialisation : le jeton du lien, et le mot de passe choisi.
 *
 * Les mêmes règles de longueur qu'à la création d'un compte, et c'est le même
 * schéma qui les porte des deux côtés : un mot de passe accepté par l'écran et
 * refusé par le serveur n'aurait aucun moyen d'être corrigé.
 */
export const resetPasswordSchema = opaqueTokenSchema.extend({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
