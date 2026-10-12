/**
 * Этажи Гробницы Титанов (A71/A77): хранение в IndexedDB (в тестах — memoryStore), замена этажа по номеру,
 * экспорт/импорт JSON и слияние с текущим набором.
 */
import { describe, expect, it } from 'vitest'
import { TOMB_DEFAULT_STATS } from '../engine/constants.ts'
import { tombQuest, tombQuestId, type TombFloor } from '../engine/questMods.ts'
import { loadTombFloors, mergeTombFloors, removeTombFloor, saveTombFloors, tombFloorsFromJson, tombFloorsToJson, upsertTombFloor } from './tombFloors.ts'
import { memoryStore } from './storage.ts'

const floor = (depth: number, over: Partial<TombFloor> = {}): TombFloor => ({
  id: tombQuestId(depth),
  depth,
  monsterHp: 1_000_000 * depth,
  monsterDmg: 100 * depth,
  monsterAoe: 50,
  defenseCap: 100_000,
  barrier: null,
  mods: [],
  difficulty: 'Extreme',
  ...over,
})

describe('этажи Гробницы Титанов: хранение (A71/A77)', () => {
  it('пустое хранилище — пустой список', async () => {
    expect(await loadTombFloors(memoryStore())).toEqual([])
  })

  it('сохранение и чтение: этажи идут по возрастанию номера', async () => {
    const store = memoryStore()
    await saveTombFloors([floor(5), floor(2)], store)
    const loaded = await loadTombFloors(store)
    expect(loaded.map((f) => f.depth)).toEqual([2, 5])
    expect(loaded[0].defenseCap).toBe(100_000)
  })

  it('мусор в хранилище не роняет загрузку', async () => {
    const store = memoryStore({ tombFloors: [{ depth: 'не число' }] })
    expect(await loadTombFloors(store)).toEqual([])
  })

  it('upsert: тот же номер перезаписывает этаж, а не создаёт дубликат', async () => {
    const store = memoryStore()
    await upsertTombFloor({ depth: 3, monsterHp: 111, defenseCap: 5000 }, store)
    const after = await upsertTombFloor({ depth: 3, monsterHp: 222, defenseCap: 6000 }, store)
    expect(after).toHaveLength(1)
    expect(after[0].monsterHp).toBe(222)
    // Незаполненные поля берут значения по умолчанию из датасета stcalc.
    expect(after[0].monsterDmg).toBe(TOMB_DEFAULT_STATS.monsterDmg)
    expect(after[0].monsterAoe).toBe(TOMB_DEFAULT_STATS.monsterAoe)
  })

  it('remove: этаж удаляется по номеру', async () => {
    const store = memoryStore()
    await saveTombFloors([floor(1), floor(2)], store)
    const next = await removeTombFloor(1, store)
    expect(next.map((f) => f.depth)).toEqual([2])
    expect((await loadTombFloors(store)).map((f) => f.depth)).toEqual([2])
  })
})

describe('этажи Гробницы: экспорт и импорт JSON (A77)', () => {
  it('экспорт → импорт сохраняет этажи и модификаторы', async () => {
    const source = [floor(4, { mods: ['immortal', 'armored'], barrier: { element: 'Dark', hp: 350 } })]
    const parsed = tombFloorsFromJson(tombFloorsToJson(source))
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.floors).toEqual(source)
    // Экспорт — валидный JSON с описанием формата.
    const raw = JSON.parse(tombFloorsToJson(source)) as { kind: string; area: string; floors: unknown[] }
    expect(raw.kind).toBe('tombFloors')
    expect(raw.area).toBe('Tomb of Titans')
    expect(raw.floors).toHaveLength(1)
  })

  it('принимается и просто массив этажей', () => {
    const parsed = tombFloorsFromJson(JSON.stringify([floor(1)]))
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.floors).toHaveLength(1)
  })

  it('битый JSON и неверный формат — человекочитаемая ошибка', () => {
    expect(tombFloorsFromJson('{не json')).toMatchObject({ error: expect.stringContaining('не JSON') })
    expect(tombFloorsFromJson('{"floors":[{"depth":-1}]}')).toMatchObject({ error: expect.stringContaining('не подходит') })
  })

  it('слияние: импортированный этаж с тем же номером заменяет текущий, остальные остаются', () => {
    const merged = mergeTombFloors([floor(1), floor(2)], [floor(2, { monsterHp: 999 }), floor(3)])
    expect(merged.map((f) => f.depth)).toEqual([1, 2, 3])
    expect(merged.find((f) => f.depth === 2)?.monsterHp).toBe(999)
  })
})

describe('этаж Гробницы → квест (A71/A77)', () => {
  it('квест этажа несёт введённые статы, пороги из cap и модификаторы', () => {
    const { quest } = tombQuest({ depth: 7, monsterHp: 12_000_000, monsterDmg: 400, defenseCap: 200_000, mods: ['immortal', 'hates_rogues'] })
    expect(quest.id).toBe('Tomb of Titans|tomb|7')
    expect(quest.monsterHp).toBe(24_000_000) // +100% от immortal
    expect(quest.monsterDmg).toBe(400)
    expect(quest.defCaps).toEqual({ p50: 200_000 / 6, p70: 200_000 / 3, p75: 200_000 })
    expect(quest.battle).toMatchObject({ targetGroup: 'Rogue', targetMult: 3, heroCritChancePct: -20 })
    // Квест сразу пригоден для движка: это боссовый квест Гробницы.
    expect(quest.variant).toBe('boss')
    expect(quest.isTomb).toBe(true)
  })
})
