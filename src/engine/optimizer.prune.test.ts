/**
 * Цена промаха отсева на 120 случаях (те же seed и выборка, что в optimizer.test.ts):
 * для каждого случая — 15 вариантов слота, win rate каждого по симуляции; «найденный» — лучший
 * из множества, отобранного отсева. Пишем медиану/max потери win rate и разбор промахов * (слоты, типы предметов, признаки: вторичный стат, щит/тотем, связь стихии, артефакт).
 * Базовый чистый top-K — только лог (историческая калибровка, см. PROGRESS.md сессия 6);
 * рабочий отсев selectSlotCandidates — промахи < 5 % и потеря win rate при промахе ≤ 1 п.п.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Item, Quality, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, mulberry32, simulateTeam } from './combat.ts'
import { OPTIMIZER_TOP_K } from './constants.ts'
import { applyHeroConfig, selectSlotCandidates, type SlotConfig, type SlotFeatures } from './optimizer.ts'
import { quickScore } from './score.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'rnd|normal|Hard',
  area: 'T',
  variant: 'normal',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 60000,
  monsterDmg: 700,
  monsterAoe: 350,
  barrier: null,
  defCaps: { p50: 1500, p70: 3000, p75: 9000 },
  miniBosses: [],
  ...over,
})

const itemByName = (name: string): Item => data.items.find((i) => i.name === name)!
const clsOf = (h: (typeof heroes)[number]) => data.heroClasses.find((c) => c.name === h.className)!
const elValue = new Map(data.enchants.filter((e) => e.kind === 'element').map((e) => [e.name, e.elementValue ?? 0]))

const slotFeats = (heroEl: string) => (sc: SlotConfig): SlotFeatures => {
  const it = itemByName(sc.item!)
  const st = it.stats[sc.quality]
  const el = it.builtInElement ? (elValue.get(it.builtInElement) ?? 0) : 0
  const affinity = it.elementAffinity === 'All' || it.elementAffinity.some((e) => heroEl === 'Any' || e === heroEl)
  return { atk: st.atk, def: st.def, hp: st.hp, eva: st.eva, crit: st.crit, element: el, artifact: !!it.artifactSkill, affinity }
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const pct = (x: number): string => `${(x * 100).toFixed(1)} п.п.`

interface CaseResult {
  si: number
  type: string
  loss: number
  missed: boolean
  notInSet: boolean
  feat: { secondary: boolean; shield: boolean; totem: boolean; artifact: boolean; affinity: boolean; builtIn: boolean }
}

function runCases(select: (scored: { sc: SlotConfig; score: number }[], heroEl: string) => Set<string>): { results: CaseResult[]; total: number } {
  const rng = mulberry32(20261009)
  const K = OPTIMIZER_TOP_K
  const results: CaseResult[] = []
  let total = 0
  for (let caseI = 0; caseI < 20; caseI++) {
    const hero = heroes[Math.floor(rng() * heroes.length)]
    const cls = clsOf(hero)
    const q = quest({
      variant: rng() < 0.5 ? 'boss' : 'normal',
      monsterHp: Math.round(30000 + rng() * 200000),
      monsterDmg: Math.round(500 + rng() * 1500),
    })
    for (let si = 0; si < 6; si++) {
      const types = cls.slots[si]
      const pool = data.items.filter((i) => i.isEquipment && types.includes(i.type) && i.tier <= 15)
      if (pool.length <= K) continue
      const sample: SlotConfig[] = []
      const used = new Set<number>()
      while (sample.length < 15 && used.size < pool.length) {
        const k = Math.floor(rng() * pool.length)
        if (used.has(k)) continue
        used.add(k)
        sample.push({ item: pool[k].name, quality: 'Flawless' as Quality, element: null, spirit: null })
      }
      const scored = sample.map((sc) => {
        const f = fighterFromHero(applyHeroConfig(hero, hero.slots.map((s, j) => (j === si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
        return { sc, score: quickScore([f], q) / q.monsterHp }
      })
      const selected = select(scored, cls.element)
      let bestWrAll = -1
      let bestWrSel = -1
      let bestItemAll = ''
      for (const { sc } of scored) {
        const f = fighterFromHero(applyHeroConfig(hero, hero.slots.map((s, j) => (j === si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
        const wr = simulateTeam([f], q, { runs: 300, seed: 42 }).winRate
        if (wr > bestWrAll) {
          bestWrAll = wr
          bestItemAll = sc.item!
        }
        if (selected.has(sc.item!) && wr > bestWrSel) bestWrSel = wr
      }
      const loss = bestWrAll - bestWrSel
      const missed = bestWrAll > bestWrSel
      const notInSet = !selected.has(bestItemAll)
      total++
      const it = itemByName(bestItemAll)
      const st = it.stats.Flawless
      const nStats = (['atk', 'def', 'hp', 'eva', 'crit', 'manaShield'] as const).filter((k) => st[k] > 0).length
      results.push({
        si,
        type: it.type,
        loss,
        missed,
        notInSet,
        feat: {
          secondary: nStats >= 2,
          shield: /shield/i.test(it.type),
          totem: /totem/i.test(it.type),
          artifact: !!it.artifactSkill,
          affinity: it.elementAffinity === 'All' || (Array.isArray(it.elementAffinity) && it.elementAffinity.length > 0),
          builtIn: !!it.builtInElement,
        },
      })
    }
  }
  return { results, total }
}

function report(label: string, r: ReturnType<typeof runCases>): void {
  const losses = r.results.filter((x) => x.missed).map((x) => x.loss)
  const notIn = r.results.filter((x) => x.notInSet).length
  console.log(`\n[${label}] лучший не в множестве: ${notIn}/${r.total} (${((notIn / r.total) * 100).toFixed(1)}%); из них с реальной потерей win rate: ${losses.length}/${r.total}`)
  console.log(`[${label}] потеря win rate при промахе: медиана ${pct(median(losses))}, max ${pct(Math.max(0, ...losses))}, средняя на случай ${pct(r.results.reduce((a, x) => a + x.loss, 0) / r.total)}`)
  const bySlot = new Map<number, number>()
  const byType = new Map<string, number>()
  const featCount = { secondary: 0, shield: 0, totem: 0, artifact: 0, affinity: 0, builtIn: 0 }
  for (const x of r.results.filter((y) => y.notInSet)) {
    bySlot.set(x.si, (bySlot.get(x.si) ?? 0) + 1)
    byType.set(x.type, (byType.get(x.type) ?? 0) + 1)
    for (const k of Object.keys(featCount) as (keyof typeof featCount)[]) if (x.feat[k]) featCount[k]++
  }
  console.log(`[${label}] «не в множестве» по слотам: ${[...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `слот${s}:${n}`).join(' ') || '—'}`)
  console.log(`[${label}] «не в множестве» по типам: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' ') || '—'}`)
  console.log(`[${label}] признаки отсеянного лучшего: ${Object.entries(featCount).map(([k, n]) => `${k}:${n}`).join(' ') || '—'}`)
}

const topKOnly = (scored: { sc: SlotConfig; score: number }[]): Set<string> =>
  new Set([...scored].sort((a, b) => b.score - a.score).slice(0, OPTIMIZER_TOP_K).map((x) => x.sc.item!))

const withDiversity = (scored: { sc: SlotConfig; score: number }[], heroEl: string): Set<string> =>
  new Set(selectSlotCandidates(scored, OPTIMIZER_TOP_K, slotFeats(heroEl)).map((x) => x.item!))

describe('цена промаха отсева', () => {
  it('базовый чистый top-K: распределение потерь и разбор промахов (калибровка сессии 6→7)', () => {
    const r = runCases((scored) => topKOnly(scored))
    report('top-K', r)
    expect(r.total).toBeGreaterThan(0)
  })

  it('отсев с разнообразием и адаптивным K: промахи < 5 %, потеря ≤ 1 п.п.', () => {
    const r = runCases(withDiversity)
    report('top-K+разнообразие', r)
    const notIn = r.results.filter((x) => x.notInSet).length
    expect(notIn / r.total).toBeLessThan(0.05)
    const losses = r.results.filter((x) => x.missed).map((x) => x.loss)
    expect(median(losses)).toBeLessThanOrEqual(0.01)
    expect(Math.max(0, ...losses)).toBeLessThanOrEqual(0.01)
  })
})
