/**
 * Формулы (src/engine/formulas.ts) на числах из источников: Combat Compendium и гайд Develion.
 */
import { describe, expect, it } from 'vitest'
import { DEF_MITIGATION, ENEMY_DMG_MAX_FACTOR } from './constants.ts'
import {
  baseStatAtLevel,
  combatStat,
  damageFactor,
  defCapsFromCap,
  effectiveEvasion,
  enemyCritChanceVs,
  enemyCritDamage,
  escalationMult,
  evasionCap,
  floorStat,
  threatShareList,
} from './formulas.ts'

const curve = { enemyDmgMaxFactor: ENEMY_DMG_MAX_FACTOR, mitigation: DEF_MITIGATION }

describe('формулы: Combat Compendium', () => {
  it('ATK Гонга: (887 + 2953 + 233 + 1104) × (1 + 0.3 + 1 + 0.8 + 0.05) = 16307.55 → 16307', () => {
    const raw = 887 + 2953 + 233 + 1104
    expect(floorStat(raw * 3.15)).toBe(16307)
  })

  it('% боя суммируются с % карточки (pooled), а не умножаются поверх', () => {
    // Карточка: те же 5177 × (1 + 1.15); в бою ещё +100% (Double Cast как «боевой» %).
    const sheetPct = 1.15
    const sheet = 5177 * (1 + sheetPct)
    expect(combatStat(sheet, sheetPct, 0, 1, 'pooled')).toBeCloseTo(5177 * 3.15, 6)
    expect(combatStat(sheet, sheetPct, 0, 1, 'multiplicative')).toBeCloseTo(sheet * 2, 6)
    // Плоская прибавка боя тоже идёт в сумму до %.
    expect(combatStat(sheet, sheetPct, 100, 0, 'pooled')).toBeCloseTo((5177 + 100) * 2.15, 6)
    // Без % карточки режимы совпадают (чемпионы).
    expect(combatStat(1000, 0, 0, 0.2, 'pooled')).toBe(combatStat(1000, 0, 0, 0.2, 'multiplicative'))
  })

  it('кривая DEF: ×1.5 при 0, ×1 на половине порога 50%, 0.5/0.3/0.25 на порогах', () => {
    const caps = { p50: 1000, p70: 2000, p75: 3000 }
    expect(damageFactor(0, caps, curve)).toBe(1.5)
    expect(damageFactor(500, caps, curve)).toBe(1)
    expect(damageFactor(250, caps, curve)).toBeCloseTo(1.25, 10)
    expect(damageFactor(1000, caps, curve)).toBe(0.5)
    expect(damageFactor(2000, caps, curve)).toBe(0.3)
    expect(damageFactor(3000, caps, curve)).toBe(0.25)
    expect(damageFactor(99999, caps, curve)).toBe(0.25)
    expect(damageFactor(500, null, curve)).toBe(1)
  })

  it('крит врага ×1.5 от базового урона при DEF выше половины порога 50%, от повышенного — ниже', () => {
    expect(enemyCritDamage(50, 100)).toBe(150)
    expect(enemyCritDamage(140, 100)).toBe(210)
  })

  it('доли атак по угрозе: AoE поровну, соло — всё в одного', () => {
    expect(threatShareList([100], 0.2)).toEqual([1])
    const s = threatShareList([300, 100], 0.2)
    expect(s[0]).toBeCloseTo(0.8 * 0.75 + 0.1, 10)
    expect(s[0] + s[1]).toBeCloseTo(1, 10)
  })
})

describe('пороги защиты из одного числа — «Defense cap» с экрана игры (A71)', () => {
  it('cap → пороги 50/70/75% = cap/6 · cap/3 · cap (формат «X · 2X · 6X»)', () => {
    expect(defCapsFromCap(159600)).toEqual({ p50: 26600, p70: 53200, p75: 159600 })
  })

  it('Meteor Zone Extreme (stcalc: cap 159600, атака врага 410): 0 → 615, 26600 → 205, 53200 → 123, cap → 102.5', () => {
    // Владелец приводил эти числа по таблице гайда stcalc; «53000 → 123» в ней — округление 53200,
    // а 123 — ровно 0.3 × 410. Проверяем саму кривую: она воспроизводит таблицу один в один.
    const caps = defCapsFromCap(159600)
    const dmg = 410
    const at = (def: number): number => dmg * damageFactor(def, caps, curve)
    expect(at(0)).toBeCloseTo(615, 6) // 1.5 × 410
    expect(at(26600)).toBeCloseTo(205, 6) // 0.5 × 410
    expect(at(53200)).toBeCloseTo(123, 6) // 0.3 × 410
    expect(at(159600)).toBeCloseTo(102.5, 6) // 0.25 × 410 — в таблице показано как 103
    // Ниже порога 50% урон падает линейно: 53000 (округление таблицы) даёт ≈123.6.
    expect(at(53000)).toBeCloseTo(123.6, 1)
  })
})

describe('формулы: гайд Develion (Extreme)', () => {
  it('95% EVA на Extreme = ровно предел 75%; 0% → −20 п.п.', () => {
    expect(effectiveEvasion(0.95, evasionCap(0), true)).toBeCloseTo(0.75, 10)
    expect(effectiveEvasion(0, evasionCap(0), true)).toBeCloseTo(-0.2, 10)
    expect(evasionCap(3)).toBeCloseTo(0.78, 10)
  })

  it('крит врага по герою с 0 EVA на Extreme: 10% + 5% = 15% (additive) или 5% (absolute)', () => {
    expect(enemyCritChanceVs(0.1, -0.2, 'additive')).toBeCloseTo(0.15, 10)
    expect(enemyCritChanceVs(0.1, -0.2, 'absolute')).toBeCloseTo(0.05, 10)
    expect(enemyCritChanceVs(0.1, 0.3, 'additive')).toBe(0.1)
  })
})

describe('формулы: прочее', () => {
  it('рост базы: на 1-м уровне — база класса', () => {
    expect(baseStatAtLevel(100, 1, { k: 0.2, c: 5 })).toBe(100)
    expect(baseStatAtLevel(100, 11, { k: 0.2, c: 5 })).toBe(100 * 3 + 50)
  })

  it('эскалация Berserker: ×1 / ×2 ниже 50% / ×3 ниже 25%', () => {
    const esc = { doubleBelow: 50, tripleBelow: 25 }
    expect(escalationMult(esc, 0.6)).toBe(1)
    expect(escalationMult(esc, 0.4)).toBe(2)
    expect(escalationMult(esc, 0.2)).toBe(3)
    expect(escalationMult(undefined, 0.1)).toBe(1)
  })
})
