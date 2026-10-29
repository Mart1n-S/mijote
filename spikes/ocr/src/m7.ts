// Méthode M7 de l'hypothèse 6, recopiée ici pour que ce prototype reste
// autonome (le CLAUDE.md interdit de partager du code entre prototypes).
//
// Rappel de ce qu'elle fait, en une phrase : normalisation du bruit commercial,
// pondération IDF des mots, bonus si le mot le plus discriminant est en tête,
// pénalité sur la part du nom du produit que l'ingrédient n'explique pas,
// exclusion des plats cuisinés, et préférence par défaut pour l'aliment cru.
//
// Seule adaptation pour les tickets : leurs libellés sont **tronqués** à une
// quinzaine de caractères, la fin des mots est coupée net, et les chiffres sont
// souvent collés aux lettres. La normalisation sépare donc les lettres des
// chiffres avant de découper en mots.

export type Candidat = { cle: string; libelle: string; groupe?: string };
export type Suggestion = { cle: string; libelle: string; score: number };

const MOTS_VIDES = new Set([
  "de", "du", "des", "d", "a", "au", "aux", "en", "le", "la", "les", "l", "et", "ou", "avec", "pour",
  "sur", "sous", "par", "sa", "son", "ses", "notre", "nos",
]);

const BRUIT = new Set([
  "g", "kg", "gr", "grs", "ml", "cl", "lot", "sachet", "sachets", "boite", "barquette", "paquet",
  "pot", "piece", "pieces", "portion", "portions", "part", "parts", "srp", "new", "mini", "maxi",
  "xl", "format", "vrac", "bio", "msc", "asc", "aop", "igp", "label", "rouge", "extra", "fin",
  "fins", "sans", "residu", "pesticide", "pesticides", "france", "espagne", "italie", "pologne",
  "bulgarie", "maroc", "egypte", "chili", "perou", "vietnam", "philippines", "benelux", "belgique",
  "non", "importation", "origine", "local", "sud", "est", "ouest", "nord", "cap", "alaska",
  "atlantique", "pacifique", "argentine", "norvege", "islande", "namibie", "bretagne", "selection",
  "picard", "inedite", "inedites", "classique", "classiques",
]);

const MOTS_DE_PLAT = [
  "gratin", "lasagne", "parmentier", "hachis", "risotto", "paella", "curry", "tajine", "soupe",
  "veloute", "potage", "gaspacho", "quiche", "tarte", "tartelette", "pizza", "bowl", "wok",
  "poelee", "mijote", "blanquette", "bourguignon", "chili", "couscous", "nugget", "beignet", "pane",
  "crumble", "glace", "sorbet", "dessert", "mousse", "buche", "macaron", "cookie", "brioche",
  "croissant", "gaufre", "crepe", "blini", "verrine", "canape", "feuillete", "croque", "burger",
  "sandwich", "wrap", "nem", "samoussa", "falafel", "boulette", "cordon", "brandade", "bouchee",
  "puree", "ecrase", "ecrasee", "compote", "confit", "marinade", "fondue", "nappage", "gelifiant",
  "feuillet", "flute", "toast", "stick", "gressin", "biscuit", "cracker", "croustillant", "sable",
  "shortbread", "panini", "focaccia", "pain", "bretzel", "popcorn", "chips", "caramel", "tourte",
  "cake", "tiramisu", "apero", "aperitif", "tapas", "plateau", "assortiment", "coffret", "menu",
  "box", "sauce", "farci", "farcie", "cuisine", "cuisinee", "rillette", "terrine", "pastilla",
  "gyoza", "bun", "donburi", "biryani", "tandoori", "empanada", "chausson", "millefeuille",
  "vacherin", "mochi", "churros", "dauphine", "duchesse", "rissolee", "galette", "panier", "roule",
  "charlotte", "cone", "batonnet", "guimauve", "dragee", "enrobe", "enrobee", "coulis", "nectar",
  "smoothie", "jus", "boisson", "cidre", "sundae", "moelleux", "bagel", "chirashi",
];

const ETATS = ["cru", "cuit", "surgele", "seche", "poudre", "appertise", "grille", "fume"] as const;

export function aplatit(texte: string): string {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Libellés de ticket : les chiffres sont souvent collés aux lettres.
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singulier(mot: string): string {
  if (mot.length > 5 && mot.endsWith("eaux")) return mot.slice(0, -1);
  if (mot.length > 4 && mot.endsWith("aux")) return `${mot.slice(0, -3)}al`;
  if (mot.length > 4 && mot.endsWith("x")) return mot.slice(0, -1);
  if (mot.length > 4 && mot.endsWith("s")) return mot.slice(0, -1);
  return mot;
}

export function mots(texte: string): string[] {
  return aplatit(texte)
    .split(" ")
    .map(singulier)
    .filter((mot) => mot.length >= 3 && !MOTS_VIDES.has(mot) && !BRUIT.has(mot) && !/^\d/.test(mot));
}

function etats(texte: string): Set<string> {
  const aplati = aplatit(texte);
  return new Set(ETATS.filter((etat) => new RegExp(`\\b${etat}`).test(aplati)));
}

function estUnPlat(libelle: string): boolean {
  const aplati = aplatit(libelle);
  return MOTS_DE_PLAT.some((mot) => new RegExp(`\\b${mot}`).test(aplati));
}

export type Contexte = { candidats: Candidat[]; idf: Map<string, number> };

export function prepare(candidats: Candidat[]): Contexte {
  const frequences = new Map<string, number>();
  for (const candidat of candidats) {
    for (const mot of new Set(mots(candidat.libelle))) frequences.set(mot, (frequences.get(mot) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [mot, frequence] of frequences) idf.set(mot, Math.log(candidats.length / (1 + frequence)));
  return { candidats, idf };
}

/** Groupes Ciqual sans ingrédient de recette : plats composés, glaces, infantile. */
const GROUPES_PENALISES = new Set(["01", "08", "11"]);
const GROUPES_CONDITIONNELS = new Set(["06", "07"]);

export function suggere(libelle: string, contexte: Contexte, combien = 3): Suggestion[] {
  const motsRecherche = mots(libelle);
  if (motsRecherche.length === 0) return [];

  const poids = (mot: string) => Math.max(0.05, contexte.idf.get(mot) ?? Math.log(contexte.candidats.length));

  // Le mot exigé doit **exister dans le catalogue**. Sans cette condition, le
  // mot le plus discriminant d'un libellé de facture est sa marque, qui n'est
  // dans aucun catalogue d'ingrédients : plus aucun
  // candidat ne pouvait la contenir, et les 79 lignes de factures rendaient
  // zéro suggestion. Mesuré avant correction.
  const motsConnus = motsRecherche.filter((mot) => contexte.idf.has(mot));
  if (motsConnus.length === 0) return [];
  const motExige = [...motsConnus].sort((a, b) => poids(b) - poids(a))[0];
  const etatsRecherche = etats(libelle);
  const sucreOuBoisson = /sucre|chocolat|confiture|miel|sirop|jus|vin|cidre|biere/.test(aplatit(libelle));

  const notes: Suggestion[] = [];
  for (const candidat of contexte.candidats) {
    const motsCandidat = mots(candidat.libelle);
    const ensemble = new Set(motsCandidat);
    if (!ensemble.has(motExige)) continue;

    const motsPrincipaux = mots(candidat.libelle.split(",")[0]);
    const recouvrement = motsPrincipaux.length === 0
      ? 0
      : motsPrincipaux.filter((mot) => motsRecherche.includes(mot)).length / motsPrincipaux.length;
    if (recouvrement < 0.4) continue;

    let score = motsRecherche.filter((mot) => ensemble.has(mot)).reduce((total, mot) => total + poids(mot), 0);
    if (motsCandidat.slice(0, 2).includes(motExige)) score += 0.5 * poids(motExige);
    const poidsRecherche = motsRecherche.reduce((total, mot) => total + poids(mot), 0);
    score -= 0.8 * (1 - recouvrement) * poidsRecherche;

    if (estUnPlat(candidat.libelle)) score -= 4;
    if (candidat.groupe && GROUPES_PENALISES.has(candidat.groupe)) score -= 4;
    if (candidat.groupe && GROUPES_CONDITIONNELS.has(candidat.groupe) && !sucreOuBoisson) score -= 3;

    const etatsCandidat = etats(candidat.libelle);
    if (etatsRecherche.size > 0) {
      if ([...etatsRecherche].some((etat) => etatsCandidat.has(etat))) score += 1;
      else if (etatsCandidat.size > 0) score -= 0.5;
    } else {
      if (etatsCandidat.has("cru")) score += 1.5;
      for (const transforme of ["cuit", "seche", "poudre", "appertise", "grille", "fume"]) {
        if (etatsCandidat.has(transforme)) score -= 1.5;
      }
    }

    notes.push({ cle: candidat.cle, libelle: candidat.libelle, score });
  }

  return notes.sort((a, b) => b.score - a.score || a.libelle.length - b.libelle.length).slice(0, combien);
}
