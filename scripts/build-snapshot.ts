/**
 * Генерирует src/data/snapshot.json — встроенные данные для первого запуска офлайн.
 * Запускается в `npm run build` перед vite build (и вручную: `npm run build-snapshot`).
 *
 * Листы читаются из живой таблицы тем же кодом, что и в браузере (смена gid → htmlview → gviz).
 * Таблица недоступна → берём fixtures/sheets с предупреждением (сборка не падает). `--offline` — сразу фикстуры.
 * `--if-missing` — ничего не делать, если файл уже есть (так вызывается перед dev/test/typecheck).
 * Пороги защиты (stcentral-hub, CC BY-NC-ND) сюда НЕ попадают — они грузятся только в рантайме.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildGameData, REQUIRED_SHEETS } from '../src/data/build.ts'
import { discoverGids, fetchSheetResolved, parseCsv, type SheetName } from '../src/data/fetchSheet.ts'
import { EMPTY_IMAGE_MAP, type ImageMap } from '../src/data/imageMapTypes.ts'
import type { RawSheets } from '../src/data/types.ts'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'src', 'data', 'snapshot.json')
const IMAGE_MAP = join(ROOT, 'src', 'data', 'imageMap.json')
const offline = process.argv.includes('--offline')

/** Дата данных для фикстур — время изменения файла (когда их сняли `npm run dump-sheets`). */
function fromFixtures(): RawSheets {
  fetchedAt = statSync(join(ROOT, 'fixtures', 'sheets', 'BLUEPRINTS.csv')).mtime.toISOString()
  const raw: RawSheets = {}
  for (const s of REQUIRED_SHEETS) {
    raw[s] = parseCsv(readFileSync(join(ROOT, 'fixtures', 'sheets', `${s.replaceAll(' ', '_')}.csv`), 'utf8'))
  }
  return raw
}

async function fromNetwork(): Promise<RawSheets> {
  let discovered: Promise<Map<string, number>> | undefined
  const discover = () => (discovered ??= discoverGids())
  const raw: RawSheets = {}
  for (const s of REQUIRED_SHEETS) {
    const r = await fetchSheetResolved(s as SheetName, { timeoutMs: 30_000, discover })
    if (r.warning) console.warn(`  ! ${r.warning}`)
    raw[s] = r.rows
  }
  return raw
}

if (process.argv.includes('--if-missing') && existsSync(OUT)) process.exit(0)

let fetchedAt = new Date().toISOString()
let raw: RawSheets
if (offline) {
  raw = fromFixtures()
  console.log('Снапшот из fixtures/sheets (--offline)')
} else {
  try {
    raw = await fromNetwork()
    console.log('Снапшот из живой таблицы')
  } catch (e) {
    console.warn(`! Таблица недоступна (${e instanceof Error ? e.message : String(e)}) — беру fixtures/sheets`)
    raw = fromFixtures()
  }
}

const imageMap: ImageMap = existsSync(IMAGE_MAP) ? JSON.parse(readFileSync(IMAGE_MAP, 'utf8')) : EMPTY_IMAGE_MAP
const data = buildGameData(raw, { fetchedAt, imageMap })
const json = JSON.stringify(data)
await writeFile(OUT, json + '\n', 'utf8')
console.log(
  `Записано ${OUT}: ${(json.length / 1024).toFixed(0)} КБ — предметов ${data.items.length}, классов ${data.heroClasses.length}, ` +
    `навыков ${data.skills.length}, квестов ${data.quests.length}, отказов ${data.rejects.length}, предупреждений ${data.warnings.length}`,
)
