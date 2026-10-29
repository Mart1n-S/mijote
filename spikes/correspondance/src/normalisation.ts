// Couches de normalisation du texte, de la plus simple a la plus specifique.
// Elles sont separees pour qu'une methode puisse n'en activer qu'une partie et
// qu'on mesure l'apport de chacune.

/** Minuscules, ligatures, accents, ponctuation. */
export function aplatit(texte: string): string {
  return texte
    .toLowerCase()
    // Les ligatures ne sont pas decomposees par NFD : « œuf » deviendrait « uf ».
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pluriel francais traite grossierement : suffisant pour des noms de produits.
 *
 * Piege rencontre : une regle « -aux devient -al » (chevaux, journaux) ecrase
 * les pluriels en « -eaux », et « poireaux » devenait « poireal ». Plus aucun
 * produit ne correspondait a l'ingredient « Poireau ». L'ordre des regles
 * compte donc : « -eaux » d'abord.
 */
export function singulier(mot: string): string {
  if (mot.length > 5 && mot.endsWith("eaux")) return mot.slice(0, -1);
  if (mot.length > 4 && mot.endsWith("aux")) return `${mot.slice(0, -3)}al`;
  if (mot.length > 4 && mot.endsWith("x")) return mot.slice(0, -1);
  if (mot.length > 4 && mot.endsWith("s")) return mot.slice(0, -1);
  return mot;
}

/** Mots de liaison, sans valeur discriminante. */
const MOTS_VIDES = new Set([
  "de", "du", "des", "d", "a", "au", "aux", "en", "le", "la", "les", "l", "et", "ou", "avec", "pour",
  "sur", "sous", "par", "sa", "son", "ses", "notre", "nos", "the", "of",
]);

/**
 * Bruit propre aux libelles Picard : formats, origines, labels, mentions
 * commerciales. Ces mots sont presents sur un produit sur deux et n'aident
 * jamais a reconnaitre un ingredient.
 */
const BRUIT_PICARD = new Set([
  // conditionnements et quantites
  "g", "kg", "gr", "grs", "ml", "cl", "l", "lot", "sachet", "sachets", "boite", "barquette",
  "paquet", "pot", "piece", "pieces", "portion", "portions", "tranche", "tranches", "part", "parts",
  "x", "srp", "new", "mini", "maxi", "xl", "format", "vrac", "prefrit", "prefrites",
  // « cuit » et « precuit » ont ete retires de cette liste : ils decrivent
  // l'etat de l'aliment, et les traiter comme du bruit empechait tout accord
  // d'etat (« Riz precuit » ne trouvait plus « Riz blanc, precuit, cuit »).
  // labels, certifications, origines frequentes
  "bio", "msc", "asc", "aop", "igp", "label", "rouge", "extra", "fin", "fins", "sans", "residu",
  "pesticide", "pesticides", "france", "espagne", "italie", "pologne", "bulgarie", "maroc", "egypte",
  "chili", "perou", "equateur", "vietnam", "philippines", "benelux", "belgique", "ue", "non",
  "importation", "origine", "local", "sud", "est", "ouest", "nord", "cap", "alaska", "atlantique",
  "pacifique", "argentine", "norvege", "islande", "namibie", "canadien", "bretagne", "selection",
  "picard", "inedite", "inedites", "classique", "classiques",
]);

export type Options = {
  singulariser?: boolean;
  retirerMotsVides?: boolean;
  retirerBruitPicard?: boolean;
  longueurMinimum?: number;
};

export function mots(texte: string, options: Options = {}): string[] {
  const { singulariser = true, retirerMotsVides = true, retirerBruitPicard = false, longueurMinimum = 3 } = options;

  let liste = aplatit(texte).split(" ").filter(Boolean);
  if (singulariser) liste = liste.map(singulier);
  liste = liste.filter((mot) => mot.length >= longueurMinimum || /^\d+$/.test(mot) === false);
  liste = liste.filter((mot) => mot.length >= longueurMinimum);
  if (retirerMotsVides) liste = liste.filter((mot) => !MOTS_VIDES.has(mot));
  if (retirerBruitPicard) liste = liste.filter((mot) => !BRUIT_PICARD.has(mot) && !/^\d/.test(mot));
  return liste;
}

/**
 * Ingredient canonique : on retire ce qui qualifie l'achat plutot que l'aliment.
 * « Filet de poulet Label Rouge » devient « filet poulet », « (Mini) Concombre »
 * devient « concombre », « Vinaigre de vin rouge ou de cidre » devient
 * « vinaigre vin rouge » (la premiere variante, le « ou » coupe le reste).
 */
export function canonique(nom: string): string {
  let texte = nom;
  texte = texte.replace(/\([^)]*\)/g, " "); // parentheses
  texte = texte.split(/\bou\b/i)[0]; // premiere variante seulement
  texte = texte.split("/")[0];
  texte = texte.replace(/\b(label rouge|bio|frais|fraiche|surgele[e]?|en poudre|en sachet|sechee?|moulu[e]?)\b/gi, " ");
  // Mots d'unite ou de conditionnement : ils decrivent la quantite, pas
  // l'aliment, et ils sont souvent plus rares donc plus lourds que l'aliment
  // lui-meme. « Gousse d'ail » proposait « Vanille, gousse » parce que
  // « gousse » pesait plus que « ail ».
  texte = texte.replace(/\b(gousses?|brins?|bottes?|pincees?|feuilles?|batons?|cuilleres?)\b/gi, " ");
  return texte.replace(/\s+/g, " ").trim();
}

/** Etats possibles d'un aliment, utiles pour choisir la bonne ligne Ciqual. */
export const ETATS = ["cru", "cuit", "surgele", "seche", "poudre", "appertise", "grille", "fume"] as const;
export type Etat = (typeof ETATS)[number];

export function etatsPresents(texte: string): Set<Etat> {
  const aplati = aplatit(texte);
  const trouves = new Set<Etat>();
  for (const etat of ETATS) {
    if (new RegExp(`\\b${etat}`).test(aplati)) trouves.add(etat);
  }
  return trouves;
}

/** Trigrammes de caracteres, pour une similarite insensible aux variations. */
export function trigrammes(texte: string): Set<string> {
  const aplati = ` ${aplatit(texte).replace(/\s+/g, " ")} `;
  const sortie = new Set<string>();
  for (let i = 0; i + 3 <= aplati.length; i += 1) sortie.add(aplati.slice(i, i + 3));
  return sortie;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let communs = 0;
  for (const element of a) if (b.has(element)) communs += 1;
  return communs / (a.size + b.size - communs);
}
