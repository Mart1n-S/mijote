// Analyse, sans reseau, les reponses Open Food Facts deja enregistrees par
// src/off.ts. On peut donc corriger l'analyse autant de fois que necessaire
// sans resolliciter leur API.
//
// Correction importante par rapport a la premiere version : la regle 4/4/9
// (4 kcal/g pour les proteines et les glucides, 9 pour les lipides) ignore les
// fibres, qui apportent environ 2 kcal/g. Sur des legumes et des fruits riches
// en fibres, elle sous-estime l'energie et declenche de fausses alertes : fonds
// d'artichauts, myrtilles et menthe etaient signales a tort. Avec les fibres,
// les trois concordent. La regle appliquee ici est donc 4/4/9 plus 2 pour les
// fibres, et l'ancienne version est conservee a titre de comparaison.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const CODES_PICARD = join(import.meta.dirname, "..", "..", "picard", "data", "codes-barres.json");

/** Les quatre valeurs exigees par la section 3 du cahier des charges. */
const INDISPENSABLES = ["energy-kcal", "proteins", "carbohydrates", "fat"] as const;
/** Celles qui completent l'affichage, utiles mais non bloquantes. */
const COMPLEMENTAIRES = ["sugars", "fiber", "salt"] as const;

type Nutriment = { value?: number; unit?: string; source?: string; source_per?: string; value_computed?: number };

export function controles(nutriments: Record<string, Nutriment>): string[] {
  const valeur = (nom: string) => nutriments[nom]?.value;
  const alertes: string[] = [];

  for (const [nom, nutriment] of Object.entries(nutriments)) {
    if (typeof nutriment.value === "number" && nutriment.value < 0) alertes.push(`${nom} negatif`);
    // Piege reel rencontre : un produit dont toutes les valeurs sont donnees
    // par portion et non pour 100 g. Les utiliser telles quelles serait faux.
    if (nutriment.source_per && nutriment.source_per !== "100g") {
      alertes.push(`${nom} donne par ${nutriment.source_per} et non pour 100 g`);
    }
  }

  const proteines = valeur("proteins");
  const glucides = valeur("carbohydrates");
  const lipides = valeur("fat");
  const fibres = valeur("fiber") ?? 0;
  const kcal = valeur("energy-kcal");
  const macros = [proteines, glucides, lipides].filter((v): v is number => typeof v === "number");

  if (macros.length === 3 && macros.reduce((a, b) => a + b, 0) > 100) {
    alertes.push(`somme des macronutriments superieure a 100 g (${macros.reduce((a, b) => a + b, 0).toFixed(1)})`);
  }
  if (kcal === 0 && macros.some((v) => v > 0)) {
    alertes.push("kcal a 0 alors que des macronutriments sont renseignes");
  }
  if (typeof kcal === "number" && kcal > 0 && macros.length === 3) {
    const calcule = 4 * (proteines as number) + 4 * (glucides as number) + 9 * (lipides as number) + 2 * fibres;
    const ecart = Math.abs(kcal - calcule) / kcal;
    if (ecart > 0.3) {
      alertes.push(
        `energie incoherente avec les macronutriments et les fibres : ${kcal} kcal declarees contre ${calcule.toFixed(0)} calculees`,
      );
    }
  }

  const sel = valeur("salt");
  if (typeof sel === "number" && sel > 25) alertes.push(`sel aberrant (${sel} g pour 100 g)`);

  return alertes;
}

/** Nom d'ingredient associe a un code-barres, d'apres les releves Picard. */
function libelles(): Map<string, string> {
  const table = new Map<string, string>();
  table.set("3038354536002", "Riz basmati (Intermarché)");
  if (!existsSync(CODES_PICARD)) return table;
  for (const fiche of JSON.parse(readFileSync(CODES_PICARD, "utf8")).fiches ?? []) {
    if (typeof fiche.codeBarres !== "string") continue;
    for (const code of fiche.codeBarres.trim().split(/\s+/)) table.set(code, fiche.ingredient);
  }
  return table;
}

function principal(): void {
  const noms = libelles();
  const fichiers = readdirSync(DOSSIER_DATA).filter((f) => /^produit-\d+-\d+\.json$/.test(f)).sort();

  const resultats = fichiers.map((fichier) => {
    const code = /-(\d+)\.json$/.exec(fichier)![1];
    const produit = (JSON.parse(readFileSync(join(DOSSIER_DATA, fichier), "utf8")).product ?? {}) as Record<string, any>;
    const trouve = Object.keys(produit).length > 0;
    const nutriments: Record<string, Nutriment> = produit.nutrition?.aggregated_set?.nutrients ?? {};

    const presence = (liste: readonly string[]) => liste.filter((nom) => typeof nutriments[nom]?.value === "number");
    const provenance = (liste: readonly string[]) =>
      Object.fromEntries(liste.map((nom) => [nom, nutriments[nom]?.source ?? "absent"]));

    return {
      code,
      ingredient: noms.get(code) ?? "(inconnu)",
      trouve,
      nomDansOff: produit.product_name ?? null,
      marque: produit.brands ?? null,
      quantite: produit.quantity ?? null,
      quantiteEnGrammes: produit.product_quantity ?? null,
      categories: (produit.categories_tags ?? []).length,
      nutriScore: produit.nutriscore_grade ?? null,
      derniereModification: produit.last_modified_t
        ? new Date(produit.last_modified_t * 1000).toISOString().slice(0, 10)
        : null,
      indispensables: {
        presents: presence(INDISPENSABLES),
        complets: presence(INDISPENSABLES).length === INDISPENSABLES.length,
        provenance: provenance(INDISPENSABLES),
      },
      complementaires: { presents: presence(COMPLEMENTAIRES), provenance: provenance(COMPLEMENTAIRES) },
      alertes: controles(nutriments),
    };
  });

  // Un code-barres peut avoir ete interroge deux fois (produits a deux codes) :
  // on ne compte chaque fiche qu'une fois, en gardant celle qui a abouti.
  const parIngredient = new Map<string, (typeof resultats)[number]>();
  for (const resultat of resultats) {
    const existant = parIngredient.get(resultat.ingredient);
    if (!existant || (!existant.trouve && resultat.trouve)) parIngredient.set(resultat.ingredient, resultat);
  }
  const fiches = [...parIngredient.values()];
  const trouves = fiches.filter((f) => f.trouve);
  const part = (n: number, total = trouves.length) => `${n}/${total} (${total ? Math.round((n / total) * 100) : 0} %)`;
  const surEmballage = (nom: string) =>
    trouves.filter((f) => (f.indispensables.provenance as Record<string, string>)[nom] === "packaging").length;

  const dates = trouves.map((f) => f.derniereModification).filter((d): d is string => Boolean(d)).sort();

  const synthese = {
    analyseLe: new Date().toISOString(),
    api: "Open Food Facts v3.6, production",
    fichesTestees: fiches.length,
    reponsesEnregistrees: resultats.length,
    trouves: part(trouves.length, fiches.length),
    lesQuatreValeursIndispensables: part(trouves.filter((f) => f.indispensables.complets).length, fiches.length),
    valeursLuesSurLEmballageEtNonEstimees: {
      kcal: part(surEmballage("energy-kcal")),
      proteines: part(surEmballage("proteins")),
      glucides: part(surEmballage("carbohydrates")),
      lipides: part(surEmballage("fat")),
    },
    complementaires: {
      sucres: part(trouves.filter((f) => f.complementaires.presents.includes("sugars")).length),
      fibres: part(trouves.filter((f) => f.complementaires.presents.includes("fiber")).length),
      sel: part(trouves.filter((f) => f.complementaires.presents.includes("salt")).length),
    },
    nutriScore: part(trouves.filter((f) => f.nutriScore).length),
    quantiteEnGrammes: part(trouves.filter((f) => f.quantiteEnGrammes).length),
    categoriesRenseignees: part(trouves.filter((f) => f.categories > 0).length),
    fraicheur: { plusAncienne: dates[0], plusRecente: dates.at(-1) },
    avecAuMoinsUneAlerte: part(trouves.filter((f) => f.alertes.length > 0).length),
    alertes: trouves
      .filter((f) => f.alertes.length > 0)
      .map((f) => ({ ingredient: f.ingredient, nom: f.nomDansOff, alertes: f.alertes })),
    absents: fiches.filter((f) => !f.trouve).map((f) => ({ ingredient: f.ingredient, code: f.code })),
  };

  writeFileSync(join(DOSSIER_DATA, "analyse.json"), `${JSON.stringify({ synthese, fiches }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(synthese, null, 2));
}

if (process.argv[1]?.endsWith("analyse.ts")) principal();
