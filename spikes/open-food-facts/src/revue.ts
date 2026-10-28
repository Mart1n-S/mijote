// Revue manuelle des rapprochements Ciqual, et mesure des valeurs non chiffrees.
//
// Pourquoi une revue manuelle : a l'hypothese 3, le rapprochement textuel entre
// ingredients HelloFresh et produits Picard annoncait 85 % de couverture, et la
// revue a la main en a invalide plus de la moitie. On ne publie donc jamais le
// chiffre automatique seul.
//
// Les verdicts ci-dessous sont les miens, portes sur les couples produits par
// src/ciqual.ts, en comparant le nom de l'ingredient et le nom de l'aliment
// Ciqual retenu. Trois categories :
//   - bon       : l'aliment Ciqual est l'ingredient ;
//   - variante  : meme aliment sous une autre forme ou une autre variete, dont
//                 la composition pour 100 g differe (pomme seche contre pomme
//                 fraiche, gingembre en poudre contre frais) : utilisable avec
//                 reserve, jamais tel quel ;
//   - faux      : ce n'est pas l'ingredient (« Gousse d'ail » rapproche de
//                 « Vanille, gousse »).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOSSIER_DATA } from "./analyse.ts";

type Verdict = "bon" | "variante" | "faux";

/** Verdicts portes a la main, un par ingredient de l'echantillon HelloFresh. */
const VERDICTS: Record<string, Verdict> = {
  "(Mini) Concombre": "faux",
  "Amandes effilées": "faux",
  Banane: "faux",
  Beurre: "faux",
  "Beurre doux": "bon",
  "Bouillon cube volaille": "bon",
  "Bouillon de volaille": "bon",
  Burrata: "bon",
  "Cacahuètes non salées": "variante",
  "Cannelle en poudre": "bon",
  Carotte: "bon",
  "Chair de tomates": "bon",
  "Champignons de Paris": "bon",
  "Chapelure panko": "variante",
  Ciboulette: "variante",
  Citron: "faux",
  "Confiture de myrtilles": "bon",
  "Crème liquide": "faux",
  Crevettes: "bon",
  Échalote: "bon",
  "Épices à l'italienne": "faux",
  "Épices du Moyen-Orient": "faux",
  Épinards: "bon",
  Farine: "faux",
  "Farine de blé": "bon",
  "Filet de poulet": "bon",
  "Filet de poulet Label Rouge": "bon",
  "Flocons d'avoine": "bon",
  "Fromage de chèvre frais": "bon",
  "Fromage râpé à l'italienne": "faux",
  "Gingembre frais": "variante",
  "Gousse d'ail": "faux",
  "Graines de sésame": "bon",
  "Huile d'olive": "bon",
  "Huile de sésame": "bon",
  "Huile de tournesol": "bon",
  Lait: "faux",
  "Levure chimique": "bon",
  Marrons: "faux",
  "Mélange de cranberries et noix": "faux",
  Miel: "bon",
  Moutarde: "bon",
  Mozzarella: "bon",
  "Noix concassées": "faux",
  Œuf: "bon",
  Oignon: "bon",
  Panais: "bon",
  "Paprika fumé en poudre": "variante",
  "Pâte à pizza": "bon",
  "Pâte à tarte": "faux",
  "Pâte à tarte sans gluten": "faux",
  "Pépites de chocolat blanc": "faux",
  Persil: "bon",
  Poireau: "bon",
  "Poivre et sel": "faux",
  Pomme: "variante",
  "Pommes de terre": "faux",
  Riz: "faux",
  "Riz complet précuit": "variante",
  "Riz précuit": "bon",
  "Salade en sachet": "variante",
  "Sauce soja au sésame": "variante",
  "Sauce sriracha": "faux",
  "Sauce teriyaki": "bon",
  Sel: "variante",
  Semoule: "bon",
  Sucre: "variante",
  "Sucre de canne": "bon",
  "Thym séché": "bon",
  "Tranches de carré de porc": "faux",
  "Vinaigre balsamique blanc / riz": "variante",
  "Vinaigre balsamique noir": "bon",
  "Vinaigre de vin blanc": "variante",
  "Vinaigre de vin rouge ou de cidre": "bon",
  "Yaourt à la grecque": "bon",
};

/** Une teneur Ciqual peut etre un nombre, mais aussi « traces », « < 0,5 » ou « - ». */
function formeDeLaValeur(valeur: string | undefined): "chiffree" | "traces" | "inferieure" | "non determinee" | "absente" {
  if (valeur === undefined) return "absente";
  const propre = valeur.replace(/&lt;/g, "<").replace(/\s/g, "");
  if (propre === "" || propre === "-") return "non determinee";
  if (/^traces$/i.test(propre)) return "traces";
  if (propre.startsWith("<")) return "inferieure";
  if (/^[\d,.]+$/.test(propre)) return "chiffree";
  return "non determinee";
}

const NUTRIMENTS = ["kcal", "proteines", "glucides", "lipides", "sucres", "fibres", "sel"] as const;

function principal(): void {
  const { rapprochements } = JSON.parse(readFileSync(join(DOSSIER_DATA, "ciqual.json"), "utf8")) as {
    rapprochements: { ingredient: string; meilleur: { nom: string } | null; valeursTrouvees: Record<string, string> }[];
  };

  const comptes = { bon: 0, variante: 0, faux: 0, sansCandidat: 0, nonClasse: [] as string[] };
  const formes = new Map<string, Map<string, number>>();
  for (const nutriment of NUTRIMENTS) formes.set(nutriment, new Map());

  for (const rapprochement of rapprochements) {
    if (!rapprochement.meilleur) {
      comptes.sansCandidat += 1;
      continue;
    }
    const verdict = VERDICTS[rapprochement.ingredient];
    if (!verdict) {
      comptes.nonClasse.push(rapprochement.ingredient);
    } else {
      comptes[verdict] += 1;
    }

    // La forme des valeurs n'est mesuree que sur les rapprochements retenus :
    // mesurer la qualite des teneurs d'un faux rapprochement n'a aucun sens.
    if (verdict === "bon" || verdict === "variante") {
      for (const nutriment of NUTRIMENTS) {
        const forme = formeDeLaValeur(rapprochement.valeursTrouvees?.[nutriment]);
        const compte = formes.get(nutriment)!;
        compte.set(forme, (compte.get(forme) ?? 0) + 1);
      }
    }
  }

  const utilisables = comptes.bon + comptes.variante;
  const total = rapprochements.length;

  const resume = {
    revueLe: new Date().toISOString(),
    ingredients: total,
    automatique: {
      avecUnCandidat: total - comptes.sansCandidat,
      taux: `${Math.round(((total - comptes.sansCandidat) / total) * 100)} %`,
    },
    revueManuelle: {
      bon: `${comptes.bon}/${total} (${Math.round((comptes.bon / total) * 100)} %)`,
      variante: `${comptes.variante}/${total} (${Math.round((comptes.variante / total) * 100)} %)`,
      faux: `${comptes.faux}/${total} (${Math.round((comptes.faux / total) * 100)} %)`,
      sansCandidat: `${comptes.sansCandidat}/${total}`,
      utilisables: `${utilisables}/${total} (${Math.round((utilisables / total) * 100)} %)`,
      ingredientsNonClasses: comptes.nonClasse,
    },
    formeDesTeneurs: Object.fromEntries(
      [...formes].map(([nutriment, compte]) => [
        nutriment,
        Object.fromEntries([...compte].sort((a, b) => b[1] - a[1])),
      ]),
    ),
    base: `${utilisables} rapprochements retenus`,
  };

  writeFileSync(join(DOSSIER_DATA, "revue.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(resume, null, 2));
}

principal();
