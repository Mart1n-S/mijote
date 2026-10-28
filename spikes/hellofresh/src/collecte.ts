// Teste l'hypothese 1 du lot 0 : l'API interne HelloFresh (gw.hellofresh.com)
// repond-elle pour la France, combien de recettes FR annonce-t-elle, et le JSON
// contient-il ingredients, quantites, unites et nutrition ?
//
// Principe repris de la lecture du depot alexcodito/HelloFreshCrawler (code lu,
// jamais execute) : jeton dans le HTML, puis recherche paginee en Bearer.
//
// Regles de collecte du lot 0 respectees ici : requetes strictement
// sequentielles, 4 s d'attente minimum entre deux, echantillon plafonne a
// 20 recettes, arret immediat et consigne en cas de refus (401, 403, 429,
// captcha). Aucun PDF de fiche recette n'est telecharge.

import { writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { recupereJeton, AGENT, type InfoJeton } from "./jeton.ts";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");
const JOURNAL = join(DOSSIER_DATA, "requetes.log");

const BASE_API = "https://gw.hellofresh.com/api";
const RECHERCHE = "recipes/search";

// 4 s : au-dessus du minimum de 3 s impose par le CLAUDE.md du lot 0.
const DELAI_MS = 4000;

// Plafond de l'echantillon, en deux pages de 10 pour prouver la pagination.
const TAILLE_PAGE = 10;

// Filtres recopies du depot tiers, uniquement pour mesurer a quel point ils
// faussent le total annonce. Les valeurs d'un tableau sont jointes par une barre.
const PRODUITS_DEPOT_TIERS = ["classic-box", "veggie-box", "meal-plan", "family-box"];

type Params = Record<string, string | number | string[]>;

/** Parametres communs a tous les appels : ce sont eux qui ciblent la France. */
const PARAMS_FR: Params = { locale: "fr-FR", country: "fr" };

async function attendre(ms = DELAI_MS): Promise<void> {
  await new Promise((resoudre) => setTimeout(resoudre, ms));
}

async function journalise(ligne: string): Promise<void> {
  const horodate = `${new Date().toISOString()} ${ligne}`;
  console.log(horodate);
  await appendFile(JOURNAL, `${horodate}\n`, "utf8");
}

function construitUrl(chemin: string, params: Params): string {
  const url = new URL(`${BASE_API}/${chemin}`);
  for (const [cle, valeur] of Object.entries(params)) {
    url.searchParams.set(cle, Array.isArray(valeur) ? valeur.join("|") : String(valeur));
  }
  return url.toString();
}

/** Signale un refus du site, pour qu'on s'arrete au lieu d'insister. */
class RefusDuSite extends Error {}

/**
 * Un appel API, journalise, avec sauvegarde du corps brut tel que recu.
 * `nomFichier` vaut null quand la reponse n'a pas besoin d'etre conservee.
 */
async function appelApi(
  chemin: string,
  params: Params,
  jeton: string,
  nomFichier: string | null,
): Promise<unknown> {
  const url = construitUrl(chemin, params);
  const reponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jeton}`,
      Accept: "application/json",
      "User-Agent": AGENT,
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  const corps = await reponse.text();
  // L'URL journalisee ne contient aucun jeton : il voyage dans l'en-tete.
  await journalise(`GET ${url} -> ${reponse.status} (${corps.length} octets)`);

  if (nomFichier) {
    await writeFile(join(DOSSIER_DATA, nomFichier), corps, "utf8");
  }

  if ([401, 403, 429].includes(reponse.status)) {
    throw new RefusDuSite(
      `Refus du site : statut ${reponse.status} sur ${chemin}. Arret, aucun contournement.`,
    );
  }
  if (!reponse.ok) {
    throw new Error(`Statut inattendu ${reponse.status} sur ${chemin}.`);
  }

  try {
    return JSON.parse(corps);
  } catch {
    const debut = corps.slice(0, 80).replace(/\s+/g, " ");
    throw new RefusDuSite(
      `Reponse non JSON sur ${chemin} (debut : ${debut}). Possible page de blocage. Arret.`,
    );
  }
}

type PageRecherche = {
  total?: number;
  skip?: number;
  take?: number;
  count?: number;
  items?: Record<string, unknown>[];
};

function enPage(brut: unknown): PageRecherche {
  return (brut ?? {}) as PageRecherche;
}

/** Les items portent soit `id`, soit `slug` : on prend ce qui existe. */
function identifiant(item: Record<string, unknown>): string {
  return String(item.id ?? item.slug ?? item.name ?? "?");
}

async function principal(): Promise<void> {
  await writeFile(JOURNAL, "", "utf8");
  const resume: Record<string, unknown> = {
    lanceLe: new Date().toISOString(),
    delaiEntreRequetesMs: DELAI_MS,
  };

  // 1. Jeton d'acces depuis le HTML du site.
  const { jeton, info } = await recupereJeton((l) => void journalise(l), attendre);
  resume.jeton = info satisfies InfoJeton;
  console.log(
    `Jeton obtenu depuis ${info.origine} : forme ${info.forme}, expire le ${info.expireLe ?? "inconnu"}`,
  );

  // 2. Trois sondages a limit=1 : le total annonce depend des filtres, donc on
  //    mesure les trois cas plutot que de croire celui du depot tiers.
  await attendre();
  const sansFiltre = enPage(
    await appelApi(RECHERCHE, { ...PARAMS_FR, offset: 0, limit: 1 }, jeton, "sondage-sans-filtre.json"),
  );

  await attendre();
  const avecProduits = enPage(
    await appelApi(
      RECHERCHE,
      { ...PARAMS_FR, offset: 0, limit: 1, product: PRODUITS_DEPOT_TIERS },
      jeton,
      "sondage-filtre-product.json",
    ),
  );

  await attendre();
  const avecTemps = enPage(
    await appelApi(
      RECHERCHE,
      { ...PARAMS_FR, offset: 0, limit: 1, "max-prep-time": 60 },
      jeton,
      "sondage-filtre-temps.json",
    ),
  );

  resume.totaux = {
    sansFiltre: sansFiltre.total,
    avecFiltreProductDuDepotTiers: avecProduits.total,
    avecMaxPrepTime60: avecTemps.total,
    clesEnveloppe: Object.keys(sansFiltre).sort(),
  };
  console.log(
    `Total FR annonce : ${sansFiltre.total} sans filtre, ${avecProduits.total} avec product, ${avecTemps.total} avec max-prep-time=60`,
  );

  // 3. Echantillon : deux pages de 10, pour verifier que offset decale bien et
  //    qu'aucune recette n'apparait dans les deux pages.
  await attendre();
  const page1 = enPage(
    await appelApi(RECHERCHE, { ...PARAMS_FR, offset: 0, limit: TAILLE_PAGE }, jeton, "recherche-page-1.json"),
  );

  await attendre();
  const page2 = enPage(
    await appelApi(
      RECHERCHE,
      { ...PARAMS_FR, offset: TAILLE_PAGE, limit: TAILLE_PAGE },
      jeton,
      "recherche-page-2.json",
    ),
  );

  const ids1 = (page1.items ?? []).map(identifiant);
  const ids2 = (page2.items ?? []).map(identifiant);
  const doublons = ids1.filter((id) => ids2.includes(id));
  resume.pagination = {
    recuesPage1: ids1.length,
    recuesPage2: ids2.length,
    skipPage1: page1.skip,
    skipPage2: page2.skip,
    takePage2: page2.take,
    doublonsEntreLesDeuxPages: doublons.length,
    identifiantsUniques: new Set([...ids1, ...ids2]).size,
  };
  console.log(`Pagination : ${ids1.length} + ${ids2.length} recettes, ${doublons.length} doublon(s)`);

  // 4. Tri par date : condition pour ne recuperer plus tard que les nouveautes.
  //    Le tri decroissant seul ne prouve rien, car l'ordre par defaut est deja
  //    decroissant : on demande donc aussi le tri croissant. Si les deux
  //    reponses sont identiques, le parametre est ignore par l'API.
  await attendre();
  const triDecroissant = enPage(
    await appelApi(
      RECHERCHE,
      { ...PARAMS_FR, offset: 0, limit: TAILLE_PAGE, sort: "-createdAt" },
      jeton,
      "recherche-tri-createdat.json",
    ),
  );

  await attendre();
  const triCroissant = enPage(
    await appelApi(
      RECHERCHE,
      { ...PARAMS_FR, offset: 0, limit: TAILLE_PAGE, sort: "createdAt" },
      jeton,
      "recherche-tri-createdat-croissant.json",
    ),
  );

  const idsDecroissant = (triDecroissant.items ?? []).map(identifiant);
  const idsCroissant = (triCroissant.items ?? []).map(identifiant);
  resume.tri = {
    parametresEnvoyes: ["sort=-createdAt", "sort=createdAt"],
    memeOrdreQueSansTri: JSON.stringify(idsDecroissant) === JSON.stringify(ids1),
    croissantIdentiqueAuDecroissant: JSON.stringify(idsCroissant) === JSON.stringify(idsDecroissant),
  };

  // 5. Fiche detaillee d'une seule recette : la recherche renvoie-t-elle deja
  //    tout, ou faut-il un second appel par recette ?
  const premiere = (page1.items ?? [])[0];
  if (premiere) {
    const chemins = [
      [`recipes/${String(premiere.id ?? "")}`, "recette-detail-par-id.json"],
      [`recipes/by-slug/${String(premiere.slug ?? "")}`, "recette-detail-par-slug.json"],
    ] as const;

    for (const [chemin, fichier] of chemins) {
      await attendre();
      try {
        const detail = await appelApi(chemin, PARAMS_FR, jeton, fichier);
        resume.detail = { chemin, clesRacine: Object.keys((detail ?? {}) as object).sort() };
        break;
      } catch (erreur) {
        if (erreur instanceof RefusDuSite) throw erreur;
        resume.detail = { chemin, echec: (erreur as Error).message };
      }
    }
  }

  await writeFile(
    join(DOSSIER_DATA, "resume-collecte.json"),
    `${JSON.stringify(resume, null, 2)}\n`,
    "utf8",
  );
  console.log("Collecte terminee. JSON brut dans data/.");
}

principal().catch(async (erreur: Error) => {
  await journalise(`ARRET : ${erreur.message}`);
  process.exitCode = 1;
});
