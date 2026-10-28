// Complement de l'hypothese 5 : la table Ciqual de l'ANSES couvre-t-elle les
// ingredients qui n'auront pas de code-barres ? Ce sera la majorite des
// ingredients cote Intermarche, puisqu'on n'y collecte plus rien.
//
// Source : « Table de composition nutritionnelle des aliments Ciqual 2025 »,
// deposee le 19 novembre 2025 sur l'entrepot recherche.data.gouv (DOI
// 10.57745/RDMHWY), sous licence Etalab 2.0. Le jeu de donnees de data.gouv.fr
// est la version 2020, explicitement remplacee.
//
// Pas d'API : ce sont des fichiers a telecharger. On prend les XML, ce qui evite
// d'ajouter une dependance de lecture de tableur :
//   - alim   : la liste des aliments (code et nom) ;
//   - const  : la liste des constituants (code et nom), pour savoir lequel est
//              l'energie, les proteines, etc. ;
//   - compo  : les teneurs, un enregistrement par couple aliment-constituant.
//
// Une fois telecharges, tout le reste se fait hors ligne.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA } from "./garde.ts";

const INGREDIENTS_HELLOFRESH = join(import.meta.dirname, "..", "..", "picard", "data", "ingredients-hellofresh.json");

/** Identifiants des fichiers dans l'entrepot, releves dans les metadonnees. */
const FICHIERS = [
  { id: 666252, nom: "ciqual-alim.xml", role: "aliments" },
  { id: 666246, nom: "ciqual-const.xml", role: "constituants" },
  { id: 666249, nom: "ciqual-compo.xml", role: "teneurs" },
] as const;

/**
 * Constituants retenus, designes par leur code Ciqual plutot que par une regex
 * sur leur libelle : les libelles portent la reference du reglement et l'unite
 * (« Protéines, N x facteur de Jones (g/100 g) »), ce qui rend toute regex
 * fragile. Codes releves dans le fichier des constituants de la version 2025.
 */
const CONSTITUANTS_UTILES: Record<string, string> = {
  "328": "kcal", // Energie, Reglement UE N 1169/2011 (kcal/100 g)
  "25000": "proteines", // Proteines, N x facteur de Jones
  "31000": "glucides",
  "40000": "lipides",
  "32000": "sucres",
  "34100": "fibres",
  "10004": "sel", // Sel chlorure de sodium
};

function balise(bloc: string, nom: string): string | null {
  const trouve = new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`).exec(bloc);
  return trouve ? trouve[1].trim() : null;
}

function normalise(texte: string): string {
  return texte
    .toLowerCase()
    // Les ligatures ne sont pas decomposees par NFD : sans ce remplacement,
    // « oeuf » ecrit avec la ligature devient « uf » et ne correspond a rien.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MOTS_VIDES = new Set([
  "de", "du", "des", "d", "a", "au", "aux", "en", "le", "la", "les", "l", "et", "ou", "sans", "avec",
  "cru", "crue", "cuit", "cuite", "frais", "fraiche", "surgele", "surgelee", "nature", "bio",
  "appertise", "egoutte", "non", "precise", "moyen", "moyenne", "type", "pour", "sur", "plat",
]);

function motsUtiles(texte: string): string[] {
  return normalise(texte)
    .split(" ")
    .map((mot) => (mot.length > 4 && mot.endsWith("s") ? mot.slice(0, -1) : mot))
    .filter((mot) => mot.length >= 3 && !MOTS_VIDES.has(mot));
}

async function telecharge(garde: Garde): Promise<void> {
  for (const fichier of FICHIERS) {
    if (existsSync(join(DOSSIER_DATA, fichier.nom))) {
      console.log(`${fichier.nom} deja present, telechargement evite.`);
      continue;
    }
    console.log(`Telechargement de ${fichier.role} (${fichier.nom})...`);
    await garde.recupere(
      `https://entrepot.recherche.data.gouv.fr/api/access/datafile/${fichier.id}`,
      fichier.nom,
      "application/xml, text/xml, */*",
    );
  }
}

function principal(): void {
  const aliments = readFileSync(join(DOSSIER_DATA, "ciqual-alim.xml"), "utf8");
  const constituants = readFileSync(join(DOSSIER_DATA, "ciqual-const.xml"), "utf8");
  const teneurs = readFileSync(join(DOSSIER_DATA, "ciqual-compo.xml"), "utf8");

  // 1. Les aliments : code et nom francais.
  const listeAliments = [...aliments.matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)].map((bloc) => ({
    code: balise(bloc[1], "alim_code") ?? "",
    nom: (balise(bloc[1], "alim_nom_fr") ?? "").replace(/&apos;/g, "'").replace(/&amp;/g, "&"),
    groupe: balise(bloc[1], "alim_ssssgrp_nom_fr") ?? balise(bloc[1], "alim_grp_nom_fr") ?? "",
  }));

  // 2. Les constituants : on repere ceux dont on a besoin.
  const listeConstituants = [...constituants.matchAll(/<CONST>([\s\S]*?)<\/CONST>/g)].map((bloc) => ({
    code: balise(bloc[1], "const_code") ?? "",
    nom: (balise(bloc[1], "const_nom_fr") ?? "").replace(/&apos;/g, "'"),
  }));
  const codesUtiles = new Map<string, string>(Object.entries(CONSTITUANTS_UTILES));
  const manquants = [...codesUtiles.keys()].filter((code) => !listeConstituants.some((c) => c.code === code));
  if (manquants.length > 0) {
    throw new Error(`Constituants introuvables dans la table : ${manquants.join(", ")}. La version a change.`);
  }

  // 3. Les teneurs, uniquement pour les constituants retenus.
  const parAliment = new Map<string, Record<string, string>>();
  for (const bloc of teneurs.matchAll(/<COMPO>([\s\S]*?)<\/COMPO>/g)) {
    const codeConst = balise(bloc[1], "const_code") ?? "";
    const cle = codesUtiles.get(codeConst);
    if (!cle) continue;
    const codeAlim = balise(bloc[1], "alim_code") ?? "";
    const valeur = balise(bloc[1], "teneur") ?? "";
    if (!parAliment.has(codeAlim)) parAliment.set(codeAlim, {});
    parAliment.get(codeAlim)![cle] = valeur;
  }

  // 4. Couverture des 87 ingredients HelloFresh, par rapprochement textuel.
  const ingredients: { nom: string }[] = JSON.parse(readFileSync(INGREDIENTS_HELLOFRESH, "utf8"));
  const indexAliments = listeAliments.map((aliment) => ({ ...aliment, mots: new Set(motsUtiles(aliment.nom)) }));

  const rapprochements = ingredients.map((ingredient) => {
    const mots = motsUtiles(ingredient.nom);
    const tete = mots[0];
    const candidats = indexAliments
      .filter((aliment) => tete !== undefined && aliment.mots.has(tete))
      .map((aliment) => ({
        code: aliment.code,
        nom: aliment.nom,
        groupe: aliment.groupe,
        score: mots.filter((mot) => aliment.mots.has(mot)).length,
      }))
      .sort((a, b) => b.score - a.score || a.nom.length - b.nom.length);

    const meilleur = candidats[0] ?? null;
    const valeurs = meilleur ? (parAliment.get(meilleur.code) ?? {}) : {};
    const chiffrees = Object.entries(valeurs).filter(([, v]) => /^[\d,.]+$/.test(v.replace(/\s/g, "")));

    return {
      ingredient: ingredient.nom,
      candidats: candidats.length,
      meilleur,
      valeursTrouvees: Object.fromEntries(valeurs ? Object.entries(valeurs) : []),
      nutrimentsChiffres: chiffrees.length,
    };
  });

  const couverts = rapprochements.filter((r) => r.meilleur !== null);
  const avecLesQuatre = couverts.filter((r) =>
    ["kcal", "proteines", "glucides", "lipides"].every((cle) =>
      /^[\d,.]+$/.test(String((r.valeursTrouvees as Record<string, string>)[cle] ?? "").replace(/\s/g, "")),
    ),
  );

  const synthese = {
    analyseLe: new Date().toISOString(),
    source: "Ciqual 2025 (ANSES), DOI 10.57745/RDMHWY, licence Etalab 2.0",
    aliments: listeAliments.length,
    constituants: listeConstituants.length,
    constituantsRetenus: Object.fromEntries([...codesUtiles].map(([code, cle]) => [cle, code])),
    alimentsAvecDesTeneursLues: parAliment.size,
    ingredientsHelloFresh: ingredients.length,
    avecUnRapprochementAutomatique: `${couverts.length}/${ingredients.length}`,
    dontAvecLesQuatreValeurs: `${avecLesQuatre.length}/${ingredients.length}`,
    sansAucunCandidat: rapprochements.filter((r) => r.meilleur === null).map((r) => r.ingredient),
  };

  writeFileSync(
    join(DOSSIER_DATA, "ciqual.json"),
    `${JSON.stringify({ synthese, rapprochements }, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(synthese, null, 2));
}

async function demarre(): Promise<void> {
  const garde = new Garde();
  await telecharge(garde);
  principal();
}

demarre().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.message}`);
  process.exitCode = 1;
});
