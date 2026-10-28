// Inventorie, sans aucun appel reseau, ce que contient le JSON brut recupere par
// src/collecte.ts : chemins de champs, types, taux de presence sur les
// 20 recettes de l'echantillon, et les quelques verifications demandees pour le
// rapport (portions, unites, allergenes, tags, dates, tri, URL publique).
//
// On ne recopie aucun contenu de recette dans la sortie : seulement des
// structures, des compteurs et des listes de valeurs techniques (unites,
// noms de nutriments, types de tags) necessaires pour decider du modele.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

type Recette = Record<string, any>;

function lit(fichier: string): any {
  return JSON.parse(readFileSync(join(DOSSIER_DATA, fichier), "utf8"));
}

/**
 * Parcours recursif : produit un chemin par feuille, les tableaux etant reduits
 * a leur premier element et notes `[]`, pour que le chemin reste comparable
 * d'une recette a l'autre.
 */
function chemins(valeur: unknown, prefixe = "", sortie = new Map<string, Set<string>>()): Map<string, Set<string>> {
  const note = (chemin: string, type: string) => {
    if (!sortie.has(chemin)) sortie.set(chemin, new Set());
    sortie.get(chemin)!.add(type);
  };

  if (Array.isArray(valeur)) {
    note(`${prefixe}[]`, "array");
    if (valeur.length > 0) chemins(valeur[0], `${prefixe}[]`, sortie);
    return sortie;
  }
  if (valeur !== null && typeof valeur === "object") {
    for (const [cle, sous] of Object.entries(valeur)) {
      const chemin = prefixe ? `${prefixe}.${cle}` : cle;
      if (sous === null) {
        note(chemin, "null");
      } else if (Array.isArray(sous) || typeof sous === "object") {
        chemins(sous, chemin, sortie);
      } else {
        note(chemin, typeof sous);
      }
    }
    return sortie;
  }
  note(prefixe, typeof valeur);
  return sortie;
}

const page1 = lit("recherche-page-1.json");
const page2 = lit("recherche-page-2.json");
const triees = lit("recherche-tri-createdat.json");
const trieesCroissant = lit("recherche-tri-createdat-croissant.json");
const detail = lit("recette-detail-par-id.json");

const echantillon: Recette[] = [...page1.items, ...page2.items];

// 1. Inventaire des champs : chemin, types rencontres, taux de presence.
const presence = new Map<string, { types: Set<string>; vues: number; nonNulles: number }>();
for (const recette of echantillon) {
  for (const [chemin, types] of chemins(recette)) {
    if (!presence.has(chemin)) presence.set(chemin, { types: new Set(), vues: 0, nonNulles: 0 });
    const entree = presence.get(chemin)!;
    for (const type of types) entree.types.add(type);
    entree.vues += 1;
    if (!types.has("null") || types.size > 1) entree.nonNulles += 1;
  }
}

const inventaire = [...presence.entries()]
  .map(([chemin, e]) => ({
    chemin,
    types: [...e.types].sort().join("|"),
    presentSur: `${e.nonNulles}/${echantillon.length}`,
  }))
  .sort((a, b) => a.chemin.localeCompare(b.chemin));

// 2. Portions : quelles valeurs de `yields` existent, et les quantites
//    changent-elles proportionnellement au nombre de portions ? La reponse
//    decide si on peut calculer les quantites ou s'il faut stocker chaque
//    palier tel quel. On mesure ligne par ligne, pas recette par recette.
const portionsDisponibles = new Set<number>();
const combinaisonsDePaliers = new Map<string, number>();
const ratios2Vers4 = new Map<string, number>();
let recettesComparables = 0;
let recettesEntierementDoublees = 0;
for (const recette of echantillon) {
  const paliers: any[] = recette.yields ?? [];
  for (const palier of paliers) portionsDisponibles.add(palier.yields);
  const combinaison = paliers.map((p) => p.yields).join(",");
  combinaisonsDePaliers.set(combinaison, (combinaisonsDePaliers.get(combinaison) ?? 0) + 1);

  const base = paliers.find((p) => p.yields === 2);
  const double = paliers.find((p) => p.yields === 4);
  if (!base || !double) continue;
  recettesComparables += 1;

  const parId = new Map(base.ingredients.map((i: any) => [i.id, i.amount]));
  let toutDouble = true;
  for (const ligne of double.ingredients) {
    const reference = parId.get(ligne.id);
    let cas: string;
    if (reference === undefined) {
      cas = "ingredient absent du palier 2 portions";
    } else if (reference === null || ligne.amount === null) {
      cas = "quantite nulle (selon le gout)";
    } else {
      cas = `facteur ${((ligne.amount as number) / (reference as number)).toFixed(2)}`;
    }
    if (cas !== "facteur 2.00") toutDouble = false;
    ratios2Vers4.set(cas, (ratios2Vers4.get(cas) ?? 0) + 1);
  }
  if (toutDouble) recettesEntierementDoublees += 1;
}

// 3. Unites rencontrees et quantites manquantes (le « selon le gout »).
const unites = new Set<string>();
let lignesQuantite = 0;
let quantitesNulles = 0;
for (const recette of echantillon) {
  for (const palier of recette.yields ?? []) {
    for (const ligne of palier.ingredients ?? []) {
      unites.add(String(ligne.unit));
      lignesQuantite += 1;
      if (ligne.amount === null) quantitesNulles += 1;
    }
  }
}

// 4. Nutrition : les memes nutriments reviennent-ils sur toutes les recettes ?
const nutriments = new Map<string, number>();
for (const recette of echantillon) {
  for (const n of recette.nutrition ?? []) {
    nutriments.set(`${n.name} (${n.unit})`, (nutriments.get(`${n.name} (${n.unit})`) ?? 0) + 1);
  }
}

// 5. Allergenes et tags : vocabulaire ferme, utilisable comme filtre.
const typesAllergenes = new Set<string>();
const typesTags = new Set<string>();
let recettesAvecAllergenes = 0;
let recettesAvecTags = 0;
for (const recette of echantillon) {
  if ((recette.allergens ?? []).length > 0) recettesAvecAllergenes += 1;
  if ((recette.tags ?? []).length > 0) recettesAvecTags += 1;
  for (const a of recette.allergens ?? []) typesAllergenes.add(String(a.type));
  for (const t of recette.tags ?? []) typesTags.add(String(t.type));
}

// 6. Dates et tri : le parametre sort a-t-il ete pris en compte ?
const dates = echantillon
  .map((r) => ({ cree: r.createdAt as string, maj: r.updatedAt as string }))
  .filter((d) => d.cree && d.maj);
const idsSansTri: string[] = page1.items.map((r: Recette) => r.id);
const idsDecroissant: string[] = triees.items.map((r: Recette) => r.id);
const idsCroissant: string[] = trieesCroissant.items.map((r: Recette) => r.id);

// L'ordre par defaut est-il deja du plus recent au plus ancien sur les
// 20 recettes de l'echantillon ? C'est la condition de la collecte
// incrementale si le parametre `sort` est ignore.
const creesDansLOrdreRendu: string[] = echantillon.map((r) => r.createdAt);
const ordreParDefautDecroissant = creesDansLOrdreRendu.every(
  (valeur, index) => index === 0 || new Date(creesDansLOrdreRendu[index - 1]) >= new Date(valeur),
);

// Tout ce que l'API compte comme « recette » n'est pas un repas a cuisiner :
// les extras et produits d'epicerie gonflent le total annonce.
const typesHorsRepas = ["addon-recipe", "grocery-dairy", "breakfast-kits", "sides-delicacies"];
const horsRepas = echantillon.filter(
  (r) => r.isAddon === true || (r.tags ?? []).some((t: any) => typesHorsRepas.includes(t.type)),
).length;
const sansPalier2Vers6 = echantillon.filter((r) => (r.yields ?? []).length <= 1).length;

// 7. URL publique : la regle slug + id tient-elle sur tout l'echantillon ?
const urlConforme = echantillon.filter(
  (r) => r.websiteUrl === `https://www.hellofresh.fr/recipes/${r.slug}-${r.id}`,
).length;

// 8. La recherche suffit-elle, ou le detail apporte-t-il des champs en plus ?
const clesRecherche = new Set(Object.keys(page1.items[0]));
const clesDetail = new Set(Object.keys(detail));
const champsEnPlusDansDetail = [...clesDetail].filter((c) => !clesRecherche.has(c));
const memeContenu = JSON.stringify(detail) === JSON.stringify(page1.items[0]);

const resultat = {
  echantillon: {
    recettes: echantillon.length,
    identifiantsUniques: new Set(echantillon.map((r) => r.id)).size,
    totalAnnonceFr: page1.total,
    champsDistincts: inventaire.length,
  },
  portions: {
    paliersRencontres: [...portionsDisponibles].sort((a, b) => a - b),
    combinaisonsDePaliers: Object.fromEntries(combinaisonsDePaliers),
    recettesComparables2Vers4: recettesComparables,
    recettesOuToutesLesLignesDoublent: recettesEntierementDoublees,
    lignesParFacteur: Object.fromEntries([...ratios2Vers4].sort((a, b) => b[1] - a[1])),
  },
  quantites: {
    lignes: lignesQuantite,
    sansQuantite: quantitesNulles,
    unites: [...unites].sort(),
  },
  nutrition: {
    nutrimentsEtOccurrences: Object.fromEntries([...nutriments].sort((a, b) => b[1] - a[1])),
  },
  ingredients: (() => {
    const tous = echantillon.flatMap((r) => (r.ingredients ?? []) as any[]);
    return {
      references: tous.length,
      distinctsParId: new Set(tous.map((i) => i.id)).size,
      // shipped = false : HelloFresh ne le livre pas, c'est un produit de
      // placard. Candidat direct pour notre marquage « placard ».
      nonLivresDoncPlacard: tous.filter((i) => i.shipped === false).length,
      avecAuMoinsUnAllergene: tous.filter((i) => (i.allergens ?? []).length > 0).length,
      minParRecette: Math.min(...echantillon.map((r) => (r.ingredients ?? []).length)),
      maxParRecette: Math.max(...echantillon.map((r) => (r.ingredients ?? []).length)),
    };
  })(),
  allergenesEtTags: {
    recettesAvecAllergenes: recettesAvecAllergenes,
    typesAllergenes: [...typesAllergenes].sort(),
    recettesAvecTags: recettesAvecTags,
    typesTags: [...typesTags].sort(),
  },
  datesEtTri: {
    creeLePlusAncien: dates.map((d) => d.cree).sort()[0],
    creeLePlusRecent: dates.map((d) => d.cree).sort().at(-1),
    majLaPlusRecente: dates.map((d) => d.maj).sort().at(-1),
    ordreIdentiqueAvecEtSansSort: JSON.stringify(idsSansTri) === JSON.stringify(idsDecroissant),
    triCroissantIdentiqueAuDecroissant: JSON.stringify(idsCroissant) === JSON.stringify(idsDecroissant),
    ordreParDefautDuPlusRecentAuPlusAncien: ordreParDefautDecroissant,
  },
  perimetre: {
    recettesHorsRepasDansLEchantillon: `${horsRepas}/${echantillon.length}`,
    recettesSansChoixDePortions: `${sansPalier2Vers6}/${echantillon.length}`,
  },
  doublons: (() => {
    // Le meme plat revient sous plusieurs identifiants. `uniqueRecipeCode` est
    // de la forme PREFIXE-suffixes : le prefixe semble identifier le plat.
    const prefixe = (code: string) => code.split("-")[0];
    const nomsParPrefixe = new Map<string, Set<string>>();
    for (const r of echantillon) {
      const cle = prefixe(r.uniqueRecipeCode as string);
      if (!nomsParPrefixe.has(cle)) nomsParPrefixe.set(cle, new Set());
      nomsParPrefixe.get(cle)!.add(r.name as string);
    }
    return {
      identifiants: new Set(echantillon.map((r) => r.id)).size,
      codesComplets: new Set(echantillon.map((r) => r.uniqueRecipeCode)).size,
      prefixesDeCode: nomsParPrefixe.size,
      noms: new Set(echantillon.map((r) => r.name)).size,
      prefixesPortantPlusieursNoms: [...nomsParPrefixe.values()].filter((s) => s.size > 1).length,
      clonedFromRenseigne: `${echantillon.filter((r) => r.clonedFrom).length}/${echantillon.length}`,
    };
  })(),
  temps: (() => {
    // Format ISO 8601 de duree (PT35M). Les deux champs se contredisent
    // souvent : on mesure a quel point avant de choisir lequel afficher.
    const minutes = (iso: string) => Number(/\d+/.exec(iso)?.[0] ?? 0);
    const avecLesDeux = echantillon.filter((r) => r.prepTime && r.totalTime);
    return {
      format: "duree ISO 8601, par exemple PT35M",
      prepTimeRenseigne: `${echantillon.filter((r) => r.prepTime).length}/${echantillon.length}`,
      totalTimeRenseigne: `${echantillon.filter((r) => r.totalTime).length}/${echantillon.length}`,
      prepTimeSuperieurAuTotalTime: `${avecLesDeux.filter((r) => minutes(r.prepTime) > minutes(r.totalTime)).length}/${avecLesDeux.length}`,
      recettesAvecMinuteursDansLesEtapes: `${echantillon.filter((r) => (r.steps ?? []).some((s: any) => (s.timers ?? []).length > 0)).length}/${echantillon.length}`,
    };
  })(),
  urlPublique: {
    regleTestee: "https://www.hellofresh.fr/recipes/{slug}-{id}",
    conformesSurEchantillon: `${urlConforme}/${echantillon.length}`,
    champPret: "websiteUrl",
  },
  rechercheContreDetail: {
    champsEnPlusDansDetail,
    detailIdentiqueAUnItemDeRecherche: memeContenu,
  },
  champs: inventaire,
};

writeFileSync(join(DOSSIER_DATA, "inventaire-champs.json"), `${JSON.stringify(resultat, null, 2)}\n`, "utf8");

const { champs, ...synthese } = resultat;
console.log(JSON.stringify(synthese, null, 2));
console.log(`\n${champs.length} chemins de champs ecrits dans data/inventaire-champs.json`);
