// Mesure de l'OCR, en trois régimes bien séparés, parce qu'ils ne prouvent pas
// la même chose :
//
//   1. **PDF natif** : la couche de texte, sans OCR. C'est la référence, et
//      c'est aussi la voie que l'application devrait privilégier pour les
//      tickets dématérialisés.
//   2. **Image rendue depuis le PDF**, à 150 et 300 points par pouce. Une telle
//      image est parfaite : nette, droite, sans bruit. Elle mesure le plancher
//      de difficulté, pas une photo.
//   3. **Images dégradées volontairement** : flou, rotation, bruit, contraste
//      faible, chacune mesurée à part, pour savoir ce qui fait vraiment chuter
//      la lecture.
//
// Le régime « photo réelle » reste en attente : il demande une photo prise au
// téléphone, qui n'est pas encore déposée dans data/.
//
// Tout est local : `pdftoppm` pour le rendu, `magick` pour les dégradations,
// `tesseract` avec le modèle français. Aucun document ne quitte la machine.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, litReference, type Ligne } from "./extraction.ts";
import { decoupeTolerant } from "./tolerant.ts";
import { lance, TESSDATA } from "./outils.ts";

const IMAGES = join(DATA, "images");

/** Les dégradations appliquées, une par une, jamais cumulées. */
const DEGRADATIONS: { nom: string; arguments: string[] }[] = [
  { nom: "nette", arguments: [] },
  { nom: "flou", arguments: ["-blur", "0x1.2"] },
  { nom: "rotation 2 degrés", arguments: ["-background", "white", "-rotate", "2"] },
  { nom: "rotation 5 degrés", arguments: ["-background", "white", "-rotate", "5"] },
  { nom: "bruit", arguments: ["-attenuate", "0.6", "+noise", "Gaussian"] },
  { nom: "contraste faible", arguments: ["-brightness-contrast", "10x-45"] },
  { nom: "flou et rotation et bruit", arguments: ["-blur", "0x1", "-background", "white", "-rotate", "3", "-attenuate", "0.4", "+noise", "Gaussian"] },
];

/** Normalisation pour comparer deux libellés : casse, accents, espaces. */
function normalise(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance d'édition, pour mesurer « presque juste ». */
function distance(a: string, b: string): number {
  const precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonale = precedente[0];
    precedente[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temporaire = precedente[j];
      precedente[j] = Math.min(
        precedente[j] + 1,
        precedente[j - 1] + 1,
        diagonale + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonale = temporaire;
    }
  }
  return precedente[b.length];
}

type Comparaison = {
  lignesAttendues: number;
  lignesLues: number;
  libelleExact: number;
  libelleProche: number;
  prixExact: number;
  quantiteExacte: number;
  ligneEntierementJuste: number;
  totalLu: number | null;
  totalAttendu: number | null;
  totalJuste: boolean;
};

/**
 * Apparie les lignes lues aux lignes attendues par ressemblance du libellé,
 * puis compare champ par champ. L'appariement est glouton : chaque ligne
 * attendue prend la ligne lue la plus proche encore libre.
 */
function compare(attendues: Ligne[], lues: Ligne[], totalAttendu: number | null, totalLu: number | null): Comparaison {
  const libres = new Set(lues.keys());
  const resultat: Comparaison = {
    lignesAttendues: attendues.length,
    lignesLues: lues.length,
    libelleExact: 0,
    libelleProche: 0,
    prixExact: 0,
    quantiteExacte: 0,
    ligneEntierementJuste: 0,
    totalLu,
    totalAttendu,
    totalJuste: totalAttendu !== null && totalLu !== null && Math.abs(totalAttendu - totalLu) < 0.005,
  };

  for (const attendue of attendues) {
    const cible = normalise(attendue.libelle);
    let meilleure: { index: number; ecart: number } | null = null;
    for (const index of libres) {
      const ecart = distance(cible, normalise(lues[index].libelle));
      if (!meilleure || ecart < meilleure.ecart) meilleure = { index, ecart };
    }
    if (!meilleure) continue;
    libres.delete(meilleure.index);
    const lue = lues[meilleure.index];

    const libelleExact = meilleure.ecart === 0;
    // « Proche » : au plus un caractère faux pour quatre, ce qui reste
    // corrigeable d'un coup d'oeil par l'utilisateur.
    const libelleProche = meilleure.ecart <= Math.max(1, Math.round(cible.length / 4));
    const prixExact = Math.abs(attendue.prix - lue.prix) < 0.005;
    const quantiteExacte = (attendue.quantite ?? 1) === (lue.quantite ?? 1);

    if (libelleExact) resultat.libelleExact += 1;
    if (libelleProche) resultat.libelleProche += 1;
    if (prixExact) resultat.prixExact += 1;
    if (quantiteExacte) resultat.quantiteExacte += 1;
    if (libelleExact && prixExact && quantiteExacte) resultat.ligneEntierementJuste += 1;
  }

  return resultat;
}

function rend(fichier: string, resolution: number): string {
  mkdirSync(IMAGES, { recursive: true });
  const base = join(IMAGES, `${fichier.replace(/\.pdf$/i, "")}-${resolution}`);
  lance("pdftoppm", ["-png", "-r", String(resolution), "-singlefile", join(DATA, fichier), base]);
  return `${base}.png`;
}

function degrade(source: string, nom: string, arguments_: string[]): string {
  if (arguments_.length === 0) return source;
  const cible = source.replace(/\.png$/, `-${nom.replace(/[^a-z0-9]+/gi, "-")}.png`);
  lance("magick", [source, ...arguments_, cible]);
  return cible;
}

function ocr(image: string): string {
  // --psm 6 : un bloc de texte uniforme, ce qui correspond à un ticket.
  return lance("tesseract", [image, "-", "-l", "fra", "--psm", "6"], { TESSDATA_PREFIX: TESSDATA });
}

function principal(): void {
  const tickets = readdirSync(DATA).filter((f) => /\.pdf$/i.test(f)).sort();
  const mesures: Record<string, unknown>[] = [];

  for (const fichier of tickets) {
    const reference = litReference(`${fichier.replace(/\.pdf$/i, "")}.tsv`);

    for (const resolution of [150, 300]) {
      const image = rend(fichier, resolution);

      for (const degradation of DEGRADATIONS) {
        const variante = degrade(image, degradation.nom, degradation.arguments);
        const texte = ocr(variante);
        // Analyseur tolérant : l'OCR perd l'alignement des colonnes.
        const decoupe = decoupeTolerant(texte);
        const comparaison = compare(reference.lignes, decoupe.lignes, reference.total, decoupe.total);

        mesures.push({
          fichier,
          regime: `image ${resolution} ppp`,
          degradation: degradation.nom,
          ...comparaison,
        });
        console.log(
          `${fichier.slice(0, 10)} ${resolution} ppp ${degradation.nom.padEnd(24)} ` +
            `lignes ${comparaison.lignesLues}/${comparaison.lignesAttendues} | ` +
            `justes ${comparaison.ligneEntierementJuste}/${comparaison.lignesAttendues} | ` +
            `libellé exact ${comparaison.libelleExact} proche ${comparaison.libelleProche} | ` +
            `prix ${comparaison.prixExact} | total ${comparaison.totalJuste ? "juste" : "faux"}`,
        );
      }
    }
  }

  // Synthèse par régime et par dégradation, sur les trois tickets.
  const parCle = new Map<string, { attendues: number; justes: number; libelles: number; proches: number; prix: number; totaux: number; documents: number }>();
  for (const mesure of mesures) {
    const cle = `${mesure.regime} | ${mesure.degradation}`;
    const courant = parCle.get(cle) ?? { attendues: 0, justes: 0, libelles: 0, proches: 0, prix: 0, totaux: 0, documents: 0 };
    courant.attendues += mesure.lignesAttendues as number;
    courant.justes += mesure.ligneEntierementJuste as number;
    courant.libelles += mesure.libelleExact as number;
    courant.proches += mesure.libelleProche as number;
    courant.prix += mesure.prixExact as number;
    courant.totaux += (mesure.totalJuste as boolean) ? 1 : 0;
    courant.documents += 1;
    parCle.set(cle, courant);
  }

  const synthese = [...parCle].map(([cle, v]) => ({
    regime: cle,
    lignesJustes: `${v.justes}/${v.attendues} (${Math.round((v.justes / v.attendues) * 100)} %)`,
    libelleExact: `${v.libelles}/${v.attendues} (${Math.round((v.libelles / v.attendues) * 100)} %)`,
    libelleProche: `${v.proches}/${v.attendues} (${Math.round((v.proches / v.attendues) * 100)} %)`,
    prixExact: `${v.prix}/${v.attendues} (${Math.round((v.prix / v.attendues) * 100)} %)`,
    totalJuste: `${v.totaux}/${v.documents}`,
  }));

  writeFileSync(join(DATA, "mesure-ocr.json"), `${JSON.stringify({ mesures, synthese }, null, 2)}\n`, "utf8");
  console.log("\n--- synthèse par régime, sur les trois tickets ---");
  for (const ligne of synthese) {
    console.log(
      `${ligne.regime.padEnd(42)} justes ${ligne.lignesJustes.padEnd(14)} libellé ${ligne.libelleExact.padEnd(14)} ` +
        `proche ${ligne.libelleProche.padEnd(14)} prix ${ligne.prixExact.padEnd(14)} total ${ligne.totalJuste}`,
    );
  }
}

principal();
