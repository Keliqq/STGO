import { describe, expect, it } from 'vitest'
import { exportAppStateJson, importAppStateJson } from './appState.ts'
import { loadHeroes } from './heroStore.ts'
import { loadConstraintOverrides, saveConstraintOverrides } from './optimizeSettings.ts'
import { memoryStore } from './storage.ts'
import type { HeroInstance } from './types.ts'

const hero: HeroInstance = {
  id: 'h1',
  name: 'Антуан',
  className: 'Soldier',
  level: 20,
  titanSoul: false,
  slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as const, element: null, spirit: null })),
  skills: [],
  seeds: { atk: 0, def: 0, hp: 0 },
  reference: null,
  draft: false,
  originId: null,
}

describe('резервная копия состояния', () => {
  it('экспорт → импорт в пустую базу', async () => {
    const src = memoryStore({ heroes: { version: 2, heroes: [hero] } })
    const json = await exportAppStateJson(new Date('2026-10-10T00:00:00Z'), src)
    expect(JSON.parse(json)).not.toHaveProperty('inventory')
    const dst = memoryStore()
    const r = await importAppStateJson(json, dst)
    expect(r).toMatchObject({ heroesAdded: 1, counts: { heroes: 1, realityChecks: 0 } })
    expect((await loadHeroes(dst)).heroes).toEqual([hero])
  })

  it('запись героев версии 1 читается: черновик и происхождение достраиваются', async () => {
    // Формат до сессии 25: полей draft/originId в сохранённых героях не было.
    const legacy = { ...hero, draft: undefined, originId: undefined }
    const store = memoryStore({ heroes: { version: 1, heroes: [legacy] } })
    const loaded = await loadHeroes(store)
    expect(loaded.error).toBeNull()
    expect(loaded.heroes).toEqual([hero])
  })

  it('файл старой версии с инвентарём импортируется, инвентарь игнорируется', async () => {
    const old = {
      format: 'st-app/state',
      version: 1,
      exportedAt: '2026-10-09T00:00:00.000Z',
      heroes: [hero],
      inventory: { version: 1, items: [{ name: 'Sword', quality: 'Epic' }], stones: [], spirits: [] },
      realityChecks: [],
    }
    const dst = memoryStore({ inventory: old.inventory })
    const r = await importAppStateJson(JSON.stringify(old), dst)
    expect(r).toMatchObject({ heroesAdded: 1 })
    expect(dst.dump().inventory).toEqual(old.inventory) // старая запись не трогается и не читается
  })
})

describe('сохранённые ограничения подбора', () => {
  it('по умолчанию все null; сохранённые читаются; мусор → по умолчанию', async () => {
    const store = memoryStore()
    expect(await loadConstraintOverrides(store)).toEqual({ maxItemTier: null, maxQuality: null, maxStoneTier: null, spirits: null })
    const o = { maxItemTier: 12, maxQuality: 'Epic' as const, maxStoneTier: null, spirits: ['Bear Spirit'] }
    await saveConstraintOverrides(o, store)
    expect(await loadConstraintOverrides(store)).toEqual(o)
    const bad = memoryStore({ optimizeSettings: { version: 1, overrides: { maxItemTier: 'x' } } })
    expect((await loadConstraintOverrides(bad)).maxItemTier).toBeNull()
  })
})
