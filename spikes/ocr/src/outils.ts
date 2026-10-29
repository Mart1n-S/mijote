// Localisation des outils locaux, en un seul endroit.
//
// Tous travaillent sur la machine, aucun ne communique avec l'extérieur :
//   - `pdftotext` (Poppler) : couche de texte des PDF, avec ou sans coordonnées ;
//   - `pdftoppm` (Poppler) : rendu d'une page de PDF en image ;
//   - `magick` (ImageMagick) : dégradations volontaires des images ;
//   - `tesseract` : OCR, avec le modèle français installé dans AppData.
//
// Les chemins sont explicites parce que ces outils ne sont pas dans le PATH du
// shell utilisé ici, et parce qu'un `convert` existe dans Windows qui n'a rien
// à voir avec ImageMagick. Inventaire complet : docs/lot-0/installations.md.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATS: Record<string, string[]> = {
  pdftotext: [
    "C:/Users/marti/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin/pdftotext.exe",
    "C:/Program Files/Git/mingw64/bin/pdftotext.exe",
  ],
  pdftoppm: [
    "C:/Users/marti/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe/poppler-25.07.0/Library/bin/pdftoppm.exe",
  ],
  magick: ["C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"],
  tesseract: ["C:/Program Files/Tesseract-OCR/tesseract.exe"],
};

/** Dossier contenant le modèle français, hors Program Files. */
export const TESSDATA = "C:/Users/marti/AppData/Local/tessdata";

const cache = new Map<string, string>();

export function chemin(outil: keyof typeof CANDIDATS): string {
  const connu = cache.get(outil);
  if (connu) return connu;
  const trouve = (CANDIDATS[outil] ?? []).find((candidat) => existsSync(candidat));
  if (!trouve) {
    throw new Error(`Outil introuvable : ${outil}. Voir docs/lot-0/installations.md pour l'installer.`);
  }
  cache.set(outil, trouve);
  return trouve;
}

/** Lance un outil local et rend sa sortie standard. */
export function lance(outil: keyof typeof CANDIDATS, arguments_: string[], environnement?: Record<string, string>): string {
  return execFileSync(chemin(outil), arguments_, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: environnement ? { ...process.env, ...environnement } : process.env,
  });
}
