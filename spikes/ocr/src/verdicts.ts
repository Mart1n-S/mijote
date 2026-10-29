// Verdicts du rapprochement, portés à la main.
//
// Indexés par `mesure|document|ligne|rang`, **jamais par libellé** : ce fichier
// est commité, les achats de Martin ne le sont pas. Les libellés correspondants
// restent dans data/ et references/, tous deux hors de Git.
//
// Trois valeurs, mêmes définitions qu'à l'hypothèse 6 : « bon » si le candidat
// est le produit ou l'aliment acheté, « variante » si la recette ou le calcul
// s'en accommode, « faux » sinon.
//
// Couverture des verdicts :
//   - mesure A : tous les rangs de toutes les lignes ayant reçu une suggestion ;
//   - mesures B1 et B2 : le premier rang de toutes les lignes ayant reçu une
//     suggestion, et les rangs suivants seulement là où ils changent le
//     résultat. La mesure « dans les trois premières » est donc un plancher.

export type Verdict = "bon" | "variante" | "faux";

export const VERDICTS: Record<string, Verdict> = {
  // A. libellés tronqués des tickets Picard vers le catalogue Picard
  "ticket-picard|2026-05-19|0|0": "faux",
  "ticket-picard|2026-05-19|1|0": "bon",
  "ticket-picard|2026-05-19|2|0": "bon",
  "ticket-picard|2026-05-19|2|1": "variante",
  "ticket-picard|2026-05-19|3|0": "variante",
  "ticket-picard|2026-06-09|0|0": "variante",
  "ticket-picard|2026-06-09|1|0": "bon",
  "ticket-picard|2026-06-09|1|1": "variante",
  "ticket-picard|2026-06-09|3|0": "bon",
  "ticket-picard|2026-06-09|3|1": "variante",
  "ticket-picard|2026-06-09|4|0": "bon",
  "ticket-picard|2026-06-09|5|0": "faux",
  "ticket-picard|2026-06-27|0|0": "bon",
  "ticket-picard|2026-06-27|1|0": "faux",
  "ticket-picard|2026-06-27|1|1": "faux",
  "ticket-picard|2026-06-27|1|2": "faux",
  "ticket-picard|2026-06-27|3|0": "faux",
  "ticket-picard|2026-06-27|3|1": "variante",
  "ticket-picard|2026-06-27|3|2": "faux",
  "ticket-picard|2026-06-27|4|0": "faux",
  "ticket-picard|2026-06-27|4|1": "faux",
  "ticket-picard|2026-06-27|5|0": "bon",
  "ticket-picard|2026-06-27|7|0": "bon",
  "ticket-picard|2026-06-27|7|1": "variante",

  // B1. libellés complets des factures drive vers les 87 ingrédients HelloFresh
  "facture-hellofresh|095297155|1|0": "bon",
  "facture-hellofresh|095297155|1|1": "variante",
  "facture-hellofresh|095297155|4|0": "faux",
  "facture-hellofresh|095297155|5|0": "faux",
  "facture-hellofresh|095297155|7|0": "variante",
  "facture-hellofresh|095297155|9|0": "variante",
  "facture-hellofresh|095297155|10|0": "bon",
  "facture-hellofresh|095297155|11|0": "bon",
  "facture-hellofresh|095297155|12|0": "bon",
  "facture-hellofresh|095297155|14|0": "faux",
  "facture-hellofresh|095297155|14|1": "faux",
  "facture-hellofresh|095297155|16|0": "bon",
  "facture-hellofresh|095297155|18|0": "faux",
  "facture-hellofresh|095297155|22|0": "faux",
  "facture-hellofresh|095297155|26|0": "faux",
  "facture-hellofresh|095297155|31|0": "variante",
  "facture-hellofresh|095297155|33|0": "faux",
  "facture-hellofresh|095297155|33|1": "faux",
  "facture-hellofresh|095297155|34|0": "bon",
  "facture-hellofresh|095297155|35|0": "faux",
  "facture-hellofresh|095297155|35|1": "faux",
  "facture-hellofresh|095297155|36|0": "bon",
  "facture-hellofresh|741577821|3|0": "bon",
  "facture-hellofresh|741577821|4|0": "variante",
  "facture-hellofresh|741577821|7|0": "variante",
  "facture-hellofresh|741577821|8|0": "variante",
  "facture-hellofresh|741577821|12|0": "bon",
  "facture-hellofresh|741577821|15|0": "faux",
  "facture-hellofresh|741577821|16|0": "bon",
  "facture-hellofresh|741577821|23|0": "faux",
  "facture-hellofresh|741577821|24|0": "faux",
  "facture-hellofresh|741577821|26|0": "faux",
  "facture-hellofresh|741577821|27|0": "bon",
  "facture-hellofresh|858095702|0|0": "faux",
  "facture-hellofresh|858095702|2|0": "faux",
  "facture-hellofresh|858095702|3|0": "faux",
  "facture-hellofresh|858095702|4|0": "variante",
  "facture-hellofresh|858095702|6|0": "faux",
  "facture-hellofresh|858095702|8|0": "bon",

  // B2. libellés complets des factures drive vers les 3 484 aliments Ciqual
  "facture-ciqual|095297155|2|0": "faux",
  "facture-ciqual|095297155|3|0": "faux",
  "facture-ciqual|095297155|6|0": "bon",
  "facture-ciqual|095297155|8|0": "bon",
  "facture-ciqual|095297155|10|0": "variante",
  "facture-ciqual|095297155|16|0": "bon",
  "facture-ciqual|095297155|16|1": "variante",
  "facture-ciqual|095297155|19|0": "bon",
  "facture-ciqual|095297155|22|0": "variante",
  "facture-ciqual|095297155|28|0": "faux",
  "facture-ciqual|095297155|30|0": "bon",
  "facture-ciqual|095297155|30|1": "bon",
  "facture-ciqual|095297155|35|0": "faux",
  "facture-ciqual|095297155|35|1": "faux",
  "facture-ciqual|095297155|36|0": "bon",
  "facture-ciqual|741577821|0|0": "faux",
  "facture-ciqual|741577821|1|0": "bon",
  "facture-ciqual|741577821|2|0": "faux",
  "facture-ciqual|741577821|5|0": "bon",
  "facture-ciqual|741577821|8|0": "bon",
  "facture-ciqual|741577821|8|1": "bon",
  "facture-ciqual|741577821|12|0": "bon",
  "facture-ciqual|741577821|26|0": "faux",
  "facture-ciqual|741577821|30|0": "bon",
  "facture-ciqual|741577821|31|0": "faux",
  "facture-ciqual|858095702|0|0": "bon",
  "facture-ciqual|858095702|3|0": "faux",
  "facture-ciqual|858095702|8|0": "bon",
  "facture-ciqual|858095702|9|0": "bon",
  "facture-ciqual|858095702|9|1": "variante",
};
