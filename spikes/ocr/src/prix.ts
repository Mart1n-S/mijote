// Écart entre le prix payé sur un ticket et le prix du site Picard relevé le
// 28 octobre 2026 (hypothèses 3 et 5). La comparaison n'est possible que si le
// produit du ticket figure parmi les 50 fiches dont on a collecté le prix.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./extraction.ts";
import { VERDICTS } from "./verdicts.ts";

const RACINE = join(import.meta.dirname, "..", "..", "picard", "data");

type PrixSite = { id: string; slug: string; prix: number };

/**
 * Prix du site relevés aux hypothèses 3 et 5. Deux sources :
 *   - produits.json : les 10 fiches de l'hypothèse 3, avec leur URL donc leur
 *     identifiant ;
 *   - codes-barres.json : les 50 fiches de l'hypothèse 5, avec leur prix mais
 *     **sans identifiant**, ce qui limite le rapprochement par clé.
 */
function prixDuSite(): Map<string, PrixSite> {
  const table = new Map<string, PrixSite>();
  const fichier = join(RACINE, "produits.json");
  if (!existsSync(fichier)) return table;

  // Le slug n'est pas dans produits.json : on le retrouve par l'identifiant,
  // dans le sitemap deja enregistre.
  const slugs = new Map<string, string>();
  for (const entree of JSON.parse(readFileSync(join(RACINE, "sitemap-urls.json"), "utf8")) as { url: string }[]) {
    const trouve = /\/produits\/(.+)-(\d{10,})\.html$/.exec(entree.url);
    if (trouve) slugs.set(trouve[2], trouve[1]);
  }

  for (const fiche of JSON.parse(readFileSync(fichier, "utf8")).fiches ?? []) {
    const id = String(fiche.identifiant ?? "");
    const prix = Number.parseFloat(String(fiche.prix ?? ""));
    const slug = slugs.get(id);
    if (id && slug && Number.isFinite(prix)) table.set(id, { id, slug, prix });
  }
  return table;
}

/** Nombre de fiches dont un prix a été relevé, toutes sources confondues. */
function prixRelevesEnTout(): number {
  const fichier = join(RACINE, "codes-barres.json");
  if (!existsSync(fichier)) return 0;
  return (JSON.parse(readFileSync(fichier, "utf8")).fiches ?? []).filter((f: { prix?: unknown }) =>
    Number.isFinite(Number.parseFloat(String(f.prix ?? ""))),
  ).length;
}

const site = prixDuSite();
const rapprochement = JSON.parse(readFileSync(join(DATA, "rapprochement.json"), "utf8"));
const tickets = JSON.parse(readFileSync(join(DATA, "extraction-tickets.json"), "utf8"));

// Prix des lignes de ticket, par clé de ligne.
const prixTicket = new Map<string, number>();
for (const extraction of tickets.extractions) {
  const document = String(extraction.document.fichier).slice(0, 10);
  for (const [index, ligne] of extraction.document.lignes.entries()) {
    prixTicket.set(`ticket-picard|${document}|${index}`, ligne.prix);
  }
}

const comparables: Record<string, unknown>[] = [];
for (const detail of rapprochement.resultats[0].details) {
  if (VERDICTS[`${detail.cle}|0`] !== "bon") continue;
  // L'identifiant du produit retenu n'est pas dans le détail : on le retrouve
  // par le libellé proposé, qui est le slug du produit.
  const slug = detail.proposes[0];
  const correspondance = [...site.values()].find((p) => p.slug === slug);
  if (!correspondance) continue;
  comparables.push({
    cle: detail.cle,
    prixTicket: prixTicket.get(detail.cle),
    prixSite: correspondance.prix,
    ecart: Number(((prixTicket.get(detail.cle) ?? 0) - correspondance.prix).toFixed(2)),
  });
}

const resume = {
  lignesAvecUnBonRapprochement: rapprochement.resultats[0].details.filter(
    (d: { cle: string }) => VERDICTS[`${d.cle}|0`] === "bon",
  ).length,
  produitsAvecIdentifiantEtPrix: site.size,
  prixRelevesEnTout: prixRelevesEnTout(),
  comparaisonsPossibles: comparables.length,
  comparaisons: comparables,
};
writeFileSync(join(DATA, "ecart-prix.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...resume, comparaisons: comparables.length }, null, 2));
