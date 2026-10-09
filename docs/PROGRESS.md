# Прогресс

## Сессия 2 — 2026-10-09: модель данных, парсеры, синхронизация, картинки

### Сделано
- **`src/data/types.ts`** — zod-схемы, из них выведены типы (`Item`, `Enchant`, `HeroClass`, `Skill`/`SkillEffect`, `Champion`, `Quest`/`QuestArea`, `HeroLevel`, `AccountSlot`, `GameData`, `Reject`). Ими же проверяется каждая сущность при сборке и кэш при чтении.
- **Парсеры листов** (`src/data/parse/`). Табличные (BLUEPRINTS, ENCHANTMENTS, SKILLS, HERO LEVELS) проверяют подписи заголовка. Карточные — каждый в своём файле, разбор по текстовым подписям, а не по номерам строк: `heroes.ts` (якорь `Prerequisite`, 14 подписей карточки), `champions.ts` (+ таблица Element Breakpoints), `quests.ts` (якорь `Maximum Party Size`, колонки сложностей по именам из заголовка), `questLevels.ts` (`Level | Reward`), `slots.ts` (`HERO SLOTS`…). Тест на фикстуре у каждого, включая «лишняя строка сверху» и «переставленные колонки».
- **`src/data/build.ts`**: сырые листы → `GameData`. Структура сломана или сущностей слишком мало → `SchemaError` (кэш не трогаем). Отдельная строка не разобралась → `rejects` (лист, строка, ключ, причина) — видно в UI. Несостыковки между листами → `warnings`. Связи: промоушены, врождённые навыки и ступень за Душу Титана, группы `All Fighters`… раскрыты в классы, лидерские навыки чемпионов, духи → навык и «+»-версия, артефакты → навык, статы по качествам (`src/engine/quality.ts` + `constants.ts`).
- **Парсер эффектов навыков** (`parse/skillEffects.ts`): whitelist-грамматика. Вся фикстура SKILLS: 970 эффектов, 260 клауз распознаны как небоевые/особые механики, **0 нераспознанных**. Навыки на оружие (X Master, Warlord, Marksman, Adept, Shield Master, «Defense with …», «stats with Ring») — условие `itemType`; список оружия берётся из текста самого навыка, в ASSUMPTIONS дописывать не пришлось.
- **Загрузка листа с обходом смены gid** (`fetchSheetResolved`): export → gid заново через `/htmlview` → gviz по имени, с предупреждением в статусе (A18).
- **Пороги защиты** (`src/data/breakpoints.ts`) — только в рантайме по решению владельца (A10): кэш в IndexedDB, источник со ссылкой в UI, режим «без порогов», если сайт недоступен. В браузере проверено: CORS работает, 112/138 квестов получили пороги.
- **`src/data/sync.ts`**: `loadGameData` (IndexedDB → `snapshot.json`), `ensureFresh(ttlHours)` (все листы → сборка → `GameDataSchema` → одна запись в IndexedDB; при любой ошибке кэш прежний), `diff`, статус для UI (`subscribeStatus`), пороги (`syncBreakpoints`, `questsWithCaps`).
- **`scripts/build-snapshot.ts`** → `src/data/snapshot.json` (1,9 МБ / 145 КБ gzip, отдельный чанк). Запускается в `npm run build`; если таблица недоступна — из фикстур с предупреждением. Перед `dev`/`test`/`typecheck` создаётся из фикстур, если файла нет (в git не кладём).
- **Картинки**: `scripts/build-image-map.ts` → `src/data/imageMap.json` (только id, без файлов), см. SCHEMA → «Внешние id». Компонент `src/ui/GameIcon.tsx` (`kind="item|spirit|element|type|skill|class"`, `loading="lazy"`, заглушка с буквой при ошибке). Покрытие: **предметы 1549/1549 (100%)**, духи 40/40, типы 40/40, классы 42/42, навыки 463/621. В браузере все проверенные URL отдали 200.
- **UI**: хеш-роутинг (для GitHub Pages), шапка, страница «Данные» (источник, дата, ошибки/предупреждения, кнопка «Обновить данные сейчас», настройка TTL, пороги с атрибуцией, отказы, несостыковки, нераспознанные эффекты, примеры иконок), баннер «Данные обновлены: +N предметов, изменено M». В README — отметка о правах Kabam.
- Исправлена ошибка ESLint в `ThemeToggle.tsx` (ленивая инициализация `useState` вместо setState в эффекте). В tsconfig включены `erasableSyntaxOnly` (ловит синтаксис, который не запустится в `node scripts/*.ts`, A11) и `resolveJsonModule`.
- Исправлена ошибка в SCHEMA: классов 42, а не 46.

### Проверка
- `npm test`: 12 файлов, 94 теста — все проходят. `npm run typecheck` — чисто. `npm run lint` — 0 ошибок (2 предупреждения в шаблонных `button.tsx`, `root-provider.tsx`). `npm run build` проходит.
- В Chromium на собранном `dist/`: снапшот → «Обновить сейчас» → все 10 листов загружены из браузера за ~1,7 с, кэш записан; после перезагрузки источник — «кэш браузера». Пороги загружены, все 42 картинки на странице ответили 200.

### Предметы без картинки
Нет — у всех 1549 предметов есть id (тест требует ≥95%).

### Дальше (сессия 3)
1. Сверка с экспортом героев (`fixtures/heroes.txt` — **файла пока нет, нужно его добавить**): множители качества (A7), прирост статов по уровню (A8), `ELEMENT_AFFINITY_MULTIPLIER` (A6), `SPIRIT_AFFINITY_MULTIPLIER` и правило «+» (A5), какой Midas' Tragedy у какого предмета (A15).
2. Формулы боя и барьера (Combat Compendium), трактовка pct у EVA/CRIT/CritDmg (A16), модель особых механик из `skill.ignored`.
3. Сборку GameData при `ensureFresh` перенести в Web Worker (сейчас она идёт в основном потоке; на ПК это доли секунды).
4. Удалить шаблонные демо-страницы (`src/routes/demo/*`, `about`, `src/components/Header.tsx` и др.).

### Известные проблемы
- Путь «gid сменился → htmlview» в браузере не срабатывал по-настоящему (gid не менялись); CORS у htmlview проверен только curl. Покрыт тестами с подменённым fetch.
- Предупреждение Vite о чанках > 500 КБ: снапшот (отдельный ленивый чанк) и основной бандл с devtools из шаблона.
- `SKILLS.Classes` упоминает Aang и Sokka, которых нет в CHAMPIONS (2 предупреждения на странице «Данные»).
- 158 навыков без иконки (аурасонги, часть стат-навыков) — в UI заглушка.
- `ensureFresh` при недоступной сети ждёт повторы `fetchSheet` (~6 с), прежде чем показать ошибку.

## Сессия 1 — 2026-10-09: каркас, источник данных, схема

### Сделано
- Проект: в репозитории уже была заготовка TanStack Router (Vite 8 + React 19 + TS strict + Tailwind/shadcn), её оставил. Добавил PapaParse, idb-keyval, Comlink; dev: Vitest, ESLint (flat config, typescript-eslint, react-hooks; запрет React/DOM-импортов в `src/engine/`). `base: './'` в `vite.config.ts`.
- Структура: `src/data/`, `src/engine/`, `src/worker/`, `src/ui/` (пока пустые, кроме data), `scripts/`, `docs/`, `fixtures/sheets/`.
- **CORS проверен из браузера** (A1): export-CSV, gviz-CSV и gviz-JSONP проходят. Выбран `export?format=csv&gid=`, потому что gviz теряет данные.
- `src/data/fetchSheet.ts`: лист → `string[][]`, таймаут на попытку (15 с), 2 повтора с паузой, отмена через `AbortSignal`, детект HTML вместо CSV, ошибка `SheetFetchError` по-русски. 9 тестов (`npm test`).
- `scripts/dump-sheets.ts` → `fixtures/sheets/*.csv` (флаг `--gviz` дополнительно сохраняет gviz-версии для сравнения). `scripts/inspect-sheet.ts` — сводка по колонкам.
- `docs/SCHEMA.md` — все 10 листов; `docs/ASSUMPTIONS.md` — A1–A14.

### Команды
`npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run dump-sheets [-- --gviz]` · `npm run inspect-sheet -- QUESTS 3`

### Дальше (сессия 2)
1. `src/data/parse/*`: парсеры листов → типизированная модель (`Item`, `HeroClass`, `Quest`, `Skill`, `Enchantment`, `Champion`), включая блочные листы HEROES/QUESTS/CHAMPIONS. Валидация схемы: проверка якорных подписей, ошибка «структура изменилась». Тесты на фикстурах.
2. Парсер эффектов навыков (whitelist шаблонов, лог нераспознанных).
3. Кэш в IndexedDB + `snapshot.json` при сборке; diff «+N предметов, изменено M».
4. Решить вопросы из «Чего не хватает» — прежде всего формулы боя, качество и пороги DEF. Без них движок не написать.

### Известные проблемы
- Из шаблона остались демо-страницы (`src/routes/demo/*`, `src/components/*`) и `index.html` с заголовком «TanStack Start Starter». Удалить, когда начнём UI.
- `npm run lint`: одна ошибка в шаблонном `src/components/ThemeToggle.tsx` (setState в эффекте). UI не трогал.
- В `fixtures/sheets/gviz/` лежат gviz-версии — только для сравнения, тесты на них не опираются.
- `npm install` предупреждает, что заблокирован postinstall `esbuild`. Сейчас ничего не ломает: Vite 8 работает на Rolldown.
- gid листов захардкожены. Если автор таблицы пересоздаст лист, gid изменится → нужен fallback на gviz по имени (A1) или автообнаружение gid через `/htmlview`.

## Чего не хватает в таблице

Критично для движка:
1. **Множители качества** (Normal/Superior/Flawless/Epic/Legendary) для статов предметов, а также для камней и духов (A7).
2. **Прирост статов героя по уровням.** HERO LEVELS содержит только XP и максимальный тир, HEROES — одно значение на класс (A8).
3. **Пороги защиты квестов** (DEF → 50/70/75% снижения урона) — только на stcentral-hub, лицензия ND (A10). Для Lost City of Gold нет нигде. *Сессия 2: загружаются в рантайме.*
4. **Формулы боя:** урон героя по монстру, снижение урона от DEF между порогами, вероятность и частота AoE, выбор цели по Threat, работа EVA/CRIT/Mana Shield, лимит раундов, условие провала.
5. **Механика стихийного барьера:** порог или пропорция, как суммируется стихия отряда, вклад чемпиона и стихии героя, «Any» у Spellblade (A9).
6. **Эффект Elemental Affinity** и условие навыка духа «+» (A5, A6).
7. **Как статы зачарования складываются со статами предмета** (полностью ли, масштабируются ли качеством камня или предмета).
8. Боевые апгрейды предмета — Starforged (`+25% Base ATK, DEF and HP`, `DEF +20`) и Transcendence (`ATK +2`, `+10% Base …`). Данные есть, но нужно знать, какие апгрейды у конкретного предмета пользователя → это поля инвентаря, а не таблицы.

Менее критично:
9. Типы `Dual Wield`, `Familiar`, `Aurasong` не встречаются ни в одном слоте классов. Возможно, это экипировка чемпионов или особые правила.
10. `Built-In Spirit = Mundra's Spirit` — такого духа нет в ENCHANTMENTS и SKILLS.
11. Чемпионы `Aang`, `Sokka` есть в SKILLS (`Classes`), но отсутствуют в CHAMPIONS.
12. Нет заголовков у колонок-иконок (ресурсы в BLUEPRINTS, стихии в ENCHANTMENTS, колонка 4 в SKILLS) — восстановлены выводом (A2, A3, A12).
13. Нет ID линеек навыков. Линейка определяется по соседним строкам и росту Tier.
14. Нет идентификаторов для картинок (slug для playshoptitans.com / stcentral-hub fankit) — *решено в сессии 2: `imageMap.json`, см. SCHEMA → «Внешние id».*
15. Названия боссов и саб-локаций — только на stcentral-hub.
