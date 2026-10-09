import { describe, expect, it } from 'vitest'
import { fixtureRows, withCell } from '../../test/fixtures.ts'
import { SchemaError, findCells } from './cells.ts'
import { parseHeroes } from './heroes.ts'

const rows = fixtureRows('HEROES')

describe('parseHeroes (фикстура HEROES)', () => {
  const { cards, rejects } = parseHeroes(rows)
  const byName = new Map(cards.map((c) => [c.name, c]))

  it('42 карточки: 21 базовый класс + 21 промоушен, без отказов', () => {
    expect(rejects.items).toEqual([])
    expect(cards).toHaveLength(42)
    expect(cards.filter((c) => c.baseClass)).toHaveLength(21)
    expect(new Set(cards.map((c) => c.name)).size).toBe(42)
  })

  it('по 6 слотов, в каждом есть типы', () => {
    for (const c of cards) {
      expect(c.slots, c.name).toHaveLength(6)
      for (const s of c.slots) expect(s.length, c.name).toBeGreaterThan(0)
    }
  })

  it('Soldier: статы, стихия, слоты, уровни открытия навыков', () => {
    const s = byName.get('Soldier')!
    expect(s).toMatchObject({
      group: 'Fighter',
      element: 'Earth',
      baseClass: null,
      goldHireCost: 0,
      base: { hp: 30, atk: 10, def: 15, eva: 0, crit: 0.05, critDmg: 2, threat: 90 },
    })
    expect(s.slots[0]).toEqual(['Sword', 'Mace', 'Dagger', 'Scythe'])
    expect(s.slots[4]).toEqual(['Potion', 'Meal'])
    expect(s.skillSlotLevels).toEqual([4, 9])
  })

  it('промоушен: подпись «(X Class Promotion)», Душа Титана', () => {
    const m = byName.get('Mercenary')!
    expect(m.baseClass).toBe('Soldier')
    expect(m.prerequisite).toBe('Titan Soul')
    expect(m.slots[0]).toContain('Spear')
    expect(byName.get('Arch Druid')?.baseClass).toBe('Druid')
  })

  it('бонус врождённого навыка в скобках: `20% (+20%)`', () => {
    const ninja = byName.get('Ninja')!
    expect(ninja.base.eva).toBeCloseTo(0.3)
    expect(ninja.innateBonus.eva).toBeCloseTo(0.2)
    expect(ninja.innateBonus.crit).toBeCloseTo(0.2)
    expect(byName.get('Spellblade')?.element).toBe('Any')
  })

  it('карточка без ожидаемой подписи → отказ этой карточки, остальные разобраны', () => {
    const [r, c] = findCells(rows, 'Prerequisite')[0]
    const broken = withCell(rows, r + 1, c, 'Crit Chance') // была «Critical Hit Chance»
    const res = parseHeroes(broken)
    expect(res.cards).toHaveLength(41)
    expect(res.rejects.items).toHaveLength(1)
    expect(res.rejects.items[0].reason).toMatch(/Critical Hit Chance/)
  })

  it('разбор не зависит от номеров строк: лишняя строка сверху', () => {
    const shifted = [rows[0].map(() => ''), ...rows]
    expect(parseHeroes(shifted).cards).toHaveLength(42)
  })

  it('лист без карточек → SchemaError', () => {
    expect(() => parseHeroes([['FIGHTER CLASSES']])).toThrow(SchemaError)
  })
})
