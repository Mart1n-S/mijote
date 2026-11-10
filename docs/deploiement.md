# Déploiement

Ce document décrit ce qui tourne sur le homelab et ce que le dépôt ne contient
pas : en-têtes de sécurité du serveur frontal, politique de sécurité du
contenu de la PWA, HSTS, mandataire inverse et sauvegardes.

**Il est encore à écrire.** L'issue #31 le porte, avec la structure complète des
sujets à couvrir. Ce fichier commence ici parce que la story #15 a pris une
décision d'exploitation qui ne pouvait pas attendre, et qui n'a pas d'autre
endroit où vivre.

## HTTPS sur le réseau local

À écrire avec l'issue #31, qui porte le critère : **Mijote doit être servie en
HTTPS même sans exposition à Internet**, et ce document doit dire comment
obtenir le certificat.

La raison n'est pas le confort : les trois cookies de session portent
l'attribut `Secure` (ADR 0010), qu'un navigateur ignore hors de `localhost`
quand la connexion est en clair, et l'installation d'une PWA exige une origine
sûre. En HTTP sur une adresse de réseau local, la session ne tiendrait pas et
l'application ne s'installerait pas.

## Sauvegardes

La base est sauvegardée **chaque jour**, et un test de restauration a lieu
chaque mois (cahier des charges, section 10).

**La rotation est de sept jours au plus.** Ce n'est pas un réglage libre : la
page de confidentialité de l'application l'annonce aux utilisateurs, donc la
rotation réelle doit la tenir. Voir l'ADR 0017.

### Après une restauration, les comptes supprimés réapparaissent

Une suppression de compte est immédiate et définitive dans la base vivante
(ADR 0017), mais elle ne réécrit pas les sauvegardes déjà prises. Restaurer une
sauvegarde ramène donc **tous les comptes supprimés depuis sa date**, avec leur
foyer, leur profil et leurs données de santé.

Il n'existe aucune façon d'éviter cela par le code : la suppression est faite et
oubliée, et rien ne garde la trace de qui a été supprimé, ce qui est précisément
ce qu'un effacement doit être.

**La consigne est donc d'exploitation** : après chaque restauration, les
suppressions de comptes survenues entre la date de la sauvegarde et l'incident
doivent être refaites à la main, sur la base restaurée. Le journal d'audit, qui
conserve un an les actions sensibles dont « suppression de compte » (cahier des
charges, section 8), est l'endroit où retrouver quels comptes étaient
concernés : ses lignes ne portent qu'un identifiant, ce qui suffit à supprimer
la bonne ligne et à rien d'autre.

Cette consigne vaut aussi pour le test de restauration mensuel, s'il se fait sur
une copie de la base de production.
