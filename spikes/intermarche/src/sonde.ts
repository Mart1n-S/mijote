// Premiere etape du prototype Intermarche : comprendre le mecanisme avec le
// moins de requetes possible, avant d'aller chercher les 10 produits.
//
// Quatre questions :
//   1. la fiche magasin autorisee par robots.txt donne-t-elle l'identifiant du
//      magasin, ses coordonnees et ses horaires ?
//   2. comment le site rattache-t-il un magasin a la session (cookie ?) ;
//   3. quelle URL de recherche repond, et sous quelle forme ;
//   4. ou vivent le prix et la disponibilite sur une fiche produit : HTML rendu,
//      JSON embarque, ou appel client vers l'API.
//
// Tout passe par le garde-fou de src/garde.ts, qui applique le cadre.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, HorsCadre, RefusDuSite, type Reponse } from "./garde.ts";

// Magasin choisi : Intermarche SUPER Aix-en-Provence, avenue des Infirmeries.
// L'identifiant 11749 vient de l'URL de sa fiche, trouvee par un moteur de
// recherche et non en parcourant le localisateur, qui est interdit.
const PDVREF = "11749";
const FICHE_MAGASIN = `https://www.intermarche.com/magasins/${PDVREF}/aix-en-provence-13100/infos-pratiques`;

// Produit temoin pour comprendre la structure d'une fiche. Le code-barres est
// dans l'URL : c'est le pont vers Open Food Facts.
const PRODUIT_TEMOIN = "https://www.intermarche.com/produit/riz-basmati/3038354536002";

/** Formes d'URL de recherche a essayer, dans l'ordre, jusqu'a une reponse utile. */
const RECHERCHES_CANDIDATES = [
  "https://www.intermarche.com/recherche/riz%20basmati",
  "https://www.intermarche.com/recherche?q=riz%20basmati",
  "https://www.intermarche.com/rechercheproduits?q=riz%20basmati",
];

/** Indices techniques reperables dans une page, pour savoir ou chercher ensuite. */
function diagnostique(corps: string): Record<string, unknown> {
  const nextData = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(corps);
  const jsonLd = [...corps.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const typesJsonLd = jsonLd
    .map((trouve) => {
      try {
        const objet = JSON.parse(trouve[1]);
        return String(objet["@type"] ?? "?");
      } catch {
        return "illisible";
      }
    })
    .filter(Boolean);

  return {
    octets: corps.length,
    nextData: nextData ? `${nextData[1].length} octets` : "absent",
    nuxtOuApollo: /__NUXT__|__APOLLO_STATE__|self\.__next_f/.test(corps),
    blocsJsonLd: typesJsonLd,
    // Indices de prix : un prix en euros dans le HTML, ou des cles de prix JSON.
    prixDansLeTexte: (corps.match(/\d+[,.]\d{2}\s*(?:€|&euro;|EUR)/g) ?? []).slice(0, 5),
    clesDePrix: [...new Set((corps.match(/"(?:price|prix|unitPrice|pricePerUnit|priceLabel)"/gi) ?? []))].slice(0, 8),
    clesDeStock: [...new Set((corps.match(/"(?:availability|available|inStock|stock|disponib\w*)"/gi) ?? []))].slice(0, 8),
    mentionsDuMagasin: (corps.match(/pdvref|pointOfSale|pdvRef|idPdv|storeId/gi) ?? []).length,
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
  const garde = new Garde(true);
  const resume: Record<string, unknown> = {
    lanceLe: new Date().toISOString(),
    magasin: { pdvref: PDVREF, ficheUtilisee: FICHE_MAGASIN },
  };

  // 1. robots.txt, piece au dossier : il peut changer, on garde celui du jour.
  const robots = await garde.recupere("https://www.intermarche.com/robots.txt", "robots.txt", "text/plain");
  resume.robots = {
    octets: robots.corps.length,
    lignesDisallow: (robots.corps.match(/^Disallow:/gm) ?? []).length,
    lignesAllow: (robots.corps.match(/^Allow:/gm) ?? []).length,
  };

  // 2. Fiche magasin : autorisee explicitement par robots.txt.
  const magasin = await garde.recupere(FICHE_MAGASIN, "magasin-fiche.html");
  resume.ficheMagasin = {
    statut: magasin.statut,
    ...diagnostique(magasin.corps),
    titre: /<title>([^<]+)<\/title>/.exec(magasin.corps)?.[1]?.trim(),
  };

  // 3. Rattachement du magasin a la session. Sous l'exception : « Disallow: /?pdvref* ».
  const selection = await garde.recupere(`https://www.intermarche.com/?pdvref=${PDVREF}`, "selection-magasin.html");
  resume.selectionMagasin = {
    statut: selection.statut,
    cookiesRecus: selection.entetes.getSetCookie().map((c) => c.split("=")[0]),
    pdvDansLaPage: (selection.corps.match(new RegExp(PDVREF, "g")) ?? []).length,
  };

  // 4. Quelle forme d'URL de recherche repond ? Sous l'exception.
  const recherches: Record<string, unknown>[] = [];
  for (const [index, url] of RECHERCHES_CANDIDATES.entries()) {
    const reponse = await essaie(garde, url, `recherche-candidate-${index + 1}.html`);
    if (!reponse) continue;
    recherches.push({
      url,
      statut: reponse.statut,
      ...diagnostique(reponse.corps),
      // Une page de resultats doit contenir des liens vers des fiches produit.
      liensProduit: [...new Set((reponse.corps.match(/\/produit\/[^"'\s]+/g) ?? []))].slice(0, 5),
    });
    if (reponse.statut === 200) break;
  }
  resume.recherche = recherches;

  // 5. Fiche produit : autorisee par robots.txt, pas besoin de l'exception.
  const produit = await garde.recupere(PRODUIT_TEMOIN, "produit-temoin.html");
  resume.ficheProduit = { url: PRODUIT_TEMOIN, statut: produit.statut, ...diagnostique(produit.corps) };

  resume.requetes = garde.compteurs;
  writeFileSync(join(DOSSIER_DATA, "sonde.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\n--- resume ---");
  console.log(JSON.stringify(resume, null, 2));
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
