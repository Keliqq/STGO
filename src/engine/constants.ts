/**
 * Все магические числа движка. У каждого — источник; неподтверждённые помечены `// ASSUMPTION: A<n>`
 * и описаны в docs/ASSUMPTIONS.md. Проверка — в сессии 3 (сверка с экспортом героев).
 */

/**
 * Множители статов предмета по качеству (к ATK/DEF/HP строки Normal).
 * Источник: значения, распространённые в сообществе; в таблице отсутствуют.
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
 * Прирост базовых статов героя за уровень (доля от статов 1-го уровня).
 * В HERO LEVELS прироста нет (там только XP и максимальный тир), fixtures/heroes.txt пока не предоставлен.
 * 0 = «статы не растут» — заглушка до калибровки в сессии 3 обратным счётом из экспорта героев.
 */
// ASSUMPTION: A8
export const HERO_LEVEL_STAT_GROWTH = { hp: 0, atk: 0, def: 0 } as const

/**
 * Бонус сродства (Elemental Affinity): во сколько раз усиливается камень стихии в предмете
 * с подходящим сродством. Параметр, значение подбирается в сессии 3.
 */
// ASSUMPTION: A6
export const ELEMENT_AFFINITY_MULTIPLIER = 1.5

/**
 * Бонус сродства духа (Spirit Affinity): во сколько раз усиливаются статы духа в предмете с подходящим сродством.
 * Сам навык «+» включается правилом SPIRIT_PLUS_RULE. Параметр, значение подбирается в сессии 3.
 */
// ASSUMPTION: A5
export const SPIRIT_AFFINITY_MULTIPLIER = 1.5

/**
 * Когда у духа действует «+»-версия навыка:
 * 'affinity' — дух вставлен в предмет, у которого Spirit Affinity = имя навыка духа.
 */
// ASSUMPTION: A5
export const SPIRIT_PLUS_RULE: 'affinity' | 'never' = 'affinity'

/** Число слотов экипировки у героя. Источник: лист HEROES, Equipment Slot 1–6. */
export const EQUIPMENT_SLOTS = 6
