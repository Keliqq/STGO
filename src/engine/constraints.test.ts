import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { HeroInstance, Quality, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { DEFAULT_MAX_QUALITY, DEFAULT_MAX_STONE_TIER, TITAN_SPIRIT_NAME } from './constants.ts'
import {
  defaultConstraints,
  maxDataTier,
  NO_OVERRIDES,
  nextQuality,
  perHeroTierNote,
  resolveConstraints,
  upgradeOutcome,
  upgradeScenarios,
} from './constraints.ts'
import { capForHero } from './optimizer.ts'
import { runOptimizer, type OptimizerInput, type OptimizerResult } from './optimizer.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)
const tierOf = (name: string) => data.items.find((i) => i.name === name)!.tier

const bare = (h: HeroInstance): HeroInstance => ({
  ...h,
  slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as Quality, element: null, spirit: null })),
})

describe('defaultConstraints', () => {
  it('тир, качество и камни — на каждого героя (макс. надетый у него + 1)', () => {
    const team = heroes.slice(0, 2)
    const c = defaultConstraints(data, team)
    team.forEach((h, hi) => {
      const equipped = h.slots.filter((s) => s.item).map((s) => tierOf(s.item!))
      const own = c.perHero!.find((x) => x.hero === hi)!
      const expected = equipped.length > 0 ? Math.min(Math.max(...equipped) + 1, maxDataTier(data)) : maxDataTier(data)
      expect(own.maxItemTier, `герой ${hi}`).toBe(expected)
      expect(own.maxStoneTier).toBeGreaterThanOrEqual(DEFAULT_MAX_STONE_TIER)
    })
    expect(c.maxQuality).toBe(DEFAULT_MAX_QUALITY)
    // Верхняя граница отряда — максимум по героям (для переопределений пользователя).
    expect(c.maxItemTier).toBe(Math.max(...c.perHero!.map((x) => x.maxItemTier)))
  })

  it('слабый герой не получает тир сильного (per-hero, а не на отряд)', () => {
    const strong = heroes.slice().sort((a, b) => Math.max(...b.slots.filter((s) => s.item).map((s) => tierOf(s.item!))) - Math.max(...a.slots.filter((s) => s.item).map((s) => tierOf(s.item!))))[0]
    const weak: HeroInstance = {
      ...heroes[0],
      slots: heroes[0].slots.map((s) => (s.item ? { ...s, item: data.items.find((i) => i.name === s.item && i.tier <= 2)?.name ?? s.item } : s)),
    }
    const strongTier = Math.max(...strong.slots.filter((s) => s.item).map((s) => tierOf(s.item!)))
    const weakTiers = weak.slots.filter((s) => s.item).map((s) => tierOf(s.item!))
    const c = defaultConstraints(data, [strong, weak])
    const capStrong = c.perHero!.find((x) => x.hero === 0)!.maxItemTier
    const capWeak = c.perHero!.find((x) => x.hero === 1)!.maxItemTier
    expect(capStrong).toBe(Math.min(strongTier + 1, maxDataTier(data)))
    expect(capWeak).toBe(Math.min(Math.max(...weakTiers) + 1, maxDataTier(data)))
    expect(capWeak).toBeLessThanOrEqual(capStrong)
  })

  it('камни: если надет камень выше T9 — лимит = его тир', () => {
    const top = data.enchants.filter((e) => e.kind === 'element').reduce((a, b) => ((b.tier ?? 0) > (a.tier ?? 0) ? b : a))
    expect(top.tier).toBeGreaterThan(DEFAULT_MAX_STONE_TIER)
    const h = bare(heroes[0])
    h.slots[0] = { ...h.slots[0], element: top.name }
    expect(defaultConstraints(data, [h]).perHero![0].maxStoneTier).toBe(top.tier)
    expect(defaultConstraints(data, [bare(heroes[0])]).perHero![0].maxStoneTier).toBe(DEFAULT_MAX_STONE_TIER)
  })

  it('без надетых предметов — тир не ограничен', () => {
    const c = defaultConstraints(data, [bare(heroes[0])])
    expect(c.perHero![0].maxItemTier).toBe(maxDataTier(data))
    expect(c.maxItemTier).toBe(maxDataTier(data))
  })

  it('Титан — только если «Душа» у всех героев (с учётом переопределения)', () => {
    const noSoul = { ...heroes[0], titanSoul: false }
    const soul = { ...heroes[1], titanSoul: true }
    expect(defaultConstraints(data, [noSoul]).spirits).not.toContain(TITAN_SPIRIT_NAME)
    expect(defaultConstraints(data, [noSoul, soul]).spirits).not.toContain(TITAN_SPIRIT_NAME)
    expect(defaultConstraints(data, [soul]).spirits).toContain(TITAN_SPIRIT_NAME)
    expect(defaultConstraints(data, [noSoul], 'on').spirits).toContain(TITAN_SPIRIT_NAME)
    expect(defaultConstraints(data, [soul], 'off').spirits).not.toContain(TITAN_SPIRIT_NAME)
    const allSpirits = data.enchants.filter((e) => e.kind === 'spirit').length
    expect(defaultConstraints(data, [noSoul]).spirits).toHaveLength(allSpirits - 1)
  })

  it('переопределения пользователя поверх значений по умолчанию', () => {
    const d = defaultConstraints(data, [heroes[0]])
    const r0 = resolveConstraints(d, NO_OVERRIDES)
    expect(r0).toEqual(d)
    const r = resolveConstraints(d, { ...NO_OVERRIDES, maxItemTier: 3, maxQuality: 'Epic', spirits: ['Bear Spirit'] })
    expect(r).toEqual({ ...d, maxItemTier: 3, maxQuality: 'Epic', spirits: ['Bear Spirit'], perHero: undefined })
    // Ручной список духов снимает ограничения «по герою» (иначе выбор пользователя не применился бы).
    expect(resolveConstraints(d, { ...NO_OVERRIDES, spirits: ['Bear Spirit'] }).perHero).toBeUndefined()
    // Переопределение тира сохраняет ограничения героев: они лишь урезаются общим потолком.
    expect(resolveConstraints(d, { ...NO_OVERRIDES, maxItemTier: 4 }).perHero).toEqual(d.perHero)
  })
})

describe('capForHero', () => {
  it('итог = min(ограничение героя, ограничение отряда)', () => {
    const cons = {
      maxItemTier: 8,
      maxQuality: 'Superior' as Quality,
      maxStoneTier: 9,
      spirits: null,
      perHero: [{ hero: 0, maxItemTier: 12, maxStoneTier: 12 }, { hero: 1, maxItemTier: 3, maxStoneTier: 4 }],
    }
    expect(capForHero(cons, 0)).toEqual({ hero: 0, maxItemTier: 8, maxStoneTier: 9 })
    expect(capForHero(cons, 1)).toEqual({ hero: 1, maxItemTier: 3, maxStoneTier: 4 })
    expect(capForHero(cons, 2)).toEqual({ hero: 2, maxItemTier: 8, maxStoneTier: 9 })
  })

  it('perHeroTierNote показывает разные потолки', () => {
    const team = heroes.slice(0, 2)
    const cons = { ...defaultConstraints(data, team), maxItemTier: 12 }
    cons.perHero = [
      { hero: 0, maxItemTier: 9, maxStoneTier: 9 },
      { hero: 1, maxItemTier: 6, maxStoneTier: 9 },
    ]
    const note = perHeroTierNote(team, cons)
    expect(note).toHaveLength(2)
    expect(note[0]).toContain('до T9')
    expect(note[1]).toContain('до T6')
    expect(perHeroTierNote(team, { ...cons, perHero: undefined })).toEqual([])
  })
})

describe('сценарии +1 тир / +1 качество', () => {
  const quest: Quest = {
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
  }
  const input: OptimizerInput = {
    heroes: [heroes[0]],
    mode: 'quest',
    quests: [{ quest, weight: 1 }],
    constraints: { maxItemTier: 8, maxQuality: 'Superior', maxStoneTier: 9, spirits: null },
    simBudget: 40,
    simRuns: 200,
  }

  it('nextQuality', () => {
    expect(nextQuality('Superior')).toBe('Flawless')
    expect(nextQuality('Legendary')).toBeNull()
  })

  it('сценарии стартуют с найденного набора; на максимуме — пропускаются', async () => {
    const res = await runOptimizer(data, input)
    const sc = upgradeScenarios(data, input, res)
    expect(sc.map((s) => s.kind)).toEqual(['tier', 'quality'])
    expect(sc[0].input.constraints.maxItemTier).toBe(9)
    expect(sc[1].input.constraints.maxQuality).toBe('Flawless')
    expect(sc[0].input.heroes[0].slots.map((s) => s.item)).toEqual(res.configs[0].map((c) => c.item))
    const top = upgradeScenarios(data, { ...input, constraints: { ...input.constraints, maxItemTier: maxDataTier(data), maxQuality: 'Legendary' } }, res)
    expect(top).toEqual([])
  })

  it('+1 тир поднимает и потолки героев (иначе min(свой, отряда) оставлял прежний тир)', async () => {
    const res = await runOptimizer(data, input)
    const withPerHero: OptimizerInput = {
      ...input,
      constraints: { ...input.constraints, perHero: [{ hero: 0, maxItemTier: 8, maxStoneTier: 9 }] },
    }
    const tier = upgradeScenarios(data, withPerHero, res).find((s) => s.kind === 'tier')!
    expect(capForHero(tier.input.constraints, 0).maxItemTier).toBe(9)
  })

  it('+1 качество не ухудшает цель, замены — относительно найденного набора', async () => {
    const res = await runOptimizer(data, input)
    const q = upgradeScenarios(data, input, res).find((s) => s.kind === 'quality')!
    const alt = await runOptimizer(data, { ...q.input, simBudget: 60 })
    const o = upgradeOutcome(res, alt)
    expect(o.delta).toBeGreaterThanOrEqual(0)
    expect(o.objective).toBeGreaterThanOrEqual(res.objective)
    for (const e of o.changes.flat()) expect(e.to).toMatch(/Flawless/)
  })

  it('upgradeOutcome: хуже исходного → прирост 0 и без замен', () => {
    const mk = (objective: number): OptimizerResult => ({
      configs: [[]],
      objective,
      winRate: objective,
      improvement: 0,
      perQuest: [],
      worstQuest: null,
      explanations: [[{ slot: 0, from: 'a', to: 'b', winRateDelta: 0.1 }]],
      warnings: [],
      simsUsed: 0,
      cancelled: false,
      tieBreakUsed: false,
    })
    expect(upgradeOutcome(mk(0.6), mk(0.5))).toEqual({ objective: 0.6, delta: 0, changes: [[]], cancelled: false })
    expect(upgradeOutcome(mk(0.5), mk(0.6)).delta).toBeCloseTo(0.1)
  })
})
