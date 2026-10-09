import Papa from 'papaparse'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bundledImageMap, fixtureGameData, fixtureSheets } from '../test/fixtures.ts'
import { SHEET_GIDS } from './fetchSheet.ts'
import { type KeyValueStore, KEYS, memoryStore } from './storage.ts'
import { type CachedGameData, diff, diffMessage, ensureFresh, getStatus, loadGameData, resetSyncState } from './sync.ts'
import type { RawSheets } from './types.ts'

const NOW = new Date('2026-10-10T12:00:00.000Z')
const now = () => NOW
const imageMap = bundledImageMap()
const deps = (store: KeyValueStore, fetchImpl: typeof fetch) => ({
  store,
  fetchImpl,
  now,
  loadImageMap: async () => imageMap,
  loadSnapshot: async () => fixtureGameData(),
})

/** Подменённый fetch: export по gid → CSV из `sheets`. Всё прочее — 404. */
function fakeGoogle(sheets: RawSheets): typeof fetch & { calls: string[] } {
  const byGid = new Map(Object.entries(SHEET_GIDS).map(([name, gid]) => [String(gid), name]))
  const calls: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const gid = url.match(/gid=(\d+)/)?.[1]
    const name = gid ? byGid.get(gid) : undefined
    if (name && sheets[name]) {
      return new Response(Papa.unparse(sheets[name]), { headers: { 'content-type': 'text/csv' } })
    }
    return new Response('not found', { status: 404 })
  })
  return Object.assign(impl as unknown as typeof fetch, { calls })
}

/** Кэш: данные «вчерашние» (старше 24 ч). */
function staleCache(): CachedGameData {
  const data = fixtureGameData()
  data.fetchedAt = '2026-10-08T00:00:00.000Z'
  return { data, savedAt: data.fetchedAt, gids: {} }
}

beforeEach(() => resetSyncState())

describe('loadGameData', () => {
  it('пустой IndexedDB → встроенный снапшот', async () => {
    const store = memoryStore()
    const d = await loadGameData(deps(store, fakeGoogle({})))
    expect(d.items).toHaveLength(1549)
    expect(getStatus().source).toBe('snapshot')
  })

  it('есть кэш → из кэша', async () => {
    const store = memoryStore({ [KEYS.gameData]: staleCache() })
    const d = await loadGameData(deps(store, fakeGoogle({})))
    expect(d.fetchedAt).toBe('2026-10-08T00:00:00.000Z')
    expect(getStatus().source).toBe('cache')
  })

  it('кэш несовместимой формы → снапшот + предупреждение', async () => {
    const store = memoryStore({ [KEYS.gameData]: { data: { version: 0 }, savedAt: '', gids: {} } })
    await loadGameData(deps(store, fakeGoogle({})))
    expect(getStatus().source).toBe('snapshot')
    expect(getStatus().warnings.join()).toMatch(/несовместим/)
  })
})

describe('ensureFresh', () => {
  it('данные свежее TTL → ничего не грузим', async () => {
    const cache = staleCache()
    cache.data.fetchedAt = '2026-10-10T06:00:00.000Z'
    const store = memoryStore({ [KEYS.gameData]: cache })
    const google = fakeGoogle(fixtureSheets())
    expect(await ensureFresh(24, deps(store, google))).toEqual({ updated: false, skipped: 'fresh' })
    expect(google.calls).toEqual([])
  })

  it('успех: кэш заменён, diff и сообщение «+N предметов, изменено M»', async () => {
    const store = memoryStore({ [KEYS.gameData]: staleCache() })
    const sheets = fixtureSheets()
    // Новый предмет и изменённая атака у Squire Sword
    const newRow = [...sheets.BLUEPRINTS[1]]
    newRow[0] = 'Test Blade'
    sheets.BLUEPRINTS = [...sheets.BLUEPRINTS, newRow]
    sheets.BLUEPRINTS[1] = [...sheets.BLUEPRINTS[1]]
    sheets.BLUEPRINTS[1][44] = '17'

    const res = await ensureFresh(24, deps(store, fakeGoogle(sheets)))
    expect(res.updated).toBe(true)
    expect(res.diff?.addedItems).toEqual(['Test Blade'])
    expect(res.diff?.changedItems).toEqual([{ name: 'Squire Sword', fields: [{ field: 'atk', before: 16, after: 17 }] }])
    expect(getStatus()).toMatchObject({ source: 'fresh', error: null, dataDate: NOW.toISOString() })
    expect(getStatus().lastUpdate?.message).toBe('Данные обновлены: +1 предметов, изменено 1')

    const saved = await store.get<CachedGameData>(KEYS.gameData)
    expect(saved?.data.items).toHaveLength(1550)
    expect(saved?.gids.BLUEPRINTS).toBe(SHEET_GIDS.BLUEPRINTS)
  })

  it('сломанная схема листа → кэш НЕ затёрт, ошибка в статусе', async () => {
    const before = staleCache()
    const store = memoryStore({ [KEYS.gameData]: before })
    const sheets = fixtureSheets()
    sheets.BLUEPRINTS = sheets.BLUEPRINTS.map((r) => ['', ...r]) // колонки съехали
    const res = await ensureFresh(24, deps(store, fakeGoogle(sheets)))
    expect(res.updated).toBe(false)
    expect(res.error).toMatch(/структура изменилась/)
    expect(getStatus().error).toMatch(/Работаю на прежних данных/)
    expect(await store.get(KEYS.gameData)).toEqual(before)
  })

  it('карточный лист без якорей (как после gviz) → кэш НЕ затёрт', async () => {
    const before = staleCache()
    const store = memoryStore({ [KEYS.gameData]: before })
    const sheets = fixtureSheets()
    sheets.HEROES = sheets.HEROES.map((r) => r.map((v) => (v === 'Prerequisite' ? '' : v)))
    const res = await ensureFresh(24, deps(store, fakeGoogle(sheets)))
    expect(res.error).toMatch(/HEROES/)
    expect(await store.get(KEYS.gameData)).toEqual(before)
  })

  it('таблица недоступна (сеть) → кэш НЕ затёрт', async () => {
    const before = staleCache()
    const store = memoryStore({ [KEYS.gameData]: before })
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const res = await ensureFresh(24, { ...deps(store, offline) })
    expect(res.updated).toBe(false)
    expect(res.error).toMatch(/Не удалось обновить данные/)
    expect(await store.get(KEYS.gameData)).toEqual(before)
  }, 20_000)

  it('повторный вызов во время проверки получает тот же промис', async () => {
    const store = memoryStore({ [KEYS.gameData]: staleCache() })
    const google = fakeGoogle(fixtureSheets())
    const a = ensureFresh(24, deps(store, google))
    const b = ensureFresh(24, deps(store, google))
    expect(a).toBe(b)
    await a
  })
})

describe('diff', () => {
  it('удалённые предметы и прочие сущности', () => {
    const a = fixtureGameData()
    const b = fixtureGameData()
    b.items = b.items.filter((i) => i.name !== 'Squire Sword')
    b.quests[0] = { ...b.quests[0], monsterHp: 1 }
    const d = diff(a, b)
    expect(d.removedItems).toEqual(['Squire Sword'])
    expect(d.other.quests).toEqual({ added: 0, removed: 0, changed: 1 })
    expect(diffMessage(d)).toBe('Данные обновлены: +0 предметов, изменено 0, удалено 1, прочих изменений: 1')
  })
})
