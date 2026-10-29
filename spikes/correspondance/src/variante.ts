// Compare M7 a deux variantes du mot exige, sur le meme banc que mesure.ts :
//
//   M8  la restriction au vocabulaire du catalogue n'est appliquee qu'en repli,
//       quand le mot le plus discriminant de l'entree en est absent ;
//   M9  aucun repli : si ce mot est absent du catalogue, la methode se tait.
//       C'est le comportement d'avant la correction venue de l'hypothese 7.
//
// Ce que le fichier mesure : le nombre d'ingredients dont les suggestions
// different, et surtout ce que le repli apporte et ce qu'il coute, verdict par
// verdict, sur les ingredients a acheter.

import { chargeIngredients } from "./corpus.ts";
import { METHODES, prepare, suggere } from "./methodes.ts";
import { sources } from "./couples.ts";
import { canonique, mots } from "./normalisation.ts";
import { aUnEquivalent, verdict } from "./verites.ts";

const m7 = METHODES.find((m) => m.nom.startsWith("M7"))!;
const m8 = METHODES.find((m) => m.nom.startsWith("M8"))!;
const m9 = METHODES.find((m) => m.nom.startsWith("M9"))!;

const ingredients = chargeIngredients().filter((i) => i.aAcheter);

for (const source of sources()) {
  const contexte = prepare(source.elements, m7);
  let differencesM8 = 0;
  let repli = 0;
  let repliUtile = 0;
  let repliAbsurde = 0;
  let repliSansEffet = 0;
  const absurdes: string[] = [];
  const utiles: string[] = [];

  for (const ingredient of ingredients) {
    const motsIngredient = mots(canonique(ingredient.nom), { retirerBruitPicard: true });
    const motsInconnus = motsIngredient.filter((mot) => !contexte.idf.has(mot));

    const a = suggere(ingredient.nom, contexte, m7);
    const b = suggere(ingredient.nom, contexte, m8);
    const c = suggere(ingredient.nom, contexte, m9);

    if (a.map((s) => s.cle).join("|") !== b.map((s) => s.cle).join("|")) differencesM8 += 1;

    if (motsInconnus.length === 0) continue;
    repli += 1;

    // Ce que le repli change vraiment : il fait parler la methode la ou elle se
    // taisait. On regarde donc les suggestions que M7 produit et pas M9.
    if (a.length > 0 && c.length === 0) {
      const verdicts = a.map((s) => verdict(source.nom, ingredient.nom, s.cle));
      const utilisable = verdicts.some((v) => v === "bon" || v === "variante");
      if (utilisable) {
        repliUtile += 1;
        utiles.push(ingredient.nom);
      } else {
        repliAbsurde += 1;
        absurdes.push(ingredient.nom);
      }
    } else {
      repliSansEffet += 1;
    }
  }

  const sansEquivalent = ingredients.filter(
    (i) => !aUnEquivalent(source.nom, i.nom, "utilisable"),
  ).length;

  console.log(`=== ${source.nom} ===`);
  console.log(`  ingredients a acheter : ${ingredients.length}, dont ${sansEquivalent} sans aucun equivalent`);
  console.log(`  suggestions qui different entre M7 et M8 : ${differencesM8}`);
  console.log(`  entrees portant un mot inconnu du catalogue : ${repli}`);
  console.log(`    dont le repli fait parler la methode : ${repliUtile + repliAbsurde}`);
  console.log(`      proposition utilisable : ${repliUtile} (${utiles.join(", ")})`);
  console.log(`      proposition absurde    : ${repliAbsurde} (${absurdes.join(", ")})`);
  console.log(`    sans effet (elle parlait deja, ou se tait encore) : ${repliSansEffet}
`);
}
