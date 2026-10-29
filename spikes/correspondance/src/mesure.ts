// Banc de mesure : compare les six methodes sur les deux sources.
//
// Perimetres, tels que precises par Martin :
//   - mesure principale : un verdict « bon » parmi les 3 premieres suggestions,
//     sur les ingredients **a acheter** (hors produits de placard) et qui ont un
//     equivalent « bon » dans la source mesuree. Sans cette seconde condition,
//     Picard plafonnerait mecaniquement au tiers, puisqu'il ne vend pas de
//     farine ni de vinaigre ;
//   - mesure secondaire : la meme, en acceptant les variantes utilisables ;
//   - mesure de securite : sur les ingredients qui n'ont **aucun** equivalent,
//     la methode propose-t-elle quand meme quelque chose ? C'est le taux de
//     propositions absurdes, qu'il faut garder bas.
//
// Les ingredients de controle (29 sur 87, rang alphabetique modulo 3) n'ont
// jamais servi a mettre au point une methode. C'est leur chiffre qui compte.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargeIngredients, partage, type Ingredient } from "./corpus.ts";
import { METHODES, prepare, suggere, type Reglages } from "./methodes.ts";
import { sources } from "./couples.ts";
import { aUnEquivalent, verdict } from "./verites.ts";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

type Resultat = {
  perimetrePrincipal: number;
  premiereBonne: number;
  troisPremieresBonnes: number;
  perimetreSecondaire: number;
  premiereUtilisable: number;
  troisPremieresUtilisables: number;
  sansEquivalent: number;
  propositionsAbsurdes: number;
};

function pourcentage(numerateur: number, denominateur: number): string {
  if (denominateur === 0) return "n.d.";
  return `${Math.round((numerateur / denominateur) * 100)} %`;
}

function mesure(
  ingredients: Ingredient[],
  source: { nom: string; elements: ReturnType<typeof sources>[number]["elements"] },
  reglages: Reglages,
): Resultat {
  const contexte = prepare(source.elements, reglages);
  const resultat: Resultat = {
    perimetrePrincipal: 0,
    premiereBonne: 0,
    troisPremieresBonnes: 0,
    perimetreSecondaire: 0,
    premiereUtilisable: 0,
    troisPremieresUtilisables: 0,
    sansEquivalent: 0,
    propositionsAbsurdes: 0,
  };

  for (const ingredient of ingredients) {
    if (!ingredient.aAcheter) continue;

    const suggestions = suggere(ingredient.nom, contexte, reglages);
    const verdicts = suggestions.map((s) => verdict(source.nom, ingredient.nom, s.cle));

    const aUnBon = aUnEquivalent(source.nom, ingredient.nom, "bon");
    const aUnUtilisable = aUnEquivalent(source.nom, ingredient.nom, "utilisable");

    if (aUnBon) {
      resultat.perimetrePrincipal += 1;
      if (verdicts[0] === "bon") resultat.premiereBonne += 1;
      if (verdicts.includes("bon")) resultat.troisPremieresBonnes += 1;
    }

    if (aUnUtilisable) {
      resultat.perimetreSecondaire += 1;
      if (verdicts[0] === "bon" || verdicts[0] === "variante") resultat.premiereUtilisable += 1;
      if (verdicts.some((v) => v === "bon" || v === "variante")) resultat.troisPremieresUtilisables += 1;
    } else {
      resultat.sansEquivalent += 1;
      if (suggestions.length > 0) resultat.propositionsAbsurdes += 1;
    }
  }

  return resultat;
}

function principal(): void {
  const ingredients = chargeIngredients();
  const { reglage, controle } = partage(ingredients);
  const jeux = [
    { nom: "réglage", ingredients: reglage },
    { nom: "contrôle", ingredients: controle },
    { nom: "ensemble", ingredients },
  ];

  const tout: Record<string, unknown> = {
    mesureLe: new Date().toISOString(),
    ingredients: {
      total: ingredients.length,
      aAcheter: ingredients.filter((i) => i.aAcheter).length,
      reglage: reglage.length,
      controle: controle.length,
    },
  };

  for (const source of sources()) {
    const parMethode: Record<string, unknown> = {};

    for (const reglages of METHODES) {
      const parJeu: Record<string, unknown> = {};
      for (const jeu of jeux) {
        const r = mesure(jeu.ingredients, source, reglages);
        parJeu[jeu.nom] = {
          perimetre: r.perimetrePrincipal,
          troisPremieresBonnes: `${r.troisPremieresBonnes}/${r.perimetrePrincipal} (${pourcentage(r.troisPremieresBonnes, r.perimetrePrincipal)})`,
          premiereBonne: `${r.premiereBonne}/${r.perimetrePrincipal} (${pourcentage(r.premiereBonne, r.perimetrePrincipal)})`,
          troisPremieresUtilisables: `${r.troisPremieresUtilisables}/${r.perimetreSecondaire} (${pourcentage(r.troisPremieresUtilisables, r.perimetreSecondaire)})`,
          premiereUtilisable: `${r.premiereUtilisable}/${r.perimetreSecondaire} (${pourcentage(r.premiereUtilisable, r.perimetreSecondaire)})`,
          propositionsAbsurdes: `${r.propositionsAbsurdes}/${r.sansEquivalent} (${pourcentage(r.propositionsAbsurdes, r.sansEquivalent)})`,
        };
      }
      parMethode[reglages.nom] = parJeu;
    }

    tout[source.nom] = parMethode;
  }

  writeFileSync(join(DOSSIER_DATA, "mesure.json"), `${JSON.stringify(tout, null, 2)}\n`, "utf8");

  // Tableau lisible : la mesure principale, par methode et par source.
  console.log(`Ingrédients : ${(tout.ingredients as any).total} dont ${(tout.ingredients as any).aAcheter} à acheter`);
  console.log(`Réglage : ${reglage.length} | Contrôle : ${controle.length}\n`);

  for (const source of sources()) {
    console.log(`=== ${source.nom} ===`);
    console.log(
      `${"méthode".padEnd(20)} ${"3 premières (contrôle)".padEnd(24)} ${"1re (contrôle)".padEnd(18)} ${"3 premières utilisables".padEnd(26)} absurdes`,
    );
    for (const reglages of METHODES) {
      const r = (tout[source.nom] as any)[reglages.nom].contrôle;
      console.log(
        `${reglages.nom.padEnd(20)} ${String(r.troisPremieresBonnes).padEnd(24)} ${String(r.premiereBonne).padEnd(18)} ${String(r.troisPremieresUtilisables).padEnd(26)} ${r.propositionsAbsurdes}`,
      );
    }
    console.log("");
  }
}

principal();
