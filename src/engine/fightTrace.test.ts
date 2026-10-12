/**
 * «Пример боя» (trace) и «Сводка по бойцам» (SimMetrics.perFighter).
 *
 * Проверяем то, на чём держится UI и что легко сломать при правках боя:
 *   · детерминизм — тот же seed даёт тот же лог (и тот же итог);
 *   · сходимость — сумма событий лога совпадает с метриками того же прогона;
 *   · perFighter — урон за удар, криты, уклонения, перезарядки щита, выживаемость, раунд гибели,
 *     доля времени с «until damaged» (Ninja/Sensei, A54).
 */
import { describe, expect, it } from 'vitest'
import type { DefCaps, Quest, Skill } from '../data/types.ts'
import { MAX_EVASION, MANA_SHIELD_RECHARGE_ROUNDS } from './constants.ts'
import { simulateTeam, traceFight, type Fighter, type TraceEvent } from './combat.ts'

const CAPS: DefCaps = { p50: 1000, p70: 2000, p75: 6000 }

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'trace|normal|Hard',
  area: 'Test',
  variant: 'normal',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 100000,
  monsterDmg: 100,
  monsterAoe: 50,
  barrier: null,
  defCaps: CAPS,
  miniBosses: [],
  ...over,
})

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'F',
  atk: 100,
  def: 0,
  hp: 1000,
  manaShield: 0,
  crit: 0,
  critDmg: 2,
  eva: 0,
  threat: 100,
  elements: {},
  elementAny: 0,
  barrierAnyPct: 0,
  skills: [],
  ...over,
})

/** Навык-заглушка: движку важны только `text` (parseSpecials) и `effects` (prepare). */
function skill(over: Pick<Skill, 'id' | 'name' | 'text'> & Partial<Skill>): Skill {
  return {
    type: 'Other',
    tier: 1,
    rarity: null,
    upgradeCost: null,
    effects: [],
    ignored: [],
    unparsed: [],
    classesRaw: [],
    classes: [],
    champions: [],
    requiresPromotion: false,
    line: '',
    ...over,
  }
}

/** Навык «+N% stat until damaged» (это то, что видит parseSpecials). */
const untilDamagedSkill = (stat: 'eva' | 'crit', value: number): Skill =>
  skill({
    id: `test-until-${stat}`,
    name: `Test Until Damaged ${stat}`,
    text: `+${value}% ${stat} until damaged`,
    effects: [{ stat, mode: 'pct', value, scope: 'self', condition: { kind: 'untilDamaged' } }],
  })

/** Навык «Heals party by N HP each turn»: эффектов нет — лечение берётся из текста (parseSpecials). */
const healSkill = (hp: number): Skill =>
  skill({ id: `test-heal-${hp}`, name: `Test Heal ${hp}`, text: `Heals party by ${hp} HP each turn` })

const kinds = (events: TraceEvent[], kind: TraceEvent['kind']): TraceEvent[] => events.filter((e) => e.kind === kind)
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

describe('traceFight: детерминизм по seed', () => {
  it('тот же seed → те же события и тот же итог', () => {
    const team = () => [
      fighter({ name: 'A', atk: 900, crit: 0.35, eva: 0.3, hp: 4000 }),
      fighter({ name: 'B', atk: 700, def: 1500, threat: 300, manaShield: 500, hp: 3000 }),
    ]
    const q = quest({ monsterHp: 40000, monsterDmg: 400 })
    const a = traceFight(team(), q, { seed: 42, runs: 1 })
    const b = traceFight(team(), q, { seed: 42, runs: 1 })
    expect(a.trace.events).toEqual(b.trace.events)
    expect(a.trace.rounds).toBe(b.trace.rounds)
    expect(a.trace.win).toBe(b.trace.win)
    expect(a.trace.damageDealt).toBe(b.trace.damageDealt)
    expect(a.trace.alive).toEqual(b.trace.alive)
  })

  it('другой seed → другой лог (криты и уклонения решает PRNG)', () => {
    const team = () => [fighter({ name: 'A', atk: 900, crit: 0.35, eva: 0.3, hp: 4000 })]
    const q = quest({ monsterHp: 40000, monsterDmg: 400 })
    const a = traceFight(team(), q, { seed: 1, runs: 1 })
    const b = traceFight(team(), q, { seed: 2, runs: 1 })
    expect(a.trace.events).not.toEqual(b.trace.events)
  })

  it('seed лога = seed первого прогона: при runs > 1 метрики усредняются, а лог — один бой', () => {
    const team = [fighter({ name: 'A', atk: 900, crit: 0.3 })]
    const q = quest({ monsterHp: 40000 })
    const one = traceFight(team, q, { seed: 5, runs: 1 })
    const many = traceFight(team, q, { seed: 5, runs: 300 })
    expect(many.metrics.runs).toBe(300)
    expect(many.trace.events).toEqual(one.trace.events)
    expect(many.trace.seed).toBe(5)
    // Отдельный simulateTeam с тем же seed и runs даёт ровно те же метрики (общий PRNG).
    expect(many.metrics).toEqual(simulateTeam(team, q, { seed: 5, runs: 300 }))
  })
})

describe('traceFight: события сходятся с метриками', () => {
  const q = quest({ monsterHp: 30000, monsterDmg: 500, monsterAoe: 250, barrier: { elements: ['Fire'], hp: 50 } })
  const team = () => [
    fighter({ name: 'A', atk: 1200, crit: 0.4, eva: 0.25, hp: 3000, manaShield: 400, elements: { Fire: 0 } }),
    fighter({ name: 'B', atk: 800, def: 900, threat: 250, hp: 2500 }),
  ]

  it('суммарный урон событий = урон прогона = урон метрик', () => {
    const { trace, metrics } = traceFight(team(), q, { seed: 11, runs: 1 })
    const logged = sum(kinds(trace.events, 'heroHit').map((e) => e.damage ?? 0))
    // В событиях урон округлён до целого — сверяем с допуском в половину единицы на удар.
    const hits = kinds(trace.events, 'heroHit').length
    expect(Math.abs(logged - trace.damageDealt)).toBeLessThanOrEqual(hits * 0.5 + 1e-6)
    // У одного прогона средний урон за раунд × раундов = урон боя.
    expect(metrics.avgRounds).toBe(trace.rounds)
    expect(metrics.avgDamagePerRound * metrics.avgRounds).toBeCloseTo(trace.damageDealt, 6)
  })

  it('итоговое событие и смерть сходятся с survival', () => {
    const { trace, metrics } = traceFight(team(), q, { seed: 3, runs: 1 })
    const result = kinds(trace.events, 'result')
    expect(result).toHaveLength(1)
    expect(result[0].round).toBe(trace.rounds)
    expect(result[0].damage).toBe(Math.round(trace.damageDealt))
    expect(result[0].text).toContain(trace.win ? 'Победа' : 'Поражение')
    // Каждой погибшей в метриках бойцу соответствует ровно одно событие `death`.
    const dead = metrics.survival.filter((s) => s.deathRate === 1).length
    expect(kinds(trace.events, 'death').length).toBe(dead)
    expect(trace.alive.filter((a) => !a).length).toBe(dead)
  })

  it('барьер, поглощение щита и перезарядка попадают в лог и в perFighter', () => {
    // 1 HP у бойца хватит, чтобы щит не успел перезарядиться; для перезарядки берём отдельный бой
    // с уклонением: без урона MANA_SHIELD_RECHARGE_ROUNDS раундов щит восстанавливается.
    const { trace, metrics } = traceFight(team(), q, { seed: 8, runs: 1 })
    expect(kinds(trace.events, 'barrier')).toHaveLength(1)
    expect(trace.events[0].kind).toBe('barrier')
    expect(trace.barrierBroken).toBe(false) // стихии 0 против барьера 50
    expect(metrics.perFighter[0].shieldRecharges).toBe(kinds(trace.events, 'manaRecharge').length)

    const dodger = [fighter({ name: 'D', atk: 1, eva: MAX_EVASION, hp: 10_000, manaShield: 300, threat: 100 })]
    const long = traceFight(dodger, quest({ monsterHp: 1e9, monsterDmg: 100, aoeChance: 0, enemyCritChance: 0 }), { seed: 4, runs: 1, maxRounds: 12 })
    expect(long.metrics.perFighter[0].shieldRecharges).toBeGreaterThan(0)
    expect(kinds(long.trace.events, 'manaAbsorb').length).toBeGreaterThan(0)
    expect(kinds(long.trace.events, 'dodge').length).toBeGreaterThan(0)
  })

  it('лечение отряда отражается в логе и в HP', () => {
    const healer = fighter({ name: 'H', atk: 1, def: 0, hp: 500, skills: [healSkill(70)] })
    const q2 = quest({ monsterHp: 1e9, monsterDmg: 90, aoeChance: 0, enemyCritChance: 0 })
    const { trace } = traceFight([healer], q2, { seed: 9, runs: 1, maxRounds: 5 })
    const heals = kinds(trace.events, 'heal')
    expect(heals.length).toBeGreaterThan(0)
    expect(heals[0].text).toContain('восстанавливает')
  })
})

/** Навык «Heals party by N HP each turn» — используется в тесте лечения (см. `healSkill`). */

describe('SimMetrics.perFighter', () => {
  it('урон за удар и доля критов считаются по ударам бойца', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 0, aoeChance: 0, enemyCritChance: 0, defCaps: null })
    const plain = simulateTeam([fighter({ name: 'P', atk: 250, crit: 0 })], q, { runs: 40, seed: 1, maxRounds: 3 })
    expect(plain.perFighter[0].hitsPerFight).toBeCloseTo(3, 6)
    expect(plain.perFighter[0].damagePerHit).toBeCloseTo(250, 6)
    expect(plain.perFighter[0].critRate).toBe(0)

    const critter = simulateTeam([fighter({ name: 'C', atk: 250, crit: 1, critDmg: 3 })], q, { runs: 40, seed: 1, maxRounds: 3 })
    expect(critter.perFighter[0].critRate).toBe(1)
    expect(critter.perFighter[0].damagePerHit).toBeCloseTo(750, 6)
  })

  it('доля уклонений — от атак, нацеленных на бойца; AoE тоже считается', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 10, monsterAoe: 5, aoeChance: 0, enemyCritChance: 0 })
    const m = simulateTeam([fighter({ name: 'D', atk: 1, eva: 0.5, hp: 1e6 })], q, { runs: 400, seed: 2, maxRounds: 6 })
    expect(m.perFighter[0].dodgeRate).toBeGreaterThan(0.4)
    expect(m.perFighter[0].dodgeRate).toBeLessThan(0.6)
    // AoE (шанс 1) бьёт всех: уклонения всё равно считаются по попыткам попасть.
    const aoe = simulateTeam([fighter({ name: 'D', atk: 1, eva: 0.5, hp: 1e6 }), fighter({ name: 'E', atk: 1, eva: 0, hp: 1e6 })], q, { runs: 200, seed: 2, maxRounds: 6, aoeChance: 1 })
    expect(aoe.perFighter[0].dodgeRate).toBeGreaterThan(0.4)
    expect(aoe.perFighter[1].dodgeRate).toBe(0)
  })

  it('выживаемость и средний раунд гибели', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 1000, aoeChance: 0, enemyCritChance: 0 })
    // 1 HP — гибель в первом раунде; танк с DEF выше cap гибнет позже.
    const m = simulateTeam([fighter({ name: 'Squishy', atk: 1, hp: 1 }), fighter({ name: 'Tank', atk: 1, hp: 700, def: 6000, threat: 1 })], q, { runs: 5, seed: 3, maxRounds: 5 })
    expect(m.perFighter[0].survivalRate).toBe(0)
    expect(m.perFighter[0].avgDeathRound).toBe(1)
    expect(m.perFighter[0].avgDeathRound).toBe(1)
    expect(m.survival[0].deathRate).toBe(1)
    expect(m.perFighter[1].avgDeathRound).toBeGreaterThan(0)
  })

  it('доля времени с бонусом «until damaged»: у Ninja/Sensei считается, у остальных — 0', () => {
    const skill2 = untilDamagedSkill('crit', 20)
    // Боец с угрозой 0 не получает ударов, пока в отряде есть цель с угрозой (AoE выключено),
    // поэтому бонус активен всю дорогу.
    const q = quest({ monsterHp: 1e9, monsterDmg: 100, aoeChance: 0, enemyCritChance: 0 })
    const m = simulateTeam(
      [
        fighter({ name: 'Ninja', atk: 1, threat: 0, innateSkillId: skill2.id, innateBonus: { eva: 0, crit: 0.2 }, skills: [skill2] }),
        fighter({ name: 'Plain', atk: 1, threat: 500, hp: 1e6 }),
      ],
      q,
      { runs: 50, seed: 6, maxRounds: 4 },
    )
    expect(m.perFighter[0].untilDamagedShare).toBe(1)
    expect(m.perFighter[1].untilDamagedShare).toBe(0)
  })

  it('«until damaged» теряется от первого урона и возвращается после N раундов (Sensei, A49)', () => {
    const skill: Skill = {
      ...untilDamagedSkill('eva', 20),
      id: 'test-sensei',
      text: '+20% Evasion until damaged. Regain bonuses after 2 rounds.',
    }
    const q = quest({ monsterHp: 1e9, monsterDmg: 60, aoeChance: 0, enemyCritChance: 0 })
    const m = simulateTeam([fighter({ name: 'Sensei', atk: 1, hp: 1e6, eva: 0.2, threat: 100, innateSkillId: skill.id, innateBonus: { eva: 0.2, crit: 0 }, skills: [skill] })], q, { runs: 30, seed: 7, maxRounds: MANA_SHIELD_RECHARGE_ROUNDS + 3 })
    // Первый раунд враг бьёт первым и снимает бонус, дальше он возвращается — доля между 0 и 1.
    expect(m.perFighter[0].untilDamagedShare).toBeGreaterThan(0)
    expect(m.perFighter[0].untilDamagedShare).toBeLessThan(1)
  })
})
