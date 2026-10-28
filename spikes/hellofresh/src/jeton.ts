// Teste la premiere moitie de l'hypothese HelloFresh : le jeton d'acces de l'API
// interne est-il lisible dans le HTML de hellofresh.fr (et non seulement .com),
// et combien de temps reste-t-il valable ?
//
// Regle de ce module : le jeton lui-meme ne sort que vers l'appelant en memoire.
// Il n'est jamais ecrit dans data/, ni journalise, ni affiche, meme tronque.
// Seules ses caracteristiques (forme, longueur, dates) sont rendues publiques.

// Agent utilisateur honnete : on s'annonce plutot que de se deguiser en
// navigateur. Si un domaine refuse, on le consigne au lieu de contourner.
export const AGENT = "mijote-spike-lot0/0.1 (prototype de faisabilite, usage personnel)";

// Origine du jeton reperee dans le code lu de alexcodito/HelloFreshCrawler.
// On essaie d'abord le domaine francais, le .com n'est qu'un repli a consigner.
export const PAGES_JETON = ["https://www.hellofresh.fr", "https://www.hellofresh.com"];

// Meme expression que le depot tiers : le jeton est serialise dans l'etat
// initial que le site injecte dans sa page.
const REGEX_JETON = /"access_token":"([^"]+)"/;

export type InfoJeton = {
  /** Page d'ou le jeton a ete extrait. */
  origine: string;
  /** Statut HTTP de la page. */
  statut: number;
  /** Octets de HTML recus, pour reperer une page de blocage (trop courte). */
  tailleHtml: number;
  forme: "jwt" | "opaque";
  longueur: number;
  /** Champs presents dans la charge utile du JWT, sans leurs valeurs. */
  champsCharge?: string[];
  emisLe?: string;
  expireLe?: string;
  dureeVieSecondes?: number;
  portee?: string;
  typeJeton?: string;
};

/**
 * Decode la charge utile d'un JWT sans verifier la signature : ici on ne
 * cherche qu'a lire la duree de vie, pas a faire confiance au contenu.
 */
function decodeChargeJwt(jeton: string): Record<string, unknown> | null {
  const morceaux = jeton.split(".");
  if (morceaux.length !== 3) return null;
  try {
    const json = Buffer.from(morceaux[1], "base64url").toString("utf8");
    const charge = JSON.parse(json);
    return typeof charge === "object" && charge !== null ? charge : null;
  } catch {
    return null;
  }
}

function enIso(valeur: unknown): string | undefined {
  // Les dates JWT sont des secondes depuis epoch, pas des millisecondes.
  return typeof valeur === "number" ? new Date(valeur * 1000).toISOString() : undefined;
}

/** Decrit un jeton sans jamais en reveler la valeur. */
export function decritJeton(jeton: string, origine: string, statut: number, tailleHtml: number): InfoJeton {
  const charge = decodeChargeJwt(jeton);
  if (!charge) {
    return { origine, statut, tailleHtml, forme: "opaque", longueur: jeton.length };
  }
  const emis = enIso(charge.iat);
  const expire = enIso(charge.exp);
  return {
    origine,
    statut,
    tailleHtml,
    forme: "jwt",
    longueur: jeton.length,
    champsCharge: Object.keys(charge).sort(),
    emisLe: emis,
    expireLe: expire,
    dureeVieSecondes:
      typeof charge.iat === "number" && typeof charge.exp === "number"
        ? charge.exp - charge.iat
        : undefined,
    portee: typeof charge.scope === "string" ? charge.scope : undefined,
    typeJeton: typeof charge.token_type === "string" ? charge.token_type : undefined,
  };
}

export type ResultatJeton = { jeton: string; info: InfoJeton };

/**
 * Charge les pages d'accueil l'une apres l'autre jusqu'a trouver un jeton.
 * `attendre` est injecte pour que l'appelant garde la main sur le delai entre
 * deux requetes (regle de collecte du lot 0).
 */
export async function recupereJeton(
  journalise: (ligne: string) => void,
  attendre: () => Promise<void>,
): Promise<ResultatJeton> {
  const echecs: string[] = [];

  for (const [index, page] of PAGES_JETON.entries()) {
    if (index > 0) await attendre();

    const reponse = await fetch(page, {
      headers: { "User-Agent": AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const html = await reponse.text();
    journalise(`GET ${page} -> ${reponse.status} (${html.length} octets)`);

    const trouve = html.match(REGEX_JETON);
    if (reponse.ok && trouve) {
      return { jeton: trouve[1], info: decritJeton(trouve[1], page, reponse.status, html.length) };
    }
    echecs.push(`${page} : statut ${reponse.status}, ${html.length} octets, jeton ${trouve ? "present" : "absent"}`);
  }

  throw new Error(`Jeton introuvable. ${echecs.join(" | ")}`);
}
