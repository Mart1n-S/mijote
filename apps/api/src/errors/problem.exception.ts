import { HttpException } from '@nestjs/common';

/**
 * Exception dont le message est écrit par le projet, en français, pour être lu
 * par un utilisateur.
 *
 * C'est la **seule** famille dont le filtre recopie le message dans le `detail`
 * du problème. La raison est mesurée : une exception levée par NestJS ou par
 * une bibliothèque porte un message technique en anglais, et parfois un morceau
 * de ce que le client a envoyé. Mesuré le 1er novembre 2026 sur l'application
 * construite :
 *
 * - route inconnue, `NotFoundException` de NestJS : « Cannot GET
 *   /stores?address=12%20rue%20des%20Lilas », donc l'adresse saisie pour
 *   trouver un magasin, que les journaux écartent exprès, reviendrait dans la
 *   réponse et s'afficherait à l'écran ;
 * - corps JSON illisible, `BadRequestException` fabriquée par l'adaptateur
 *   Express : « Unexpected token '<', "<html>12 r"... is not valid JSON ».
 *
 * Pour tout le reste, le filtre sert un détail générique en français, choisi
 * par statut.
 */
export class ProblemException extends HttpException {
  constructor(status: number, detail: string) {
    super(detail, status);
  }
}
