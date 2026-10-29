// Schéma Drizzle. Le lot 1 ne définit aucune table : les tables métier
// (recettes, planning, courses) arriveront avec leurs stories. La migration
// 0000 n'active que l'extension pg_trgm, dont dépendra la correspondance
// ingrédient vers produit (docs/lot-0/correspondance.md).
export {};
