/**
 * Все магические числа движка. У каждого — источник; неподтверждённые помечены `// ASSUMPTION: A<n>`
 * и описаны в docs/ASSUMPTIONS.md. Сверка с экспортом героев — src/engine/stats.fixture.test.ts.
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
 * Рост базовых ATK/DEF/HP героя с уровнем: база(L) = база₁ × (1 + k·(L−1)) + c·(L−1),
 * база₁ — статы класса из листа HEROES. Прироста по уровням нет ни в HEROES, ни в HERO LEVELS.
 * Подобрано МНК по относительной ошибке итогового стата на fixtures/heroes.txt (18 героев, 12 классов, уровни 23–33)
 * с учётом удвоения духа в Portable Totem Pole (A27): RMS ATK 2,1%, DEF 2,1%, HP 9,0%.
 * У HP разброс по классам большой — гладкая формула его не описывает (см. A8); для импортированных героев
 * база берётся из эталона экспорта (stats.ts → referenceBase).
 */
// ASSUMPTION: A8
export const HERO_LEVEL_STAT_GROWTH = {
  atk: { k: 0.232, c: 7.15 },
  def: { k: 0.292, c: 4.95 },
  hp: { k: 0.125, c: 1.2 },
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

/** Число слотов экипировки у героя. Источник: лист HEROES, Equipment Slot 1–6. */
export const EQUIPMENT_SLOTS = 6

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
 * Духи, дающие +5 стихии носителю (на духа). Выведено сверкой с экспортом (A29): Селена (1× Ox) +5,
 * Джорди (6× Chimera) +30; у носителей Lion/Bear/Walrus/Mammoth/Cat/Wolf/Eagle/Owl излишка нет.
 * В листах ENCHANTMENTS/SKILLS колонки стихии у духов нет (проверено и в фикстуре, и в живой таблице) —
 * только по экспорту. Влияет на отображаемую стихию и барьер, но НЕ на ступени навыков
 * (иначе у Селены открылась бы ступень 3 «Dance of Blades» с порогом 95 — экспорт этому противоречит).
 */
// ASSUMPTION: A29
export const SPIRIT_ELEMENT_BONUS: Readonly<Record<string, number>> = {
  'Ox Spirit': 5,
  'Chimera Spirit': 5,
}

// ─────────────────────────── Бой (симулятор) ───────────────────────────
// Формулы — ST-Central Combat Compendium (https://st-central.net/combat-compendium/), см. A30.

/** Максимальный множитель урона врага при DEF = 0 (Compendium: «Maximum DMG = Enemy DMG × 1.5»). */
export const ENEMY_DMG_MAX_FACTOR = 1.5
/** Шанс крита врага (Compendium: «Chance to crit = 10%~»). */
// ASSUMPTION: A30 — выборка в статье небольшая.
export const ENEMY_CRIT_CHANCE = 0.1
/** Множитель крита врага (Compendium: «Critical Damage = 1.5x», считается от базового урона). */
export const ENEMY_CRIT_MULT = 1.5
/** Порог DEF → снижение урона (Compendium: 50% → ×0.5, 70% → ×0.3, cap → ×0.25; между порогами линейно). */
export const DEF_MITIGATION = { at50: 0.5, at70: 0.3, at75: 0.25 } as const
/**
 * Шанс AoE-атаки врага (Compendium: «AoE chance = 20-25% pending on Quest/Enemy»;
 * урон — отдельная колонка Monster AOE DMG).
 */
// ASSUMPTION: A31 — точный шанс по квесту неизвестен, берём нижнюю границу.
export const AOE_CHANCE = 0.2
/**
 * Множитель урона отряда, если стихийный барьер не пробит (A9).
 */
// ASSUMPTION: A9 — точная механика барьера в данных не описана.
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
 * Штраф уклонения на Extreme (и Terror): −20% от значения EVA (multiplicatively).
 */
// ASSUMPTION: A34 — сообщество («the 20% penalty Extreme and Terror Difficulty have», r/shoptitans);
// точная форма (−20 п.п. или ×0.8) не подтверждена, выбрано ×0.8.
export const EXTREME_EVA_PENALTY = 0.2
/**
 * «+40% of total Threat is added as an attack multiplier» (Chieftain): трактовка —
 * множитель ATK = 1 + 0.4 × (угроза / 100).
 */
// ASSUMPTION: A35 — формулировка неоднозначна, другой кандидатуры нет.
export const THREAT_ATTACK_MULTIPLIER_DIVISOR = 100

