import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchSheet, fetchSheetResolved, parseCsv, parseHtmlviewGids, SheetFetchError, sheetUrl } from './fetchSheet'

const csvResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' }, ...init })

const fast = { retryDelayMs: 0 }

describe('sheetUrl', () => {
  it('export по gid и gviz по имени', () => {
    expect(sheetUrl('QUESTS')).toMatch(/\/export\?format=csv&gid=1118047087$/)
    expect(sheetUrl('QUEST LEVELS', 'gviz')).toMatch(/tqx=out:csv&sheet=QUEST%20LEVELS$/)
  })
})

describe('parseCsv', () => {
  it('кавычки, запятые в числах, переводы строк в ячейке, хвостовой \\n', () => {
    expect(parseCsv('a,"1,250","x\ny"\n,,\n')).toEqual([
      ['a', '1,250', 'x\ny'],
      ['', '', ''],
    ])
  })

  it('разбирает реальную фикстуру BLUEPRINTS', () => {
    const text = readFileSync(join(__dirname, '../../fixtures/sheets/BLUEPRINTS.csv'), 'utf8')
    const rows = parseCsv(text)
    expect(rows[0].slice(0, 2)).toEqual(['Name', 'Type'])
    expect(rows.length).toBeGreaterThan(1000)
    expect(new Set(rows.map((r) => r.length)).size).toBe(1)
  })
})

describe('fetchSheet', () => {
  it('возвращает строки при успехе', async () => {
    const fetchImpl = vi.fn(async () => csvResponse('Name,Tier\nSquire Sword,1\n'))
    await expect(fetchSheet('BLUEPRINTS', { fetchImpl, ...fast })).resolves.toEqual([
      ['Name', 'Tier'],
      ['Squire Sword', '1'],
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('повторяет после ошибки и в итоге успешно загружает', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(csvResponse('a\n'))
    await expect(fetchSheet('SKILLS', { fetchImpl, ...fast })).resolves.toEqual([['a']])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('после 1 + 2 попыток бросает понятную SheetFetchError', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    const err = await fetchSheet('HEROES', { fetchImpl, ...fast }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SheetFetchError)
    expect((err as SheetFetchError).attempts).toBe(3)
    expect((err as Error).message).toBe('Не удалось загрузить лист «HEROES» (попыток: 3): HTTP 404')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('HTML вместо CSV (закрытая таблица) — ошибка, а не мусорные данные', async () => {
    const fetchImpl = vi.fn(async () => new Response('<!DOCTYPE html><html>', { headers: { 'content-type': 'text/html' } }))
    await expect(fetchSheet('QUESTS', { fetchImpl, retries: 0 })).rejects.toThrow(/HTML-страница/)
  })

  it('таймаут', async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    await expect(fetchSheet('SLOTS', { fetchImpl, timeoutMs: 20, retries: 1, ...fast })).rejects.toThrow(
      'Не удалось загрузить лист «SLOTS» (попыток: 2): превышен таймаут 20 мс',
    )
  })

  it('внешняя отмена прерывает без повторов', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const fetchImpl = vi.fn(async () => csvResponse('a\n'))
    await expect(fetchSheet('SLOTS', { fetchImpl, signal: ctrl.signal })).rejects.toThrow(/отменена/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('parseHtmlviewGids', () => {
  it('имена листов (без учёта регистра) → gid, JS-экранирование', () => {
    // Как в исходнике страницы: экранирование остаётся текстом
    const html =
      String.raw`items.push({name: "Blueprints", pageUrl: "https:\/\/x\/sheet?headers\x3dtrue&gid=1558235212", gid: "1558235212"});` +
      String.raw`items.push({name: "Racks, Counter \u0026 Trunks", pageUrl: "u", gid: "348010505"});`
    expect([...parseHtmlviewGids(html)]).toEqual([
      ['blueprints', 1558235212],
      ['racks, counter & trunks', 348010505],
    ])
  })
})

describe('fetchSheetResolved', () => {
  const NEW_GID = 999

  it('gid сменился → находит новый через htmlview и предупреждает', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(`gid=${NEW_GID}`)) return csvResponse('Name\nok\n')
      if (url.includes('/export')) return new Response('<html>no</html>', { headers: { 'content-type': 'text/html' } })
      return new Response('unexpected', { status: 500 })
    })
    const discover = vi.fn(async () => new Map([['quests', NEW_GID]]))
    const r = await fetchSheetResolved('QUESTS', { fetchImpl, discover, ...fast })
    expect(r).toMatchObject({ rows: [['Name'], ['ok']], source: 'export', gid: NEW_GID })
    expect(r.warning).toMatch(/сменился gid \(1118047087 → 999\)/)
  })

  it('export и поиск gid не помогли → gviz по имени с предупреждением', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/gviz/') ? csvResponse('"Name"\n"ok"\n') : new Response('', { status: 404 }),
    )
    const discover = vi.fn(async () => {
      throw new Error('htmlview: HTTP 403')
    })
    const r = await fetchSheetResolved('QUESTS', { fetchImpl, discover, ...fast })
    expect(r).toMatchObject({ source: 'gviz', gid: null })
    expect(r.warning).toMatch(/через gviz.*HTTP 404.*htmlview: HTTP 403/)
  })

  it('ничего не работает → исходная ошибка export', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }))
    await expect(fetchSheetResolved('QUESTS', { fetchImpl, discover: async () => new Map(), ...fast, retries: 0 })).rejects.toThrow(/HTTP 503/)
  })
})
