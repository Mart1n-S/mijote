// Garde-fou du prototype des localisateurs : seul point de sortie reseau.
//
// Regle absolue de cette hypothese, decidee par Martin : **aucune requete vers
// intermarche.com**. Les magasins Intermarche sont enumeres uniquement a partir
// des donnees ouvertes d'OpenStreetMap. Le garde-fou le garantit par
// construction : seuls trois hotes sont dans la liste blanche, et le domaine
// d'Intermarche est explicitement dans la liste noire.
//
// Deux sources, deux chartes :
//   - Overpass (OpenStreetMap) : service gratuit et partage. Sa charte demande
//     un agent utilisateur descriptif, des requetes sequentielles et un
//     `timeout` explicite dans la requete. On ajoute 5 s entre deux appels.
//   - Geocodage de la Base Adresse Nationale, porte par l'IGN sur la
//     Geoplateforme (`data.geopf.fr/geocodage`). L'ancien domaine
//     `api-adresse.data.gouv.fr` repond encore a l'identique, mais on utilise
//     l'adresse actuelle, verifiee le 28 octobre 2026.

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const JOURNAL = join(DOSSIER_DATA, "requetes.log");

export const AGENT = "mijote-spike-lot0/0.1 (prototype de faisabilite, usage personnel)";

const DELAI_MS = 5000;
const PLAFOND_REQUETES = 25;

/**
 * Point d'acces Overpass principal, puis ses miroirs en cas d'indisponibilite.
 *
 * Piege rencontre le 28 octobre 2026 : overpass.osm.ch a repondu 200 avec zero
 * resultat a une requete sur Aix-en-Provence, parce que cette instance ne
 * contient que la Suisse. Une reponse vide n'est donc pas forcement une absence
 * de donnees : elle peut venir du miroir. Seuls des miroirs a couverture
 * mondiale figurent ici.
 */
export const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Geocodage inverse officiel (IGN, Geoplateforme). */
export const GEOCODAGE = "https://data.geopf.fr/geocodage/reverse";

const INTERDITS: { nom: string; motif: RegExp }[] = [
  { nom: "site Intermarche (interdit pour cette hypothese)", motif: /intermarche\.com|intermarche\.fr/i },
];

const AUTORISES = [
  /^https:\/\/overpass-api\.de\/api\/interpreter$/,
  /^https:\/\/overpass\.private\.coffee\/api\/interpreter$/,
  /^https:\/\/overpass\.kumi\.systems\/api\/interpreter$/,
  /^https:\/\/data\.geopf\.fr\/geocodage\//,
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

  private verifieLeCadre(url: string): void {
    for (const interdit of INTERDITS) {
      if (interdit.motif.test(url)) throw new HorsCadre(`URL refusee (${interdit.nom}) : ${url}`);
    }
    if (!AUTORISES.some((motif) => motif.test(url))) throw new HorsCadre(`URL hors liste blanche : ${url}`);
  }

  /**
   * Une requete, sequentielle, espacee. `corpsEnvoye` sert aux requetes Overpass,
   * qui passent en POST pour ne pas fabriquer des URL interminables.
   */
  async recupere(url: string, fichier?: string, corpsEnvoye?: string): Promise<Reponse> {
    this.verifieLeCadre(url);

    if (this.requetes >= PLAFOND_REQUETES) {
      throw new HorsCadre(`Plafond de ${PLAFOND_REQUETES} requetes atteint. Arret volontaire.`);
    }

    const attente = DELAI_MS - (Date.now() - this.dernierAppel);
    if (this.dernierAppel > 0 && attente > 0) {
      await new Promise((resoudre) => setTimeout(resoudre, attente));
    }

    const reponse = await fetch(url, {
      method: corpsEnvoye ? "POST" : "GET",
      headers: {
        "User-Agent": AGENT,
        Accept: "application/json",
        ...(corpsEnvoye ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: corpsEnvoye ? new URLSearchParams({ data: corpsEnvoye }).toString() : undefined,
    });
    const corps = await reponse.text();
    this.requetes += 1;
    this.dernierAppel = Date.now();
    this.journalise(
      `${corpsEnvoye ? "POST" : "GET"} ${url} -> ${reponse.status} (${corps.length} octets) | requete ${this.requetes}/${PLAFOND_REQUETES}`,
    );

    if (fichier) writeFileSync(join(DOSSIER_DATA, fichier), corps, "utf8");

    // 429 : trop de requetes. 502, 503, 504 : Overpass sature ou en panne.
    // Dans tous ces cas on n'insiste pas, c'est un service gratuit et partage :
    // l'appelant peut basculer sur le miroir, mais pas marteler le meme point.
    if ([429, 502, 503, 504].includes(reponse.status)) {
      throw new RefusDuService(`Service occupe (statut ${reponse.status}) sur ${url}. Arret, pas d'insistance.`);
    }
    if (!reponse.ok) throw new Error(`Statut inattendu ${reponse.status} sur ${url}.`);

    return { statut: reponse.status, corps };
  }

  get total(): number {
    return this.requetes;
  }
}
