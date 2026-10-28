// Deuxieme etape : ou vit le prix ?
//
// La sonde precedente a montre que la fiche produit est rendue cote client et
// que son JSON-LD annonce « price: 0 », sans magasin attache. Trois pistes sont
// testees ici, de la moins intrusive a la plus intrusive :
//
//   1. le robots.txt de api.internal.intermarche.com, l'hote d'API trouve dans
//      la configuration du site : il a ses propres regles, on les lit avant ;
//   2. la page de rayon, qu'aucun Disallow ne couvre : porte-t-elle les prix ?
//   3. la fiche produit avec le magasin en parametre, sous l'exception.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, HorsCadre, RefusDuSite, type Reponse } from "./garde.ts";

const PDVREF = "11749";
const RAYON = "https://www.intermarche.com/rayons/epicerie-salee/riz-purees-et-feculents/riz/riz-basmati/5653";
const PRODUIT = "https://www.intermarche.com/produit/riz-basmati/3038354536002";

/** Tout ce qui ressemble a un prix ou a une disponibilite dans une page. */
function indicesDePrix(corps: string): Record<string, unknown> {
  const jsonLd = [...corps.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const prixJsonLd: unknown[] = [];
  for (const trouve of jsonLd) {
    try {
      const objet = JSON.parse(trouve[1]);
      for (const bloc of Array.isArray(objet) ? objet : [objet]) {
        if (bloc?.price !== undefined) prixJsonLd.push({ nom: bloc.name, price: bloc.price, offers: bloc.offers });
      }
    } catch {
      prixJsonLd.push("bloc illisible");
    }
  }

  return {
    octets: corps.length,
    prixEnEuros: [...new Set((corps.match(/\d+[,.]\d{2}\s*(?:€|&euro;|EUR)/g) ?? []))].slice(0, 8),
    prixAuKilo: [...new Set((corps.match(/\d+[,.]\d{2}\s*€?\s*\/\s*(?:kg|l|L|litre)/gi) ?? []))].slice(0, 5),
    prixJsonLd: prixJsonLd.slice(0, 3),
    clesDePrixNonNulles: [...new Set((corps.match(/"price"\s*:\s*[1-9]\d*(?:\.\d+)?/g) ?? []))].slice(0, 8),
    disponibilite: [...new Set((corps.match(/"(?:availability|inStock|isAvailable|outOfStock)"\s*:\s*[^,}]{0,24}/gi) ?? []))].slice(0, 6),
    mentionsDuMagasin: (corps.match(new RegExp(PDVREF, "g")) ?? []).length,
    mentionsAix: (corps.match(/aix-en-provence/gi) ?? []).length,
    liensProduit: [...new Set((corps.match(/\/produit\/[^"'\s]+/g) ?? []))].slice(0, 6).length,
  };
}

async function essaie(garde: Garde, url: string, fichier: string): Promise<Reponse | null> {
  try {
    return await garde.recupere(url, fichier);
  } catch (erreur) {
    if (erreur instanceof RefusDuSite || erreur instanceof HorsCadre) throw erreur;
    console.log(`  echec sur ${url} : ${(erreur as Error).message}`);
    return null;
  }
}

async function principal(): Promise<void> {
  const garde = new Garde();
  const resume: Record<string, unknown> = { lanceLe: new Date().toISOString() };

  // 1. Les regles de l'hote d'API, avant tout appel vers lui.
  const robotsApi = await essaie(garde, "https://api.internal.intermarche.com/robots.txt", "robots-api.txt");
  resume.robotsDeLApi = robotsApi
    ? { statut: robotsApi.statut, octets: robotsApi.corps.length, debut: robotsApi.corps.slice(0, 300) }
    : "inaccessible";

  // 2. Page de rayon : autorisee par robots.txt.
  const rayon = await essaie(garde, RAYON, "rayon-riz-basmati.html");
  resume.pageDeRayon = rayon ? { statut: rayon.statut, ...indicesDePrix(rayon.corps) } : "inaccessible";

  // 3. Fiche produit avec le magasin en parametre, sous l'exception.
  const produitMagasin = await essaie(garde, `${PRODUIT}?pdvref=${PDVREF}`, "produit-avec-magasin.html");
  resume.ficheProduitAvecMagasin = produitMagasin
    ? { statut: produitMagasin.statut, ...indicesDePrix(produitMagasin.corps) }
    : "inaccessible";

  resume.requetes = garde.compteurs;
  writeFileSync(join(DOSSIER_DATA, "sonde-prix.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\n--- resume ---");
  console.log(JSON.stringify(resume, null, 2));
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
