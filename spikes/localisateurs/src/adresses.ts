// Teste le geocodage inverse sur quelques magasins seulement, autour d'Aix.
//
// Service : geocodage de la Base Adresse Nationale, porte par l'IGN sur la
// Geoplateforme. Adresse verifiee le 28 octobre 2026 :
// https://data.geopf.fr/geocodage/reverse. L'ancien domaine
// api-adresse.data.gouv.fr repond encore a l'identique, mais il etait annonce
// comme maintenu seulement jusqu'a janvier 2026 : on utilise l'adresse actuelle.
//
// Perimetre volontairement reduit, decide par Martin : on mesure d'abord ce qui
// manque dans OSM (src/mesure.ts), puis on teste le geocodage inverse sur
// quelques magasins incomplets autour d'Aix, et on verifie que l'adresse rendue
// est correcte. Aucune application a toute la France au lot 0.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, GEOCODAGE } from "./garde.ts";

/** Nombre maximum de magasins testes : c'est un echantillon, pas un traitement. */
const PLAFOND = 5;

type Magasin = { id: number; nom: string | null; ville: string | null; position: { latitude: number; longitude: number } | null };

/**
 * Temoin de controle : les coordonnees du Picard d'Aix Malacrida, relevees sur
 * son localisateur a l'hypothese 3, dont nous connaissons l'adresse exacte
 * (11 avenue Henri Malacrida, 13100 Aix-en-Provence). Si le geocodage inverse
 * la retrouve, c'est que la methode est bonne.
 */
const TEMOIN = {
  id: 0,
  nom: "Picard Aix Malacrida (temoin de controle)",
  ville: "Aix-en-Provence",
  position: { latitude: 43.5169999, longitude: 5.4665119 },
  adresseAttendue: /11\s+avenue\s+henri\s+malacrida/i,
};

type Resultat = Record<string, unknown>;

async function geocodeInverse(garde: Garde, magasin: Magasin, fichier: string): Promise<Resultat> {
  const { latitude, longitude } = magasin.position!;
  const url = `${GEOCODAGE}?lon=${longitude}&lat=${latitude}&index=address&limit=1`;
  const reponse = await garde.recupere(url, fichier);

  let trait: Record<string, any> | null = null;
  try {
    trait = JSON.parse(reponse.corps).features?.[0]?.properties ?? null;
  } catch {
    trait = null;
  }

  return {
    magasin: { id: magasin.id, nom: magasin.nom, villeOsm: magasin.ville },
    adresseRendue: trait?.label ?? null,
    numero: trait?.housenumber ?? null,
    rue: trait?.street ?? null,
    codePostal: trait?.postcode ?? null,
    ville: trait?.city ?? null,
    // `distance` est l'ecart en metres entre le point demande et l'adresse
    // trouvee : c'est le meilleur indicateur de fiabilite.
    distanceEnMetres: trait?.distance ?? null,
    score: trait?.score ?? null,
    typeDeResultat: trait?.type ?? null,
    // L'app a besoin de la ville : le geocodage la donne-t-il, et dit-elle la
    // meme chose que la donnee OSM quand celle-ci existe ?
    villeCoherenteAvecOsm:
      magasin.ville && trait?.city
        ? magasin.ville.toLowerCase().includes(String(trait.city).toLowerCase()) ||
          String(trait.city).toLowerCase().includes(magasin.ville.toLowerCase())
        : null,
  };
}

async function principal(): Promise<void> {
  const garde = new Garde();
  const chemin = join(DOSSIER_DATA, "mesure.json");
  if (!existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}. Lance d'abord « npm run mesure ».`);
  const mesure = JSON.parse(readFileSync(chemin, "utf8"));

  const resultats: Resultat[] = [];

  // 1. Temoin de controle : adresse connue, verifiee.
  const controle = await geocodeInverse(garde, TEMOIN, "geocodage-temoin.json");
  controle.adresseAttendueRetrouvee = TEMOIN.adresseAttendue.test(String(controle.adresseRendue ?? ""));
  resultats.push({ ...controle, role: "temoin de controle" });
  console.log(
    `Temoin : ${controle.adresseRendue} | attendue retrouvee : ${controle.adresseAttendueRetrouvee} | ${controle.distanceEnMetres} m`,
  );

  // 2. Les magasins Intermarche incomplets autour d'Aix, au plus cinq.
  //    On commence par ceux dont OSM connait deja la rue : c'est le seul moyen
  //    de verifier que l'adresse rendue est la bonne, et pas seulement
  //    plausible. Les magasins sans aucune adresse viennent ensuite.
  const incomplets: Magasin[] = ((mesure.incompletsAutourDAix ?? []) as (Magasin & { rueConnue?: string | null })[])
    .filter((m) => m.position)
    .sort((a, b) => Number(Boolean(b.rueConnue)) - Number(Boolean(a.rueConnue)));
  console.log(`${incomplets.length} magasin(s) incomplet(s) autour d'Aix, ${Math.min(incomplets.length, PLAFOND)} teste(s).`);

  for (const [position, magasin] of incomplets.slice(0, PLAFOND).entries()) {
    const resultat = await geocodeInverse(garde, magasin, `geocodage-${position + 1}.json`);
    resultats.push({ ...resultat, role: "magasin OSM sans adresse complete" });
    console.log(`  ${magasin.nom ?? magasin.id} -> ${resultat.adresseRendue} (${resultat.distanceEnMetres} m)`);
  }

  const complets = resultats.filter((r) => r.role !== "temoin de controle");
  const resume = {
    lanceLe: new Date().toISOString(),
    service: GEOCODAGE,
    testes: complets.length,
    avecUneAdresseRendue: complets.filter((r) => r.adresseRendue).length,
    aMoinsDe50Metres: complets.filter((r) => Number(r.distanceEnMetres ?? 9999) < 50).length,
    villeCoherente: complets.filter((r) => r.villeCoherenteAvecOsm === true).length,
    requetes: garde.total,
    resultats,
  };

  writeFileSync(join(DOSSIER_DATA, "adresses.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\nDetail dans data/adresses.json");
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
