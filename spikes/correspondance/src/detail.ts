// Diagnostic : ou la derniere methode se trompe-t-elle encore ?
//
// Volontairement limite au **jeu de reglage**. Regarder les echecs du jeu de
// controle reviendrait a s'en servir pour ameliorer la methode, et son chiffre
// ne voudrait plus rien dire.

import { chargeIngredients, partage } from "./corpus.ts";
import { METHODES, prepare, suggere } from "./methodes.ts";
import { sources } from "./couples.ts";
import { aUnEquivalent, verdict } from "./verites.ts";

function principal(): void {
  const { reglage } = partage(chargeIngredients());
  const methode = METHODES.at(-1)!;

  for (const source of sources()) {
    const contexte = prepare(source.elements, methode);
    console.log(`=== ${source.nom}, ${methode.nom}, jeu de réglage ===\n`);

    console.log("-- la bonne réponse existe mais n'est pas première --");
    for (const ingredient of reglage) {
      if (!ingredient.aAcheter || !aUnEquivalent(source.nom, ingredient.nom, "bon")) continue;
      const suggestions = suggere(ingredient.nom, contexte, methode);
      const verdicts = suggestions.map((s) => verdict(source.nom, ingredient.nom, s.cle));
      if (verdicts[0] === "bon") continue;
      console.log(
        `  ${ingredient.nom.padEnd(28)} ${suggestions.map((s, i) => `${verdicts[i][0]}:${s.libelle.slice(0, 26)}`).join(" | ")}`,
      );
    }

    console.log("\n-- propositions alors qu'aucun équivalent n'existe --");
    for (const ingredient of reglage) {
      if (!ingredient.aAcheter || aUnEquivalent(source.nom, ingredient.nom, "utilisable")) continue;
      const suggestions = suggere(ingredient.nom, contexte, methode);
      if (suggestions.length === 0) continue;
      console.log(
        `  ${ingredient.nom.padEnd(28)} ${suggestions.map((s) => `${s.libelle.slice(0, 24)} (${s.score.toFixed(1)})`).join(" | ")}`,
      );
    }
    console.log("");
  }
}

principal();
