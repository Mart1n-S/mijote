/**
 * Une option proposée par un groupe de boutons radio ou une liste déroulante.
 *
 * Le même type pour les deux : ce sont les deux façons de présenter le même
 * choix, et un appelant qui passe de l'une à l'autre ne doit pas avoir à
 * réécrire ses données.
 */
export interface ChoiceOption {
  value: string;
  label: string;
  /** Proposée mais indisponible : elle reste lue, sans être choisissable. */
  disabled?: boolean;
}
