import { describe, expect, it } from 'vitest'
import { fixtureRows } from '../../test/fixtures.ts'
import { SchemaError } from './cells.ts'
import { parseQuestLevels } from './questLevels.ts'

const rows = fixtureRows('QUEST LEVELS')

describe('parseQuestLevels (фикстура QUEST LEVELS)', () => {
  const { rows: levels, rejects } = parseQuestLevels(rows)

  it('14 локаций × 25 уровней', () => {
    expect(rejects.items).toEqual([])
    expect(new Set(levels.map((l) => l.area)).size).toBe(14)
    expect(levels).toHaveLength(350)
  })

  it('награды текстом', () => {
    expect(levels[0]).toEqual({ area: 'Howling Woods', level: 1, reward: 'Elven Wood, Iron Pine Cone, Glow Shroom Unlocked' })
    expect(levels.some((l) => l.area === 'Meteor Zone' && /Boss Unlocked/.test(l.reward))).toBe(true)
  })

  it('без пар «Level | Reward» → SchemaError', () => {
    expect(() => parseQuestLevels(rows.slice(0, 2))).toThrow(SchemaError)
  })
})
