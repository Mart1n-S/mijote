// Garde-fou du prototype Open Food Facts : seul point de sortie reseau.
//
// Conditions d'Open Food Facts, lues dans leur documentation le 28 octobre 2026
// (https://openfoodfacts.github.io/openfoodfacts-server/api/) :
//   - « 15 req/min/IP address for all read product queries » ;
//   - « always use a custom User-Agent to identify your app », au format
//     `AppName/Version (ContactEmail)` ;
//   - « If you need to fetch more than a few hundred products, we ask you to
//     download the data as a CSV or JSONL file » : nos 50 codes sont tres en
//     dessous de ce seuil, l'API est donc le bon outil ;
//   - « While testing your applications, make all API requests to the staging
//     environment » : la mise au point s'est faite sur `openfoodfacts.net`
//     (authentification de base `off` / `off`), la mesure sur la production,
//     parce que l'environnement de test renvoie des nutriments vides.
//
// Ecart assume avec leur format d'agent utilisateur : il demande une adresse de
// contact, nous n'en mettons pas. Decision de Martin, consignee dans le rapport.
//
// Debit retenu : 5 s entre deux requetes, soit 12 par minute, sous la limite de
// 15. Les requetes sont strictement sequentielles.

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const JOURNAL = join(DOSSIER_DATA, "requetes.log");

export const AGENT = "mijote-spike-lot0/0.1 (prototype de faisabilite, usage personnel)";

const DELAI_MS = 5000;
const PLAFOND_REQUETES = Number(process.env.PLAFOND ?? 70);

export const PRODUCTION = "https://world.openfoodfacts.org";
export const TEST = "https://world.openfoodfacts.net";

const AUTORISES = [
  /^https:\/\/world\.openfoodfacts\.org\/api\/v3\.6\/product\/\d+\.json(\?|$)/,
  /^https:\/\/world\.openfoodfacts\.net\/api\/v3\.6\/product\/\d+\.json(\?|$)/,
  // Table Ciqual de l'ANSES, deposee sur l'entrepot recherche.data.gouv :
  // metadonnees du jeu de donnees, puis telechargement des fichiers XML.
  /^https:\/\/entrepot\.recherche\.data\.gouv\.fr\/api\/datasets\/:persistentId\/\?persistentId=doi:[\w.\/]+$/,
  /^https:\/\/entrepot\.recherche\.data\.gouv\.fr\/api\/access\/datafile\/\d+$/,
];

export class RefusDuService extends Error {}
export class HorsCadre extends Error {}

export type Reponse = { statut: number; corps: string };

export class Garde {
  private requetes = 0;
  private dernierAppel = 0;

  constructor(nouveauJournal = false) {
    if (nouveauJournal) writeFileSync(JOURNAL, "", "utf8");
  }

  private journalise(ligne: string): void {
    const horodate = `${new Date().toISOString()} ${ligne}`;
    console.log(horodate);
    appendFileSync(JOURNAL, `${horodate}\n`, "utf8");
  }

  async recupere(url: string, fichier?: string, accept = "application/json"): Promise<Reponse> {
    if (!AUTORISES.some((motif) => motif.test(url))) {
      throw new HorsCadre(`URL hors liste blanche : ${url}`);
    }
    if (this.requetes >= PLAFOND_REQUETES) {
      throw new HorsCadre(`Plafond de ${PLAFOND_REQUETES} requetes atteint. Arret volontaire.`);
    }

    const attente = DELAI_MS - (Date.now() - this.dernierAppel);
    if (this.dernierAppel > 0 && attente > 0) {
      await new Promise((resoudre) => setTimeout(resoudre, attente));
    }

    const entetes: Record<string, string> = { "User-Agent": AGENT, Accept: accept };
    // L'environnement de test exige une authentification de base documentee.
    if (url.startsWith(TEST)) {
      entetes.Authorization = `Basic ${Buffer.from("off:off").toString("base64")}`;
    }

    const reponse = await fetch(url, { headers: entetes });
    const corps = await reponse.text();
    this.requetes += 1;
    this.dernierAppel = Date.now();
    this.journalise(`GET ${url.split("?")[0]} -> ${reponse.status} (${corps.length} octets) | ${this.requetes}/${PLAFOND_REQUETES}`);

    // On n'ecrit sur le disque qu'une reponse valide : un corps d'erreur
    // enregistre sous le nom attendu serait pris pour un telechargement reussi
    // a la reprise suivante. C'est arrive une fois, avec un 406.
    if (fichier && reponse.ok) writeFileSync(join(DOSSIER_DATA, fichier), corps, "utf8");

    // Leur documentation : « A HTTP 503 response will be returned if these
    // limits are exceeded ». On s'arrete, on ne reessaie pas.
    if ([429, 503].includes(reponse.status)) {
      throw new RefusDuService(`Limite de debit atteinte (statut ${reponse.status}). Arret, pas d'insistance.`);
    }
    // 404 est une reponse normale : le produit est absent de la base.
    if (!reponse.ok && reponse.status !== 404) {
      throw new Error(`Statut inattendu ${reponse.status} sur ${url}.`);
    }

    return { statut: reponse.status, corps };
  }

  get total(): number {
    return this.requetes;
  }
}
