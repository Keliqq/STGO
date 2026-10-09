import { describe, expect, it } from 'vitest'
import { applyQuality, statsByQuality } from './quality.ts'

const base = { atk: 100, def: 41, hp: 7, eva: 0.05, crit: 0.1, manaShield: 25 }

describe('качество предмета (A7)', () => {
  it('Normal — без изменений', () => {
    expect(applyQuality(base, 'Normal')).toEqual(base)
  })

  it('множители к ATK/DEF/HP/Mana Shield, EVA/CRIT не меняются, округление', () => {
    expect(applyQuality(base, 'Superior')).toEqual({ atk: 125, def: 51, hp: 9, eva: 0.05, crit: 0.1, manaShield: 31 })
    expect(applyQuality(base, 'Legendary')).toMatchObject({ atk: 300, def: 123, hp: 21 })
  })

  it('statsByQuality — все 5 качеств по возрастанию', () => {
    const all = statsByQuality(base)
    expect(Object.keys(all)).toEqual(['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary'])
    expect(all.Flawless.atk).toBe(150)
    expect(all.Epic.atk).toBe(200)
  })
})
