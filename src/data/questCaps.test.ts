/**
 * «Defense cap с экрана игры» (A71): хранение в IndexedDB (в тестах — memoryStore) и подстановка
 * в `defCaps` тем квестам, у которых порогов stcentral-hub нет.
 */
import { describe, expect, it } from 'vitest'
import type { Quest } from '../data/types.ts'
import { KEYS, memoryStore } from '../data/storage.ts'
import { applyUserQuestCaps, loadQuestCaps, QuestCapsSchema, saveQuestCaps } from '../data/questCaps.ts'

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'Lost City of Gold|normal|1',
  area: 'Lost City of Gold',
  variant: 'normal',
  difficulty: '1',
  minPower: null,
  heroXp: null,
  monsterHp: 1000,
  monsterDmg: 100,
  monsterAoe: 0,
  barrier: null,
  defCaps: null,
  miniBosses: [],
  ...over,
})

describe('пороги из «Defense cap с экрана игры» (A71)', () => {
  it('сохранение и чтение из хранилища; мусор в кэше игнорируется', async () => {
    const store = memoryStore()
    expect(await loadQuestCaps(store)).toEqual({})
    await saveQuestCaps({ 'Lost City of Gold|normal|1': 159600 }, store)
    expect(await loadQuestCaps(store)).toEqual({ 'Lost City of Gold|normal|1': 159600 })
    expect(store.dump()[KEYS.questCaps]).toEqual({ 'Lost City of Gold|normal|1': 159600 })
    await store.set(KEYS.questCaps, { 'x|y|z': -5 })
    expect(await loadQuestCaps(store)).toEqual({})
    expect(QuestCapsSchema.safeParse({ a: 1.5 }).success).toBe(false)
  })

  it('cap подставляется как cap/6 · cap/3 · cap — только квестам без порогов хаба', () => {
    const withHubCaps = quest({ id: 'Howling Woods|normal|Easy', defCaps: { p50: 1000, p70: 2000, p75: 6000 } })
    const lcog = quest()
    const caps = { 'Lost City of Gold|normal|1': 159600, 'Howling Woods|normal|Easy': 600 }
    const r = applyUserQuestCaps([withHubCaps, lcog, quest({ id: 'нет в карте' })], caps)
    expect(r.matched).toBe(1)
    expect(r.quests[0].defCaps).toEqual({ p50: 1000, p70: 2000, p75: 6000 }) // пороги хаба важнее
    expect(r.quests[1].defCaps).toEqual({ p50: 26600, p70: 53200, p75: 159600 })
    expect(r.quests[2].defCaps).toBeNull()
    // Исходные объекты не меняются (GameData переиспользуется).
    expect(lcog.defCaps).toBeNull()
  })
})
