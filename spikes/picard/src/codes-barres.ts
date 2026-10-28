// Recupere 40 fiches produit Picard de plus que les 10 de l'hypothese 3, pour
// constituer l'echantillon de codes-barres de l'hypothese 5.
//
// Depassement du plafond de 10 produits du CLAUDE.md : autorise explicitement
// par Martin pour cette hypothese, avec les memes regles (decouverte par le
// sitemap, 4 s d'ecart, arret au premier blocage). Le plafond de requetes du
// garde-fou est donc releve par variable d'environnement, pour ce script seul.
//
// Les 40 fiches sont des ingredients et non des plats cuisines : src/selection.ts
// a propose des candidats par mots-cles, et je les ai revus un par un. Les URL
// viennent telles quelles du sitemap, jamais reconstruites.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, HorsCadre, RefusDuSite } from "./garde.ts";
import { extrait } from "./extraction.ts";

const FICHES: { ingredient: string; url: string }[] = [
  { ingredient: "Carotte", url: "https://www.picard.fr/produits/carottes-rondelles-bio-000000000000010305.html" },
  { ingredient: "Courgette", url: "https://www.picard.fr/produits/courgettes-rondelles-bio-000000000000010313.html" },
  { ingredient: "Poireau", url: "https://www.picard.fr/produits/poireaux-rondelles-benelux-000000000000000180.html" },
  { ingredient: "Haricot vert", url: "https://www.picard.fr/produits/haricots-verts-extra-fins-000000000000006542.html" },
  { ingredient: "Brocoli", url: "https://www.picard.fr/produits/fleurettes-brocolis-espagne-000000000000010123.html" },
  { ingredient: "Chou-fleur", url: "https://www.picard.fr/produits/choux-fleurs-fleurettes-bio-000000000000010248.html" },
  { ingredient: "Chou de Bruxelles", url: "https://www.picard.fr/produits/choux-bruxelles-belgique-000000000000059936.html" },
  { ingredient: "Asperge", url: "https://www.picard.fr/produits/asperges-vertes-000000000000010090.html" },
  { ingredient: "Artichaut", url: "https://www.picard.fr/produits/fonds-artichauts-egypte-000000000000000081.html" },
  { ingredient: "Épinard en branches", url: "https://www.picard.fr/produits/epinards-branches-000000000000010157.html" },
  { ingredient: "Oignon émincé", url: "https://www.picard.fr/produits/oignons-eminces-000000000000005015.html" },
  { ingredient: "Ail", url: "https://www.picard.fr/produits/ail-coupe-000000000000008753.html" },
  { ingredient: "Poivron", url: "https://www.picard.fr/produits/poivrons-piquillo-grilles-000000000000087012.html" },
  { ingredient: "Maïs", url: "https://www.picard.fr/produits/600g-3-epis-mais-srp-000000000000087955.html" },
  { ingredient: "Framboise", url: "https://www.picard.fr/produits/framboises-entieres-000000000000068080.html" },
  { ingredient: "Mangue", url: "https://www.picard.fr/produits/mangues-tranches-philippines-000000000000003168.html" },
  { ingredient: "Myrtille", url: "https://www.picard.fr/produits/myrtilles-sauvages-bio-000000000000068810.html" },
  { ingredient: "Fraise", url: "https://www.picard.fr/produits/fraises-entieres-maroc-bulgarie-000000000000068093.html" },
  { ingredient: "Cerise", url: "https://www.picard.fr/produits/cerise-noire-denoyautee-000000000000068797.html" },
  { ingredient: "Cuisse de poulet", url: "https://www.picard.fr/produits/cuisses-poulet-5-7-pieces-000000000000000727.html" },
  { ingredient: "Escalope de dinde", url: "https://www.picard.fr/produits/escalopes-dinde-000000000000005437.html" },
  { ingredient: "Steak haché", url: "https://www.picard.fr/produits/10-steaks-haches-15-m_g-maximum-000000000000000289.html" },
  { ingredient: "Boeuf haché", url: "https://www.picard.fr/produits/hache-pur-boeuf-pret-cuisiner-000000000000060123.html" },
  { ingredient: "Côtelette d agneau", url: "https://www.picard.fr/produits/cotelettes-agneau-500g-000000000000010064.html" },
  { ingredient: "Sauté de veau", url: "https://www.picard.fr/produits/saute-veau-000000000000014525.html" },
  { ingredient: "Farce de porc", url: "https://www.picard.fr/produits/farce-pur-porc-000000000000010087.html" },
  { ingredient: "Cabillaud", url: "https://www.picard.fr/produits/4-dos-cabillaud-msc-000000000000017738.html" },
  { ingredient: "Colin", url: "https://www.picard.fr/produits/filets-colin-alaska-msc-000000000000074103.html" },
  { ingredient: "Merlu", url: "https://www.picard.fr/produits/dos-merlu-blanc-cap-msc-000000000000017829.html" },
  { ingredient: "Truite", url: "https://www.picard.fr/produits/filets-truite-arc-en-ciel-000000000000074208.html" },
  { ingredient: "Dorade", url: "https://www.picard.fr/produits/filets-dorade-sebaste-msc-000000000000019538.html" },
  { ingredient: "Crevette crue", url: "https://www.picard.fr/produits/crevettes-crues-16-24-000000000000048020.html" },
  { ingredient: "Noix de Saint-Jacques", url: "https://www.picard.fr/produits/noix-saint-jacques-argentine-msc-000000000000048939.html" },
  { ingredient: "Sardine", url: "https://www.picard.fr/produits/filet-sardine-france-500g-000000000000074636.html" },
  { ingredient: "Basilic", url: "https://www.picard.fr/produits/basilic-coupe-000000000000012733.html" },
  { ingredient: "Coriandre", url: "https://www.picard.fr/produits/coriandre-coupee-000000000000012577.html" },
  { ingredient: "Thym", url: "https://www.picard.fr/produits/thym-coupe-000000000000012684.html" },
  { ingredient: "Aneth", url: "https://www.picard.fr/produits/aneth-coupe-000000000000012759.html" },
  { ingredient: "Menthe", url: "https://www.picard.fr/produits/menthe-douce-coupee-000000000000012808.html" },
  { ingredient: "Edamame", url: "https://www.picard.fr/produits/300g-feve-soja-edamame-000000000000087149.html" },
];

async function principal(): Promise<void> {
  const garde = new Garde();
  const codes: Record<string, unknown>[] = [];

  // Les 10 fiches de l'hypothese 3 sont deja analysees : on reprend leurs
  // codes-barres sans refaire une seule requete.
  const dejaLa = join(DOSSIER_DATA, "produits.json");
  if (existsSync(dejaLa)) {
    for (const fiche of JSON.parse(readFileSync(dejaLa, "utf8")).fiches ?? []) {
      codes.push({
        source: "hypothese 3",
        ingredient: fiche.ingredient,
        nom: fiche.nom,
        codeBarres: fiche.codeBarres,
        prix: fiche.prix,
        conditionnement: fiche.conditionnement,
      });
    }
  }

  for (const fiche of FICHES) {
    try {
      const reponse = await garde.recupere(fiche.url);
      const champs = extrait(reponse.corps, fiche.url);
      codes.push({
        source: "hypothese 5",
        ingredient: fiche.ingredient,
        nom: champs.nom,
        codeBarres: champs.codeBarres,
        prix: champs.prix,
        conditionnement: champs.conditionnement,
      });
      console.log(`[${fiche.ingredient}] ${champs.nom} -> ${champs.codeBarres}`);
    } catch (erreur) {
      if (erreur instanceof RefusDuSite || erreur instanceof HorsCadre) throw erreur;
      codes.push({ source: "hypothese 5", ingredient: fiche.ingredient, echec: (erreur as Error).message });
    }
  }

  const avecCode = codes.filter((c) => typeof c.codeBarres === "string" && c.codeBarres);
  writeFileSync(
    join(DOSSIER_DATA, "codes-barres.json"),
    `${JSON.stringify({ lanceLe: new Date().toISOString(), requetes: garde.total, fiches: codes }, null, 2)}
`,
    "utf8",
  );
  console.log(`
${codes.length} fiches, ${avecCode.length} avec un code-barres, ${garde.total} requetes.`);
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
