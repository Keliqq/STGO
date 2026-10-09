/**
 * Страница stcentral-hub под CC BY-NC-ND — в репозиторий её не кладём.
 * Здесь — самодельный HTML той же разметки (минифицированные атрибуты без кавычек), числа выдуманы.
 */
import { describe, expect, it, vi } from 'vitest'
import { applyBreakpoints, loadBreakpoints, parseBreakpointsHtml } from './breakpoints.ts'
import { KEYS, memoryStore } from './storage.ts'
import type { Quest } from './types.ts'

function difficulty(name: string, hp: string, caps: [string, string, string]): string {
  const stat = (title: string, v: string) =>
    `<div class=quest-difficulty-meta-stat title=${title}><img src=x alt><p class="st-text-outline-shadow-p no-margin">${v}</p></div>`
  return (
    `<div class=quest-difficulty><div class=quest-difficulty-banner title=${name}><div><img src=x></div><h3>${name}</h3></div>` +
    `<div class=quest-difficulty-meta>${stat('"Minimum Power"', '10')}${stat('HP', hp)}${stat('ATK', '3')}` +
    `<div class=quest-difficulty-meta-stat title=AoE><p class="st-text-outline no-margin">AoE</p><p class="x">2</p></div>` +
    `<div class=quest-difficulty-meta-stat title="Defense Caps"><div class=quest-difficulty-meta-stat-def-wrapper><img src=x>` +
    `<div class=quest-difficulty-meta-stat-def-wrapper-stat-50><p class=a>50%</p><p class=a>${caps[0]}</p></div>` +
    `<div class=quest-difficulty-meta-stat-def-wrapper-stat-70><p class=a>70%</p><p class=a>${caps[1]}</p></div>` +
    `<div class=quest-difficulty-meta-stat-def-wrapper-stat-75><p class=a>75%</p><p class=a>${caps[2]}</p></div></div></div></div></div>`
  )
}

const SAMPLE =
  `<article><div class=row-layout>` +
  `<div id=test-woods class="quest-wrapper quest-wrapper-base"><div class=quest-area-banner title="Test Woods"><h1>Test Woods</h1></div>` +
  `<div class="quest-banner-wrapper quest-banner-normal-wrapper"><div class=quest-banner-normal><div class="quest-banner-mob quest-banner-mob-normal"><h3 class='x'>Glade One</h3></div></div>` +
  `<div class=quest-banner-normal><div class="quest-banner-mob quest-banner-mob-normal"><h3 class='x'>Glade &amp; Two</h3></div></div></div>` +
  `<div class="quest-difficulty-wrapper">${difficulty('Easy', '1,000', ['10', '20', '60'])}${difficulty('Extreme', '9,000', ['1,000', '2,000', '6,000'])}</div></div>` +
  `<div id=test-lair class="quest-wrapper quest-wrapper-base"><div class=quest-area-banner title="Test Lair"><h1>Test Lair</h1></div>` +
  `<div class="quest-banner-wrapper quest-banner-boss"><div class="quest-banner-mob quest-banner-mob-boss"><img src=x><h2 class='x'>Big Boss</h2></div></div>` +
  `<div class="quest-difficulty-wrapper">${difficulty('Easy', '5,000', ['40', '80', '240'])}</div></div>` +
  `</div></article>`

const quest = (area: string, variant: 'normal' | 'boss', difficulty: string, monsterHp: number): Quest => ({
  id: `${area}|${variant}|${difficulty}`,
  area,
  variant,
  difficulty,
  minPower: null,
  heroXp: null,
  monsterHp,
  monsterDmg: 1,
  monsterAoe: 1,
  barrier: null,
  defCaps: null,
  miniBosses: [],
})

describe('parseBreakpointsHtml', () => {
  const blocks = parseBreakpointsHtml(SAMPLE)

  it('обычный блок и блок босса, привязанный к предыдущей локации', () => {
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ title: 'Test Woods', area: 'Test Woods', variant: 'normal', bossName: null, subAreas: ['Glade One', 'Glade & Two'] })
    expect(blocks[1]).toMatchObject({ title: 'Test Lair', area: 'Test Woods', variant: 'boss', bossName: 'Big Boss' })
  })

  it('сложности: пороги 50/70/75, HP с разделителем тысяч, AoE после подписи', () => {
    expect(blocks[0].difficulties).toEqual([
      { difficulty: 'Easy', minPower: 10, hp: 1000, atk: 3, aoe: 2, caps: { p50: 10, p70: 20, p75: 60 } },
      { difficulty: 'Extreme', minPower: 10, hp: 9000, atk: 3, aoe: 2, caps: { p50: 1000, p70: 2000, p75: 6000 } },
    ])
  })

  it('чужая страница → пусто', () => {
    expect(parseBreakpointsHtml('<html><body>404</body></html>')).toEqual([])
  })
})

describe('applyBreakpoints', () => {
  it('сопоставление без учёта регистра, сверка HP', () => {
    const quests = [
      quest('TEST WOODS', 'normal', 'Easy', 1000),
      quest('Test Woods', 'boss', 'Easy', 4999),
      quest('Test Woods', 'normal', 'Hard', 3000),
    ]
    const r = applyBreakpoints(quests, parseBreakpointsHtml(SAMPLE))
    expect(r.matched).toBe(2)
    expect(r.quests[0].defCaps).toEqual({ p50: 10, p70: 20, p75: 60 })
    expect(r.quests[2].defCaps).toBeNull()
    expect(r.warnings).toEqual(['Пороги Test Woods|boss|Easy: HP монстра на stcentral-hub 5000, в таблице 4999'])
  })
})

describe('loadBreakpoints', () => {
  const now = () => new Date('2026-10-10T00:00:00Z')
  const page = Array.from({ length: 6 }, () => SAMPLE).join('') // 12 блоков ≥ MIN_HUB_BLOCKS

  it('загрузка → кэш в хранилище → повторно из кэша без сети', async () => {
    const store = memoryStore()
    const fetchImpl = vi.fn(async () => new Response(page)) as unknown as typeof fetch
    const a = await loadBreakpoints({ store, fetchImpl, now })
    expect(a.status).toEqual({ mode: 'caps', source: 'fresh', fetchedAt: now().toISOString(), error: null })
    const b = await loadBreakpoints({ store, fetchImpl, now })
    expect(b.status.source).toBe('cache')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('сайт недоступен и кэша нет → режим «без порогов»', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    const r = await loadBreakpoints({ store: memoryStore(), fetchImpl, now })
    expect(r.data).toBeNull()
    expect(r.status).toMatchObject({ mode: 'noCaps', source: 'none' })
    expect(r.status.error).toMatch(/Пороги защиты недоступны/)
  })

  it('страница изменилась → старый кэш остаётся, ошибка в статусе', async () => {
    const old = { fetchedAt: '2026-01-01T00:00:00Z', blocks: parseBreakpointsHtml(SAMPLE) }
    const store = memoryStore({ [KEYS.breakpoints]: old })
    const fetchImpl = vi.fn(async () => new Response('<html>redesign</html>')) as unknown as typeof fetch
    const r = await loadBreakpoints({ store, fetchImpl, now })
    expect(r.data).toEqual(old)
    expect(r.status).toMatchObject({ mode: 'caps', source: 'cache' })
    expect(r.status.error).toMatch(/страница изменилась/)
    expect(await store.get(KEYS.breakpoints)).toEqual(old)
  })
})
