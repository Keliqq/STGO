/**
 * Тесты оптимизатора: ограничения слотов/артефактов/камней/духов, детерминизм,
 * и проверка отсева — «отсев (top-K + разнообразные + адаптивный K) не выбрасывает лучший
 * по симуляции вариант слота» на 20 случаях (доля промахов фиксируется в PROGRESS.md).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { HeroInstance, Quality, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, mulberry32, simulateTeam } from './combat.ts'
import { OPTIMIZER_TOP_K } from './constants.ts'
import { defaultConstraints } from './constraints.ts'
import { maxItemTierFor } from './formulas.ts'
import { QUALITY_ORDER } from './quality.ts'
import { applyHeroConfig, evasionSurplusNote, runOptimizer, selectSlotCandidates, tierCapFor, type OptimizerInput, type SlotConfig, type SlotFeatures } from './optimizer.ts'
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

const CONS = { maxItemTier: 15, maxQuality: 'Flawless' as Quality, maxStoneTier: 5, spirits: null }

const baseInput = (hero: HeroInstance, over: Partial<OptimizerInput> = {}): OptimizerInput => ({
  heroes: [hero],
  mode: 'quest',
  quests: [{ quest: quest(), weight: 1 }],
  constraints: CONS,
  simBudget: 60,
  simRuns: 300,
  ...over,
})

const itemByName = (name: string) => data.items.find((i) => i.name === name)!
const enchantByName = (name: string) => data.enchants.find((e) => e.name === name)!
const clsOf = (h: HeroInstance) => data.heroClasses.find((c) => c.name === h.className)!
const maxTier = (h: HeroInstance) => Math.max(0, ...h.slots.filter((s) => s.item).map((s) => itemByName(s.item!).tier))

const elValue = new Map(data.enchants.filter((e) => e.kind === 'element').map((e) => [e.name, e.elementValue ?? 0]))
const slotFeats = (heroEl: string) => (sc: SlotConfig): SlotFeatures => {
  const it = itemByName(sc.item!)
  const st = it.stats[sc.quality]
  const el = sc.element ? (elValue.get(sc.element) ?? 0) : it.builtInElement ? (elValue.get(it.builtInElement) ?? 0) : 0
  const affinity = it.elementAffinity === 'All' || it.elementAffinity.some((e) => heroEl === 'Any' || e === heroEl)
  return { atk: st.atk, def: st.def, hp: st.hp, eva: st.eva, crit: st.crit, element: el, artifact: !!it.artifactSkill, affinity }
}

describe('оптимизатор: ограничения', () => {
  it('типы по слотам, тир, качество, один артефакт, стихия камня', async () => {
    const res = await runOptimizer(data, baseInput(heroes[0]))
    const hero = heroes[0]
    const cls = clsOf(hero)
    const cfg = res.configs[0]
    expect(cfg).toHaveLength(6)
    let artifacts = 0
    cfg.forEach((sc: SlotConfig, si) => {
      if (!sc.item) return
      const item = itemByName(sc.item)
      expect(cls.slots[si], `слот ${si}: ${item.name}`).toContain(item.type)
      expect(item.tier).toBeLessThanOrEqual(CONS.maxItemTier)
      expect(QUALITY_ORDER.indexOf(sc.quality)).toBeLessThanOrEqual(QUALITY_ORDER.indexOf(CONS.maxQuality))
      if (item.artifactSkill) artifacts++
      if (sc.element) {
        const st = enchantByName(sc.element)
        if (cls.element !== 'Any') {
          expect(['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold']).toContain(st.element)
          expect(st.element === cls.element || st.element === 'Gold', `${st.name}: стихия ${st.element} ≠ ${cls.element}`).toBe(true)
        }
        if (CONS.maxStoneTier != null) expect(st.tier ?? 0).toBeLessThanOrEqual(CONS.maxStoneTier)
      }
    })
    expect(artifacts).toBeLessThanOrEqual(1)
  })
})

describe('оптимизатор: ограничения на героя (per-hero), а не на отряд', () => {
  it('слабому герою не предлагаются предметы под сильного', async () => {
    const strong = heroes.slice().sort((a, b) => maxTier(b) - maxTier(a))[0]
    const weak: HeroInstance = { ...heroes[0], id: 'weak', name: 'Слабый', slots: heroes[0].slots.map((s) => ({ ...s, item: null, element: null, spirit: null })) }
    const res = await runOptimizer(data, {
      heroes: [strong, weak],
      mode: 'quest',
      quests: [{ quest: quest(), weight: 1 }],
      // Общий потолок высокий, но герои ограничены каждый своим надетым (макс. надетый у него + 1).
      constraints: { maxItemTier: 15, maxQuality: 'Flawless', maxStoneTier: 9, spirits: null, perHero: [{ hero: 0, maxItemTier: 15, maxStoneTier: 9 }, { hero: 1, maxItemTier: 3, maxStoneTier: 9 }] },
      simBudget: 40,
      simRuns: 200,
    })
    for (const sc of res.configs[1]) {
      if (!sc.item) continue
      expect(itemByName(sc.item).tier, `слабый герой: ${sc.item}`).toBeLessThanOrEqual(3)
    }
    expect(res.configs[0].some((sc) => sc.item && itemByName(sc.item).tier > 3)).toBe(true)
  })

  it('не предлагает предмет выше Max Item Tier уровня героя (A41 + A66)', async () => {
    // Голый герой низкого уровня и щедрые ограничения: потолок задаёт только HERO LEVELS.
    const level = 10 // Max Item Tier(10) = 4
    const bare: HeroInstance = {
      ...heroes[0],
      id: 'bare-level-10',
      name: 'Новичок',
      level,
      reference: null,
      slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as Quality, element: null, spirit: null })),
    }
    const levelCap = maxItemTierFor(data, level)!
    expect(levelCap).toBeLessThan(15)
    const res = await runOptimizer(data, baseInput(bare, { constraints: { ...CONS, maxItemTier: 15 } }))
    const picked = res.configs[0].filter((sc) => sc.item)
    expect(picked.length, 'подбор вообще что-то предложил').toBeGreaterThan(0)
    for (const sc of picked) expect(itemByName(sc.item!).tier, sc.item!).toBeLessThanOrEqual(levelCap)
    // Тот же потолок у ограничений по умолчанию: «макс. надетый + 1» за уровень не выходит.
    const defaults = defaultConstraints(data, [bare])
    expect(defaults.perHero?.[0].maxItemTier).toBe(levelCap)
  })

  it('свой потолок пользователя не поднимает тир выше Max Item Tier уровня', () => {
    expect(tierCapFor(data, { ...CONS, maxItemTier: 16 }, 0, 1)).toBe(maxItemTierFor(data, 1))
    expect(tierCapFor(data, { ...CONS, maxItemTier: 16 }, 0, 50)).toBe(16)
    // Ручной (per-hero) потолок ниже уровня — действует он.
    const cons = { ...CONS, maxItemTier: 16, perHero: [{ hero: 0, maxItemTier: 2, maxStoneTier: 9 }] }
    expect(tierCapFor(data, cons, 0, 50)).toBe(2)
  })
})

describe('оптимизатор: камни и духи по ограничениям', () => {
  it('камни — до maxStoneTier, духи — только из списка', async () => {
    // Герой без текущей экипировки — чтобы базовые камни не смешивали проверку.
    const bare: HeroInstance = {
      ...heroes[0],
      slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as Quality, element: null, spirit: null })),
    }
    const constraints = { ...CONS, maxStoneTier: 4, spirits: ['Bear Spirit'] }
    const res = await runOptimizer(data, baseInput(bare, { constraints }))
    for (const sc of res.configs[0]) {
      if (sc.element) expect(enchantByName(sc.element).tier ?? 0).toBeLessThanOrEqual(4)
      if (sc.spirit) expect(sc.spirit).toBe('Bear Spirit')
    }
  })
})

describe('оптимизатор: детерминизм и режимы', () => {
  it('один seed → идентичный результат', async () => {
    const a = await runOptimizer(data, baseInput(heroes[0], { seed: 123 }))
    const b = await runOptimizer(data, baseInput(heroes[0], { seed: 123 }))
    expect(JSON.stringify(a.configs)).toBe(JSON.stringify(b.configs))
    expect(a.objective).toBe(b.objective)
  })

  it('universal: взвешенная цель и худшая локация', async () => {
    const q1 = quest({ id: 'a|normal|Hard', monsterHp: 40000 })
    const q2 = quest({ id: 'b|normal|Hard', monsterHp: 400000, monsterDmg: 1500 })
    const res = await runOptimizer(data, baseInput(heroes[0], { mode: 'universal', quests: [{ quest: q1, weight: 2 }, { quest: q2, weight: 1 }] }))
    expect(res.perQuest).toHaveLength(2)
    expect(res.worstQuest).not.toBeNull()
    const mean = (res.perQuest[0].winRate * 2 + res.perQuest[1].winRate) / 3
    expect(res.objective).toBeCloseTo(mean, 10)
    expect(res.worstQuest!.winRate).toBe(Math.min(res.perQuest[0].winRate, res.perQuest[1].winRate))
  })

  it('robust: цель — минимум по локациям', async () => {
    const q1 = quest({ id: 'a|normal|Hard', monsterHp: 40000 })
    const q2 = quest({ id: 'b|normal|Hard', monsterHp: 400000, monsterDmg: 1500 })
    const res = await runOptimizer(data, baseInput(heroes[0], { mode: 'universal', robust: true, quests: [{ quest: q1, weight: 1 }, { quest: q2, weight: 1 }] }))
    expect(res.objective).toBe(Math.min(...res.perQuest.map((p) => p.winRate)))
  })

  it('прирост «к надетому» = win rate найденного − win rate надетого (надетый симулируется)', async () => {
    const input = baseInput(heroes[0])
    const res = await runOptimizer(data, input)
    const fs = [fighterFromHero(heroes[0], data)]
    const worn = simulateTeam(fs, input.quests[0].quest, { runs: input.simRuns, seed: 42 }).winRate
    expect(res.improvement).toBeCloseTo(res.winRate - worn, 10)
    // Надетый набор — тоже кандидат: найденный по симуляции не хуже него.
    expect(res.improvement).toBeGreaterThanOrEqual(0)
  })

  it('отмена возвращает частичный результат с флагом', async () => {
    const res = await runOptimizer(data, baseInput(heroes[0]), { shouldCancel: () => true })
    expect(res.cancelled).toBe(true)
    expect(res.configs).toHaveLength(1)
  })
})

describe('излишек уклонения в объяснении слота (A42)', () => {
  it('EVA выше предела — предупреждаем; на Extreme запас до предела + 20 п.п.', () => {
    expect(evasionSurplusNote(0.9, 0.75, false)).toBe('уклонение упирается в предел 75%')
    expect(evasionSurplusNote(0.75, 0.75, false)).toBeNull()
    // На Extreme те же 90% работают как 70%: 20 п.п. съедает штраф (A34) — излишка ещё нет.
    expect(evasionSurplusNote(0.9, 0.75, true)).toBeNull()
    expect(evasionSurplusNote(0.95, 0.75, true)).toBeNull()
    expect(evasionSurplusNote(0.96, 0.75, true)).toBe('уклонение упирается в предел 75%')
    // У Pathfinder предел выше (78%) — излишек начинается позже.
    expect(evasionSurplusNote(0.78, 0.78, false)).toBeNull()
    expect(evasionSurplusNote(0.8, 0.78, false)).toBe('уклонение упирается в предел 78%')
    expect(evasionSurplusNote(0.98, 0.78, true)).toBeNull()
  })
})

describe('отсев против симуляции (top-K + разнообразие + адаптивный K)', () => {
  it('на 20 случаях лучший по симуляции вариант слота не отсекается (промахов < 5%)', async () => {
    const rng = mulberry32(20261009)
    const K = OPTIMIZER_TOP_K
    let total = 0
    let misses = 0
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
        // 15 случайных вариантов слота (без камней/духов — как в stage 1 отсева)
        const sample: SlotConfig[] = []
        const used = new Set<number>()
        while (sample.length < 15 && used.size < pool.length) {
          const k = Math.floor(rng() * pool.length)
          if (used.has(k)) continue
          used.add(k)
          sample.push({ item: pool[k].name, quality: 'Flawless', element: null, spirit: null })
        }
        const scored = sample.map((sc) => {
          const f = fighterFromHero(applyHeroConfig(hero, hero.slots.map((s, j) => (j === si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
          return { sc, quick: quickScore([f], q) / q.monsterHp }
        })
        const top = new Set(selectSlotCandidates(scored.map((x) => ({ sc: x.sc, score: x.quick })), K, slotFeats(cls.element)).map((x) => x.item))
        let bestItem: string | null = null
        let bestWr = -1
        for (const { sc } of scored) {
          const f = fighterFromHero(applyHeroConfig(hero, hero.slots.map((s, j) => (j === si ? sc : { item: s.item, quality: s.quality, element: s.element, spirit: s.spirit }))), data)
          const wr = simulateTeam([f], q, { runs: 300, seed: 42 }).winRate
          if (wr > bestWr) {
            bestWr = wr
            bestItem = sc.item
          }
        }
        total++
        if (bestItem && !top.has(bestItem)) misses++
      }
    }
    const rate = total > 0 ? misses / total : 0
    console.log(`Отсев top-${K}+разнообразие: промахов ${misses}/${total} (${(rate * 100).toFixed(1)}%) — лучший по симуляции вариант слота не попал в отсев`)
    expect(total).toBeGreaterThan(0)
    expect(rate).toBeLessThan(0.05)
  })
})
