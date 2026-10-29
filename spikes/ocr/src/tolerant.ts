// Analyseur tolérant, pour le texte issu de l'OCR.
//
// Pourquoi un second analyseur : celui du PDF s'appuie sur l'alignement des
// colonnes (deux espaces ou plus avant le prix). **L'OCR réduit les espaces
// multiples à un seul**, donc ce repère disparaît. Mesuré : avec l'analyseur
// strict, l'OCR d'une image nette à 300 points par pouce donnait 0 ligne sur
// 18, alors que le texte lu était presque parfait.
//
// Principe retenu, qui ne dépend plus de l'alignement : sur une ligne
// d'article, le dernier montant est le prix, et ce qui précède est le libellé.
// On tolère en plus les confusions habituelles de l'OCR sur les caractères.

import type { Ligne } from "./extraction.ts";

/** Montant en euros, avec virgule ou point selon la lecture. */
const MONTANT = /-?\d+[,.]\d{2}/g;

/** Début de ligne d'article : un code de TVA, parfois mal lu. */
const CODE_TVA = /^[A-Z0-9]{1,3}\s*[,.]?\s*\*?\s*/;

/** Lignes à écarter, motifs tolérants aux fautes de lecture. */
const A_ECARTER: { nom: string; motif: RegExp }[] = [
  { nom: "total", motif: /\bT[O0]T[A4][L1I]\b|\bT[o0]t\./i },
  { nom: "TVA", motif: /\bTV[A4]\b|\bMt\s|\bH[T7]\b|%/i },
  { nom: "moyen de paiement", motif: /\bCB\b|sans\s*c[o0]ntact|esp[èe]ces|titre\s*restaurant|payable/i },
  { nom: "fidélité", motif: /p[o0]ints|fid[ée]lit[ée]|&\s*N[o0]us|s[o0]lde|valables/i },
  { nom: "identité", motif: /^\s*n[o0]m\s*:|^\s*(M\.|Mme|Mlle)\s|^\s*n[°o]\s*:/i },
  { nom: "coordonnées du magasin", motif: /SIRE[T7]|\bNAF\b|\bZAC\b|^\s*\d{5}\s+[A-ZÀ-Ý]|^\s*0\d[\s.]?\d{2}/ },
  { nom: "pied de ticket", motif: /caisse|hash|empl\b|nb\s*lignes|vente\s*:|^\s*V\.\s*\d/i },
  { nom: "site et application", motif: /picard\.?fr|appli|m[o0]n\s*c[o0]mpte|pr[o0]fiter/i },
  { nom: "séparateur", motif: /^\s*[-=*_~]{3,}\s*$/ },
];

function nombre(texte: string): number {
  return Number.parseFloat(texte.replace(",", "."));
}

export type DecoupeTolerante = {
  lignes: Ligne[];
  total: number | null;
  lignesAnnoncees: number | null;
  ecartees: Record<string, number>;
};

export function decoupeTolerant(texte: string): DecoupeTolerante {
  const lignes: Ligne[] = [];
  const ecartees: Record<string, number> = {};
  let total: number | null = null;
  let lignesAnnoncees: number | null = null;
  let enAttente: string | null = null;

  const brutes = texte.replace(/\r/g, "").split("\n");

  for (const [index, brute] of brutes.entries()) {
    const ligne = brute.trim();
    if (ligne === "") continue;

    // Ligne de quantité : « 3 * 3,75 11,25 € », tolérante sur le séparateur.
    const quantite = /^(\d{1,3})\s*[*xX]\s*(\d+[,.]\d{2})\s+(-?\d+[,.]\d{2})/.exec(ligne);
    if (quantite && enAttente !== null) {
      lignes.push({ libelle: enAttente, quantite: Number(quantite[1]), prix: nombre(quantite[3]) });
      enAttente = null;
      continue;
    }
    if (enAttente !== null) {
      ecartees["libellé sans quantité"] = (ecartees["libellé sans quantité"] ?? 0) + 1;
      enAttente = null;
    }

    // Total : « TOTAL (4) 19,28 », avec les confusions O/0 et L/1/I.
    const totalTrouve = /\bT[O0]T[A4][L1I]\b\s*\(?(\d+)?\)?\s*(-?\d+[,.]\d{2})/i.exec(ligne);
    if (totalTrouve) {
      if (totalTrouve[1]) lignesAnnoncees = Number(totalTrouve[1]);
      total = nombre(totalTrouve[2]);
      ecartees.total = (ecartees.total ?? 0) + 1;
      continue;
    }

    const montants = [...ligne.matchAll(MONTANT)].map((m) => m[0]);

    // Remise : montant négatif.
    if (montants.some((m) => m.startsWith("-"))) {
      ecartees.remise = (ecartees.remise ?? 0) + 1;
      continue;
    }

    const ecarte = A_ECARTER.find(({ motif }) => motif.test(ligne));
    if (ecarte) {
      ecartees[ecarte.nom] = (ecartees[ecarte.nom] ?? 0) + 1;
      continue;
    }

    // Article : un code de TVA en tête, un seul montant en fin de ligne.
    if (montants.length >= 1 && CODE_TVA.test(ligne)) {
      const dernier = montants.at(-1)!;
      const avant = ligne.slice(0, ligne.lastIndexOf(dernier));
      const libelle = avant.replace(CODE_TVA, "").replace(/[\s*,.]+$/, "").trim();
      if (libelle !== "") {
        lignes.push({ libelle, quantite: 1, prix: nombre(dernier) });
        continue;
      }
    }

    // Libellé seul, dont la quantité est sur la ligne suivante.
    if (montants.length === 0 && CODE_TVA.test(ligne) && /^\d{1,3}\s*[*xX]/.test((brutes[index + 1] ?? "").trim())) {
      enAttente = ligne.replace(CODE_TVA, "").trim();
      continue;
    }

    ecartees["non reconnue"] = (ecartees["non reconnue"] ?? 0) + 1;
    if (/\d+[,.]\d{2}/.test(ligne)) {
      ecartees["non reconnue AVEC MONTANT"] = (ecartees["non reconnue AVEC MONTANT"] ?? 0) + 1;
    }
  }

  return { lignes, total, lignesAnnoncees, ecartees };
}
