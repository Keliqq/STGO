import { describe, expect, it } from 'vitest'
import { mergeInventory, parseInventoryCsv, EMPTY_INVENTORY } from './inventory.ts'
import { memoryStore } from './storage.ts'
import { loadInventory, saveInventory } from './inventory.ts'
import { fixtureGameData } from '../test/fixtures.ts'

const data = fixtureGameData()
const sword = data.items.find((i) => i.isEquipment && i.type === 'Sword')!
const stone = data.enchants.find((e) => e.kind === 'element')!
const spirit = data.enchants.find((e) => e.kind === 'spirit')!

describe('parseInventoryCsv', () => {
  it('читает предметы, камни и духов; неизвестные имена — в unknown', () => {
    const csv = `type,name,quality\nitem,${sword.name},Epic\nstone,${stone.name}\nspirit,${spirit.name}\nitem,Несуществующий Меч,Normal`
    const r = parseInventoryCsv(csv, data)
    expect(r.inventory.items).toEqual([{ name: sword.name, quality: 'Epic' }])
    expect(r.inventory.stones).toEqual([stone.name])
    expect(r.inventory.spirits).toEqual([spirit.name])
    expect(r.unknown).toEqual(['Несуществующий Меч'])
  })

  it('повтор предмета оставляет лучшее качество, пустое качество — Normal', () => {
    const csv = `type,name,quality\nitem,${sword.name},Superior\nitem,${sword.name},Flawless\nitem,${sword.name}`
    const r = parseInventoryCsv(csv, data)
    expect(r.inventory.items).toEqual([{ name: sword.name, quality: 'Flawless' }])
  })

  it('неизвестный тип — ошибка строки', () => {
    const r = parseInventoryCsv('type,name\nfish,Whale', data)
    expect(r.errors.length).toBe(1)
    expect(r.inventory.items).toHaveLength(0)
  })
})

describe('mergeInventory', () => {
  it('качество берётся лучшее, списки объединяются', () => {
    const a = { ...EMPTY_INVENTORY, items: [{ name: sword.name, quality: 'Normal' as const }], stones: ['x'] }
    const b = { ...EMPTY_INVENTORY, items: [{ name: sword.name, quality: 'Epic' as const }], spirits: ['y'] }
    const m = mergeInventory(a, b)
    expect(m.items).toEqual([{ name: sword.name, quality: 'Epic' }])
    expect(m.stones).toEqual(['x'])
    expect(m.spirits).toEqual(['y'])
  })
})

describe('хранение инвентаря', () => {
  it('save/load через KeyValueStore', async () => {
    const store = memoryStore()
    const inv = { ...EMPTY_INVENTORY, items: [{ name: sword.name, quality: 'Flawless' as const }] }
    await saveInventory(inv, store)
    const r = await loadInventory(store)
    expect(r.error).toBeNull()
    expect(r.inventory).toEqual(inv)
  })
})
