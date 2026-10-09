/** Табличные листы: BLUEPRINTS, ENCHANTMENTS, SKILLS, HERO LEVELS. */
import { describe, expect, it } from 'vitest'
import { fixtureRows, withCell } from '../../test/fixtures.ts'
import { parseBlueprints } from './blueprints.ts'
import { SchemaError, cost, num, pctWithBonus, titleCase } from './cells.ts'
import { parseEnchantments, parseHeroLevels, parseSkills } from './simpleSheets.ts'

describe('ячейки', () => {
  it('числа, проценты, цены, регистр', () => {
    expect(num('"1,250"'.replace(/"/g, ''))).toBe(1250)
    expect(num('---')).toBeNull()
    expect(() => num('abc')).toThrow()
    expect(pctWithBonus('20% (+20%)')).toEqual({ value: 0.2, bonus: 0.2 })
    expect(cost('FREE')).toBe(0)
    expect(cost('25 Coins')).toBe(25)
    expect(titleCase("SUN GOD'S TOMB")).toBe("Sun God's Tomb")
    expect(titleCase('LOST CITY OF GOLD')).toBe('Lost City of Gold')
  })
})

describe('parseBlueprints', () => {
  const rows = fixtureRows('BLUEPRINTS')
  const { rows: items, rejects } = parseBlueprints(rows)
  const byName = new Map(items.map((i) => [i.name, i]))

  it('все строки, без дублей и отказов', () => {
    expect(rejects.items).toEqual([])
    expect(items).toHaveLength(rows.length - 1)
    expect(new Set(items.map((i) => i.name)).size).toBe(items.length)
  })

  it('статы, сродство, встроенные камни и духи, апгрейды', () => {
    expect(byName.get('Squire Sword')).toMatchObject({ type: 'Sword', tier: 1, base: { atk: 16, def: 0, hp: 0 } })
    expect(items.some((i) => Array.isArray(i.elementAffinity) && i.elementAffinity.length > 1)).toBe(true)
    expect(items.some((i) => i.elementAffinity === 'All')).toBe(true)
    expect(items.filter((i) => i.builtInSpirit === "Mundra's Spirit").length).toBe(10)
    expect(items.some((i) => i.transcendence.some((u) => /Base ATK, DEF and HP/.test(u.text)))).toBe(true)
  })

  it('сдвинутая колонка → SchemaError (кэш не трогаем)', () => {
    const broken = rows.map((r) => [r[0], ...r]) // всё съехало на 1 вправо
    expect(() => parseBlueprints(broken)).toThrow(SchemaError)
  })

  it('мусор в стате → отказ строки, остальные разобраны', () => {
    const res = parseBlueprints(withCell(rows, 1, 44, 'шестнадцать'))
    expect(res.rows).toHaveLength(rows.length - 2)
    expect(res.rejects.items).toEqual([{ sheet: 'BLUEPRINTS', row: 2, key: 'Squire Sword', reason: 'ATK: не число «шестнадцать»' }])
  })
})

describe('parseEnchantments', () => {
  const { rows, rejects } = parseEnchantments(fixtureRows('ENCHANTMENTS'))
  it('33 камня и 40 духов; у камня ровно одна стихия', () => {
    expect(rejects.items).toEqual([])
    expect(rows.filter((r) => r.kind === 'element')).toHaveLength(33)
    expect(rows.filter((r) => r.kind === 'spirit')).toHaveLength(40)
    expect(rows.find((r) => r.name === 'Ember Element')).toMatchObject({ element: 'Fire', elementValue: 5 })
    expect(rows.find((r) => r.name === 'Platinum Element')).toMatchObject({ element: 'Gold', elementValue: 35 })
  })
})

describe('parseSkills', () => {
  const { rows, rejects } = parseSkills(fixtureRows('SKILLS'))
  it('621 навык, линейки по Tier', () => {
    expect(rejects.items).toEqual([])
    expect(rows).toHaveLength(620 + 1)
    const cleave = rows.filter((r) => r.line === 'Cleave').map((r) => r.name)
    expect(cleave[0]).toBe('Cleave')
    expect(cleave.length).toBeGreaterThan(1)
    expect(rows.find((r) => r.name === 'Sellsword Lord')).toMatchObject({ type: 'Innate', tier: 4, requiresPromotion: true, line: 'Second-in-Command' })
    expect(rows.find((r) => r.name === 'Quiver Bow Bonus')?.type).toBe('Other')
  })
})

describe('parseHeroLevels', () => {
  it('50 уровней, макс. тир растёт', () => {
    const { rows } = parseHeroLevels(fixtureRows('HERO LEVELS'))
    expect(rows).toHaveLength(50)
    expect(rows[0]).toEqual({ level: 1, xp: null, maxItemTier: 1 })
    expect(rows.at(-1)?.maxItemTier).toBeGreaterThanOrEqual(15)
  })
})
