import { describe, expect, it } from 'vitest'
import { fixtureRows, withCell } from '../../test/fixtures.ts'
import { SchemaError, findCells } from './cells.ts'
import { parseChampions, parseStatReward } from './champions.ts'

const rows = fixtureRows('CHAMPIONS')

describe('parseChampions (фикстура CHAMPIONS)', () => {
  const { cards, elementBreakpoints, rejects } = parseChampions(rows)
  const byName = new Map(cards.map((c) => [c.name, c]))

  it('13 чемпионов, 2 гостевых, без отказов', () => {
    expect(rejects.items).toEqual([])
    expect(cards).toHaveLength(13)
    expect(cards.filter((c) => c.guest).map((c) => c.name).sort()).toEqual(['Reinhold', 'Tamas'])
  })

  it('Argon: статы, 11 рангов, лидерские апгрейды, Power Up', () => {
    const a = byName.get('Argon')!
    expect(a).toMatchObject({ element: 'Light', group: 'Fighter', base: { hp: 30, atk: 50, def: 30, critDmg: 2, threat: 90 } })
    expect(a.ranks).toHaveLength(11)
    expect(a.ranks[1]).toEqual({ rank: 2, coins: 15, reward: { hp: 7, atk: 31, def: 43 }, leaderSkill: null })
    expect(a.ranks[3].leaderSkill).toBe('Aura of Resolve')
    expect(a.powerUp?.reward).toEqual({ hp: 14, atk: 62, def: 87 })
  })

  it('Element Breakpoints: 10 строк, ранг 1 без значения', () => {
    expect(elementBreakpoints).toHaveLength(10)
    expect(elementBreakpoints[0]).toEqual({ rank: 1, value: null })
    expect(elementBreakpoints.at(-1)).toEqual({ rank: 20, value: 125 })
  })

  it('битая награда ранга → отказ карточки', () => {
    const [r, c] = findCells(rows, 'Prerequisite')[0]
    const res = parseChampions(withCell(rows, r + 6, c - 2 + 2, 'что-то странное'))
    expect(res.cards).toHaveLength(12)
    expect(res.rejects.items[0].reason).toMatch(/награда ранга/)
  })

  it('нет таблицы Element Breakpoints → SchemaError', () => {
    const [[r, c]] = findCells(rows, 'Element Breakpoints')
    expect(() => parseChampions(withCell(rows, r, c, ''))).toThrow(SchemaError)
  })

  it('parseStatReward', () => {
    expect(parseStatReward('+4 Health, +271 Attack, +39 Defense')).toEqual({ hp: 4, atk: 271, def: 39 })
  })
})
