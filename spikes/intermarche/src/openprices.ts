// Complement de l'hypothese Intermarche : que vaut Open Prices, la base de prix
// ouverte d'Open Food Facts, pour le meme magasin ?
//
// Source ouverte, hors du cadre Intermarche : aucune restriction a contourner.
// On mesure trois choses :
//   1. le magasin d'Aix-en-Provence est-il reference comme lieu ?
//   2. combien de prix existent pour les magasins Intermarche en France ?
//   3. pour un code-barres connu, combien de prix releves, et a quelle date ?
//
// Les noms exacts des filtres de l'API ne sont pas devines : on lit d'abord un
// enregistrement, puis on se sert de ses propres champs comme filtres.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA } from "./garde.ts";

const API = "https://prices.openfoodfacts.org/api/v1";

// Code-barres releve sur la fiche produit Intermarche avant le blocage.
const CODE_BARRES_CONNU = "3038354536002";

type Page = { items?: Record<string, any>[]; total?: number; page?: number; size?: number; pages?: number };

async function json(garde: Garde, url: string, fichier?: string): Promise<Page> {
  const reponse = await garde.recupere(url, fichier, "application/json");
  try {
    return JSON.parse(reponse.corps) as Page;
  } catch {
    return {};
  }
}

async function principal(): Promise<void> {
  const garde = new Garde();
  const resume: Record<string, unknown> = { lanceLe: new Date().toISOString(), api: API };

  // 1. Un prix au hasard, pour decouvrir les champs disponibles et leur nom.
  const unPrix = await json(garde, `${API}/prices?size=1`, "op-un-prix.json");
  const exemple = unPrix.items?.[0] ?? {};
  resume.formeDeLApi = {
    totalDePrixDansLaBase: unPrix.total,
    champsDUnPrix: Object.keys(exemple).sort(),
    champsDUnLieu: Object.keys(exemple.location ?? {}).sort(),
  };

  // 2. Les lieux : on cherche les magasins Intermarche a Aix-en-Provence, puis
  //    en France, en filtrant sur les champs vus a l'etape 1.
  const lieuxAix = await json(
    garde,
    `${API}/locations?osm_address_city__like=Aix-en-Provence&size=50`,
    "op-lieux-aix.json",
  );
  const intermarcheAix = (lieuxAix.items ?? []).filter((l) => /intermarch/i.test(String(l.osm_name ?? "")));
  resume.magasinRecherche = {
    lieuxTrouvesAAix: lieuxAix.total,
    dontIntermarche: intermarcheAix.length,
    detail: intermarcheAix.map((l) => ({
      osm_id: l.osm_id,
      osm_type: l.osm_type,
      nom: l.osm_name,
      rue: l.osm_address_street,
      prixReleves: l.price_count,
    })),
  };

  // 3. Tous les lieux nommes Intermarche, toutes villes confondues.
  const lieuxItm = await json(garde, `${API}/locations?osm_name__like=Intermarch&size=100`, "op-lieux-intermarche.json");
  const prixParLieu = (lieuxItm.items ?? []).map((l) => Number(l.price_count ?? 0));
  resume.intermarcheEnFrance = {
    lieuxReferences: lieuxItm.total,
    lieuxLusSurCettePage: prixParLieu.length,
    prixCumulesSurCesLieux: prixParLieu.reduce((a, b) => a + b, 0),
    lieuxSansAucunPrix: prixParLieu.filter((n) => n === 0).length,
    maximumDePrixPourUnLieu: prixParLieu.length > 0 ? Math.max(...prixParLieu) : 0,
  };

  // 4. Le code-barres releve avant le blocage : des prix, et de quand ?
  const prixDuProduit = await json(
    garde,
    `${API}/prices?product_code=${CODE_BARRES_CONNU}&size=20`,
    "op-prix-produit.json",
  );
  const releves = (prixDuProduit.items ?? []).map((p) => ({
    prix: p.price,
    date: p.date,
    lieu: p.location?.osm_name ?? p.location_id,
    ville: p.location?.osm_address_city,
  }));
  resume.produitConnu = {
    codeBarres: CODE_BARRES_CONNU,
    prixReleves: prixDuProduit.total,
    detail: releves,
  };

  resume.requetes = garde.compteurs;
  writeFileSync(join(DOSSIER_DATA, "openprices.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\n--- resume ---");
  console.log(JSON.stringify(resume, null, 2));
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
