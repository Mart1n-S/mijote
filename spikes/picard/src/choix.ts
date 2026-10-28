// Mesure, hors ligne, la couverture des ingredients HelloFresh par le catalogue
// Picard, et choisit les 10 fiches a recuperer ensuite.
//
// Methode : rapprochement textuel entre le nom de l'ingredient HelloFresh et le
// slug des URL de produits du sitemap. C'est volontairement grossier, et le
// rapport doit le dire : on mesure une correspondance **plausible**, pas une
// correspondance validee. C'est ce que l'hypothese 6 aura a faire proprement.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

/** Une fiche produit Picard : /produits/<slug>-<identifiant 18 chiffres>.html */
const MOTIF_PRODUIT = /\/produits\/(.+)-(\d{10,})\.html$/;

type Produit = { url: string; slug: string; identifiant: string; lastmod?: string; mots: Set<string> };
type Ingredient = { nom: string; slug: string; type: string; livreParHelloFresh: boolean };

/** Minuscules, sans accents, sans ponctuation. */
function normalise(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Mots qui ne portent aucune information de produit.
const MOTS_VIDES = new Set([
  "de", "du", "des", "d", "a", "au", "aux", "en", "le", "la", "les", "l", "et", "ou", "sans", "avec",
  "pour", "sur", "bio", "frais", "fraiche", "fraiches", "surgele", "surgelee", "nature", "pieces",
  "piece", "tranches", "tranche", "sachet", "pot", "barquette", "label", "rouge", "msc", "g", "kg",
  "ml", "cl", "x", "mini", "maxi", "grand", "petit", "petits", "petites", "notre", "nos",
]);

/** Mots significatifs d'un libelle, singularises grossierement. */
function motsUtiles(texte: string): string[] {
  return normalise(texte)
    .split(" ")
    .map((mot) => (mot.length > 4 && mot.endsWith("s") ? mot.slice(0, -1) : mot))
    .filter((mot) => mot.length >= 3 && !MOTS_VIDES.has(mot));
}

function principal(): void {
  const urls: { url: string; lastmod?: string }[] = JSON.parse(
    readFileSync(join(DOSSIER_DATA, "sitemap-urls.json"), "utf8"),
  );
  const ingredients: Ingredient[] = JSON.parse(
    readFileSync(join(DOSSIER_DATA, "ingredients-hellofresh.json"), "utf8"),
  );

  const produits: Produit[] = [];
  for (const entree of urls) {
    const trouve = MOTIF_PRODUIT.exec(entree.url);
    if (!trouve) continue;
    produits.push({
      url: entree.url,
      slug: trouve[1],
      identifiant: trouve[2],
      lastmod: entree.lastmod,
      mots: new Set(motsUtiles(trouve[1])),
    });
  }

  // Pour chaque ingredient : le ou les produits dont le slug contient le plus de
  // ses mots significatifs. Le premier mot sert de tete de requete : s'il est
  // absent, on ne retient rien, pour eviter les rapprochements fantaisistes.
  const resultats = ingredients.map((ingredient) => {
    const mots = motsUtiles(ingredient.nom);
    const tete = mots[0];
    const candidats = produits
      .map((produit) => {
        const motsDuSlug = motsUtiles(produit.slug);
        return {
          url: produit.url,
          slug: produit.slug,
          identifiant: produit.identifiant,
          score: mots.filter((mot) => produit.mots.has(mot)).length,
          // Les slugs Picard commencent par la nature du produit
          // (« filets-poulet-7-10-pieces »). Si le mot principal de
          // l'ingredient apparait dans les deux premiers mots du slug, le
          // produit **est** cet ingredient. S'il apparait plus loin, c'est le
          // plus souvent un plat qui en contient (« ecrasee-pommes-terre-
          // huile-olive » pour « huile d'olive »). D'ou deux mesures.
          strict: tete !== undefined && motsDuSlug.slice(0, 2).includes(tete),
        };
      })
      .filter((c) => c.score > 0 && tete !== undefined && new Set(motsUtiles(c.slug)).has(tete))
      .sort((a, b) => Number(b.strict) - Number(a.strict) || b.score - a.score || a.slug.length - b.slug.length);

    return {
      ingredient: ingredient.nom,
      motsRetenus: mots,
      livreParHelloFresh: ingredient.livreParHelloFresh,
      candidats: candidats.length,
      candidatsStricts: candidats.filter((c) => c.strict).length,
      meilleur: candidats[0] ?? null,
      meilleurStrict: candidats.find((c) => c.strict) ?? null,
    };
  });

  const couverts = resultats.filter((r) => r.meilleur !== null);
  const couvertsStricts = resultats.filter((r) => r.meilleurStrict !== null);
  const livres = resultats.filter((r) => r.livreParHelloFresh);
  const couvertsStrictsLivres = couvertsStricts.filter((r) => r.livreParHelloFresh);

  // Les 10 fiches a recuperer, choisies parmi les correspondances strictes
  // seulement : c'est ce qui ressemble vraiment a l'ingredient.
  const choisies: { ingredient: string; url: string; score: number }[] = [];
  const dejaVu = new Set<string>();
  for (const resultat of [...couvertsStricts].sort((a, b) => b.meilleurStrict!.score - a.meilleurStrict!.score)) {
    if (choisies.length >= 10) break;
    const url = resultat.meilleurStrict!.url;
    if (dejaVu.has(url)) continue;
    dejaVu.add(url);
    choisies.push({ ingredient: resultat.ingredient, url, score: resultat.meilleurStrict!.score });
  }

  const resume = {
    catalogue: {
      urlsDansLeSitemap: urls.length,
      fichesProduit: produits.length,
      avecLastmod: produits.filter((p) => p.lastmod).length,
    },
    couverture: {
      ingredientsHelloFresh: ingredients.length,
      // Mesure large : un produit dont le nom contient le mot de l'ingredient.
      // Genereuse, car elle attrape les plats cuisines qui en contiennent.
      mesureLarge: {
        couverts: couverts.length,
        taux: `${Math.round((couverts.length / ingredients.length) * 100)} %`,
      },
      // Mesure stricte : le produit **est** l'ingredient, pas un plat qui en
      // contient. C'est elle qui compte pour la liste de courses.
      mesureStricte: {
        couverts: couvertsStricts.length,
        taux: `${Math.round((couvertsStricts.length / ingredients.length) * 100)} %`,
        // Les ingredients non livres par HelloFresh sont les produits de placard
        // (epices, huile, sel) : Picard n'est pas cense les vendre.
        parmiLesIngredientsLivres: `${couvertsStrictsLivres.length}/${livres.length}`,
        parmiLesProduitsDePlacard: `${couvertsStricts.length - couvertsStrictsLivres.length}/${ingredients.length - livres.length}`,
      },
    },
    fichesChoisies: choisies,
    detail: resultats,
  };

  writeFileSync(join(DOSSIER_DATA, "choix.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  const { detail, ...synthese } = resume;
  console.log(JSON.stringify(synthese, null, 2));
  console.log(`\n${detail.length} ingredients detailles dans data/choix.json`);
}

principal();
