// Deuxieme etape de l'hypothese 3 : recuperer 10 fiches produit Picard, sur des
// chemins autorises par leur robots.txt, et les enregistrer dans data/.
//
// Les 10 fiches ne sont pas prises au hasard : elles viennent des
// correspondances avec les ingredients HelloFresh proposees par src/choix.ts et
// verifiees a la main (voir le rapport). Ce sont des produits qui **sont**
// l'ingredient, pas des plats qui en contiennent.
//
// L'analyse des pages est dans src/extraction.ts et ne touche pas au reseau :
// on peut la relancer autant de fois qu'on veut sans resolliciter le site.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, HorsCadre, RefusDuSite } from "./garde.ts";
import { extrait } from "./extraction.ts";

const FICHES: { ingredient: string; url: string }[] = [
  { ingredient: "Filet de poulet", url: "https://www.picard.fr/produits/filets-poulet-7-10-pieces-000000000000000545.html" },
  { ingredient: "Champignons de Paris", url: "https://www.picard.fr/produits/champignons-paris-eminces-000000000000006500.html" },
  { ingredient: "Épinards", url: "https://www.picard.fr/produits/epinards-haches-000000000000000586.html" },
  { ingredient: "Oignon", url: "https://www.picard.fr/produits/oignons-cubes-000000000000012874.html" },
  { ingredient: "Persil", url: "https://www.picard.fr/produits/persil-coupe-000000000000002277.html" },
  { ingredient: "Pâte à pizza", url: "https://www.picard.fr/produits/2-pates-pizza-000000000000043976.html" },
  { ingredient: "Moutarde", url: "https://www.picard.fr/produits/moutarde-bourgogne-igp-000000000000085324.html" },
  { ingredient: "Banane", url: "https://www.picard.fr/produits/300g-banane-rondelles-000000000000010096.html" },
  { ingredient: "Échalote", url: "https://www.picard.fr/produits/echalote-coupee-000000000000006104.html" },
  { ingredient: "Gingembre frais", url: "https://www.picard.fr/produits/gingembre-coupe-000000000000013568.html" },
];

const LIMITE = Number(process.env.FICHES ?? FICHES.length);

async function principal(): Promise<void> {
  const garde = new Garde();
  const fiches: Record<string, unknown>[] = [];
  const index: { ingredient: string; url: string }[] = [];

  for (const [position, fiche] of FICHES.slice(0, LIMITE).entries()) {
    const fichier = `produit-${String(position + 1).padStart(2, "0")}.html`;
    try {
      const reponse = await garde.recupere(fiche.url, fichier);
      index.push(fiche);
      fiches.push({ ...fiche, statut: reponse.statut, ...extrait(reponse.corps, fiche.url) });
      console.log(`[${fiche.ingredient}] ok`);
    } catch (erreur) {
      if (erreur instanceof RefusDuSite || erreur instanceof HorsCadre) throw erreur;
      index.push(fiche);
      fiches.push({ ...fiche, echec: (erreur as Error).message });
    }
  }

  // L'index permet a src/extraction.ts de relier chaque fichier a son ingredient.
  writeFileSync(join(DOSSIER_DATA, "produits-index.json"), `${JSON.stringify(index, null, 1)}\n`, "utf8");
  writeFileSync(
    join(DOSSIER_DATA, "produits.json"),
    `${JSON.stringify({ lanceLe: new Date().toISOString(), requetes: garde.total, fiches }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n${fiches.length} fiches enregistrees, ${garde.total} requetes.`);
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
