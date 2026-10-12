/**
 * Все магические числа движка. У каждого — источник; неподтверждённые помечены `// ASSUMPTION: A<n>`
 * и описаны в docs/ASSUMPTIONS.md. Сверка с экспортом героев — src/engine/stats.fixture.test.ts.
 *
 * Где что подгонять:
 *   · числа (коэффициенты, пороги, шаги, бюджеты) — этот файл;
 *   · сами формулы (кривая DEF, уклонение, крит врага, суммирование %, рост базы, эскалация…) — formulas.ts;
 *   · параметры, которые крутит калибровка по отметкам «проходит / не проходит», — CombatModel (combat.ts)
 *     и StatModel (stats.ts); значения по умолчанию у обоих берутся отсюда.
 * Разделы: статы предметов и героя → бой → оптимизатор → ограничения подбора → веса статов и семена →
 * навыки и кубики → план ролла → правила состава отряда и ростера → план команд.
 */

/**
 * Множители статов предмета по качеству (к ATK/DEF/HP строки Normal).
 * В таблице отсутствуют. Legendary ×3 и Flawless ×1.5 подтверждены примером Combat Compendium
 * (Wand of Midas 410 → 1230, Tarot Deck 530 → 795); Superior ×1.25 — сверкой пары Geomancer 26 (DEF 276,4 / 277).
 * Epic ×2 в фикстуре встречается (Беовульф, Айнгар, Брю, Хуан), отдельно не выделен.
 */
// ASSUMPTION: A7
export const QUALITY_MULTIPLIERS = {
  Normal: 1,
  Superior: 1.25,
  Flawless: 1.5,
  Epic: 2,
  Legendary: 3,
} as const

/**
 * Какие статы масштабируются качеством. EVA/CRIT — нет, Mana Shield — неизвестно, считаем что да
 * (это «запас HP», логично масштабировать вместе с HP).
 */
// ASSUMPTION: A7
export const QUALITY_SCALED_STATS = ['atk', 'def', 'hp', 'manaShield'] as const

/** Округление статов после множителя качества. */
// ASSUMPTION: A7 — игра показывает целые; способ округления (round/floor) не подтверждён.
export const QUALITY_ROUNDING: 'round' | 'floor' = 'round'

/**
 * Рост базовых ATK/DEF/HP героя с уровнем (A8):
 *   база(L) = база₁ · (1 + k·x + d·x²) + c·x,   x = L − 1,
 * `база₁` — статы класса из HEROES, `k` и `c` — свои на группу класса (Fighter/Rogue/Spellcaster),
 * `d` — один на стат. Прироста по уровням нет ни в HEROES, ни в HERO LEVELS: у игры своя ступенчатая
 * таблица на класс (см. A8, сверка с fixtures/stcalc-levelstats.json).
 *
 * Форма выбрана по leave-one-out, коэффициенты — МНК по относительной ошибке итогового стата сразу по обеим
 * фикстурам (fixtures/heroes.txt — 18 героев, 23–33 ур.; fixtures/heroes-2026-10-12.txt — 19 героев, 31–37 ур.).
 * Итог: RMS ATK 1,5/1,7%, DEF 1,7/1,6%, HP 5,5/7,3% (старый/новый набор) — было 2,2/3,8%, 2,1/3,3%, 9,1/11,4%.
 */
// ASSUMPTION: A8
export const HERO_LEVEL_STAT_GROWTH = {
  atk: {
    k: { Fighter: -0.0835, Rogue: -0.2336, Spellcaster: -0.1087 },
    c: { Fighter: 6.6138, Rogue: 9.7244, Spellcaster: 9.317 },
    d: 0.013,
  },
  def: {
    k: { Fighter: -0.0664, Rogue: -0.2716, Spellcaster: 0.022 },
    c: { Fighter: 7.4189, Rogue: 9.1805, Spellcaster: 4.5767 },
    d: 0.0113,
  },
  hp: {
    k: { Fighter: 0.0748, Rogue: -0.143, Spellcaster: -0.0654 },
    c: { Fighter: 0.1714, Rogue: 5.0211, Spellcaster: 3.2589 },
    d: 0.0041,
  },
} as const

/**
 * Бонус сродства (Elemental Affinity): во сколько раз усиливаются статы зачарования в предмете
 * с подходящим сродством (что именно — AFFINITY_SCOPE). Сверкой различим слабо: ATK лучше с бонусом, HP — без (A6).
 */
// ASSUMPTION: A6
export const ELEMENT_AFFINITY_MULTIPLIER = 1.5

/**
 * Бонус сродства духа (Spirit Affinity): во сколько раз усиливаются статы духа в предмете с подходящим сродством.
 * Сам навык «+» включается правилом SPIRIT_PLUS_RULE. В фикстуре нет ни одного духа в предмете своего сродства — не проверено.
 */
// ASSUMPTION: A5
export const SPIRIT_AFFINITY_MULTIPLIER = 1.5

/**
 * Когда у духа действует «+»-версия навыка:
 * 'affinity' — дух вставлен в предмет, у которого Spirit Affinity = имя навыка духа.
 */
// ASSUMPTION: A5
export const SPIRIT_PLUS_RULE: 'affinity' | 'never' = 'affinity'

/**
 * Камни Gold (Luxurious/Opulent/Platinum) засчитываются в стихию героя любой стихии.
 * В fixtures/heroes.txt камней Gold нет — не проверено.
 */
// ASSUMPTION: A21
export const GOLD_ELEMENT_COUNTS_FOR_ANY_HERO = true

/** Сундуки Lost City of Gold: их предметы усиливает навык Midas' Tragedy. Источник: playshoptitans.com, chest = goldcity1–3. */
// ASSUMPTION: A23
export const LCOG_CHESTS = ['Luxurious Chest', 'Opulent Chest', 'Platinum Chest'] as const

/**
 * Бонус сродства стихии усиливает: 'stone' — только статы камня, 'enchant' — камень и дух в этом предмете,
 * 'all' — ещё и сам предмет. Сверка (RMS ATK/DEF): stone 2,8/2,1%, enchant 2,2/2,1%, all ×1.5 — 5,1/5,4%.
 */
// ASSUMPTION: A6
export const AFFINITY_SCOPE: 'stone' | 'enchant' | 'all' = 'enchant'

/**
 * Предметы, удваивающие навык духа, вставленного в них. Выведено сверкой (A27): у 7 героев из фикстуры
 * с Portable Totem Pole игра показывает ровно двойной вклад навыка духа в этом слоте
 * (+5/+10% ATK у 5 героев — колонка 18 экспорта; +1/+2% EVA у Джорена и Рейнелла; +10% CritDmg у Джорди).
 */
// ASSUMPTION: A27
export const SPIRIT_SKILL_DOUBLING_ITEMS = ['Portable Totem Pole'] as const

/**
 * Какие статы предмета усиливают навыки «+N% stats with <тип>» и «+N% bonus from all items with <тип>»
 * (Monk/Ring, Sorcerer/Spell, Druid/Herbal Medicine). Бонус без условия типа (Extended Warranty) — всегда ко всем.
 * Сверка: с DEF база DEF у Monk 23 выходит −35, у Sorcerer 26 — 43; без DEF — 194 и 232, в ряд с остальными.
 * HP оставлен: без него база HP Druid 23 вдвое выше, чем у Druid 24.
 */
// ASSUMPTION: A25
export const TYPED_ITEM_BONUS_STATS: readonly ('atk' | 'def' | 'hp')[] = ['atk', 'hp']

/**
 * Исключение из A25 для колчана: «+30% bonus from all items with Bow» (навык `Quiver Bow Bonus`,
 * единственная строка SKILLS без типа — A19, поэтому в данных у неё `Type = 'Other'`) усиливает
 * и HP/DEF лука. Так сказано в данных владельца (changelog stcalc.com); сам changelog публично
 * недоступен (`/changelog` → 404, SPA), в вики и на stcentral такого уточнения нет — статус A72.
 * Проверка «колчан работает только с дальним оружием» — не наша логика, а условие из таблицы:
 * у навыка `condition.itemType = ['Bow']`, поэтому к мечу, посоху и т. п. бонус не применяется вовсе
 * (`stats.ts → appliesToItem`). Реализация: `stats.ts → calcStats` (эффекты навыков типа `Other`).
 */
// ASSUMPTION: A25 (дополнение), A72
export const QUIVER_BOW_BONUS_STATS: readonly ('atk' | 'def' | 'hp')[] = ['atk', 'def', 'hp']

/**
 * Навыки духов, которые НЕ складываются, если духов с таким навыком несколько.
 * Источник: вики сообщества по Titan Spirit (https://shop-titans.fandom.com/wiki/Titan_Spirit):
 * «Titan Solemnity: +15% Health, +15% Mana Shield … Does not stack with other Titan Spirits».
 * Значит, несколько Titan Spirit дают эффект один раз, а не суммой. Остальные духи складываются (A5),
 * а плоские статы самих духов (ATK/DEF/HP предмета) суммируются как у любых предметов.
 */
// ASSUMPTION: A5 (дополнение), A72
export const NON_STACKING_SPIRIT_SKILLS: readonly string[] = ['Titan Solemnity']

/**
 * Навыки духов, доступные только «титаническим» (промоутнутым) классам. Там же: у Titan Solemnity
 * пометка «Exclusive to Titan classes» — значит, у базового класса дух даёт только плоские статы
 * предмета (ATK 164 / DEF 109 / HP 33), а +15% HP/мана-щита не работают. Промоушен в модели — это
 * `HeroClass.baseClass != null` у действующего класса (то есть уже промоушен или Душа Титана, A47).
 */
// ASSUMPTION: A72
export const TITAN_ONLY_SPIRIT_SKILLS: readonly string[] = ['Titan Solemnity']

/**
 * Бонус стихии от Elemental Affinity предмета (A29, пересмотрено в сессии 31).
 * Камень в предмете, чьё сродство включает его стихию («All» — любую), даёт +10 стихии,
 * если величина камня ≥ AFFINITY_ELEMENT_MIN_STONE_VALUE (25 = T12 и выше).
 * У камней T9 (15) прибавки нет: 10 таких слотов в двух фикстурах дают ровно ноль.
 * Бонус входит и в `elementAny` — навык Geomancer «+1% Attack per point in any Element» его считает
 * (сверка: ошибка ATK Вестии 36 и Логарсона 37 падает с −10,9% до +0,5/−1,4%).
 * Не объяснено одно наблюдение: Селена в обеих фикстурах имеет +5 сверх камней — её CM-73 Jetboots
 * со сродством «All» и камнем T9 (15). Под это правило не подгонялось.
 */
// ASSUMPTION: A29
export const AFFINITY_ELEMENT_BONUS = 10
/** Величина камня, с которой действует бонус сродства (25 — T12; у T9 камня величина 15). */
// ASSUMPTION: A29
export const AFFINITY_ELEMENT_MIN_STONE_VALUE = 25

// ─────────────────────────── Бой (симулятор) ───────────────────────────
// Формулы — ST-Central Combat Compendium (https://st-central.net/combat-compendium/), см. A30.

/** Максимальный множитель урона врага при DEF = 0 (Compendium: «Maximum DMG = Enemy DMG × 1.5»). */
export const ENEMY_DMG_MAX_FACTOR = 1.5
/**
 * Шанс крита врага: 10% (Compendium: «Chance to crit = 10%~»).
 * Уточнение по датасету stcalc (https://stcalc.com/data/quests.json, разобрано в сессии 32): `critChance`=10
 * и `critDmg`=150 в 240 парах «квест × сложность» из 244, `critChance`=15 — ровно в 4 парах, и это все
 * сложности «Tomb of Titans» (Гробница Титанов; в датасете помечена `isTomb`). У записей Башни
 * (Tower Floor 30, `isTower`) крит 10%, а не 15% — формулировка «15% у Tower» не подтвердилась.
 * Отдельный квест может переопределить шанс полем `Quest.enemyCritChance` (A70).
 */
// ASSUMPTION: A30 — выборка в статье небольшая; A70 — числа сверены с датасетом stcalc.
export const ENEMY_CRIT_CHANCE = 0.1
/**
 * Шанс крита врага в Гробнице Титанов / Tomb of Titans (stcalc: `critChance` 15, те же 4 записи `isTomb`).
 * Квестов Гробницы в таблице нет — значение справочное (и заготовка под поле `Quest.enemyCritChance`).
 */
// ASSUMPTION: A70
export const ENEMY_CRIT_CHANCE_TOMB = 0.15
/** Множитель крита врага (Compendium: «Critical Damage = 1.5x», считается от базового урона). */
export const ENEMY_CRIT_MULT = 1.5
/** Порог DEF → снижение урона (Compendium: 50% → ×0.5, 70% → ×0.3, cap → ×0.25; между порогами линейно). */
export const DEF_MITIGATION = { at50: 0.5, at70: 0.3, at75: 0.25 } as const
/**
 * Шанс AoE-атаки врага (урон — отдельная колонка Monster AOE DMG).
 * Компендиум: «AoE chance = 20-25% pending on Quest/Enemy». Уточнено по датасету stcalc
 * (https://stcalc.com/data/quests.json, поле `aoeChance`, 244 пары «квест × сложность», сессия 32):
 * 25% — в 236 парах; 0% — 4 пары (Moonlit Grotto / Moonstone Golem, все сложности);
 * 50% — 4 пары (Runestone Quarry / Runestone Golem, все сложности). Поэтому базовое значение — 0.25,
 * а особые квесты задают своё поле `Quest.aoeChance` (движок читает его раньше константы).
 */
// ASSUMPTION: A31 — было 0.2 (нижняя граница компендиума); A70 — по датасету stcalc взято 0.25.
export const AOE_CHANCE = 0.25

/**
 * Порядок ходов отряда:
 *  · `fixed` (по умолчанию) — Compendium: 3 слота — средний→левый→правый, 4 — ср-левый→крайний
 *    левый→крайний правый→ср-правый; порядок один и тот же все раунды (`combat.ts → turnOrderFor`);
 *  · `shuffle` — stcalc.com перемешивает отряд каждый раунд (свой порядок ходов на раунд).
 * Что именно делает игра, в источниках расходится, поэтому НЕ выбираем молча: базовое значение —
 * Compendium (A30/A33), а `shuffle` доступен вариантом калибровки `turn-order-shuffle` (A73).
 */
// ASSUMPTION: A33 — для 5 слотов порядок не опубликован; A73 — расхождение Compendium ↔ stcalc.
export const TURN_ORDER: 'fixed' | 'shuffle' = 'fixed'

/**
 * Усилители силы (Power Boosters) — выбор в форме квеста, действуют на весь отряд.
 * Числа (данные владельца, из интерфейса/калькулятора stcalc.com): Normal — +20% ATK/DEF;
 * Super — +40% ATK/DEF и +10% крита; Mega — +80% ATK/DEF, +25% крита и +50% урона крита.
 * Значения — доли: 0.1 = +10 п.п. крита, 0.5 = +50% к множителю урона крита.
 * Публично эти проценты НЕ подтверждены: официальная страница (https://playshoptitans.com/specials/quest)
 * и вики (https://shop-titans.fandom.com/wiki/Quest_Boosters) дают только слова «Power bonus / Large / Huge»;
 * официальные ноты 4.1.0 (https://playshoptitans.com/news/version-4-1-0-release-notes) подтверждают лишь,
 * что бустеры дают бонус к статам и больше не дают уклонения. Отсюда статус A74.
 * Складываются как % боя (`PCT_STACKING = pooled`, A62): суммируются с % карточки и аурами, а не
 * умножаются поверх (`combat.ts → prepare`, поле `SimOptions.powerBooster`).
 */
// ASSUMPTION: A74 — числа со слов владельца (stcalc), публичной ссылки на них нет.
export const POWER_BOOSTERS = {
  none: { atkPct: 0, defPct: 0, crit: 0, critDmg: 0 },
  normal: { atkPct: 20, defPct: 20, crit: 0, critDmg: 0 },
  super: { atkPct: 40, defPct: 40, crit: 0.1, critDmg: 0 },
  mega: { atkPct: 80, defPct: 80, crit: 0.25, critDmg: 0.5 },
} as const
/**
 * Множитель урона отряда, если стихийный барьер не пробит. Источник: ST-Central, «Hero Academia» →
 * Elemental Barriers: «If the barrier's health is higher than the elemental value of your party then it will be
 * active, causing you to do 80% less damage during the entire quest» → ×0.2 (A9, величина подтверждена).
 */
export const BARRIER_UNBROKEN_DMG_FACTOR = 0.2
/**
 * Мана-щит восстанавливается полностью после N подряд раундов без получения урона.
 */
// ASSUMPTION: A32 — решение сессии 3b по наблюдениям игры, в данных не подтверждено.
export const MANA_SHIELD_RECHARGE_ROUNDS = 3
/**
 * Лимит раундов боя: не победил за это время — поражение.
 */
// ASSUMPTION: A33 — в игре лимита не наблюдали; нужно, чтобы симуляция завершалась.
export const MAX_ROUNDS = 50
/** Прогонов по умолчанию в simulateTeam. */
export const DEFAULT_SIM_RUNS = 2000
/**
 * Штраф уклонения на Extreme (и Terror): **вычитание 20 п.п.** из суммарного EVA, до применения предела.
 * Источник: «Гайд по героям и защитникам Shop Titans 2.0» (Develion), раздел «Экстрим-приключения»:
 * «Уворот ваших героев уменьшается на 20%… штраф в 20% вычитается из общего значения уворота и чтобы
 * полностью нивелировать его, следует разогнать уворот до 95%» — при пределе 75% это ровно вычитание
 * (при умножении на 0.8 хватило бы 93,75%). Прежняя гипотеза (×0.8, A34) отброшена.
 */
export const EXTREME_EVA_PENALTY = 0.2
/**
 * Повышенный шанс крита врага по герою с **отрицательным** уклонением: 0.25% за каждую единицу
 * (п.п.) негативного уворота. Источник: тот же гайд, раздел «Экстрим-приключения»: «Герои с негативным
 * шансом уклонения имеют повышенный шанс получить критический удар (0.25% за каждую единицу негативного
 * уворота). Таким образом, герои с нулевым уворотом будут иметь 5% шанс на получение критического удара».
 * 0.25% × 20 п.п. штрафа = +5 п.п. к базовым 10% (итого 15% у героя с нулевым EVA на Extreme).
 * Отрицательное уклонение получается только на Extreme (штраф уводит сумму ниже нуля).
 */
export const NEGATIVE_EVA_ENEMY_CRIT_PER_PP = 0.0025
/**
 * Как надбавка за отрицательное уклонение (A59) складывается с базовым шансом крита врага:
 *  · `additive` (по умолчанию) — `ENEMY_CRIT_CHANCE + 0.25% × п.п. негативного EVA`: 0 EVA на Extreme
 *    даёт 15% (10% базовых + 5% надбавки);
 *  · `absolute` — надбавка **задаёт** шанс сама: 0 EVA на Extreme даёт ровно 5% (буквальное чтение
 *    «герои с нулевым уворотом будут иметь 5% шанс на получение критического удара»).
 * Путаница возможна из-за того, что гайд называет 5% и не говорит, складываются ли они с базовыми 10%;
 * выбор владельца (сессия 16) — `additive`. Режим вынесен в параметр калибровки A57: значение
 * измеряется по отметкам «проходит / не проходит», а не угадывается.
 */
// ASSUMPTION: A59 — в игре не проверено; additive принят по указанию владельца.
export const NEGATIVE_EVA_CRIT_MODE: 'additive' | 'absolute' = 'additive'
/**
 * Как % из боя (ауры чемпиона, условные навыки: «when HP below», «vs bosses», «first N rounds»)
 * складываются с % карточки героя (формула — formulas.ts → combatStat):
 *  · `pooled` — Combat Compendium: «All non-specific ATK modifiers are pooled and applied at the very end»,
 *    ATK = (база + семена + предметы + плоские) × (1 + Σ всех %);
 *  · `multiplicative` — % боя умножаются поверх стата карточки (модель до сессии 22).
 * Разница заметная: +215% карточки и аура +20% — ×3.35 (pooled) против ×3.78 (multiplicative).
 * Параметр калибровки (calibration.ts, вариант `pct-multiplicative`).
 */
// ASSUMPTION: A62 — в Compendium суммирование показано на навыках героя и духа; ауры чемпиона — по аналогии.
export const PCT_STACKING: 'pooled' | 'multiplicative' = 'pooled'
/**
 * «+40% of total Threat is added as an attack multiplier» (Chieftain): трактовка —
 * множитель ATK = 1 + 0.4 × (угроза / 100).
 */
// ASSUMPTION: A35 — формулировка неоднозначна, другой кандидатуры нет.
export const THREAT_ATTACK_MULTIPLIER_DIVISOR = 100

/**
 * Предел уклонения в бою (доля): выше него EVA не поднимается. Нужен и сам по себе, и для навыков
 * «+N% to max Evasion» (Pathfinder/Insubstantial) — они поднимают именно предел.
 * Источник: «Гайд по героям и защитникам Shop Titans 2.0» (Develion), раздел «Экстрим-приключения»:
 * «Максимальное значение уворота для любого персонажа — 75% (78% для класса “Следопыт”) и даже если вы
 * наберете избыточное количество уворота, работать будет лишь 75%». Предел — на каждого героя
 * (Pathfinder — 78% = 75% + его «+3% to max Evasion»).
 * Штраф Extreme вычитается из суммы ДО предела (A34): 95% − 20 п.п. = 75% — ровно предел, поэтому
 * «чтобы полностью нивелировать штраф, нужно 95% уворота». На обычных квестах EVA выше 75% не даёт
 * ничего, на Extreme полезна до 75% + 20 п.п. = 95%.
 */
export const MAX_EVASION = 0.75

/**
 * «Highly random attack bonus for the party, up to +N%» (Tamas): берём математическое ожидание
 * равномерного распределения на [0, N] → N/2. Точное распределение неизвестно.
 */
// ASSUMPTION: A43 — распределение случайного бонуса в данных не описано.
export const RANDOM_BONUS_EXPECTED_FACTOR = 0.5

/**
 * «If the party is defeated, allows an immediate second attempt at the quest with a +N% power bonus»
 * (Fateweaver): «power bonus» трактуем как множитель ATK отряда во второй попытке.
 */
// ASSUMPTION: A44 — что именно усиливает «power bonus», в данных не описано. Реализация — множитель ATK
// отряда во второй попытке (combat.ts → runAttempt); отдельной константы нет: другой трактовки движок не умеет.

// ─────────────────────────── Оптимизатор ───────────────────────────

/**
 * Версия модели боя/навыков для кэша результатов подбора: входит в хеш входа, поэтому после
 * изменения формул или спец-механик старые записи кэша не отдаются (данные при этом те же).
 * Поднимать при любом изменении, влияющем на win rate (формулы, механики классов, ступени навыков).
 */
export const ENGINE_MODEL_VERSION = 17

/**
 * Топ-K предметов на слот после отсева по quickScore. Ранжирование по Спирмену (0,92) надёжно,
 * абсолютные значения — нет (Пирсон 0,55), поэтому отсев только по рангу и K взят с запасом
 * (решение по итогам сессии 5; проверка на 20 случаях — optimizer.test.ts, доля промахов — в PROGRESS.md).
 */
export const OPTIMIZER_TOP_K = 10
/**
 * Адаптивный K в отсеве: если quickScore K-го и (K+5)-го кандидатов различаются не более чем на
 * tol × |score|, «полка» плоская и лучший мог уехать ниже — расширяем K на 5 и проверяем дальше.
 */
// ASSUMPTION: A38 — порог плоскости полки подобран на 120 случаях (optimizer.prune.test.ts), данных нет.
export const OPTIMIZER_K_ADAPT_STEP = 5
// ASSUMPTION: A38
export const OPTIMIZER_K_ADAPT_TOL = 0.05
/**
 * Локальный поиск после спуска: для каждого слота прогнать симуляцией ещё N следующих по рангу
 * quickScore кандидатов (ловит предметы, которые quickScore недооценил: EVA, связки, спец-механики).
 */
// ASSUMPTION: A38
export const OPTIMIZER_LOCAL_NEIGHBORS = 3
/**
 * Бюджет симуляций на запуск оптимизатора: не более N вызовов simulateTeam.
 * 2000 прогонов ≈ 20 мс → 500 ≈ 10 с (бенчмарк сессии 5).
 */
export const OPTIMIZER_SIM_BUDGET = 500
/** Прогонов Монте-Карло на одну симуляцию при финальном выборе. */
export const OPTIMIZER_SIM_RUNS = 2000
/**
 * Общий seed для всех кандидатов (common random numbers): шум симуляции не должен решать
 * исход сравнения близких наборов (решение по итогам сессии 5).
 */
export const OPTIMIZER_CRN_SEED = 42
/** Сколько наборов-кандидатов (beam по quickScore) доходит до симуляции. */
// Период уступки событийному циклу воркера (обработка cancel()); меньше — лишние ~мс на симуляцию.
export const OPTIMIZER_YIELD_INTERVAL_MS = 25
export const OPTIMIZER_BEAM = 10
/** Beam хранит до OPTIMIZER_BEAM × N кандидатов, потом обрезается до OPTIMIZER_BEAM. */
export const OPTIMIZER_BEAM_SLACK = 4
/**
 * Ролевой тай-брейк спуска: quickScore в пределах ±tol считаются равными, и выбор решает роль
 * (танк — DEF до порога 75% и угроза, ДД — ATK и HP). Ранжирование quickScore надёжно только по рангу.
 */
// ASSUMPTION: A37
export const OPTIMIZER_ROLE_TIE_TOL = 0.01
/** Проходов совместной доводки по quickScore / локального поиска / симуляционной доводки (до сходимости). */
export const OPTIMIZER_QUICK_PASSES = 3
export const OPTIMIZER_LOCAL_PASSES = 2
export const OPTIMIZER_SIM_PASSES = 4

// ─────────────────────────── Ограничения подбора по умолчанию ───────────────────────────
// Источник: требования пользователя (сессия 11) — всё покупается на рынке, но по умолчанию
// предлагаем то, что реально по карману: чуть выше надетого, без дорогих качеств и камней.

/** Макс. тир предметов по умолчанию = макс. тир надетого в отряде + этот запас. */
export const DEFAULT_ITEM_TIER_HEADROOM = 1
/** Макс. качество по умолчанию. */
export const DEFAULT_MAX_QUALITY = 'Superior'
/** Макс. тир камней стихии по умолчанию (или максимум надетого, если он выше). */
export const DEFAULT_MAX_STONE_TIER = 9
/** Дух, который по умолчанию предлагаем только при «Душе Титана» у всех героев отряда. */
export const TITAN_SPIRIT_NAME = 'Titan Spirit'
/**
 * Бюджет симуляций на сценарий «что если +1 тир / +1 качество». Стартовая точка — уже найденный
 * набор, поэтому хватает меньшего бюджета, чем на основной подбор (3 × ~150 ≈ +6 с на 2000 прогонах).
 */
export const OPTIMIZER_WHATIF_SIM_BUDGET = 150
/**
 * Прирост от апгрейда меньше этого (0.01 = 1 п.п.) — в пределах шума симуляции на 2000 прогонов
 * (как SKILL_REROLL_EPS, с запасом): UI подсказывает, что тратиться не стоит.
 */
// ASSUMPTION: A41 — порог выбран по шуму симуляции, данных нет.
export const WHATIF_WORTH_MIN_DELTA = 0.01

/**
 * Пороги словесного вердикта для простого экрана результата: win rate ≥ порога → соответствующая фраза.
 * Только подача для обычного игрока, на расчёты не влияет.
 */
// ASSUMPTION: A61 — границы выбраны «на глаз» (≥90% почти наверняка, <40% скорее проигрыш), данных нет.
export const VERDICT_SURE_MIN = 0.9
export const VERDICT_LIKELY_MIN = 0.7
export const VERDICT_RISKY_MIN = 0.4

// ─────────────────────────── Калибровка по отметкам ───────────────────────────

/**
 * Вес Brier по смерти героев в цели подгонки (`calibration.ts → calibrationObjective`):
 * цель = Brier исхода + вес × Brier смертей. Игра после боя показывает только исход и погибших.
 */
// ASSUMPTION: A64 — равный вес исхода и смертей выбран без данных: оба — Brier одной шкалы 0..1.
export const CALIBRATION_DEATH_BRIER_WEIGHT = 1

/**
 * «Что отметить» (`calibration.ts → questsToCheck`): прогонов на квест и вариант допущений.
 * Варианты одного квеста идут на общем seed, поэтому разброс — эффект допущения, а шум
 * (±3,5 п.п. при 200 прогонах на абсолютный win rate) на разнице вариантов заметно меньше.
 * 138 квестов × 21 модель × 200 прогонов — около 6 с в воркере (замер на отряде из 3 героев фикстуры).
 */
// ASSUMPTION: A64 — число прогонов выбрано по времени расчёта, не по данным.
export const CHECK_SUGGEST_RUNS = 200
/** Сколько квестов показать в «Что отметить». */
export const CHECK_SUGGEST_TOP = 10
/**
 * Минимальный разброс win rate (0.05 = 5 п.п.), с которого квест попадает в «Что отметить»:
 * если варианты дают 100 % и 99 %, одна бинарная отметка их почти никогда не различит.
 */
// ASSUMPTION: A64 — порог выбран «на глаз», данных нет.
export const CHECK_SUGGEST_MIN_SPREAD = 0.05

// ─────────────────────────── Веса статов и семена силы ───────────────────────────
// Веса статов (src/engine/statWeights.ts) измеряются симуляцией на том же наборе, что и результат
// подбора, на общих seed (CRN): «+1% крита» — прибавка 0.01 к доле крита и т. д. Шаги заданы
// требованиями владельца (сессия 13): +1% CRIT, +10% CRIT DMG, +1% EVA, +5% ATK/HP/DEF, +10 стихии/угрозы.

/** Прогонов на одну симуляцию при расчёте весов. Меньше, чем OPTIMIZER_SIM_RUNS: веса нужны для объяснения, не для выбора. */
export const STAT_WEIGHT_RUNS = 800
/** Шаг прибавки шанса крита, п.п. */
export const STAT_WEIGHT_CRIT_PCT = 1
/** Шаг прибавки урона крита, п.п. множителя (+10% CRIT DMG: ×2.0 → ×2.1). */
export const STAT_WEIGHT_CRIT_DMG_PCT = 10
/** Шаг прибавки уклонения, п.п. */
export const STAT_WEIGHT_EVA_PCT = 1
/** Шаг прибавки ATK/HP/DEF, % от текущего значения стату. */
export const STAT_WEIGHT_MAIN_PCT = 5
/** Шаг прибавки стихии героя. */
export const STAT_WEIGHT_ELEMENT = 10
/** Шаг прибавки угрозы (плоская). */
export const STAT_WEIGHT_THREAT = 10
/**
 * Во сколько раз ослабляется квест для «зонда» весов, когда настоящий квест не различает наборы
 * (отряд проигрывает всегда и все веса — ровно 0). Берётся первый множитель, на котором win rate
 * перестаёт быть 0% или 100%; на зонде видно, что вообще даёт герою стат. UI помечает такие веса
 * как посчитанные на ослабленном квесте.
 */
// ASSUMPTION: A56 — величины ослабления подобраны так, чтобы зонд попадал в средний win rate.
export const WEIGHTS_PROBE_FACTORS: readonly number[] = [4, 8, 16, 32, 64, 128, 256]
/**
 * Урон монстра в зонде ослабляется мягче, чем HP: делится на factor^PROBE_DMG_EXPONENT (0.5 — корень),
 * иначе зонд превращается в прогулку, где защитные статы не нужны.
 */
// ASSUMPTION: A56 — эвристика, игровых данных о зондах нет.
export const PROBE_DMG_EXPONENT = 0.5
/** Перебор зондов идёт на укороченных прогонах: max(PROBE_MIN_RUNS, runs × PROBE_RUNS_SHARE). */
export const PROBE_MIN_RUNS = 100
export const PROBE_RUNS_SHARE = 0.25
/** Штраф ранга зонду с win rate вне [PROBE_WIN_RATE_MIN, PROBE_WIN_RATE_MAX] (в единицах расстояния до 50 %). */
// ASSUMPTION: A56
export const PROBE_OUT_OF_RANGE_PENALTY = 0.25
/**
 * Win rate считается «насыщенным» (0% или 100%) за пределами [WEIGHT_SATURATED_LOW, WEIGHT_SATURATED_HIGH]:
 * тогда веса показываются в уроне за раунд / мин. HP, а не в п.п. win rate.
 */
export const WEIGHT_SATURATED_LOW = 0.01
export const WEIGHT_SATURATED_HIGH = 0.99
/** Подсказка «ДД принимает удары чаще танка» — если его доля атак выше доли танка больше чем на это. */
export const THREAT_WARNING_MARGIN = 0.05
/**
 * Границы win rate зонда, в которых веса считаются честными, и цель выбора зонда (ближе к 50 %).
 * У 0 % и 100 % шаг стата переворачивает исход целиком (вклад одного прогона из N).
 */
// ASSUMPTION: A56
export const PROBE_WIN_RATE_MIN = 0.1
export const PROBE_WIN_RATE_MAX = 0.9
export const PROBE_TARGET_WIN_RATE = 0.5

/**
 * Сколько базового стата даёт одно семя силы. Источник: ST-Central, «Hero Academia» → Seeds
 * (https://st-central.net/hero-academia/, изменено 25.05.2026): «Seeds of Power (red) give +4 ATK,
 * Seeds of Vitality (green) give +1 HP, Seeds of Resistance (blue) give +4 DEF». Плоская прибавка к БАЗЕ,
 * до процентных модификаторов (Compendium: «Base ATK + Seed ATK»). До сессии 22 было допущение 1/1/1 (A55).
 */
export const SEED_STAT_PER_SEED: Readonly<Record<'atk' | 'hp' | 'def', number>> = { atk: 1, hp: 1, def: 1 }

// ─────────────────────────── Рекомендации по навыкам ───────────────────────────

/**
 * Вклад навыка в win rate выше этого порога — навык оставляем (0.005 = 0,5 п.п.).
 * Шум симуляции на 2000 прогонов ~1 п.п., порог выше шума.
 */
// ASSUMPTION: A39 — порог выбран по шуму симуляции, данных нет.
export const SKILL_REROLL_EPS = 0.005
/**
 * Кубики перекидки навыков. Подтверждено ST-Central, «Skill Rerolls: A Basic Breakdown»
 * (https://st-central.net/skill-rerolls-roland/, изменено 22.11.2025; независимо — японская вики по ToT):
 *   Basic — «Used to reroll skill slot 1»; Super — «Used to reroll skill slot 1 & 2»;
 *   Mega — «Used to reroll skill slot 1, 2, & 3»; Perfect — «Used to reroll skill slot 1, 2, 3 & 4».
 * Это перечень слотов, к **любому из которых** кубик можно применить (роллится один выбранный слот),
 * а не «перекидывает все младшие»: в гайде Develion идеальным кубиком роллят 4-й слот, не трогая только
 * что найденный 2-й (A39). Стоимость: «A single T2 costs double that of a T1, T3 is 4x a T1, and T4s
 * are 8x» → супер = 2 базовых, мега = 4, идеальный = 8.
 */
export const CUBE_SLOTS: Record<1 | 2 | 3 | 4, number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] }
/** Стоимость кубика в базовых кубиках (ST-Central: T2 = 2× T1, T3 = 4×, T4 = 8×). */
export const CUBE_BASIC_COST: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 2, 3: 4, 4: 8 }
/** Слот, на который обычно тратят Роланда (ST-Central: «slot 3 is usually the hardest slot to roll»). */
export const ROLAND_PREFERRED_SLOT = 3
/**
 * Максимальный тир навыка, который может выдать кубик (1 — базовый, 2 — супер, 3 — мега,
 * 4 — идеальный; Роланд — без ограничения, применяется последним).
 */
// ASSUMPTION: A39 — соответствие кубиков тирам навыков в данных отсутствует; в ST-Central
// подтверждены слоты, стоимость и блокировки, про тиры навыков там ничего нет.
export const CUBE_MAX_TIER: Record<1 | 2 | 3 | 4, number> = { 1: 10, 2: 15, 3: 20, 4: 25 }

/**
 * Пары навыков, которые игра не даёт одному герою одновременно. Так сказано в данных владельца
 * (changelog stcalc.com); публично пара не подтверждена (вики описывает Sturdy и Impervious просто
 * как HP-навыки), статус — A72. Учитывается только в пуле перекидки (`skills.ts → rollableSkills` /
 * `skillBlockReason`): надетый вручную герой может иметь оба, и движок считает то, что есть, —
 * это ограничение ролла, а не боя.
 */
// ASSUMPTION: A72 — в таблице взаимных исключений нет, пара взята из данных владельца.
export const INCOMPATIBLE_SKILL_NAMES: readonly (readonly [string, string])[] = [['Sturdy', 'Impervious']]


// ─────────────────────────── План ролла навыков героя ───────────────────────────
// Источник: «Гайд по героям и защитникам Shop Titans 2.0» (Develion), раздел «Как “роллить” героев»
// (https://docs.google.com/document/d/1DrP0VBxnDPSLwsLe_Y8T3BkrGmN_f6QiBGrHW1qs3E8) — см. A60.

/**
 * Уровень, на котором открывается 2-й слот навыка. Талант «Лучшие товарищи Аргона» 3-й ступени
 * позволяет нанимать героев сразу 10-го уровня: «Нанимаем и удаляем героя до тех пор, пока не получим
 * нужный навык во 2й слот».
 */
export const SKILL_ROLL_HIRE_LEVEL = 10
/** Очков дерева талантов на 3-ю ступень «Лучших товарищей Аргона» (гайд: «потребует 11ти очков»). */
export const ARGONS_FINEST_TALENT_POINTS = 11
/**
 * Уровень, на котором открываются 3-й и 4-й слоты навыка (гайд: «Прокачиваем героя до 35го уровня чтобы
 * открыть 3й и 4й навык»). Если слоты недоступны — используется Душа Титана. В листе HEROES у промоушенов
 * уровни слотов свои (19/29 и 23/35) — план берёт точные уровни класса из данных, эта константа — правило гайда.
 */
export const SKILL_ROLL_FULL_LEVEL = 35
/** Идеальных кубиков за одну Башню Титана: 8 с премом, 4 без (гайд: «8 шт. за одну башню», «4 штуки без према»). */
export const PERFECT_DICE_PER_TOWER = 8
export const PERFECT_DICE_PER_TOWER_NO_PREMIUM = 4
/**
 * Сколько кубиков советует накопить гайд перед роллом: «20+ идеальных и 100+ базовых» — за длинную сессию
 * шанс выбить нужный навык статистически выше, чем при редких подходах по 10 кубиков.
 */
export const SKILL_ROLL_STOCK_IDEAL_DICE = 20
export const SKILL_ROLL_STOCK_BASIC_DICE = 100

// ─────────────────────────── Правила состава отряда и ростера ───────────────────────────
// Источники (сессия 28, требования владельца):
//   · ST-Central, «Team Building, Not Guesswork» — https://st-central.net/team-building-not-guesswork/:
//     правила состава 1) два героя на стихию барьера, 2) один чемпион на отряд, 3) один «красный»
//     (Fighter) на отряд, 4) остальные слоты — «синие/зелёные» (Spellcaster/Rogue); советы «чемпион ↔
//     герой» (EVA, крит, угроза, класс) и «Rudo +50% стихии отряда против барьера», «Spellblade 50%»;
//   · ST-Central, «Foster Your Roster» — https://st-central.net/foster-your-roster/: 3+ героя на стихию
//     (Spellblade не считается), 2+ архетипа на стихию, бойцов столько же, сколько слотов квестов,
//     синих ≈ зелёных;
//   · «Гайд по героям и защитникам Shop Titans 2.0» (Develion) —
//     https://docs.google.com/document/d/1DrP0VBxnDPSLwsLe_Y8T3BkrGmN_f6QiBGrHW1qs3E8 (связки чемпион +
//     классы героев, «Ashley сильнее на боссах», «Lilu + Wanderers», «Polonia + Tricksters»).
// Разбор правил, подсказок и допущений — src/engine/teamRules.ts, src/engine/barriers.ts, A68.

/** Ссылки-источники правил: подсказка в интерфейсе всегда показывает, откуда она. */
export const RULES_TEAM_URL = 'https://st-central.net/team-building-not-guesswork/'
export const RULES_ROSTER_URL = 'https://st-central.net/foster-your-roster/'
export const RULES_DEVELION_URL =
  'https://docs.google.com/document/d/1DrP0VBxnDPSLwsLe_Y8T3BkrGmN_f6QiBGrHW1qs3E8' as const

/** Правило 1 «Team Building»: на стихию барьера в отряде должно приходиться не меньше двух героев. */
export const PARTY_HEROES_PER_BARRIER_ELEMENT = 2
/** Правило 2: чемпион в отряде один. */
export const PARTY_MAX_CHAMPIONS = 1
/** Правило 3: «красных» (Fighter) в отряде — один (он же может быть чемпионом-бойцом). */
export const PARTY_FIGHTERS_MIN = 1
/** Правило 4: остальные слоты — «синие/зелёные» (Rogue/Spellcaster), то есть красных больше одного не надо. */
export const PARTY_FIGHTERS_MAX = 1

/** «Foster Your Roster»: героев на каждую стихию — не меньше трёх (Spellblade — «Any», не считается). */
export const ROSTER_MIN_HEROES_PER_ELEMENT = 3
/** «Foster Your Roster»: архетипов (Fighter/Rogue/Spellcaster) на стихию — не меньше двух. */
export const ROSTER_MIN_ARCHETYPES_PER_ELEMENT = 2
/** «Foster Your Roster»: синих и зелёных примерно поровну — допускаем такую разницу в счёте. */
export const ROSTER_BLUE_GREEN_TOLERANCE = 1

/**
 * Чемпионы-«добытчики»: их ставят в отряд в первую очередь (Sia — компоненты, Polonia — кража предметов,
 * Malady — зачарования). Источник: ST-Central «Team Building» (советы по чемпионам) и лидерские навыки
 * в листе SKILLS.
 */
export const LOOT_CHAMPIONS: readonly string[] = ['Sia', 'Polonia', 'Malady']
/**
 * Чемпионы-бойцы (Fighter): ими закрывают «красного», когда своих бойцов не хватает («мало бойцов →
 * чемпион-боец вместо танка»). Источник: ST-Central «Team Building».
 */
export const FIGHTER_CHAMPIONS: readonly string[] = ['Argon', 'Ashley', 'Bjorn', 'Rudo']
/** Чемпионы под крит-бойцов: Rudo (крит на N раундов) и Bjorn (+крит-урон). Источник: ST-Central «Team Building». */
export const CRIT_CHAMPIONS: readonly string[] = ['Rudo', 'Bjorn']
/**
 * Чемпион, который умножает стихию отряда против барьера: Rudo, «Berserker Rampage» — «+50% party Element
 * bonus VS Elemental Barriers». В данных это награда 7-го ранга (проверено: `championGear`/фикстура),
 * в статье ST-Central — «R7»; до 7-го ранга бонуса нет.
 */
export const BARRIER_BONUS_SKILL_RE = /party element bonus vs elemental barriers/i
/**
 * Пороги уклонения (доля, ПОСЛЕ штрафа Extreme −20 п.п.) и чемпионы под них — ST-Central «Team Building»:
 * «95% EVA (экстрим) → Lilu; 75% EVA → Yami (+20% до 95%); ~85% EVA → Donovan/Malady/Polonia».
 * Значения — из совета владельца; в статье числа даны словами, поэтому трактовка границ — A68.
 */
export const EVA_CHAMPION_SUSTAIN_MIN = 0.95
export const EVA_CHAMPION_MID_MIN = 0.85
export const EVA_CHAMPION_YAMI_MIN = 0.75
/** Чемпион, чей лидерский навык добавляет отряду выживаемость (лечение + HP/мана-щит). */
export const EVA_CHAMPION_SUSTAIN = 'Lilu'
/** Чемпион с +20% уклонения отряду (ранг 4: Perfect Ambush) — доводит 75% до 95%. */
export const EVA_CHAMPION_YAMI = 'Yami'
/** Чемпионы с +10…15% уклонения и крита отряду (Донован — за каждого разбойника). */
export const EVA_CHAMPIONS_MID: readonly string[] = ['Donovan', 'Malady', 'Polonia']
/** «Крит-боец» для подсказки «крит без защитных навыков»: доля крита, с которой героя считаем крит-бойцом. */
// ASSUMPTION: A68 — в статье порог не назван; 40% — верхняя часть диапазона крита классов фикстуры (5–46%).
export const CRIT_BUILD_MIN = 0.4
/**
 * Чемпионы, которым важно выжить (они приносят добычу только если живы): Malady и Reinhold — их лидерские
 * навыки заканчиваются «…if <чемпион> survives». Источник: SKILLS (Type = Leader) и ST-Central «Team Building»
 * («Malady/Reinhold — с бурстовыми героями и бойцом с высокой угрозой (Chieftain), им надо выжить»).
 */
export const SURVIVE_CHAMPIONS: readonly string[] = ['Malady', 'Reinhold']
/**
 * Связки «чемпион → классы героев» из гайда Develion: «Donovan +атака за заклинателя/HP за воина/крит и EVA
 * за странника», «Lilu + Wanderers», «Polonia + 3 Trickster». Проверяются по лидерскому навыку чемпиона
 * (SKILLS), а не по догадке.
 */
export const CHAMPION_CLASS_PAIRS: Readonly<Record<string, readonly string[]>> = {
  Donovan: ['Rogue'],
  Lilu: ['Wanderer', 'Pathfinder'],
  Polonia: ['Trickster', 'Thief'],
}
/**
 * Доля ударов босса по одному бойцу, с которой подсказка предупреждает: весь урон идёт в него одного
 * (угроза/Σ угроза × (1 − шанс AoE)). Порог — допущение: в источниках числа нет.
 */
// ASSUMPTION: A68
export const THREAT_SHARE_WARN = 0.5

/** Сколько барьерных пар показывать в отчёте (остальные учитываются только счётом — список не раздуваем). */
export const BARRIER_PAIRS_LIST_LIMIT = 50

// ─────────────────────────── План команд на локацию ───────────────────────────

/**
 * Прогонов на команду при улучшении плана обменами. Меньше, чем TEAM_SIM_RUNS: обменов много, а решение
 * принимается по разнице (общий seed — common random numbers), шум разницы заметно ниже абсолютного.
 */
// ASSUMPTION: A69 — число выбрано по времени расчёта, игровых данных нет.
export const PLAN_SIM_RUNS = 300
/** Прогонов на команду в итоговом отчёте плана (как у прогона команды, но без 2000: команд может быть 5). */
export const PLAN_FINAL_RUNS = 1000
/** Сколько обменов-кандидатов (лучших по быстрой оценке) проверяется симуляцией за проход. */
export const PLAN_SWAP_CANDIDATES = 12
/** Проходов улучшения обменами (до сходимости). */
export const PLAN_IMPROVE_PASSES = 5
/** Бюджет вызовов симуляции на построение плана (1 вызов = 1 команда на 1 квесте). */
export const PLAN_SIM_BUDGET = 300
/** Порог win rate для цели «число команд с win rate ≥ порога». */
export const PLAN_WIN_THRESHOLD = 0.5

