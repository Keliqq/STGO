/**
 * Dev-утилита (Node ≥ 22.18, запуск без сборки: `npm run dump-sheets`).
 * Скачивает нужные листы в fixtures/sheets/<sheet>.csv — тестовые фикстуры и материал для изучения схемы.
 * Флаг --gviz дополнительно сохраняет gviz-версию в fixtures/sheets/gviz/ для сравнения.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Papa from 'papaparse'
import { fetchSheet, SHEET_NAMES, type SheetSource } from '../src/data/fetchSheet.ts'

const OUT_DIR = join(import.meta.dirname, '..', 'fixtures', 'sheets')
const withGviz = process.argv.includes('--gviz')

async function dump(source: SheetSource, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const sheet of SHEET_NAMES) {
    const rows = await fetchSheet(sheet, { source, timeoutMs: 30_000 })
    const file = join(dir, `${sheet.replaceAll(' ', '_')}.csv`)
    await writeFile(file, Papa.unparse(rows, { newline: '\n' }) + '\n', 'utf8')
    const width = Math.max(...rows.map((r) => r.length))
    console.log(`${source.padEnd(6)} ${sheet.padEnd(18)} ${String(rows.length).padStart(5)} строк × ${width} колонок`)
  }
}

await dump('export', OUT_DIR)
if (withGviz) await dump('gviz', join(OUT_DIR, 'gviz'))
