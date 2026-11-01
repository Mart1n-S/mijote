import { z } from 'zod';

/*
  Format d'erreur unique de l'API, RFC 9457 (Problem Details for HTTP APIs).

  Il vit ici parce que les deux applications en dépendent : apps/api le produit,
  apps/web le lit. Un schéma et pas seulement un type : le front reçoit ce corps
  par le réseau, donc il le valide avant de s'y fier, et le même schéma sert
  alors de garantie des deux côtés.
*/

/** Type de média des réponses d'erreur, imposé par la RFC 9457. */
export const PROBLEM_DETAILS_MEDIA_TYPE = 'application/problem+json';

/** En-tête qui porte l'identifiant de requête, en réponse. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Un champ refusé par la validation, et la raison, en français. */
export const fieldErrorSchema = z.object({
  /** Chemin du champ dans le corps envoyé, par exemple `household.size`. */
  field: z.string(),
  message: z.string(),
});

export const problemDetailsSchema = z.object({
  /*
    URI qui identifie le type de problème. `about:blank` quand le statut HTTP
    dit déjà tout : c'est ce que la RFC prescrit comme valeur par défaut, et
    `title` vaut alors l'intitulé du statut.
  */
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  /*
    Membre d'extension. L'identifiant de la requête, le même que dans l'en-tête
    REQUEST_ID_HEADER et sur chaque ligne de journal qu'elle a produite. C'est
    ce qui relie une erreur vue par l'utilisateur à sa trace côté serveur, sans
    rien lui divulguer de technique.
  */
  requestId: z.string(),
  /** Membre d'extension, présent seulement sur une erreur de validation. */
  errors: z.array(fieldErrorSchema).optional(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
