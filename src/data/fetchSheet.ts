import Papa from 'papaparse'

/** Публичная таблица Shop Titans (см. CLAUDE.md). */
export const SPREADSHEET_ID = '1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c'

/**
 * Нужные приложению листы → gid.
 * gid нужен для /export?format=csv: это основной способ, потому что gviz
 * теряет значения в колонках со смешанными типами (см. docs/ASSUMPTIONS.md, A1).
 */
export const SHEET_GIDS = {
  BLUEPRINTS: 1558235212,
  QUESTS: 1118047087,
  'QUEST COMPONENTS': 1893574363,
  'QUEST LEVELS': 1268805263,
  HEROES: 525835005,
  'HERO LEVELS': 1921844007,
  CHAMPIONS: 256894468,
  SKILLS: 1214352620,
  ENCHANTMENTS: 24042844,
  SLOTS: 214440679,
} as const satisfies Record<string, number>

export type SheetName = keyof typeof SHEET_GIDS
export const SHEET_NAMES = Object.keys(SHEET_GIDS) as SheetName[]

export type SheetSource = 'export' | 'gviz'

const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`

export function sheetUrl(sheet: SheetName, source: SheetSource = 'export', gid: number = SHEET_GIDS[sheet]): string {
  return source === 'export'
    ? `${BASE_URL}/export?format=csv&gid=${gid}`
    : `${BASE_URL}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`
}

export class SheetFetchError extends Error {
  readonly sheet: string
  readonly attempts: number
  constructor(sheet: string, attempts: number, reason: string, options?: { cause?: unknown }) {
    super(`Не удалось загрузить лист «${sheet}» (попыток: ${attempts}): ${reason}`, options)
    this.name = 'SheetFetchError'
    this.sheet = sheet
    this.attempts = attempts
  }
}

export interface FetchSheetOptions {
  source?: SheetSource
  /** gid для export (по умолчанию из SHEET_GIDS). */
  gid?: number
  /** Таймаут одной попытки, мс. */
  timeoutMs?: number
  /** Сколько раз повторить после первой неудачи. */
  retries?: number
  /** Базовая пауза между попытками, мс (растёт линейно). */
  retryDelayMs?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Сырой CSV-текст → массив строк (каждая строка — массив ячеек, без обрезки). */
export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
  const rows = result.data
  // PapaParse оставляет пустую строку от завершающего \n
  if (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.length === 1 && last[0] === '') rows.pop()
  }
  return rows
}

/**
 * Загружает лист по имени и возвращает массив строк.
 * Таймаут на попытку, по умолчанию 2 повтора, ошибка — SheetFetchError с понятным текстом.
 */
export async function fetchSheet(sheet: SheetName, options: FetchSheetOptions = {}): Promise<string[][]> {
  const {
    source = 'export',
    timeoutMs = 15_000,
    retries = 2,
    retryDelayMs = 1_000,
    signal,
    fetchImpl = globalThis.fetch.bind(globalThis),
  } = options
  const url = sheetUrl(sheet, source, options.gid ?? SHEET_GIDS[sheet])
  const maxAttempts = retries + 1
  let lastReason = 'неизвестная ошибка'
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new SheetFetchError(sheet, attempt - 1, 'загрузка отменена')
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    try {
      const res = await fetchImpl(url, { signal: combined })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ctype = res.headers.get('content-type') ?? ''
      const text = await res.text()
      // Закрытая/удалённая таблица отдаёт HTML-страницу входа вместо CSV
      if (ctype.includes('text/html') || /^\s*<(!doctype|html)/i.test(text)) {
        throw new Error('вместо CSV пришла HTML-страница (таблица закрыта или лист не найден)')
      }
      return parseCsv(text)
    } catch (e) {
      lastError = e
      if (signal?.aborted) throw new SheetFetchError(sheet, attempt, 'загрузка отменена', { cause: e })
      lastReason = timeout.aborted
        ? `превышен таймаут ${timeoutMs} мс`
        : e instanceof TypeError
          ? 'сетевая ошибка или CORS'
          : e instanceof Error
            ? e.message
            : String(e)
      if (attempt < maxAttempts) await sleep(retryDelayMs * attempt)
    }
  }
  throw new SheetFetchError(sheet, maxAttempts, lastReason, { cause: lastError })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ───────────── gid сменился: поиск заново и запасной gviz ─────────────

/** Раскодировать JS-строку из htmlview (`\x27`, `&`, `\/`). */
function unescapeJs(s: string): string {
  return s
    .replace(/\\x([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1')
}

/** Из HTML страницы /htmlview: имя листа (в нижнем регистре) → gid. */
export function parseHtmlviewGids(html: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of html.matchAll(/\{name: "((?:[^"\\]|\\.)*)", pageUrl: "(?:[^"\\]|\\.)*", gid: "(\d+)"/g)) {
    out.set(unescapeJs(m[1]).trim().toLowerCase(), Number(m[2]))
  }
  return out
}

/**
 * Актуальные gid всех листов. Источник — /htmlview (отдаёт CORS; проверено curl c Origin, 2026-10-09).
 * Имена там в другом регистре («Blueprints»), сравниваем без учёта регистра.
 */
export async function discoverGids(options: Pick<FetchSheetOptions, 'timeoutMs' | 'signal' | 'fetchImpl'> = {}): Promise<Map<string, number>> {
  const { timeoutMs = 15_000, signal, fetchImpl = globalThis.fetch.bind(globalThis) } = options
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetchImpl(`${BASE_URL}/htmlview`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!res.ok) throw new Error(`htmlview: HTTP ${res.status}`)
  const gids = parseHtmlviewGids(await res.text())
  if (gids.size === 0) throw new Error('htmlview: список листов не найден')
  return gids
}

export interface ResolvedSheet {
  rows: string[][]
  source: SheetSource
  /** gid, по которому реально загружен лист (для gviz — null). */
  gid: number | null
  /** Что пошло не так и как обошли — показывается в статусе данных. */
  warning?: string
}

export interface ResolveOptions extends Omit<FetchSheetOptions, 'source' | 'gid'> {
  /** Известные gid (кэш прошлых успешных загрузок) поверх SHEET_GIDS. */
  gids?: Partial<Record<SheetName, number>>
  /** Общий на все листы поиск gid (чтобы не грузить htmlview десять раз). */
  discover?: () => Promise<Map<string, number>>
}

/**
 * Загрузить лист, переживая смену gid:
 *  1) export по известному gid;
 *  2) не вышло — найти gid заново через /htmlview и повторить export;
 *  3) не вышло — gviz по имени листа (теряет часть ячеек, A1; парсер карточных листов может отказаться).
 */
export async function fetchSheetResolved(sheet: SheetName, options: ResolveOptions = {}): Promise<ResolvedSheet> {
  const { gids, discover, ...rest } = options
  const knownGid = gids?.[sheet] ?? SHEET_GIDS[sheet]
  let firstError: unknown
  try {
    return { rows: await fetchSheet(sheet, { ...rest, gid: knownGid }), source: 'export', gid: knownGid }
  } catch (e) {
    if (rest.signal?.aborted) throw e
    firstError = e
  }

  let discoverError = ''
  try {
    const found = (await (discover ?? (() => discoverGids(rest)))()).get(sheet.toLowerCase())
    if (found !== undefined && found !== knownGid) {
      const rows = await fetchSheet(sheet, { ...rest, gid: found })
      return {
        rows,
        source: 'export',
        gid: found,
        warning: `У листа «${sheet}» сменился gid (${knownGid} → ${found}) — найден заново через htmlview.`,
      }
    }
    if (found === undefined) discoverError = 'лист не найден в htmlview'
  } catch (e) {
    discoverError = e instanceof Error ? e.message : String(e)
  }

  try {
    const rows = await fetchSheet(sheet, { ...rest, source: 'gviz' })
    const why = firstError instanceof Error ? firstError.message : String(firstError)
    return {
      rows,
      source: 'gviz',
      gid: null,
      warning: `Лист «${sheet}» загружен через gviz по имени (export недоступен: ${why}${discoverError ? `; поиск gid: ${discoverError}` : ''}). Часть ячеек может быть потеряна.`,
    }
  } catch {
    throw firstError
  }
}
