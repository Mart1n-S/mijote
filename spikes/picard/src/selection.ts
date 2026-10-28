// Propose, hors ligne, des fiches Picard qui soient des **ingredients** et non
// des plats cuisines, pour constituer l'echantillon de codes-barres de
// l'hypothese 5 (couverture d'Open Food Facts).
//
// Aucune requete : on relit le sitemap deja enregistre par src/sitemap.ts.
//
// La selection par mots-cles ne suffit jamais a elle seule, on l'a mesure a
// l'hypothese 3 : elle attrape les plats qui contiennent le mot. Elle ne sert
// donc qu'a proposer des candidats, que je revois a la main avant de recuperer
// quoi que ce soit. Les retenus sont inscrits en dur dans src/codes-barres.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

const MOTIF_PRODUIT = /\/produits\/(.+)-(\d{10,})\.html$/;

/** Familles d'ingredients recherchees, telles qu'elles apparaissent dans les slugs. */
const INGREDIENTS = [
  // legumes
  "epinard", "carotte", "poireau", "haricot", "petit-pois", "brocoli", "chou", "courgette",
  "aubergine", "poivron", "oignon", "echalote", "ail", "champignon", "artichaut", "panais",
  "betterave", "mais", "celeri", "potiron", "butternut", "navet", "asperge", "fenouil",
  "salsifis", "topinambour", "edamame", "soja",
  // fruits
  "framboise", "mangue", "myrtille", "fraise", "banane", "citron", "ananas", "cassis",
  "cerise", "abricot", "peche", "poire", "pomme", "rhubarbe", "mure", "groseille",
  // viandes
  "poulet", "dinde", "boeuf", "hache", "canard", "porc", "agneau", "veau", "lardon", "jambon",
  // poissons et fruits de mer
  "cabillaud", "saumon", "colin", "lieu", "dorade", "bar-", "truite", "crevette", "moule",
  "saint-jacques", "calamar", "thon", "sardine", "merlu", "sole", "espadon", "gambas",
  "encornet", "poulpe", "lotte", "crabe", "homard", "langoustine",
  // herbes et aromates
  "persil", "basilic", "ciboulette", "coriandre", "thym", "laurier", "aneth", "estragon",
  "menthe", "gingembre", "curcuma", "citronnelle",
  // pates a derouler
  "pate-brisee", "pate-feuilletee", "pate-pizza", "pate-a-pizza", "pate-sablee",
];

/** Ce qui trahit un plat cuisine, un dessert ou un produit d'apero. */
const PLATS = [
  "gratin", "lasagne", "parmentier", "hachis", "risotto", "paella", "curry", "tajine",
  "soupe", "veloute", "potage", "quiche", "tarte", "tartelette", "pizza-", "bowl", "wok",
  "poelee", "mijote", "blanquette", "bourguignon", "chili", "couscous", "nugget", "beignet",
  "pane", "crumble", "glace", "sorbet", "dessert", "mousse", "buche", "macaron", "cookie",
  "pain", "brioche", "croissant", "gaufre", "crepe", "blini", "verrine", "canape", "feuillete",
  "croque", "burger", "sandwich", "wrap", "nem", "samoussa", "accras", "falafel", "boulette",
  "cordon-bleu", "escalope-pane", "brandade", "bouchee", "tourte", "friand", "pie-", "cake",
  "clafoutis", "tiramisu", "panna", "yaourt", "fromage-blanc", "aperitif", "apero", "tapas",
  "plateau", "assortiment", "coffret", "menu", "duo-", "trio-", "box",
];

type Entree = { url: string; lastmod?: string };

function principal(): void {
  const urls: Entree[] = JSON.parse(readFileSync(join(DOSSIER_DATA, "sitemap-urls.json"), "utf8"));

  const produits = urls
    .map((entree) => {
      const trouve = MOTIF_PRODUIT.exec(entree.url);
      return trouve ? { url: entree.url, slug: trouve[1], identifiant: trouve[2], lastmod: entree.lastmod } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const candidats = produits
    .filter((produit) => INGREDIENTS.some((mot) => produit.slug.includes(mot)))
    .filter((produit) => !PLATS.some((mot) => produit.slug.includes(mot)));

  // Regroupement par famille, pour que l'echantillon soit varie et pas compose
  // de quinze sortes d'epinards.
  const parFamille = new Map<string, typeof candidats>();
  for (const candidat of candidats) {
    const famille = INGREDIENTS.find((mot) => candidat.slug.includes(mot)) ?? "autre";
    if (!parFamille.has(famille)) parFamille.set(famille, []);
    parFamille.get(famille)!.push(candidat);
  }

  const resume = {
    produitsDansLeSitemap: produits.length,
    candidatsApresFiltrage: candidats.length,
    familles: parFamille.size,
    parFamille: Object.fromEntries(
      [...parFamille].sort((a, b) => b[1].length - a[1].length).map(([famille, liste]) => [famille, liste.length]),
    ),
  };

  writeFileSync(
    join(DOSSIER_DATA, "candidats.json"),
    `${JSON.stringify({ ...resume, candidats }, null, 1)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(resume, null, 2));
  console.log("\n--- un candidat par famille, pour revue manuelle ---");
  for (const [famille, liste] of [...parFamille].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${famille.padEnd(16)} ${liste.length.toString().padStart(3)}  ${liste[0].slug.slice(0, 54)}`);
  }
}

principal();
