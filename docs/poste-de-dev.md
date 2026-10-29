# Outils durables du poste de développement

Ce que l'application a besoin de trouver sur la machine pour tourner. À
distinguer de `docs/lot-0/installations.md`, qui recense les outils temporaires
des prototypes du lot 0 et qui sera vidé une fois ces prototypes terminés.

Tenu à jour au fil des lots : toute nouvelle installation est ajoutée au
tableau **avant** d'être lancée, avec sa commande de retrait.

Dernière mise à jour : 29 octobre 2026, lot 1, création du squelette et ajout de
la CLI GitHub.

## 1. Ce qu'il faut pour développer

| Outil | Version | Pourquoi | Où | Commande de retrait |
| --- | --- | --- | --- | --- |
| Node.js | 24.19.0, figée dans `.nvmrc` | exécution de l'API et de l'outillage | `C:\Program Files\nodejs` | `winget uninstall --id OpenJS.NodeJS.LTS` |
| pnpm | 12.16.1, figée dans le champ `packageManager` | gestionnaire du monorepo | `C:\Users\marti\AppData\Roaming\npm` | `npm uninstall -g pnpm` |
| Docker Desktop | 4.87.0, moteur 29.7.2, Compose v5.4.0 | PostgreSQL de développement (`docker-compose.yml`) | `C:\Program Files\Docker\Docker` | `winget uninstall --id Docker.DockerDesktop` |
| Chromium de Playwright | build 1248 (Chrome for Testing 156.0.8078.4) | tests de bout en bout et contrôle axe-core | `C:\Users\marti\AppData\Local\ms-playwright\chromium-1248` | voir section 3 |
| Coquille sans tête de Chromium | build 1248 | ce que Playwright lance réellement en mode sans tête | `...\ms-playwright\chromium_headless_shell-1248` | voir section 3 |
| FFmpeg de Playwright | build 1013 | enregistrement vidéo des tests en échec | `...\ms-playwright\ffmpeg-1013` | voir section 3 |
| CLI GitHub (`gh`) | 2.103.3 | ouverture et suivi des pull requests en ligne de commande | `C:\Program Files\GitHub CLI` | `winget uninstall --id GitHub.cli` |

Node.js et Docker Desktop étaient déjà installés avant le lot 1 et n'ont pas
été modifiés. pnpm aussi, par `npm install -g`. Les trois lignes Playwright et
la CLI GitHub ont été installées le 29 octobre 2026 pour ce lot.

**La CLI GitHub n'est pas nécessaire à l'application** : elle ne sert qu'au
travail sur le dépôt, et tout ce qu'elle fait reste possible depuis le
navigateur. Elle garde son propre jeton, hors du dépôt, dans
`C:\Users\marti\AppData\Roaming\GitHub CLI\hosts.yml`. La désinstaller ne le
supprime pas : pour révoquer l'accès, faire `gh auth logout` avant, ou
supprimer le jeton depuis les réglages du compte GitHub.

## 2. Images Docker

| Image | Version | Pourquoi | Retrait |
| --- | --- | --- | --- |
| `postgres` | `18.6-alpine` | base de développement | `docker compose down -v` puis `docker image rm postgres:18.6-alpine` |

`docker compose down -v` supprime aussi le volume `postgres-data`, donc les
données de développement. C'est voulu : rien d'irremplaçable n'y vit, la base se
reconstruit par `pnpm db:migrate`.

**Le conteneur publie sur 5433, pas sur 5432.** Un PostgreSQL 16 natif, installé
avant le projet, tourne en service Windows (`postgresql-x64-16`, démarrage
automatique) et occupe déjà 5432. Il n'appartient pas à ce projet et n'a pas été
touché : ni arrêté, ni désactivé, ni désinstallé.

Le piège est qu'il répond, lui. Une migration lancée vers `localhost:5432`
aboutit sans erreur, dans la mauvaise base, sur une instance d'une autre version
majeure. D'où le décalage à 5433, valeur par défaut dans `docker-compose.yml`
comme dans `.env.example`. Pour vérifier à qui l'on parle :

```powershell
Get-NetTCPConnection -LocalPort 5432, 5433 -State Listen |
  ForEach-Object { "$($_.LocalPort) : $((Get-Process -Id $_.OwningProcess).ProcessName)" }
```

Le conteneur se reconnaît à `com.docker.backend` ou `wslrelay`, le service natif
à `postgres`.

## 3. Navigateurs de Playwright, à ne pas désinstaller en bloc

Le dossier `ms-playwright` contient aussi des navigateurs **antérieurs au
projet**, installés pour d'autres travaux : `chromium-1194` et `-1208`,
`chromium_headless_shell-1194` et `-1208`, `firefox-1495` et `-1509`,
`webkit-2215` et `-2248`, `ffmpeg-1011`, `winldd-1007`.

**Ne jamais lancer `npx playwright uninstall --all`** : la commande efface tout
le dossier, y compris ces versions qui ne nous appartiennent pas. Pour ne retirer
que ce que le lot 1 a ajouté :

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\chromium-1248"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\chromium_headless_shell-1248"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\ms-playwright\ffmpeg-1013"
```

`winldd-1007`, que Playwright 1.64 réclame aussi, était déjà présent : il n'a pas
été réinstallé et ne doit pas être supprimé.

Réinstaller ensuite se fait par `pnpm exec playwright install chromium`, qui
retélécharge exactement les versions attendues par la version de Playwright
figée dans le dépôt.

## 4. Variables d'environnement

Aucune variable d'environnement permanente n'est créée par le projet. Les
variables de l'application vivent dans un `.env` à la racine du dépôt, jamais
commité, dont le modèle est `.env.example`.
