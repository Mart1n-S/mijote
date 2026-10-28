// Extraction des champs d'une fiche produit Picard, sans reseau : relit les
// pages deja enregistrees dans data/ par src/produits.ts.
//
// Le site est rendu cote serveur et expose des microdonnees schema.org
// completes. Deux pieges reperes a la premiere lecture, et corriges ici :
//   - le Nutri-Score : le mot apparait dans le menu de navigation (« Produits
//     Nutri-Score A »), donc une recherche naive le trouve sur toutes les
//     fiches. Le vrai score est porte par l'attribut alt d'une image ;
//   - le bloc data-gtm : il y en a un par produit recommande en bas de page. Le
//     bon est le premier, et son item_id doit correspondre a celui de l'URL.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

/** Accents des entites nommees : &eacute; comme &Eacute;, donc casse respectee. */
const ACCENTS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  uml: "̈",
  cedil: "̧",
  tilde: "̃",
};

function decode(texte: string): string {
  return texte
    .replace(/&quot;/g, '"')
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&#8364;|&euro;/g, "€")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    // Lettre plus accent combinatoire, puis normalisation en caractere unique.
    .replace(/&([A-Za-z])(acute|grave|circ|uml|cedil|tilde);/g, (entier, lettre, accent) => {
      const combinant = ACCENTS[accent as keyof typeof ACCENTS];
      return combinant ? (lettre + combinant).normalize("NFC") : entier;
    })
    .replace(/&amp;/g, "&");
}

/** <meta itemprop="x" content="..."> */
function metaProp(corps: string, nom: string): string | null {
  const trouve = new RegExp(`<meta[^>]+itemprop="${nom}"[^>]+content="([^"]*)"`, "i").exec(corps);
  return trouve ? decode(trouve[1]) : null;
}

/** Scores affiches sous forme d'image : alt="Nutri-score B", alt="Planet-score D". */
function scores(corps: string): { nutriScore: string | null; planetScore: string | null } {
  let nutri: string | null = null;
  let planet: string | null = null;
  for (const trouve of corps.matchAll(/<img[^>]+alt="(Nutri-score|Planet-score)\s+([A-E])"/gi)) {
    if (/nutri/i.test(trouve[1])) nutri = trouve[2].toUpperCase();
    else planet = trouve[2].toUpperCase();
  }
  return { nutriScore: nutri, planetScore: planet };
}

/** Premier bloc analytique de la page : celui du produit affiche. */
function gtmDuProduit(corps: string, identifiantAttendu: string | null): Record<string, any> | null {
  for (const trouve of corps.matchAll(/data-gtm="([^"]+)"/g)) {
    try {
      const objet = JSON.parse(decode(trouve[1]));
      if (!objet.item_id) continue;
      if (identifiantAttendu && objet.item_id !== identifiantAttendu) continue;
      return objet;
    } catch {
      // bloc non JSON : on ignore
    }
  }
  return null;
}

export type FicheExtraite = Record<string, unknown>;

export function extrait(corps: string, url: string): FicheExtraite {
  const identifiant = /-(\d{10,})\.html$/.exec(url)?.[1] ?? null;
  const gtm = gtmDuProduit(corps, identifiant);
  const { nutriScore, planetScore } = scores(corps);
  const decode1 = decode(corps);

  return {
    identifiant,
    // Microdonnees schema.org, rendues cote serveur.
    nom: metaProp(corps, "name") ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(decode1)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null,
    marque: metaProp(corps, "brand"),
    codeBarres: metaProp(corps, "gtin13"),
    sku: metaProp(corps, "sku"),
    prix: metaProp(corps, "price"),
    devise: metaProp(corps, "priceCurrency"),
    disponibilite: metaProp(corps, "availability"),
    prixValableJusquAu: metaProp(corps, "priceValidUntil"),
    description: metaProp(corps, "description")?.slice(0, 80) ?? null,
    // Affichage, utile pour le prix au kilo que les microdonnees ne portent pas.
    prixAuKilo: /Prix au kilo\s*<\/span>\s*([^<]+)/i.exec(decode1)?.[1]?.trim() ?? null,
    conditionnement: /pi-ProductDetails-weight[^>]*>\s*<span>([^<]+)<\/span>/i.exec(decode1)?.[1]?.trim() ?? null,
    reference: /Ref:\s*(\d+)/i.exec(decode1.replace(/<[^>]+>/g, " "))?.[1] ?? null,
    nutriScore,
    planetScore,
    // Categorie : le fil d'Ariane et le bloc analytique se recoupent.
    categorie: gtm ? `${gtm.item_category2 ?? ""} / ${gtm.item_range ?? ""}` : null,
    filDAriane: /"breadCrumb":"([^"]*)"/.exec(decode1)?.[1] ?? null,
    disponibiliteGtm: gtm?.item_availability ?? null,
    nomGtm: gtm?.item_name ?? null,
    // Nutrition : le tableau est-il present dans la page ?
    tableauNutritionnel: /valeurs? nutritionnelles?/i.test(decode1),
    energieKcal: /([\d.,]+)\s*k(?:cal|Cal)/.exec(decode1)?.[1] ?? null,
    // Disponibilite par magasin : le bouton existe, mais il ouvre une fenetre
    // servie par /on/demandware.store/, interdit par le robots.txt du site.
    boutonDisponibiliteEnMagasin: /js-gtm-store-availability/.test(corps),
    octets: corps.length,
  };
}

function principal(): void {
  const fichiers = readdirSync(DOSSIER_DATA)
    .filter((f) => /^produit-\d+\.html$/.test(f))
    .sort();
  const index: { ingredient: string; url: string }[] = JSON.parse(
    readFileSync(join(DOSSIER_DATA, "produits-index.json"), "utf8"),
  );

  const fiches: FicheExtraite[] = fichiers.map((fichier, position) => {
    const corps = readFileSync(join(DOSSIER_DATA, fichier), "utf8");
    const entree = index[position];
    return { fichier, ingredient: entree?.ingredient ?? "?", ...extrait(corps, entree?.url ?? "") };
  });

  writeFileSync(
    join(DOSSIER_DATA, "produits.json"),
    `${JSON.stringify({ extraitLe: new Date().toISOString(), fiches }, null, 2)}\n`,
    "utf8",
  );

  for (const f of fiches) {
    console.log(
      `${String(f.ingredient).padEnd(22)} ${String(f.nom).slice(0, 34).padEnd(36)} ${String(f.prix).padStart(6)} € ` +
        `${String(f.prixAuKilo ?? "").padEnd(12)} ${String(f.disponibilite).replace("https://schema.org/", "").padEnd(11)} ` +
        `ean=${f.codeBarres} nutri=${f.nutriScore ?? "-"} planet=${f.planetScore ?? "-"}`,
    );
  }
}

// Execute seulement si lance directement, pas a l'import depuis produits.ts.
if (process.argv[1]?.endsWith("extraction.ts")) principal();
