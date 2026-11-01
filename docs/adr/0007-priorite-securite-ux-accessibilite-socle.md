# ADR 0007 : sécurité et UX d'abord, accessibilité ramenée à un socle de base

- Statut : acceptée
- Date : 1er novembre 2026

## Contexte

Le projet visait le RGAA 4.1 niveau AA sur tous les écrans : objectif mesurable de la section 1 du cahier des charges, cible vérifiée à chaque livraison de la section 7, règle non négociable du `CLAUDE.md`.

C'est une application personnelle, pour un foyer, sur invitation. Le lot 1 a montré ce que cette cible coûte vraiment, et où le temps part :

- Les derniers défauts trouvés ne sont pas des barrières d'usage mais des cas de bord : la barre de navigation au texte agrandi à 200 % sur une fenêtre de 256 px de haut (issue #40), le bouton d'un dialogue rogné dans le même cumul de conditions. Aucun utilisateur réel du foyer n'est dans cette configuration.
- Les trois voies mesurées pour l'issue #40 coûtent toutes cher : du JavaScript qui écrit une valeur de CSS, un contrat de défilement changé pour tous les écrans à venir, ou un défilement latéral sans indice visuel. Le défaut corrigé, lui, vaut 15 px de remplissage de pied de page.
- L'audit manuel au lecteur d'écran à chaque lot et la matrice axe-core à cinq contextes par écran prennent un temps qui ne va plus à la sécurité ni à l'interface.

La cible était donc plus haute que le besoin, et elle se payait sur les deux sujets qui comptent le plus pour ce projet.

## Décision

**La sécurité et l'UX/UI passent en premier. L'accessibilité se limite au socle déjà posé par le design system. Aucune conformité RGAA formelle n'est visée, et un point d'accessibilité qui bloque trop peut être abandonné.**

### Le socle de base, conservé

- HTML natif et sémantique, ARIA seulement quand le natif ne suffit pas.
- Tout se fait au clavier, le focus reste visible.
- Chaque champ a un label visible, relié au champ.
- Les contrastes viennent des jetons de design, et sont garantis par leur test.
- axe-core tourne en CI.

La liste complète, celle qu'on lit en écrivant un composant, est dans `.claude/rules/vue-accessibility.md`. Les cinq points ci-dessus la résument.

Ce socle est tenu **pour l'essentiel** par l'outillage, dans l'esprit de l'ADR 0004 : le lint (`eslint-plugin-vuejs-accessibility`), le test des couples de jetons et les passages axe-core le gardent sans qu'un relecteur ait à y penser. Ce qui reste à la vigilance, et que rien de mécanique ne garantit sur un écran nouveau, c'est l'usage au clavier et la visibilité du focus : un passage axe-core ne les mesure pas.

### Ce qu'on arrête

- L'audit manuel au lecteur d'écran à chaque lot.
- La chasse au défaut de texte agrandi à 200 % sur petite hauteur.
- L'extension de la matrice axe-core : ses cinq contextes restent sur les écrans qui les ont déjà, un écran nouveau n'a besoin que d'un seul passage.
- La relecture d'accessibilité systématique : `a11y-reviewer` sort du pipeline par défaut et ne tourne plus que sur demande explicite. Il garde sa grille RGAA complète, parce qu'on le lance justement quand on veut ce niveau de détail.

### La règle de proportion

Elle vaut au-delà de l'accessibilité, et c'est pour cela qu'elle entre dans le `CLAUDE.md` :

- On corrige ce qui touche un utilisateur réel dans ce qui est livré.
- Un défaut hypothétique va dans les limites connues, avec sa mesure, et n'ouvre pas d'issue.
- Une suggestion de relecteur ne devient une issue que si elle est bloquante ou importante.

## Conséquences

- Les textes normatifs changent : objectif de la section 1 et cible de la section 7 du cahier des charges, règle non négociable du `CLAUDE.md`, `.claude/rules/vue-accessibility.md` ramenée au socle.
- Le skill `rgaa-checklist` reste installé, et reste la grille de `a11y-reviewer` quand il est lancé. Rien n'est désinstallé : l'inventaire de `docs/outillage-ia.md` ne bouge pas, seule sa section pipeline le fait.
- Les limites connues de `docs/design-system.md` restent écrites et restent vraies. Elles ne deviennent pas des issues.
- L'issue #40 sort du jalon Lot 1 et reste ouverte, avec la comparaison des trois voies en commentaire : si la barre atteint quatre entrées et gêne pour de bon, tout est mesuré.
- Les exigences vérifiables de la section 7 du cahier des charges servent de guide pour les composants de base, où elles sont peu coûteuses. Sur un écran métier, seul le socle est tenu.

### Ce que cet ADR ne défait pas

L'ADR 0004 reste entier, y compris son banc d'essai, qui parle du « RGAA 4.1 niveau AA non négociable » : un ADR accepté ne se modifie pas. Son exemple garde sa valeur, parce qu'un champ sans label est dans le socle et reste un défaut bloquant. C'est le cadre général qui change ici, pas son raisonnement.

L'ADR 0006 non plus. Atkinson Hyperlegible Next a été choisie pour la basse vision, et elle reste : c'est un choix déjà fait, qui ne coûte plus rien à tenir. Les commentaires qui la justifiaient par « la cible RGAA du projet » disent désormais la vraie raison, la lisibilité en basse vision.

### Ce qu'il remplace

L'ADR 0001 dit « l'application vise le RGAA 4.1 niveau AA » et « axe-core en CI et audit manuel au lecteur d'écran restent obligatoires ». **Ces deux phrases sont remplacées par le présent ADR**, et par lui seul : axe-core en CI reste, l'audit manuel s'arrête, la cible AA tombe. L'ADR 0001 n'est pas modifié, le reste de son contenu vaut toujours.

## Quand revoir cette décision

- Si l'application s'ouvre au-delà du foyer, à des utilisateurs qu'on ne connaît pas.
- Si une obligation légale s'applique, ce qui supposerait un service offert au public.
- Si un utilisateur réel rencontre une gêne : elle se traite alors sur son mérite, sans attendre un référentiel.
