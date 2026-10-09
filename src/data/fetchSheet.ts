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

export function sheetUrl(sheet: SheetName, source: SheetSource = 'export'): string {
  const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`
  return source === 'export'
    ? `${base}/export?format=csv&gid=${SHEET_GIDS[sheet]}`
    : `${base}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`
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
  const url = sheetUrl(sheet, source)
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
