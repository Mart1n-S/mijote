// Garde-fou de sortie reseau du prototype Picard : seul endroit du code qui
// appelle fetch. Meme principe que pour le prototype Intermarche, mais avec les
// regles de picard.fr, et sans aucune exception : le robots.txt est respecte tel
// quel (regle du CLAUDE.md, section « Regles du lot 0 »).
//
// Particularite de ce site : son robots.txt interdit la recherche et les
// controleurs internes de la plateforme, mais il **publie un sitemap**. La
// decouverte des produits passe donc par le sitemap, c'est-a-dire par le
// mecanisme que Picard fournit lui-meme. Aucune zone grise.

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const JOURNAL = join(DOSSIER_DATA, "requetes.log");

export const AGENT = "mijote-spike-lot0/0.1 (prototype de faisabilite, usage personnel)";

/** 4 s : au-dessus du minimum de 3 s impose par le CLAUDE.md. */
const DELAI_MS = 4000;

const PLAFOND_REQUETES = 30;

/**
 * Recopie ligne par ligne des `Disallow` de https://www.picard.fr/robots.txt
 * (releve du 28 octobre 2026). Tout ce qui correspond est refuse avant meme
 * d'etre tente.
 */
const INTERDITS: { nom: string; motif: RegExp }[] = [
  // https://magasins.picard.fr/robots.txt (releve du 28 octobre 2026) :
  // « Allow: /search/* », mais « Disallow: /search$ » et la recherche par
  // coordonnees. Les fiches de magasin, elles, sont libres.
  { nom: "recherche nue du localisateur", motif: /^https:\/\/magasins\.picard\.fr\/search\/?$/i },
  { nom: "recherche par coordonnees", motif: /\/search\?query=.*(?:lat|lon)=/i },
  { nom: "recherche", motif: /\/recherche|\/Search-Show/i },
  { nom: "controleurs internes de la plateforme", motif: /\/on\/demandware\.store\//i },
  { nom: "compte, panier, connexion", motif: /\/Account-Show|\/Cart-Show|\/Login-Show|\/Picardetmoi-Join/i },
  { nom: "pages de contenu generique", motif: /\/Page-Show/i },
  { nom: "listes d'envies et impression", motif: /\/Wishlist-|Product-Print/i },
  { nom: "avis Bazaarvoice", motif: /BzvReviews-/i },
  { nom: "filtres et tri", motif: /[?&](?:fdid|prefn1|prefv1|srule)=|&sortFilter=|viewAll=/i },
  { nom: "ressources techniques", motif: /\.well-known\/|batchsdk-worker-loader\.js/i },
];

export type Cadre = "robots-autorise";

export class RefusDuSite extends Error {}
export class HorsCadre extends Error {}

export type Reponse = { statut: number; corps: string; url: string };

/**
 * Liste blanche : une URL sans aucun parametre de requete, sur le site ou sur
 * son localisateur de magasins. Pour www.picard.fr, c'est suffisant pour etre
 * conforme, car tous les `Disallow` visent soit un chemin (couvert par
 * INTERDITS), soit un parametre de requete (impossible ici).
 */
const AUTORISES = [
  /^https:\/\/www\.picard\.fr\/[^?]*$/,
  /^https:\/\/magasins\.picard\.fr\/[^?]*$/,
];

export class Garde {
  private requetes = 0;
  private dernierAppel = 0;
  private readonly cookies = new Map<string, string>();

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
      if (interdit.motif.test(url)) {
        throw new HorsCadre(`URL refusee par le garde-fou (${interdit.nom}) : ${url}`);
      }
    }
    if (!AUTORISES.some((motif) => motif.test(url))) throw new HorsCadre(`URL hors liste blanche : ${url}`);
  }

  private memoriseCookies(entetes: Headers): void {
    // Le choix d'un magasin peut passer par un cookie : on le rejoue tel quel.
    for (const brut of entetes.getSetCookie()) {
      const [paire] = brut.split(";");
      const separateur = paire.indexOf("=");
      if (separateur > 0) this.cookies.set(paire.slice(0, separateur).trim(), paire.slice(separateur + 1).trim());
    }
  }

  get nomsDesCookies(): string[] {
    return [...this.cookies.keys()];
  }

  async recupere(url: string, fichier?: string, accept = "text/html"): Promise<Reponse> {
    this.verifieLeCadre(url);

    if (this.requetes >= PLAFOND_REQUETES) {
      throw new HorsCadre(`Plafond de ${PLAFOND_REQUETES} requetes atteint. Arret volontaire.`);
    }

    const attente = DELAI_MS - (Date.now() - this.dernierAppel);
    if (this.dernierAppel > 0 && attente > 0) {
      await new Promise((resoudre) => setTimeout(resoudre, attente));
    }

    const entetes: Record<string, string> = {
      "User-Agent": AGENT,
      Accept: accept,
      "Accept-Language": "fr-FR,fr;q=0.9",
    };
    if (this.cookies.size > 0) {
      entetes.Cookie = [...this.cookies].map(([cle, valeur]) => `${cle}=${valeur}`).join("; ");
    }

    const reponse = await fetch(url, { headers: entetes, redirect: "follow" });
    const corps = await reponse.text();
    this.requetes += 1;
    this.dernierAppel = Date.now();
    this.memoriseCookies(reponse.headers);
    this.journalise(`GET ${url} -> ${reponse.status} (${corps.length} octets) | requete ${this.requetes}/${PLAFOND_REQUETES}`);

    if (fichier) writeFileSync(join(DOSSIER_DATA, fichier), corps, "utf8");

    if ([401, 403, 429].includes(reponse.status)) {
      throw new RefusDuSite(`Blocage technique : statut ${reponse.status} sur ${url}. Arret, aucun contournement.`);
    }
    if (/captcha|datadome|px-captcha|imperva|access denied/i.test(corps.slice(0, 2000))) {
      throw new RefusDuSite(`Page de blocage detectee sur ${url}. Arret, aucun contournement.`);
    }

    return { statut: reponse.status, corps, url: reponse.url };
  }

  get total(): number {
    return this.requetes;
  }
}
