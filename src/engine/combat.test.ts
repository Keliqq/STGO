import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { DefCaps, Quest, Skill } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import {
  barrierBroken,
  damageFactor,
  effectiveEvasion,
  enemyCritChanceVs,
  evaCapOf,
  fighterFromChampion,
  fighterFromHero,
  isDoubledVsBoss,
  mulberry32,
  parseSpecials,
  prepare,
  resolveCombatModel,
  simulateTeam,
  turnOrderFor,
  type Fighter,
} from './combat.ts'
import { ENEMY_CRIT_CHANCE, EXTREME_EVA_PENALTY, MAX_EVASION } from './constants.ts'

const data = fixtureGameData()

/** Навык по имени из фикстуры (для механик «+N% to max Evasion» и т. п.). */
const skillByName = (name: string): Skill => {
  const s = data.skills.find((x) => x.name === name)
  if (!s) throw new Error(`навык «${name}» не найден`)
  return s
}

const CAPS: DefCaps = { p50: 1000, p70: 2000, p75: 6000 }

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'test|normal|Hard',
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

describe('множитель урона врага по DEF (A30)', () => {
  it('0 DEF → 1.5×; половина порога 50% → 1.0×; пороги 50/70/75% → 0.5/0.3/0.25', () => {
    expect(damageFactor(0, CAPS)).toBeCloseTo(1.5)
    expect(damageFactor(500, CAPS)).toBeCloseTo(1)
    expect(damageFactor(1000, CAPS)).toBeCloseTo(0.5)
    expect(damageFactor(2000, CAPS)).toBeCloseTo(0.3)
    expect(damageFactor(6000, CAPS)).toBeCloseTo(0.25)
  })

  it('между порогами линейно; выше 75% — всё равно 0.25; без порогов — 1', () => {
    expect(damageFactor(750, CAPS)).toBeCloseTo(0.75)
    expect(damageFactor(50000, CAPS)).toBeCloseTo(0.25)
    expect(damageFactor(123, null)).toBe(1)
  })

  it('танк с DEF выше порога 75% получает 0.25× урона', () => {
    // 3 раунда по 100×0.25 = 75 урона — герой с 100 HP выживает; при 0.5× (150) — нет.
    const m = simulateTeam([fighter({ def: 6000, hp: 100, atk: 0 })], quest(), { runs: 20, seed: 7, maxRounds: 3, enemyCritChance: 0, aoeChance: 0 })
    expect(m.survival[0].rate).toBe(1)
    const weak = simulateTeam([fighter({ def: 1000, hp: 100, atk: 0 })], quest(), { runs: 20, seed: 7, maxRounds: 3, enemyCritChance: 0, aoeChance: 0 })
    expect(weak.survival[0].rate).toBe(0)
  })
})

describe('барьер, уклонение, мана-щит', () => {
  it('без стихии против барьера — 20% урона; пробитый барьер — 100%', () => {
    const q = quest({ barrier: { elements: ['Fire'], hp: 50 } })
    const noEl = simulateTeam([fighter()], q, { runs: 5, seed: 1, maxRounds: 1 })
    expect(noEl.avgDamagePerRound).toBeCloseTo(20)
    const withEl = simulateTeam([fighter({ elements: { Fire: 50 } })], q, { runs: 5, seed: 1, maxRounds: 1 })
    expect(withEl.avgDamagePerRound).toBeCloseTo(100)
    expect(barrierBroken([fighter({ elements: { Fire: 49 } })], q)).toBe(false)
    expect(barrierBroken([fighter({ elements: { Fire: 50 } })], q)).toBe(true)
    // «Any» (Spellblade): 50% от суммы камней против любой стихии барьера.
    expect(barrierBroken([fighter({ elementAny: 100, barrierAnyPct: 50 })], q)).toBe(true)
  })

  it('мана-щит гасит урон ровно на свой запас', () => {
    // DEF 500 = половина порога 50% → множитель 1.0. 2 раунда × 60 = 120; щит 50 → потеря HP 70 < 100 — жив.
    // 3 раунда = 180 → потеря 130 > 100 — мёртв.
    const q = quest({ monsterDmg: 60 })
    const two = simulateTeam([fighter({ def: 500, manaShield: 50, hp: 100, atk: 0 })], q, { runs: 10, seed: 5, maxRounds: 2, enemyCritChance: 0, aoeChance: 0 })
    expect(two.survival[0].rate).toBe(1)
    const three = simulateTeam([fighter({ def: 500, manaShield: 50, hp: 100, atk: 0 })], q, { runs: 10, seed: 5, maxRounds: 3, enemyCritChance: 0, aoeChance: 0 })
    expect(three.survival[0].rate).toBe(0)
  })
})

describe('предел уклонения и штраф Extreme (A34, A42, A59)', () => {
  it('предел 75% у любого героя и 78% у носителя «+N% to max Evasion»', () => {
    const plain = prepare([fighter()], quest(), { runs: 1 })
    const pathfinder = prepare([fighter({ skills: [skillByName('Insubstantial')] })], quest(), { runs: 1 })
    expect(plain.evaCaps[0]).toBe(MAX_EVASION)
    expect(pathfinder.evaCaps[0]).toBeCloseTo(0.78, 6)
    expect(effectiveEvasion(0.9, evaCapOf(parseSpecials([])), false)).toBeCloseTo(0.75)
  })

  it('штраф Extreme вычитает 20 п.п. из суммы ДО предела', () => {
    expect(effectiveEvasion(0.8, MAX_EVASION, false)).toBeCloseTo(0.75)
    expect(effectiveEvasion(0.8, MAX_EVASION, true)).toBeCloseTo(0.6)
    // 95% на Extreme — ровно предел: «чтобы нивелировать штраф, нужно 95% уворота».
    expect(effectiveEvasion(0.95, MAX_EVASION, true)).toBeCloseTo(0.75)
    // У Pathfinder на Extreme полезно до 98% (предел 78% + 20 п.п.).
    expect(effectiveEvasion(0.98, 0.78, true)).toBeCloseTo(0.78)
    expect(effectiveEvasion(0.9, 0.78, true)).toBeCloseTo(0.7)
    // Совсем без уворота штраф уводит значение в минус.
    expect(effectiveEvasion(0, MAX_EVASION, true)).toBeCloseTo(-EXTREME_EVA_PENALTY)
  })

  it('95% на Extreme = 75% эффективных: бой совпадает с 75% на обычной сложности', () => {
    const opts = { runs: 300, seed: 5, maxRounds: 10, enemyCritChance: 0, aoeChance: 0 } as const
    const extreme = simulateTeam([fighter({ eva: 0.95, hp: 100, atk: 0 })], quest({ difficulty: 'Extreme' }), opts)
    const plain = simulateTeam([fighter({ eva: 0.75, hp: 100, atk: 0 })], quest(), opts)
    expect(extreme).toEqual(plain)
    // 0.75 эффективного уворота — не 1.0: часть ударов всё же проходит.
    expect(extreme.survival[0].rate).toBeLessThan(1)
  })

  it('излишек уворота выше предела не даёт ничего: 95% и 75% на обычном квесте — один и тот же бой', () => {
    const opts = { runs: 300, seed: 9, maxRounds: 10, enemyCritChance: 0, aoeChance: 0 } as const
    const surplus = simulateTeam([fighter({ eva: 0.95, hp: 100, atk: 0 })], quest(), opts)
    const atCap = simulateTeam([fighter({ eva: 0.75, hp: 100, atk: 0 })], quest(), opts)
    expect(surplus).toEqual(atCap)
  })

  it('нулевой EVA на Extreme: шанс крита врага 15% (10% базовых + 5%)', () => {
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, effectiveEvasion(0, MAX_EVASION, true))).toBeCloseTo(0.15, 10)
    // 20 п.п. уворота полностью нивелируют штраф: крит снова базовый.
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, effectiveEvasion(0.2, MAX_EVASION, true))).toBeCloseTo(0.1, 10)
    // Положительное уклонение надбавки не даёт.
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, 0.5)).toBeCloseTo(0.1, 10)
  })

  it('герой без уворота на Extreme получает криты чаще и гибнет раньше', () => {
    // 10 раундов по 100 урона: без критов герой с 1050 HP выживает, любой крит (+50) его добивает.
    // Надбавка +5 п.п. крита (A59) снижает шанс выжить ровно на разницу 0.9^10 → 0.85^10.
    const opts = { runs: 2000, seed: 11, maxRounds: 10, aoeChance: 0 } as const
    const q = quest({ difficulty: 'Extreme', defCaps: null, monsterHp: 100000, monsterDmg: 100 })
    const noEva = simulateTeam([fighter({ eva: 0, hp: 1050, atk: 0 })], q, opts)
    const negated = simulateTeam([fighter({ eva: 0.2, hp: 1050, atk: 0 })], q, opts)
    expect(negated.survival[0].rate - noEva.survival[0].rate).toBeGreaterThan(0.1)
  })

  it('режим крита по отрицательному EVA (A57): additive по умолчанию, absolute — надбавка вместо базового', () => {
    const negEva = effectiveEvasion(0, MAX_EVASION, true) // −20 п.п.
    // По умолчанию — additive: 10% базовых + 5% надбавки.
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, negEva)).toBeCloseTo(0.15, 10)
    // absolute — надбавка задаёт шанс сама (буквальное чтение гайда: «герои с нулевым уворотом — 5%»).
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, negEva, 'absolute')).toBeCloseTo(0.05, 10)
    // Положительное уклонение режим не меняет.
    expect(enemyCritChanceVs(ENEMY_CRIT_CHANCE, 0.5, 'absolute')).toBeCloseTo(0.1, 10)
    // Параметр доходит до модели: по умолчанию additive, переопределяется.
    expect(resolveCombatModel().negativeEvaCrit).toBe('additive')
    expect(resolveCombatModel({ negativeEvaCrit: 'absolute' }).negativeEvaCrit).toBe('absolute')
  })

  it('absolute-режим делает бой без уворота на Extreme мягче, чем additive', () => {
    const opts = { runs: 2000, seed: 13, maxRounds: 10, aoeChance: 0 } as const
    const q = quest({ difficulty: 'Extreme', defCaps: null, monsterHp: 100000, monsterDmg: 100 })
    const f = [fighter({ eva: 0, hp: 1050, atk: 0 })]
    const additive = simulateTeam(f, q, opts)
    const absolute = simulateTeam(f, q, { ...opts, model: { negativeEvaCrit: 'absolute' } })
    // Крит 5% вместо 15% → герой выживает чаще.
    expect(absolute.survival[0].rate).toBeGreaterThan(additive.survival[0].rate)
  })
})

describe('ход боя', () => {
  it('цель выбирается по угрозе: танк с угрозой 1000 получает удары, а не «статичный» герой', () => {
    const tank = fighter({ name: 'tank', threat: 1000, hp: 50 })
    const soft = fighter({ name: 'soft', threat: 1, hp: 100000, atk: 0 })
    const m = simulateTeam([soft, tank], quest({ monsterDmg: 100 }), { runs: 50, seed: 11, maxRounds: 5, enemyCritChance: 0, aoeChance: 0 })
    expect(m.survival[1].rate).toBe(0) // танк умирает от 100-го урона
    expect(m.survival[0].rate).toBe(1)
    // Доля боёв, где боец погиб: танк — во всех, «статичный» — ни в одном.
    expect(m.survival.map((s) => s.deathRate)).toEqual([0, 1])
  })

  it('deathRate = доля прогонов, где боец мёртв в конце боя (дополняет rate до 1)', () => {
    const a = fighter({ name: 'a', threat: 10, hp: 900, def: 500 })
    const b = fighter({ name: 'b', threat: 10, hp: 400, def: 500 })
    const m = simulateTeam([a, b], quest({ monsterDmg: 100, monsterHp: 1e9 }), { runs: 200, seed: 5, maxRounds: 12 })
    for (const s of m.survival) {
      expect(s.deathRate).toBeGreaterThanOrEqual(0)
      expect(s.deathRate + s.rate).toBeCloseTo(1, 10)
    }
    // Слабый по HP погибает чаще.
    expect(m.survival[1].deathRate).toBeGreaterThan(m.survival[0].deathRate)
  })

  it('враг бьёт первым: герой, убивающий монстра с одного удара, всё равно получает урон', () => {
    // DEF 500 → входящий урон 100. hp 150 переживает первый удар и убивает монстра на 1-м раунде; hp 30 — нет.
    const m = simulateTeam([fighter({ def: 500, atk: 100000, hp: 150 })], quest({ monsterDmg: 100, monsterHp: 1000 }), { runs: 10, seed: 2, maxRounds: 5, enemyCritChance: 0, aoeChance: 0 })
    expect(m.winRate).toBe(1)
    expect(m.avgRounds).toBe(1)
    const dies = simulateTeam([fighter({ def: 500, atk: 100000, hp: 30 })], quest({ monsterDmg: 100, monsterHp: 1000 }), { runs: 10, seed: 2, maxRounds: 5, enemyCritChance: 0, aoeChance: 0 })
    expect(dies.winRate).toBe(0)
  })

  it('порядок ходов: 3 слота — средний→левый→правый; 4 — ср-левый→крайний левый→крайний правый→ср-правый', () => {
    expect(turnOrderFor(3)).toEqual([1, 0, 2])
    expect(turnOrderFor(4)).toEqual([1, 0, 3, 2])
    expect(turnOrderFor(5)).toEqual([2, 1, 3, 0, 4])
  })
})

describe('детерминизм', () => {
  it('одинаковый seed → одинаковый результат', () => {
    const team = [fighter({ atk: 300, crit: 0.3 }), fighter({ def: 3000, hp: 2000 }), fighter({ eva: 0.4 })]
    const q = quest({ monsterHp: 30000, monsterDmg: 250, monsterAoe: 120 })
    const a = simulateTeam(team, q, { runs: 200, seed: 42 })
    const b = simulateTeam(team, q, { runs: 200, seed: 42 })
    expect(a).toEqual(b)
    const c = simulateTeam(team, q, { runs: 200, seed: 43 })
    expect(c.avgRounds).not.toBe(a.avgRounds)
  })

  it('mulberry32 детерминирован и даёт [0, 1)', () => {
    const r = mulberry32(1)
    const xs = Array.from({ length: 1000 }, () => r())
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mulberry32(1)()).toBe(mulberry32(1)())
  })
})

describe('особые механики навыков (обязательный минимум классов и чемпионов)', () => {
  const byName = (name: string): Skill => {
    const s = data.skills.find((x) => x.name === name)
    if (!s) throw new Error(`навык «${name}» не найден`)
    return s
  }
  const sp = (...names: string[]) => parseSpecials(names.map(byName))

  it('Chieftain: угроза → множитель ATK', () => expect(sp("Chieftain's Authority").threatAtkPct).toBe(40))
  it('Lord: защита союзника от смертельного удара', () => expect(sp('Lifesaver').lethalProtect).toBe(true))
  it('Monk: крит-урон — стат (в карточке), спец-механик нет', () => expect(sp('Pressure Points')).toMatchObject({ threatAtkPct: 0, riposte: false }))
  it('Musketeer: крит-шанс — стат; Conquistador: серия критов +25%, 4 стака', () => {
    expect(sp('Critical Combo')).toMatchObject({ consecCritPct: 25, consecCritMax: 4 })
  })
  it('Sorcerer/Geomancer/Druid/Thief/Wanderer: усиления предметов/статов — в карточке, спец-механик нет', () => {
    for (const n of ['Blood Pact', 'Geomancy', 'Primal Magic', 'Scoundrel', 'Evasive']) {
      expect(sp(n), n).toMatchObject({ threatAtkPct: 0, riposte: false, lethalProtect: false, consecCritMax: 0 })
    }
  })
  it('Dancer/Acrobat: гарантированный крит после уклонения', () => expect(sp('Stinging Riposte').riposte).toBe(true))
  it('Cleric: выжить смертельный удар + лечение за раунд', () => expect(sp('Crusader')).toMatchObject({ survivePct: 100, healSelf: 10 }))
  it('чемпионы: Lilu лечит группу, Rudo — бонус к барьеру, Ashley — удвоение против боссов, Spellblade — Any 50%', () => {
    expect(sp('Sacred Circle').healParty).toBe(20)
    expect(sp('Total Mayhem').elemBarrierBonusPct).toBe(50)
    expect(isDoubledVsBoss(byName('Bushido Force'))).toBe(true)
    expect(sp('Master of All Trades').anyElementPct).toBe(50)
    expect(sp('Aura of Resolve')).toMatchObject({ healParty: 0 })
    expect(sp('Eye for Style')).toMatchObject({ healParty: 0 })
    expect(sp('Philosopher\'s Stone')).toMatchObject({ healParty: 0 })
    expect(sp('Perfect Ambush')).toMatchObject({ healParty: 0 })
    expect(sp('Captain\'s Share')).toMatchObject({ healParty: 0 })
  })

  it('Cleric выживает смертельный удар один раз за бой', () => {
    const q = quest({ monsterDmg: 100 })
    const plain = simulateTeam([fighter({ hp: 10, atk: 0 })], q, { runs: 10, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 })
    expect(plain.survival[0].rate).toBe(0)
    const cleric = fighter({ hp: 10, atk: 0, skills: [byName('Crusader')] })
    const once = simulateTeam([cleric], q, { runs: 10, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 })
    expect(once.survival[0].rate).toBe(1)
    const twice = simulateTeam([cleric], q, { runs: 10, seed: 1, maxRounds: 2, enemyCritChance: 0, aoeChance: 0 })
    expect(twice.survival[0].rate).toBe(0) // второй смертельный удар уже убивает
  })
})

describe('бойцы из данных', () => {
  const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
  const { heroes } = importTitansDb(text, data)

  it('fighterFromHero: статы, стихия для барьера (с духами A29) и навыки', () => {
    const jordi = heroes.find((h) => h.name === 'Джорди')
    if (!jordi) throw new Error('нет Джорди')
    const f = fighterFromHero(jordi, data)
    expect(f.elements).toEqual({ Air: 180 })
    expect(f.skills.length).toBeGreaterThan(0)
    expect(f.threat).toBeGreaterThan(0)
  })

  it('fighterFromChampion: Argon ранг 5 — стихия Light 15, лидерский навык по рангу', () => {
    const argon = data.champions.find((c) => c.name === 'Argon')
    if (!argon) throw new Error('нет Argon')
    const f = fighterFromChampion(argon, 5, data)
    expect(f.elements).toEqual({ Light: 15 })
    expect(f.skills[0]?.name).toBe('Aura of Resolve')
    expect(f.isChampion).toBe(true)
    // награды рангов 1..5 накопительно (A14)
    const sum = argon.ranks.filter((r) => r.rank <= 5 && r.reward).reduce((a, r) => a + r.reward!.hp, 0)
    expect(f.hp).toBe(argon.base.hp + sum)
  })
})
