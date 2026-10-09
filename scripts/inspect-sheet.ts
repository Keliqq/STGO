/**
 * Dev-утилита: сводка по колонкам листа из fixtures/sheets.
 * `node scripts/inspect-sheet.ts BLUEPRINTS [headerRow=0] [maxDistinct=12]`
 * Для каждой колонки: заголовок, число непустых, число '---', доля числовых, примеры уникальных значений.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from '../src/data/fetchSheet.ts'

const [sheet = 'BLUEPRINTS', headerRowArg = '0', maxArg = '12'] = process.argv.slice(2)
const rows = parseCsv(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'sheets', `${sheet.replaceAll(' ', '_')}.csv`), 'utf8'))
const headerRow = Number(headerRowArg)
const maxDistinct = Number(maxArg)
const header = rows[headerRow] ?? []
const body = rows.slice(headerRow + 1)
const width = Math.max(...rows.map((r) => r.length))
const isNum = (s: string) => /^-?[\d,]*\.?\d+%?$/.test(s.trim())

for (let c = 0; c < width; c++) {
  const vals = body.map((r) => (r[c] ?? '').trim())
  const filled = vals.filter((v) => v !== '')
  if (filled.length === 0 && !header[c]) continue
  const dashes = filled.filter((v) => v === '---').length
  const real = filled.filter((v) => v !== '---')
  const nums = real.filter(isNum).length
  const distinct = [...new Set(real)]
  console.log(
    `[${c}] ${JSON.stringify(header[c] ?? '')} filled=${filled.length} ---=${dashes} num=${nums}/${real.length} distinct=${distinct.length}: ` +
      distinct.slice(0, maxDistinct).map((v) => JSON.stringify(v)).join(', '),
  )
}
