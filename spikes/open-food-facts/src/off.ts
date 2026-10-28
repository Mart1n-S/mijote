// Hypothese 5 : pour les produits dont on connaitra le code-barres, Open Food
// Facts donne-t-il les valeurs pour 100 g, assez souvent et assez fiablement
// pour calculer la nutrition d'un repas ?
//
// Echantillon : les codes-barres releves sur les fiches Picard (hypotheses 3
// et 5) plus celui releve chez Intermarche a l'hypothese 2. Les codes sont lus
// dans data/ du prototype picard : on recopie, on ne partage pas de code.
//
// Point important sur l'API, decouvert en sondant avant d'ecrire ce script :
// en v3.6, `product.nutriments` est **vide**. Les valeurs ont demenage dans
// `product.nutrition.aggregated_set.nutrients`, ou chaque nutriment porte sa
// valeur, son unite, sa base (`source_per`) et surtout sa **provenance**
// (`packaging` quand elle est lue sur l'emballage, `estimate` quand elle est
// devinee a partir des ingredients). Les noms de champs en `_100g` que l'on
// trouve partout appartiennent a la v2, qui est depreciee.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, PRODUCTION, RefusDuService, HorsCadre } from "./garde.ts";

const CODES_PICARD = join(import.meta.dirname, "..", "..", "picard", "data", "codes-barres.json");

/** Code-barres releve sur une fiche produit Intermarche a l'hypothese 2. */
const CODE_INTERMARCHE = { source: "Intermarché", ingredient: "Riz basmati", codes: ["3038354536002"] };

const CHAMPS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "product_quantity",
  "categories_tags",
  "nutriscore_grade",
  "last_modified_t",
  "nutrition",
].join(",");

/** Les quatre valeurs exigees par la section 3 du cahier des charges. */
const INDISPENSABLES = ["energy-kcal", "proteins", "carbohydrates", "fat"] as const;
/** Celles qui completent l'affichage, utiles mais non bloquantes. */
const COMPLEMENTAIRES = ["sugars", "fiber", "salt"] as const;

type Nutriment = { value?: number; unit?: string; source?: string; source_per?: string; value_computed?: number };

type Fiche = { source: string; ingredient: string; nom?: string; codes: string[] };

function litLesCodes(): Fiche[] {
  if (!existsSync(CODES_PICARD)) {
    throw new Error(`Codes-barres absents : ${CODES_PICARD}. Lance d'abord « npm run codes-barres » dans spikes/picard.`);
  }
  const brut = JSON.parse(readFileSync(CODES_PICARD, "utf8"));
  const fiches: Fiche[] = [];
  for (const entree of brut.fiches ?? []) {
    if (typeof entree.codeBarres !== "string" || !entree.codeBarres.trim()) continue;
    // Certaines fiches portent deux codes-barres (deux fournisseurs).
    const codes = entree.codeBarres.trim().split(/\s+/).filter((c: string) => /^\d{8,14}$/.test(c));
    if (codes.length > 0) fiches.push({ source: "Picard", ingredient: entree.ingredient, nom: entree.nom, codes });
  }
  fiches.push(CODE_INTERMARCHE);
  return fiches;
}

/** Contraintes de coherence : une valeur presente peut etre manifestement fausse. */
function controles(nutriments: Record<string, Nutriment>): string[] {
  const valeur = (nom: string) => nutriments[nom]?.value;
  const alertes: string[] = [];

  const kcal = valeur("energy-kcal");
  const proteines = valeur("proteins");
  const glucides = valeur("carbohydrates");
  const lipides = valeur("fat");

  for (const [nom, nutriment] of Object.entries(nutriments)) {
    if (typeof nutriment.value === "number" && nutriment.value < 0) alertes.push(`${nom} negatif`);
    if (nutriment.source_per && nutriment.source_per !== "100g") {
      alertes.push(`${nom} donne par ${nutriment.source_per} et non par 100 g`);
    }
  }

  const somme = [proteines, glucides, lipides].filter((v): v is number => typeof v === "number");
  if (somme.length === 3 && somme.reduce((a, b) => a + b, 0) > 100) {
    alertes.push(`somme des macronutriments superieure a 100 g (${somme.reduce((a, b) => a + b, 0).toFixed(1)})`);
  }

  if (kcal === 0 && somme.some((v) => v > 0)) alertes.push("kcal a 0 alors que des macronutriments sont renseignes");

  // Regle 4/4/9 : l'energie doit decouler des macronutriments.
  if (typeof kcal === "number" && kcal > 0 && somme.length === 3) {
    const calcule = 4 * (proteines as number) + 4 * (glucides as number) + 9 * (lipides as number);
    const ecart = Math.abs(kcal - calcule) / kcal;
    if (ecart > 0.3) {
      alertes.push(`energie incoherente avec les macronutriments : ${kcal} kcal declarees contre ${calcule.toFixed(0)} calculees`);
    }
  }

  const sel = valeur("salt");
  if (typeof sel === "number" && sel > 25) alertes.push(`sel aberrant (${sel} g pour 100 g)`);

  return alertes;
}

async function interroge(garde: Garde, code: string, fichier: string) {
  const url = `${PRODUCTION}/api/v3.6/product/${code}.json?fields=${CHAMPS}`;
  const reponse = await garde.recupere(url, fichier);
  try {
    return { statut: reponse.statut, corps: JSON.parse(reponse.corps) as Record<string, any> };
  } catch {
    return { statut: reponse.statut, corps: {} as Record<string, any> };
  }
}

async function principal(): Promise<void> {
  const garde = new Garde(true);
  const fiches = litLesCodes();
  console.log(`${fiches.length} fiches a verifier, ${fiches.filter((f) => f.codes.length > 1).length} avec deux codes-barres.\n`);

  const resultats: Record<string, unknown>[] = [];

  for (const [position, fiche] of fiches.entries()) {
    let trouve: { code: string; produit: Record<string, any> } | null = null;
    const essayes: string[] = [];

    // Un code, puis le second s'il existe et que le premier est inconnu.
    for (const code of fiche.codes) {
      essayes.push(code);
      const { corps } = await interroge(garde, code, `produit-${String(position + 1).padStart(2, "0")}-${code}.json`);
      if (corps.product && Object.keys(corps.product).length > 0) {
        trouve = { code, produit: corps.product };
        break;
      }
    }

    if (!trouve) {
      resultats.push({ ...fiche, codesEssayes: essayes, trouve: false });
      console.log(`[${fiche.ingredient}] absent d'Open Food Facts (${essayes.join(", ")})`);
      continue;
    }

    const nutriments: Record<string, Nutriment> = trouve.produit.nutrition?.aggregated_set?.nutrients ?? {};
    const presence = (noms: readonly string[]) => noms.filter((nom) => typeof nutriments[nom]?.value === "number");
    const provenance = (noms: readonly string[]) =>
      Object.fromEntries(noms.map((nom) => [nom, nutriments[nom]?.source ?? "absent"]));

    const indispensablesPresents = presence(INDISPENSABLES);
    const alertes = controles(nutriments);

    resultats.push({
      ...fiche,
      codesEssayes: essayes,
      codeRetenu: trouve.code,
      trouve: true,
      nomDansOff: trouve.produit.product_name ?? null,
      marque: trouve.produit.brands ?? null,
      quantite: trouve.produit.quantity ?? null,
      quantiteEnGrammes: trouve.produit.product_quantity ?? null,
      categories: (trouve.produit.categories_tags ?? []).length,
      nutriScore: trouve.produit.nutriscore_grade ?? null,
      derniereModification: trouve.produit.last_modified_t
        ? new Date(trouve.produit.last_modified_t * 1000).toISOString().slice(0, 10)
        : null,
      nutrimentsDisponibles: Object.keys(nutriments).length,
      indispensables: {
        presents: indispensablesPresents,
        complets: indispensablesPresents.length === INDISPENSABLES.length,
        provenance: provenance(INDISPENSABLES),
      },
      complementaires: {
        presents: presence(COMPLEMENTAIRES),
        provenance: provenance(COMPLEMENTAIRES),
      },
      alertes,
    });

    const etat = indispensablesPresents.length === 4 ? "4/4" : `${indispensablesPresents.length}/4`;
    console.log(
      `[${fiche.ingredient}] ${trouve.produit.product_name ?? "(sans nom)"} | indispensables ${etat}` +
        `${alertes.length > 0 ? ` | ${alertes.length} alerte(s)` : ""}`,
    );
  }

  const trouves = resultats.filter((r) => r.trouve);
  const complets = trouves.filter((r) => (r.indispensables as any).complets);
  const parProvenance = (nom: string) =>
    trouves.filter((r) => (r.indispensables as any).provenance[nom] === "packaging").length;

  const synthese = {
    lanceLe: new Date().toISOString(),
    api: "Open Food Facts v3.6, production",
    codesTestes: resultats.length,
    requetes: garde.total,
    trouves: `${trouves.length}/${resultats.length}`,
    avecLesQuatreValeursIndispensables: `${complets.length}/${resultats.length}`,
    valeursLuesSurLEmballage: {
      kcal: `${parProvenance("energy-kcal")}/${trouves.length}`,
      proteines: `${parProvenance("proteins")}/${trouves.length}`,
      glucides: `${parProvenance("carbohydrates")}/${trouves.length}`,
      lipides: `${parProvenance("fat")}/${trouves.length}`,
    },
    complementaires: {
      sucres: `${trouves.filter((r) => (r.complementaires as any).presents.includes("sugars")).length}/${trouves.length}`,
      fibres: `${trouves.filter((r) => (r.complementaires as any).presents.includes("fiber")).length}/${trouves.length}`,
      sel: `${trouves.filter((r) => (r.complementaires as any).presents.includes("salt")).length}/${trouves.length}`,
    },
    nutriScore: `${trouves.filter((r) => r.nutriScore).length}/${trouves.length}`,
    quantiteEnGrammes: `${trouves.filter((r) => r.quantiteEnGrammes).length}/${trouves.length}`,
    avecAuMoinsUneAlerte: `${trouves.filter((r) => (r.alertes as string[]).length > 0).length}/${trouves.length}`,
    alertesParType: Object.fromEntries(
      [...trouves.flatMap((r) => r.alertes as string[]).reduce((compte, alerte) => {
        const cle = alerte.replace(/\d+[\d.,]*/g, "N");
        compte.set(cle, (compte.get(cle) ?? 0) + 1);
        return compte;
      }, new Map<string, number>())].sort((a, b) => b[1] - a[1]),
    ),
  };

  writeFileSync(
    join(DOSSIER_DATA, "off.json"),
    `${JSON.stringify({ synthese, resultats }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n--- synthese ---\n${JSON.stringify(synthese, null, 2)}`);
}

principal().catch((erreur: Error) => {
  if (erreur instanceof RefusDuService || erreur instanceof HorsCadre) {
    console.error(`ARRET (cadre) : ${erreur.message}`);
  } else {
    console.error(`ARRET : ${erreur.message}`);
  }
  process.exitCode = 1;
});
