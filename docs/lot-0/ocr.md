# Hypothèse 7 : lecture des tickets de caisse et des factures drive

Analyse des 28 et 29 octobre 2026. Prototype : `spikes/ocr/`. Tout en local : aucun document n'a quitté la machine.

**Les libellés de produits achetés n'apparaissent pas dans ce rapport.** Ils restent dans `spikes/ocr/data/` et `spikes/ocr/references/`, tous deux hors de Git, et les verdicts du rapprochement sont indexés par numéro de ligne, jamais par libellé.

## 1. Verdict

**Partielle**, et pour une raison qui change la conception : les trois tickets Picard fournis sont **dématérialisés et portent une couche de texte**, donc l'OCR est inutile pour eux. Leur lecture sans OCR est exacte : 18 lignes sur 18, et les totaux se réconcilient au centime. L'OCR, mesuré sur des images rendues depuis ces PDF, lit 94 % des lignes sur une image nette à 150 points par pouce, mais s'effondre dès qu'on dégrade l'image.

Il reste à prouver ce que donnerait une **photo réelle de ticket thermique**, que personne n'a encore déposée, et les **tickets papier Intermarché** attendus après les prochaines courses. Le critère des 90 % n'est donc ni atteint ni réfuté pour le cas qui compte.

Les factures drive, elles, se lisent sans OCR sur les trois modèles rencontrés, avec quantité et prix unitaire sur 100 % des lignes.

## 2. Méthode

### Trois régimes de mesure, à ne pas confondre

| Régime | Ce qu'il mesure | État |
| --- | --- | --- |
| **PDF natif** | la couche de texte, sans OCR | mesuré |
| **Image rendue** depuis le PDF, 150 et 300 points par pouce | le plancher de difficulté : une image parfaite, nette et droite | mesuré |
| **Images dégradées** volontairement : flou, rotation, bruit, contraste faible, chacune à part | la sensibilité de l'OCR à chaque défaut | mesuré |
| **Photo réelle** prise au téléphone | le cas qui compte vraiment | **en attente** |

Une image rendue depuis un PDF est parfaite : nette, droite, sans grain, contraste maximal. **Elle ne peut pas valider un critère portant sur des photos**, et c'est pour cela que les trois régimes sont séparés dans tout ce rapport.

### Outils, tous locaux

`pdftotext` et `pdftoppm` (Poppler) pour le texte et le rendu, `magick` (ImageMagick) pour les dégradations, `tesseract` 5.4 avec le modèle français pour l'OCR. Installations et commandes de retrait : `docs/lot-0/installations.md`. Aucun service distant n'a été appelé, et aucune comparaison externe n'a été faite.

### Filtre des données personnelles, appliqué dès l'extraction

Les six documents portent le nom, l'adresse, le téléphone et le numéro de carte de fidélité, **qui n'étaient pas masqués**. Le filtre repose sur deux mécanismes :

1. **une liste blanche de sortie** : le module d'extraction ne rend que le magasin, la date, les lignes d'articles et le total. Le reste n'est jamais recopié, donc il ne peut pas fuir dans un affichage, un journal ou un fichier ;
2. **un détecteur**, qui relève les catégories présentes dans le texte brut puis vérifie qu'aucune ne ressort. C'est la mesure du filtre, et c'est ce double contrôle que l'application devra faire.

### Vérité de référence

La couche de texte des PDF a servi de référence, après validation des lignes extraites. Ce n'est pas circulaire : la vérité vient du texte du PDF, et la mesure porte sur l'OCR d'une image rendue depuis ce même PDF.

### Un format, une fonction

Le pipeline est générique : découverte des fichiers, extraction, filtre, mesure. Seul le découpage en lignes dépend de l'enseigne. Déposer un fichier dans `data/` suffit à le prendre en compte ; ajouter une **enseigne** demandera d'écrire une fonction de découpage, et rien d'autre.

## 3. Résultats mesurés

Cette hypothèse ne découvre pas une source de données, elle mesure des lectures : la section « Données disponibles » du plan de rapport est donc remplacée par les mesures.

### Le filtre des données personnelles

| Document | Catégories présentes dans le brut | Catégories en sortie |
| --- | --- | --- |
| Ticket 1 | nom, code postal et ville, téléphone, fidélité, paiement | **aucune** |
| Ticket 2 | les mêmes | **aucune** |
| Ticket 3 | les mêmes, plus une adresse | **aucune** |
| Facture 1 | nom, adresse, code postal, e-mail, téléphone, fidélité | **aucune** |
| Facture 2 | les mêmes | **aucune** |
| Facture 3 | nom, adresse, code postal, téléphone, fidélité, paiement | **aucune** |

**6 documents sur 6, zéro fuite**, et les six fichiers de référence sont propres au contrôle final.

Un piège mérite d'être retenu, parce que l'application y tombera : sur les factures, **le bloc d'adresse du client est à droite, à la même hauteur que les premières lignes d'articles**. Un regroupement naïf par ligne de texte collait l'adresse dans des libellés de produits. C'est le découpage par colonnes qui l'évite, complété par un retrait des mots d'adresse, qui a attrapé un mot résiduel par facture.

### Tickets Picard, lecture du PDF sans OCR

| Ticket | Lignes | Articles | Annoncés | Somme des lignes | Total payé |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | 4 | 4 | 19,28 € | 19,28 € |
| 2 | 6 | 6 | 6 | 24,68 € | 24,68 € |
| 3 | 8 | 10 | 10 | 64,81 € | 63,41 € |

**18 lignes sur 18, et tout se réconcilie** : sur le troisième ticket, 64,81 € d'articles moins 1,40 € de remise font les 63,41 € payés, et sept lignes simples plus une ligne de trois unités font les dix articles annoncés. Aucune ligne écartée ne porte de montant, ce qui est vérifié automatiquement : aucun article ne peut se cacher parmi elles.

Quatre formes ont dû être traitées, et aucune n'était prévue : le prix est suivi du signe euro, le code de TVA n'est pas toujours le même (un rayon à 20 % utilise un autre préfixe), les remises sont des lignes à montant négatif sans code, et surtout **le cas du multiplicateur met le libellé sur une ligne et « quantité × prix unitaire = total » sur la suivante**. C'est le seul endroit où une quantité existe : ailleurs, une ligne vaut un article.

### OCR, images rendues et dégradées

Mesure sur les 18 lignes de référence des trois tickets. Une ligne est comptée juste si le libellé, la quantité et le prix sont tous exacts.

| Régime | 150 points par pouce | 300 points par pouce |
| --- | --- | --- |
| Image nette | **17/18 (94 %)** | 12/18 (67 %) |
| Flou | 14/18 (78 %) | 17/18 (94 %) |
| Rotation 2 degrés | 17/18 (94 %) | 12/18 (67 %) |
| Rotation 5 degrés | 1/18 (6 %) | 11/18 (61 %) |
| Bruit | 6/18 (33 %) | 0/18 (0 %) |
| Contraste faible | 14/18 (78 %) | 14/18 (78 %) |
| Flou, rotation et bruit cumulés | 11/18 (61 %) | 4/18 (22 %) |

**Ce qu'il faut en retenir, et uniquement cela.** Sur une image parfaite, l'OCR français lit la quasi-totalité des lignes. **La rotation et le bruit sont les deux ennemis** : cinq degrés de rotation à 150 points par pouce font tomber la lecture à 6 %, et le bruit à 300 points par pouce à zéro. Le contraste faible coûte une quinzaine de points, le flou peu de chose.

**Ce tableau ne doit pas être lu comme une précision.** Avec 18 lignes, une ligne pèse 5,6 points, et les écarts entre 150 et 300 points par pouce tiennent à une ou deux confusions de caractères, comme un « g » lu « 9 » dans un poids. J'ai vérifié que ce n'était pas un réglage de segmentation : les modes 3, 4 et 6 de Tesseract donnent exactement le même résultat. Ces chiffres donnent un ordre de grandeur et une hiérarchie des défauts, pas une mesure fine.

Une correction de méthode à consigner : l'analyseur du PDF s'appuie sur l'alignement des colonnes, or **l'OCR réduit les espaces multiples à un seul**. Avec l'analyseur strict, l'OCR d'une image nette donnait 0 ligne sur 18 alors que le texte lu était presque parfait. Il a fallu un second analyseur, tolérant, qui prend le dernier montant de la ligne comme prix et accepte les confusions de caractères habituelles.

### Factures drive, lecture sans OCR

| Facture | Date | Lignes | Articles | Somme des lignes | Total | Écart |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 25/05/2024 | 37 | 52 | 138,05 € | 142,63 € | 4,58 € |
| 2 | 10/02/2024 | 32 | 43 | 93,79 € | 103,79 € | 10,00 € |
| 3 | 06/08/2024 | 10 | 18 | 54,53 € | 64,53 € | 10,00 € |

Quantité commandée, quantité livrée et prix unitaire sont présents sur **100 % des lignes**, et la catégorie de rayon sur 55 à 95 % selon la facture. Les deux écarts à exactement 10,00 € désignent un frais de livraison ou de service : **le total d'une facture n'est jamais la somme de ses lignes.**

Elles sont toutes de **2024**, et non de 2025 : quinze à vingt-et-un mois d'ancienneté. La troisième suit un **modèle différent** des deux autres, sans en-tête de comptage et avec d'autres positions de colonnes. Les positions codées en dur ont donc été remplacées par une détection par document : au moins deux montants sur la ligne, le dernier est le total, les entiers qui précèdent sont les quantités, et le libellé est ce qui se trouve à gauche du premier chiffre. Les trois modèles passent avec cette seule règle.

### Rapprochement par la méthode M7 de l'hypothèse 6

Trois mesures séparées, parce que les entrées n'ont rien de comparable.

| Mesure | Lignes | Au moins une suggestion | Première suggestion utilisable | Dont bonne au sens strict |
| --- | --- | --- | --- | --- |
| **A.** libellés **tronqués** des tickets vers le catalogue Picard | 18 | 15/18 (83 %) | 10/15 (67 %) | 8/15 (53 %) |
| **B1.** libellés complets des factures vers les 87 ingrédients HelloFresh | 79 | 35/79 (44 %) | 19/35 (54 %) | 12/35 (34 %) |
| **B2.** libellés complets des factures vers les 3 484 aliments Ciqual | 79 | 25/79 (32 %) | 16/25 (64 %) | 14/25 (56 %) |

Le chiffre retenu est la **précision quand la méthode propose**, parce que le rappel n'est pas mesurable ici : les 87 ingrédients viennent de 20 recettes, donc la plupart des articles d'un panier réel n'ont légitimement aucun équivalent. C'est bien ce qu'on observe, et c'est sain : la méthode se tait sur 44 lignes de factures sur 79 face aux ingrédients HelloFresh.

**La troncature est le vrai obstacle**, et elle est spécifique aux tickets. Un libellé coupé à seize caractères perd la fin des mots : trois lignes sur dix-huit n'ont reçu **aucune** suggestion uniquement pour cette raison, parce qu'un mot tronqué ne correspond exactement à aucun mot du catalogue, et parce qu'un libellé court explique trop peu du nom complet du produit pour passer le seuil de recouvrement de M7.

**Un bug de M7 révélé par les factures, et c'est un apport pour l'hypothèse 6.** La méthode exige la présence du mot le plus discriminant de l'entrée. Or sur une facture, le mot le plus rare est **la marque**, qui n'existe dans aucun catalogue d'ingrédients : les 79 lignes rendaient donc zéro suggestion. Corrigé en restreignant le mot exigé au vocabulaire du catalogue visé. Sans cette correction, un connecteur bâti sur M7 aurait échoué silencieusement sur toute entrée portant une marque.

### Écart entre le prix du ticket et le prix du site

**Aucune comparaison n'est possible sur cet échantillon**, et c'est explicable : les prix du site relevés aux hypothèses 3 et 5 portent sur 49 produits choisis comme **ingrédients** (légumes, viandes, herbes), alors que ces tickets contiennent des plats cuisinés, des glaces, de la charcuterie et un article non alimentaire. Aucun des huit produits correctement rapprochés n'est parmi eux. La mesure demande une collecte complète du catalogue, qui donnera un prix pour chacun des 1 605 produits.

## 4. Limites et risques

**Le régime qui compte n'est pas mesuré.** Une photo de ticket thermique ajoute le grain du papier, l'encre pâle, les plis, l'éclairage et la perspective. Les chiffres de ce rapport portent sur des images parfaites ou dégradées artificiellement, ce qui n'est pas la même chose. **Le critère des 90 % reste donc ouvert.**

**Trois tickets d'une seule enseigne, tous dématérialisés.** Ils ne disent rien du format Intermarché, ni d'un ticket papier.

**L'échantillon est petit.** 18 lignes de tickets, 79 lignes de factures. Les pourcentages de ce rapport se déplacent de cinq points dès qu'une ligne change de camp.

**Les dégradations sont artificielles.** Un flou gaussien n'est pas un flou de mise au point, et un bruit gaussien n'est pas le grain d'un papier thermique. La hiérarchie des défauts (rotation et bruit d'abord) est sans doute juste, les valeurs absolues non.

**La vérité de référence vient du PDF.** Elle est exacte pour ces documents, mais elle n'existera pas pour un ticket papier : il faudra alors une transcription manuelle, avec le travail que cela représente.

**Les analyseurs sont spécifiques.** Deux analyseurs pour une seule enseigne, un par régime, plus la détection de colonnes des factures. Chaque enseigne en demandera un, et chacun cassera à la première refonte de mise en page. C'est une dette, pas une victoire.

**Les factures datent de 2024.** Leurs prix ne valent pas comme prix du jour. En revanche leurs libellés, eux, ne vieillissent pas.

**Le filtre repose sur des motifs.** Il n'a rien laissé passer sur six documents, mais un format inattendu (un nom sans le mot « Nom », une adresse sans numéro) pourrait le contourner. La liste blanche de sortie est la vraie protection ; le détecteur n'est qu'un contrôle.

## 5. Décisions prises

1. **Importer un ticket PDF est la voie la plus fiable, et elle devient la voie principale** pour les tickets dématérialisés. Lecture exacte, aucune dépendance à l'OCR, aucun réglage d'image. L'OCR reste pour les tickets papier, et seulement pour eux.
2. **Remises** : le prix de référence d'un produit est **le prix de sa ligne**. La remise est conservée comme **une ligne à part**, et le budget se calcule sur le **total réellement payé**.
3. **Factures drive** : les prix viennent du **prix unitaire de chaque ligne**, jamais du total. Les frais de livraison ou de service comptent dans les dépenses, **mais pas dans le coût d'un repas**.
4. **Prix des factures de 2024 : dernier recours.** Ils entrent au niveau « estimé » du tableau des niveaux de prix de la section 6 du cahier des charges, avec leur date affichée, et ne remplacent jamais un relevé récent. Leur vrai intérêt est ailleurs (point 5).
5. **Les factures servent surtout à connaître les produits habituels.** Elles donnent des **libellés complets avec marque et conditionnement**, des quantités, des catégories de rayon, et un historique de ce qui est acheté réellement. C'est une base d'amorçage du catalogue personnel bien plus utile que leurs prix : 79 lignes sur trois commandes, dont la majorité reviennent d'une commande à l'autre.
6. **Deux analyseurs assumés** : un pour le texte d'un PDF, qui s'appuie sur l'alignement des colonnes, un tolérant pour l'OCR, qui ne s'y fie pas. Les confondre coûtait 100 % des lignes.
7. **Filtre des données personnelles obligatoire dès l'extraction**, par liste blanche de sortie et non par nettoyage, avec le détecteur comme contrôle automatique. À appliquer aussi à toute image conservée.
8. **Vérifier `source_per` de M7** sur toute entrée portant une marque : le mot exigé doit appartenir au vocabulaire du catalogue visé, sinon la méthode se tait à tort.
9. **Ne pas promettre la lecture d'une photo** avant de l'avoir mesurée sur une vraie photo.

## 6. Impact sur le cahier des charges

| Section | Modification à apporter |
| --- | --- |
| 3 et 4, tickets | Ajouter « importer un ticket PDF » comme voie principale, l'OCR d'une photo devenant le repli pour le papier. Préciser que la validation ligne par ligne reste nécessaire dans les deux cas |
| 5, tableau des sources | Ligne Tickets de caisse : distinguer le ticket dématérialisé (couche de texte, lecture exacte) du ticket papier (OCR, non encore mesuré sur photo réelle) |
| 5, tableau des sources | Ajouter les factures de commande drive comme source de **libellés et de quantités**, avec leurs prix au niveau « estimé » seulement |
| 6, règles métier | Inscrire les deux règles : remise conservée comme ligne à part avec budget sur le total payé, et prix issus du prix unitaire de chaque ligne de facture, frais de livraison exclus du coût d'un repas |
| 6, correspondance | Noter que les libellés de tickets sont **tronqués**, ce qui fait tomber le rapprochement à 67 % d'utilisables contre 86 % sur des libellés complets : prévoir un rapprochement par préfixe ou par trigrammes pour ce cas |
| 8, gestion des erreurs | Ajouter le cas du ticket illisible : proposer la saisie manuelle plutôt qu'un résultat douteux |
| 10, exigences non fonctionnelles | Inscrire que l'OCR tourne en local, qu'aucun document ne sort, et que les champs personnels sont filtrés dès l'extraction |
| 15, hypothèses | Marquer l'hypothèse 7 **partielle** : lecture exacte des tickets dématérialisés, OCR mesuré sur images seulement, critère des 90 % non tranché faute de photo réelle et de ticket Intermarché |

## 7. Résumé de suivi

- Hypothèse 7 **partielle**. Les trois tickets Picard sont dématérialisés et portent une couche de texte : leur lecture sans OCR est exacte, **18 lignes sur 18**, remise et multiplicateur compris, et les totaux se réconcilient au centime. « Importer un ticket PDF » devient donc la voie principale, l'OCR restant pour le papier.
- OCR mesuré sur des **images rendues depuis ces PDF**, donc parfaites : 94 % des lignes à 150 points par pouce sur image nette, mais **6 % avec cinq degrés de rotation** et **0 % avec du bruit**. Rotation et bruit sont les deux ennemis. Avec 18 lignes, ces chiffres donnent un ordre de grandeur, pas une précision, et **ils ne valident pas le critère des 90 % pour une photo**, qui reste à mesurer.
- Les six documents portaient nom, adresse, téléphone et numéro de fidélité, **non masqués**. Le filtre par liste blanche de sortie n'a laissé passer **aucune donnée personnelle sur les six**, y compris sur les factures où le bloc d'adresse du client se trouve à la même hauteur que les premières lignes d'articles.
- Factures drive : trois modèles différents, lus sans OCR, avec quantité et prix unitaire sur 100 % des lignes. Elles datent de 2024, donc leurs prix ne servent que d'estimation de dernier recours, mais leurs **libellés complets avec marque et conditionnement** sont une bonne base pour amorcer le catalogue personnel.
- Rapprochement M7 : 67 % d'utilisables sur les libellés **tronqués** des tickets, 54 % vers les ingrédients HelloFresh et 64 % vers Ciqual sur les libellés complets des factures. Un bug de M7 a été trouvé et corrigé : le mot le plus discriminant d'un libellé de facture est la marque, absente des catalogues, ce qui faisait taire la méthode sur les 79 lignes.
