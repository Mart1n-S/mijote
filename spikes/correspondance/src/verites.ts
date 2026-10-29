// Verite de reference : mes verdicts sur les couples ingredient-candidat.
//
// Definition retenue, precisee par Martin :
//   - « bon »      : le candidat **est** l'ingredient, eventuellement decoupe,
//                    surgele ou conditionne (oignons en cubes pour oignon) ;
//   - « variante » : ce n'est pas exactement l'ingredient, mais la recette s'en
//                    accommode (cacahuetes salees pour non salees, oignon rouge
//                    pour oignon, poireau cuit pour poireau) ;
//   - « faux »     : une preparation ou un plat qui contient l'ingredient (riz
//                    cantonais pour riz, puree pour pommes de terre), ou un
//                    aliment different (vanille gousse pour gousse d'ail).
//
// Une preparation n'est jamais une variante : elle apporte d'autres ingredients,
// donc elle ne remplace pas celui de la recette.
//
// **Convention de lecture, essentielle pour interpreter les mesures** : les 529
// couples proposes par les six methodes ont tous ete relus un par un. Seuls les
// couples acceptables sont enumeres ci-dessous ; tout couple propose et absent
// de ces listes est donc juge « faux ». Les couples jamais proposes par aucune
// methode n'ont pas de verdict : ils ne comptent ni pour ni contre.

export type Verdict = "bon" | "variante" | "faux";

/** Identifiant Picard complet a partir de ses six derniers chiffres. */
function picard(suffixe: string): string {
  return suffixe.padStart(18, "0");
}

/** [ingredient, identifiants « bon », identifiants « variante »] */
const ACCEPTABLES_PICARD: [string, string[], string[]][] = [
  ["Banane", ["010096"], []],
  ["Carotte", ["087029"], []],
  ["Champignons de Paris", ["006500", "012840", "075473"], ["059325"]],
  ["Ciboulette", ["012709"], []],
  ["Crevettes", ["048020"], []],
  ["Échalote", ["006104", "012618"], []],
  ["Edamame", ["087149"], []],
  ["Épinards", ["000586", "010157", "010298", "010068"], []],
  ["Filet de poulet", ["000545", "088436"], ["088171"]],
  ["Filet de poulet Label Rouge", [], ["000545", "088436"]],
  ["Gingembre frais", ["013568"], []],
  ["Marrons", ["087085"], []],
  ["Moutarde", ["085324"], ["085866"]],
  ["Mélange de cranberries et noix", [], ["085230"]],
  ["Noix concassées", [], ["085230"]],
  ["Oignon", ["012874", "005015", "050480"], ["050307"]],
  ["Pâte à pizza", ["043976"], ["082576"]],
  ["Pâte à tarte", ["082576"], ["082575"]],
  ["Persil", ["002277", "012642", "050031"], []],
  ["Poireau", ["000180", "087437"], []],
  ["Pomme", ["050047"], []],
  ["Riz", [], ["011487"]],
  ["Riz complet précuit", [], ["011487"]],
  ["Riz précuit", ["011487"], []],
  ["Salade en sachet", [], ["012593"]],
  ["Sauce soja au sésame", [], ["085495"]],
  ["Thym séché", [], ["012684"]],
  ["Cacahuètes non salées", [], ["085605"]],
  ["Chutney d'abricots", [], ["080210"]],
  ["Citron", [], ["069835"]],
  // Apparus apres la correction des mots d'unite : « Gousse d'ail » proposait
  // « Vanille, gousse » avant que « gousse » ne soit retire de l'ingredient.
  ["Gousse d'ail", ["008753", "012569", "050030"], []],
];

const ACCEPTABLES_CIQUAL: [string, string[], string[]][] = [
  ["(Mini) Concombre", ["20019", "20210"], ["20809"]],
  ["Amandes effilées", [], ["15042"]],
  ["Banane", ["13005"], ["13089"]],
  ["Beurre", [], ["16403", "16402"]],
  ["Beurre doux", ["16400", "16404"], ["16415", "16410"]],
  ["Bouillon cube volaille", ["11174"], ["25947"]],
  ["Bouillon de volaille", ["25947"], ["11174"]],
  ["Burrata", ["12072"], []],
  ["Cacahuètes non salées", ["15001"], ["15002", "15037"]],
  ["Cannelle en poudre", ["11025"], []],
  ["Carotte", ["20009", "20208"], ["20092"]],
  ["Chair de tomates", ["20169"], ["20289", "20358", "20242"]],
  ["Champignons de Paris", ["20056"], ["20228", "20079", "20102"]],
  ["Chapelure panko", ["7500"], []],
  ["Ciboulette", ["11003"], ["11095"]],
  ["Citron", ["13009"], ["13125", "2028"]],
  ["Confiture de myrtilles", ["31068"], []],
  ["Crevettes", ["10021", "10038"], ["10007"]],
  ["Échalote", ["20097"], ["20255", "20335"]],
  ["Épices à l'italienne", [], ["11081"]],
  ["Épices du Moyen-Orient", [], ["11081"]],
  ["Épinards", ["20059"], ["20027", "20060", "20336", "20270"]],
  ["Farine", [], ["9520", "9550", "9545", "9570"]],
  ["Farine de blé", ["9435", "9445"], ["9410"]],
  ["Filet de poulet", ["36017", "36039"], ["36040", "36018"]],
  ["Filet de poulet Label Rouge", ["36040"], ["36017", "36039"]],
  ["Flocons d'avoine", ["32140"], ["9313"]],
  ["Fromage de chèvre frais", ["12805"], ["12812", "12819"]],
  ["Fromage râpé à l'italienne", ["12775"], []],
  ["Gingembre frais", ["11074"], ["11006"]],
  ["Graines de sésame", ["15010", "15035"], ["15038"]],
  ["Huile d'olive", ["17270"], ["17701"]],
  ["Huile de sésame", ["17400"], []],
  ["Huile de tournesol", ["17440"], []],
  ["Lait", ["19010"], ["19202", "19038"]],
  ["Levure chimique", ["11046"], []],
  ["Marrons", ["15039"], []],
  ["Miel", ["31008"], []],
  ["Moutarde", ["11013"], ["11021"]],
  ["Mozzarella", ["19590"], ["19591"]],
  ["Œuf", ["22000"], ["22010", "22011", "22014", "22001", "22002"]],
  ["Oignon", ["20034", "20235"], ["20035", "20180", "20238"]],
  ["Panais", ["20181"], ["20325"]],
  ["Paprika fumé en poudre", [], ["11049"]],
  ["Pâte à pizza", ["37001", "23402"], ["96778"]],
  ["Persil", ["11014"], ["11024"]],
  ["Poireau", ["20039", "20236"], ["20040"]],
  ["Poivre et sel", [], ["11015", "11019"]],
  ["Pomme", ["13039", "13396"], ["13111"]],
  ["Pommes de terre", ["4008"], ["4014", "4048", "4011", "4026"]],
  ["Riz", [], ["9109", "9121"]],
  ["Riz complet précuit", [], ["9102", "9103", "9113", "9107"]],
  ["Riz précuit", ["9107"], []],
  ["Salade en sachet", ["25604"], ["20288"]],
  ["Sauce soja au sésame", [], ["11104", "11216"]],
  ["Sauce sriracha", [], ["11184"]],
  ["Sauce teriyaki", ["11301"], ["11184"]],
  ["Semoule", ["9610"], []],
  ["Sucre", ["31016"], ["31017"]],
  ["Sucre de canne", ["31017"], ["31016"]],
  ["Thym séché", ["11038"], ["11070"]],
  ["Tranches de carré de porc", ["28104"], ["28105"]],
  ["Vinaigre balsamique blanc / riz", [], ["11091", "11018"]],
  ["Vinaigre balsamique noir", ["11091"], ["11018"]],
  ["Vinaigre de vin blanc", [], ["11220", "11018"]],
  ["Vinaigre de vin rouge ou de cidre", ["11220", "11090"], ["11018"]],
  ["Yaourt à la grecque", ["19860"], ["19862", "19550"]],
  ["Gousse d'ail", ["11000"], ["11023", "11306", "11307"]],
  ["Sel", ["11082"], []],
];

function construit(): Record<string, Verdict> {
  const table: Record<string, Verdict> = {};
  for (const [ingredient, bons, variantes] of ACCEPTABLES_PICARD) {
    for (const suffixe of bons) table[`picard|${ingredient}|${picard(suffixe)}`] = "bon";
    for (const suffixe of variantes) table[`picard|${ingredient}|${picard(suffixe)}`] = "variante";
  }
  for (const [ingredient, bons, variantes] of ACCEPTABLES_CIQUAL) {
    for (const code of bons) table[`ciqual|${ingredient}|${code}`] = "bon";
    for (const code of variantes) table[`ciqual|${ingredient}|${code}`] = "variante";
  }
  return table;
}

export const VERITES: Record<string, Verdict> = construit();

/**
 * Verdict d'un couple. Tout couple absent des listes est « faux » : les 529
 * couples proposes ont ete relus, donc une absence est un rejet, pas un oubli.
 */
export function verdict(source: string, ingredient: string, cle: string): Verdict {
  return VERITES[`${source}|${ingredient}|${cle}`] ?? "faux";
}

/**
 * Le couple figure-t-il explicitement dans les listes ? Sert a reperer les
 * couples nouvellement proposes par une methode, qui doivent etre relus avant
 * d'etre comptes comme faux.
 */
export function estEtiquete(source: string, ingredient: string, cle: string): boolean {
  return VERITES[`${source}|${ingredient}|${cle}`] !== undefined;
}

/** Un ingredient a-t-il au moins un equivalent connu dans cette source ? */
export function aUnEquivalent(source: string, ingredient: string, niveau: "bon" | "utilisable"): boolean {
  const prefixe = `${source}|${ingredient}|`;
  return Object.entries(VERITES).some(
    ([cle, valeur]) =>
      cle.startsWith(prefixe) && (niveau === "bon" ? valeur === "bon" : valeur === "bon" || valeur === "variante"),
  );
}
