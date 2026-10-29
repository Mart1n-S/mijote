// Charge, sans aucune requete reseau, les trois corpus de l'hypothese 6 depuis
// les data/ des prototypes precedents. On recopie des donnees deja collectees,
// on ne partage pas de code : les prototypes restent autonomes.
//
// Ce que l'on a, et ce que l'on n'a pas :
//   - les 87 ingredients HelloFresh, avec l'indication « livre par HelloFresh »
//     qui distingue un ingredient a acheter d'un produit de placard ;
//   - les 1 605 produits Picard, mais seulement par le **slug de leur URL** :
//     les noms reels n'existent que pour les 50 fiches reellement recuperees ;
//   - le rayon Picard n'existe que pour 10 produits, ce qui interdit de filtrer
//     les plats cuisines par categorie cote Picard ;
//   - les 3 484 aliments Ciqual avec leur **code de groupe**, disponible pour
//     tous, ce qui permet au contraire un vrai filtrage par categorie.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(import.meta.dirname, "..", "..");
const DATA_PICARD = join(RACINE, "picard", "data");
const DATA_OFF = join(RACINE, "open-food-facts", "data");

export type Ingredient = {
  nom: string;
  slug: string;
  type: string;
  /** false pour les produits de placard (sel, huile, farine) que HelloFresh ne livre pas. */
  aAcheter: boolean;
};

export type Produit = {
  /** Identifiant Picard, extrait de l'URL. */
  id: string;
  /** Slug de l'URL, seule designation disponible pour les 1 605 produits. */
  slug: string;
  /** Nom reel, connu seulement pour les 50 fiches recuperees. */
  nom: string | null;
  url: string;
};

export type Aliment = {
  code: string;
  nom: string;
  /** Code de groupe Ciqual de premier niveau, voir GROUPES. */
  groupe: string;
};

/**
 * Groupes Ciqual de premier niveau, identifies a partir du contenu des fichiers
 * (le fichier des libelles de groupes n'a pas ete telecharge, et cette
 * hypothese interdit toute nouvelle requete).
 */
export const GROUPES: Record<string, string> = {
  "00": "aliment moyen",
  "01": "entrées et plats composés",
  "02": "fruits, légumes, légumineuses et oléagineux",
  "03": "produits céréaliers",
  "04": "viandes, poissons et œufs",
  "05": "produits laitiers et fromages",
  "06": "boissons",
  "07": "produits sucrés",
  "08": "glaces et sorbets",
  "09": "matières grasses",
  "10": "aides culinaires et ingrédients divers",
  "11": "aliments infantiles",
};

/** Groupes qui ne contiennent pas d'ingredient de recette, sauf exception. */
export const GROUPES_PENALISES = new Set(["01", "08", "11"]);
/** Groupes a penaliser seulement si l'ingredient n'est pas lui-meme de ce type. */
export const GROUPES_CONDITIONNELS = new Set(["06", "07"]);

function lit(chemin: string): any {
  if (!existsSync(chemin)) throw new Error(`Donnees absentes : ${chemin}`);
  return JSON.parse(readFileSync(chemin, "utf8"));
}

function balise(bloc: string, nom: string): string | null {
  const trouve = new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`).exec(bloc);
  return trouve ? trouve[1].trim() : null;
}

export function chargeIngredients(): Ingredient[] {
  const brut = lit(join(DATA_PICARD, "ingredients-hellofresh.json")) as {
    nom: string;
    slug: string;
    type: string;
    livreParHelloFresh: boolean;
  }[];
  return brut.map((i) => ({ nom: i.nom, slug: i.slug, type: i.type, aAcheter: i.livreParHelloFresh }));
}

const MOTIF_PRODUIT = /\/produits\/(.+)-(\d{10,})\.html$/;

export function chargeProduits(): Produit[] {
  const urls = lit(join(DATA_PICARD, "sitemap-urls.json")) as { url: string }[];

  // Noms reels des 50 fiches recuperees, indexes par identifiant.
  const nomsConnus = new Map<string, string>();
  const codes = join(DATA_PICARD, "codes-barres.json");
  if (existsSync(codes)) {
    for (const fiche of lit(codes).fiches ?? []) {
      const trouve = typeof fiche.url === "string" ? MOTIF_PRODUIT.exec(fiche.url) : null;
      if (trouve && typeof fiche.nom === "string") nomsConnus.set(trouve[2], fiche.nom);
    }
  }

  const produits: Produit[] = [];
  for (const entree of urls) {
    const trouve = MOTIF_PRODUIT.exec(entree.url);
    if (!trouve) continue;
    produits.push({ id: trouve[2], slug: trouve[1], nom: nomsConnus.get(trouve[2]) ?? null, url: entree.url });
  }
  return produits;
}

export function chargeAliments(): Aliment[] {
  const xml = readFileSync(join(DATA_OFF, "ciqual-alim.xml"), "utf8");
  const aliments: Aliment[] = [];
  for (const bloc of xml.matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
    const code = balise(bloc[1], "alim_code");
    const nom = balise(bloc[1], "alim_nom_fr");
    const groupe = balise(bloc[1], "alim_grp_code");
    if (code && nom) {
      aliments.push({
        code,
        nom: nom.replace(/&apos;/g, "'").replace(/&amp;/g, "&"),
        groupe: groupe ?? "",
      });
    }
  }
  return aliments;
}

/**
 * Partage deterministe des ingredients entre reglage et controle : rang
 * alphabetique modulo 3. Les 29 de controle ne servent jamais a mettre au point
 * une methode, seulement a mesurer, pour ne pas surajuster sur 87 exemples.
 */
export function partage(ingredients: Ingredient[]): { reglage: Ingredient[]; controle: Ingredient[] } {
  const tries = [...ingredients].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const reglage: Ingredient[] = [];
  const controle: Ingredient[] = [];
  for (const [rang, ingredient] of tries.entries()) {
    if (rang % 3 === 2) controle.push(ingredient);
    else reglage.push(ingredient);
  }
  return { reglage, controle };
}
