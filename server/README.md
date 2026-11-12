# Сервер статистики забегов (Railway)

Игра (`src/telemetry.ts`) после каждого законченного забега шлёт `POST /run` с анонимной записью: версия, сайт (pages/itch/exe), случайный ID игрока, волна, победа, кто убил, % Цитадели, герои и редкость их предметов, реликвии, HP замка по волнам, длительность. IP не сохраняется (только счётчик в памяти против спама). Игрок может выключить отправку в Настройках.

## Развернуть
1. Railway → **New Project → Deploy from GitHub repo** → `akglebak16/auto-battle`.
2. В сервисе: **Settings → Root Directory** = `server`. Start command не нужен (`npm start`).
3. **Volume**: правый клик по сервису → *Attach volume*, mount path `/data`.
4. **Variables**: `DATA_DIR=/data`, `ADMIN_TOKEN=<любой длинный пароль>`.
5. **Settings → Networking → Generate Domain**. Получится `https://<имя>.up.railway.app`.
6. Вписать этот адрес в `TELEMETRY_URL` в `src/telemetry.ts`, пересобрать `play.html` и запушить (и перезалить на itch.io).

## Смотреть
- `https://<имя>.up.railway.app/stats?token=<ADMIN_TOKEN>` — сводка: версия × % Цитадели → забеги, игроки, средняя/медианная волна, победы; последние 30 забегов.
- `/stats?token=…&format=json`, `/runs.csv?token=…` (открывается в Excel/Google Sheets), `/runs.jsonl?token=…`.
- `/` — проверка, что сервер жив.

При каждой правке баланса менять `GAME_VERSION` в `src/telemetry.ts`, чтобы не смешивать версии.
