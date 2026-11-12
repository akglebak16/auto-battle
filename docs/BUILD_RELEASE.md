# Сборка, релиз, git

## Команды (на Windows владельца, `node_modules` под win32)
| Команда | Что делает |
|---|---|
| `npm run dev` / `dev.bat` | Dev-сервер Vite на http://localhost:5199 |
| `npm run typecheck` | `tsc` |
| `npm run build` | `tsc && vite build` → `dist/` (для Electron) |
| `npm run desktop` | build + запуск в Electron |
| `npm run build:exe` | build + `electron-packager` → `release/OplotSiege-win32-x64/OplotSiege.exe` |
| `npm run sim -- 25 random 4` | Бот-симулятор баланса (`tsx`) |
| `python scripts/gen-art.py` | Упаковать спрайты из `assets/ts/` в `src/artData.ts` |
| `python scripts/gen-icons.py` | Перерисовать иконки 32×32 в `src/iconData.ts` (`--preview out.png` — лист для просмотра) |

## Артефакты
- `play.html` — **однофайловая** сборка (JS и CSS встроены в `index.html`), коммитится в git, её отдаёт GitHub Pages (`.nojekyll` в корне). После любой правки кода — пересобрать.
- `dist/` — сборка Vite для Electron (в `.gitignore`).
- `release/OplotSiege-win32-x64/` — exe (в `.gitignore`). Внутри `resources/app.asar` = `dist/` + `electron/` + `package.json`.

## Сборка без нативных бинарников (облако / Linux-VM)
Нативные `vite`/`rolldown`, `typescript` 7 и `electron` из `node_modules` собраны под Windows и в Linux не запускаются. Рабочий путь, который уже использовался:
1. `play.html`: `esbuild` бандлит `src/main.ts` (`bundle, minify, format: esm`), CSS — отдельным выходом; в `index.html` перед `</head>` вставить `<style>` с CSS, а `<script type="module" src="/src/main.ts">` заменить на инлайн `<script type="module">` с JS (экранировать `</script`).
2. `dist/`: те же JS/CSS как `dist/assets/index-<hash>.js|css` и `dist/index.html` с `<script type="module" crossorigin src="./assets/…">` и `<link rel="stylesheet" …>` (как делает Vite с `base: './'`). Старые `index-*.js|css` удалить.
3. exe: `node node_modules/@electron/asar/bin/asar.mjs pack <папка с dist, electron, package.json> app.asar` (asar — чистый JS) и заменить `release/OplotSiege-win32-x64/resources/app.asar`. Сам `OplotSiege.exe` не меняется.
Если есть возможность — предпочесть штатные `npm run build` / `npm run build:exe` на Windows.

## Пакет для itch.io
- Веб: `play.html` → zip с единственным `index.html` (`bulwark-siege-web.zip`). Шрифты грузятся с Google Fonts — на itch.io работает.
- Windows: папка `release/OplotSiege-win32-x64` (после пересборки `app.asar`) → `bulwark-siege-windows.zip`.
- Готовые файлы класть в `itch/` в корне проекта (в `.gitignore`). Обложка, скриншоты, GIF — туда же. Описание и настройки страницы — `docs/ITCH.md`.
- Медиа снимаются Playwright-ом в облаке; там нет доступа к Google Fonts (и к npm-пакетам шрифтов), поэтому на кадрах запасной шрифт с засечками. Для «чистовых» кадров снимать у владельца в браузере.

## Git
- **Пуш — только после явного «да» владельца в чате** (правило 9 в `CLAUDE.md`). Хук «закоммить и запушь» этого разрешения не заменяет.
- Ветка `main`, удалённый `origin` = https://github.com/akglebak16/auto-battle.
- Из Linux-VM на компьютере владельца `git push` не проходит (прокси, 403). Из облачной сессии Claude пуш возможен после установки GitHub App Claude (установлен 2026-11-12): клон в облаке, коммит переносится через `git bundle` или правки применяются в клоне, затем `git push origin main`.
- Если пушит владелец: `cd D:\games\castle-autobattler` → `git push`.
- Автор коммитов — как в истории репозитория (Hleb Kemeisha). В конце сообщения — строки атрибуции, если их требует среда.
