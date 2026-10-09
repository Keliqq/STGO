/**
 * Тесты оптимизатора: ограничения слотов/артефактов, пул owned, детерминизм,
 * и проверка решения сессии 5 — «отсев top-K не выбрасывает лучший по симуляции набор»
 * на 20 случаях (доля промахов фиксируется в PROGRESS.md).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { HeroInstance, Quality, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, mulberry32, simulateTeam } from './combat.ts'
import { OPTIMIZER_TOP_K } from './constants.ts'
import { QUALITY_ORDER } from './quality.ts'
import { applyHeroConfig, runOptimizer, type ItemPool, type OptimizerInput, type SlotConfig } from './optimizer.ts'
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
  pool: { kind: 'all' },
  constraints: CONS,
  simBudget: 60,
  simRuns: 300,
  ...over,
})

const itemByName = (name: string) => data.items.find((i) => i.name === name)!
const enchantByName = (name: string) => data.enchants.find((e) => e.name === name)!
const clsOf = (h: HeroInstance) => data.heroClasses.find((c) => c.name === h.className)!

describe('оптимизатор: ограничения', () => {
  it('типы по слотам, тир, качество, один артефакт, стихия камня', () => {
    const res = runOptimizer(data, baseInput(heroes[0]))
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

  it('не больше одного артефакта на героя (пул с артефактами)', () => {
    const artifactItems = data.items.filter((i) => i.artifactSkill && i.isEquipment && i.tier <= 15)
    if (artifactItems.length < 2) return
    const pool: ItemPool = {
      kind: 'owned',
      items: artifactItems.map((i) => ({ name: i.name, quality: 'Flawless' })),
      stones: [],
      spirits: [],
    }
    const res = runOptimizer(data, baseInput(heroes[0], { pool }))
    const n = res.configs[0].filter((s) => s.item && itemByName(s.item).artifactSkill).length
    expect(n).toBeLessThanOrEqual(1)
  })
})

describe('оптимизатор: пул owned', () => {
  it('предлагаются только предметы из инвентаря (или текущая экипировка)', () => {
    const hero = heroes[0]
    const ownedNames = new Set(hero.slots.map((s) => s.item).filter((x): x is string => !!x))
    // Добавим по одному предмету на слот из допустимых типов.
    const cls = clsOf(hero)
    for (let si = 0; si < 6; si++) {
      const extra = data.items.find((i) => i.isEquipment && cls.slots[si].includes(i.type) && i.tier <= 15 && !ownedNames.has(i.name))
      if (extra) ownedNames.add(extra.name)
    }
    const pool: ItemPool = {
      kind: 'owned',
      items: [...ownedNames].map((name) => ({ name, quality: 'Flawless' as Quality })),
      stones: [],
      spirits: [],
    }
    const res = runOptimizer(data, baseInput(hero, { pool }))
    for (const sc of res.configs[0]) {
      if (sc.item) expect(ownedNames.has(sc.item), `чужой предмет ${sc.item}`).toBe(true)
    }
  })

  it('owned: камни и духи только из инвентаря', () => {
    // Герой без текущей экипировки — чтобы базовые камни не смешивали проверку.
    const bare: HeroInstance = {
      ...heroes[0],
      slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as Quality, element: null, spirit: null })),
    }
    const pool: ItemPool = { kind: 'owned', items: [], stones: ['Tide Element'], spirits: ['Bear Spirit'] }
    const res = runOptimizer(data, baseInput(bare, { pool }))
    for (const sc of res.configs[0]) {
      if (sc.element) expect(sc.element).toBe('Tide Element')
      if (sc.spirit) expect(sc.spirit).toBe('Bear Spirit')
    }
  })
})

describe('оптимизатор: детерминизм и режимы', () => {
  it('один seed → идентичный результат', () => {
    const a = runOptimizer(data, baseInput(heroes[0], { seed: 123 }))
    const b = runOptimizer(data, baseInput(heroes[0], { seed: 123 }))
    expect(JSON.stringify(a.configs)).toBe(JSON.stringify(b.configs))
    expect(a.objective).toBe(b.objective)
  })

  it('universal: взвешенная цель и худшая локация', () => {
    const q1 = quest({ id: 'a|normal|Hard', monsterHp: 40000 })
    const q2 = quest({ id: 'b|normal|Hard', monsterHp: 400000, monsterDmg: 1500 })
    const res = runOptimizer(data, baseInput(heroes[0], { mode: 'universal', quests: [{ quest: q1, weight: 2 }, { quest: q2, weight: 1 }] }))
    expect(res.perQuest).toHaveLength(2)
    expect(res.worstQuest).not.toBeNull()
    const mean = (res.perQuest[0].winRate * 2 + res.perQuest[1].winRate) / 3
    expect(res.objective).toBeCloseTo(mean, 10)
    expect(res.worstQuest!.winRate).toBe(Math.min(res.perQuest[0].winRate, res.perQuest[1].winRate))
  })

  it('robust: цель — минимум по локациям', () => {
    const q1 = quest({ id: 'a|normal|Hard', monsterHp: 40000 })
    const q2 = quest({ id: 'b|normal|Hard', monsterHp: 400000, monsterDmg: 1500 })
    const res = runOptimizer(data, baseInput(heroes[0], { mode: 'universal', robust: true, quests: [{ quest: q1, weight: 1 }, { quest: q2, weight: 1 }] }))
    expect(res.objective).toBe(Math.min(...res.perQuest.map((p) => p.winRate)))
  })

  it('отмена возвращает частичный результат с флагом', () => {
    const res = runOptimizer(data, baseInput(heroes[0]), { shouldCancel: () => true })
    expect(res.cancelled).toBe(true)
    expect(res.configs).toHaveLength(1)
  })
})

describe('отсев top-K против симуляции (решение сессии 5)', () => {
  it('на 20 случаях лучший по симуляции вариант слота не отсекается (доля промахов в логе)', () => {
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
        const top = new Set([...scored].sort((a, b) => b.quick - a.quick).slice(0, K).map((x) => x.sc.item))
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
    console.log(`Отсев top-${K}: промахов ${misses}/${total} (${(rate * 100).toFixed(1)}%) — лучший по симуляции вариант слота не попал в топ-K`)
    expect(total).toBeGreaterThan(0)
    expect(rate).toBeLessThanOrEqual(0.35)
  })
})
