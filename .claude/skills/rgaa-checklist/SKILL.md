---
name: rgaa-checklist
description: Grille RGAA 4.1.2 appliquée à l'interface Vue de mijote. À charger seulement quand Martin demande une relecture d'accessibilité ou un critère RGAA exact, et par l'agent a11y-reviewer quand il tourne. Écrire ou relire un composant de apps/web ne suffit plus à la charger, le projet ne visant plus la conformité AA mais un socle de base (ADR 0007).
---

# Grille RGAA pour mijote

Ce skill dit **quoi vérifier** dans le code de `apps/web` et **quel critère citer**. Il ne remplace ni les règles de `.claude/rules/vue-accessibility.md` (comment écrire), ni l'agent `a11y-reviewer` (qui décide de la gravité).

## 1. Référentiel qui fait foi

- **RGAA 4.1.2**, 106 critères. Liste complète, recopiée depuis la source officielle : `references/criteres-rgaa-4.1.2.md`. Un critère se cite par son numéro et son intitulé tels qu'ils y figurent, jamais de mémoire.
- **RGAA 5** est annoncé par la DINUM pour fin 2026, aligné sur WCAG 2.2, sans texte publié à ce jour. La section 5 liste ce qu'il est sage d'anticiper. Le jour où il paraît, cette grille est à refaire.
- **Le projet ne vise plus aucun niveau RGAA.** Son exigence est le socle de base de `.claude/rules/vue-accessibility.md` (cahier des charges, section 7, ADR 0007). Un critère cité depuis cette grille éclaire un point ; il n'engage pas une conformité, et il ne rend pas bloquant ce qui sort du socle.

## 2. Ce que l'outillage couvre déjà

Ne signale pas ce que ces contrôles attrapent : signale seulement qu'ils échouent ou qu'ils manquent sur un écran.

| Contrôle | Où | Ce qu'il tient |
| --- | --- | --- |
| axe-core | tests Playwright de `apps/web/e2e/` | une partie mécanique de 1.1, 1.2, 3.2, 5.6, 6.2, 8.3, 8.5, 9.1, 11.1, 12.6 |
| eslint-plugin-vuejs-accessibility | `pnpm lint` | étiquettes de champ, alternatives d'image, rôles ARIA invalides |
| Test des contrastes des jetons | `apps/web/src/styles/tokens.spec.ts` | 3.2 et 3.3 pour chaque couple déclaré, dans les deux thèmes |
| Test des requêtes tierces | `apps/web/e2e/third-party.spec.ts` | aucune ressource chargée hors de l'origine |

axe-core ne voit qu'environ un tiers des critères, et jamais leur **pertinence** (1.3, 6.1, 8.6, 11.2, 11.9...). La pertinence est le travail de la relecture.

## 3. Grille par thème

Pour chaque point : le critère, puis ce qui se vérifie **dans le code de mijote**.

### Images (1)

- **1.1, 1.3** Photo de plat : `alt` qui décrit le plat ("Curry de pois chiches, riz et coriandre"), pas "photo" ni le nom du fichier.
- **1.2** Icône à côté d'un libellé, illustration : `alt=""` ou `aria-hidden="true"` sur le SVG.
- **1.1, 1.6** Graphique de statistiques : un titre, et l'information disponible autrement (tableau ou phrase de synthèse). Un graphique sans équivalent textuel est non conforme.

### Couleurs (3)

- **3.1** Aucun état porté par la couleur seule : erreur, article coché, page courante, budget dépassé, disponibilité d'un produit. Toujours un texte, une icône ou une forme en plus.
- **3.2, 3.3** Toute couleur vient d'un jeton de `tokens.css`. Un nouveau couple (texte ou contour sur un fond) s'ajoute au test des contrastes : texte 4,5:1, composant et focus 3:1.

### Tableaux (5)

- **5.4, 5.5** Tableau de données (liste de courses en tableau, dépenses, statistiques) : un `<caption>` pertinent.
- **5.6, 5.7** En-têtes en `<th>` avec `scope`, ou `id` et `headers` si le tableau est complexe.
- **5.3, 5.8** Jamais de `<table>` pour la mise en page.

### Liens (6)

- **6.1** Intitulé compréhensible hors contexte. "Voir la recette" répété dix fois ne l'est pas : préciser le nom de la recette (dans le texte ou en texte masqué).
- **6.2** Lien ou bouton qui ne contient qu'une icône : nom accessible obligatoire.

### Scripts (7)

- **7.1** Composant interactif sur mesure : rôle, nom et état exposés (`aria-expanded`, `aria-pressed`, `aria-current`...). Préférer le natif, puis Reka UI, avant tout ARIA fait main.
- **7.3** Tout se fait au clavier : Tab, Entrée, Espace, Échap, flèches dans les listes et menus.
- **7.4** Un `select` ou une case qui change de page ou recharge le contenu sans action explicite est non conforme : passer par un bouton de validation.
- **7.5** Message de statut (prix recalculé, article coché, liste enregistrée, erreur de chargement) : restitué par une région `aria-live` ou `role="status"`/`role="alert"` **présente dans le DOM avant** le message.

### Éléments obligatoires (8)

- **8.3, 8.4** `lang="fr"` sur `<html>`.
- **8.5, 8.6** Chaque route pose un titre de page **pertinent** et distinct ("Liste de courses, semaine du 2 novembre, mijote").
- **8.7** Mot ou passage dans une autre langue (nom de recette anglais) : attribut `lang` sur l'élément.
- **8.9** Pas de `<h2>` choisi pour sa taille, pas de `<br>` pour espacer.

### Structuration (9)

- **9.1** Titres hiérarchisés sans saut de niveau, un seul `<h1>` par page.
- **9.2** Repères `header`, `nav`, `main`, `footer`, une seule `main`.
- **9.3** Toute suite d'éléments de même nature (ingrédients, articles, étapes) est une vraie liste, ordonnée si l'ordre compte.

### Présentation (10)

- **10.4** Texte agrandi à 200 % : rien de coupé ni de superposé. Tailles en `rem`, jamais de hauteur fixe sur un bloc de texte.
- **10.7** Focus visible partout, y compris sur un élément personnalisé et dans le thème sombre.
- **10.8** Contenu masqué : `display:none`/`hidden` s'il doit être ignoré, classe de masquage visuel s'il doit être lu.
- **10.9, 10.10** Pas d'information portée par la seule position ("le bouton à droite").
- **10.11** Aucun défilement horizontal à 320 px de large, et contenu utilisable à 256 px de haut (téléphone en paysage, avec la barre basse).
- **10.12** Espacement du texte redéfini par l'utilisateur sans perte : pas de hauteur fixe ni de `overflow: hidden` sur un conteneur de texte.
- **10.13, 10.14** Infobulle ou contenu au survol : masquable par Échap, survolable, reste affiché tant que le focus ou le pointeur y est, atteignable au clavier.

### Formulaires (11)

- **11.1, 11.2, 11.4** Étiquette visible, pertinente, accolée au champ. Un `placeholder` n'est pas une étiquette.
- **11.5, 11.6, 11.7** Groupe de champs liés (adresse, contraintes alimentaires, choix du magasin) : `fieldset` et `legend`.
- **11.9** Bouton : intitulé qui dit ce qu'il fait ("Enregistrer le profil", pas "OK").
- **11.10** Champ obligatoire et format attendu indiqués avant la saisie ; erreur liée au champ (`aria-describedby`, `aria-invalid` cohérents) et annoncée.
- **11.11** L'erreur propose une correction ("Saisissez un prix en euros, par exemple 3,49").
- **11.12** Suppression d'un repas, d'une liste, du compte, d'un ticket importé : confirmation ou annulation possible.
- **11.13** `autocomplete` sur les champs personnels : `email`, `current-password`, `new-password`, `one-time-code`, `name`, `postal-code`.

### Navigation (12)

- **12.1** Deux systèmes de navigation au moins (menu, plus recherche ou plan du site) dès qu'il y a plusieurs pages.
- **12.2** Menu au même endroit sur toutes les pages, pour une même largeur d'écran.
- **12.7** Lien d'évitement vers `main`, premier élément focusable.
- **12.8** Ordre de tabulation qui suit l'ordre visuel ; aucun `tabindex` positif.
- **12.9** Aucun piège clavier. Un dialogue garde le focus tant qu'il est ouvert, mais se ferme par Échap et rend le focus au déclencheur.
- **12.11** Menu, panneau ou contenu révélé : atteignable au clavier.

### Consultation (13)

- **13.1** Limite de temps (expiration de session, message qui disparaît seul) : l'utilisateur est averti et peut prolonger ; un message important ne disparaît pas tout seul.
- **13.8** Contenu en mouvement ou clignotant lancé automatiquement : l'utilisateur peut l'arrêter. Le projet coupe aussi toute animation sous `prefers-reduced-motion`.
- **13.9** Utilisable en portrait comme en paysage.
- **13.10** Glisser-déposer du planning : toujours doublé de boutons (cahier des charges, section 7).
- **13.11** Action déclenchée au relâchement du pointeur, pas à l'appui, ou annulable.

### Thèmes sans objet aujourd'hui

- **2 (Cadres)** : aucun `iframe`. Redevient applicable si une vidéo de recette est intégrée.
- **4 (Multimédia)** : aucune vidéo ni audio. Même remarque.
- **13.3, 13.4** : aucun document bureautique en téléchargement. Redevient applicable si l'export de données (story #15) produit un PDF ou un tableur.

## 4. Ce que le code ne permet pas de trancher

Certains critères ne se décident qu'à l'usage : restitution réelle au lecteur d'écran (NVDA, VoiceOver), pertinence d'une annonce, ordre de lecture ressenti. Dans ce cas, le point se classe **« À vérifier »**, avec la manipulation précise à faire ("ouvrir le dialogue avec NVDA et vérifier que son titre est annoncé"). L'audit manuel de fin de lot est arrêté (ADR 0007) : ces points se consignent en limite connue, avec la manipulation à faire, pour qui voudra les écouter un jour.

## 5. À anticiper : WCAG 2.2, attendu dans RGAA 5

Pas encore exigible, donc jamais Bloquant. Mais les quatre premiers concernent directement mijote :

| WCAG 2.2 | Exigence | Dans mijote |
| --- | --- | --- |
| 2.4.11 Focus non masqué | l'élément focalisé n'est pas entièrement caché | la barre basse fixe ne doit jamais recouvrir le champ ou le bouton qui a le focus (`scroll-padding-bottom`) |
| 2.5.7 Mouvements de glissement | toute action par glisser a une alternative à un seul pointeur | planning, réordonnancement de liste |
| 3.3.7 Saisie redondante | ne pas redemander une information déjà donnée dans le même parcours | inscription, profil foyer, import de ticket |
| 3.3.8 Authentification accessible | pas de test cognitif pour se connecter | coller le mot de passe et le code 2FA autorisé, `autocomplete` présent, pas de CAPTCHA à transcrire |
| 2.5.8 Taille de cible | 24 × 24 px minimum | déjà couvert : le projet impose 44 × 44 px |
| 3.2.6 Aide cohérente | l'aide reste au même endroit | page Confidentialité et contact, quand ils existent |

## 6. Format de citation

Un constat cite le critère sous la forme **RGAA 11.10** suivie de son intitulé court, et pour la section 5, **WCAG 2.2, 2.4.11 (anticipation RGAA 5)**. Le fichier et la ligne viennent en premier, le critère explique pourquoi.
