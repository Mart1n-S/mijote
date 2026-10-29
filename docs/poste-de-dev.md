# Outils durables du poste de développement

Ce que l'application a besoin de trouver sur la machine pour tourner. À
distinguer de `docs/lot-0/installations.md`, qui recense les outils temporaires
des prototypes du lot 0 et qui sera vidé une fois ces prototypes terminés.

Tenu à jour au fil des lots : toute nouvelle installation est ajoutée au
tableau **avant** d'être lancée, avec sa commande de retrait.

Dernière mise à jour : 29 octobre 2026, lot 1, création du squelette.

## 1. Ce qu'il faut pour développer

| Outil | Version | Pourquoi | Où | Commande de retrait |
| --- | --- | --- | --- | --- |
| Node.js | 24.19.0, figée dans `.nvmrc` | exécution de l'API et de l'outillage | `C:\Program Files\nodejs` | `winget uninstall --id OpenJS.NodeJS.LTS` |
| pnpm | 12.16.1, figée dans le champ `packageManager` | gestionnaire du monorepo | `C:\Users\marti\AppData\Roaming\npm` | `npm uninstall -g pnpm` |
| Docker Desktop | 4.87.0, moteur 29.7.2, Compose v5.4.0 | PostgreSQL de développement (`docker-compose.yml`) | `C:\Program Files\Docker\Docker` | `winget uninstall --id Docker.DockerDesktop` |
| Chromium de Playwright | build 1248 (Chrome for Testing 156.0.8078.4) | tests de bout en bout et contrôle axe-core | `C:\Users\marti\AppData\Local\ms-playwright\chromium-1248` | voir section 3 |
| Coquille sans tête de Chromium | build 1248 | ce que Playwright lance réellement en mode sans tête | `...\ms-playwright\chromium_headless_shell-1248` | voir section 3 |
| FFmpeg de Playwright | build 1013 | enregistrement vidéo des tests en échec | `...\ms-playwright\ffmpeg-1013` | voir section 3 |

Node.js et Docker Desktop étaient déjà installés avant le lot 1 et n'ont pas
été modifiés. pnpm aussi, par `npm install -g`. Les trois lignes Playwright ont
été installées le 29 octobre 2026 pour ce lot.

## 2. Images Docker

| Image | Version | Pourquoi | Retrait |
| --- | --- | --- | --- |
| `postgres` | `18.6-alpine` | base de développement | `docker compose down -v` puis `docker image rm postgres:18.6-alpine` |

`docker compose down -v` supprime aussi le volume `postgres-data`, donc les
données de développement. C'est voulu : rien d'irremplaçable n'y vit, la base se
reconstruit par `pnpm db:migrate`.

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
