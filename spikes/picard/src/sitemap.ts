// Premiere etape de l'hypothese 3 : le sitemap publie par Picard.
//
// Trois questions :
//   1. combien d'URL de produits le site declare-t-il (la taille du catalogue) ;
//   2. quelle forme ont ces URL, pour reconnaitre une fiche produit ;
//   3. y a-t-il un `lastmod` par produit ? C'est la condition d'une mise a jour
//      hebdomadaire incrementale, au lieu de tout relire chaque semaine.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA } from "./garde.ts";

const ROBOTS = "https://www.picard.fr/robots.txt";
const SITEMAP = "https://www.picard.fr/sitemap_0.xml";

type Entree = { url: string; lastmod?: string; changefreq?: string; priority?: string };

/** Extraction sans dependance : le XML des sitemaps est tres regulier. */
function litEntrees(xml: string, balise: "url" | "sitemap"): Entree[] {
  const entrees: Entree[] = [];
  const bloc = new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`, "g");
  for (const trouve of xml.matchAll(bloc)) {
    const contenu = trouve[1];
    const champ = (nom: string) => new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`).exec(contenu)?.[1]?.trim();
    const url = champ("loc");
    if (url) {
      entrees.push({
        url,
        lastmod: champ("lastmod"),
        changefreq: champ("changefreq"),
        priority: champ("priority"),
      });
    }
  }
  return entrees;
}

/** Repartition des URL par premier segment de chemin, pour deviner la structure. */
function parSegment(urls: string[]): Record<string, number> {
  const compte = new Map<string, number>();
  for (const url of urls) {
    const chemin = new URL(url).pathname.split("/").filter(Boolean);
    const cle = chemin.slice(0, 2).join("/") || "(racine)";
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  return Object.fromEntries([...compte].sort((a, b) => b[1] - a[1]).slice(0, 15));
}

async function principal(): Promise<void> {
  const garde = new Garde(true);
  const resume: Record<string, unknown> = { lanceLe: new Date().toISOString() };

  // 1. robots.txt date, piece au dossier du rapport.
  const robots = await garde.recupere(ROBOTS, "robots.txt", "text/plain");
  resume.robots = {
    octets: robots.corps.length,
    disallow: (robots.corps.match(/^Disallow:/gm) ?? []).length,
    allow: (robots.corps.match(/^Allow:/gm) ?? []).length,
    sitemapsDeclares: [...robots.corps.matchAll(/^Sitemap:\s*(\S+)/gim)].map((t) => t[1]),
  };

  // 2. Le sitemap annonce par robots.txt : index ou liste d'URL ?
  const racine = await garde.recupere(SITEMAP, "sitemap-0.xml", "application/xml");
  const estIndex = /<sitemapindex/i.test(racine.corps);
  resume.sitemapRacine = { url: SITEMAP, octets: racine.corps.length, estUnIndex: estIndex };

  let entrees: Entree[] = [];
  let source = SITEMAP;

  if (estIndex) {
    const enfants = litEntrees(racine.corps, "sitemap");
    resume.sousSitemaps = {
      nombre: enfants.length,
      liste: enfants.map((e) => ({ url: e.url, lastmod: e.lastmod })),
    };

    // On choisit le sous-sitemap qui ressemble le plus a un catalogue produits.
    const candidat =
      premierCorrespondant(enfants, /produit|product/i) ?? premierCorrespondant(enfants, /fr_FR|fr-fr/i) ?? enfants[0];
    if (!candidat) throw new Error("Index de sitemaps vide.");
    source = candidat.url;
    const enfant = await garde.recupere(source, "sitemap-produits.xml", "application/xml");
    entrees = litEntrees(enfant.corps, "url");
  } else {
    entrees = litEntrees(racine.corps, "url");
  }

  const avecLastmod = entrees.filter((e) => e.lastmod);
  const dates = avecLastmod.map((e) => e.lastmod!).sort();

  resume.urls = {
    source,
    total: entrees.length,
    repartitionParSegment: parSegment(entrees.map((e) => e.url)),
    exemples: entrees.slice(0, 5).map((e) => e.url),
  };
  resume.lastmod = {
    presentSur: `${avecLastmod.length}/${entrees.length}`,
    plusAncien: dates[0],
    plusRecent: dates.at(-1),
    changefreqRencontrees: [...new Set(entrees.map((e) => e.changefreq).filter(Boolean))],
  };

  // La liste complete sert ensuite hors ligne, pour choisir 10 fiches.
  writeFileSync(join(DOSSIER_DATA, "sitemap-urls.json"), `${JSON.stringify(entrees, null, 1)}\n`, "utf8");
  resume.requetes = garde.total;
  writeFileSync(join(DOSSIER_DATA, "sitemap.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\n--- resume ---");
  console.log(JSON.stringify(resume, null, 2));
}

/** Premier sous-sitemap dont l'URL correspond au motif. */
function premierCorrespondant(enfants: Entree[], motif: RegExp): Entree | undefined {
  return enfants.find((e) => motif.test(e.url));
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
