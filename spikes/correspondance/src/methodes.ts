// Les six methodes de rapprochement, en couches cumulatives : chacune ajoute un
// mecanisme a la precedente, ce qui permet de mesurer l'apport de chaque idee
// plutot que de livrer une boite noire.
//
//   M0  la methode naive de l'hypothese 3, telle quelle, comme point de depart
//   M1  normalisation : singulier, mots vides, et surtout le bruit des libelles
//       Picard (formats, origines, labels)
//   M2  ingredient canonique : on retire ce qui qualifie l'achat et non l'aliment
//   M3  ponderation : IDF, bonus de position, et penalite sur les mots du produit
//       absents de l'ingredient (c'est ce qui doit ecarter « ecrasee de pommes de
//       terre a l'huile d'olive » propose pour « huile d'olive »)
//   M4  exclusion des plats cuisines et prise en compte de l'etat
//   M5  trigrammes de caracteres en departage et en repli

import { GROUPES_CONDITIONNELS, GROUPES_PENALISES } from "./corpus.ts";
import { aplatit, canonique, etatsPresents, jaccard, mots, trigrammes } from "./normalisation.ts";

export type Element = {
  cle: string;
  /** Libelle utilise pour le rapprochement. */
  libelle: string;
  /** Code de groupe, pour les sources qui en ont un (Ciqual). */
  groupe?: string;
};

export type Suggestion = { cle: string; libelle: string; score: number };

export type Reglages = {
  nom: string;
  /** Retirer le bruit des libelles (formats, origines, labels). */
  bruit: boolean;
  /** Reduire l'ingredient a sa forme canonique. */
  canonique: boolean;
  /** Ponderer par l'IDF, recompenser la position, penaliser les mots en trop. */
  ponderation: boolean;
  /** Ecarter les plats cuisines et tenir compte de l'etat. */
  plats: boolean;
  /** Utiliser les trigrammes en departage et en repli. */
  trigrammes: boolean;
  /**
   * Exiger que l'ingredient explique une part minimale des mots du produit.
   *
   * Pourquoi cette couche existe : la calibration d'un seuil de score a montre
   * que, cote Picard, les scores se chevauchent et s'inversent. Une bonne
   * premiere suggestion score 3 a 6, alors qu'un ingredient sans equivalent
   * (« huile d'olive », que Picard ne vend pas) monte a 8,9, parce que des
   * dizaines de plats contiennent le mot. Un seuil absolu est donc inutilisable.
   * Le signal qui separe les deux populations est la **part du nom du produit
   * que l'ingredient explique** : « huile-olive » vaut 1, et
   * « ecrasee-pommes-terre-huile-olive » vaut 0,4.
   */
  recouvrementMinimum?: number;
  /**
   * Deux corrections mesurees sur le jeu de reglage :
   *   - **etat par defaut** : un ingredient de recette s'achete cru. Quand
   *     l'ingredient ne precise aucun etat, « Epinard, cuit » passait devant
   *     « Epinard, cru », et « Pomme, seche » devant « Pomme, crue » ;
   *   - **penalite normalisee** : la penalite absolue sur les mots en trop
   *     punit les noms longs et descriptifs, donc « Farine de ble tendre ou
   *     froment T65 » perdait contre « Farine de riz ». On penalise desormais
   *     la **part** de nom non expliquee, pas la somme de ses mots.
   */
  etatParDefaut?: boolean;
};

export const METHODES: Reglages[] = [
  { nom: "M0 naïve", bruit: false, canonique: false, ponderation: false, plats: false, trigrammes: false },
  { nom: "M1 normalisation", bruit: true, canonique: false, ponderation: false, plats: false, trigrammes: false },
  { nom: "M2 canonique", bruit: true, canonique: true, ponderation: false, plats: false, trigrammes: false },
  { nom: "M3 pondération", bruit: true, canonique: true, ponderation: true, plats: false, trigrammes: false },
  { nom: "M4 plats et état", bruit: true, canonique: true, ponderation: true, plats: true, trigrammes: false },
  { nom: "M5 trigrammes", bruit: true, canonique: true, ponderation: true, plats: true, trigrammes: true },
  {
    nom: "M6 recouvrement",
    bruit: true,
    canonique: true,
    ponderation: true,
    plats: true,
    trigrammes: true,
    // Seuil calibre sur le jeu de reglage uniquement.
    recouvrementMinimum: 0.4,
  },
  {
    nom: "M7 état par défaut",
    bruit: true,
    canonique: true,
    ponderation: true,
    plats: true,
    trigrammes: true,
    recouvrementMinimum: 0.4,
    etatParDefaut: true,
  },
];

/**
 * Mots qui trahissent un plat cuisine, un dessert ou une preparation, dans un
 * libelle Picard. Le rayon n'etant connu que pour 10 produits sur 1 605, c'est
 * le seul filtre categoriel possible de ce cote.
 */
const MOTS_DE_PLAT = [
  "gratin", "lasagne", "parmentier", "hachis", "risotto", "paella", "curry", "tajine", "chakchouka",
  "soupe", "veloute", "potage", "gaspacho", "quiche", "tarte", "tartelette", "pizza", "bowl", "wok",
  "poelee", "mijote", "blanquette", "bourguignon", "chili", "couscous", "nugget", "beignet", "pane",
  "crumble", "glace", "sorbet", "dessert", "mousse", "buche", "macaron", "cookie", "brioche",
  "croissant", "gaufre", "crepe", "blini", "verrine", "canape", "feuillete", "croque", "burger",
  "sandwich", "wrap", "nem", "samoussa", "falafel", "boulette", "cordon", "brandade", "bouchee",
  "puree", "ecrase", "ecrasee", "compote", "confit", "marinade", "fondue", "nappage", "gelifiant",
  "feuillet", "flute", "toast", "stick", "gressin", "biscuit", "cracker", "croustillant", "sable",
  "shortbread", "panini", "focaccia", "pain", "bretzel", "popcorn", "chips", "caramel",
  "tourte", "friand", "cake", "clafoutis", "tiramisu", "panna", "aperitif", "apero", "tapas",
  "plateau", "assortiment", "coffret", "menu", "box", "sauce", "farci", "farcie", "cuisine",
  "cuisinee", "rillette", "terrine", "pastilla", "gyoza", "bun", "donburi", "japchae", "biryani",
  "tandoori", "bulgogi", "amlou", "colombo", "cari", "rougail", "empanada", "chausson", "millefeuille",
  "vacherin", "magnum", "solero", "mochi", "churros", "dauphine", "duchesse", "noisette", "rissolee",
  "galette", "panier", "roule", "charlotte", "cone", "batonnet", "bat", "guimauve", "dragee",
  "enrobe", "enrobee", "coulis", "nectar", "smoothie", "jus", "boisson", "tea", "water", "cidre",
  "kombucha", "pulco", "volvic", "lipton", "fuze", "lorina", "sundae", "lunette", "moelleux",
  "hotteok", "naanwich", "chapati", "bagel", "chirashi", "mac", "cheese", "endive", "aligot",
];

function estUnPlat(libelle: string): boolean {
  const aplati = aplatit(libelle);
  return MOTS_DE_PLAT.some((mot) => new RegExp(`\\b${mot}`).test(aplati));
}

/** Frequence documentaire de chaque mot du corpus, pour ponderer par l'IDF. */
export function construitIdf(elements: Element[], bruit: boolean): Map<string, number> {
  const frequences = new Map<string, number>();
  for (const element of elements) {
    for (const mot of new Set(mots(element.libelle, { retirerBruitPicard: bruit }))) {
      frequences.set(mot, (frequences.get(mot) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [mot, frequence] of frequences) idf.set(mot, Math.log(elements.length / (1 + frequence)));
  return idf;
}

export type Contexte = { elements: Element[]; idf: Map<string, number> };

export function prepare(elements: Element[], reglages: Reglages): Contexte {
  return { elements, idf: construitIdf(elements, reglages.bruit) };
}

/** Poids d'un mot : son IDF, ou 1 si la ponderation est desactivee. */
function poids(mot: string, contexte: Contexte, reglages: Reglages): number {
  if (!reglages.ponderation) return 1;
  return Math.max(0.05, contexte.idf.get(mot) ?? Math.log(contexte.elements.length));
}

export function suggere(
  nomIngredient: string,
  contexte: Contexte,
  reglages: Reglages,
  combien = 3,
): Suggestion[] {
  const texteIngredient = reglages.canonique ? canonique(nomIngredient) : nomIngredient;
  const motsIngredient = mots(texteIngredient, { retirerBruitPicard: reglages.bruit });
  if (motsIngredient.length === 0) return [];

  // Mot exige : le premier mot pour les methodes naives, le plus discriminant
  // des que l'on dispose de l'IDF. « Filet de poulet » doit exiger « poulet »,
  // pas « filet ».
  //
  // Correction venue de l'hypothese 7 : le mot exige doit **exister dans le
  // catalogue vise**. Sans cette condition, un libelle qui porte une marque
  // (« PETIT NAVIRE - Thon entier ») exige le mot le plus rare, c'est-a-dire la
  // marque, qui n'est dans aucun catalogue d'ingredients : aucun candidat ne
  // peut la contenir et la methode se tait a tort. Mesure a l'appui : les
  // 79 lignes de factures drive rendaient zero suggestion avant correction.
  const motsConnus = reglages.ponderation
    ? motsIngredient.filter((mot) => contexte.idf.has(mot))
    : motsIngredient;
  if (motsConnus.length === 0) return [];
  const motExige = reglages.ponderation
    ? [...motsConnus].sort((a, b) => poids(b, contexte, reglages) - poids(a, contexte, reglages))[0]
    : motsConnus[0];

  const etatsIngredient = etatsPresents(nomIngredient);
  const trigrammesIngredient = reglages.trigrammes ? trigrammes(texteIngredient) : null;
  const ingredientEstSucreOuBoisson = /sucre|chocolat|confiture|miel|sirop|jus|vin|cidre|biere/i.test(
    aplatit(nomIngredient),
  );

  const notes: Suggestion[] = [];

  for (const element of contexte.elements) {
    const motsElement = mots(element.libelle, { retirerBruitPicard: reglages.bruit });
    const ensemble = new Set(motsElement);
    if (!ensemble.has(motExige)) continue;

    const communs = motsIngredient.filter((mot) => ensemble.has(mot));

    // Part des mots du produit que l'ingredient explique, calculee sur la
    // **partie principale du nom**, avant la premiere virgule. Les libelles
    // Ciqual ont la forme « Aliment, etat, precision » : sur le libelle entier,
    // « Champignon de Paris ou champignon de couche, cru » n'etait explique
    // qu'en partie par « champignons de Paris », et la bonne reponse se faisait
    // ecarter. Les slugs Picard n'ont pas de virgule, le calcul est inchange
    // pour eux.
    const motsPrincipaux = mots(element.libelle.split(",")[0], { retirerBruitPicard: reglages.bruit });
    const recouvrement = motsPrincipaux.length === 0
      ? 0
      : motsPrincipaux.filter((mot) => motsIngredient.includes(mot)).length / motsPrincipaux.length;
    if (reglages.recouvrementMinimum !== undefined && recouvrement < reglages.recouvrementMinimum) continue;

    let score = communs.reduce((total, mot) => total + poids(mot, contexte, reglages), 0);

    if (reglages.ponderation) {
      // Bonus de position : les libelles commencent par la nature du produit.
      if (motsElement.slice(0, 2).includes(motExige)) score += 0.5 * poids(motExige, contexte, reglages);

      // Penalite sur les mots du produit absents de l'ingredient : c'est ce qui
      // distingue « huile olive » de « ecrasee pomme terre huile olive ».
      if (reglages.etatParDefaut) {
        // Penalite normalisee : on punit la part de nom non expliquee, pas la
        // somme de ses mots, pour ne pas desavantager les noms descriptifs.
        const poidsIngredient = motsIngredient.reduce((total, mot) => total + poids(mot, contexte, reglages), 0);
        score -= 0.8 * (1 - recouvrement) * poidsIngredient;
      } else {
        const enTrop = motsElement.filter((mot) => !motsIngredient.includes(mot));
        score -= 0.35 * enTrop.reduce((total, mot) => total + poids(mot, contexte, reglages), 0);
      }
    }

    if (reglages.plats) {
      if (estUnPlat(element.libelle)) score -= 4;
      if (element.groupe && GROUPES_PENALISES.has(element.groupe)) score -= 4;
      if (element.groupe && GROUPES_CONDITIONNELS.has(element.groupe) && !ingredientEstSucreOuBoisson) score -= 3;

      // Etat : si l'ingredient dit « sechee » ou « precuit », un produit du meme
      // etat est prefere, et un etat contraire est penalise.
      const etatsElement = etatsPresents(element.libelle);
      if (etatsIngredient.size > 0) {
        const commun = [...etatsIngredient].some((etat) => etatsElement.has(etat));
        if (commun) score += 1;
        else if (etatsElement.size > 0) score -= 0.5;
      } else if (reglages.etatParDefaut) {
        // L'ingredient ne dit rien de son etat : on prefere l'aliment cru ou
        // frais, et on ecarte les formes transformees.
        if (etatsElement.has("cru")) score += 1.5;
        for (const transforme of ["cuit", "seche", "poudre", "appertise", "grille", "fume"] as const) {
          if (etatsElement.has(transforme)) score -= 1.5;
        }
      }
    }

    if (reglages.trigrammes && trigrammesIngredient) {
      score += 1.5 * jaccard(trigrammesIngredient, trigrammes(element.libelle));
    }

    notes.push({ cle: element.cle, libelle: element.libelle, score });
  }

  // Repli par trigrammes quand aucun mot ne correspond : utile pour les
  // orthographes qui divergent, inutile de proposer trois absurdites sinon.
  if (notes.length === 0 && reglages.trigrammes && trigrammesIngredient) {
    for (const element of contexte.elements) {
      const similarite = jaccard(trigrammesIngredient, trigrammes(element.libelle));
      if (similarite >= 0.45) notes.push({ cle: element.cle, libelle: element.libelle, score: similarite });
    }
  }

  return notes
    .sort((a, b) => b.score - a.score || a.libelle.length - b.libelle.length)
    .slice(0, combien);
}
