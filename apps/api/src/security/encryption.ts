import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/*
  Le chiffrement au repos, pour ce qui doit être relu.

  Tout le reste du projet est haché : un mot de passe, un jeton de session, un
  code de secours ne se relisent jamais, on vérifie seulement qu'une valeur
  présentée correspond. Le secret TOTP, lui, sert à recalculer un code à chaque
  vérification : il faut pouvoir le relire, donc le chiffrer.

  AES-256-GCM, de node:crypto, sans dépendance. GCM et non CBC, parce qu'il
  authentifie ce qu'il chiffre : une ligne modifiée en base est refusée au
  déchiffrement au lieu de rendre un secret différent, qui ferait échouer tous
  les codes sans qu'on sache pourquoi.
*/

/** 32 octets de clé, 12 octets de vecteur d'initialisation : les tailles de GCM. */
const KEY_BYTES = 32;
const IV_BYTES = 12;

/*
  Le format stocké, en quatre parties séparées par des points : la version, le
  vecteur d'initialisation, l'étiquette d'authentification, le chiffré.

  La version n'est pas décorative : c'est elle qui permettra de changer de clé
  ou d'algorithme en relisant les anciennes lignes, le jour où il le faudra.
*/
const VERSION = 'v1';

/** Lit la clé et refuse de démarrer sans elle. */
export function readEncryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const raw = env['SECURITY_TOTP_KEY']?.trim();

  if (raw === undefined || raw === '') {
    throw new Error("SECURITY_TOTP_KEY est absente de l'environnement. Voir .env.example.");
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SECURITY_TOTP_KEY fait ${key.length.toString()} octets décodés, il en faut exactement ${KEY_BYTES.toString()}. Voir .env.example.`,
    );
  }

  return key;
}

/**
 * Chiffre une valeur, liée à son propriétaire.
 *
 * `owner` entre en donnée authentifiée associée : il n'est pas chiffré, mais le
 * déchiffrement échoue si on en présente un autre. Une ligne recopiée vers un
 * autre compte est donc illisible, alors qu'elle serait parfaitement valable
 * sans cela.
 */
export function encrypt(key: Buffer, owner: string, value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  cipher.setAAD(Buffer.from(owner, 'utf8'));

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

/**
 * Déchiffre une valeur, ou lève.
 *
 * L'échec n'est pas rattrapé ici : une étiquette qui ne correspond pas, une
 * version inconnue ou un propriétaire différent sont des incidents, pas des
 * refus d'accès. Ils remontent en erreur inattendue, journalisée.
 */
export function decrypt(key: Buffer, owner: string, stored: string): string {
  const parts = stored.split('.');

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('valeur chiffrée illisible : format ou version inattendus');
  }

  const [, iv, tag, encrypted] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv ?? '', 'base64url'));

  decipher.setAAD(Buffer.from(owner, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag ?? '', 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted ?? '', 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
