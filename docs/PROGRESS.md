# Прогресс

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
3. **Пороги защиты квестов** (DEF → 50/70/75% снижения урона) — только на stcentral-hub, лицензия ND (A10). Для Lost City of Gold нет нигде.
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
14. Нет идентификаторов для картинок (slug для playshoptitans.com / stcentral-hub fankit) — сопоставление имён с URL придётся строить отдельно.
15. Названия боссов и саб-локаций — только на stcentral-hub.
