# Ce que le lot 0 a installé sur la machine

Inventaire de tout ce qui a été installé ou modifié **en dehors du dépôt**, tenu à jour au fil du lot 0. Dernière mise à jour : 29 octobre 2026.

Rien de ce qui est listé ici n'est nécessaire à l'application : ce sont des outils de prototype. Tout peut être retiré sans conséquence sur le dépôt.

## 1. Logiciels installés

| Logiciel | Version | Pourquoi | Où | Taille | Commande de retrait |
| --- | --- | --- | --- | --- | --- |
| Tesseract OCR (UB-Mannheim) | 5.4.0.20240606 | OCR local des tickets, hypothèse 7 | `C:\Program Files\Tesseract-OCR` | 239 Mo | `winget uninstall --id UB-Mannheim.TesseractOCR` |
| ImageMagick | 7.1.2-34 Q16-HDRI | dégradations d'images (flou, rotation, bruit, contraste), hypothèse 7 | `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI` | 62 Mo | `winget uninstall --id ImageMagick.ImageMagick` |
| Poppler | 25.07.0-0 | rendu des PDF en images (`pdftoppm`), hypothèse 7 | `C:\Users\marti\AppData\Local\Microsoft\WinGet\Packages\oschwartz10612.Poppler_*` | 54 Mo | `winget uninstall --id oschwartz10612.Poppler` |

**Installés par `winget`, depuis les paquets officiels, sans élévation de privilèges demandée au-delà de ce que `winget` fait lui-même.** Les trois sont des logiciels libres, et aucun ne communique avec l'extérieur dans l'usage qu'on en fait.

**Attention à un effet de bord de Poppler.** Son installation a ajouté des alias de commande (`pdftoppm`, `pdftotext`, `pdftops`, `pdfunite`, `zstd`) dans le dossier de liens de `winget`, qui est dans le `PATH`. Or `pdftotext` existait déjà, fourni par Git for Windows (`/mingw64/bin`). Selon l'ordre du `PATH`, c'est désormais peut-être la version de Poppler qui répond. Les deux font la même chose, mais si un outil tiers dépendait de la version de Git, c'est le seul point à surveiller.

## 2. Fichiers ajoutés hors du dépôt

| Fichiers | Pourquoi | Où | Taille | Comment retirer |
| --- | --- | --- | --- | --- |
| `fra.traineddata` | modèle français de Tesseract, absent du paquet qui ne fournit que l'anglais | `C:\Users\marti\AppData\Local\tessdata\` | 14 Mo (28 Mo avec les copies ci-dessous) | supprimer le dossier `tessdata` |
| Copies de `eng.traineddata` et `osd.traineddata` | pour que le dossier ci-dessus soit utilisable seul, sans écrire dans `Program Files` | même dossier | 15 Mo | idem, ce sont des copies, les originaux restent dans `Program Files` |
| Navigateur Chromium de Playwright | essai du navigateur réel pour Intermarché, hypothèse 2, depuis abandonné | `...\AppData\Local\ms-playwright\chromium-1148` | 315 Mo | supprimer ce dossier précis |
| Coquille sans tête de Chromium | installée avec le précédent | `...\ms-playwright\chromium_headless_shell-1148` | 193 Mo | supprimer ce dossier précis |
| `ffmpeg-1010` | installé avec Playwright | `...\ms-playwright\ffmpeg-1010` | quelques Mo | supprimer ce dossier précis |

**Le modèle français est dans `AppData` et non dans `Program Files`** parce que l'écriture dans `Program Files` demandait les droits administrateur, que je n'ai pas pris. Il s'utilise en passant `TESSDATA_PREFIX` à la commande, sans rien installer de plus.

**Les trois dossiers Playwright en `-1148` sont les seuls à supprimer**, et seulement eux : le dossier `ms-playwright` contenait déjà d'autres versions antérieures au lot 0 (voir section 4). Ne pas lancer `npx playwright uninstall --all`, qui effacerait aussi celles-là.

**Cache npm.** Les prototypes ont téléchargé `tsx`, `typescript` et `@types/node` dans le cache npm (`C:\Users\marti\AppData\Local\npm-cache`). C'est le fonctionnement normal de npm, partagé avec tous tes autres projets : il n'y a rien à retirer, et `npm cache clean --force` le viderait entièrement si tu y tenais.

**Dossiers temporaires de la session.** Les fichiers intermédiaires que j'ai écrits en dehors du dépôt sont dans `C:\Users\marti\AppData\Local\Temp\claude\`, effacés avec le reste du dossier temporaire.

## 3. Variables d'environnement

**Aucune variable d'environnement n'a été créée ni modifiée de façon permanente.** Vérifié : les variables utilisateur sont exactement celles d'avant le lot 0 (`ChocolateyLastPathUpdate`, `JAVA_HOME`, `NODE_PATH`, `OneDrive`, les cinq `OPENSSL_*`, `Path`, `TEMP`, `TMP`), et `TESSDATA_PREFIX` n'existe ni au niveau utilisateur ni au niveau machine.

Les scripts et mes commandes passent les chemins au coup par coup, dans le `PATH` de la commande seulement :

```bash
export PATH="$PATH:/c/Program Files/Tesseract-OCR:/c/Program Files/ImageMagick-7.1.2-Q16-HDRI:\
/c/Users/marti/AppData/Local/Microsoft/WinGet/Packages/oschwartz10612.Poppler_*/poppler-25.07.0/Library/bin"
export TESSDATA_PREFIX="C:/Users/marti/AppData/Local/tessdata"
```

Seuls les installateurs ont touché au `PATH` système, chacun pour son propre dossier, ce que leur désinstallation défait.

## 4. Ce qui était déjà présent avant le lot 0

**À ne pas toucher.** Rien de cette liste n'a été installé, mis à jour ni modifié par le lot 0.

| Déjà présent | Version ou détail |
| --- | --- |
| Node.js et npm | 24.19.0 et 11.11.1 |
| Git for Windows, avec son `mingw64/bin` | fournit déjà `pdftotext`, `curl`, `python` |
| Navigateurs Playwright antérieurs | `chromium-1194` et `-1208`, `chromium_headless_shell-1194` et `-1208`, `firefox-1495` et `-1509`, `webkit-2215` et `-2248`, `ffmpeg-1011`, `winldd-1007` |
| Chocolatey | présent, non utilisé par le lot 0 |
| Java, OpenSSL | variables d'environnement présentes, non utilisées |
| `convert.exe` de Windows | l'utilitaire système de conversion de disque, à ne pas confondre avec celui d'ImageMagick : c'est pour ça que les scripts appellent `magick` et jamais `convert` |

## 5. Tout retirer, dans l'ordre

```powershell
winget uninstall --id UB-Mannheim.TesseractOCR
winget uninstall --id ImageMagick.ImageMagick
winget uninstall --id oschwartz10612.Poppler
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\tessdata"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\chromium-1148"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\chromium_headless_shell-1148"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\ffmpeg-1010"
```

Soit environ 890 Mo récupérés, mesurés dossier par dossier. Le dépôt n'est pas concerné : ses `node_modules` et ses `data/` se suppriment séparément et sont déjà hors de Git.

## 6. Ce que je ferai pour la suite

Toute nouvelle installation est ajoutée à ce tableau **avant** d'être utilisée, avec sa commande de retrait. Et je demande ton accord avant d'installer quoi que ce soit qui ne figure pas déjà dans un plan que tu as validé.
