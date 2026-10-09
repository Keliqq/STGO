import { describe, expect, it } from 'vitest'
import { fixtureRows } from '../../test/fixtures.ts'
import { SchemaError } from './cells.ts'
import { parseSlots } from './slots.ts'

const rows = fixtureRows('SLOTS')

describe('parseSlots (фикстура SLOTS)', () => {
  const { rows: slots, rejects } = parseSlots(rows)

  it('5 блоков, 41 слот героев', () => {
    expect(rejects.items).toEqual([])
    expect(new Set(slots.map((s) => s.kind))).toEqual(new Set(['hero', 'crafting', 'quest', 'trade', 'pet']))
    expect(slots.filter((s) => s.kind === 'hero')).toHaveLength(41)
  })

  it('значения: требования, цены с разделителем тысяч', () => {
    expect(slots.find((s) => s.kind === 'hero' && s.n === 2)).toEqual({ kind: 'hero', n: 2, requirement: 'Lv. 3', goldCost: 500, gemCost: 10 })
    expect(slots.find((s) => s.kind === 'hero' && s.n === 41)).toMatchObject({ requirement: 'Loop 1, Lv. 80', goldCost: 60_000_000_000 })
  })

  it('нет блока HERO SLOTS → SchemaError', () => {
    expect(() => parseSlots([['', 'CRAFTING SLOTS']])).toThrow(SchemaError)
  })
})
