/**
 * Тесты калибровки — на синтетических отметках (реальные пользовательские отметки в репозиторий
 * не попадают: они живут в браузере пользователя и в fixtures/reality.json).
 * Проверяем метрики, разрезы ошибок, сверку статов и чувствительность, а не «правильность» игры.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RealityCheck } from '../data/realityChecks.ts'
import { importTitansDb } from '../data/titansdb.ts'
import type { HeroInstance, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import {
  calibrationObjective,
  calibrationSummary,
  deathPredictions,
  describeVariant,
  MODEL_VARIANTS,
  questsToCheck,
  fixtureStatRms,
  FIXTURE_RMS_GUARD,
  groupStats,
  rankInfluence,
  runPrediction,
  sensitivityAnalysis,
  TUNING_KNOBS,
  tuneParameters,
  worstGroups,
  type FixtureHeroes,
  type PredictionInput,
} from './calibration.ts'
import { DEFAULT_MODEL, MAIN_STATS } from './stats.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const { heroes } = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data)

const fixture: FixtureHeroes = {
  data,
  heroes,
  reference: (h: HeroInstance) => {
    if (!h.reference) throw new Error(`${h.name}: нет эталона`)
    return h.reference.stats
  },
}

/** Простой квест: без порогов и барьера, урон врага и HP задаются тестом. */
const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'Test|boss|Extreme',
  area: 'Test',
  variant: 'boss',
  difficulty: 'Extreme',
  minPower: null,
  heroXp: null,
  monsterHp: 100000,
  monsterDmg: 100,
  monsterAoe: 50,
  barrier: null,
  defCaps: { p50: 1000, p70: 2000, p75: 6000 },
  miniBosses: [],
  ...over,
})

const check = (over: Partial<RealityCheck> = {}): RealityCheck => ({
  id: 'c1',
  questId: 'Test|boss|Extreme',
  questLabel: 'Test · босс · Extreme',
  teamLabel: 'Антуан',
  passed: true,
  simWinRate: 0.9,
  createdAt: '2026-10-10T00:00:00.000Z',
  modelVersion: 13,
  ...over,
})

const antoine = (): HeroInstance => {
  const h = heroes.find((x) => x.name === 'Антуан')
  if (!h) throw new Error('нет Антуана')
  return h
}

const input = (over: Partial<PredictionInput> = {}): PredictionInput => ({
  check: check(),
  quest: quest(),
  heroes: [antoine()],
  champion: null,
  ...over,
})

describe('метрики калибровки', () => {
  it('пустой список — нули, а не NaN', () => {
    expect(calibrationSummary([])).toEqual({
      n: 0, matched: 0, agreement: 0, brier: 0, agreementStored: 0, brierStored: 0, passRate: 0, meanPredicted: 0, bias: 0,
      deathN: 0, deathBrier: 0, deathAgreement: 0,
    })
  })

  it('согласие по порогу 50 %, Brier и смещение считаются по отметкам', () => {
    // Отряд Антуана на непобедимом квесте: отметка «проходит» → промах (предсказание 0).
    const impossible = runPrediction(input({ check: check({ passed: true }), quest: quest({ monsterDmg: 0, monsterHp: 1e12 }) }), data, { runs: 50, seed: 1 })
    const easy = runPrediction(
      input({ check: check({ id: 'c2', passed: false, simWinRate: 0.1 }), quest: quest({ monsterHp: 1, monsterDmg: 0 }) }),
      data,
      { runs: 50, seed: 1 },
    )
    expect(impossible.predicted).toBe(0)
    expect(impossible.matched).toBe(false)
    expect(impossible.error).toBe(1)
    expect(easy.predicted).toBe(1)
    expect(easy.matched).toBe(false)
    expect(easy.error).toBe(-1)

    const s = calibrationSummary([impossible, easy])
    expect(s.n).toBe(2)
    expect(s.matched).toBe(0)
    expect(s.agreement).toBe(0)
    // (0−1)² + (1−0)² = 2 → 1.0 на отметку: обе стороны ошибаются максимально.
    expect(s.brier).toBeCloseTo(1, 6)
    expect(s.bias).toBeCloseTo(0, 6)
    expect(s.passRate).toBe(0.5)
  })

  it('совпадение при «проходит» и win rate ровно 50 %', () => {
    const r = { ...runPrediction(input(), data, { runs: 10, seed: 1 }), predicted: 0.5 }
    expect(calibrationSummary([r]).agreement).toBe(1)
  })

  it('предсказание детерминировано по seed, а смена seed меняет поток', () => {
    // Квест подобран так, чтобы исход зависел от случайности (win rate ~30 %, а не 0/100 %):
    // на «насыщенных» квестах любой seed даёт один и тот же результат, и проверка была бы ложной.
    const q = quest({ monsterHp: 25000, monsterDmg: 200 })
    const opts = { runs: 200 }
    const a = runPrediction(input({ quest: q }), data, { ...opts, seed: 7 })
    const b = runPrediction(input({ quest: q }), data, { ...opts, seed: 7 })
    expect(a.metrics).toEqual(b.metrics)
    const c = runPrediction(input({ quest: q }), data, { ...opts, seed: 8 })
    // Смена seed меняет поток случайности. Сравниваем весь набор метрик, а не только win rate:
    // на 200 прогонах win rate двух разных seed может совпасть случайно (раунды и урон — нет).
    expect(c.metrics).not.toEqual(a.metrics)
  })
})

describe('смерть героев: отметка «кто погиб» против доли смертей в симуляции', () => {
  const beowulf = (): HeroInstance => {
    const h = heroes.find((x) => x.name !== 'Антуан')
    if (!h) throw new Error('нет второго героя')
    return h
  }

  it('без deadHeroes смерти неизвестны: в Brier смертей отметка не входит', () => {
    const r = runPrediction(input(), data, { runs: 20, seed: 1 })
    expect(r.deaths).toBeNull()
    const s = calibrationSummary([r])
    expect(s.deathN).toBe(0)
    expect(s.deathBrier).toBe(0)
    expect(calibrationObjective(s)).toBe(s.brier)
  })

  it('погибшие сопоставляются по имени; Brier смертей — по каждому бойцу', () => {
    const second = beowulf()
    // Непобедимый квест с огромным уроном: в симуляции гибнут все (доля смертей 1).
    const deadly = quest({ monsterHp: 1e12, monsterDmg: 1e9, monsterAoe: 1e9 })
    const r = runPrediction(
      input({ check: check({ passed: false, teamLabel: `Антуан + ${second.name}`, deadHeroes: [' антуан '] }), quest: deadly, heroes: [antoine(), second] }),
      data,
      { runs: 20, seed: 1 },
    )
    expect(r.deaths).toEqual([
      { name: 'Антуан', predicted: 1, outcome: 1 },
      { name: second.name, predicted: 1, outcome: 0 },
    ])
    const s = calibrationSummary([r])
    expect(s.deathN).toBe(2)
    // (1−1)² + (1−0)² = 1 → 0.5 на бойца; верно 1 из 2.
    expect(s.deathBrier).toBeCloseTo(0.5, 9)
    expect(s.deathAgreement).toBe(0.5)
    expect(calibrationObjective(s)).toBeCloseTo(s.brier + 0.5, 9)
  })

  it('deathPredictions: [] — «никто не погиб», а не «неизвестно»', () => {
    const metrics = { runs: 10, winRate: 1, avgRounds: 1, avgDamagePerRound: 0, avgMinSurvivorHpPct: 1, survival: [{ name: 'A', rate: 0.7, deathRate: 0.3 }], perFighter: [] }
    expect(deathPredictions(check({ deadHeroes: [] }), metrics)).toEqual([{ name: 'A', predicted: 0.3, outcome: 0 }])
    expect(deathPredictions(check(), metrics)).toBeNull()
  })
})

describe('«что отметить»: квесты, где варианты допущений расходятся сильнее всего', () => {
  const quests = [
    quest({ id: 'Easy|boss|Easy', monsterHp: 1, monsterDmg: 0 }), // все варианты: 100 %
    quest({ id: 'Edge|boss|Extreme', monsterHp: 30000, monsterDmg: 90 }),
    quest({ id: 'Wall|boss|Extreme', monsterHp: 1e12, monsterDmg: 0 }), // все варианты: 0 %
    quest({ id: 'Hard|boss|Extreme', monsterHp: 60000, monsterDmg: 150 }),
  ]
  const variants = [
    { id: 'enemy-crit-0.25', label: 'крит врага 25 %', assumption: 'A30', combat: { enemyCritChance: 0.25 } },
    { id: 'aoe-0', label: 'AoE выключено', assumption: 'A31', combat: { aoeChance: 0 } },
    { id: 'hp-growth-0', label: 'рост базы HP выключен', assumption: 'A8', stat: { hpGrowthMult: 0 } },
  ]

  it('квесты, где все варианты сходятся, в список не попадают; порядок — по разбросу', () => {
    let progress = 0
    const top = questsToCheck({ data, quests, heroes: [antoine()], variants, runs: 200, seed: 3, minSpread: 0, onProgress: (d) => (progress = d) })
    expect(progress).toBe(quests.length)
    const ids = top.map((t) => t.quest.id)
    expect(ids).not.toContain('Easy|boss|Easy')
    expect(ids).not.toContain('Wall|boss|Extreme')
    expect(top.length).toBeGreaterThan(0)
    for (let i = 1; i < top.length; i++) expect(top[i - 1].spread).toBeGreaterThanOrEqual(top[i].spread)
    for (const t of top) {
      expect(t.byVariant.map((b) => b.id)).toEqual(variants.map((v) => v.id))
      const all = [t.baseWinRate, ...t.byVariant.map((b) => b.winRate)]
      expect(t.spread).toBeCloseTo(Math.max(...all) - Math.min(...all), 9)
      // Подпись — вариант, дальше всех ушедший от базовой модели.
      const far = Math.max(...t.byVariant.map((b) => Math.abs(b.winRate - t.baseWinRate)))
      expect(Math.abs(t.variantWinRate - t.baseWinRate)).toBeCloseTo(far, 9)
      expect(variants.map((v) => v.id)).toContain(t.variant.id)
    }
  })

  it('общий seed: вариант, совпадающий с базовой моделью, даёт ровно её win rate (шум не создаёт разброса)', () => {
    const same = [{ id: 'same', label: 'то же, что база', assumption: '—', combat: {} }]
    expect(questsToCheck({ data, quests, heroes: [antoine()], variants: same, runs: 100, seed: 9 })).toEqual([])
  })

  it('квесты с разбросом ниже minSpread отбрасываются: бинарная отметка их не различит', () => {
    const all = questsToCheck({ data, quests, heroes: [antoine()], variants, runs: 200, seed: 3, minSpread: 0 })
    const strict = questsToCheck({ data, quests, heroes: [antoine()], variants, runs: 200, seed: 3, minSpread: 0.2 })
    expect(strict.every((t) => t.spread >= 0.2)).toBe(true)
    expect(strict.length).toBeLessThanOrEqual(all.length)
    expect(questsToCheck({ data, quests, heroes: [antoine()], variants, runs: 200, seed: 3, minSpread: 1.01 })).toEqual([])
  })

  it('по умолчанию берёт все варианты MODEL_VARIANTS, кроме базового, и не больше top квестов', () => {
    const top = questsToCheck({ data, quests: quests.slice(1, 2), heroes: [antoine()], runs: 20, seed: 1, top: 1 })
    expect(top.length).toBeLessThanOrEqual(1)
    if (top[0]) expect(top[0].byVariant).toHaveLength(MODEL_VARIANTS.length - 1)
  })

  it('вариант turn-order-shuffle есть в MODEL_VARIANTS и описан значениями (A73)', () => {
    const variant = MODEL_VARIANTS.find((v) => v.id === 'turn-order-shuffle')
    expect(variant).toMatchObject({ assumption: 'A73', combat: { turnOrder: 'shuffle' } })
    expect(describeVariant(variant!)).toBe('turnOrder: fixed → shuffle')
    // Базовая модель — фиксированный порядок Compendium: вариант не подменяет её молча.
    expect(MODEL_VARIANTS.find((v) => v.id === 'base')?.combat).toBeUndefined()
  })
})

describe('разрезы ошибок', () => {
  const records = [
    runPrediction(input({ check: check({ id: 'a', passed: true, simWinRate: 0.8 }), quest: quest({ monsterHp: 1e12, monsterDmg: 0 }) }), data, { runs: 20, seed: 1 }),
    runPrediction(input({ check: check({ id: 'b', passed: false, simWinRate: 0.2 }), quest: quest({ monsterHp: 1, monsterDmg: 0 }) }), data, { runs: 20, seed: 2 }),
    runPrediction(
      input({
        check: check({ id: 'c', passed: true, simWinRate: 0.7 }),
        quest: quest({ id: 'Other|normal|Hard', area: 'Other', variant: 'normal', difficulty: 'Hard', monsterHp: 1, monsterDmg: 0 }),
      }),
      data,
      { runs: 20, seed: 3 },
    ),
  ]

  it('группировка по сложности, типу и герою — с числом промахов в каждую сторону', () => {
    const byDifficulty = groupStats(records, 'difficulty')
    const extreme = byDifficulty.find((g) => g.key === 'Extreme')
    expect(extreme).toMatchObject({ n: 2, matched: 0, over: 1, under: 1 })
    expect(byDifficulty.find((g) => g.key === 'Hard')).toMatchObject({ n: 1, matched: 1, over: 0, under: 0 })
    expect(groupStats(records, 'variant')).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'босс', n: 2 }), expect.objectContaining({ key: 'обычный', n: 1 })]),
    )
    expect(groupStats(records, 'hero')).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'Антуан', n: 3 })]))
  })

  it('worstGroups отдаёт группы с наибольшей долей ошибок и учитывает minN', () => {
    const worst = worstGroups(records, 'difficulty', 2)
    expect(worst.map((g) => g.key)).toEqual(['Extreme'])
    expect(worst[0].errRate).toBe(1)
    expect(worstGroups(records, 'difficulty', 3)).toHaveLength(0)
  })
})

describe('сверка статов по fixtures/heroes.txt', () => {
  it('модель без эталона держит ATK/DEF в 2,5 %, HP в 10 % (A8)', () => {
    const rms = fixtureStatRms(fixture)
    expect(rms.atk).toBeLessThan(0.025)
    expect(rms.def).toBeLessThan(0.025)
    expect(rms.hp).toBeLessThan(0.1)
  })

  it('эталон экспорта воспроизводится точно, если брать базу из reference (A8)', () => {
    for (const h of heroes) {
      const r = runPrediction({ check: check(), quest: quest({ monsterHp: 1, monsterDmg: 0 }), heroes: [h], champion: null }, data, { runs: 1, seed: 1 })
      expect(r.fighters[0].atk).toBe(h.reference!.stats.atk)
      expect(r.fighters[0].def).toBe(h.reference!.stats.def)
      expect(r.fighters[0].hp).toBe(h.reference!.stats.hp)
    }
  })
})

describe('чувствительность к допущениям', () => {
  const records = [
    input({ check: check({ id: 'a', passed: true, simWinRate: 0.9 }), quest: quest({ monsterHp: 30000, monsterDmg: 90, barrier: { elements: ['Light'], hp: 200 } }) }),
    input({ check: check({ id: 'b', passed: false, simWinRate: 0.3 }), quest: quest({ monsterHp: 60000, monsterDmg: 150 }) }),
  ]

  it('каждый вариант переопределяет параметр и учитывает ошибку сверки статов', () => {
    const rows = sensitivityAnalysis({
      records,
      data,
      fixture,
      runs: 200,
      seed: 42,
      variants: [
        { id: 'base', label: 'базовая модель', assumption: '—' },
        { id: 'hp-growth-0', label: 'рост базы HP выключен', assumption: 'A8', stat: { hpGrowthMult: 0 } },
        {
          id: 'quality-mult-high',
          label: 'множители качества ×1.1',
          assumption: 'A7',
          stat: { quality: { Normal: 1, Superior: 1.375, Flawless: 1.65, Epic: 2.2, Legendary: 3.3 } },
        },
      ],
    })
    expect(rows).toHaveLength(3)
    const base = rows[0]
    expect(base.brierDelta).toBe(0)
    expect(base.agreementDeltaPp).toBe(0)
    const hp = rows[1]
    expect(hp.fixtureRms.hp).not.toBeCloseTo(base.fixtureRms.hp, 4)
    expect(hp.fixtureRms.atk).toBeCloseTo(base.fixtureRms.atk, 6)
    const quality = rows[2]
    expect(quality.fixtureRms.atk).toBeGreaterThan(base.fixtureRms.atk)
    // Ранжирование: все небазовые варианты в списке, порядок — по величине влияния на ошибку.
    const ranked = rankInfluence(rows)
    expect(ranked.map((r) => r.id).sort()).toEqual(['hp-growth-0', 'quality-mult-high'])
    for (let i = 1; i < ranked.length; i++) {
      const influence = (r: (typeof ranked)[number]): number => Math.abs(r.brierDelta) + Math.abs(r.agreementDeltaPp) / 100
      expect(influence(ranked[i - 1])).toBeGreaterThanOrEqual(influence(ranked[i]))
    }
  })

  it('явно влияющий параметр меняет предсказание сильнее, чем безобидный', () => {
    const rows = sensitivityAnalysis({
      records: [input({ check: check({ passed: true }), quest: quest({ monsterHp: 30000, monsterDmg: 90 }) })],
      data,
      runs: 400,
      seed: 5,
      variants: [
        { id: 'base', label: 'база', assumption: '—' },
        { id: 'enemy-crit-0', label: 'крит врага 0 %', assumption: 'A30', combat: { enemyCritChance: 0 } },
        { id: 'aoe-0', label: 'AoE выключено', assumption: 'A31', combat: { aoeChance: 0 } },
      ],
    })
    expect(Math.abs(rows[1].summary.meanPredicted - rows[0].summary.meanPredicted)).toBeGreaterThan(0)
  })
})

describe('подгонка параметров', () => {
  const records = [
    input({ check: check({ id: 'a', passed: true, simWinRate: 0.9 }), quest: quest({ monsterHp: 30000, monsterDmg: 90 }) }),
    input({ check: check({ id: 'b', passed: false, simWinRate: 0.3 }), quest: quest({ monsterHp: 60000, monsterDmg: 150 }) }),
  ]

  it('крутилка, которая не улучшает Brier, не принимается, а сверка статов остаётся базовой', () => {
    const knob = TUNING_KNOBS.find((k) => k.id === 'qualityScale')!
    const t = tuneParameters({
      records,
      data,
      fixture,
      runs: 100,
      seed: 11,
      knobs: [{ ...knob, min: 0.9, max: 1.1, step: 0.05 }],
      maxKnobs: 1,
    })
    // Либо шаг не принят (improved false), либо принят с непустым списком — третьего быть не может.
    expect(t.improved).toBe(t.knobs.length > 0)
    for (const st of MAIN_STATS) expect(t.fixtureRmsAfter[st]).toBeLessThanOrEqual(t.fixtureRmsBefore[st] + FIXTURE_RMS_GUARD)
    if (t.knobs.length > 0) expect(t.after.brier).toBeLessThanOrEqual(t.before.brier)
    expect(t.values.qualityScale).toBeGreaterThanOrEqual(0.9)
    expect(t.values.qualityScale).toBeLessThanOrEqual(1.1)
  })

  it('подгонка ограничена числом крутилок maxKnobs', () => {
    const t = tuneParameters({ records, data, fixture, runs: 50, seed: 3, maxKnobs: 2 })
    expect(t.knobs.length).toBeLessThanOrEqual(2)
    expect(Object.keys(t.values)).toEqual(TUNING_KNOBS.map((k) => k.id))
  })

  it('Brier score и сверка считаются и на базовой модели (нулевой выигрыш не ломает отчёт)', () => {
    const t = tuneParameters({ records, data, fixture, runs: 50, seed: 4, maxKnobs: 0 })
    expect(t.knobs).toHaveLength(0)
    expect(t.before).toEqual(t.after)
    expect(t.fixtureRmsBefore).toEqual(fixtureStatRms(fixture, DEFAULT_MODEL))
  })
})
