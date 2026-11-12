# Страница на itch.io

Обновлено: 2026-11-12 (v0.13). Текст страницы, настройки загрузки и чек-лист публикации. При изменении игры — обновлять описание и скриншоты.

## Настройки проекта (Edit game)
| Поле | Значение |
|---|---|
| Title | Hold the Gate (RU: Оплот: Осада) |
| Project URL | `https://<аккаунт>.itch.io/hold-the-gate` |
| Short description | Heroes hold the gate against a goblin horde. You make them unstoppable. |
| Classification | Games |
| Kind of project | HTML (+ загрузка Windows-сборки) |
| Release status | In development |
| Pricing | No payments (или «$0 or donate») |
| Uploads | `hold-the-gate-web.zip` → «This file will be played in the browser»; `hold-the-gate-windows.zip` → Windows |
| Embed options | Embed in page, Manually set size **1280 × 720**, ✓ Fullscreen button, ✓ Automatically start on page load — нет (кнопка «Run game»), ✓ Mobile friendly — **нет** (только мышь+клавиатура, альбом) |
| Frame options | ✓ SharedArrayBuffer не нужен; scrollbars — выключить |
| Genre | Strategy |
| Tags | autobattler, roguelite, tower-defense, castle-defense, pixel-art, fantasy, singleplayer, auto-battler, goblins, heroes (до 10) |
| AI disclosure | Указать, что код/тексты сделаны с помощью ИИ (itch просит раскрывать) |
| Input | Mouse, Keyboard |
| Languages | English, Russian |
| Accessibility | Configurable controls — нет; Interface scaling — да (настройка размера UI) |
| Visibility | Сначала **Draft** → **Restricted** (по ссылке/паролю) для тестеров → **Public** |

Медиа: обложка 630×500 (загружать 1260×1000), 3–5 скриншотов 1920×1080, GIF боя (до ~4 МБ) первым скриншотом.

## Описание (EN)
**Hold the Gate** is a roguelite castle-defense autobattler. A goblin horde marches on your walls wave after wave — 30 waves, from a few dozen raiders to hundreds of goblins, orcs, trolls and bosses, ending with the Horde Overlord. Your heroes fight on their own. Your job is to make them unstoppable.

**How it plays**
- ⚔ **Battle** — heroes hold their posts and fight automatically. Click a hero, then the ground to move them or an enemy to focus it. Cast Fire Rain, Frost Shackles, Blessing and build archer towers.
- 🛒 **Camp between waves** — buy and equip items, merge three copies into a rarer one, forge recipes, issue orders, repair the walls and upgrade the towers.
- 🃏 **Level-ups** — pick 1 of 3 cards. Max out two skills to unlock a hero evolution.
- 🏺 **Events and relics** — cursed banners, blood altars, wandering merchants, relic synergies.
- 🏰 **The Citadel** — gems from every goblin stay after defeat. Spend them on a tree of permanent upgrades: new heroes, spells, walls, economy.

**Heroes** — Bran the Gatewarden (tank), Iva the Archer, Orrin the Pyromancer and Morra the Summoner with her skeleton army.
**Bosses** — the Goblin King, the Battering Ogre, the Necromancer Shaman, the Goblin Warlord, the Siege Forgemaster and the three-phase Horde Overlord, each with telegraphed abilities.
**Five locations** — Forest Road, Winter Pass, Rotten Swamp, Sand Wastes and the Ashen Lands; the fight moves to a new place every 5 waves.

**Controls**: mouse + keyboard. Space — pause, 1/2/3 — speed, Q/W/E/R — spells, F — rally the whole squad, wheel — zoom.
Languages: English and Russian (switch in ⚙ Settings).

🚧 **In development** — balance and content change with every update. Feedback in the comments is very welcome: how far did you get, what felt too hard or too easy?

Pixel art: *Tiny Swords* by Pixel Frog (CC0). Fonts: Kurale, Alegreya (SIL OFL). Music and sound are procedural.

## Описание (RU, для девлога/русских площадок)
**Оплот: Осада** — рогалик-автобаттлер про оборону замка. Гоблинская орда волна за волной идёт на стены — от десятка налётчиков до сотен гоблинов, орков и боссов. Герои дерутся сами, а вы решаете, чем их усилить.

- ⚔ **Бой** — герои держат посты и дерутся сами. Клик по герою, затем по земле — он встанет там, по врагу — атакует его. Магия: огненный дождь, ледяные оковы, благословение, стрелковые вышки.
- 🛒 **Лагерь между волнами** — лавка, слияние трёх одинаковых предметов, рецепты кузницы, приказы, ремонт стен и башни.
- 🃏 **Уровни** — 1 карточка из 3, две прокачанные до конца дают эволюцию героя.
- 🏺 **События и реликвии** с синергиями.
- 🏰 **Цитадель** — алмазы остаются после поражения и открывают новых героев, магию и стены.

Управление: мышь + клавиатура. Языки: русский и английский (⚙ Настройки).

## Чек-лист публикации
1. Собрать: `play.html` → `hold-the-gate-web.zip` (внутри один `index.html`); Windows — папка `release/OplotSiege-win32-x64` → `hold-the-gate-windows.zip`.
2. Создать проект (Draft), загрузить оба архива, обложку, скриншоты, GIF, вставить описание, теги.
3. «View page» → запустить в браузере: меню, бой, лагерь, настройки → язык, полноэкранный режим.
4. Restricted + ссылка 5–10 тестерам → собрать отзывы → правки.
5. Public. Каждое обновление — новая загрузка + девлог (Devlog → «Что нового» из README).
