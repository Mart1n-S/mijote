// Rapprochement des libellés lus vers les catalogues, avec la méthode M7 de
// l'hypothèse 6. Deux mesures séparées, parce que les deux entrées n'ont rien
// à voir :
//
//   A. **libellés tronqués des tickets Picard** vers le catalogue Picard
//      (1 605 produits). Les libellés font une quinzaine de caractères et sont
//      coupés net : c'est le cas le plus difficile.
//   B. **libellés complets des factures drive** vers les ingrédients HelloFresh
//      (87) et vers les aliments Ciqual (3 484). Les libellés portent la marque
//      et le conditionnement, donc beaucoup de bruit mais aucune troncature.
//
// Aucune requête réseau : les trois catalogues sont relus dans les data/ des
// prototypes précédents.
//
// Les verdicts sont dans src/verdicts.ts, **indexés par document et par numéro
// de ligne**, jamais par libellé : le fichier est commité, les achats ne le
// sont pas.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./extraction.ts";
import { prepare, suggere, type Candidat } from "./m7.ts";
import { VERDICTS, type Verdict } from "./verdicts.ts";

const RACINE = join(import.meta.dirname, "..", "..");

function lit(chemin: string): any {
  if (!existsSync(chemin)) throw new Error(`Données absentes : ${chemin}`);
  return JSON.parse(readFileSync(chemin, "utf8"));
}

/** Les 1 605 produits Picard, par le slug de leur URL. */
function catalogue(): Candidat[] {
  const urls = lit(join(RACINE, "picard", "data", "sitemap-urls.json")) as { url: string }[];
  const candidats: Candidat[] = [];
  for (const entree of urls) {
    const trouve = /\/produits\/(.+)-(\d{10,})\.html$/.exec(entree.url);
    if (trouve) candidats.push({ cle: trouve[2], libelle: trouve[1] });
  }
  return candidats;
}

/** Les 87 ingrédients de l'échantillon HelloFresh. */
function ingredients(): Candidat[] {
  const liste = lit(join(RACINE, "picard", "data", "ingredients-hellofresh.json")) as { nom: string; slug: string }[];
  return liste.map((i) => ({ cle: i.slug, libelle: i.nom }));
}

/** Les 3 484 aliments Ciqual, avec leur groupe. */
function aliments(): Candidat[] {
  const xml = readFileSync(join(RACINE, "open-food-facts", "data", "ciqual-alim.xml"), "utf8");
  const candidats: Candidat[] = [];
  for (const bloc of xml.matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
    const code = /<alim_code>([\s\S]*?)<\/alim_code>/.exec(bloc[1])?.[1]?.trim();
    const nom = /<alim_nom_fr>([\s\S]*?)<\/alim_nom_fr>/.exec(bloc[1])?.[1]?.trim();
    const groupe = /<alim_grp_code>([\s\S]*?)<\/alim_grp_code>/.exec(bloc[1])?.[1]?.trim();
    if (code && nom) candidats.push({ cle: code, libelle: nom.replace(/&apos;/g, "'"), groupe });
  }
  return candidats;
}

type LigneSource = { document: string; index: number; libelle: string };

/** Lignes d'articles des tickets, depuis l'extraction déjà faite. */
function lignesDesTickets(): LigneSource[] {
  const brut = lit(join(DATA, "extraction-tickets.json"));
  const sortie: LigneSource[] = [];
  for (const extraction of brut.extractions) {
    const document = String(extraction.document.fichier).slice(0, 10);
    for (const [index, ligne] of extraction.document.lignes.entries()) {
      sortie.push({ document, index, libelle: ligne.libelle });
    }
  }
  return sortie;
}

function lignesDesFactures(): LigneSource[] {
  const brut = lit(join(DATA, "extraction-factures.json"));
  const sortie: LigneSource[] = [];
  for (const extraction of brut.extractions) {
    const document = String(extraction.facture.fichier).slice(6, 15);
    for (const [index, ligne] of extraction.facture.lignes.entries()) {
      sortie.push({ document, index, libelle: ligne.libelle });
    }
  }
  return sortie;
}

function mesure(nom: string, sources: LigneSource[], candidats: Candidat[], prefixe: string) {
  const contexte = prepare(candidats);
  const details: Record<string, unknown>[] = [];
  let avecSuggestion = 0;
  const comptes: Record<Verdict | "non jugé", number> = { bon: 0, variante: 0, faux: 0, "non jugé": 0 };
  const comptesTrois: Record<"bon dans les 3" | "rien dans les 3", number> = { "bon dans les 3": 0, "rien dans les 3": 0 };

  for (const source of sources) {
    const suggestions = suggere(source.libelle, contexte);
    if (suggestions.length > 0) avecSuggestion += 1;

    const cle = `${prefixe}|${source.document}|${source.index}`;
    const verdicts = suggestions.map((_, rang) => VERDICTS[`${cle}|${rang}`] ?? "non jugé");
    const premier = verdicts[0] ?? "non jugé";
    comptes[premier] += 1;
    if (verdicts.includes("bon")) comptesTrois["bon dans les 3"] += 1;
    else comptesTrois["rien dans les 3"] += 1;

    details.push({
      cle,
      longueurDuLibelle: source.libelle.length,
      suggestions: suggestions.length,
      verdicts,
      // Les libellés restent dans data/, qui est hors de Git.
      libelle: source.libelle,
      proposes: suggestions.map((s) => s.libelle),
    });
  }

  const total = sources.length;
  const juges = comptes.bon + comptes.variante + comptes.faux;
  const resume = {
    mesure: nom,
    lignes: total,
    avecAuMoinsUneSuggestion: `${avecSuggestion}/${total} (${Math.round((avecSuggestion / total) * 100)} %)`,
    premiereSuggestion: {
      bon: `${comptes.bon}/${total} (${Math.round((comptes.bon / total) * 100)} %)`,
      variante: `${comptes.variante}/${total}`,
      faux: `${comptes.faux}/${total}`,
      nonJuge: `${comptes["non jugé"]}/${total}`,
    },
    bonDansLesTroisPremieres: `${comptesTrois["bon dans les 3"]}/${total} (${Math.round((comptesTrois["bon dans les 3"] / total) * 100)} %)`,
    // Précision : parmi les lignes où la méthode a proposé quelque chose, la
    // première suggestion est-elle utilisable ? C'est le seul chiffre
    // interprétable quand le catalogue visé est un échantillon de 87 lignes.
    precisionQuandEllePropose: juges === 0
      ? "n.d."
      : `${comptes.bon + comptes.variante}/${juges} (${Math.round(((comptes.bon + comptes.variante) / juges) * 100)} %)`,
    dontBonStrict: juges === 0 ? "n.d." : `${comptes.bon}/${juges} (${Math.round((comptes.bon / juges) * 100)} %)`,
  };

  return { resume, details };
}

function principal(): void {
  const resultats = [
    mesure("A. tickets Picard vers catalogue Picard", lignesDesTickets(), catalogue(), "ticket-picard"),
    mesure("B1. factures drive vers ingrédients HelloFresh", lignesDesFactures(), ingredients(), "facture-hellofresh"),
    mesure("B2. factures drive vers aliments Ciqual", lignesDesFactures(), aliments(), "facture-ciqual"),
  ];

  writeFileSync(
    join(DATA, "rapprochement.json"),
    `${JSON.stringify({ resultats: resultats.map((r) => ({ ...r.resume, details: r.details })) }, null, 2)}\n`,
    "utf8",
  );

  for (const { resume } of resultats) {
    console.log(`\n=== ${resume.mesure}`);
    console.log(`  lignes : ${resume.lignes}`);
    console.log(`  au moins une suggestion : ${resume.avecAuMoinsUneSuggestion}`);
    console.log(`  première suggestion : bon ${resume.premiereSuggestion.bon}, variante ${resume.premiereSuggestion.variante}, faux ${resume.premiereSuggestion.faux}, non jugé ${resume.premiereSuggestion.nonJuge}`);
    console.log(`  bon dans les 3 premières : ${resume.bonDansLesTroisPremieres}`);
    console.log(`  quand elle propose : utilisable ${resume.precisionQuandEllePropose}, dont bon strict ${resume.dontBonStrict}`);
  }
}

principal();
