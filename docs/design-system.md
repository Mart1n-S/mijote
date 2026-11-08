# Design system

Les jetons, les composants de base et les règles de mise en page de Mijote. L'accessibilité visée est le socle de base, pas une conformité RGAA : HTML natif, clavier, focus visible, labels, contrastes garantis par les jetons, axe-core en CI (section 7 du cahier des charges, ADR 0007). Ce que ce document décrit va souvent au-delà, parce que c'est ici, sur les composants de base, que cela coûte le moins cher.

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

### Empilement

L'ombre dit qu'une surface est au-dessus d'une autre ; l'échelle d'empilement dit laquelle passe devant l'autre. Quatre couches, dans cet ordre.

| Jeton               | Couche                            | Qui l'utilise                   |
| ------------------- | --------------------------------- | ------------------------------- |
| `--layer-nav`       | La barre de navigation basse      | `AppLayout`                     |
| `--layer-skip-link` | Le lien d'évitement               | `AppLayout`                     |
| `--layer-overlay`   | Le voile posé derrière un dialogue | `BaseDialog`                    |
| `--layer-dialog`    | Le dialogue lui-même              | `BaseDialog`                    |

**Tout nouvel élément flottant prend sa place dans cette échelle**, en renumérotant `tokens.css` si besoin, plutôt qu'un `z-index` inventé sur place. Les valeurs se suivent sans trou, exprès : réserver des paliers laisserait croire qu'on peut en glisser un sans toucher à l'échelle.

L'ordre est vérifié par `src/styles/tokens.spec.ts`, parce que c'est son inversion qui fait le défaut, pas sa valeur. Le lien d'évitement est au-dessus de la barre, puisqu'il doit se voir dès qu'il a le focus, et sous le voile : peint par-dessus, il resterait visible alors qu'un dialogue ouvert l'a retiré de l'arbre d'accessibilité.

C'est exactement ce qui est arrivé à la barre basse jusqu'au 31 octobre 2026. Elle portait `z-index: 1` quand le voile et le dialogue n'en portaient aucun, donc `auto` : dans un même contexte d'empilement, un `z-index` positif passe après les éléments positionnés en `auto`. Mesuré à 320 x 640, dialogue ouvert, toute la page était assombrie et la barre restait à pleine luminosité, alors que Reka UI lui avait bien posé `aria-hidden`. Ce que voyait l'oeil et ce qu'annonçait le lecteur d'écran divergeaient.

### Typographie

**Atkinson Hyperlegible Next**, hébergée dans le dépôt (`src/assets/fonts/`), figée au commit `7925f50f649b3813257faf2f4c0b381011f434f1` de `googlefonts/atkinson-hyperlegible-next`, licence OFL-1.1 reprise à côté du fichier. Empreinte SHA-256 du `.woff2` : `abde1ad5cf78b9ac575ef90d991f2e9101eb0b3b6668bde9a00e2e1e27d99afd`. **Aucune requête vers Google Fonts ni vers un autre service tiers**, ce que `e2e/third-party.spec.ts` vérifie sur chaque page : il échoue sur toute requête sortant de l'origine de l'application.

Elle a été choisie pour une raison, pas pour son allure : dessinée par la Braille Institute pour la basse vision, elle différencie les formes que les sans-serif confondent, `I l 1`, `O 0`, `a e`. C'est un choix motivé par la lisibilité, et il tient même sans cible d'accessibilité (ADR 0006, confirmé par l'ADR 0007).

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

**Cette case part décochée.** C'est sur cette page que se font les vérifications au clavier : trois boutons et un champ portant en permanence un anneau identique au vrai ne laissent plus distinguer le focus réel des états simulés. Les tests qui comparent la copie figée aux composants vivants cochent donc la case avant de mesurer, sans quoi ils compareraient l'état de repos à lui-même.

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

**Les attributs passés au composant vont sur le champ**, pas sur son conteneur : `inheritAttrs: false` et `v-bind="$attrs"` sur l'`input`. Sans cela, `name`, `inputmode`, `maxlength` ou `pattern` atterrissaient sur le `div.field` et n'avaient aucun effet. `$attrs` est lié **avant** les attributs calculés, parce que ce qui vient après gagne : `aria-describedby` et `aria-invalid` restent donc sous le contrôle du composant, seul à savoir quels éléments il rend. Un appelant qui passerait les siens ne coupe pas le champ de son aide ni de son erreur. `class` et `style` suivent `$attrs` jusqu'à l'`input` eux aussi, et non plus le conteneur : Vue les fusionne avec ceux du composant au lieu de les remplacer.

Ce qui n'est **pas** protégé est le nom accessible : un `aria-label` passé au composant remplacerait silencieusement le `label` visible, et l'étiquette vue ne serait plus celle restituée (RGAA 11.2). On ne passe donc ni `aria-label` ni `aria-labelledby` à ce composant : son étiquette est son `label`.

**Partage des rôles pour l'annonce.** Le champ n'annonce pas son erreur lui-même : il la relie. Ce qui l'annonce à l'envoi du formulaire est le résumé en tête, un `BaseAlert`, dont la région existe déjà. C'est aussi ce que demande `vue-accessibility.md` : erreur sous le champ, et résumé en haut.

### BaseCheckbox, BaseRadioGroup, BaseSelect, BaseFieldset

Les champs de choix, tous bâtis sur l'élément natif correspondant : `input type="checkbox"`, `input type="radio"`, `select`, `fieldset`. Le principe 2 vaut ici en entier, et Reka UI n'a aucun comportement à reprendre qui ne soit déjà celui du navigateur.

**Ce que la case à cocher et le bouton radio remplacent, et ce qu'ils gardent.** Le rendu du navigateur ignore les jetons du projet : il est donc remplacé, et pas seulement teinté. L'`input` porte `appearance: none`, devient une surface transparente de 44 px de côté, et c'est un `span` voisin qui dessine la boîte à la taille du texte (en `em`, donc elle suit l'agrandissement). Ce partage est ce qui permet d'avoir **une cible tactile de 44 px portée par le contrôle lui-même**, et non par son étiquette, sans grossir la marque pour autant.

**L'état coché se lit sans la couleur.** Une coche pour la case, un point plein pour le radio, dessinés en CSS par un pseudo-élément : le fond d'accent ne dit rien sur un écran monochrome ni avec un daltonisme, la forme si (principe 4). La forme de la boîte distingue aussi les deux familles avant toute couleur, carré contre cercle.

**Le groupe de boutons radio rend son `fieldset` et sa `legend` sans qu'on le demande**, en s'appuyant sur `BaseFieldset`. Il engendre aussi le `name` commun à ses boutons : sans lui, le navigateur ne les relie pas, les flèches ne circulent pas entre eux et plusieurs peuvent être cochés à la fois.

**L'aide et l'erreur d'un groupe sont reliées au groupe**, et non répétées sur chacune de ses options. L'intention est qu'un lecteur d'écran les dise une fois, à l'entrée dans le groupe ; aucun test ne le mesure, l'audit au lecteur d'écran n'étant plus pratiqué (ADR 0007). C'est la seule différence avec `BaseField`, et elle est volontaire. Les options d'un groupe en erreur ne passent pas au rouge pour autant : le message et son repère portent l'état, et teinter dix options ferait du bruit sans rien dire de plus.

**La liste déroulante garde son rendu natif**, habillé par les jetons. Sa flèche et son panneau d'options restent ceux du système (voir les limites connues). Elle propose une **option vide, sélectionnée et non choisissable** : sans elle, la première option serait sélectionnée d'office et l'utilisateur pourrait valider un choix qu'il n'a pas fait.

**Deux détails qui pourraient passer pour des oublis.** L'étiquette d'une case ou d'un bouton radio reste en graisse normale, là où celle d'un champ de saisie et une `legend` sont en `--weight-semibold` : ici l'étiquette est le choix lui-même, pas l'intitulé d'un champ. Et la géométrie du tracé d'une marque (la taille de la boîte en `em`, les proportions de la coche, son angle) est en valeurs littérales : aucune échelle de jetons ne couvre le dessin d'une forme, alors que ses couleurs, ses espacements et son rayon en viennent tous.

**Quatre briques internes, partagées, qui ne sont pas des composants publics** : `useFieldAria` pour les identifiants et l'`aria-describedby`, `FieldHelp` et `FieldError` pour la consigne et le message, `ChoiceControl` pour la boîte dessinée. Elles existent parce que la même chose servait à quatre endroits, jamais pour un seul usage. `BaseField` est passé sur les trois premières au même moment : c'est ce qui garantit que les cinq champs relient leur aide et signalent leur erreur de la même façon.

### BaseAlert

Un message annoncé au lecteur d'écran. Variantes : `info`, `success` (région `role="status"`, `aria-live="polite"`), `warning`, `error` (région `role="alert"`, `aria-live="assertive"`, qui interrompt la lecture en cours).

**Le point à ne pas perdre de vue : la région doit exister avant le message.** Une région `aria-live` n'annonce que ce qui change après son arrivée dans le DOM. Montée en même temps que son contenu, elle est lue comme du texte déjà présent, donc passée sous silence.

Le composant est donc fait pour cela : la région est rendue inconditionnellement, et seul son contenu dépend de `message`. Ce qui en découle pour l'appelant :

- monter le `BaseAlert` dès l'affichage de l'écran, avec un `message` vide, et non le faire apparaître quand le message arrive ;
- ne pas l'envelopper dans un `v-if`, qui annulerait exactement la garantie ;
- ne pas changer de variante en même temps que le message : le `role` de la région changerait alors sous le lecteur d'écran, au moment même où il doit la lire. Le noeud n'est pas recréé pour autant, Vue se contentant de mettre l'attribut à jour, mais la restitution en souffre.

**Réannoncer un message identique.** Le composant expose une méthode, `reannounce()` : elle vide la région puis y repose le texte, ce qui fait les deux changements de contenu qu'une région `aria-live` demande. Reposer la même chaîne dans `message` ne change pas le DOM et n'annonce donc rien : deux tentatives de connexion rejetées par le même « Identifiants incorrects » laisseraient croire que le second envoi n'a rien produit. L'appelant garde donc son message tel quel et appelle la méthode ; il n'a pas à le numéroter pour forcer un changement.

```vue
<BaseAlert ref="announcer" variant="error" :message="error" />
```

```ts
const announcer = useTemplateRef<InstanceType<typeof BaseAlert>>('announcer');

announcer.value?.reannounce();
```

Un message **différent** n'a pas besoin de cette méthode : il change déjà le DOM. Une réannonce en cours devient alors sans effet, et non annulée : son minuteur repose le message courant, c'est-à-dire la valeur déjà affichée.

Les deux changements sont séparés par 50 ms, et non par un simple `nextTick` : les deux mutations tomberaient dans la même image et plusieurs lecteurs d'écran n'en verraient qu'une. Un second appel pendant ce délai annule le premier cycle et repart de zéro ; le minuteur est nettoyé au démontage.

**Le temps du cycle, la boîte disparaît**, et pas seulement son texte : ce qui est en dessous remonte puis redescend 50 ms plus tard. C'est choisi. Ne vider que le texte en gardant la boîte ferait pire au lecteur d'écran, la région annonçant alors « Erreur : » seul, puis le message, soit deux annonces au lieu d'une. Si ce battement gêne un jour, l'issue est de séparer les deux rôles : une boîte visible alimentée par `message`, et une région `aria-live` masquée par `.visually-hidden` qui porte seule le cycle, au prix du texte présent deux fois dans le DOM.

**Ce que les tests ne disent pas.** `BaseAlert.spec.ts` vérifie que la région passe bien par un état vide puis retrouve son texte, et que c'est le même noeud. Il ne vérifie pas ce qu'un lecteur d'écran annonce : seule l'écoute réelle le dit. **Écouté le 1er novembre 2026, au Narrateur de Windows puis à NVDA : deux clics sur le même message donnent bien deux annonces**, avec le délai de 50 ms. VoiceOver n'est pas écouté : l'audit manuel est arrêté (ADR 0007).

La région vide est un `div` sans style, donc de hauteur nulle. Dans un conteneur `flex` avec `gap`, elle compte en revanche comme un élément : `display: contents` corrigerait cela, mais plusieurs moteurs l'ont déjà, à un moment, sortie de l'arbre d'accessibilité, ce qui est exclu sur une région `aria-live`.

**L'information n'a pas de couleur à elle : elle emprunte l'accent.** C'est voulu. Un message d'information n'est pas une alarme, et lui donner une teinte propre reviendrait à inventer un quatrième état dans un spectre déjà occupé par le succès, l'avertissement et l'erreur. L'écart entre l'accent et le repère d'information est donc nul par construction, et ce qui distingue les deux est le préfixe textuel, jamais la couleur. Les trois autres états, eux, sont à plus de 32 de l'accent (voir l'ADR 0006).

Chaque message porte un préfixe qui nomme son état (« Information : », « Succès : », « Attention : », « Erreur : ») et un repère visuel `aria-hidden`. La couleur ne porte jamais l'information seule.

### BaseDialog

Un dialogue modal sur Reka UI. Le piège de focus, l'entrée du focus, son retour sur le déclencheur, la fermeture par Échap et le retrait de l'arrière-plan de l'arbre d'accessibilité viennent de la bibliothèque, qui est précisément là pour ça (ADR 0001).

Usage : `title` est obligatoire et devient le nom accessible ; `description` est reliée par `aria-describedby` ; le déclencheur passe par le slot `trigger`, les actions par le slot `actions`.

L'appelant passe un `BaseButton` dans le slot `trigger` et **n'a pas à connaître Reka UI** : c'est `BaseDialog` qui l'enveloppe dans `DialogTrigger`, ce qui est aussi ce qui fait revenir le focus sur ce bouton à la fermeture.

C'est le seul endroit de l'application qui utilise `--shadow-3` et, avec la barre de navigation, l'un des deux qui utilisent `--color-raised`.

Reka UI 2.11 rend le dialogue modal en posant `aria-hidden` sur le reste du document, et non `aria-modal` sur le dialogue. C'est une technique équivalente, mais qui change ce qu'un test doit regarder.

Au zoom, le contenu du dialogue défile dans le dialogue plutôt que de sortir de l'écran, **mais verticalement seulement** : horizontalement, il n'y a nulle part où aller. Son titre se coupe donc, par la règle de césure des titres de `base.css`, mesurée ici d'abord. Mesuré le 1er novembre 2026 avant correction : au texte doublé à 320 px, « Supprimer » en `--text-xl` ne tient pas dans les 208 px de la boîte, le contenu dépassait de 15 px et le mot se faisait couper. Le débordement du document restait nul, donc la matrice ne pouvait pas le voir.

Sa hauteur maximale est en `dvh`, **jamais en `vh`** : c'est l'arbitrage déjà tranché pour la hauteur de `AppLayout`, où `vh` comptait la barre d'adresse du mobile et laissait le bas sous le bord de l'écran.

**Sa largeur ne dépend d'aucune unité de fenêtre**, et c'est volontaire : `min(32rem, calc(100% - 2 * var(--space-4)))`. Pour un élément en `position: fixed`, le bloc conteneur est le bloc conteneur initial, dont la largeur exclut la barre de défilement. Une unité de fenêtre la compte toujours, et aucune variante n'y change rien : les variantes dynamiques (`dvw`, `svw`, `lvw`) ne concernent que la hauteur, la seule qui varie avec l'interface du navigateur. « Harmoniser » cette ligne en unité de fenêtre, par symétrie avec la hauteur juste en dessous, remettrait donc le dialogue sous la barre de défilement.

#### Appui hors du dialogue

Mesuré le 31 octobre 2026 : **le dialogue se ferme à l'appui, pas au relâchement.** Un appui commencé hors du contenu ferme le dialogue sans attendre de voir où le doigt ou la souris se relève.

Le critère en jeu est **RGAA 13.11** : une action déclenchée au pointeur sur un point unique doit pouvoir être annulée. Ce n'est donc pas une préférence, et le cas de la saisie serait une non-conformité de niveau A.

La décision, pour ne pas la reprendre à chaque dialogue :

- **Dialogue de confirmation** : la fermeture à l'appui est acceptée, et conforme, parce que l'action est réversible : on réouvre le dialogue sans avoir rien perdu. Fermer équivaut à annuler, et annuler est l'issue sans conséquence. C'est le seul cas qui existe aujourd'hui.
- **Dialogue qui contient une saisie** : à protéger. Un appui malheureux ne doit pas faire perdre ce qui est saisi. Au choix du moment venu, et à trancher alors : fermer au relâchement seulement si l'appui a commencé hors du contenu, ou demander confirmation quand le formulaire est modifié.

La mise en oeuvre attend le premier formulaire en dialogue, parce qu'il n'en existe aucun : l'écrire d'avance serait du code spéculatif. Ce qui est écrit ici, c'est la règle, pour qu'elle ne se décide pas dans la précipitation d'une story de formulaire.

## Mise en page

`AppLayout` donne à tous les écrans : lien d'évitement, `header`, `nav`, `main`, `footer`, et le bandeau d'état du service.

- **Le bandeau d'état du service** est le premier élément de `main`, avant le contenu de la page. C'est un `BaseAlert` en variante `error`, dont le message reste vide tant que l'API répond : rien ne s'affiche alors, et la région `aria-live` est quand même montée, sans quoi l'arrivée du message ne serait pas annoncée. Il vit dans `main` et non dans une rangée de la grille, parce que la hauteur de la barre basse et la réserve qui lui répond sont mesurées : une rangée de plus les ferait recalculer pour un bandeau presque toujours absent. La vérification de l'API se fait une fois, au montage de la mise en page, donc changer de page ne la relance pas.
- **Lien d'évitement** : premier élément focusable du document, hors de l'écran au repos, visible dès qu'il reçoit le focus. Il est déplacé par `transform` et non retiré par `display: none`, qui le sortirait de l'ordre de tabulation.
- **Le nom du site, dans l'en-tête, est un lien vers l'accueil.** Un retour à l'accueil par le nom du site est une attente courante, et c'était un `p` que rien n'activait. Il garde l'aspect qu'il avait en texte, sans couleur d'accent ni soulignement au repos : RGAA 10.6 demande qu'un lien se distingue du texte environnant, et celui-ci est seul dans l'en-tête, donc il n'y a aucun texte dont le confondre. Le soulignement vient au survol et au focus. Comme tout ce qui se clique, il fait au moins `--tap-min` de haut, ce qu'une ligne de `--text-lg` n'atteint pas. **Cette justification a été réexaminée le 3 novembre 2026**, quand la story #10 a mis dans l'en-tête l'adresse du compte connecté et un bouton de déconnexion. Le lien reste sans soulignement au repos : il s'en distingue par la taille et la graisse (`--text-lg` et `--weight-display`, contre `--text-sm` en `--color-text-muted` pour l'adresse), donc pas par la seule couleur, et il n'est pas au milieu d'une phrase. Aucune vérification de RGAA 10.6 n'est visée, le projet ne cherchant plus la conformité (ADR 0007). Le repli reste écrit ici : si l'en-tête grossit encore, c'est le soulignement au repos qu'il faudra rétablir. **Écouté le 1er novembre 2026, au Narrateur de Windows puis à NVDA, depuis la page de repli : le lien « Mijote » se comprend sans complément** (RGAA 6.1).
- **Sur l'accueil, deux liens portent `aria-current="page"`** : le nom du site et l'entrée de navigation. C'est exact, les deux mènent bien à la page courante, et rien ne l'interdit. La règle de style visuel de l'état courant ne vise que les liens de la barre, donc l'en-tête ne change pas d'aspect. Ce n'est pas contourné. Le retirer du nom du site serait toutefois défendable, `aria-current` désignant l'élément courant au sein d'un ensemble d'éléments liés, auquel l'en-tête n'appartient pas : c'est la restitution réelle qui a tranché. **Écouté le 1er novembre 2026, au Narrateur de Windows puis à NVDA : le double « page actuelle » est annoncé comme prévu et ne gêne pas.** Les deux `aria-current` restent donc en place.
- **L'en-tête porte le compte connecté et sa sortie**, et seulement une fois connecté : l'adresse en `--text-sm` et `--color-text-muted`, puis un `BaseButton` secondaire « Se déconnecter ». L'adresse est montrée à la personne qui vient de la saisir, et à elle seule : un foyer partage plusieurs comptes, et savoir lequel est ouvert évite de ranger ses courses dans celui de l'autre. Elle porte `overflow-wrap: anywhere`, une adresse longue devant se couper plutôt qu'élargir la page, et l'en-tête passe à la ligne avant de comprimer le bouton.
- **La barre de navigation disparaît sans session** : il n'y a nulle part où aller, et proposer des pages que la garde refuserait serait pire que de ne rien proposer. La page de connexion n'a donc pas de `nav`, et c'est ce que vérifie `e2e/login.spec.ts`.
- **Navigation** : un **seul** élément `nav` dans le DOM, placé par le CSS. Barre fixe en bas sous 640 px, colonne latérale au-delà. Deux `nav`, un par largeur, dupliqueraient le repère de navigation et l'ordre de tabulation.
- **La barre basse est une surface surélevée** : fond `--color-raised` et `--shadow-2`, parce qu'elle reste au-dessus du contenu qui défile. En colonne latérale elle n'est plus au-dessus de rien, donc elle perd son ombre et reprend le fond de surface.
- Ses libellés sont en `--text-sm` et `--weight-semibold` : quatre entrées doivent tenir sur une seule ligne à 320 px, et le gras de la page courante ne doit pas déborder de sa colonne. Chaque entrée fait au moins `--tap-min` de haut, et la barre réserve `env(safe-area-inset-bottom)` pour l'encoche et la barre de gestes des téléphones.
- **La barre laisse 4 px autour de ses entrées**, parce que son `overflow-x: auto` en fait un conteneur de défilement sur les deux axes : elle rogne donc ce qui dépasse d'elle, et l'anneau de focus est posé 4 px au-delà de la boîte du lien. Mesuré le 31 octobre 2026 à 375 x 667, avant correction : 1 px au-dessus de la première entrée, 0 en dessous, 0 à gauche, et seul le bord droit de l'anneau se voyait. Cette marge compte dans la hauteur de la barre.
- La hauteur de la barre vient du jeton `--nav-bar-height` : zone tactile, marge de l'anneau des deux côtés, liseré du haut. Elle vit là une seule fois parce que trois endroits en dépendent, la réserve de place de la grille, le `scroll-padding-bottom` de `html` et la barre elle-même.
- La barre étant hors du flux, la grille réserve sa hauteur, **liseré compris**, pour que rien ne passe dessous. Vérifié à 320 px, l'équivalent du zoom à 200 %, sans tolérance.
- **`html` porte un `scroll-padding-bottom` de la hauteur de la barre**, remis à zéro au-delà de 640 px. La réserve de place de la grille empêche la barre de recouvrir la fin de la page ; elle n'empêche pas de recouvrir un contrôle vers lequel le navigateur vient de défiler en cours de page, qu'une tabulation amènerait au bord bas. C'est le `scroll-padding` qui arrête le défilement une hauteur de barre plus haut (WCAG 2.2, 2.4.11, hors RGAA 4.1.2).
- Les colonnes de la grille sont en `minmax(0, 1fr)` et non `1fr`. Une colonne de grille vaut `min-content` par défaut : un tableau large étirerait alors la page entière au lieu de défiler lui-même.
- Les entrées de navigation se déduisent des routes qui déclarent un `meta.navLabel`, plutôt que d'une seconde liste à tenir en parallèle.
- **Une route attrape-tout sert la page de repli**, en production comme en développement. Une adresse inconnue (lien partagé périmé, adresse tapée à la main, historique d'une version précédente) est servie par la bascule SPA : sans cette route, `RouterView` ne rend rien et l'utilisateur obtient un `main` vide, sans titre, sans explication et sans moyen de repartir, sous un titre de document replié sur « Mijote ». La page porte un `h1`, une phrase et un lien vers l'accueil, et son `meta.title` dit « Page introuvable ». Elle n'a pas de `navLabel` : ce n'est pas une destination.
- **Une page porte un seul nom**, le même dans son `h1`, dans `meta.title` et dans l'entrée de navigation. L'accueil en avait trois : `h1` « Mijote », titre « Accueil - Mijote », navigation « Accueil ». Le nom retenu est **« Accueil »** : c'est le nom de la page, et c'est ce que `documentTitleFor` combine avec le nom du site. Garder « Mijote » en `h1` aurait demandé un cas particulier dans cette fonction, pour ne pas produire « Mijote - Mijote ». Le nom de marque ne disparaît pas de la page : il est dans l'en-tête, qui est un lien vers l'accueil.
- **À chaque changement de page**, le titre du document suit la page et le focus repart de `main`. Le premier affichage est exclu : y déplacer le focus ferait sauter l'en-tête et le lien d'évitement.

## Règles transverses

Elles sont dans `base.css` et s'appliquent sans que personne ait à y penser :

- **Focus** : un anneau unique, `:focus-visible`, avec un écart qui laisse voir le fond entre le contrôle et l'anneau. Il reste donc visible même sur un bouton rempli de la couleur d'accent. `:focus-visible` et non `:focus`, pour ne pas poser l'anneau sur un clic de souris. Son épaisseur et son écart vivent dans deux jetons, `--focus-ring-width` et `--focus-ring-offset`, parce qu'un second endroit le dessine : voir l'exception ci-dessous.
- **L'anneau de focus a une exception, une seule : la case à cocher et le bouton radio.** Chez eux, l'anneau est posé sur la boîte dessinée et non sur le contrôle, dont la zone cliquable fait 44 px. Autour de cette zone, il serait plus de deux fois plus large que la marque qu'il désigne, et il empiéterait sur les options voisines d'un groupe. La condition à laquelle cette exception a été acceptée, le 2 novembre 2026 : **elle réemploie exactement les jetons de `base.css`**, sans aucune valeur écrite en dur, donc les deux anneaux ne peuvent pas diverger. C'est ce que mesure `e2e/design-system.spec.ts`, en comparant l'anneau dessiné aux jetons lus sur la racine du document, et non à des pixels écrits dans le test.
- **Zones tactiles** : 44 px au minimum, par `--tap-min`, sur tout ce qui se clique.
- **Animations** : sous `prefers-reduced-motion: reduce`, elles sont supprimées, pas raccourcies. La durée résiduelle de 0,01 ms garde l'événement de fin de transition, dont Reka UI dépend pour savoir quand démonter un contenu. Le déplacement d'un pixel des boutons enfoncés est supprimé lui aussi.
- **Césure des titres** : `overflow-wrap: break-word` sur `h1`, `h2` et `h3`. Un titre est le texte le plus grand de la page, donc celui dont un seul mot cesse le premier de tenir au texte agrandi. Mesuré à 320 px, texte doublé : « Page introuvable » demandait 344 px pour une boîte de 256 et faisait défiler la page de 56 px. `break-word` et non `anywhere` : seul le mot qui ne tient pas est coupé.
- **Liens** : soulignés, y compris au milieu d'un paragraphe. Un lien ne se reconnaît pas à sa seule couleur.
- **Texte masqué** : `.visually-hidden` retire du visuel sans retirer de l'arbre d'accessibilité, ce que ni `display: none` ni `visibility: hidden` ne permettent. Attention, il est en position absolue : un conteneur défilant qui en contient doit être positionné, sinon ce texte s'échappe et étire la page.

## Limites connues

- La barre basse **ne passe jamais sur deux lignes** : ses libellés sont insécables et c'est elle qui défile horizontalement quand ils ne tiennent plus. Sa hauteur vaut donc toujours `--nav-bar-height` : une zone tactile, la place de l'anneau de focus des deux côtés, et son liseré. C'était une limite connue, mesurée puis corrigée : au texte agrandi à 200 %, la barre passait sur deux lignes et recouvrait 14 px du pied de page. Le prix de la correction est qu'avec beaucoup d'entrées, la barre défile de côté sur un écran étroit, ce qui engagera **RGAA 10.11** : à quatre entrées, elle débordera dès 320 px au texte par défaut. L'arbitrage repéré ce jour-là, à ne pas redécouvrir : passer la barre à la ligne, avec une hauteur mesurée au lieu de calculée.
- **Le défilement latéral de la barre défait deux garanties, et ce n'est tenu par aucun test** (mesuré le 1er novembre 2026, à 320 px, texte à 200 %, barres de défilement rétablies). D'abord, Chromium ne fait pas défiler la barre vers l'entrée qui vient de recevoir le focus quand elle est déjà partiellement visible : la dernière entrée reste rognée de 76 px et le bord droit de son anneau est invisible (**RGAA 10.7**). Ensuite, la barre de défilement horizontale de la barre ajoute 15 px à sa hauteur, que `--nav-bar-height` ne compte pas : la réserve de place et le `scroll-padding` deviennent courts d'autant, et la barre recouvre 14,5 px du bas du pied de page, soit son remplissage et non son texte (**RGAA 10.4**). Les tests ne le voient pas, parce que Playwright passe `--hide-scrollbars` en mode sans tête. À traiter avec l'arbitrage ci-dessus, dont c'est la vraie motivation.
- **Le `scroll-padding-bottom` ne couvre que ce vers quoi le navigateur défile.** Un contrôle déjà dans la fenêtre mais derrière la barre fixe y reste : mesuré, Chromium ne défile pas du tout quand l'élément focalisé est partiellement visible. La réserve traite le cas fréquent, pas celui-là.
- **La matrice ne mesure jamais 256 px de haut**, alors que RGAA 10.11 demande les deux dimensions : seul le dialogue est contrôlé à 320 x 256. Mesuré à la main le 1er novembre 2026 sur la page de repli, en 320 x 256, texte normal puis doublé : aucun débordement horizontal, et le lien de retour reste au-dessus de la barre basse, avec 55 px de marge au texte doublé. Cette garantie ne tient donc à aucun test. L'arbitrage repéré alors, ajouter un sixième contexte à `accessibilityMatrix`, est clos : la matrice ne s'étend plus (ADR 0007). La mesure du 1er novembre reste écrite ici.
- **`aria-invalid` est posé sur le `fieldset` d'un groupe en erreur**, par cohérence avec les autres champs, mais ARIA 1.2 ne liste pas le rôle `group` parmi ceux qui l'emploient : ce que les lecteurs d'écran en font n'est pas établi, et axe-core ne s'en plaint pas, le traitant comme un attribut global. L'erreur est de toute façon portée par le message relié et son préfixe. L'alternative, un `role="radiogroup"` qui le supporte, irait contre « le HTML natif avant ARIA ».
- **La flèche et le panneau d'options d'un `BaseSelect` restent ceux du système.** Les remplacer demanderait de réécrire le composant, ce que l'ADR 0001 réserve à Reka UI, et aucune story ne le demande. L'état indéterminé d'une case à cocher et la sélection multiple ne sont pas non plus couverts, pour la même raison.
- **Les étiquettes d'une case et d'un bouton radio portent `overflow-wrap: anywhere`.** Mesuré le 2 novembre 2026 à 320 px, texte doublé : sans lui, un mot plus large que la place restante fixait la largeur minimale de l'étiquette et faisait défiler la page entière de 28 px. `break-word` n'y suffit pas, lui seul n'entrant pas dans le calcul de cette largeur minimale. Le prix est qu'un mot peut se couper n'importe où à cette taille de texte.
- La région vide d'un `BaseAlert` compte comme un élément dans un conteneur `flex` avec `gap` (voir sa section plus haut).
- **Le champ d'un code à usage unique** (`BaseField` avec `autocomplete="one-time-code"`) ne demande aucun composant nouveau : le gestionnaire de mots de passe sait proposer le code reçu. **`inputmode="numeric"` n'est posé que là où seuls six chiffres sont acceptés**, à l'activation : sur l'écran de connexion, un code de secours fait de lettres s'y tape aussi, et un clavier limité aux chiffres rendrait le chemin du téléphone perdu intapable sur mobile.
- **Le QR code de la double authentification est une image de données**, engendrée dans la page par `uqr`, et son alternative est vide : la clé est donnée juste en dessous en texte, en groupes de quatre, donc l'image n'apporte rien qu'un lecteur d'écran doive annoncer. Elle ne suit pas les jetons de surface et n'écrit pourtant aucune couleur : le SVG porte son propre fond blanc, qui est ce qui le rend lisible par un appareil photo, en thème sombre comme en clair. Un test de bout en bout la vise par sa balise et non par son rôle, puisqu'une image décorative n'en a pas.
- **Deux régions `role="alert"` coexistent sur la page de connexion** : celle du bandeau d'état du service, dans `main`, et celle du formulaire, dans le `form`. Les deux sont montées vides, chacune pour annoncer son propre message. Un test de bout en bout qui chercherait « l'alerte » sans dire laquelle en trouverait deux : les deux fichiers concernés visent donc la bonne, l'une par `main > [role="alert"]`, l'autre par le formulaire.
- **La largeur du dialogue n'est tenue par aucune mesure**, mais par un test de source, `src/components/base/BaseDialog.styles.spec.ts`, qui refuse l'unité de fenêtre dans la déclaration. La raison est mesurée, et ce n'est pas celle qu'on croit : Reka UI verrouille le défilement du corps à l'ouverture d'un dialogue modal (`overflow: hidden` et `padding-right` compensatoire), donc la barre de défilement disparaît le temps du dialogue et un `100vw` y vaut exactement un `100%`. Aucune mesure géométrique ne peut départager les deux écritures, même avec les barres de défilement rétablies. Le pourcentage reste le bon justement parce qu'il ne dépend pas de ce comportement de la bibliothèque : un dialogue non modal, ou un Reka UI qui cesserait de verrouiller, remettrait l'écart de 15 px.
- Le tableau des états de la page de démonstration recopie quelques règles de survol, d'enfoncement et de focus pour les figer côte à côte. C'est la seule duplication acceptée. Elle n'a longtemps été gardée par rien, et trois divergences y ont vécu sans être vues jusqu'au 31 octobre 2026, dont une invisible en thème clair, où les deux jetons concernés ont la même valeur. Depuis, le bloc « copie figée des états » de `e2e/design-system.spec.ts` compare chaque état figé à ce que le composant vivant produit, en thème sombre. Restent hors du verrou, à comparer à la lecture : le focus du bouton et les règles sous `prefers-reduced-motion`.

## Vérification

| Ce qui est vérifié                                                            | Par quoi                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Seuils de contraste, dans les deux thèmes                                     | `src/styles/tokens.spec.ts`              |
| Attributs ARIA, refus du clic en cours, focus gardé                           | `src/components/base/*.spec.ts` (jsdom)  |
| Titre du document et focus à la navigation                                    | `src/navigation.spec.ts`                 |
| Réannonce d'un message identique, région vidée puis reposée                   | `src/components/base/BaseAlert.spec.ts`  |
| Attributs relayés sur le champ, `required` et `autocomplete`                  | `src/components/base/BaseField.spec.ts`  |
| Nom du site cliquable, haut de 44 px, et ramenant à l'accueil                 | `e2e/design-system.spec.ts`              |
| Nom unique de l'accueil : titre de niveau 1, titre du document, navigation    | `e2e/home.spec.ts`                       |
| Accueil, page de repli et page de démonstration sans violation axe-core, en clair, en sombre, à 320 px, à 320 px en sombre et au texte à 200 % | `e2e/accessibility.ts` |
| Ordre de l'échelle d'empilement                                               | `src/styles/tokens.spec.ts`              |
| Voile et dialogue au-dessus de la barre basse, à 320 px                       | `e2e/design-system.spec.ts`              |
| Dialogue entier et atteignable à 320 x 640 et à 320 x 256                     | `e2e/design-system.spec.ts`              |
| Anneau de focus entier dans la barre, à 375 x 667, à 320 px et à 12 px de police par défaut | `e2e/design-system.spec.ts`  |
| Largeur du dialogue sans unité de fenêtre                                     | `src/components/base/BaseDialog.styles.spec.ts` |
| Réserve de défilement égale à la hauteur de la barre, et nulle au-delà de 640 px | `e2e/design-system.spec.ts`            |
| Lien d'évitement, activation au clavier, va-et-vient du focus du dialogue      | `e2e/design-system.spec.ts`              |
| Place de la navigation selon la largeur                                       | `e2e/design-system.spec.ts`              |
| Ni défilement horizontal ni contenu masqué par la barre, à 320 px et au texte à 200 %, sur les trois écrans | `e2e/accessibility.ts` |
| Adresse inconnue servie par la page de repli, titre du document et retour à l'accueil | `src/routes.spec.ts` et `e2e/not-found.spec.ts` |
| Hauteur de la barre et doublement réel des libellés au texte à 200 %          | `e2e/design-system.spec.ts`              |
| Contenu du dialogue dans sa boîte au texte à 200 %                            | `e2e/design-system.spec.ts`              |
| Copie figée des états conforme à ce que les composants produisent             | `e2e/design-system.spec.ts`              |
| Absence de la page de démonstration dans le paquet livré                      | `.github/workflows/ci.yml`               |
| Aucune requête vers un service tiers, et la police bien chargée localement    | `e2e/third-party.spec.ts`                |
| Champs de choix : étiquette reliée, modèle, aide et erreur, groupement natif  | `src/components/base/BaseCheckbox.spec.ts`, `BaseRadioGroup.spec.ts`, `BaseSelect.spec.ts`, `BaseFieldset.spec.ts` |
| Cible tactile de 44 px, marque dessinée, anneau posé sur la boîte avec les jetons | `e2e/design-system.spec.ts` |
| Bandeau d'état du service : muet quand l'API répond, message en français sinon | `src/components/layout/ServiceStatusBanner.spec.ts` et `e2e/service-status.spec.ts` |
| Lecture du format d'erreur RFC 9457 par le front                              | `src/api/client.spec.ts`                 |

Deux choses ne se testent pas en jsdom, et sont donc couvertes par Playwright :

1. **l'activation d'un bouton natif par Entrée ou Espace**, que le navigateur traduit en clic ;
2. **le démontage du dialogue et le retour du focus**, que Reka UI fait à la fin de l'animation de sortie, laquelle ne se joue pas en jsdom.

axe-core ne trouve qu'une partie des problèmes, et c'est accepté : **l'audit manuel au lecteur d'écran est arrêté** depuis l'ADR 0007. Ce qui reste à la vigilance en écrivant un écran, parce que rien de mécanique ne le garantit, c'est l'usage au clavier et la visibilité du focus.

Les écoutes déjà faites restent écrites, parce qu'une mesure ne se périme pas. Le 1er novembre 2026, au Narrateur de Windows puis à NVDA : la réannonce d'un message identique, le double `aria-current` de l'accueil, et le lien du nom du site depuis une autre page. Les trois sont conformes, chacune notée dans sa section. VoiceOver n'est pas écouté.
