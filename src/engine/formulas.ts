/**
 * Все игровые формулы движка — в одном файле, чтобы их было легко найти и подгонять.
 * Числа (коэффициенты, пороги) — в constants.ts; здесь только то, КАК они складываются.
 *
 * Источник, если не указано иное, — ST-Central Combat Compendium (https://st-central.net/combat-compendium/).
 * Неподтверждённое помечено `ASSUMPTION: A<n>` (docs/ASSUMPTIONS.md).
 *
 * Где применяется:
 *   · статы карточки героя — stats.ts (baseStatAtLevel, floorStat);
 *   · бой — combat.ts (всё остальное), быстрая оценка — score.ts (те же функции).
 */
import type { DefCaps, GameData } from '../data/types.ts'
import {
  ENEMY_CRIT_MULT,
  EXTREME_EVA_PENALTY,
  MAX_EVASION,
  NEGATIVE_EVA_CRIT_MODE,
  NEGATIVE_EVA_ENEMY_CRIT_PER_PP,
  PCT_STACKING,
  RANDOM_BONUS_EXPECTED_FACTOR,
  THREAT_ATTACK_MULTIPLIER_DIVISOR,
} from './constants.ts'

// ─────────────────────────── статы карточки ───────────────────────────

/** Форма роста базы: база(L) = база₁·(1 + k·x + d·x²) + c·x, x = L − 1. d нет — прежняя линейная форма. */
export interface LevelGrowth {
  k: number
  c: number
  d?: number
}

/**
 * База класса на уровне: база₁·(1 + k·x + d·x²) + c·x; база₁ — статы класса из HEROES,
 * k, c, d — HERO_LEVEL_STAT_GROWTH (подобраны МНК по экспортам героев, A8).
 */
// ASSUMPTION: A8
export function baseStatAtLevel(base1: number, level: number, growth: LevelGrowth): number {
  const l = Math.max(1, level) - 1
  return base1 * (1 + growth.k * l + (growth.d ?? 0) * l * l) + growth.c * l
}

/**
 * Округление итогового стата — отбрасывание дробной части: в Compendium 16307.55 показано как 16307
 * (в тексте «.5 rounds down», но пример — .55). Эпсилон — от ошибок двоичной арифметики (5060 × 3.15).
 */
export function floorStat(x: number): number {
  return Math.floor(x + 1e-9)
}

/**
 * Максимальный тир предмета, который герой может носить на этом уровне: лист HERO LEVELS →
 * `Hero Level → Max Item Tier` (docs/SCHEMA.md). Числа в таблице, а не в constants.ts.
 * Уровень вне таблицы (выше 50-го или ниже первого) — ближайшее доступное значение; данных нет — null.
 */
export function maxItemTierFor(data: GameData, level: number): number | null {
  const rows = [...data.heroLevels].sort((a, b) => a.level - b.level)
  if (rows.length === 0) return null
  const at = rows.filter((l) => l.level <= level).at(-1)
  return (at ?? rows[0]).maxItemTier
}

// ─────────────────────────── урон и защита ───────────────────────────

/** Кривая защиты: множитель урона при DEF = 0 и на порогах 50/70/75% (DEF_MITIGATION). */
export interface DefCurve {
  enemyDmgMaxFactor: number
  mitigation: { at50: number; at70: number; at75: number }
}

/**
 * Множитель урона врага по DEF цели: 1.5× при DEF=0, 1.0× на половине порога 50%
 * («Heroes take 100% of the enemy's DMG stat at half of the 50% breakpoint»),
 * 0.5× / 0.3× / 0.25× на порогах 50/70/75%, между ними линейно; выше порога 75% — 0.25×.
 * Без порогов (caps = null, A10) — 1.0 (никакого снижения).
 */
export function damageFactor(def: number, caps: DefCaps | null, curve: DefCurve): number {
  if (!caps || caps.p50 <= 0) return 1
  const mit = curve.mitigation
  const pts: [number, number][] = [
    [0, curve.enemyDmgMaxFactor],
    [caps.p50 / 2, 1],
    [caps.p50, mit.at50],
    [caps.p70, mit.at70],
    [caps.p75, mit.at75],
  ]
  if (def >= caps.p75) return mit.at75
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (def <= x1) return x1 === x0 ? y1 : y0 + ((def - x0) * (y1 - y0)) / (x1 - x0)
  }
  return mit.at75
}

/**
 * Урон крита врага: «enemy base damage is utilized at all defense values above half the first soft cap» —
 * крит ×1.5 считается от базового урона, если DEF снижает урон, и от повышенного, если DEF мала.
 */
export function enemyCritDamage(mitigatedDmg: number, baseDmg: number): number {
  return Math.max(mitigatedDmg, baseDmg) * ENEMY_CRIT_MULT
}

/**
 * Как % из боя (ауры чемпиона, условные навыки) складываются с % карточки героя:
 *  · `pooled` — Compendium: «All non-specific ATK modifiers are pooled and applied at the very end»:
 *    (сумма до % + плоские) × (1 + Σ% карточки + Σ% боя);
 *  · `multiplicative` — прежняя модель: % боя умножаются поверх стата карточки.
 * `sheet` — стат карточки (уже с её %), `sheetPct` — Σ% карточки (0.3 = +30%).
 */
// ASSUMPTION: A62 — Compendium описывает суммирование на примере навыков героя и духа; что ауры чемпиона
// и условные боевые % идут в ту же сумму, прямо не сказано.
export function combatStat(
  sheet: number,
  sheetPct: number,
  flat: number,
  combatPct: number,
  stacking: 'pooled' | 'multiplicative' = PCT_STACKING,
): number {
  if (stacking === 'multiplicative' || sheetPct === 0 || 1 + sheetPct <= 0) return (sheet + flat) * (1 + combatPct)
  return (sheet / (1 + sheetPct) + flat) * (1 + sheetPct + combatPct)
}

/** Множитель урона крита героя: CritDmg + бонусы; «+N% per consecutive critical hits» (Conquistador). */
export function critMultiplier(critDmg: number, consecutive: number, consecPct: number): number {
  return critDmg + consecutive * (consecPct / 100)
}

/** «+N% of total Threat is added as an attack multiplier» (Chieftain): 1 + N% × угроза / 100. */
// ASSUMPTION: A35
export function threatAttackMultiplier(threatAtkPct: number, threat: number): number {
  return 1 + (threatAtkPct / 100) * (threat / THREAT_ATTACK_MULTIPLIER_DIVISOR)
}

/** «Highly random attack bonus for the party, up to +N%» (Tamas): матожидание, доля (0.1 = +10%). */
// ASSUMPTION: A43
export function randomAttackBonus(upToPct: number): number {
  return (upToPct * RANDOM_BONUS_EXPECTED_FACTOR) / 100
}

/** «Attack increases by the amount of HP drained plus N%» (Hemma): прибавка ATK за раунд. */
// ASSUMPTION: A46
export function drainAttackGain(drained: number, plusPct: number): number {
  return drained * (1 + plusPct / 100)
}

/** Эскалация по HP владельца (Berserker/Jarl): ниже Y% → ×3, ниже X% → ×2, иначе ×1. */
// ASSUMPTION: A48
export function escalationMult(esc: { doubleBelow: number; tripleBelow: number } | undefined, selfHpFrac: number): number {
  if (!esc) return 1
  const pct = selfHpFrac * 100
  if (pct < esc.tripleBelow) return 3
  if (pct < esc.doubleBelow) return 2
  return 1
}

// ─────────────────────────── уклонение и крит врага ───────────────────────────

/**
 * Предел уклонения бойца (A42): MAX_EVASION плюс его «+N% to max Evasion» (Pathfinder → 78%).
 */
export function evasionCap(maxEvaBonusPct: number): number {
  return MAX_EVASION + maxEvaBonusPct / 100
}

/**
 * Эффективное уклонение (доля): сумма статов, затем штраф Extreme вычитанием (A34), и только после
 * этого предел (A42). 95% на Extreme = 75% (ровно предел), 0% на Extreme = −20 п.п.
 */
export function effectiveEvasion(evaSum: number, cap: number, extreme: boolean): number {
  return Math.min(evaSum - (extreme ? EXTREME_EVA_PENALTY : 0), cap)
}

/**
 * Шанс крита врага по бойцу: базовый + надбавка за отрицательное уклонение (A59, 0.25% за 1 п.п.).
 * `mode`: `additive` — базовый + надбавка (0 EVA на Extreme → 15%), `absolute` — надбавка вместо базового (→ 5%).
 */
export function enemyCritChanceVs(baseChance: number, eva: number, mode: 'additive' | 'absolute' = NEGATIVE_EVA_CRIT_MODE): number {
  if (eva >= 0) return baseChance
  const penalty = NEGATIVE_EVA_ENEMY_CRIT_PER_PP * -eva * 100
  return mode === 'absolute' ? penalty : baseChance + penalty
}

// ─────────────────────────── цель врага ───────────────────────────

/**
 * Доли атак монстра по каждому бойцу (в сумме 1): доля aoeChance — AoE по всем,
 * остальные — одиночная цель с вероятностью threat / Σ threat. Соло-герой AoE не получает.
 */
export function threatShareList(threats: number[], aoeChance: number): number[] {
  const n = threats.length
  if (n === 0) return []
  if (n === 1) return [1]
  const sum = threats.reduce((a, t) => a + Math.max(0, t), 0)
  return threats.map((t) => (1 - aoeChance) * (sum > 0 ? Math.max(0, t) / sum : 1 / n) + aoeChance / n)
}
