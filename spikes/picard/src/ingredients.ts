// Prepare la mesure de couverture demandee : combien d'ingredients HelloFresh
// ont un equivalent plausible chez Picard, qui ne vend que du surgele ?
//
// Ce script ne fait aucun appel reseau. Il relit les donnees deja collectees par
// le prototype hellofresh et en extrait la liste des ingredients distincts, dans
// data/ de ce prototype. On recopie la liste au lieu de partager du code : les
// prototypes restent autonomes, et rien de tout cela n'entre dans Git.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const DATA_HELLOFRESH = join(import.meta.dirname, "..", "..", "hellofresh", "data");

const FICHIERS = ["recherche-page-1.json", "recherche-page-2.json"];

type Ingredient = { id: string; nom: string; slug: string; type: string; livreParHelloFresh: boolean };

function principal(): void {
  const parId = new Map<string, Ingredient>();

  for (const fichier of FICHIERS) {
    const chemin = join(DATA_HELLOFRESH, fichier);
    if (!existsSync(chemin)) {
      throw new Error(
        `Donnees HelloFresh absentes : ${chemin}. Relance d'abord « npm run collecte » dans spikes/hellofresh.`,
      );
    }
    const page = JSON.parse(readFileSync(chemin, "utf8"));
    for (const recette of page.items ?? []) {
      for (const ingredient of recette.ingredients ?? []) {
        parId.set(String(ingredient.id), {
          id: String(ingredient.id),
          nom: String(ingredient.name),
          slug: String(ingredient.slug),
          type: String(ingredient.type),
          // shipped = false : produit de placard, que HelloFresh ne livre pas.
          livreParHelloFresh: ingredient.shipped === true,
        });
      }
    }
  }

  const liste = [...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  writeFileSync(
    join(DOSSIER_DATA, "ingredients-hellofresh.json"),
    `${JSON.stringify(liste, null, 1)}\n`,
    "utf8",
  );
  console.log(`${liste.length} ingredients distincts extraits de l'echantillon HelloFresh.`);
  console.log(`dont livres par HelloFresh : ${liste.filter((i) => i.livreParHelloFresh).length}`);
}

principal();
