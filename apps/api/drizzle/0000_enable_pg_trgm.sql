-- Active pg_trgm, nécessaire à la correspondance approximative entre un
-- ingrédient de recette et un produit de magasin (docs/lot-0/correspondance.md).
-- Aucune table dans cette migration : le lot 1 ne crée pas de schéma métier.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
