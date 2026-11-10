// Types et schémas partagés entre apps/api et apps/web. Les deux applications
// ne s'importent jamais l'une l'autre : ce qu'elles ont en commun passe par ici.
export * from './auth.js';
export * from './household.js';
export * from './privacy.js';
export * from './problem-details.js';
