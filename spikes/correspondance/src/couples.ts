// Liste les couples ingredient-candidat qu'il reste a etiqueter.
//
// Toutes les methodes sont lancees sur les deux sources, et l'union de leurs
// trois premieres suggestions forme l'ensemble des couples a juger. Chaque
// couple n'est etiquete qu'une fois, dans src/verites.ts, et sert ensuite a
// toutes les methodes : c'est ce qui rend la mesure du « bon produit dans les
// 3 premieres » possible sans etiqueter les 1 605 produits un par un.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargeAliments, chargeIngredients, chargeProduits } from "./corpus.ts";
import { METHODES, prepare, suggere, type Element } from "./methodes.ts";
import { estEtiquete } from "./verites.ts";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

export function sources(): { nom: string; elements: Element[] }[] {
  const produits = chargeProduits();
  const aliments = chargeAliments();
  return [
    // Cote Picard, le libelle disponible pour les 1 605 produits est le slug de
    // l'URL. Les noms reels n'existent que pour 50 fiches : les utiliser
    // avantagerait justement les produits les plus susceptibles d'etre la bonne
    // reponse, ce qui fausserait la mesure. On s'en tient donc au slug partout.
    { nom: "picard", elements: produits.map((p) => ({ cle: p.id, libelle: p.slug })) },
    { nom: "ciqual", elements: aliments.map((a) => ({ cle: a.code, libelle: a.nom, groupe: a.groupe })) },
  ];
}

function principal(): void {
  const ingredients = chargeIngredients();
  const aEtiqueter: { source: string; ingredient: string; cle: string; libelle: string; methodes: string[] }[] = [];
  const vus = new Map<string, { source: string; ingredient: string; cle: string; libelle: string; methodes: string[] }>();

  for (const source of sources()) {
    for (const reglages of METHODES) {
      const contexte = prepare(source.elements, reglages);
      for (const ingredient of ingredients) {
        for (const suggestion of suggere(ingredient.nom, contexte, reglages)) {
          const cle = `${source.nom}|${ingredient.nom}|${suggestion.cle}`;
          const existant = vus.get(cle);
          if (existant) {
            if (!existant.methodes.includes(reglages.nom)) existant.methodes.push(reglages.nom);
            continue;
          }
          vus.set(cle, {
            source: source.nom,
            ingredient: ingredient.nom,
            cle: suggestion.cle,
            libelle: suggestion.libelle,
            methodes: [reglages.nom],
          });
        }
      }
    }
  }

  for (const couple of vus.values()) {
    if (!estEtiquete(couple.source, couple.ingredient, couple.cle)) aEtiqueter.push(couple);
  }

  writeFileSync(
    join(DOSSIER_DATA, "couples-a-etiqueter.json"),
    `${JSON.stringify(aEtiqueter, null, 1)}\n`,
    "utf8",
  );

  console.log(`${vus.size} couples distincts proposes par les ${METHODES.length} methodes.`);
  console.log(`${aEtiqueter.length} restent a etiqueter.\n`);

  const parSource = new Map<string, number>();
  for (const couple of aEtiqueter) parSource.set(couple.source, (parSource.get(couple.source) ?? 0) + 1);
  for (const [source, nombre] of parSource) console.log(`  ${source} : ${nombre}`);
}

principal();
