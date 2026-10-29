// Filtre des donnees personnelles, applique **des l'extraction**, avant tout
// affichage, journal ou ecriture sur le disque.
//
// Regle du CLAUDE.md, section « Regles du lot 0 » : ne jamais afficher, recopier
// ni journaliser le nom, l'adresse, l'e-mail, le telephone, les numeros de carte
// de fidelite ou de paiement.
//
// Deux mecanismes complementaires, parce qu'une liste de motifs seule serait
// fragile :
//   1. **liste blanche de sortie** : le module d'extraction ne rend qu'un objet
//      structure (magasin, date, lignes d'articles, total). Tout le reste du
//      document n'est jamais recopie, donc rien a filtrer ;
//   2. **detecteur**, utilise pour mesurer : il repere dans le texte brut les
//      categories de donnees personnelles presentes, et il verifie qu'aucune ne
//      ressort dans l'objet rendu. C'est ce double controle que l'application
//      devra faire, et c'est lui qu'on mesure dans le rapport.

/** Categories de donnees personnelles recherchees. */
export type Categorie = "nom" | "adresse" | "code postal et ville" | "e-mail" | "téléphone" | "fidélité" | "paiement";

type Motif = { categorie: Categorie; motif: RegExp };

/**
 * Motifs volontairement larges : mieux vaut signaler trop que laisser passer.
 * Aucune valeur reelle ne figure ici, seulement des formes.
 */
const MOTIFS: Motif[] = [
  { categorie: "nom", motif: /\bnom\s*:/i },
  { categorie: "nom", motif: /\b(?:M\.|Mme|Mlle)\s+[A-ZÀ-Ý][\p{L}'-]+/u },
  { categorie: "adresse", motif: /\b\d{1,4}\s*(?:bis|ter)?\s*(?:rue|avenue|av\.?|bd|boulevard|chemin|impasse|all[ée]e|place|route|quai|cours)\b/i },
  { categorie: "code postal et ville", motif: /\b\d{5}\s+[A-ZÀ-Ý][\p{L}' -]{2,}/u },
  { categorie: "e-mail", motif: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { categorie: "téléphone", motif: /(?:\+33|\b0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/ },
  { categorie: "fidélité", motif: /\bn[°o]\s*:?\s*\d{6,}/i },
  { categorie: "fidélité", motif: /\b\d{10,}\b/ },
  { categorie: "paiement", motif: /\b(?:\d{4}[ -]?){3}\d{4}\b/ },
  { categorie: "paiement", motif: /\b(?:carte|cb)\b[^\n]{0,20}\b\d{4,}/i },
];

/** Categories de donnees personnelles presentes dans un texte brut. */
export function detecte(texte: string): Categorie[] {
  const trouvees = new Set<Categorie>();
  for (const { categorie, motif } of MOTIFS) {
    if (motif.test(texte)) trouvees.add(categorie);
  }
  return [...trouvees];
}

/**
 * Remplace toute donnee personnelle par un marqueur. Sert de ceinture de
 * securite : la liste blanche devrait suffire, mais tout texte qui sortirait
 * malgre tout passe par ici.
 */
export function masque(texte: string): string {
  let sortie = texte;
  for (const { categorie, motif } of MOTIFS) {
    sortie = sortie.replace(new RegExp(motif.source, `${motif.flags.replace("g", "")}g`), `[${categorie} masqué]`);
  }
  return sortie;
}

/**
 * Verifie qu'un objet rendu par l'extraction ne contient aucune donnee
 * personnelle. Renvoie les categories qui auraient fuite, donc vide si tout va
 * bien. C'est la mesure du filtre.
 */
export function verifie(objet: unknown): Categorie[] {
  return detecte(JSON.stringify(objet));
}
