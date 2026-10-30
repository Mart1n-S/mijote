# Design system

Les jetons, les composants de base et les règles de mise en page de Mijote. La cible est le RGAA 4.1 niveau AA, vérifié à chaque livraison (section 7 du cahier des charges).

Tout est dans `apps/web` :

| Quoi                   | Où                                        |
| ---------------------- | ----------------------------------------- |
| Jetons                 | `src/styles/tokens.css`                   |
| Styles des éléments    | `src/styles/base.css`                     |
| Composants de base     | `src/components/base/`                    |
| Mise en page           | `src/components/layout/AppLayout.vue`      |
| Page de démonstration  | `src/pages/DesignSystemPage.vue`           |

La page de démonstration est servie sur `/design-system` en développement. Elle n'est pas construite en production : la condition qui l'écarte est une constante de compilation, donc ni la route ni le code de la page ne partent dans le paquet livré.

## Principes

1. **Les jetons d'abord.** Aucune couleur, taille, espacement ni rayon en dur dans un composant. Une valeur qui manque devient un jeton.
2. **Le HTML avant ARIA.** Un bouton est un `button`, un lien est un `a href`. ARIA seulement là où le natif ne suffit pas.
3. **Reka UI pour les comportements difficiles.** Dialogue, liste déroulante, combobox, menu : le clavier et ARIA viennent de la bibliothèque (ADR 0001), le style reste maison.
4. **Jamais la couleur seule.** Un état se lit aussi par un mot, une forme ou une épaisseur.

## Jetons

### Couleurs

Le mode sombre redéfinit **les mêmes noms** sous `prefers-color-scheme: dark`. Un composant n'a donc jamais à savoir dans quel thème il est rendu, et il n'existe aucun jeton propre à un seul thème.

| Jeton                   | Rôle                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `--color-background`    | Fond de la page                                                   |
| `--color-surface`       | Fond d'un bloc posé sur la page : carte, message, bouton secondaire |
| `--color-surface-hover` | La même surface au survol                                         |
| `--color-border`        | Séparateur décoratif. Aucun seuil de contraste : il ne porte pas d'information |
| `--color-border-strong` | Contour d'un contrôle : champ, bouton secondaire. Tient 3:1       |
| `--color-text`          | Texte courant                                                     |
| `--color-text-muted`    | Texte secondaire : aide d'un champ, pied de page                  |
| `--color-accent`        | La seule couleur d'accent : lien, bouton principal, page courante |
| `--color-accent-hover`  | L'accent au survol                                                |
| `--color-on-accent`     | Texte posé sur l'accent                                           |
| `--color-success`       | Repère de succès : liseré, icône                                  |
| `--color-warning`       | Repère d'avertissement                                            |
| `--color-danger`        | Repère d'erreur, et fond du bouton de danger                      |
| `--color-danger-hover`  | Le danger au survol                                               |
| `--color-on-danger`     | Texte posé sur le danger                                          |
| `--color-focus`         | Anneau de focus                                                   |

Le rouge est réservé au danger. L'accent ne doit jamais s'en approcher : une action ordinaire et une action destructrice ne se ressemblent pas.

### Typographie

`--font-sans` est une **pile système** et `--font-mono` aussi : aucune requête vers un service tiers, aucune police à héberger, aucun décalage de rendu au chargement.

Tailles : `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`. Interlignes : `--leading-tight`, `--leading-normal`. Graisses : `--weight-normal`, `--weight-medium`, `--weight-bold`.

Toutes les tailles sont en `rem`, pour suivre le réglage de taille de texte du navigateur.

### Espacements, rayons et divers

- Espacements : `--space-1` à `--space-8`, échelle de 4 px exprimée en `rem`.
- Rayons : `--radius-sm`, `--radius-md`, `--radius-full`.
- `--tap-min` : 44 px, le minimum RGAA pour une zone tactile. En `rem`, donc la cible grandit avec le texte au zoom.
- `--duration-fast` : durée des transitions d'état.
- `--breakpoint-nav` : 40rem, largeur à laquelle la navigation change de place. Une requête de media ne peut pas lire une propriété personnalisée : la valeur est répétée dans les `@media` de `base.css` et d'`AppLayout.vue`, et ce jeton en est la référence écrite.

## Contrastes mesurés

Ces ratios ne sont pas recopiés à la main : `src/styles/tokens.spec.ts` lit `tokens.css`, mesure chaque couple ci-dessous dans les deux thèmes et échoue si un seuil tombe. Changer une couleur sans refaire le tour des seuils n'est donc pas possible.

Seuils : 4,5:1 pour le texte courant, 3:1 pour les éléments d'interface.

| Usage                                     | Couple de jetons                                      | Seuil | Clair    | Sombre   |
| ----------------------------------------- | ----------------------------------------------------- | ----- | -------- | -------- |
| texte courant sur la page                 | `--color-text` sur `--color-background`               | 4,5:1 | 17,42:1  | 15,05:1  |
| texte sur une surface                     | `--color-text` sur `--color-surface`                  | 4,5:1 | 15,97:1  | 13,20:1  |
| texte sur une surface survolée            | `--color-text` sur `--color-surface-hover`            | 4,5:1 | 14,59:1  | 11,59:1  |
| texte secondaire sur la page              | `--color-text-muted` sur `--color-background`         | 4,5:1 | 6,96:1   | 8,41:1   |
| texte secondaire sur une surface          | `--color-text-muted` sur `--color-surface`            | 4,5:1 | 6,38:1   | 7,38:1   |
| texte secondaire sur une surface survolée | `--color-text-muted` sur `--color-surface-hover`      | 4,5:1 | 5,83:1   | 6,48:1   |
| lien sur la page                          | `--color-accent` sur `--color-background`             | 4,5:1 | 6,43:1   | 9,04:1   |
| lien sur une surface                      | `--color-accent` sur `--color-surface`                | 4,5:1 | 5,90:1   | 7,93:1   |
| libellé du bouton principal               | `--color-on-accent` sur `--color-accent`              | 4,5:1 | 6,43:1   | 9,44:1   |
| libellé du bouton principal survolé       | `--color-on-accent` sur `--color-accent-hover`        | 4,5:1 | 9,11:1   | 11,29:1  |
| libellé du bouton de danger               | `--color-on-danger` sur `--color-danger`              | 4,5:1 | 6,54:1   | 8,09:1   |
| libellé du bouton de danger survolé       | `--color-on-danger` sur `--color-danger-hover`        | 4,5:1 | 8,88:1   | 9,92:1   |
| contour d'un champ sur la page            | `--color-border-strong` sur `--color-background`      | 3:1   | 3,58:1   | 3,81:1   |
| contour d'un champ sur une surface        | `--color-border-strong` sur `--color-surface`         | 3:1   | 3,28:1   | 3,34:1   |
| anneau de focus sur la page               | `--color-focus` sur `--color-background`              | 3:1   | 6,43:1   | 9,04:1   |
| anneau de focus sur une surface           | `--color-focus` sur `--color-surface`                 | 3:1   | 5,90:1   | 7,93:1   |
| repère de succès sur la page              | `--color-success` sur `--color-background`            | 3:1   | 6,56:1   | 9,30:1   |
| repère de succès sur une surface          | `--color-success` sur `--color-surface`               | 3:1   | 6,02:1   | 8,16:1   |
| repère d'avertissement sur la page        | `--color-warning` sur `--color-background`            | 3:1   | 6,33:1   | 8,39:1   |
| repère d'avertissement sur une surface    | `--color-warning` sur `--color-surface`               | 3:1   | 5,80:1   | 7,36:1   |
| repère d'erreur sur la page               | `--color-danger` sur `--color-background`             | 3:1   | 6,54:1   | 7,86:1   |
| repère d'erreur sur une surface           | `--color-danger` sur `--color-surface`                | 3:1   | 5,99:1   | 6,89:1   |

Un nouvel usage de couleur dans un composant veut dire un couple de plus dans ce test, et une ligne de plus dans ce tableau.

## Composants de base

### BaseButton

Variantes : `primary` (l'action de l'écran), `secondary` (les autres), `danger` (ce qui détruit).

Deux indisponibilités, qui ne se confondent pas :

| État       | Attributs                      | Focus           | Quand                                                                       |
| ---------- | ------------------------------ | --------------- | --------------------------------------------------------------------------- |
| `disabled` | `disabled`                     | hors tabulation | indisponible durablement : un droit manque, une condition n'est pas remplie |
| `loading`  | `aria-disabled`, `aria-busy`   | **gardé**       | une action est en cours                                                     |

L'état en cours **n'utilise pas** l'attribut `disabled`. Un bouton désactivé perd le focus et sort de l'arbre de tabulation : l'utilisateur au clavier qui vient de l'activer se retrouverait sans repère, et le lecteur d'écran n'annoncerait plus rien. Avec `aria-disabled`, le bouton garde le focus et reste annoncé. En contrepartie il reçoit encore les clics et la touche Entrée : c'est le composant qui les refuse, dans son gestionnaire.

L'action en cours ajoute aussi un texte réservé au lecteur d'écran (`loadingLabel`, « en cours » par défaut) : `aria-busy` n'est pas restitué par tous.

Un contrôle inactif sort du champ des seuils de contraste (WCAG 1.4.3, « incidental »), ce qui autorise l'atténuation de `:disabled`. L'état en cours garde son contraste plein : il est actif.

### BaseField

Un champ de saisie avec label visible, aide et erreur.

- Le label est relié par `for`/`id`, avec un identifiant unique par instance (`useId`).
- L'aide se place entre le label et le champ, l'erreur après le champ.
- `aria-describedby` liste l'aide puis l'erreur, dans cet ordre : la consigne d'abord, ce qui cloche ensuite. Un identifiant n'est listé que si l'élément existe.
- Une erreur pose `aria-invalid`, double l'épaisseur du contour et préfixe le message par « Erreur : ». L'état se lit donc sans la couleur.

**Partage des rôles pour l'annonce.** Le champ n'annonce pas son erreur lui-même : il la relie. Ce qui l'annonce à l'envoi du formulaire est le résumé en tête, un `BaseAlert`, dont la région existe déjà. C'est aussi ce que demande `vue-accessibility.md` : erreur sous le champ, et résumé en haut.

### BaseAlert

Un message annoncé au lecteur d'écran. Variantes : `info`, `success` (région `role="status"`, `aria-live="polite"`), `warning`, `error` (région `role="alert"`, `aria-live="assertive"`, qui interrompt la lecture en cours).

**Le point à ne pas perdre de vue : la région doit exister avant le message.** Une région `aria-live` n'annonce que ce qui change après son arrivée dans le DOM. Montée en même temps que son contenu, elle est lue comme du texte déjà présent, donc passée sous silence.

Le composant est donc fait pour cela : la région est rendue inconditionnellement, et seul son contenu dépend de `message`. Ce qui en découle pour l'appelant :

- monter le `BaseAlert` dès l'affichage de l'écran, avec un `message` vide, et non le faire apparaître quand le message arrive ;
- ne pas l'envelopper dans un `v-if`, qui annulerait exactement la garantie ;
- ne pas changer de variante en même temps que le message, parce que le `role` change avec elle et que la région serait recréée.

La région vide est un `div` sans style, donc de hauteur nulle. Dans un conteneur `flex` avec `gap`, elle compte en revanche comme un élément : `display: contents` corrigerait cela, mais plusieurs moteurs l'ont déjà, à un moment, sortie de l'arbre d'accessibilité, ce qui est exclu sur une région `aria-live`.

Chaque message porte un préfixe qui nomme son état (« Information : », « Succès : », « Attention : », « Erreur : ») et un repère visuel `aria-hidden`. La couleur ne porte jamais l'information seule.

### BaseDialog

Un dialogue modal sur Reka UI. Le piège de focus, l'entrée du focus, son retour sur le déclencheur, la fermeture par Échap et le retrait de l'arrière-plan de l'arbre d'accessibilité viennent de la bibliothèque, qui est précisément là pour ça (ADR 0001).

Usage : `title` est obligatoire et devient le nom accessible ; `description` est reliée par `aria-describedby` ; le déclencheur passe par le slot `trigger`, les actions par le slot `actions`.

L'appelant passe un `BaseButton` dans le slot `trigger` et **n'a pas à connaître Reka UI** : c'est `BaseDialog` qui l'enveloppe dans `DialogTrigger`, ce qui est aussi ce qui fait revenir le focus sur ce bouton à la fermeture.

Reka UI 2.11 rend le dialogue modal en posant `aria-hidden` sur le reste du document, et non `aria-modal` sur le dialogue. C'est une technique équivalente, mais qui change ce qu'un test doit regarder.

Au zoom, le contenu du dialogue défile dans le dialogue plutôt que de sortir de l'écran.

## Mise en page

`AppLayout` donne à tous les écrans : lien d'évitement, `header`, `nav`, `main`, `footer`.

- **Lien d'évitement** : premier élément focusable du document, hors de l'écran au repos, visible dès qu'il reçoit le focus. Il est déplacé par `transform` et non retiré par `display: none`, qui le sortirait de l'ordre de tabulation.
- **Navigation** : un **seul** élément `nav` dans le DOM, placé par le CSS. Barre fixe en bas sous 640 px, colonne latérale au-delà. Deux `nav`, un par largeur, dupliqueraient le repère de navigation et l'ordre de tabulation.
- La barre basse étant hors du flux, la grille réserve sa hauteur : rien ne passe sous elle, ni la fin du contenu ni le pied de page. Vérifié à 320 px, l'équivalent du zoom à 200 %.
- Les entrées de navigation se déduisent des routes qui déclarent un `meta.navLabel`, plutôt que d'une seconde liste à tenir en parallèle. La page courante se signale par un trait et une graisse, en plus de la couleur, et par `aria-current="page"`, que `RouterLink` pose.
- **À chaque changement de page**, le titre du document suit la page et le focus repart de `main`. Le premier affichage est exclu : y déplacer le focus ferait sauter l'en-tête et le lien d'évitement.

## Règles transverses

Elles sont dans `base.css` et s'appliquent sans que personne ait à y penser :

- **Focus** : un anneau unique, `:focus-visible`, avec un écart de 2 px qui laisse voir le fond entre le contrôle et l'anneau. Il reste donc visible même sur un bouton rempli de la couleur d'accent. `:focus-visible` et non `:focus`, pour ne pas poser l'anneau sur un clic de souris.
- **Zones tactiles** : 44 px au minimum, par `--tap-min`, sur tout ce qui se clique.
- **Animations** : sous `prefers-reduced-motion: reduce`, elles sont supprimées, pas raccourcies. La durée résiduelle de 0,01 ms garde l'événement de fin de transition, dont Reka UI dépend pour savoir quand démonter un contenu.
- **Liens** : soulignés, y compris au milieu d'un paragraphe. Un lien ne se reconnaît pas à sa seule couleur.
- **Texte masqué** : `.visually-hidden` retire du visuel sans retirer de l'arbre d'accessibilité, ce que ni `display: none` ni `visibility: hidden` ne permettent.

## Vérification

| Ce qui est vérifié                                                            | Par quoi                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Seuils de contraste, dans les deux thèmes                                     | `src/styles/tokens.spec.ts`              |
| Attributs ARIA, refus du clic en cours, focus gardé                           | `src/components/base/*.spec.ts` (jsdom)  |
| Titre du document et focus à la navigation                                    | `src/navigation.spec.ts`                 |
| Page de démonstration sans violation axe-core, en clair, en sombre et à 320 px | `e2e/design-system.spec.ts`              |
| Lien d'évitement, activation au clavier, va-et-vient du focus du dialogue      | `e2e/design-system.spec.ts`              |
| Place de la navigation selon la largeur, absence de défilement horizontal     | `e2e/design-system.spec.ts`              |

Deux choses ne se testent pas en jsdom, et sont donc couvertes par Playwright :

1. **l'activation d'un bouton natif par Entrée ou Espace**, que le navigateur traduit en clic ;
2. **le démontage du dialogue et le retour du focus**, que Reka UI fait à la fin de l'animation de sortie, laquelle ne se joue pas en jsdom.

axe-core ne trouve qu'une partie des problèmes. Le clavier et le lecteur d'écran (NVDA, VoiceOver) se testent à la main à chaque lot.
