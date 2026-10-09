/**
 * Собирает src/data/imageMap.json: «имя из таблицы → внутренний id игры» для картинок (только id, не сами файлы).
 *
 * Источники:
 *  - playshoptitans.com/blueprints/<категория>/<тип> — Next.js-страницы; в __NEXT_DATA__ лежат предметы (uid, type, skill)
 *    и словарь texts (`<uid>_name` → имя, `skill_i_<x>_name` → навык духа, `skill_a_<uid>_name` → навык артефакта,
 *    `item_type_<code>` → имя типа). Категории обходим BFS по ссылкам.
 *  - дерево репозитория STCentral-Hub/stcentral-hub.github.io (GitHub API) — пути иконок классов и навыков в /fankit.
 *
 * Запуск: `npm run build-image-map [-- --if-stale 7] [-- --offline]`.
 *   --if-stale N — ничего не делать, если карта моложе N дней (так вызывается из `npm run build`);
 *   --offline    — имена из fixtures/sheets вместо живой таблицы (для отчёта о покрытии).
 * При сетевой ошибке существующий файл сохраняется, скрипт завершается с кодом 0 и предупреждением.
 */
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildGameData, REQUIRED_SHEETS } from '../src/data/build.ts'
import { fetchSheet, parseCsv, type SheetName } from '../src/data/fetchSheet.ts'
import { EMPTY_IMAGE_MAP, type ImageMap } from '../src/data/imageMapTypes.ts'
import type { GameData } from '../src/data/types.ts'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'src', 'data', 'imageMap.json')
const SITE = 'https://playshoptitans.com'
const FANKIT_TREE = 'https://api.github.com/repos/STCentral-Hub/stcentral-hub.github.io/git/trees/HEAD?recursive=1'
const args = process.argv.slice(2)
const offline = args.includes('--offline')
const staleIdx = args.indexOf('--if-stale')
const staleDays = staleIdx >= 0 ? Number(args[staleIdx + 1] ?? 7) : null

/** Классы, у которых внутренний id не совпадает с именем (по файлам fankit). */
const CLASS_ID_OVERRIDES: Record<string, string> = {
  Samurai: 'swordmaster',
  Spellblade: 'redmage',
  Grandmaster: 'mastermonk',
  Fateweaver: 'timekeeper',
}
/** Чемпионы с внутренним id не по имени (лидерские иконки hero_<id>leader<N>). */
const CHAMPION_ID_OVERRIDES: Record<string, string> = { Reinhold: 'king', Tamas: 'leather' }

interface SiteItem {
  uid: string
  type: string
  skill: string | null
}
interface PageProps {
  texts: Record<string, string>
  items?: SiteItem[]
  enchantments?: SiteItem[]
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'st-app image-map builder' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

function nextData(html: string): PageProps {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error('нет __NEXT_DATA__ (сайт изменился?)')
  return JSON.parse(m[1]).props.pageProps as PageProps
}

/** Обход категорий: стартуем с нескольких страниц и идём по ссылкам /blueprints/<cat>/<type>. */
async function crawlSite(): Promise<{ texts: Record<string, string>; items: SiteItem[]; pages: number }> {
  const queue = ['/blueprints/weapons/ws', '/blueprints/armor/ah', '/blueprints/accessories/uh', '/blueprints/stones/xu', '/blueprints/enchantments/fire']
  const seen = new Set(queue)
  const texts: Record<string, string> = {}
  const items = new Map<string, SiteItem>()
  let pages = 0
  while (queue.length > 0) {
    const batch = queue.splice(0, 4)
    const htmls = await Promise.all(batch.map(async (p) => (await get(SITE + p)).text()))
    for (const html of htmls) {
      pages++
      const props = nextData(html)
      Object.assign(texts, props.texts)
      for (const it of [...(props.items ?? []), ...(props.enchantments ?? [])]) items.set(it.uid, it)
      for (const [, href] of html.matchAll(/href="(\/blueprints\/(?!featured)[a-z]+\/[a-z0-9]+)"/g)) {
        if (!seen.has(href)) {
          seen.add(href)
          queue.push(href)
        }
      }
    }
    process.stdout.write(`\r  страниц: ${pages}, в очереди: ${queue.length}, предметов: ${items.size}   `)
  }
  process.stdout.write('\n')
  return { texts, items: [...items.values()], pages }
}

async function fankitPaths(): Promise<string[]> {
  const res = await get(FANKIT_TREE)
  const tree = (await res.json()) as { tree: { path: string }[]; truncated: boolean }
  if (tree.truncated) console.warn('  ! дерево fankit обрезано GitHub API — часть иконок может не найтись')
  return tree.tree.map((t) => t.path).filter((p) => p.startsWith('public/fankit/') && p.endsWith('.png')).map((p) => p.slice('public'.length))
}

async function loadGameData(): Promise<GameData> {
  const raw: Record<string, string[][]> = {}
  for (const s of REQUIRED_SHEETS) {
    raw[s] = offline
      ? parseCsv(readFileSync(join(ROOT, 'fixtures', 'sheets', `${s.replaceAll(' ', '_')}.csv`), 'utf8'))
      : await fetchSheet(s as SheetName, { timeoutMs: 30_000 })
  }
  return buildGameData(raw)
}

const loose = (s: string) => s.toLowerCase().replace(/&/g, 'n').replace(/[^a-z0-9]/g, '')

async function main(): Promise<void> {
  const prev: ImageMap = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : EMPTY_IMAGE_MAP
  if (staleDays !== null && prev.generatedAt && Date.now() - Date.parse(prev.generatedAt) < staleDays * 86_400_000) {
    console.log(`imageMap.json свежее ${staleDays} дн. (${prev.generatedAt}) — пропускаю`)
    return
  }

  console.log('Таблица…')
  const data = await loadGameData()
  console.log('playshoptitans.com…')
  const site = await crawlSite()
  console.log('fankit stcentral-hub…')
  const fankit = await fankitPaths()

  const map: ImageMap = { ...EMPTY_IMAGE_MAP, generatedAt: new Date().toISOString() }

  // Предметы: точное имя, затем без регистра/пунктуации
  const byName = new Map<string, SiteItem>()
  const byLoose = new Map<string, SiteItem>()
  for (const it of site.items) {
    const name = site.texts[`${it.uid}_name`]
    if (!name) continue
    if (!byName.has(name)) byName.set(name, it)
    if (!byLoose.has(loose(name))) byLoose.set(loose(name), it)
  }
  const sheetNames = [...data.items.map((i) => i.name), ...data.enchants.map((e) => e.name)]
  for (const name of sheetNames) {
    const it = byName.get(name) ?? byLoose.get(loose(name))
    if (it) map.items[name] = it.uid
  }

  // Духи: skill = i_<key>
  for (const e of data.enchants.filter((x) => x.kind === 'spirit')) {
    const it = byName.get(e.name) ?? byLoose.get(loose(e.name))
    const key = it?.skill?.startsWith('i_') ? it.skill.slice(2) : null
    if (!key) continue
    map.spirits[e.name] = key
    const skillName = site.texts[`skill_i_${key}_name`]
    if (skillName) map.spiritSkills[skillName] = key
  }

  // Артефакты: skill_a_<uid>_name (или поле skill = a_<…>)
  for (const item of data.items) {
    const it = byName.get(item.name) ?? byLoose.get(loose(item.name))
    if (!it) continue
    const key = it.skill?.startsWith('a_') ? it.skill.slice(2) : it.uid
    const skillName = site.texts[`skill_a_${key}_name`]
    if (skillName) map.artifacts[item.name] = skillName
  }

  // Типы: item_type_<code> → имя типа
  for (const [k, v] of Object.entries(site.texts)) {
    const m = k.match(/^item_type_([a-z]+)$/)
    if (m && data.items.some((i) => i.type === v)) map.types[v] = m[1]
  }

  // Классы: icon_global_class_<id>_128.png
  const classIcons = new Map<string, string>()
  for (const p of fankit) {
    const m = p.match(/\/Hero Classes\/(?:Standard|Titan) Classes\/[^/]+\/icon_global_class_([a-z]+)_128\.png$/)
    if (m) classIcons.set(m[1], p)
  }
  for (const c of data.heroClasses) {
    const id = CLASS_ID_OVERRIDES[c.name] ?? loose(c.name)
    const path = classIcons.get(id)
    if (path) map.classes[c.name] = path
  }

  // Навыки: icon_global_skill_<префикс>_<slug>.png
  const skillIcons = new Map<string, string>()
  for (const p of fankit) {
    const m = p.match(/\/Skills\/[^/]+\/icon_global_skill_(?:[a-z]_)?([A-Za-z0-9_]+)\.png$/)
    if (m && !skillIcons.has(loose(m[1]))) skillIcons.set(loose(m[1]), p)
  }
  const fankitByFile = new Map(fankit.map((p) => [p.split('/').pop()!, p]))
  const lineNames = new Map<string, string[]>()
  for (const s of data.skills) lineNames.set(s.line, [...(lineNames.get(s.line) ?? []), s.name])
  for (const s of data.skills) {
    let path: string | undefined
    if (s.type === 'Enchantment') {
      const key = map.spiritSkills[s.name.replace(/\+$/, '')]
      path = key ? fankitByFile.get(`icon_global_skill_i_${key}.png`) : skillIcons.get(loose(s.name.replace(/\+$/, '')))
    } else if (s.type === 'Innate') {
      // Врождённый навык — иконка базового класса: c_<id>
      const cls = data.heroClasses.find((c) => s.classes.includes(c.name))
      const base = cls?.baseClass ?? cls?.name
      if (base) path = fankitByFile.get(`icon_global_skill_c_${CLASS_ID_OVERRIDES[base] ?? loose(base)}.png`)
    } else if (s.type === 'Leader' && s.champions[0] && s.tier) {
      const id = CHAMPION_ID_OVERRIDES[s.champions[0]] ?? loose(s.champions[0])
      path = fankitByFile.get(`icon_global_skill_hero_${id}leader${s.tier}.png`)
    } else if (s.type === 'Artifact') {
      path = fankitByFile.get('icon_global_skill_icon_global_artifact.png')
    } else {
      // Иконка одна на линейку; имя файла может совпадать с любой ступенью (Warlord → War Master → s_warmaster)
      for (const n of [s.line, ...(lineNames.get(s.line) ?? [])]) {
        path = skillIcons.get(loose(n))
        if (path) break
      }
    }
    if (path) map.skills[s.name] = path
  }

  await writeFile(OUT, JSON.stringify(map, null, 1) + '\n', 'utf8')

  // Отчёт о покрытии
  const missingItems = data.items.filter((i) => !map.items[i.name]).map((i) => i.name)
  const report = {
    страниц: site.pages,
    предметов: `${data.items.length - missingItems.length}/${data.items.length}`,
    духов: `${Object.keys(map.spirits).length}/${data.enchants.filter((e) => e.kind === 'spirit').length}`,
    артефактов: Object.keys(map.artifacts).length,
    типов: `${Object.keys(map.types).length}/${new Set(data.items.map((i) => i.type)).size}`,
    классов: `${Object.keys(map.classes).length}/${data.heroClasses.length}`,
    навыков: `${Object.keys(map.skills).length}/${data.skills.length}`,
  }
  console.log('Записано', OUT, report)
  if (missingItems.length) console.log('Предметы без картинки:', missingItems.join('; '))
  const missingClasses = data.heroClasses.filter((c) => !map.classes[c.name]).map((c) => c.name)
  if (missingClasses.length) console.log('Классы без иконки:', missingClasses.join(', '))
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  if (existsSync(OUT) && !args.includes('--strict')) {
    console.warn(`! build-image-map: ${msg}\n  Оставляю прежний src/data/imageMap.json.`)
    return
  }
  console.error(`build-image-map: ${msg}`)
  process.exitCode = 1
})
