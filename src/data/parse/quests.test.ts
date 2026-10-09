import { describe, expect, it } from 'vitest'
import { fixtureRows, withCell } from '../../test/fixtures.ts'
import { SchemaError, findCells } from './cells.ts'
import { parseQuests } from './quests.ts'

const rows = fixtureRows('QUESTS')

describe('parseQuests (фикстура QUESTS)', () => {
  const { areas, quests, rejects } = parseQuests(rows)
  const byId = new Map(quests.map((q) => [q.id, q]))

  it('15 локаций, 138 квестов, без отказов и дублей', () => {
    expect(rejects.items).toEqual([])
    expect(areas).toHaveLength(15)
    expect(quests).toHaveLength(138)
    expect(new Set(quests.map((q) => q.id)).size).toBe(138)
  })

  it('Howling Woods: шапка блока по подписям', () => {
    expect(areas[0]).toEqual({
      name: 'Howling Woods',
      partySize: 3,
      goldUnlockCost: 500,
      gemUnlockCost: 50,
      requiredMerchantLevel: null,
      chest: 'Wooden',
    })
    expect(areas.find((a) => a.name === "Sun God's Tomb")?.partySize).toBe(4)
  })

  it('сложности: HP/урон босса, барьер из трёх стихий у обычного Extreme и одной у босса', () => {
    expect(byId.get('Howling Woods|normal|Easy')).toMatchObject({ monsterHp: 250, monsterDmg: 8, monsterAoe: 5, barrier: null, minPower: null })
    expect(byId.get('Howling Woods|normal|Extreme')?.barrier).toEqual({ elements: ['Air', 'Earth', 'Light'], hp: 15 })
    expect(byId.get('Howling Woods|boss|Extreme')).toMatchObject({ monsterHp: 80_000, barrier: { elements: ['Air'], hp: 30 } })
    expect(quests.every((q) => q.defCaps === null)).toBe(true) // порогов в таблице нет (A10)
  })

  it('Lost City of Gold: уровни 1–13 обычные и боссы; пустой барьер `` = нет барьера', () => {
    const lcog = quests.filter((q) => q.area === 'Lost City of Gold')
    expect(lcog).toHaveLength(26)
    expect(byId.get('Lost City of Gold|boss|13')).toMatchObject({ monsterHp: 12_000_000, barrier: null })
  })

  it('колонки ищутся по заголовку: перестановка колонок не ломает разбор', () => {
    const swapped = rows.map((r) => {
      const c = [...r]
      ;[c[13], c[14]] = [c[14], c[13]]
      return c
    })
    const q = parseQuests(swapped).quests.find((x) => x.id === 'Howling Woods|normal|Easy')
    expect(q).toMatchObject({ monsterDmg: 8, monsterAoe: 5 })
  })

  it('битая строка сложности → отказ строки', () => {
    const [[r]] = findCells(rows, 'Maximum Party Size')
    const res = parseQuests(withCell(rows, r + 3, 12, 'много'))
    expect(res.quests).toHaveLength(137)
    expect(res.rejects.items[0]).toMatchObject({ key: 'Howling Woods Easy', row: r + 4 })
  })

  it('мало блоков → SchemaError', () => {
    expect(() => parseQuests(rows.slice(0, 30))).toThrow(SchemaError)
  })
})
