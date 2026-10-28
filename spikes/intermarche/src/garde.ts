// Garde-fou de sortie reseau du prototype Intermarche : c'est le seul endroit
// du code qui appelle fetch. Il applique par construction le cadre decide dans
// le CLAUDE.md, section « Regles du lot 0 », plutot que de compter sur la
// discipline de celui qui ecrit les scripts.
//
// Trois mecanismes :
//   1. une liste noire absolue : ces chemins ne sont jamais appeles, meme sous
//      l'exception (catalogue complet, localisateur, tri, tout voir) ;
//   2. une liste blanche : toute URL doit correspondre a une regle, et chaque
//      regle porte son cadre (autorisee par le robots.txt du site, ou source
//      ouverte sans restriction) ;
//   3. un plafond de requetes, un delai impose et aucune parallelisation.
//
// Le journal note le cadre de chaque requete, ce qui permet au rapport de dire
// exactement combien d'appels ont utilise l'exception.

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const JOURNAL = join(DOSSIER_DATA, "requetes.log");

// On s'annonce au lieu de se deguiser en navigateur : si le site refuse, on
// s'arrete, c'est la regle.
export const AGENT = "mijote-spike-lot0/0.1 (prototype de faisabilite, usage personnel)";

/** Delai minimum entre deux requetes vers le meme domaine, en millisecondes. */
const DELAI_MS = 4000;

/** Plafond dur : au-dela, le garde-fou refuse d'appeler, le script s'arrete. */
const PLAFOND_REQUETES = 30;

export type Cadre = "robots-autorise" | "source-ouverte";

type Regle = { nom: string; motif: RegExp; cadre: Cadre };

// Jamais appeles, quelles que soient les circonstances. Les quatre premiers
// motifs sont ce qui ferait de ce prototype un collecteur de catalogue ou un
// aspirateur de localisateur, ce que l'exception exclut explicitement.
const INTERDITS_ABSOLUS: { nom: string; motif: RegExp }[] = [
  { nom: "catalogue drive", motif: /\/accueil\/drive-catalogue\// },
  { nom: "catalogues", motif: /\/catalogues?\// },
  { nom: "localisateur de magasins", motif: /\/localisation\/|\/tous-les-magasins\// },
  { nom: "pagination ou tri de rayon", motif: /trier|voir-tout|[?&]itemId=/ },
  { nom: "ressources internes du site", motif: /\/_next\/|\/src\/components\// },
  // Ces trois chemins ont ete appeles le 28 octobre 2026 sous une exception
  // decidee par Martin, puis retiree du CLAUDE.md avec l'abandon de la
  // collecte Intermarche. Ils sont desormais refuses comme les autres.
  { nom: "recherche de produit", motif: /\/recherche\/|\/rechercheproduits/ },
  { nom: "api du site", motif: /intermarche\.com\/api\// },
  { nom: "selection du magasin par parametre", motif: /[?&]pdvref=/ },
];

const REGLES: Regle[] = [
  // robots.txt lui-meme : piece au dossier du rapport.
  { nom: "robots.txt", motif: /^https:\/\/www\.intermarche\.com\/robots\.txt$/, cadre: "robots-autorise" },

  // Seule exception positive du robots.txt : « Allow: /magasins/*/*/infos-pratiques ».
  {
    nom: "fiche magasin",
    motif: /^https:\/\/www\.intermarche\.com\/magasins\/\d+\/[a-z0-9-]+\/infos-pratiques$/,
    cadre: "robots-autorise",
  },

  // Les fiches produit et les pages de rayon ne figurent dans aucun Disallow :
  // pas besoin de l'exception pour elles.
  { nom: "fiche produit", motif: /^https:\/\/www\.intermarche\.com\/produit\/[^?]+$/, cadre: "robots-autorise" },
  { nom: "page de rayon", motif: /^https:\/\/www\.intermarche\.com\/rayons\/[^?]+$/, cadre: "robots-autorise" },

  // robots.txt de l'hote d'API repere dans la configuration du site : il a ses
  // propres regles, qu'on lit avant de l'appeler.
  {
    nom: "robots.txt de l'api",
    motif: /^https:\/\/api\.internal\.intermarche\.com\/robots\.txt$/,
    cadre: "robots-autorise",
  },

  // Open Prices : source ouverte, aucune restriction, hors du cadre Intermarche.
  { nom: "open prices", motif: /^https:\/\/prices\.openfoodfacts\.org\//, cadre: "source-ouverte" },
];

export class RefusDuSite extends Error {}
export class HorsCadre extends Error {}

export type Reponse = { statut: number; corps: string; entetes: Headers; cadre: Cadre; regle: string };

export class Garde {
  private requetes = 0;
  private dernierAppel = 0;
  /** Cookies renvoyes par le site, rejoues tels quels (le magasin en depend). */
  private cookies = new Map<string, string>();
  /** Compteur par cadre, pour le rapport. */
  readonly parCadre = new Map<Cadre, number>();

  constructor(nouveauJournal = false) {
    if (nouveauJournal) writeFileSync(JOURNAL, "", "utf8");
  }

  private journalise(ligne: string): void {
    const horodate = `${new Date().toISOString()} ${ligne}`;
    console.log(horodate);
    appendFileSync(JOURNAL, `${horodate}\n`, "utf8");
  }

  private verifieLeCadre(url: string): Regle {
    for (const interdit of INTERDITS_ABSOLUS) {
      if (interdit.motif.test(url)) {
        throw new HorsCadre(`URL refusee par le garde-fou (${interdit.nom}) : ${url}`);
      }
    }
    const regle = REGLES.find((r) => r.motif.test(url));
    if (!regle) throw new HorsCadre(`URL hors liste blanche : ${url}`);
    return regle;
  }

  private enteteCookie(): string {
    return [...this.cookies].map(([cle, valeur]) => `${cle}=${valeur}`).join("; ");
  }

  private memoriseCookies(entetes: Headers): void {
    for (const brut of entetes.getSetCookie()) {
      const [paire] = brut.split(";");
      const separateur = paire.indexOf("=");
      if (separateur > 0) this.cookies.set(paire.slice(0, separateur).trim(), paire.slice(separateur + 1).trim());
    }
  }

  /**
   * Une requete, et une seule a la fois. `fichier` sauvegarde le corps brut
   * dans data/ quand on veut pouvoir le relire hors ligne.
   */
  async recupere(url: string, fichier?: string, accept = "text/html"): Promise<Reponse> {
    const regle = this.verifieLeCadre(url);

    if (this.requetes >= PLAFOND_REQUETES) {
      throw new HorsCadre(`Plafond de ${PLAFOND_REQUETES} requetes atteint. Arret volontaire.`);
    }

    // Rythme humain : le delai est ici, donc impossible a oublier ailleurs.
    const attente = DELAI_MS - (Date.now() - this.dernierAppel);
    if (this.dernierAppel > 0 && attente > 0) {
      await new Promise((resoudre) => setTimeout(resoudre, attente));
    }

    const entetes: Record<string, string> = {
      "User-Agent": AGENT,
      Accept: accept,
      "Accept-Language": "fr-FR,fr;q=0.9",
    };
    const cookie = this.enteteCookie();
    if (cookie) entetes.Cookie = cookie;

    const reponse = await fetch(url, { headers: entetes, redirect: "follow" });
    const corps = await reponse.text();
    this.requetes += 1;
    this.dernierAppel = Date.now();
    this.parCadre.set(regle.cadre, (this.parCadre.get(regle.cadre) ?? 0) + 1);
    this.memoriseCookies(reponse.headers);
    this.journalise(
      `[${regle.cadre}] ${regle.nom} | GET ${url} -> ${reponse.status} (${corps.length} octets) | requete ${this.requetes}/${PLAFOND_REQUETES}`,
    );

    if (fichier) writeFileSync(join(DOSSIER_DATA, fichier), corps, "utf8");

    // Blocage technique : on s'arrete, on ne reessaie pas autrement.
    if ([401, 403, 429].includes(reponse.status)) {
      throw new RefusDuSite(`Blocage technique : statut ${reponse.status} sur ${url}. Arret, aucun contournement.`);
    }
    if (/captcha|datadome|px-captcha|access denied/i.test(corps.slice(0, 2000))) {
      throw new RefusDuSite(`Page de blocage detectee sur ${url}. Arret, aucun contournement.`);
    }

    return { statut: reponse.status, corps, entetes: reponse.headers, cadre: regle.cadre, regle: regle.nom };
  }

  get compteurs(): { total: number; parCadre: Record<string, number> } {
    return { total: this.requetes, parCadre: Object.fromEntries(this.parCadre) };
  }
}
