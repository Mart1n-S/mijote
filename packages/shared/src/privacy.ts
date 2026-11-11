import { z } from 'zod';

import { householdProfileSchema } from './household.js';

/*
  Les deux droits du RGPD : récupérer ses données, et les faire supprimer.

  Le schéma de l'export n'est pas là pour que le navigateur l'analyse, il
  télécharge un fichier : il est là pour que **la forme du fichier soit écrite
  une fois**, que l'API la produise sous son contrôle, et que son test la
  vérifie. Un format rendu à quelqu'un qui part doit être stable, et c'est
  pourquoi il porte son numéro (ADR 0017).
*/

/**
 * Le refus du dernier administrateur, écrit une seule fois.
 *
 * Partagé entre l'API et l'écran, et pas par souci de concision : l'écran
 * désactive le bouton pour un administrateur seul et doit donner **la même
 * phrase** que le serveur rendrait, faute de quoi les deux dériveraient. Le
 * message nomme le seul chemin qui existe avant l'issue #48, aucun écran ne
 * changeant le rôle d'un compte existant (ADR 0017).
 */
export const LAST_ADMIN_REFUSAL =
  'Vous êtes le seul administrateur. Invitez un compte avec le rôle administrateur, puis réessayez.';

/**
 * Ce que l'écran demande avant de proposer la suppression.
 *
 * Une route à part qui ne rend qu'un booléen, comme l'état du premier
 * lancement : savoir si le bouton doit être désactivé n'a pas à faire voyager
 * autre chose (ADR 0015). Ce n'est pas ce qui protège le compte, le serveur
 * refusant de son côté.
 */
export const accountDeletionStateSchema = z.object({ blocked: z.boolean() });

export type AccountDeletionState = z.infer<typeof accountDeletionStateSchema>;

/** La version du format exporté. Un changement de forme l'incrémente. */
export const ACCOUNT_EXPORT_FORMAT = 1;

/**
 * Le second facteur d'un compte, tel que l'export le décrit.
 *
 * L'état et la date, jamais le secret, même chiffré : rien de ce qui sert à
 * s'authentifier ne sort d'ici (ADR 0017).
 */
const exportedTwoFactorSchema = z.object({
  active: z.boolean(),
  activatedAt: z.string().nullable(),
  /** Combien de codes de secours existent, et lesquels ont servi, par numéro. */
  backupCodeCount: z.number().int(),
  usedBackupCodes: z.array(z.number().int()),
});

/**
 * Les appareils connectés, par leurs dates.
 *
 * Aucune empreinte de jeton : ce que la personne peut vouloir savoir est
 * « depuis quand et jusqu'à quand », pas de quoi rejouer une session.
 */
const exportedDevicesSchema = z.object({
  sessions: z.array(
    z.object({
      createdAt: z.string(),
      lastSeenAt: z.string(),
      expiresAt: z.string(),
    }),
  ),
  remembered: z.array(z.object({ createdAt: z.string(), expiresAt: z.string() })),
});

/**
 * L'invitation qui a créé ce compte, s'il en vient une.
 *
 * Ni son jeton, ni qui a invité : le premier est un authentifiant, le second est
 * l'identifiant de quelqu'un d'autre.
 */
const exportedInvitationSchema = z.object({
  createdAt: z.string(),
  usedAt: z.string().nullable(),
  role: z.enum(['user', 'admin']),
});

/**
 * Le fichier rendu par l'export.
 *
 * Ce qu'il **ne contient pas** est aussi décidé que ce qu'il contient :
 * l'empreinte du mot de passe, le secret TOTP, les empreintes des jetons et des
 * codes de secours, et les invitations envoyées par ce compte, qui portent
 * l'adresse d'autres personnes (ADR 0017).
 */
export const accountExportSchema = z.object({
  format: z.literal(ACCOUNT_EXPORT_FORMAT),
  exportedAt: z.string(),
  account: z.object({
    id: z.uuid(),
    email: z.string(),
    role: z.enum(['user', 'admin']),
    createdAt: z.string(),
  }),
  twoFactor: exportedTwoFactorSchema,
  household: z.object({
    id: z.uuid(),
    createdAt: z.string(),
    /** Le profil entier, dans la forme que l'application affiche (ADR 0016). */
    profile: householdProfileSchema,
  }),
  devices: exportedDevicesSchema,
  invitation: exportedInvitationSchema.nullable(),
});

export type AccountExport = z.infer<typeof accountExportSchema>;

/**
 * Le corps de la suppression.
 *
 * Trois choses qu'une session volée n'a pas : le mot de passe, le code du
 * second facteur quand il est actif, et une confirmation explicite.
 *
 * `confirmed` n'accepte que `true`, et ce n'est pas une coquetterie : la case à
 * cocher de l'écran devient ainsi une condition du **serveur**, et non un
 * garde-fou d'interface qu'un client pourrait ignorer (ADR 0017).
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  /** Exigé quand le second facteur est actif, inutile sinon. */
  code: z.string().trim().min(1).max(64).optional(),
  confirmed: z.literal(true),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
