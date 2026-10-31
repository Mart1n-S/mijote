# Design system

Les jetons, les composants de base et les règles de mise en page de Mijote. La cible est le RGAA 4.1 niveau AA, vérifié à chaque livraison (section 7 du cahier des charges).

Tout est dans `apps/web` :

| Quoi                  | Où                                     |
| --------------------- | -------------------------------------- |
| Jetons                | `src/styles/tokens.css`                |
| Police                | `src/styles/fonts.css`, `src/assets/fonts/` |
| Styles des éléments   | `src/styles/base.css`                  |
| Composants de base    | `src/components/base/`                 |
| Mise en page          | `src/components/layout/AppLayout.vue`  |
| Page de démonstration | `src/pages/DesignSystemPage.vue`       |

La page de démonstration est servie sur `/design-system` en développement. Elle n'est pas construite en production : la condition qui l'écarte est une constante de compilation, donc ni la route ni le code de la page ne partent dans le paquet livré.

Les tests de bout en bout doivent pourtant l'atteindre. Ils servent donc la construction `pnpm --filter @mijote/web build:demo`, identique à celle de production à cette page près (voir `playwright.config.ts`). La CI construit les deux : le mode demo pour les tests, la production pour vérifier que la page en est bien absente.

## Principes

1. **Les jetons d'abord.** Aucune couleur, taille, espacement, rayon ni ombre en dur dans un composant. Une valeur qui manque devient un jeton. **Une seule exception, hors de `src` :** le manifeste PWA recopie `theme_color` et `background_color` à la main dans `vite.config.ts`, parce qu'un manifeste ne lit pas une propriété CSS personnalisée. Toute refonte du coloris doit y repasser.
2. **Le HTML avant ARIA.** Un bouton est un `button`, un lien est un `a href`. ARIA seulement là où le natif ne suffit pas.
3. **Reka UI pour les comportements difficiles.** Dialogue, liste déroulante, combobox, menu : le clavier et ARIA viennent de la bibliothèque (ADR 0001), le style reste maison.
4. **Jamais la couleur seule.** Un état se lit aussi par un mot, une forme ou une épaisseur.
5. **L'audace à un seul endroit.** Par écran, un seul élément est fort : le reste est discipliné.

## Direction visuelle

Coloris **Cassis**, un indigo profond, retenu le 30 octobre 2026 après comparaison de cinq coloris sur une page temporaire.

Ce qui a décidé n'est pas le goût seul : c'est **la distance de l'accent aux couleurs d'état**, mesurée en dE2000. Un accent qui ressemble à un avertissement ou à une erreur rend l'interface ambiguë, surtout en petit.

| Écart de l'accent | Clair | Sombre |
| ----------------- | ----- | ------ |
| Erreur            | 38,3  | 32,4   |
| Avertissement     | 49,8  | 47,3   |
| Succès            | 43,2  | 41,3   |

Au-dessous de 20, deux couleurs restent parentes à l'oeil. L'indigo est à plus de 32 de chacune, dans les deux thèmes.

Deux familles ont été écartées sur la même mesure, et ne se reproposent pas sans refaire le calcul :

- **les verts** (olive et sauge), à 11 à 17 du vert de succès. Le succès occupe déjà cette partie du spectre, et l'en éloigner le ferait virer au bleu-vert ;
- **le bordeaux**, tenable en clair mais à 11 du rouge d'erreur en sombre.

Les neutres sont teintés vers l'indigo, pas gris : un fond parfaitement neutre sous un accent coloré donne une impression de gabarit.

## Jetons

### Couleurs

Le mode sombre redéfinit **les mêmes noms** sous `prefers-color-scheme: dark`. Un composant n'a donc jamais à savoir dans quel thème il est rendu, et il n'existe aucun jeton propre à un seul thème.

| Jeton                    | Rôle                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `--color-background`     | Fond de la page                                                      |
| `--color-surface`        | Fond d'un bloc posé sur la page                                      |
| `--color-surface-hover`  | La même surface au survol                                            |
| `--color-surface-active` | La même surface enfoncée                                             |
| `--color-raised`         | Surface au-dessus de la page : dialogue, barre de navigation          |
| `--color-border`         | Séparateur décoratif. Aucun seuil : il ne porte pas d'information     |
| `--color-border-strong`  | Contour d'un contrôle : champ, bouton secondaire. Tient 3:1           |
| `--color-border-hover`   | Le même contour, renforcé au survol. Plus foncé en clair, plus clair en sombre |
| `--color-text`           | Texte courant                                                        |
| `--color-text-muted`     | Texte secondaire : aide d'un champ, pied de page                     |
| `--color-accent`         | La seule couleur d'accent : lien, bouton principal, page courante     |
| `--color-accent-hover`   | L'accent au survol                                                   |
| `--color-accent-active`  | L'accent enfoncé                                                     |
| `--color-on-accent`      | Texte posé sur l'accent                                              |
| `--color-success`        | Repère de succès : liseré, icône                                     |
| `--color-warning`        | Repère d'avertissement                                               |
| `--color-danger`         | Repère d'erreur, contour d'un champ invalide, fond du bouton de danger |
| `--color-danger-hover`   | Le danger au survol                                                  |
| `--color-danger-active`  | Le danger enfoncé                                                    |
| `--color-on-danger`      | Texte posé sur le danger                                             |
| `--color-focus`          | Anneau de focus                                                      |
| `--color-overlay`        | Voile derrière un dialogue. Identique dans les deux thèmes            |

### Élévation

Trois niveaux, et pas un de plus. **Une ombre ne sert qu'à dire qu'une surface est au-dessus d'une autre**, jamais à décorer : un élément à plat n'en porte pas.

| Jeton        | Pour quoi                                                  | Qui l'utilise             |
| ------------ | ---------------------------------------------------------- | ------------------------- |
| `--shadow-1` | Une carte posée sur la page                                | réservé aux écrans métier |
| `--shadow-2` | Ce qui reste au-dessus du contenu qui défile               | la barre de navigation basse |
| `--shadow-3` | Ce qui sort du plan de la page                             | le dialogue               |

**En mode sombre, l'élévation passe surtout par la surface.** `--color-raised` y est plus claire que le fond, et l'ombre se contente d'asseoir le bord : une ombre noire sur un fond sombre ne se voit pas. En clair, c'est l'inverse, la surface surélevée est plus claire que le fond et c'est l'ombre qui porte l'information.

En clair, la teinte des ombres reprend `--color-text` plutôt que du noir pur : une ombre grise sur un fond teinté se voit comme une salissure. En sombre, les ombres sont du noir pur, parce qu'une ombre teintée ne se voit pas sur un fond sombre et que c'est la surface, pas elle, qui porte l'information.

### Typographie

**Atkinson Hyperlegible Next**, hébergée dans le dépôt (`src/assets/fonts/`), figée au commit `7925f50f649b3813257faf2f4c0b381011f434f1` de `googlefonts/atkinson-hyperlegible-next`, licence OFL-1.1 reprise à côté du fichier. Empreinte SHA-256 du `.woff2` : `abde1ad5cf78b9ac575ef90d991f2e9101eb0b3b6668bde9a00e2e1e27d99afd`. **Aucune requête vers Google Fonts ni vers un autre service tiers**, ce que `e2e/third-party.spec.ts` vérifie sur chaque page : il échoue sur toute requête sortant de l'origine de l'application.

Elle a été choisie pour une raison, pas pour son allure : dessinée par la Braille Institute pour la basse vision, elle différencie les formes que les sans-serif confondent, `I l 1`, `O 0`, `a e`. C'est un choix motivé par la cible RGAA du projet.

Un seul fichier variable, 48 ko pour toute la plage 200 à 800, contre environ 26 ko par graisse fixe. L'italique n'est pas repris : le design system n'en utilise pas.

Les noms de graisse disent le rôle, pas la graisse de la police :

| Jeton                | Valeur | Pour quoi                           |
| -------------------- | ------ | ----------------------------------- |
| `--weight-normal`    | 400    | texte courant                       |
| `--weight-semibold`  | 600    | libellé de bouton, label de champ   |
| `--weight-bold`      | 700    | titres de niveau 2 et 3             |
| `--weight-display`   | 800    | titre de page, page courante, chiffre mis en avant |

Tailles : `--text-sm` à `--text-2xl`, plus `--text-display` pour **le seul chiffre mis en avant par écran**, qui est l'endroit où cette direction dépense son audace. Un prix, un total, un reste à dépenser : un par écran, pas deux.

`--font-mono` est une pile système, posée par `base.css` sur `code`, `samp` et `kbd` : aucune police de plus à charger.

Les titres sont resserrés par `--tracking-tight` : aux grandes tailles, l'approche d'une police pensée pour le texte courant paraît lâche.

### Espacements, rayons et divers

- Espacements : `--space-1` à `--space-8`, échelle de 4 px exprimée en `rem`.
- Rayons : `--radius-sm` 3 px, `--radius-md` 6 px, `--radius-lg` 10 px, `--radius-full`. Des arrondis modestes : le même rayon partout, quel que soit le rôle, est un tic de gabarit.
- `--tap-min` : 44 px, le minimum RGAA pour une zone tactile. En `rem`, donc la cible grandit avec le texte au zoom.
- `--duration-fast` : durée des transitions d'état.
- `--breakpoint-nav` : 40rem, largeur à laquelle la navigation change de place. Une requête de media ne peut pas lire une propriété personnalisée : la valeur est donc répétée dans le `@media` d'`AppLayout.vue`, seul endroit qui s'en sert, et ce jeton en est la référence écrite.

## États

Chaque contrôle doit dire dans quel état il est, **et jamais par la seule couleur**. La page de démonstration les montre tous côte à côte, avec une case qui fige le survol, l'enfoncement et le focus.

| Composant                | Repos                     | Survol            | Focus visible            | Actif, enfoncé                       | Désactivé                              | En cours                                   | Invalide                                  |
| ------------------------ | ------------------------- | ----------------- | ------------------------ | ------------------------------------ | -------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| **Bouton principal**     | `accent`                  | `accent-hover`    | anneau global, 2 px      | `accent-active`, descend de 1 px     | `disabled`, atténué, curseur interdit  | `aria-disabled`, `aria-busy`, témoin, texte | sans objet                                |
| **Bouton secondaire**    | `surface` et contour      | `surface-hover`   | anneau global            | `surface-active`, descend de 1 px    | idem                                   | idem                                       | sans objet                                |
| **Bouton de danger**     | `danger`                  | `danger-hover`    | anneau global            | `danger-active`, descend de 1 px     | idem                                   | idem                                       | sans objet                                |
| **Champ de saisie**      | fond de page et contour   | contour renforcé  | anneau global            | fond `surface-hover`                 | fond `surface`, texte atténué, interdit | sans objet, c'est le bouton qui le porte   | contour 2 px `danger`, marque et préfixe  |
| **Lien de navigation**   | texte courant             | `surface-hover`   | anneau global            | `surface-active`                     | sans objet                             | sans objet                                 | sans objet                                |
| **Déclencheur du dialogue** | c'est un `BaseButton`  | idem              | idem                     | idem                                 | idem                                   | idem                                       | sans objet                                |

Ce qui porte l'état **en plus de la couleur** :

- **enfoncé** : le bouton descend d'un pixel. Ce déplacement est supprimé sous `prefers-reduced-motion: reduce`, où la couleur suffit ;
- **focus** : un anneau détaché de 2 px, visible même sur un bouton rempli de la couleur d'accent ;
- **désactivé** : l'attribut `disabled`, donc la sortie de l'ordre de tabulation, et le curseur interdit ;
- **en cours** : un témoin qui tourne, et le mot « en cours » ajouté pour le lecteur d'écran ;
- **invalide** : un contour deux fois plus épais, une marque et le préfixe « Erreur : » ;
- **page courante** : un trait épais sur le bord de la barre et une graisse plus forte, la couleur ne venant qu'en troisième.

## Contrastes mesurés

`src/styles/tokens.spec.ts` lit `tokens.css`, mesure chaque couple dans les deux thèmes et échoue si un **seuil** tombe. Changer une couleur sans refaire le tour des seuils n'est donc pas possible.

Ce test ne compare en revanche pas les ratios aux tableaux ci-dessous, qui sont saisis à la main : une couleur modifiée qui reste au-dessus de son seuil laisse ces valeurs dériver sans rien faire échouer. Elles sont à reporter avec la couleur.

Seuils : 4,5:1 pour le texte, 3:1 pour les éléments d'interface et le focus.

Le couple le plus serré de toute la palette est le contour d'un contrôle sur la surface enfoncée, à **3,23:1** pour un seuil de 3:1, en thème clair.

#### Thème clair

| Ce qui est posé                                 | Seuil | fond     | surface  | survolée | enfoncée | surélevée |
| ----------------------------------------------- | ----- | -------- | -------- | -------- | -------- | --------- |
| Texte courant (`--color-text`)                  | 4,5:1 | 16,28:1  | 14,58:1  | 13,33:1  | 12,05:1  | 16,81:1   |
| Texte secondaire (`--color-text-muted`)         | 4,5:1 | 7,95:1   | 7,12:1   | 6,51:1   | 5,88:1   | 8,21:1    |
| Lien, accent (`--color-accent`)                 | 4,5:1 | 9,82:1   | 8,80:1   | 8,05:1   | 7,27:1   | 10,15:1   |
| Contour d'un contrôle (`--color-border-strong`) | 3:1   | 4,36:1   | 3,91:1   | 3,57:1   | 3,23:1   | 4,51:1    |
| Contour renforcé au survol (`--color-border-hover`) | 3:1 | 7,95:1 | 7,12:1 | 6,51:1 | 5,88:1 | 8,21:1 |
| Anneau de focus (`--color-focus`)               | 3:1   | 9,82:1   | 8,80:1   | 8,05:1   | 7,27:1   | 10,15:1   |
| Repère de succès (`--color-success`)            | 3:1   | 6,30:1   | 5,64:1   | 5,16:1   | 4,67:1   | 6,51:1    |
| Repère d'avertissement (`--color-warning`)      | 3:1   | 5,74:1   | 5,14:1   | 4,70:1   | 4,25:1   | 5,93:1    |
| Repère d'erreur (`--color-danger`)              | 3:1   | 6,33:1   | 5,67:1   | 5,18:1   | 4,69:1   | 6,54:1    |

| Texte sur une surface pleine         | Seuil | Ratio    |
| ------------------------------------ | ----- | -------- |
| Libellé du bouton principal, repos   | 4,5:1 | 10,15:1  |
| Libellé du bouton principal, survol  | 4,5:1 | 12,86:1  |
| Libellé du bouton principal, enfoncé | 4,5:1 | 15,23:1  |
| Libellé du bouton de danger, repos   | 4,5:1 | 6,54:1   |
| Libellé du bouton de danger, survol  | 4,5:1 | 8,88:1   |
| Libellé du bouton de danger, enfoncé | 4,5:1 | 11,30:1  |

#### Thème sombre

| Ce qui est posé                                 | Seuil | fond     | surface  | survolée | enfoncée | surélevée |
| ----------------------------------------------- | ----- | -------- | -------- | -------- | -------- | --------- |
| Texte courant (`--color-text`)                  | 4,5:1 | 15,42:1  | 14,18:1  | 12,71:1  | 11,49:1  | 13,16:1   |
| Texte secondaire (`--color-text-muted`)         | 4,5:1 | 8,01:1   | 7,36:1   | 6,60:1   | 5,96:1   | 6,83:1    |
| Lien, accent (`--color-accent`)                 | 4,5:1 | 7,93:1   | 7,29:1   | 6,53:1   | 5,90:1   | 6,76:1    |
| Contour d'un contrôle (`--color-border-strong`) | 3:1   | 4,34:1   | 3,99:1   | 3,58:1   | 3,24:1   | 3,71:1    |
| Contour renforcé au survol (`--color-border-hover`) | 3:1 | 7,53:1 | 6,93:1 | 6,21:1 | 5,61:1 | 6,43:1 |
| Anneau de focus (`--color-focus`)               | 3:1   | 7,93:1   | 7,29:1   | 6,53:1   | 5,90:1   | 6,76:1    |
| Repère de succès (`--color-success`)            | 3:1   | 9,30:1   | 8,55:1   | 7,66:1   | 6,92:1   | 7,93:1    |
| Repère d'avertissement (`--color-warning`)      | 3:1   | 9,15:1   | 8,42:1   | 7,54:1   | 6,82:1   | 7,81:1    |
| Repère d'erreur (`--color-danger`)              | 3:1   | 8,49:1   | 7,81:1   | 7,00:1   | 6,32:1   | 7,25:1    |

| Texte sur une surface pleine         | Seuil | Ratio    |
| ------------------------------------ | ----- | -------- |
| Libellé du bouton principal, repos   | 4,5:1 | 7,87:1   |
| Libellé du bouton principal, survol  | 4,5:1 | 10,03:1  |
| Libellé du bouton principal, enfoncé | 4,5:1 | 12,11:1  |
| Libellé du bouton de danger, repos   | 4,5:1 | 8,08:1   |
| Libellé du bouton de danger, survol  | 4,5:1 | 9,93:1   |
| Libellé du bouton de danger, enfoncé | 4,5:1 | 11,72:1  |

Un nouvel usage de couleur dans un composant veut dire un couple de plus dans le test, et une ligne de plus ici.

## Composants de base

### BaseButton

Variantes : `primary` (l'action de l'écran), `secondary` (les autres), `danger` (ce qui détruit).

Deux indisponibilités, qui ne se confondent pas :

| État       | Attributs                    | Focus           | Quand                                                                       |
| ---------- | ---------------------------- | --------------- | --------------------------------------------------------------------------- |
| `disabled` | `disabled`                   | hors tabulation | indisponible durablement : un droit manque, une condition n'est pas remplie |
| `loading`  | `aria-disabled`, `aria-busy` | **gardé**       | une action est en cours                                                     |

L'état en cours **n'utilise pas** l'attribut `disabled`. Un bouton désactivé perd le focus et sort de l'arbre de tabulation : l'utilisateur au clavier qui vient de l'activer se retrouverait sans repère, et le lecteur d'écran n'annoncerait plus rien. Avec `aria-disabled`, le bouton garde le focus et reste annoncé. En contrepartie il reçoit encore les clics et la touche Entrée : c'est le composant qui les refuse, dans son gestionnaire.

L'action en cours ajoute aussi un texte réservé au lecteur d'écran (`loadingLabel`, « en cours » par défaut) : `aria-busy` n'est pas restitué par tous.

Un contrôle inactif sort du champ des seuils de contraste (WCAG 1.4.3, « incidental »), ce qui autorise l'atténuation de `:disabled`. L'état en cours garde son contraste plein : il est actif.

### BaseField

Un champ de saisie avec label visible, aide et erreur.

- Le label est relié par `for`/`id`, avec un identifiant unique par instance (`useId`).
- L'aide se place entre le label et le champ, l'erreur après le champ.
- `aria-describedby` liste l'aide puis l'erreur, dans cet ordre : la consigne d'abord, ce qui cloche ensuite. Un identifiant n'est listé que si l'élément existe.
- **Une chaîne vide n'est pas une erreur.** Une validation qui rend « rien à signaler » sous cette forme ne doit pas rendre le champ invalide, sans quoi il s'annonce invalide sans dire pourquoi. L'état passe par un calcul unique, utilisé par l'attribut, la classe et l'affichage.
- Une erreur pose `aria-invalid`, double l'épaisseur du contour et préfixe le message par « Erreur : ». L'état se lit donc sans la couleur.

**Partage des rôles pour l'annonce.** Le champ n'annonce pas son erreur lui-même : il la relie. Ce qui l'annonce à l'envoi du formulaire est le résumé en tête, un `BaseAlert`, dont la région existe déjà. C'est aussi ce que demande `vue-accessibility.md` : erreur sous le champ, et résumé en haut.

### BaseAlert

Un message annoncé au lecteur d'écran. Variantes : `info`, `success` (région `role="status"`, `aria-live="polite"`), `warning`, `error` (région `role="alert"`, `aria-live="assertive"`, qui interrompt la lecture en cours).

**Le point à ne pas perdre de vue : la région doit exister avant le message.** Une région `aria-live` n'annonce que ce qui change après son arrivée dans le DOM. Montée en même temps que son contenu, elle est lue comme du texte déjà présent, donc passée sous silence.

Le composant est donc fait pour cela : la région est rendue inconditionnellement, et seul son contenu dépend de `message`. Ce qui en découle pour l'appelant :

- monter le `BaseAlert` dès l'affichage de l'écran, avec un `message` vide, et non le faire apparaître quand le message arrive ;
- ne pas l'envelopper dans un `v-if`, qui annulerait exactement la garantie ;
- ne pas changer de variante en même temps que le message : le `role` de la région changerait alors sous le lecteur d'écran, au moment même où il doit la lire. Le noeud n'est pas recréé pour autant, Vue se contentant de mettre l'attribut à jour, mais la restitution en souffre.

La région vide est un `div` sans style, donc de hauteur nulle. Dans un conteneur `flex` avec `gap`, elle compte en revanche comme un élément : `display: contents` corrigerait cela, mais plusieurs moteurs l'ont déjà, à un moment, sortie de l'arbre d'accessibilité, ce qui est exclu sur une région `aria-live`.

**L'information n'a pas de couleur à elle : elle emprunte l'accent.** C'est voulu. Un message d'information n'est pas une alarme, et lui donner une teinte propre reviendrait à inventer un quatrième état dans un spectre déjà occupé par le succès, l'avertissement et l'erreur. L'écart entre l'accent et le repère d'information est donc nul par construction, et ce qui distingue les deux est le préfixe textuel, jamais la couleur. Les trois autres états, eux, sont à plus de 32 de l'accent (voir l'ADR 0006).

Chaque message porte un préfixe qui nomme son état (« Information : », « Succès : », « Attention : », « Erreur : ») et un repère visuel `aria-hidden`. La couleur ne porte jamais l'information seule.

### BaseDialog

Un dialogue modal sur Reka UI. Le piège de focus, l'entrée du focus, son retour sur le déclencheur, la fermeture par Échap et le retrait de l'arrière-plan de l'arbre d'accessibilité viennent de la bibliothèque, qui est précisément là pour ça (ADR 0001).

Usage : `title` est obligatoire et devient le nom accessible ; `description` est reliée par `aria-describedby` ; le déclencheur passe par le slot `trigger`, les actions par le slot `actions`.

L'appelant passe un `BaseButton` dans le slot `trigger` et **n'a pas à connaître Reka UI** : c'est `BaseDialog` qui l'enveloppe dans `DialogTrigger`, ce qui est aussi ce qui fait revenir le focus sur ce bouton à la fermeture.

C'est le seul endroit de l'application qui utilise `--shadow-3` et, avec la barre de navigation, l'un des deux qui utilisent `--color-raised`.

Reka UI 2.11 rend le dialogue modal en posant `aria-hidden` sur le reste du document, et non `aria-modal` sur le dialogue. C'est une technique équivalente, mais qui change ce qu'un test doit regarder.

Au zoom, le contenu du dialogue défile dans le dialogue plutôt que de sortir de l'écran.

## Mise en page

`AppLayout` donne à tous les écrans : lien d'évitement, `header`, `nav`, `main`, `footer`.

- **Lien d'évitement** : premier élément focusable du document, hors de l'écran au repos, visible dès qu'il reçoit le focus. Il est déplacé par `transform` et non retiré par `display: none`, qui le sortirait de l'ordre de tabulation.
- **Navigation** : un **seul** élément `nav` dans le DOM, placé par le CSS. Barre fixe en bas sous 640 px, colonne latérale au-delà. Deux `nav`, un par largeur, dupliqueraient le repère de navigation et l'ordre de tabulation.
- **La barre basse est une surface surélevée** : fond `--color-raised` et `--shadow-2`, parce qu'elle reste au-dessus du contenu qui défile. En colonne latérale elle n'est plus au-dessus de rien, donc elle perd son ombre et reprend le fond de surface.
- Ses libellés sont en `--text-sm` et `--weight-semibold` : quatre entrées doivent tenir sur une seule ligne à 320 px, et le gras de la page courante ne doit pas déborder de sa colonne. Chaque entrée fait au moins `--tap-min` de haut, et la barre réserve `env(safe-area-inset-bottom)` pour l'encoche et la barre de gestes des téléphones.
- La barre étant hors du flux, la grille réserve sa hauteur, **liseré compris**, pour que rien ne passe dessous. Vérifié à 320 px, l'équivalent du zoom à 200 %, sans tolérance.
- Les colonnes de la grille sont en `minmax(0, 1fr)` et non `1fr`. Une colonne de grille vaut `min-content` par défaut : un tableau large étirerait alors la page entière au lieu de défiler lui-même.
- Les entrées de navigation se déduisent des routes qui déclarent un `meta.navLabel`, plutôt que d'une seconde liste à tenir en parallèle.
- **À chaque changement de page**, le titre du document suit la page et le focus repart de `main`. Le premier affichage est exclu : y déplacer le focus ferait sauter l'en-tête et le lien d'évitement.

## Règles transverses

Elles sont dans `base.css` et s'appliquent sans que personne ait à y penser :

- **Focus** : un anneau unique, `:focus-visible`, avec un écart de 2 px qui laisse voir le fond entre le contrôle et l'anneau. Il reste donc visible même sur un bouton rempli de la couleur d'accent. `:focus-visible` et non `:focus`, pour ne pas poser l'anneau sur un clic de souris.
- **Zones tactiles** : 44 px au minimum, par `--tap-min`, sur tout ce qui se clique.
- **Animations** : sous `prefers-reduced-motion: reduce`, elles sont supprimées, pas raccourcies. La durée résiduelle de 0,01 ms garde l'événement de fin de transition, dont Reka UI dépend pour savoir quand démonter un contenu. Le déplacement d'un pixel des boutons enfoncés est supprimé lui aussi.
- **Liens** : soulignés, y compris au milieu d'un paragraphe. Un lien ne se reconnaît pas à sa seule couleur.
- **Texte masqué** : `.visually-hidden` retire du visuel sans retirer de l'arbre d'accessibilité, ce que ni `display: none` ni `visibility: hidden` ne permettent. Attention, il est en position absolue : un conteneur défilant qui en contient doit être positionné, sinon ce texte s'échappe et étire la page.

## Limites connues

- La barre basse **ne passe jamais sur deux lignes** : ses libellés sont insécables et c'est elle qui défile horizontalement quand ils ne tiennent plus. Sa hauteur vaut donc toujours une zone tactile plus son liseré, et la réserve de place sous le contenu reste exacte à toute taille de texte. C'était une limite connue, mesurée puis corrigée : au texte agrandi à 200 %, la barre passait sur deux lignes et recouvrait 14 px du pied de page. Le prix de la correction est qu'avec beaucoup d'entrées, la barre défilera de côté sur un écran étroit.
- La région vide d'un `BaseAlert` compte comme un élément dans un conteneur `flex` avec `gap` (voir sa section plus haut).
- Le tableau des états de la page de démonstration recopie quelques règles de survol, d'enfoncement et de focus pour les figer côte à côte. C'est la seule duplication acceptée, et **rien ne la garde** : aucun test ne la compare aux composants, et l'exemplaire vivant de la ligne « Repos » ne montre que le repos. Trois divergences y ont vécu sans être vues jusqu'au 31 octobre 2026, dont une invisible en thème clair, où les deux jetons concernés ont la même valeur. Un écart ne se voit qu'à la lecture, ligne à ligne.

## Vérification

| Ce qui est vérifié                                                            | Par quoi                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Seuils de contraste, dans les deux thèmes                                     | `src/styles/tokens.spec.ts`              |
| Attributs ARIA, refus du clic en cours, focus gardé                           | `src/components/base/*.spec.ts` (jsdom)  |
| Titre du document et focus à la navigation                                    | `src/navigation.spec.ts`                 |
| Accueil et page de démonstration sans violation axe-core, en clair, en sombre, à 320 px et au texte à 200 % | `e2e/accessibility.ts` |
| Lien d'évitement, activation au clavier, va-et-vient du focus du dialogue      | `e2e/design-system.spec.ts`              |
| Place de la navigation selon la largeur, absence de défilement horizontal     | `e2e/design-system.spec.ts`              |
| Absence de la page de démonstration dans le paquet livré                      | `.github/workflows/ci.yml`               |
| Aucune requête vers un service tiers, et la police bien chargée localement    | `e2e/third-party.spec.ts`                |
| Texte agrandi à 200 % : ni défilement de côté, ni contenu masqué (RGAA 10.4)  | `e2e/design-system.spec.ts`              |

Deux choses ne se testent pas en jsdom, et sont donc couvertes par Playwright :

1. **l'activation d'un bouton natif par Entrée ou Espace**, que le navigateur traduit en clic ;
2. **le démontage du dialogue et le retour du focus**, que Reka UI fait à la fin de l'animation de sortie, laquelle ne se joue pas en jsdom.

axe-core ne trouve qu'une partie des problèmes. Le clavier et le lecteur d'écran (NVDA, VoiceOver) se testent à la main à chaque lot.
