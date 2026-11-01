---
paths:
  - "apps/api/**"
---

# API NestJS

## Structure

- Un module NestJS par domaine (accounts, households, recipes, stores…). Un module n'accède pas directement aux tables d'un autre : il passe par son service.
- Contrôleurs minces : ils valident l'entrée et délèguent au service. La logique métier vit dans les services, testable sans HTTP.

## Erreurs

- Format unique RFC 9457 (Problem Details) pour toutes les réponses d'erreur, par un filtre d'exceptions global : `type`, `title`, `status`, `detail`, et l'identifiant de requête.
- Distinguer les erreurs attendues (validation, droits, ressource absente) des erreurs inattendues. Une erreur inattendue renvoie un message générique ; le détail ne part qu'au journal.
- Le `detail` renvoyé ne vient **que** d'une exception écrite par le projet (`ProblemException` et ses filles). Le message d'une exception de NestJS ou d'une bibliothèque reste au journal, et le filtre sert un détail générique en français à sa place. Mesuré : sur une route inconnue, NestJS recopie l'URL avec sa chaîne de requête, donc l'adresse saisie pour trouver un magasin ; sur un corps illisible, l'adaptateur Express recopie les premiers caractères du corps reçu.
- Jamais de trace technique, de requête SQL ni de chemin de fichier dans une réponse.

## Journaux

- pino, au format JSON. Chaque ligne porte l'identifiant de requête, qui suit la requête de bout en bout.
- Niveaux : `error`, `warn`, `info`, `debug` ; `debug` coupé en production.
- Rien de sensible : ni mot de passe, ni jeton, ni cookie, ni donnée personnelle (voir la rule sécurité).

## Base de données

- Toute modification du schéma passe par le schéma Drizzle et une migration générée, relue et versionnée. Jamais de SQL exécuté à la main sur une base.
- Les extensions (`pg_trgm`) et les index associés s'ajoutent par migration.
- Montants en entiers (centimes), dates en `timestamptz`.
- Chaque requête qui lit ou modifie des données d'un foyer filtre par ce foyer.

## Sources externes

- Les appels vers les sites tiers vivent uniquement dans les connecteurs, jamais dans un contrôleur ou au chargement d'une page.
- Avant de modifier un connecteur, lire le rapport correspondant dans `docs/lot-0/`.
