// Extraction des tickets et des factures, **sans OCR** : les deux formats
// portent une couche de texte, vérifiée à l'étape zéro.
//
// Trois principes :
//
//   1. **Liste blanche de sortie.** Le module ne rend qu'un objet structuré :
//      magasin, date, lignes d'articles, total. Le reste du document (nom,
//      adresse, numéro de fidélité, moyen de paiement) n'est jamais recopié,
//      donc il ne peut pas fuir dans un affichage, un journal ou un fichier.
//      C'est la règle du CLAUDE.md, appliquée par construction.
//
//   2. **Mesure du filtre.** Pour chaque document, on relève les catégories de
//      données personnelles présentes dans le texte brut, puis on vérifie
//      qu'aucune ne ressort dans l'objet rendu. C'est ce double contrôle que
//      l'application devra faire, et c'est lui que le rapport mesure.
//
//   3. **Un format, une fonction.** Le pipeline (découverte, extraction,
//      filtre, mesure) est générique ; seul le découpage en lignes dépend de
//      l'enseigne. Ajouter les tickets Intermarché demandera d'écrire une
//      fonction de découpage, sans toucher au reste.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detecte, verifie, type Categorie } from "./anonymise.ts";
import { lance } from "./outils.ts";

const DOSSIER = join(import.meta.dirname, "..");
export const DATA = join(DOSSIER, "data");
export const REFERENCES = join(DOSSIER, "references");

export type Ligne = {
  libelle: string;
  /** Quantité, quand le document la porte. Les tickets Picard n'en ont pas. */
  quantite: number | null;
  /** Prix payé pour la ligne, en euros. */
  prix: number;
};

export type Document = {
  fichier: string;
  genre: "ticket" | "facture";
  enseigne: string;
  /** Code du magasin ou libellé commercial, jamais une adresse. */
  magasin: string | null;
  date: string | null;
  lignes: Ligne[];
  total: number | null;
  /** Nombre de lignes annoncé par le document, quand il l'indique. */
  lignesAnnoncees: number | null;
};

export type Extraction = {
  document: Document;
  /** Catégories personnelles présentes dans le texte brut, pour la mesure. */
  personnellesDansLeBrut: Categorie[];
  /** Catégories qui auraient fuité dans l'objet rendu : doit rester vide. */
  personnellesEnSortie: Categorie[];
  /** Lignes du brut écartées comme n'étant pas des articles, par motif. */
  lignesEcartees: Record<string, number>;
};

function nombre(texte: string): number {
  return Number.parseFloat(texte.replace(",", "."));
}

/** Couche de texte d'un PDF, mise en page conservée. */
export function texteDuPdf(chemin: string): string {
  return lance("pdftotext", ["-layout", "-enc", "UTF-8", chemin, "-"]).replace(/\r/g, "");
}

/**
 * Motifs des lignes qui ne sont pas des articles. Le nom du motif sert à
 * mesurer la détection, et plusieurs d'entre eux visent précisément les lignes
 * porteuses de données personnelles.
 */
const LIGNES_A_ECARTER: { nom: string; motif: RegExp }[] = [
  { nom: "total", motif: /^\s*TOTAL\b|^\s*Tot\.|^\s*Total\b/i },
  { nom: "TVA", motif: /\bTVA\b|Mt HT|Mt TTC|Tot\.HT|^\s*[A-Z]+\d*\s+\d+,\d+\s*%/i },
  { nom: "moyen de paiement", motif: /\bCB\b|sans contact|esp[èe]ces|titre restaurant|ch[èe]que|payable/i },
  { nom: "fidélité", motif: /points|fid[ée]lit[ée]|Picard & Nous|solde|valables/i },
  { nom: "identité", motif: /^\s*nom\s*:|^\s*(M\.|Mme|Mlle)\s|^\s*n[°o]\s*:/i },
  { nom: "coordonnées du magasin", motif: /SIRET|NAF|ZAC|^\s*\d{5}\s+[A-ZÀ-Ý]|^\s*0\d[\s.]?\d{2}/ },
  { nom: "pied de ticket", motif: /caisse|hash code|empl\b|^\s*-{3,}|nb lignes|vente\s*:|^\s*V\.\s*\d/i },
  { nom: "site et application", motif: /picard\.fr|l'appli|mon compte|profiter/i },
  { nom: "séparateur", motif: /^\s*[-=*]{3,}\s*$/ },
  // Ligne de totaux de TVA sans libellé : seulement des espaces et deux ou
  // trois montants, aucune lettre. « 18,27  1,01  19,28 ».
  { nom: "totaux de TVA sans libellé", motif: /^(?:\s+-?\d+[,.]\d{2}){2,}\s*€?\s*$/ },
];

function ecarte(ligne: string): string | null {
  for (const { nom, motif } of LIGNES_A_ECARTER) {
    if (motif.test(ligne)) return nom;
  }
  return null;
}

/**
 * Découpage d'un ticket Picard dématérialisé.
 *
 * Quatre formes observées sur les trois tickets, la deuxième et la troisième
 * n'apparaissant que sur le ticket du 27 juin :
 *
 *   1. article simple : code de TVA, astérisque facultatif, libellé, prix
 *      aligné à droite, suivi du signe euro ;
 *   2. **article multiplié** : le libellé est seul sur sa ligne, et la ligne
 *      suivante porte « quantité * prix unitaire   prix total » ;
 *   3. **remise** : ligne indentée sans code de TVA, montant négatif ;
 *   4. le code de TVA n'est pas toujours `V` : on a vu `K2` pour un rayon à
 *      20 %, donc le motif accepte n'importe quelle lettre.
 */
export function decoupePicard(texte: string): {
  lignes: Ligne[];
  total: number | null;
  lignesAnnoncees: number | null;
  magasin: string | null;
  date: string | null;
  ecartees: Record<string, number>;
} {
  const lignes: Ligne[] = [];
  const ecartees: Record<string, number> = {};
  let total: number | null = null;
  let lignesAnnoncees: number | null = null;

  // Magasin : le code en tête de ticket, sans l'adresse du siège qui suit.
  const magasin = /^\s*(\d{2,4})\s*-\s*PICARD/im.exec(texte)?.[1] ?? null;
  // Date : la ligne de pied « caisse, date, heure, ticket ».
  const horodatage = /\b(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/.exec(texte);
  const date = horodatage ? `20${horodatage[3]}-${horodatage[2]}-${horodatage[1]}` : null;

  // Le prix est suivi du signe euro, et le libellé est aligné à gauche :
  // « V1     *Libellé du produit          1,99 € ».
  const ARTICLE = /^\s*[A-Z]+\d*\s+\*?\s*(.+?)\s{2,}(-?\d+,\d{2})\s*€?\s*$/;
  /** Libellé seul sur sa ligne, dont la quantité suit. */
  const LIBELLE_SEUL = /^\s*[A-Z]+\d*\s+\*?\s*(\S.*?)\s*$/;
  /** « 3        *        3,75        11,25 € » */
  const QUANTITE = /^\s*(\d+)\s*\*\s*(\d+,\d{2})\s+(-?\d+,\d{2})\s*€?\s*$/;
  /** Remise : pas de code de TVA, montant négatif. */
  const REMISE = /^\s{2,}\S.*?\s+(-\d+,\d{2})\s*€?\s*$/;

  const brutes = texte.split("\n").map((l) => l.trimEnd());
  /** Libellé en attente de sa ligne de quantité. */
  let enAttente: string | null = null;

  for (const [index, ligne] of brutes.entries()) {
    if (ligne.trim() === "") continue;

    // Ligne de quantité : elle complète le libellé mis en attente.
    const quantiteTrouvee = QUANTITE.exec(ligne);
    if (quantiteTrouvee && enAttente !== null) {
      lignes.push({
        libelle: enAttente,
        quantite: Number(quantiteTrouvee[1]),
        prix: nombre(quantiteTrouvee[3]),
      });
      enAttente = null;
      continue;
    }
    // Un libellé en attente sans ligne de quantité derrière est une anomalie :
    // on le compte plutôt que de le perdre en silence.
    if (enAttente !== null) {
      ecartees["libellé sans quantité"] = (ecartees["libellé sans quantité"] ?? 0) + 1;
      enAttente = null;
    }

    const totalTrouve = /^\s*TOTAL\s*\((\d+)\)\s+(\d+,\d{2})/i.exec(ligne);
    if (totalTrouve) {
      lignesAnnoncees = Number(totalTrouve[1]);
      total = nombre(totalTrouve[2]);
      ecartees.total = (ecartees.total ?? 0) + 1;
      continue;
    }

    // Montant négatif : c'est une remise, avant tout autre classement. Elle est
    // écartée des articles mais comptée, car elle explique l'écart entre la
    // somme des articles et le total payé.
    if (/-\d+,\d{2}\s*€?\s*$/.test(ligne) && !/^\s*Tot/i.test(ligne)) {
      ecartees.remise = (ecartees.remise ?? 0) + 1;
      continue;
    }

    const motif = ecarte(ligne);
    if (motif) {
      ecartees[motif] = (ecartees[motif] ?? 0) + 1;
      continue;
    }

    const article = ARTICLE.exec(ligne);
    if (article) {
      lignes.push({ libelle: article[1].trim(), quantite: 1, prix: nombre(article[2]) });
      continue;
    }

    // Remise : montant négatif sans code de TVA. Écartée, mais comptée, car
    // elle explique l'écart entre la somme des articles et le total payé.
    if (REMISE.test(ligne)) {
      ecartees.remise = (ecartees.remise ?? 0) + 1;
      continue;
    }

    // Libellé seul : on ne le retient que si la ligne suivante est bien une
    // ligne de quantité, sinon c'est du texte de pied de ticket.
    if (LIBELLE_SEUL.test(ligne) && QUANTITE.test(brutes[index + 1] ?? "")) {
      enAttente = LIBELLE_SEUL.exec(ligne)![1].trim();
      continue;
    }

    ecartees["non reconnue"] = (ecartees["non reconnue"] ?? 0) + 1;
    if (/\d+,\d{2}/.test(ligne)) {
      ecartees["non reconnue AVEC MONTANT"] = (ecartees["non reconnue AVEC MONTANT"] ?? 0) + 1;
    }
  }

  return { lignes, total, lignesAnnoncees, magasin, date, ecartees };
}

function extraitTicket(fichier: string): Extraction {
  const brut = texteDuPdf(join(DATA, fichier));
  const personnellesDansLeBrut = detecte(brut);
  const decoupe = decoupePicard(brut);

  const document: Document = {
    fichier,
    genre: "ticket",
    enseigne: "Picard",
    magasin: decoupe.magasin,
    date: decoupe.date,
    lignes: decoupe.lignes,
    total: decoupe.total,
    lignesAnnoncees: decoupe.lignesAnnoncees,
  };

  return {
    document,
    personnellesDansLeBrut,
    personnellesEnSortie: verifie(document),
    lignesEcartees: decoupe.ecartees,
  };
}

/** Écrit la référence d'un document : uniquement les champs de la liste blanche. */
function ecritReference(extraction: Extraction): void {
  mkdirSync(REFERENCES, { recursive: true });
  const { document } = extraction;
  const entete = `# ${document.enseigne}\t${document.genre}\tmagasin=${document.magasin ?? ""}\tdate=${document.date ?? ""}\ttotal=${document.total ?? ""}`;
  const corps = document.lignes.map((l) => `${l.libelle}\t${l.quantite ?? ""}\t${l.prix.toFixed(2)}`);
  writeFileSync(join(REFERENCES, `${document.fichier.replace(/\.pdf$/i, "")}.tsv`), `${[entete, ...corps].join("\n")}\n`, "utf8");
}

function principal(): void {
  const tickets = readdirSync(DATA).filter((f) => /\.pdf$/i.test(f)).sort();
  if (tickets.length === 0) throw new Error(`Aucun ticket dans ${DATA}`);

  const extractions = tickets.map((fichier) => extraitTicket(fichier));
  for (const extraction of extractions) ecritReference(extraction);

  const resume = extractions.map((e) => ({
    fichier: e.document.fichier,
    magasin: e.document.magasin,
    date: e.document.date,
    lignes: e.document.lignes.length,
    articles: e.document.lignes.reduce((t, l) => t + (l.quantite ?? 1), 0),
    lignesAnnoncees: e.document.lignesAnnoncees,
    total: e.document.total,
    sommeDesLignes: Number(e.document.lignes.reduce((t, l) => t + l.prix, 0).toFixed(2)),
    personnellesDansLeBrut: e.personnellesDansLeBrut,
    personnellesEnSortie: e.personnellesEnSortie,
    lignesEcartees: e.lignesEcartees,
  }));

  writeFileSync(join(DATA, "extraction-tickets.json"), `${JSON.stringify({ extractions }, null, 2)}\n`, "utf8");
  writeFileSync(join(DATA, "resume-tickets.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");

  // Affichage : aucun libellé de produit n'est montré ici, seulement des
  // compteurs. Les libellés sont des achats, donc ils restent dans data/.
  for (const r of resume) {
    console.log(
      `${r.fichier.slice(0, 24)} | magasin ${r.magasin ?? "?"} | ${r.date ?? "?"} | ${r.lignes} ligne(s), ` +
        `${r.articles} article(s) sur ${r.lignesAnnoncees ?? "?"} annoncé(s) | total ${r.total ?? "?"} € | ` +
        `somme des lignes ${r.sommeDesLignes} €`,
    );
    console.log(`   personnelles dans le brut : ${r.personnellesDansLeBrut.join(", ") || "aucune"}`);
    console.log(`   personnelles en sortie    : ${r.personnellesEnSortie.join(", ") || "AUCUNE"}`);
    console.log(`   lignes écartées           : ${Object.entries(r.lignesEcartees).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
}

/** Lit une référence écrite par ce script : en-tête puis lignes d'articles. */
export function litReference(fichier: string): { total: number | null; lignes: Ligne[] } {
  const brut = readFileSync(join(REFERENCES, fichier), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const entete = brut[0] ?? "";
  const total = Number.parseFloat(/total=([\d.]+)/.exec(entete)?.[1] ?? "") || null;
  const lignes = brut.slice(1).map((ligne) => {
    const [libelle, quantite, prix] = ligne.split("\t");
    return { libelle, quantite: quantite === "" ? null : Number(quantite), prix: Number(prix) };
  });
  return { total, lignes };
}

// Lancé directement : on extrait. Importé : on n'exécute rien.
if (process.argv[1]?.endsWith("extraction.ts")) principal();
