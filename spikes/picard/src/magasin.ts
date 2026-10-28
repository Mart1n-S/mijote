// Troisieme etape de l'hypothese 3 : le magasin.
//
// Deux questions distinctes, qu'il faut garder separees :
//   1. le localisateur donne-t-il les magasins avec leurs coordonnees ?
//      (c'est l'hypothese 4, preparee ici parce qu'on y est)
//   2. la disponibilite d'un produit depend-elle du magasin, et si oui est-elle
//      lisible sur un chemin autorise ? (c'est le coeur de l'hypothese 3)
//
// magasins.picard.fr a son propre robots.txt, beaucoup plus permissif que celui
// du site marchand : « Allow: /search/* », et il publie un sitemap. On le lit
// avant tout appel.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, HorsCadre, RefusDuSite } from "./garde.ts";

// Magasin de test : Picard, 11 avenue Henri Malacrida, 13100 Aix-en-Provence.
// Les URL du localisateur portent le nom du lieu, pas celui de la ville :
// « /12-picard-aix-malacrida » et non « aix-en-provence ».
const VILLE = /-aix-|-aix$/i;
const RUE = /malacrida/i;

function litLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((t) => t[1].trim());
}

async function principal(): Promise<void> {
  const garde = new Garde();
  const resume: Record<string, unknown> = { lanceLe: new Date().toISOString() };

  // 1. Les regles du localisateur, avant de l'interroger.
  const robots = await garde.recupere("https://magasins.picard.fr/robots.txt", "robots-magasins.txt", "text/plain");
  resume.robotsDuLocalisateur = {
    contenu: robots.corps.trim().split("\n").map((l) => l.trim()),
  };

  // 2. Son sitemap : combien de magasins, et sous quelle forme d'URL ?
  const sitemap = await garde.recupere("https://magasins.picard.fr/sitemap.xml", "sitemap-magasins.xml", "application/xml");
  const estIndex = /<sitemapindex/i.test(sitemap.corps);
  let urls = litLocs(sitemap.corps);

  if (estIndex) {
    // Index a quatre entrees : mainsitemap porte les pages de region et de
    // ville, et locationsitemap1 a 3 portent les fiches de magasin. On ne
    // descend que dans ces dernieres, et on s'arrete des qu'on a trouve.
    const enfants = urls.filter((u) => /locationsitemap/i.test(u));
    const suivis: string[] = [];
    urls = [];
    for (const [position, enfant] of enfants.entries()) {
      const reponse = await garde.recupere(
        enfant,
        `sitemap-magasins-${position + 1}.xml`,
        "application/xml",
      );
      suivis.push(enfant);
      urls.push(...litLocs(reponse.corps));
      if (urls.some((u) => RUE.test(u))) break;
    }
    resume.sitemapDuLocalisateur = {
      estUnIndex: true,
      sousSitemaps: litLocs(sitemap.corps).length,
      suivis,
    };
  } else {
    resume.sitemapDuLocalisateur = { estUnIndex: false };
  }

  const fiches = urls.filter((u) => !/\/search/.test(u));
  (resume.sitemapDuLocalisateur as Record<string, unknown>).urls = urls.length;
  (resume.sitemapDuLocalisateur as Record<string, unknown>).fichesDeMagasin = fiches.length;
  (resume.sitemapDuLocalisateur as Record<string, unknown>).exemples = fiches.slice(0, 5);

  // 3. Le magasin de test : on le reconnait par sa ville, puis par sa rue.
  const candidats = fiches.filter((u) => VILLE.test(u));
  const cible = candidats.find((u) => RUE.test(u)) ?? candidats[0];
  resume.magasinRecherche = { candidatsPourLaVille: candidats, cible: cible ?? null };

  if (!cible) {
    console.log("Aucune fiche de magasin ne correspond a la ville cherchee.");
  } else {
    const fiche = await garde.recupere(cible, "magasin-aix.html", "text/html");
    const texte = fiche.corps.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    resume.ficheDuMagasin = {
      url: cible,
      statut: fiche.statut,
      octets: fiche.corps.length,
      titre: /<title>([^<]+)<\/title>/.exec(fiche.corps)?.[1]?.trim(),
      adresseTrouvee: RUE.test(texte),
      codePostal: /\b13\d{3}\b/.exec(texte)?.[0] ?? null,
      // Coordonnees : utiles pour trier les magasins par distance (section 5).
      latitude: /"latitude"\s*:\s*"?(-?\d+\.\d+)/i.exec(fiche.corps)?.[1] ?? null,
      longitude: /"longitude"\s*:\s*"?(-?\d+\.\d+)/i.exec(fiche.corps)?.[1] ?? null,
      telephone: /(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}/.exec(texte)?.[0] ?? null,
      horairesMentionnes: /horaires?|ouvert/i.test(texte),
      jsonLd: [...fiche.corps.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((t) => {
        try {
          return String(JSON.parse(t[1])["@type"] ?? "?");
        } catch {
          return "(illisible)";
        }
      }),
      // Le localisateur parle-t-il de stock produit par produit ?
      mentionneDuStockProduit: /disponibilit[eé] (?:du|des) produit|stock/i.test(texte),
    };
  }

  resume.requetes = garde.total;
  writeFileSync(join(DOSSIER_DATA, "magasin.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\n--- resume ---");
  console.log(JSON.stringify(resume, null, 2));
}

principal().catch((erreur: Error) => {
  if (erreur instanceof RefusDuSite || erreur instanceof HorsCadre) {
    console.error(`ARRET (cadre) : ${erreur.message}`);
  } else {
    console.error(`ARRET : ${erreur.message}`);
  }
  process.exitCode = 1;
});
