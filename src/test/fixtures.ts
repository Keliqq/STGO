/** Загрузка фикстур fixtures/sheets для тестов. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildGameData, REQUIRED_SHEETS } from '../data/build.ts'
import { parseCsv } from '../data/fetchSheet.ts'
import type { ImageMap } from '../data/imageMapTypes.ts'
import type { GameData, RawSheets } from '../data/types.ts'

const ROOT = join(import.meta.dirname, '..', '..')

export function fixtureText(sheet: string): string {
  return readFileSync(join(ROOT, 'fixtures', 'sheets', `${sheet.replaceAll(' ', '_')}.csv`), 'utf8')
}

export function fixtureRows(sheet: string): string[][] {
  return parseCsv(fixtureText(sheet))
}

export function fixtureSheets(): RawSheets {
  return Object.fromEntries(REQUIRED_SHEETS.map((s) => [s, fixtureRows(s)]))
}

export function bundledImageMap(): ImageMap {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'imageMap.json'), 'utf8')) as ImageMap
}

let cached: GameData | undefined
/** GameData из фикстур с картой картинок (собирается один раз на файл тестов). */
export function fixtureGameData(): GameData {
  cached ??= buildGameData(fixtureSheets(), { fetchedAt: '2026-10-09T00:00:00.000Z', imageMap: bundledImageMap() })
  return structuredClone(cached)
}

/** Копия листа с изменённой ячейкой. */
export function withCell(rows: string[][], r: number, c: number, value: string): string[][] {
  const copy = rows.map((row) => [...row])
  copy[r][c] = value
  return copy
}
