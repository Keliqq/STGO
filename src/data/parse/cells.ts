/** Разбор отдельных ячеек по соглашениям из docs/SCHEMA.md → «Общие соглашения». */
import type { Reject } from '../types.ts'

export type Grid = string[][]

/** Ячейка по координатам; за пределами листа — пустая строка. */
export function cell(rows: Grid, r: number, c: number): string {
  return (rows[r]?.[c] ?? '').trim()
}

/** `---` и пустая ячейка — «нет значения». */
export function isBlank(v: string | undefined): boolean {
  const t = (v ?? '').trim()
  return t === '' || t === '---'
}

/** Все ячейки с данным текстом (без учёта регистра). */
export function findCells(rows: Grid, text: string): [number, number][] {
  const out: [number, number][] = []
  const t = norm(text)
  rows.forEach((row, r) => row.forEach((v, c) => norm(v) === t && out.push([r, c])))
  return out
}

export function str(v: string | undefined): string | null {
  return isBlank(v) ? null : (v ?? '').trim()
}

/** Ошибка разбора конкретной ячейки/строки — превращается в Reject. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

/** Число с разделителем тысяч: `"1,250"` → 1250. Пусто → null. Мусор → ParseError. */
export function num(v: string | undefined, what = 'число'): number | null {
  if (isBlank(v)) return null
  const t = (v ?? '').trim().replace(/,/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) throw new ParseError(`${what}: не число «${v}»`)
  return n
}

export function int(v: string | undefined, what = 'целое'): number | null {
  const n = num(v, what)
  if (n === null) return null
  if (!Number.isInteger(n)) throw new ParseError(`${what}: ожидалось целое, получено «${v}»`)
  return n
}

export function reqInt(v: string | undefined, what: string): number {
  const n = int(v, what)
  if (n === null) throw new ParseError(`${what}: пустое значение`)
  return n
}

/** Цена: `FREE` → 0, `25 Coins` → 25, `10,000` → 10000. */
export function cost(v: string | undefined, what = 'цена'): number | null {
  if (isBlank(v)) return null
  const t = (v ?? '').trim()
  if (/^free$/i.test(t)) return 0
  const m = t.replace(/,/g, '').match(/^(\d+)(\s+\w+)?$/)
  if (!m) throw new ParseError(`${what}: не цена «${v}»`)
  return Number(m[1])
}

/**
 * Проценты HEROES/CHAMPIONS: `30%` → {value: 0.3, bonus: 0}; `20% (+20%)` → {value: 0.2, bonus: 0.2}.
 * В скобках — вклад врождённого навыка, уже включённый в value (A4).
 */
export function pctWithBonus(v: string | undefined, what = 'процент'): { value: number; bonus: number } {
  if (isBlank(v)) return { value: 0, bonus: 0 }
  const m = (v ?? '').trim().match(/^(\d+(?:\.\d+)?)%(?:\s*\(\+(\d+(?:\.\d+)?)%\))?$/)
  if (!m) throw new ParseError(`${what}: не процент «${v}»`)
  return { value: round6(Number(m[1]) / 100), bonus: m[2] ? round6(Number(m[2]) / 100) : 0 }
}

/** Множитель крита: `2x` → 2. */
export function multiplier(v: string | undefined, what = 'множитель'): number {
  const m = (v ?? '').trim().match(/^(\d+(?:\.\d+)?)x$/i)
  if (!m) throw new ParseError(`${what}: не множитель «${v}»`)
  return Number(m[1])
}

/** Список через запятую. */
export function list(v: string | undefined): string[] {
  if (isBlank(v)) return []
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '---')
}

/** `HOWLING WOODS` → `Howling Woods`, `SUN GOD'S TOMB` → `Sun God's Tomb`, `LOST CITY OF GOLD` → `Lost City of Gold`. */
export function titleCase(v: string): string {
  const small = new Set(['of', 'the', 'and', 'a', 'in'])
  return v
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/(^|[(-])([a-z])/g, (_, p: string, ch: string) => p + ch.toUpperCase())))
    .join('')
}

/** Ключ для сравнения без учёта регистра и лишних пробелов. */
export function norm(v: string): string {
  return v.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Сборщик отказов для одного листа. */
export class RejectLog {
  readonly items: Reject[] = []
  readonly sheet: string
  constructor(sheet: string) {
    this.sheet = sheet
  }
  add(row: number | null, key: string | null, reason: string): void {
    this.items.push({ sheet: this.sheet, row: row === null ? null : row + 1, key, reason })
  }
  /** Выполнить разбор строки; ошибка → отказ, результат → undefined. */
  guard<T>(row: number, key: string | null, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (e) {
      this.add(row, key, e instanceof Error ? e.message : String(e))
      return undefined
    }
  }
}

/** Структура листа не та, что ожидалась — ensureFresh в этом случае не трогает кэш. */
export class SchemaError extends Error {
  readonly sheet: string
  constructor(sheet: string, reason: string) {
    super(`Лист «${sheet}»: структура изменилась — ${reason}`)
    this.name = 'SchemaError'
    this.sheet = sheet
  }
}

/** Проверить, что строка-заголовок содержит ожидаемые подписи на своих местах. */
export function expectHeader(sheet: string, header: string[] | undefined, expected: Record<number, string>): void {
  if (!header) throw new SchemaError(sheet, 'нет строки заголовка')
  const bad = Object.entries(expected).filter(([i, name]) => norm(header[Number(i)] ?? '') !== norm(name))
  if (bad.length > 0) {
    const list = bad.map(([i, name]) => `[${i}] ожидалось «${name}», есть «${header[Number(i)] ?? ''}»`).join('; ')
    throw new SchemaError(sheet, `заголовок: ${list}`)
  }
}
