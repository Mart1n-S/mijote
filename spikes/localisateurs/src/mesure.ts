// Mesure, hors ligne, ce que les donnees OpenStreetMap contiennent reellement
// pour les deux enseignes.
//
// Deux pieges a corriger avant de compter quoi que ce soit, tous deux reperes
// sur les donnees brutes :
//   1. une requete par enseigne ramene bien plus que des magasins : stations
//      service (`shop=gas`, `amenity=fuel`), stations de lavage, laveries,
//      batiments. Il faut filtrer sur le type de commerce ;
//   2. le meme magasin apparait souvent deux fois, une fois en noeud (le
//      commerce) et une fois en polygone (le batiment). Sans regroupement
//      geographique, on compte double.
//
// Etalon : le sitemap officiel de magasins.picard.fr annonce 1 267 fiches
// (hypothese 3, docs/lot-0/picard.md). Comparer ce que OSM connait de Picard a
// ce chiffre donne un taux de completude mesure, transposable a Intermarche,
// dont nous n'avons aucune liste officielle puisqu'on n'appelle pas leur site.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOSSIER_DATA = join(import.meta.dirname, "..", "data");

/** Nombre de fiches de magasin du sitemap officiel Picard (hypothese 3). */
const FICHES_OFFICIELLES_PICARD = 1267;

/** Types de commerce qui sont un magasin ou on fait ses courses. */
const COMMERCES = /supermarket|convenience|grocery|frozen_food|outpost|general/;

/** Deux objets a moins de 80 m sont consideres comme le meme magasin. */
const RAYON_DE_REGROUPEMENT_M = 80;

type Position = { latitude: number; longitude: number };
type Objet = { type: string; id: number; tags?: Record<string, string>; position: Position | null };

/** Distance approximative en metres entre deux points proches. */
function distance(a: Position, b: Position): number {
  const metresParDegre = 111_320;
  const dLat = (a.latitude - b.latitude) * metresParDegre;
  const dLon = (a.longitude - b.longitude) * metresParDegre * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Regroupe les objets qui decrivent le meme magasin : meme enseigne, a moins de
 * 80 m. On garde dans chaque groupe l'objet le mieux renseigne, et on fusionne
 * les libelles, car le noeud et le polygone ne portent pas toujours les memes.
 */
function regroupe(objets: Objet[]): { tags: Record<string, string>; position: Position; objets: number }[] {
  const restants = objets.filter((o) => o.position !== null);
  const groupes: { tags: Record<string, string>; position: Position; objets: number }[] = [];
  const pris = new Set<number>();

  for (const [index, objet] of restants.entries()) {
    if (pris.has(index)) continue;
    const membres = [objet];
    pris.add(index);

    for (const [autreIndex, autre] of restants.entries()) {
      if (pris.has(autreIndex)) continue;
      if (distance(objet.position!, autre.position!) <= RAYON_DE_REGROUPEMENT_M) {
        membres.push(autre);
        pris.add(autreIndex);
      }
    }

    // Fusion des libelles : le plus complet gagne, les manques sont combles.
    const tags: Record<string, string> = {};
    for (const membre of membres.sort((a, b) => Object.keys(b.tags ?? {}).length - Object.keys(a.tags ?? {}).length)) {
      for (const [cle, valeur] of Object.entries(membre.tags ?? {})) {
        if (tags[cle] === undefined) tags[cle] = valeur;
      }
    }
    groupes.push({ tags, position: membres[0].position!, objets: membres.length });
  }

  return groupes;
}

function mesureUneEnseigne(objets: Objet[]): Record<string, unknown> {
  const commerces = objets.filter((o) => COMMERCES.test(o.tags?.shop ?? ""));
  const magasins = regroupe(commerces);
  const total = magasins.length;
  const taux = (n: number) => `${n}/${total} (${total ? Math.round((n / total) * 100) : 0} %)`;
  const avec = (lecteur: (t: Record<string, string>) => string | undefined) =>
    magasins.filter((m) => {
      const valeur = lecteur(m.tags);
      return valeur !== undefined && valeur.trim() !== "";
    }).length;

  const horsCommerce = new Map<string, number>();
  for (const objet of objets) {
    if (COMMERCES.test(objet.tags?.shop ?? "")) continue;
    const cle = objet.tags?.shop
      ? `shop=${objet.tags.shop}`
      : objet.tags?.amenity
        ? `amenity=${objet.tags.amenity}`
        : "(ni commerce ni service)";
    horsCommerce.set(cle, (horsCommerce.get(cle) ?? 0) + 1);
  }

  return {
    objetsRendusParOsm: objets.length,
    dontCommerces: commerces.length,
    ecartesCarNiMagasinNiCourses: Object.fromEntries([...horsCommerce].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    magasinsApresRegroupement: total,
    objetsFusionnes: commerces.length - total,
    // Les trois champs dont l'application a besoin pour proposer un magasin.
    champsIndispensables: {
      nom: taux(avec((t) => t.name ?? t.brand ?? t.operator)),
      ville: taux(avec((t) => t["addr:city"])),
      coordonnees: taux(total),
      lesTrois: taux(
        magasins.filter((m) => (m.tags.name ?? m.tags.brand ?? m.tags.operator) && m.tags["addr:city"]).length,
      ),
    },
    champsDeConfort: {
      numeroEtRue: taux(magasins.filter((m) => m.tags["addr:housenumber"] && m.tags["addr:street"]).length),
      rueSeule: taux(avec((t) => t["addr:street"])),
      codePostal: taux(avec((t) => t["addr:postcode"])),
      horaires: taux(avec((t) => t.opening_hours)),
      telephone: taux(avec((t) => t.phone ?? t["contact:phone"])),
      siteWeb: taux(avec((t) => t.website ?? t["contact:website"])),
      marqueWikidata: taux(avec((t) => t["brand:wikidata"])),
      // Pour Intermarche, le tag website contient l'identifiant interne du
      // magasin (pdvref), recuperable sans jamais appeler leur site.
      identifiantInterneDansLeSiteWeb: taux(
        magasins.filter((m) => /\/magasins\/\d+\//.test(m.tags.website ?? m.tags["contact:website"] ?? "")).length,
      ),
    },
    sousEnseignes: Object.fromEntries(
      [...magasins.reduce((compte, m) => {
        const cle = m.tags.name ?? m.tags.brand ?? "(sans nom)";
        compte.set(cle, (compte.get(cle) ?? 0) + 1);
        return compte;
      }, new Map<string, number>())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    ),
    magasins,
  };
}

function lit(fichier: string): Objet[] {
  const chemin = join(DOSSIER_DATA, fichier);
  if (!existsSync(chemin)) throw new Error(`Fichier absent : ${chemin}. Lance d'abord « npm run overpass ».`);
  return JSON.parse(readFileSync(chemin, "utf8")) as Objet[];
}

function principal(): void {
  const intermarche = mesureUneEnseigne(lit("national-intermarch.json"));
  const picard = mesureUneEnseigne(lit("national-picard.json"));

  const magasinsItm = intermarche.magasins as { tags: Record<string, string>; position: Position }[];
  const nombreItm = intermarche.magasinsApresRegroupement as number;
  const nombrePicard = picard.magasinsApresRegroupement as number;
  const completude = nombrePicard / FICHES_OFFICIELLES_PICARD;

  // Magasins Intermarche autour d'Aix dont l'adresse n'est pas complete :
  // ce sont eux que le geocodage inverse doit completer (src/adresses.ts).
  //
  // Premiere version de ce filtre : une regex sur le nom de la ville. Elle a
  // retenu « Plourin-lès-Morlaix », a 1 000 km, parce que « aix » y figure. On
  // filtre donc sur la distance reelle, seule mesure fiable.
  const AIX = { latitude: 43.5297, longitude: 5.4474 };
  const incompletsAutourDAix = magasinsItm
    .filter((m) => distance(AIX, m.position) <= 20_000)
    .filter((m) => !(m.tags["addr:housenumber"] && m.tags["addr:street"]))
    .map((m) => ({
      id: Number(/\/magasins\/(\d+)\//.exec(m.tags.website ?? "")?.[1] ?? 0),
      nom: m.tags.name ?? null,
      ville: m.tags["addr:city"] ?? null,
      rueConnue: m.tags["addr:street"] ?? null,
      position: m.position,
    }));

  const { magasins: _itm, ...intermarcheSansDetail } = intermarche;
  const { magasins: _pic, ...picardSansDetail } = picard;

  const resume = {
    mesureLe: new Date().toISOString(),
    besoinsDeLApplication: {
      indispensables: ["nom", "ville", "coordonnees"],
      confort: ["numero et rue", "code postal", "horaires", "telephone"],
    },
    intermarche: intermarcheSansDetail,
    picard: picardSansDetail,
    etalonnage: {
      fichesOfficiellesPicard: FICHES_OFFICIELLES_PICARD,
      magasinsPicardDansOsm: nombrePicard,
      tauxDeCompletudeMesure: `${Math.round(completude * 100)} %`,
      magasinsIntermarcheDansOsm: nombreItm,
      estimationDuReseauIntermarcheReel: Math.round(nombreItm / completude),
    },
    incompletsAutourDAix,
  };

  writeFileSync(join(DOSSIER_DATA, "mesure.json"), `${JSON.stringify(resume, null, 2)}\n`, "utf8");
  writeFileSync(
    join(DOSSIER_DATA, "magasins-intermarche.json"),
    `${JSON.stringify(magasinsItm, null, 1)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(resume, null, 2));
}

principal();
