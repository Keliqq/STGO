/**
 * Подсказка по защите (`defAdvice`): зона DEF на кривой урона и совет, что делать дальше.
 * Кривая — A30, пороги — A10/A71; «вкладываться примерно до трети cap» — гайд stcalc.com,
 * правило «мало HP — не советовать урезать DEF» — A75.
 */
import { describe, expect, it } from 'vitest'
import type { DefCaps } from '../data/types.ts'
import { damageFactor } from './combat.ts'
import { defAdvice, hasLowHp } from './defAdvice.ts'

const CAPS: DefCaps = { p50: 1000, p70: 2000, p75: 6000 }

describe('defAdvice: зоны кривой защиты', () => {
  it('ниже половины p50 — урон врага больше 100 %', () => {
    const a = defAdvice({ def: 300, caps: CAPS })
    expect(a.zone).toBe('below-half')
    expect(a.damageFactor).toBeCloseTo(damageFactor(300, CAPS))
    expect(a.damageFactor).toBeGreaterThan(1)
    expect(a.next).toEqual({ threshold: 'p50', at: 1000, delta: 700, damageFactorAt: 0.5 })
    expect(a.text).toContain('больше 100%')
  })

  it('от p50/2 до p50 — урон между 100 % и 50 %', () => {
    const a = defAdvice({ def: 700, caps: CAPS })
    expect(a.zone).toBe('to-p50')
    expect(a.damageFactor).toBeGreaterThan(0.5)
    expect(a.damageFactor).toBeLessThan(1)
    expect(a.title).toContain('До p50')
  })

  it('от p50 до p70 — «главный выигрыш уже получен»', () => {
    const a = defAdvice({ def: 1200, caps: CAPS })
    expect(a.zone).toBe('to-p70')
    expect(a.damageFactor).toBeGreaterThan(0.3)
    expect(a.damageFactor).toBeLessThan(0.5)
    expect(a.text).toContain('Главный выигрыш уже получен')
    expect(a.next?.threshold).toBe('p70')
    expect(a.next?.delta).toBe(800)
  })

  it('выше p70 — «дальше защита почти ничего не даёт, лучше HP/ATK»', () => {
    const a = defAdvice({ def: 2500, caps: CAPS })
    expect(a.zone).toBe('above-p70')
    expect(a.damageFactor).toBeCloseTo(damageFactor(2500, CAPS))
    expect(a.next).toBeNull()
    expect(a.text).toContain('почти ничего не даёт')
    expect(a.text).toContain('лучше HP/ATK')
    // Вплоть до cap урон падает всего до 0.25 — то, чем обоснован совет.
    expect(a.text).toContain('25%')
  })

  it('границы зон: ровно p50 — уже «до p70», ровно p70 — «выше p70»', () => {
    expect(defAdvice({ def: 999, caps: CAPS }).zone).toBe('to-p50')
    expect(defAdvice({ def: 1000, caps: CAPS }).zone).toBe('to-p70')
    expect(defAdvice({ def: 1999, caps: CAPS }).zone).toBe('to-p70')
    expect(defAdvice({ def: 2000, caps: CAPS }).zone).toBe('above-p70')
  })

  it('без порогов кривая не строится', () => {
    const a = defAdvice({ def: 5000, caps: null })
    expect(a.zone).toBe('no-caps')
    expect(a.damageFactor).toBe(1)
    expect(a.text).toContain('Defense cap')
  })
})

describe('defAdvice: мало HP — не советовать урезать DEF (A75)', () => {
  const party = [1000, 3000, 5000] // медиана 3000

  it('HP ниже медианы отряда → lowHp и оговорка в тексте', () => {
    const a = defAdvice({ def: 2500, hp: 2000, partyHp: party, caps: CAPS })
    expect(a.lowHp).toBe(true)
    expect(a.text).toContain('урезать DEF нельзя')
    expect(a.text).toContain('сначала HP')
  })

  it('HP не ниже медианы → совет «лучше HP/ATK» без оговорки', () => {
    const a = defAdvice({ def: 2500, hp: 4000, partyHp: party, caps: CAPS })
    expect(a.lowHp).toBe(false)
    expect(a.text).not.toContain('урезать DEF нельзя')
    expect(a.text).toContain('лучше HP/ATK')
  })

  it('одиночный боец: сравнить не с чем — правило не применяется', () => {
    expect(hasLowHp(10, undefined)).toBe(false)
    expect(hasLowHp(10, [10])).toBe(false)
    expect(hasLowHp(10, [10, 100])).toBe(true)
    expect(defAdvice({ def: 2500, hp: 2000, caps: CAPS }).lowHp).toBe(false)
  })
})
