/**
 * Пороги защиты квестов (DEF → снижение урона 50/70/75%). В таблице их нет (A10).
 * Источник — stcentral-hub (CC BY-NC-ND 4.0). Решение владельца: в бандл и в репозиторий НЕ кладём,
 * загружаем в рантайме из браузера (у сайта CORS `*`), кэшируем в IndexedDB пользователя,
 * в UI показываем источник со ссылкой. Недоступно → оптимизатор работает «без порогов».
 *
 * Разбор HTML — регулярками, без DOM: работает и в Web Worker, и в тестах под Node.
 */
import { type KeyValueStore, KEYS } from './storage.ts'
import type { DefCaps, Quest } from './types.ts'
import { norm } from './parse/cells.ts'

export const BREAKPOINTS_SOURCE = {
  title: 'STC Hub — Main Quests',
  url: 'https://stcentral-hub.github.io/posts/main-quests/',
  author: 'STC Hub',
  license: 'CC BY-NC-ND 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
} as const

/** Если блоков меньше — страница, видимо, изменилась. Сейчас 28 (14 локаций × обычный/босс). */
export const MIN_HUB_BLOCKS = 10

export interface HubDifficulty {
  difficulty: string
  minPower: number | null
  hp: number | null
  atk: number | null
  aoe: number | null
  caps: DefCaps
}

export interface HubQuestBlock {
  /** Для обычного блока — локация (`Howling Woods`), для босса — логово (`Troublin Lair`). */
  title: string
  /** Локация из таблицы, к которой относится блок (у босса — предыдущий обычный блок). */
  area: string
  variant: 'normal' | 'boss'
  bossName: string | null
  /** Саб-локации обычного квеста (`Elvenwood Glade`, …). */
  subAreas: string[]
  difficulties: HubDifficulty[]
}

export interface BreakpointsData {
  fetchedAt: string
  blocks: HubQuestBlock[]
}

const attr = (name: string) => new RegExp(`${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`)

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function attrValue(html: string, name: string): string | null {
  const m = html.match(attr(name))
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null
}

const toNum = (s: string | undefined): number | null => {
  if (s === undefined) return null
  const n = Number(s.replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Значение статы по `title=<Name>` внутри блока сложности: первое `<p …>число</p>` после подписи, не заходя в следующую стату. */
function stat(html: string, title: string): number | null {
  const t = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`title=(?:"${t}"|'${t}'|${t}(?=[\\s>]))[^>]*>(?:(?!quest-difficulty-meta-stat\\b).)*?<p[^>]*>([\\d,]+)</p>`, 's')
  return toNum(html.match(re)?.[1])
}

function cap(html: string, pct: 50 | 70 | 75): number | null {
  const re = new RegExp(`stat-${pct}[^>]*>\\s*<p[^>]*>${pct}%</p>\\s*<p[^>]*>([\\d,]+)</p>`)
  return toNum(html.match(re)?.[1])
}

/** HTML страницы main-quests → блоки квестов. */
export function parseBreakpointsHtml(html: string): HubQuestBlock[] {
  const starts = [...html.matchAll(/<div\s+id=["']?[\w-]+["']?\s+class=["']?quest-wrapper\b/g)].map((m) => m.index)
  const blocks: HubQuestBlock[] = []
  let lastArea: string | null = null
  starts.forEach((start, i) => {
    const chunk = html.slice(start, starts[i + 1] ?? html.length)
    const banner = chunk.match(/class=["']?quest-area-banner["']?[^>]*>/)?.[0] ?? ''
    const title = attrValue(banner, 'title')
    if (!title) return
    const isBoss = /quest-banner-boss/.test(chunk)
    const area = isBoss ? lastArea : title
    if (!isBoss) lastArea = title
    if (!area) return
    const bossName = isBoss ? decode(chunk.match(/quest-banner-mob-boss[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/s)?.[1] ?? '') || null : null
    const subAreas = isBoss
      ? []
      : [...chunk.matchAll(/quest-banner-mob-normal[^>]*>\s*<h3[^>]*>(.*?)<\/h3>/gs)].map((m) => decode(m[1]))

    const difficulties: HubDifficulty[] = []
    for (const part of chunk.split(/<div\s+class=["']?quest-difficulty["']?>/).slice(1)) {
      const banner = part.match(/class=["']?quest-difficulty-banner["']?[^>]*>/)?.[0] ?? ''
      const difficulty = attrValue(banner, 'title')
      const p50 = cap(part, 50)
      const p70 = cap(part, 70)
      const p75 = cap(part, 75)
      if (!difficulty || p50 === null || p70 === null || p75 === null) continue
      difficulties.push({
        difficulty,
        minPower: stat(part, 'Minimum Power'),
        hp: stat(part, 'HP'),
        atk: stat(part, 'ATK'),
        aoe: stat(part, 'AoE'),
        caps: { p50, p70, p75 },
      })
    }
    if (difficulties.length > 0) blocks.push({ title, area, variant: isBoss ? 'boss' : 'normal', bossName, subAreas, difficulties })
  })
  return blocks
}

/**
 * Подставить пороги в квесты. Сопоставление: локация (без регистра) + обычный/босс + сложность.
 * HP монстра сверяется с таблицей — расхождение попадает в warnings (значит, одна из сторон устарела).
 */
export function applyBreakpoints(quests: Quest[], blocks: HubQuestBlock[]): { quests: Quest[]; matched: number; warnings: string[] } {
  const index = new Map<string, HubDifficulty>()
  for (const b of blocks) for (const d of b.difficulties) index.set(`${norm(b.area)}|${b.variant}|${norm(d.difficulty)}`, d)
  const warnings: string[] = []
  let matched = 0
  const out = quests.map((q) => {
    const d = index.get(`${norm(q.area)}|${q.variant}|${norm(q.difficulty)}`)
    if (!d) return q
    matched++
    if (d.hp !== null && d.hp !== q.monsterHp) {
      warnings.push(`Пороги ${q.id}: HP монстра на stcentral-hub ${d.hp}, в таблице ${q.monsterHp}`)
    }
    return { ...q, defCaps: d.caps }
  })
  return { quests: out, matched, warnings }
}

export interface BreakpointsStatus {
  /** caps — пороги есть; noCaps — оптимизатор считает только урон/HP. */
  mode: 'caps' | 'noCaps'
  source: 'cache' | 'fresh' | 'none'
  fetchedAt: string | null
  error: string | null
}

export interface LoadBreakpointsOptions {
  store: KeyValueStore
  ttlHours?: number
  force?: boolean
  fetchImpl?: typeof fetch
  now?: () => Date
  signal?: AbortSignal
}

/** Кэш → (если устарел) свежая загрузка → при ошибке старый кэш → иначе режим «без порогов». */
export async function loadBreakpoints(options: LoadBreakpointsOptions): Promise<{ data: BreakpointsData | null; status: BreakpointsStatus }> {
  const { store, ttlHours = 24 * 7, force = false, fetchImpl = globalThis.fetch.bind(globalThis), now = () => new Date(), signal } = options
  const cached = await store.get<BreakpointsData>(KEYS.breakpoints)
  const fresh = cached && now().getTime() - Date.parse(cached.fetchedAt) < ttlHours * 3_600_000
  if (cached && fresh && !force) {
    return { data: cached, status: { mode: 'caps', source: 'cache', fetchedAt: cached.fetchedAt, error: null } }
  }
  try {
    const timeout = AbortSignal.timeout(20_000)
    const res = await fetchImpl(BREAKPOINTS_SOURCE.url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blocks = parseBreakpointsHtml(await res.text())
    if (blocks.length < MIN_HUB_BLOCKS) throw new Error(`страница изменилась: найдено блоков квестов ${blocks.length}`)
    const data: BreakpointsData = { fetchedAt: now().toISOString(), blocks }
    await store.set(KEYS.breakpoints, data)
    return { data, status: { mode: 'caps', source: 'fresh', fetchedAt: data.fetchedAt, error: null } }
  } catch (e) {
    const error = `Пороги защиты недоступны: ${e instanceof Error ? e.message : String(e)}`
    if (cached) return { data: cached, status: { mode: 'caps', source: 'cache', fetchedAt: cached.fetchedAt, error } }
    return { data: null, status: { mode: 'noCaps', source: 'none', fetchedAt: null, error } }
  }
}
