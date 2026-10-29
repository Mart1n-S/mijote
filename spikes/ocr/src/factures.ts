// Extraction des factures de commande drive, **sans OCR** : elles portent une
// couche de texte, mais en colonnes, que `pdftotext -layout` mélange. On passe
// donc par les coordonnées (`-bbox-layout`) et on reconstruit les lignes.
//
// Piège mesuré sur ces factures, et c'est la raison d'être du filtre : le bloc
// d'adresse du client est à droite, **à la même hauteur que les premières lignes
// d'articles**. Un regroupement naïf par ligne collerait l'adresse dans les
// libellés de produits. On découpe donc par colonnes : le libellé ne prend que
// les mots à gauche, et les mots personnels y sont retirés en plus.
//
// Colonnes relevées sur les trois factures (unités du PDF) :
//   libellé    x < 300
//   quantité commandée   x ≈ 319
//   quantité livrée      x ≈ 369
//   taux de TVA          x ≈ 382
//   prix unitaire HT     x ≈ 444
//   prix unitaire TTC    x ≈ 499
//   total de la ligne    x ≈ 559

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detecte, verifie, type Categorie } from "./anonymise.ts";
import { lance } from "./outils.ts";
import { DATA, REFERENCES, type Ligne } from "./extraction.ts";

const DOSSIER_FACTURES = join(DATA, "factures");

type Mot = { x: number; y: number; texte: string };

export type Facture = {
  fichier: string;
  genre: "facture";
  enseigne: string;
  magasin: string | null;
  date: string | null;
  lignes: (Ligne & { quantiteCommandee: number | null; prixUnitaire: number | null; categorie: string | null })[];
  total: number | null;
  articlesAnnonces: number | null;
};

export type ExtractionFacture = {
  facture: Facture;
  personnellesDansLeBrut: Categorie[];
  personnellesEnSortie: Categorie[];
  motsPersonnelsRetiresDesLibelles: number;
  lignesSansLibelle: number;
};

function nombre(texte: string): number | null {
  const propre = texte.replace(/[€\s]/g, "").replace(",", ".");
  const valeur = Number.parseFloat(propre);
  return Number.isFinite(valeur) ? valeur : null;
}

function mots(chemin: string): Mot[] {
  const xml = lance("pdftotext", ["-bbox-layout", "-enc", "UTF-8", chemin, "-"]);
  return [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)<\/word>/g)].map(
    (trouve) => ({ x: Number(trouve[1]), y: Number(trouve[2]), texte: trouve[3] }),
  );
}

/** Regroupe les mots par ligne : même hauteur à deux unités près. */
function parLigne(liste: Mot[]): Mot[][] {
  const lignes = new Map<number, Mot[]>();
  for (const mot of liste) {
    const cle = Math.round(mot.y / 3);
    if (!lignes.has(cle)) lignes.set(cle, []);
    lignes.get(cle)!.push(mot);
  }
  return [...lignes.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => a.x - b.x));
}

/** Mot à retirer d'un libellé : il appartient à une adresse ou à une identité. */
function estPersonnel(texte: string): boolean {
  if (/^\d{5}$/.test(texte)) return true; // code postal
  if (/^(rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|quai|cours)$/i.test(texte)) return true;
  if (/^(m\.|mme|mlle)$/i.test(texte)) return true;
  if (/@/.test(texte)) return true;
  if (/^\d{9,}$/.test(texte)) return true;
  return false;
}

const COLONNE = {
  libelleMax: 300,
  quantiteCommandee: [310, 345],
  quantiteLivree: [360, 378],
  tauxTva: [379, 420],
  unitaireHt: [430, 480],
  unitaireTtc: [490, 540],
  total: [545, 600],
} as const;

function dansColonne(mot: Mot, bornes: readonly [number, number] | number[]): boolean {
  return mot.x >= bornes[0] && mot.x <= bornes[1];
}

function extraitFacture(fichier: string): ExtractionFacture {
  const chemin = join(DOSSIER_FACTURES, fichier);
  const liste = mots(chemin);
  const brut = liste.map((m) => m.texte).join(" ");
  const personnellesDansLeBrut = detecte(brut);

  const lignes: Facture["lignes"] = [];
  let total: number | null = null;
  let articlesAnnonces: number | null = null;
  let magasin: string | null = null;
  let date: string | null = null;
  let categorie: string | null = null;
  let motsPersonnelsRetires = 0;
  let lignesSansLibelle = 0;

  const rangees = parLigne(liste);

  for (const rangee of rangees) {
    const texteComplet = rangee.map((m) => m.texte).join(" ");

    // Magasin : la première mention de l'enseigne, en haut à gauche.
    if (magasin === null) {
      const trouve = /\b(INTERMARCHE[\w\s]*?)(?:\s+SAS|\s*$)/i.exec(
        rangee.filter((m) => m.x < COLONNE.libelleMax).map((m) => m.texte).join(" "),
      );
      if (trouve) magasin = trouve[1].trim();
    }

    if (date === null) {
      const trouve = /facturation\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(texteComplet);
      if (trouve) date = `${trouve[3]}-${trouve[2]}-${trouve[1]}`;
    }

    // En-tête de catégorie : « CHARCUTERIE (4) », « PRODUITS (37) ».
    const enTete = /^([A-ZÀ-Ý][A-ZÀ-Ý\s'-]{3,})\s*\((\d+)\)\s*$/.exec(
      rangee.filter((m) => m.x < COLONNE.libelleMax).map((m) => m.texte).join(" ").trim(),
    );
    if (enTete) {
      if (/^PRODUITS$/i.test(enTete[1].trim())) articlesAnnonces = Number(enTete[2]);
      else categorie = enTete[1].trim();
      continue;
    }

    // Ligne d'article, détectée **sans position codée en dur** : au moins deux
    // montants, dont le dernier est le total de la ligne, et des entiers avant
    // eux qui sont les quantités. Les trois factures n'ont pas la même mise en
    // page : la troisième n'a ni en-tête « PRODUITS (n) » ni colonne de
    // quantité au même endroit, donc toute position fixe échouait.
    const montantsDeLaRangee = rangee.filter((m) => /^-?\d+,\d{2}$/.test(m.texte));
    if (montantsDeLaRangee.length < 2) continue;
    const totalLigne = montantsDeLaRangee.at(-1)!;
    const premierMontant = montantsDeLaRangee[0];
    const entiersAvant = rangee.filter((m) => /^\d{1,3}$/.test(m.texte) && m.x < premierMontant.x);
    // La quantité livrée est le dernier entier avant les montants ; la
    // quantité commandée le précède quand les deux colonnes existent.
    const quantiteLivree = entiersAvant.at(-1);
    if (!quantiteLivree) continue;

    // Libellé : les mots à gauche du premier chiffre de la rangée, et sans les
    // mots personnels. Le bloc d'adresse du client est à droite dans la mise en
    // page des deux premières factures, donc déjà exclu par cette borne.
    const borneLibelle = Math.min(quantiteLivree.x, premierMontant.x);
    const motsLibelle = rangee.filter((m) => m.x < borneLibelle - 1);
    const retenus = motsLibelle.filter((m) => !estPersonnel(m.texte));
    motsPersonnelsRetires += motsLibelle.length - retenus.length;
    const libelle = retenus.map((m) => m.texte).join(" ").replace(/\s+/g, " ").trim();

    if (libelle === "") {
      lignesSansLibelle += 1;
      continue;
    }

    const quantiteCommandee = entiersAvant.length >= 2 ? entiersAvant.at(-2) : undefined;
    // Prix unitaire : le montant juste avant le total, quand il y en a plus de deux.
    const unitaireTtc = montantsDeLaRangee.length >= 2 ? montantsDeLaRangee.at(-2) : undefined;

    lignes.push({
      libelle,
      categorie,
      quantite: Number(quantiteLivree.texte),
      quantiteCommandee: quantiteCommandee ? Number(quantiteCommandee.texte) : null,
      prixUnitaire: unitaireTtc ? nombre(unitaireTtc.texte) : null,
      prix: nombre(totalLigne.texte) ?? 0,
    });
  }

  // Total : le plus grand montant de la colonne de droite, qui est le total payé.
  const montants = rangees
    .flatMap((r) => r.filter((m) => /^-?\d+,\d{2}$/.test(m.texte)))
    .map((m) => nombre(m.texte))
    .filter((v): v is number => v !== null);
  total = montants.length > 0 ? Math.max(...montants) : null;

  const facture: Facture = {
    fichier,
    genre: "facture",
    enseigne: "Intermarché",
    magasin,
    date,
    lignes,
    total,
    articlesAnnonces,
  };

  return {
    facture,
    personnellesDansLeBrut,
    personnellesEnSortie: verifie(facture),
    motsPersonnelsRetiresDesLibelles: motsPersonnelsRetires,
    lignesSansLibelle,
  };
}

function ecritReference(extraction: ExtractionFacture): void {
  const { facture } = extraction;
  const entete = `# ${facture.enseigne}\tfacture\tmagasin=${facture.magasin ?? ""}\tdate=${facture.date ?? ""}\ttotal=${facture.total ?? ""}`;
  const corps = facture.lignes.map(
    (l) => `${l.libelle}\t${l.quantite ?? ""}\t${l.prix.toFixed(2)}\t${l.prixUnitaire ?? ""}\t${l.categorie ?? ""}`,
  );
  writeFileSync(join(REFERENCES, `${facture.fichier.replace(/\.pdf$/i, "")}.tsv`), `${[entete, ...corps].join("\n")}\n`, "utf8");
}

function principal(): void {
  const fichiers = readdirSync(DOSSIER_FACTURES).filter((f) => /\.pdf$/i.test(f)).sort();
  const extractions = fichiers.map((f) => extraitFacture(f));
  for (const extraction of extractions) ecritReference(extraction);

  const resume = extractions.map((e) => ({
    fichier: e.facture.fichier,
    magasin: e.facture.magasin,
    date: e.facture.date,
    lignes: e.facture.lignes.length,
    articles: e.facture.lignes.reduce((t, l) => t + (l.quantite ?? 0), 0),
    articlesAnnonces: e.facture.articlesAnnonces,
    sommeDesLignes: Number(e.facture.lignes.reduce((t, l) => t + l.prix, 0).toFixed(2)),
    total: e.facture.total,
    avecQuantite: e.facture.lignes.filter((l) => l.quantite !== null).length,
    avecPrixUnitaire: e.facture.lignes.filter((l) => l.prixUnitaire !== null).length,
    avecCategorie: e.facture.lignes.filter((l) => l.categorie !== null).length,
    personnellesDansLeBrut: e.personnellesDansLeBrut,
    personnellesEnSortie: e.personnellesEnSortie,
    motsPersonnelsRetiresDesLibelles: e.motsPersonnelsRetiresDesLibelles,
    lignesSansLibelle: e.lignesSansLibelle,
  }));

  writeFileSync(join(DATA, "extraction-factures.json"), `${JSON.stringify({ extractions }, null, 2)}\n`, "utf8");
  writeFileSync(join(DATA, "resume-factures.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");

  for (const r of resume) {
    console.log(
      `${r.fichier.slice(0, 20)} | ${r.magasin ?? "?"} | ${r.date ?? "?"} | ${r.lignes} ligne(s), ${r.articles} article(s) ` +
        `sur ${r.articlesAnnonces ?? "?"} annoncé(s) | somme ${r.sommeDesLignes} € | total ${r.total ?? "?"} €`,
    );
    console.log(
      `   quantité ${r.avecQuantite}/${r.lignes}, prix unitaire ${r.avecPrixUnitaire}/${r.lignes}, catégorie ${r.avecCategorie}/${r.lignes}` +
        ` | mots personnels retirés des libellés : ${r.motsPersonnelsRetiresDesLibelles} | lignes sans libellé : ${r.lignesSansLibelle}`,
    );
    console.log(`   personnelles dans le brut : ${r.personnellesDansLeBrut.join(", ") || "aucune"}`);
    console.log(`   personnelles en sortie    : ${r.personnellesEnSortie.join(", ") || "AUCUNE"}`);
  }
}

principal();
