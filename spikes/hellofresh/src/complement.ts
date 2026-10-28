// Complement a l'inventaire, sans aucun appel reseau : repond a quatre
// questions posees apres la premiere lecture du rapport, en relisant seulement
// le JSON deja present dans data/.
//
// 1. Existe-t-il une notion de saison ? Sinon, createdAt permet-il de la deduire ?
// 2. Comment reconnaitre les variantes d'un meme plat (Label Rouge, sans gluten,
//    complet, precuit) ?
// 3. Peut-on detecter les recettes pour robot de cuisine ?
// 4. cuisines[] et tags couvrent-ils les categories affichees par le site ?

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

type Recette = Record<string, any>;

function lit(fichier: string): any {
  return JSON.parse(readFileSync(join(DOSSIER_DATA, fichier), "utf8"));
}

const echantillon: Recette[] = [...lit("recherche-page-1.json").items, ...lit("recherche-page-2.json").items];

/** Numero de semaine ISO 8601, pour comparer createdAt a la semaine du visuel. */
function semaineIso(date: string): number {
  const d = new Date(date);
  const jeudi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  jeudi.setUTCDate(jeudi.getUTCDate() + 4 - (jeudi.getUTCDay() || 7));
  const debut = Date.UTC(jeudi.getUTCFullYear(), 0, 1);
  return Math.ceil(((jeudi.getTime() - debut) / 86_400_000 + 1) / 7);
}

/** Toutes les valeurs texte d'une recette, avec leur chemin. */
function textes(valeur: unknown, chemin = "", sortie: [string, string][] = []): [string, string][] {
  if (typeof valeur === "string") sortie.push([chemin, valeur]);
  else if (valeur && typeof valeur === "object") {
    for (const [cle, sous] of Object.entries(valeur)) textes(sous, chemin ? `${chemin}.${cle}` : cle, sortie);
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// 1. Saison
// ---------------------------------------------------------------------------

// Aucun champ ne s'appelle « saison » : on le verifie plutot que de l'affirmer.
const cheminsSaison = new Set<string>();
const textesSaison: string[] = [];
for (const recette of echantillon) {
  for (const [chemin, texte] of textes(recette)) {
    if (/saison|season/i.test(chemin)) cheminsSaison.add(chemin);
    if (/saison|season/i.test(texte)) textesSaison.push(chemin);
  }
}

// Le nom de fichier du visuel porte parfois l'annee et la semaine de livraison
// prevue, par exemple HF_Y26_R240_W45_FR_RFR60402-6_main...
const MOTIF_SEMAINE = /_Y(\d{2})_R(\d+)_W(\d+)_([A-Z]{2})_/;
const semainesVisuel = echantillon
  .map((r) => {
    const trouve = MOTIF_SEMAINE.exec(String(r.imagePath));
    if (!trouve) return null;
    const semaineCreation = semaineIso(r.createdAt as string);
    return {
      annee: Number(trouve[1]),
      semaineVisuel: Number(trouve[3]),
      semaineCreation,
      ecartEnSemaines: Number(trouve[3]) - semaineCreation,
    };
  })
  .filter((v): v is NonNullable<typeof v> => v !== null);

const ecarts = semainesVisuel.map((s) => s.ecartEnSemaines).sort((a, b) => a - b);
const tagsEvenement = new Set<string>();
for (const recette of echantillon) {
  for (const tag of recette.tags ?? []) {
    if (["christmas", "lto", "regional-specialty"].includes(tag.type)) tagsEvenement.add(tag.type);
  }
}

const saison = {
  champDedie: cheminsSaison.size > 0 ? [...cheminsSaison] : "aucun",
  mentionsDansDuTexteLibre: textesSaison.length,
  tagsLiesAUnEvenement: [...tagsEvenement],
  semaineLisibleDansLeVisuel: `${semainesVisuel.length}/${echantillon.length}`,
  ecartSemaineVisuelMoinsSemaineCreation: {
    minimum: ecarts[0],
    maximum: ecarts.at(-1),
    valeurs: ecarts,
  },
};

// ---------------------------------------------------------------------------
// 2. Variantes d'un meme plat
// ---------------------------------------------------------------------------

// `uniqueRecipeCode` a la forme PREFIXE[-SS-n|-SP-n]-suffixe. L'infixe semble
// marquer une variante : on le verifie en comparant les ingredients.
const MOTIF_CODE = /^([A-Z]+\d+)(?:-(SS|SP)-(\d+))?-(.+)$/;

const parPrefixe = new Map<string, Recette[]>();
for (const recette of echantillon) {
  const trouve = MOTIF_CODE.exec(recette.uniqueRecipeCode as string);
  const prefixe = trouve ? trouve[1] : String(recette.uniqueRecipeCode);
  if (!parPrefixe.has(prefixe)) parPrefixe.set(prefixe, []);
  parPrefixe.get(prefixe)!.push(recette);
}

const infixes = new Map<string, number>();
for (const recette of echantillon) {
  const trouve = MOTIF_CODE.exec(recette.uniqueRecipeCode as string);
  const infixe = trouve?.[2] ?? "aucun";
  infixes.set(infixe, (infixes.get(infixe) ?? 0) + 1);
}

const couples = [];
for (const [prefixe, groupe] of parPrefixe) {
  if (groupe.length < 2) continue;
  const base = groupe.find((r) => !MOTIF_CODE.exec(r.uniqueRecipeCode as string)?.[2]);
  for (const autre of groupe) {
    const infixe = MOTIF_CODE.exec(autre.uniqueRecipeCode as string)?.[2];
    if (!infixe || !base) continue;
    const slugsBase: string[] = base.ingredients.map((i: any) => i.slug);
    const slugsVariante: string[] = autre.ingredients.map((i: any) => i.slug);
    couples.push({
      prefixe,
      infixe,
      ingredientRetire: slugsBase.filter((s) => !slugsVariante.includes(s)),
      ingredientAjoute: slugsVariante.filter((s) => !slugsBase.includes(s)),
      memeNom: base.name === autre.name,
      memeHeadline: base.headline === autre.headline,
      memeClonedFrom: base.clonedFrom === autre.clonedFrom,
    });
  }
}

// Meme plat republie d'une semaine a l'autre : meme prefixe, aucun infixe,
// ingredients identiques. A distinguer d'une vraie variante.
const republications = [...parPrefixe.values()]
  .filter((g) => g.length > 1)
  .map((g) => ({
    codes: g.map((r) => r.uniqueRecipeCode),
    nomsDistincts: new Set(g.map((r) => r.name)).size,
    jeuxDIngredientsDistincts: new Set(g.map((r) => r.ingredients.map((i: any) => i.slug).sort().join(","))).size,
    clonedFromDistincts: new Set(g.map((r) => r.clonedFrom)).size,
  }));

const variantes = {
  structureDuCode: "PREFIXE[-SS-n|-SP-n]-suffixe",
  repartitionDesInfixes: Object.fromEntries(infixes),
  couplesBaseVariante: couples,
  groupesDeMemePrefixe: republications,
  clonedFromFiable: republications.every((g) => g.clonedFromDistincts === 1),
};

// ---------------------------------------------------------------------------
// 3. Recettes pour robot de cuisine
// ---------------------------------------------------------------------------

const MOTS_ROBOT = /robot|thermomix|cookidoo|multicuiseur|companion|monsieur cuisine|blender chauffant/i;
const occurrencesRobot: string[] = [];
for (const recette of echantillon) {
  for (const [chemin, texte] of textes(recette)) {
    if (MOTS_ROBOT.test(texte)) occurrencesRobot.push(`${chemin} :: ${texte.slice(0, 60)}`);
  }
}

const vocabulaireUstensiles = new Set<string>();
for (const recette of echantillon) {
  for (const ustensile of recette.utensils ?? []) vocabulaireUstensiles.add(String(ustensile.name));
}

const robot = {
  occurrencesDansTousLesTextes: occurrencesRobot,
  tagsCandidats: [
    ...new Set(
      echantillon.flatMap((r) => (r.tags ?? []).map((t: any) => t.type)).filter((t: string) => MOTS_ROBOT.test(t)),
    ),
  ],
  vocabulaireUstensilesDeLEchantillon: [...vocabulaireUstensiles].sort(),
  ustensilesEnAnglais: [...vocabulaireUstensiles].filter((n) => /mixer|bowl|pan|sheet/i.test(n)),
  recettesPlafonneesA4Portions: echantillon.filter(
    (r) => Math.max(...(r.yields ?? []).map((y: any) => y.yields)) === 4,
  ).length,
  paliersMaximumRencontres: [
    ...new Set(echantillon.map((r) => Math.max(...(r.yields ?? []).map((y: any) => y.yields)))),
  ].sort((a, b) => a - b),
};

// ---------------------------------------------------------------------------
// 4. Categories du site
// ---------------------------------------------------------------------------

const cuisines = new Map<string, number>();
for (const recette of echantillon) {
  for (const c of recette.cuisines ?? []) {
    cuisines.set(`${c.type || "(type vide)"} / ${c.name}`, (cuisines.get(`${c.type || "(type vide)"} / ${c.name}`) ?? 0) + 1);
  }
}

const preferences = new Set<string>();
const typesTags = new Set<string>();
for (const recette of echantillon) {
  for (const tag of recette.tags ?? []) {
    typesTags.add(String(tag.type));
    for (const p of tag.preferences ?? []) preferences.add(String(p));
  }
}

const categories = {
  cuisinesEtOccurrences: Object.fromEntries([...cuisines].sort((a, b) => b[1] - a[1])),
  recettesSansCuisine: echantillon.filter((r) => (r.cuisines ?? []).length === 0).length,
  anomaliesDeVocabulaire: {
    typeVide: [...cuisines.keys()].filter((c) => c.startsWith("(type vide)")),
    typeAvecMajuscule: echantillon
      .flatMap((r) => (r.cuisines ?? []).map((c: any) => String(c.type)))
      .filter((t) => t && t !== t.toLowerCase()),
    nomsEnAnglais: [...cuisines.keys()].filter((c) => /European|Southeast Asian|Moroccan|American/.test(c)),
  },
  typesTags: [...typesTags].sort(),
  preferencesDuSite: [...preferences].sort(),
  difficulteValeursRencontrees: [...new Set(echantillon.map((r) => r.difficulty))].sort(),
  // Les categories citees par le site : couvertes par quel champ ?
  correspondance: {
    italienne: "cuisines[].type = italian",
    mexicaine: "cuisines[], absente de l'echantillon de 20",
    asiatique: "cuisines[].type = japanese, southeast-asian",
    rapide: "tags[].type = quick",
    vegetarienne: "tags[].type = veggie",
    facile: "aucun tag, seulement le champ numerique difficulty",
  },
};

const resultat = { echantillon: echantillon.length, saison, variantes, robot, categories };
writeFileSync(join(DOSSIER_DATA, "complement.json"), `${JSON.stringify(resultat, null, 2)}\n`, "utf8");
console.log(JSON.stringify(resultat, null, 2));
