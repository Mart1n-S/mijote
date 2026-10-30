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
| SkillSpector | commit `abd82935b67f765a9541013c0866c6349251dcdf` (étiquette v2.13.2) | scanner tout skill ou agent externe avant installation | `C:\Users\marti\AppData\Local\skillspector-venv` | `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\skillspector-venv"` |

Node.js et Docker Desktop étaient déjà installés avant le lot 1 et n'ont pas
été modifiés. pnpm aussi, par `npm install -g`. Les trois lignes Playwright et
la CLI GitHub ont été installées le 29 octobre 2026 pour ce lot.

**La CLI GitHub n'est pas nécessaire à l'application** : elle ne sert qu'au
travail sur le dépôt, et tout ce qu'elle fait reste possible depuis le
navigateur. Son jeton est rangé dans le gestionnaire d'identifiants de Windows,
hors du dépôt et hors de ses fichiers de configuration : `hosts.yml` ne contient
que le nom d'hôte, l'utilisateur et le mode de stockage, pas le jeton
(`gh auth status` indique alors `keyring`). Désinstaller la CLI ne le révoque
pas : faire `gh auth logout` avant, ou supprimer le jeton depuis les réglages du
compte GitHub.

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

Le piège est qu'il répond, lui. Une commande visant `localhost:5432` s'adresse
donc à cette instance et non au conteneur, alors que tout semble en place. Le
29 octobre 2026, `pnpm db:migrate` a ainsi échoué sur une erreur
d'authentification : le compte attendu n'existe pas sur l'instance native. Le
risque est qu'avec des identifiants qui passent, la même commande réussisse et
écrive dans la mauvaise base, sur une version majeure différente, sans rien
signaler. D'où le décalage à 5433, valeur par défaut dans `docker-compose.yml`
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

## 4. SkillSpector, installation et usage

Installé dans un environnement virtuel Python dédié, hors du dépôt, pour ne pas
toucher au Python global du poste et pour éviter d'installer `uv`, absent de la
machine. Le paquet exige Python `>=3.12,<3.15` et le poste a 3.12.1.

Le commit est figé, et non l'étiquette, pour la raison donnée dans l'ADR 0003.

```powershell
python -m venv "$env:LOCALAPPDATA\skillspector-venv"
& "$env:LOCALAPPDATA\skillspector-venv\Scripts\pip.exe" install `
  "skillspector @ git+https://github.com/NVIDIA/SkillSpector.git@abd82935b67f765a9541013c0866c6349251dcdf"
```

Usage, toujours en `--no-llm` pour qu'aucun contenu de skill ne parte vers un
service d'inférence :

```powershell
& "$env:LOCALAPPDATA\skillspector-venv\Scripts\skillspector.exe" scan <dossier> --no-llm
```

### Deux limites mesurées le 30 octobre 2026, en v2.13.2

**`--no-llm` ne supprime pas tout appel réseau.** L'option coupe l'étape
d'analyse par modèle de langage, mais pas la requête vers OSV.dev : celle-ci
appartient à l'analyse statique, contrôle SC4. Dans le paquet installé,
`static_patterns_supply_chain.py` importe `osv_client.py`, qui appelle
`https://api.osv.dev/v1/querybatch`. Aucune option ni variable
d'environnement ne la désactive : la seule disponible est
`SKILLSPECTOR_OSV_TIMEOUT`, et l'outil se replie sur une liste statique quand
l'API est injoignable. Ce qui part est une liste de noms de dépendances, pas le
contenu des fichiers scannés. Pour zéro trafic sortant, il faut bloquer au
niveau du réseau et accepter le repli.

**`--output` ne fonctionne pas sous Windows.** La commande échoue avec « Safe
file output is unsupported on this platform », code de sortie 2, et aucun
fichier n'est écrit. L'outil indique lui-même le contournement, vérifié :
omettre `--output` et rediriger la sortie standard.

```powershell
& "$env:LOCALAPPDATA\skillspector-venv\Scripts\skillspector.exe" `
  scan <dossier> --no-llm --format json > rapport.json
```

**L'installation tire un gros arbre de dépendances**, dont `openai`,
`anthropic`, `langchain` et `boto3`, qui servent à l'analyse par modèle de
langage. En `--no-llm` ils ne sont pas sollicités, mais ils sont présents dans
l'environnement virtuel.

Premier scan de contrôle, sur `.claude/agents/code-reviewer.md` : score 0,
sévérité `LOW`, recommandation `SAFE`, aucun constat, couverture 100 %.

## 5. Variables d'environnement

Aucune variable d'environnement permanente n'est créée par le projet. Les
variables de l'application vivent dans un `.env` à la racine du dépôt, jamais
commité, dont le modèle est `.env.example`.
