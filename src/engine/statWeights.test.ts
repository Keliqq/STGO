/**
 * Веса статов (src/engine/statWeights.ts): детерминизм (CRN — общий seed → тот же результат),
 * реакция на прибавку стата, доли атак босса, вклад в барьер и совет по семенам.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { applyFighterBonus, barrierBroken, elementContributions, fighterFromHero, prepare, simulateTeam, threatShares } from './combat.ts'
import { STAT_WEIGHT_STATS, metricOf, seedAdviceFromWeights, statWeights, weightValue, weightsProbeQuest } from './statWeights.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)
const pick = (name: string) => heroes.find((h) => h.name === name)!

/** Средний по сложности квест: win rate не 0% и не 100% (цель различает наборы). */
const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'probe|normal|Hard',
  area: 'Probe',
  variant: 'normal',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 120000,
  monsterDmg: 900,
  monsterAoe: 400,
  barrier: null,
  defCaps: { p50: 2000, p70: 4000, p75: 12000 },
  miniBosses: [],
  ...over,
})

const team = [pick('Антуан'), pick('Эбигейл')]
const fighters = team.map((h) => fighterFromHero(h, data))

describe('веса статов: детерминизм', () => {
  it('общий seed → одинаковые веса', () => {
    const q = quest()
    const a = statWeights(fighters, q, { runs: 200, seed: 7 })
    const b = statWeights(fighters, q, { runs: 200, seed: 7 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('другой seed → другой шум, но тот же порядок статов по важности (в пределах шума)', () => {
    const q = quest({ monsterHp: 150000 })
    const a = statWeights(fighters, q, { runs: 2000, seed: 1 })
    const b = statWeights(fighters, q, { runs: 2000, seed: 99 })
    // Лучший стат одного seed в другом не хуже его лучшего больше чем на шум (у Антуана EVA и угроза
    // дают по ≈ +0,33 п.п. — ничью решает шум, поэтому точное совпадение имён проверять нельзя).
    const NOISE = 0.005
    for (const [x, y] of [[a, b], [b, a]] as const) {
      x.heroes.forEach((h, i) => {
        const other = y.heroes[i]
        const bestOther = Math.max(...other.weights.map((w) => w.winRatePp))
        const mineInOther = other.weights.find((w) => w.stat === h.best)!.winRatePp
        expect(bestOther - mineInOther, `${h.name}: ${h.best}`).toBeLessThanOrEqual(NOISE)
      })
    }
  })
})

describe('веса статов: смысл', () => {
  it('каждый стат имеет подпись шага и попал в веса', () => {
    const w = statWeights(fighters, quest(), { runs: 100, seed: 3 })
    expect(w.heroes).toHaveLength(2)
    for (const h of w.heroes) {
      expect(h.weights.map((x) => x.stat)).toEqual([...STAT_WEIGHT_STATS])
      for (const x of h.weights) expect(x.stepLabel).toMatch(/^\+/)
      expect(h.headline).toContain('Главное для героя')
    }
    expect(Object.keys(w.team).sort()).toEqual([...STAT_WEIGHT_STATS].sort())
  })

  it('+5% ATK повышает урон за раунд (прибавка действительно применяется)', () => {
    // Монстр, который не убивает героя с одного удара, и пороги DEF: урон виден в метрике.
    const q = quest({ monsterHp: 300_000, monsterDmg: 100, monsterAoe: 0, defCaps: { p50: 2000, p70: 4000, p75: 12000 } })
    const f = fighterFromHero(pick('Эбигейл'), data)
    const base = simulateTeam([f], q, { runs: 3, seed: 11, maxRounds: 5 })
    const boosted = simulateTeam([applyFighterBonus(f, { atk: f.atk * 0.05 })], q, { runs: 3, seed: 11, maxRounds: 5 })
    expect(base.avgDamagePerRound).toBeGreaterThan(0)
    expect(boosted.avgDamagePerRound).toBeGreaterThan(base.avgDamagePerRound)
  })

  it('прибавка применяется ровно один раз (HP, EVA, CRIT, CRIT DMG)', () => {
    const f = fighterFromHero(pick('Эбигейл'), data)
    const q = quest()
    const plus = applyFighterBonus(f, { hp: 100, eva: 0.01, crit: 0.01, critDmg: 0.1 })
    expect(plus.hp).toBe(f.hp + 100)
    expect(plus.eva).toBeCloseTo(f.eva + 0.01, 10)
    expect(plus.crit).toBeCloseTo(f.crit + 0.01, 10)
    expect(plus.critDmg).toBeCloseTo(f.critDmg + 0.1, 10)
    // Бой не прибавляет бонус второй раз: у бойца без навыков макс. HP = HP, +100 → ровно +100.
    const bare = { ...f, skills: [], innateSkillId: null, innateBonus: undefined }
    expect(prepare([applyFighterBonus(bare, { hp: 100 })], q, {}).maxHp[0] - prepare([bare], q, {}).maxHp[0]).toBe(100)
  })

  it('метрика: насыщенный win rate → урон/мин. HP, средний → win rate', () => {
    expect(metricOf(0.4)).toBe('winRatePp')
    expect(metricOf(1)).toBe('damagePct')
    expect(metricOf(1, 'hp')).toBe('minSurvivorHpPp')
    expect(metricOf(0.5, 'def')).toBe('winRatePp')
    expect(metricOf(0, 'def')).toBe('minSurvivorHpPp')
    expect(metricOf(0, 'atk')).toBe('damagePct')
  })

  it('weightValue берёт метрику стата', () => {
    const w = { stat: 'hp' as const, stepLabel: '+5% HP', plus: {}, winRatePp: 0.02, damagePct: -0.03, minSurvivorHpPp: 0.05, metric: 'minSurvivorHpPp' as const }
    expect(weightValue(w, 1)).toBe(0.05)
  })
})

describe('угроза и барьер', () => {
  it('доли атак по угрозе и AoE суммируются в 1', () => {
    const s = threatShares(fighters, { aoeChance: 0.2 })
    expect(s).toHaveLength(2)
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    // Угроза Антуана 120 против 10 у Эбигейл — удары идут в танка.
    expect(s[0]).toBeGreaterThan(s[1])
  })

  it('нулевая угроза у всех → равные доли', () => {
    const zero = fighters.map((f) => ({ ...f, threat: 0 }))
    const s = threatShares(zero, { aoeChance: 0 })
    expect(s[0]).toBeCloseTo(0.5, 10)
  })

  it('вклад в барьер: считается по стихии барьера и совпадает с barrierBroken', () => {
    const q = quest({ barrier: { elements: ['Light'], hp: 100 } })
    const { elements, values } = elementContributions(fighters, q)
    expect(elements).toEqual(['Light'])
    expect(values).toHaveLength(2)
    const sum = values[0][0] + values[1][0]
    expect(barrierBroken(fighters, q)).toBe(sum >= 100)
  })

  it('веса показывают угрозу и барьер квеста', () => {
    const q = quest({ barrier: { elements: ['Light'], hp: 100 } })
    const w = statWeights(fighters, q, { runs: 100, seed: 5 })
    expect(w.threat).toHaveLength(2)
    expect(w.threat.reduce((a, t) => a + t.share, 0)).toBeCloseTo(1, 3)
    expect(w.barrier?.bestElement).toBe('Light')
    expect(w.barrier?.contributions).toHaveLength(2)
  })
})

describe('веса: ослабленный зонд, когда квест не различает наборы', () => {
  it('непроходимый квест → веса считаются на зонде и это помечено', () => {
    const q = quest({ monsterHp: 100_000_000, monsterDmg: 100_000, barrier: { elements: ['Dark'], hp: 100_000 } })
    const w = statWeights(fighters, q, { runs: 80, seed: 4 })
    expect(w.base.winRate).toBe(0)
    expect(w.probe).not.toBeNull()
    expect(w.probe!.hpFactor).toBeGreaterThan(1)
    expect(w.heroes.some((h) => h.meaningful)).toBe(true)
  })

  it('зонд ослабляет квест: HP делится на factor, урон — мягче (иначе статы не нужны)', () => {
    const q = quest()
    const p = weightsProbeQuest(q, 4)
    expect(p.monsterHp).toBe(Math.round(q.monsterHp / 4))
    expect(p.monsterDmg).toBe(Math.round(q.monsterDmg / 2))
    expect(p.monsterDmg).toBeLessThan(q.monsterDmg)
  })
})

describe('совет по семенам', () => {
  it('из весов ATK/HP/DEF выбирается лучший тип и есть фраза', () => {
    const w = statWeights(fighters, quest(), { runs: 150, seed: 6 })
    const a = seedAdviceFromWeights(w, { atk: 1, hp: 1, def: 1 }, 0)
    expect(a.rows).toHaveLength(3)
    expect(a.best).not.toBeNull()
    expect(a.text).toContain('Лучшие семена')
    const row = a.rows.find((r) => r.kind === a.best)!
    expect(row.perSeed).toBe(1)
  })

  it('величина семени — параметр: другое значение меняет подпись шага', () => {
    const w = statWeights(fighters, quest(), { runs: 100, seed: 6 })
    const a = seedAdviceFromWeights(w, { atk: 25, hp: 25, def: 25 }, 0)
    expect(a.rows[0].weight.stepLabel).toBe('+25 ATK')
  })
})
