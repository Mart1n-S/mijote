// Calibre un seuil de score sous lequel il vaut mieux ne rien proposer.
//
// Mesure faite **sur le jeu de reglage seulement** : le jeu de controle ne doit
// jamais servir a choisir un parametre, sinon son chiffre ne vaut plus rien.
//
// On compare deux populations : le score de la premiere suggestion quand elle
// est bonne, et le score de la premiere suggestion quand l'ingredient n'a aucun
// equivalent dans la source. Si les deux populations se separent, un seuil est
// justifie.

import { chargeIngredients, partage } from "./corpus.ts";
import { METHODES, prepare, suggere } from "./methodes.ts";
import { sources } from "./couples.ts";
import { aUnEquivalent, verdict } from "./verites.ts";

function quantile(valeurs: number[], part: number): number {
  if (valeurs.length === 0) return Number.NaN;
  const tries = [...valeurs].sort((a, b) => a - b);
  return tries[Math.min(tries.length - 1, Math.floor(part * tries.length))];
}

function principal(): void {
  const { reglage } = partage(chargeIngredients());
  const derniere = METHODES.at(-1)!;

  for (const source of sources()) {
    const contexte = prepare(source.elements, derniere);
    const scoresBons: number[] = [];
    const scoresSansEquivalent: number[] = [];

    for (const ingredient of reglage) {
      if (!ingredient.aAcheter) continue;
      const suggestions = suggere(ingredient.nom, contexte, derniere);
      if (suggestions.length === 0) continue;
      const premier = suggestions[0];
      const v = verdict(source.nom, ingredient.nom, premier.cle);
      if (v === "bon") scoresBons.push(premier.score);
      if (!aUnEquivalent(source.nom, ingredient.nom, "utilisable")) scoresSansEquivalent.push(premier.score);
    }

    console.log(`=== ${source.nom} (jeu de réglage) ===`);
    console.log(
      `  première suggestion bonne       : n=${scoresBons.length} min=${quantile(scoresBons, 0).toFixed(2)} q10=${quantile(scoresBons, 0.1).toFixed(2)} médiane=${quantile(scoresBons, 0.5).toFixed(2)}`,
    );
    console.log(
      `  ingrédient sans équivalent      : n=${scoresSansEquivalent.length} médiane=${quantile(scoresSansEquivalent, 0.5).toFixed(2)} q90=${quantile(scoresSansEquivalent, 0.9).toFixed(2)} max=${quantile(scoresSansEquivalent, 1).toFixed(2)}`,
    );
    console.log("");
  }
}

principal();
