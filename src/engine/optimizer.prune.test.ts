/**
 * Цена промаха отсева.
 *
 * 1) 120 случаев как раньше (20 герой+квест × 6 слотов, 15 вариантов слота, симуляция 300 прогонов,
 *    общий seed): здесь же — распределение win rate (решение по итогам сессии 7: подозрение, что
 *    цель теряет чувствительность, когда win rate везде 0 % или 100 %).
 * 2) Откалиброванный набор: ≥30 случаев, где базовый win rate в диапазоне 20–80 % (подбираем
 *    monsterHp так, чтобы исход завис от слота). На нём — повторный замер промахов; «лучший»
 *    определяется лексикографически (win rate → раунды → мин. % HP выжившего → урон/раунд),
 *    как в optimizer.ts.
 * Базовый чистый top-K — только лог (историческая калибровка, см. PROGRESS.md сессия 6);
 * рабочий отсев selectSlotCandidates — промахи < 5 % и потеря win rate при промахе ≤ 1 п.п.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Item, Quality, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, mulberry32, simulateTeam, type SimMetrics } from './combat.ts'
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

function runCases(select: (scored: { sc: SlotConfig; score: number }[], heroEl: string) => Set<string>): { results: CaseResult[]; total: number; wrs: number[] } {
  const rng = mulberry32(20261009)
  const K = OPTIMIZER_TOP_K
  const results: CaseResult[] = []
  const wrs: number[] = []
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
        wrs.push(wr)
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
  return { results, total, wrs }
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

/** Гистограмма win rate: 0 %, (0–20), [20–80], (80–100), 100 %. */
function wrHistogram(wrs: number[]): string {
  const b = [0, 0, 0, 0, 0]
  for (const w of wrs) {
    if (w <= 0) b[0]++
    else if (w < 0.2) b[1]++
    else if (w <= 0.8) b[2]++
    else if (w < 1) b[3]++
    else b[4]++
  }
  const n = wrs.length
  return `0%: ${b[0]} (${((b[0] / n) * 100).toFixed(0)}%) · 0–20%: ${b[1]} · 20–80%: ${b[2]} (${((b[2] / n) * 100).toFixed(0)}%) · 80–100%: ${b[3]} · 100%: ${b[4]} (${((b[4] / n) * 100).toFixed(0)}%)`
}

const topKOnly = (scored: { sc: SlotConfig; score: number }[]): Set<string> =>
  new Set([...scored].sort((a, b) => b.score - a.score).slice(0, OPTIMIZER_TOP_K).map((x) => x.sc.item!))

const withDiversity = (scored: { sc: SlotConfig; score: number }[], heroEl: string): Set<string> =>
  new Set(selectSlotCandidates(scored, OPTIMIZER_TOP_K, slotFeats(heroEl)).map((x) => x.item!))

// ─────────────── откалиброванный набор: базовый win rate 20–80 % ───────────────

interface TunedCase {
  hero: (typeof heroes)[number]
  si: number
  q: Quest
  variants: { sc: SlotConfig; m: SimMetrics }[]
}

/** Лексикографический «лучший»: win rate ↑ → раунды ↓ → мин. % HP выжившего ↑ → урон/раунд ↑. */
function cmpMetrics(a: SimMetrics, b: SimMetrics): number {
  if (a.winRate !== b.winRate) return b.winRate - a.winRate
  if (a.avgRounds !== b.avgRounds) return a.avgRounds - b.avgRounds
  if (a.avgMinSurvivorHpPct !== b.avgMinSurvivorHpPct) return b.avgMinSurvivorHpPct - a.avgMinSurvivorHpPct
  return b.avgDamagePerRound - a.avgDamagePerRound
}

/** Случайный герой+квест, monsterHp подобран так, чтобы базовый win rate попал в 20–80 %. */
function tunedCases(minCases: number): TunedCase[] {
  const rng = mulberry32(20261010)
  const K = OPTIMIZER_TOP_K
  const out: TunedCase[] = []
  for (let attempt = 0; attempt < 400 && out.length < minCases; attempt++) {
    const hero = heroes[Math.floor(rng() * heroes.length)]
    const cls = clsOf(hero)
    let q = quest({
      variant: rng() < 0.5 ? 'boss' : 'normal',
      monsterHp: Math.round(30000 + rng() * 200000),
      monsterDmg: Math.round(500 + rng() * 1500),
    })
    const baseF = fighterFromHero(hero, data)
    let wr = simulateTeam([baseF], q, { runs: 300, seed: 42 }).winRate
    for (let it = 0; it < 12 && (wr < 0.2 || wr > 0.8); it++) {
      q = quest({ ...q, monsterHp: Math.max(1000, Math.round(q.monsterHp * (wr < 0.2 ? 0.7 : 1.4))) })
      wr = simulateTeam([baseF], q, { runs: 300, seed: 42 }).winRate
    }
    if (wr < 0.2 || wr > 0.8) continue
    const si = Math.floor(rng() * 6)
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
    const variants = sample.map((sc) => {
      const f = fighterFromHero(applyHeroConfig(hero, hero.slots.map((s, j) => (j === si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
      return { sc, m: simulateTeam([f], q, { runs: 300, seed: 42 }) }
    })
    out.push({ hero, si, q, variants })
  }
  return out
}

function measureTuned(cases: TunedCase[], select: (scored: { sc: SlotConfig; score: number }[], heroEl: string) => Set<string>): { notIn: number; losses: number[] } {
  let notIn = 0
  const losses: number[] = []
  for (const c of cases) {
    const cls = clsOf(c.hero)
    const scored = c.variants.map(({ sc, m }) => {
      const f = fighterFromHero(applyHeroConfig(c.hero, c.hero.slots.map((s, j) => (j === c.si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
      return { sc, score: quickScore([f], c.q) / c.q.monsterHp, m }
    })
    const selected = select(scored, cls.element)
    const best = [...scored].sort((a, b) => cmpMetrics(a.m, b.m))[0]
    if (!selected.has(best.sc.item!)) notIn++
    let bestWrSel = -1
    for (const v of scored) if (selected.has(v.sc.item!) && v.m.winRate > bestWrSel) bestWrSel = v.m.winRate
    losses.push(best.m.winRate - Math.max(0, bestWrSel))
  }
  return { notIn, losses }
}

describe('цена промаха отсева', () => {
  it('базовый чистый top-K: распределение потерь и разбор промахов (калибровка сессии 6→7)', () => {
    const r = runCases((scored) => topKOnly(scored))
    report('top-K', r)
    console.log(`[распределение win rate на 120 случаях] ${wrHistogram(r.wrs)}`)
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

  it('набор с win rate 20–80 % (≥30 случаев): повторный замер промахов', () => {
    const cases = tunedCases(30)
    expect(cases.length).toBeGreaterThanOrEqual(30)
    const baseWrs = cases.map((c) => simulateTeam([fighterFromHero(c.hero, data)], c.q, { runs: 300, seed: 42 }).winRate)
    console.log(`\n[tuned 20–80%] случаев: ${cases.length}; базовый win rate: мин ${(Math.min(...baseWrs) * 100).toFixed(0)}%, макс ${(Math.max(...baseWrs) * 100).toFixed(0)}%`)
    console.log(`[tuned 20–80%] win rate всех вариантов: ${wrHistogram(cases.flatMap((c) => c.variants.map((v) => v.m.winRate)))}`)
    const a = measureTuned(cases, (s) => topKOnly(s))
    const b = measureTuned(cases, withDiversity)
    console.log(`[tuned top-K] лучший не в множестве: ${a.notIn}/${cases.length} (${((a.notIn / cases.length) * 100).toFixed(1)}%); потеря WR: медиана ${pct(median(a.losses))}, max ${pct(Math.max(0, ...a.losses))}`)
    console.log(`[tuned top-K+разнообразие] лучший не в множестве: ${b.notIn}/${cases.length} (${((b.notIn / cases.length) * 100).toFixed(1)}%); потеря WR: медиана ${pct(median(b.losses))}, max ${pct(Math.max(0, ...b.losses))}`)
    expect(b.notIn / cases.length).toBeLessThan(0.05)
    expect(Math.max(0, ...b.losses)).toBeLessThanOrEqual(0.01)
  })
})
