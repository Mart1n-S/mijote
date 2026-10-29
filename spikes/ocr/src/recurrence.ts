// Mesure hors ligne : les lignes d'une facture drive reviennent-elles d'une
// commande à l'autre ?
//
// C'est ce qui fonde la décision 5 du rapport (les factures servent surtout à
// connaître les produits habituels). Sans cette mesure, l'affirmation « la
// majorité reviennent d'une commande à l'autre » n'était qu'une impression.
//
// Méthode : on compare les libellés normalisés, deux à deux entre factures, et
// on compte combien de produits distincts apparaissent dans une, deux ou trois
// commandes. Aucune requête réseau, aucun libellé affiché.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./extraction.ts";

/** Normalisation : casse, accents, ponctuation, espaces. */
function normalise(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clé de produit : la marque et le nom, sans les chiffres de fin que la mise en
 * page colle au libellé (quantité recopiée). On garde les quatre premiers mots
 * significatifs, ce qui suffit à identifier un produit sans confondre deux
 * références proches.
 */
function cleProduit(libelle: string): string {
  return normalise(libelle)
    .split(" ")
    .filter((mot) => mot.length > 2 && !/^\d+$/.test(mot))
    .slice(0, 4)
    .join(" ");
}

function principal(): void {
  const brut = JSON.parse(readFileSync(join(DATA, "extraction-factures.json"), "utf8"));

  const parFacture = new Map<string, Set<string>>();
  for (const extraction of brut.extractions) {
    const document = String(extraction.facture.fichier).slice(6, 15);
    const cles = new Set<string>();
    for (const ligne of extraction.facture.lignes) {
      const cle = cleProduit(String(ligne.libelle));
      if (cle !== "") cles.add(cle);
    }
    parFacture.set(document, cles);
  }

  // Dans combien de commandes chaque produit apparaît-il ?
  const presence = new Map<string, number>();
  for (const cles of parFacture.values()) {
    for (const cle of cles) presence.set(cle, (presence.get(cle) ?? 0) + 1);
  }

  const distincts = presence.size;
  const dansPlusieurs = [...presence.values()].filter((n) => n >= 2).length;
  const dansLesTrois = [...presence.values()].filter((n) => n === 3).length;

  // Recouvrement deux à deux, qui dit mieux que la moyenne ce qu'on peut
  // attendre d'une nouvelle commande.
  const paires: { couple: string; communs: number; surLaPlusPetite: string }[] = [];
  const documents = [...parFacture.keys()];
  for (let i = 0; i < documents.length; i += 1) {
    for (let j = i + 1; j < documents.length; j += 1) {
      const a = parFacture.get(documents[i])!;
      const b = parFacture.get(documents[j])!;
      const communs = [...a].filter((cle) => b.has(cle)).length;
      const plusPetite = Math.min(a.size, b.size);
      paires.push({
        couple: `${documents[i]} et ${documents[j]}`,
        communs,
        surLaPlusPetite: `${communs}/${plusPetite} (${Math.round((communs / plusPetite) * 100)} %)`,
      });
    }
  }

  const resume = {
    mesureLe: new Date().toISOString(),
    factures: parFacture.size,
    lignesParFacture: Object.fromEntries([...parFacture].map(([d, c]) => [d, c.size])),
    produitsDistincts: distincts,
    dansAuMoinsDeuxCommandes: `${dansPlusieurs}/${distincts} (${Math.round((dansPlusieurs / distincts) * 100)} %)`,
    dansLesTroisCommandes: `${dansLesTrois}/${distincts} (${Math.round((dansLesTrois / distincts) * 100)} %)`,
    recouvrementDeuxADeux: paires,
  };

  writeFileSync(join(DATA, "recurrence.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(resume, null, 2));
}

principal();
