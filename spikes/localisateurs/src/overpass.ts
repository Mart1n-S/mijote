// Hypothese 4, partie Intermarche : enumerer les magasins avec OpenStreetMap
// seulement, sans jamais appeler intermarche.com.
//
// Trois etapes, dans cet ordre, pour ne pas lancer de grosse requete a l'aveugle :
//   1. petit perimetre autour d'Aix-en-Provence, les deux enseignes a la fois.
//      Objectif : retrouver le Super de l'avenue des Infirmeries, et surtout
//      **decouvrir comment l'enseigne est etiquetee** (brand, operator,
//      brand:wikidata) plutot que de le supposer ;
//   2. enumeration nationale, enseigne par enseigne, avec l'etiquette trouvee ;
//   3. Picard sert d'etalon : on compare le nombre d'objets OSM aux 1 267 fiches
//      officielles relevees dans son sitemap a l'hypothese 3. Ca donne un taux
//      de completude mesure, transposable a Intermarche dont on n'a pas de liste.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Garde, DOSSIER_DATA, OVERPASS, RefusDuService } from "./garde.ts";

// Centre d'Aix-en-Provence, rayon 8 km.
const AIX = { latitude: 43.5297, longitude: 5.4474, rayon: 8000 };

/**
 * Objets commerciaux dont un des libelles cite l'enseigne, autour d'Aix.
 *
 * Premiere version de cette requete : les trois filtres etaient de simples
 * regex sur `name`, `brand` et `operator`, et Overpass a expire au bout de
 * 76 secondes. Une regex seule n'est pas indexee, le moteur balaye. On ajoute
 * donc devant un filtre de cle indexe (`shop` ou `amenity`), ce qui restreint
 * d'abord le jeu de donnees avant d'appliquer la regex.
 */
function requeteAutourDAix(): string {
  const autour = `(around:${AIX.rayon},${AIX.latitude},${AIX.longitude})`;
  const motif = "Intermarch|Picard";
  const cles = ["shop", "amenity"];
  const libelles = ["name", "brand", "operator"];
  const lignes = cles.flatMap((cle) =>
    libelles.map((libelle) => `  nwr["${cle}"]["${libelle}"~"${motif}",i]${autour};`),
  );
  return `[out:json][timeout:120];
(
${lignes.join("\n")}
);
out center tags;`;
}

/**
 * Enumeration nationale d'une enseigne. On filtre par `brand:wikidata` quand on
 * le connait : c'est l'identifiant stable de l'enseigne, bien plus fiable qu'un
 * nom, qui attrape « Boucherie Picard » ou « rue Picard ».
 */
function requeteNationale(wikidata: string | null, motifNom: string): string {
  const parWikidata = wikidata
    ? `  nwr["brand:wikidata"="${wikidata}"](area.fr);
  nwr["operator:wikidata"="${wikidata}"](area.fr);`
    : "";
  return `[out:json][timeout:180];
area["ISO3166-1"="FR"][admin_level=2]->.fr;
(
${parWikidata}
  nwr["brand"~"^${motifNom}",i](area.fr);
);
out center tags;`;
}

type Element = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function elements(corps: string): Element[] {
  try {
    return (JSON.parse(corps).elements ?? []) as Element[];
  } catch {
    return [];
  }
}

/** Coordonnees d'un objet, qu'il soit un noeud ou un polygone. */
function position(element: Element): { latitude: number; longitude: number } | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
}

/** Quelle enseigne, d'apres les libelles de l'objet ? */
function enseigne(tags: Record<string, string> = {}): "Intermarché" | "Picard" | "autre" {
  const texte = `${tags.brand ?? ""} ${tags.operator ?? ""} ${tags.name ?? ""}`;
  if (/intermarch/i.test(texte)) return "Intermarché";
  if (/picard/i.test(texte)) return "Picard";
  return "autre";
}

async function interroge(garde: Garde, requete: string, fichier: string): Promise<Element[]> {
  for (const [position_, point] of OVERPASS.entries()) {
    try {
      const reponse = await garde.recupere(point, fichier, requete);
      return elements(reponse.corps);
    } catch (erreur) {
      const dernier = position_ === OVERPASS.length - 1;
      if (erreur instanceof RefusDuService && !dernier) {
        console.log(`  ${point} occupe, bascule sur le miroir.`);
        continue;
      }
      throw erreur;
    }
  }
  return [];
}

async function principal(): Promise<void> {
  const garde = new Garde(true);
  const resume: Record<string, unknown> = { lanceLe: new Date().toISOString(), source: "OpenStreetMap via Overpass" };

  // 1. Autour d'Aix : les deux enseignes, pour decouvrir l'etiquetage.
  const autourDAix = await interroge(garde, requeteAutourDAix(), "aix-brut.json");
  const aix = autourDAix.map((element) => ({
    type: element.type,
    id: element.id,
    enseigne: enseigne(element.tags),
    nom: element.tags?.name ?? null,
    marque: element.tags?.brand ?? null,
    exploitant: element.tags?.operator ?? null,
    marqueWikidata: element.tags?.["brand:wikidata"] ?? null,
    typeDeCommerce: element.tags?.shop ?? element.tags?.amenity ?? null,
    rue: element.tags?.["addr:street"] ?? null,
    numero: element.tags?.["addr:housenumber"] ?? null,
    codePostal: element.tags?.["addr:postcode"] ?? null,
    ville: element.tags?.["addr:city"] ?? null,
    horaires: element.tags?.opening_hours ?? null,
    telephone: element.tags?.phone ?? element.tags?.["contact:phone"] ?? null,
    siteWeb: element.tags?.website ?? element.tags?.["contact:website"] ?? null,
    position: position(element),
  }));

  resume.autourDAix = {
    objets: aix.length,
    parEnseigne: {
      Intermarché: aix.filter((a) => a.enseigne === "Intermarché").length,
      Picard: aix.filter((a) => a.enseigne === "Picard").length,
      autre: aix.filter((a) => a.enseigne === "autre").length,
    },
    // Le critere de reussite fixe par Martin : retrouver le Super des Infirmeries.
    superDesInfirmeries: aix.filter(
      (a) => a.enseigne === "Intermarché" && /infirmeries/i.test(`${a.rue ?? ""} ${a.nom ?? ""}`),
    ),
    intermarchesTrouves: aix.filter((a) => a.enseigne === "Intermarché"),
    identifiantsWikidataRencontres: {
      Intermarché: [...new Set(aix.filter((a) => a.enseigne === "Intermarché").map((a) => a.marqueWikidata).filter(Boolean))],
      Picard: [...new Set(aix.filter((a) => a.enseigne === "Picard").map((a) => a.marqueWikidata).filter(Boolean))],
    },
  };

  writeFileSync(join(DOSSIER_DATA, "aix.json"), `${JSON.stringify(aix, null, 1)}\n`, "utf8");
  console.log(
    `Autour d'Aix : ${aix.length} objets, dont ${resume.autourDAix && (resume.autourDAix as any).parEnseigne.Intermarché} Intermarché et ${(resume.autourDAix as any).parEnseigne.Picard} Picard.`,
  );

  // 2 et 3. Enumeration nationale, avec l'identifiant decouvert a l'etape 1.
  const identifiants = (resume.autourDAix as any).identifiantsWikidataRencontres as Record<string, string[]>;
  const national: Record<string, unknown> = {};

  for (const [nom, motif] of [
    ["Intermarché", "Intermarch"],
    ["Picard", "Picard"],
  ] as const) {
    const fichier = join(DOSSIER_DATA, `national-${nom.toLowerCase().replace(/[^a-z]/g, "")}.json`);
    // Overpass est un service gratuit et souvent sature : on ne redemande pas
    // ce qui est deja sur le disque, sauf si on force explicitement.
    if (existsSync(fichier) && !process.env.FORCE) {
      const dejaLa = JSON.parse(readFileSync(fichier, "utf8")) as unknown[];
      national[nom] = { source: "deja collecte, requete evitee", retenus: dejaLa.length };
      console.log(`${nom} : ${dejaLa.length} objets deja sur le disque, requete evitee.`);
      continue;
    }

    const wikidata = identifiants[nom]?.[0] ?? null;
    const objets = await interroge(
      garde,
      requeteNationale(wikidata, motif),
      `national-${nom.toLowerCase().replace(/[^a-z]/g, "")}-brut.json`,
    );
    const retenus = objets.filter((element) => enseigne(element.tags) === nom);
    writeFileSync(
      join(DOSSIER_DATA, `national-${nom.toLowerCase().replace(/[^a-z]/g, "")}.json`),
      `${JSON.stringify(
        retenus.map((element) => ({ type: element.type, id: element.id, tags: element.tags, position: position(element) })),
        null,
        1,
      )}\n`,
      "utf8",
    );
    national[nom] = { wikidataUtilise: wikidata, objetsRendus: objets.length, retenus: retenus.length };
    console.log(`${nom} en France : ${retenus.length} objets retenus sur ${objets.length} rendus.`);
  }

  resume.national = national;
  resume.requetes = garde.total;
  writeFileSync(join(DOSSIER_DATA, "overpass.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  console.log("\nDetail dans data/overpass.json");
}

principal().catch((erreur: Error) => {
  console.error(`ARRET : ${erreur.name} ${erreur.message}`);
  process.exitCode = 1;
});
