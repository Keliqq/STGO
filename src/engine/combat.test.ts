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
  isBossQuest,
  isDoubledInFlash,
  isDoubledVsBoss,
  mulberry32,
  parseSpecials,
  prepare,
  resolveCombatModel,
  shuffleOrder,
  simulateTeam,
  traceFight,
  turnOrderFor,
  type Fighter,
  type TraceEvent,
} from './combat.ts'
import { AOE_CHANCE, ENEMY_CRIT_CHANCE, EXTREME_EVA_PENALTY, MAX_EVASION } from './constants.ts'

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
  aoeChance: null,
  enemyCritChance: null,
  barrier: null,
  defCaps: CAPS,
  miniBosses: [],
  mods: [],
  battle: null,
  isFlash: false,
  isNullysium: false,
  isTomb: false,
  tombDepth: null,
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

describe('шансы врага из датасета stcalc (A70)', () => {
  it('по умолчанию AoE 25% (236 пар из 244) и крит врага 10%', () => {
    const p = prepare([fighter(), fighter({ name: 'B' })], quest(), {})
    expect(AOE_CHANCE).toBe(0.25)
    expect(p.aoeChance).toBe(0.25)
    expect(p.enemyCritChance).toBe(ENEMY_CRIT_CHANCE)
  })

  it('поле квеста важнее константы, явное переопределение — важнее поля', () => {
    // Особые квесты stcalc: Moonlit Grotto — 0% AoE, Runestone Quarry — 50%; Гробница Титанов — крит 15%.
    const q = quest({ aoeChance: 0, enemyCritChance: 0.15 })
    const fromQuest = prepare([fighter()], q, {})
    expect(fromQuest.aoeChance).toBe(0)
    expect(fromQuest.enemyCritChance).toBe(0.15)
    const forced = prepare([fighter()], q, { aoeChance: 0.5, enemyCritChance: 0 })
    expect(forced.aoeChance).toBe(0.5)
    expect(forced.enemyCritChance).toBe(0)
    // Шанс крита врага влияет и на быструю оценку (score.ts берёт тот же prepare).
    expect(prepare([fighter()], quest({ enemyCritChance: 0.15 }), {}).enemyCritChance).toBe(0.15)
  })
})

describe('усилители силы квеста (A74)', () => {
  const opts = { runs: 1, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 } as const

  it('Normal: +20% ATK/DEF как % боя — урон 1000 → 1200', () => {
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 0 })
    expect(simulateTeam([fighter({ atk: 1000 })], q, opts).avgDamagePerRound).toBeCloseTo(1000, 6)
    expect(simulateTeam([fighter({ atk: 1000 })], q, { ...opts, powerBooster: 'normal' }).avgDamagePerRound).toBeCloseTo(1200, 6)
  })

  it('Mega: +80% ATK/DEF, +25 п.п. крита, +50% урона крита (статические моды боя)', () => {
    const p = prepare([fighter({ crit: 0, critDmg: 2 })], quest(), { powerBooster: 'mega' })
    expect(p.selfStatic[0].atkPct).toBeCloseTo(0.8, 6)
    expect(p.selfStatic[0].defPct).toBeCloseTo(0.8, 6)
    expect(p.selfStatic[0].crit).toBeCloseTo(0.25, 6)
    expect(p.selfStatic[0].critDmg).toBeCloseTo(0.5, 6)
    // Super — только крит-шанс, без урона крита.
    const sup = prepare([fighter()], quest(), { powerBooster: 'super' })
    expect([sup.selfStatic[0].atkPct, sup.selfStatic[0].crit, sup.selfStatic[0].critDmg]).toEqual([0.4, 0.1, 0])
  })

  it('+20% DEF усилителя снижает входящий урон (DEF 1000 → 1200 на порогах CAPS)', () => {
    // 3 раунда по 100 урона: без усилителя 0.5 × 100 = 50 → 150 > 145 HP (смерть),
    // с усилителем DEF 1200 → множитель 0.46 → 138 ≤ 145 (герой жив).
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100 })
    const base = { runs: 1, seed: 4, maxRounds: 3, enemyCritChance: 0, aoeChance: 0 } as const
    const f = fighter({ def: 1000, hp: 145, atk: 0 })
    expect(simulateTeam([f], q, base).survival[0].rate).toBe(0)
    expect(simulateTeam([f], q, { ...base, powerBooster: 'normal' }).survival[0].rate).toBe(1)
  })

  it('неизвестный усилитель не выбран — поведение как раньше (none)', () => {
    const p = prepare([fighter()], quest(), { powerBooster: 'none' })
    expect([p.selfStatic[0].atkPct, p.selfStatic[0].defPct, p.selfStatic[0].crit, p.selfStatic[0].critDmg]).toEqual([0, 0, 0, 0])
  })
})

describe('порядок ходов: фиксированный и перемешивание (A73)', () => {
  it('по умолчанию — фиксированный порядок Compendium', () => {
    expect(resolveCombatModel().turnOrder).toBe('fixed')
    expect(turnOrderFor(3)).toEqual([1, 0, 2])
    expect(turnOrderFor(4)).toEqual([1, 0, 3, 2])
  })

  it('shuffleOrder — перестановка того же набора, детерминированная по seed', () => {
    const a = shuffleOrder([1, 0, 2], mulberry32(7))
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2])
    expect(shuffleOrder([1, 0, 2], mulberry32(7))).toEqual(a)
    // Разные seed дают разные порядки хотя бы иногда.
    const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffleOrder([1, 0, 2], mulberry32(i)).join(',')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('вариант turn-order-shuffle воспроизводим при том же seed и меняет исход боя', () => {
    // Монстр (1005 HP) умирает от первого-второго удара, поэтому порядок меняет, кто успел ударить:
    // фиксированный [1, 0, 2] даёт ровно 10 + 1000 = 1010, перемешивание — другое среднее.
    const q = quest({ monsterHp: 1005, monsterDmg: 0 })
    const team = [fighter({ name: 'A', atk: 1000 }), fighter({ name: 'B', atk: 10 }), fighter({ name: 'C', atk: 10 })]
    const base = { runs: 50, seed: 11, enemyCritChance: 0, aoeChance: 0 } as const
    const fixed = simulateTeam(team, q, base)
    const shuffled = simulateTeam(team, q, { ...base, model: { turnOrder: 'shuffle' } })
    const again = simulateTeam(team, q, { ...base, model: { turnOrder: 'shuffle' } })
    expect(fixed.avgDamagePerRound).toBeCloseTo(1010, 6)
    expect(shuffled).toEqual(again)
    expect(shuffled.avgDamagePerRound).not.toBeCloseTo(fixed.avgDamagePerRound, 6)
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

// ─────────────────────── модификаторы квестов в бою (A71/A72) ───────────────────────

describe('уклонение врага: герои промахиваются (A17/A71)', () => {
  const opts = { runs: 200, seed: 7, maxRounds: 10, enemyCritChance: 0, aoeChance: 0 } as const

  it('enemyEvaPp даёт промах: урон отряда падает примерно на долю уклонения', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 0 })
    const noEva = simulateTeam([fighter({ atk: 1000 })], q, opts)
    const withEva = simulateTeam([fighter({ atk: 1000 })], quest({ monsterHp: 1e9, monsterDmg: 0, battle: { enemyEvaPp: 40 } }), opts)
    // 40% промахов → ~60% урона; допуск на шум Monte-Carlo.
    expect(withEva.avgDamagePerRound / noEva.avgDamagePerRound).toBeGreaterThan(0.5)
    expect(withEva.avgDamagePerRound / noEva.avgDamagePerRound).toBeLessThan(0.7)
  })

  it('без уклонения врага промахов нет', () => {
    const p = prepare([fighter()], quest(), {})
    expect(p.enemyEva).toBe(0)
  })

  it('первый прогон с логом: промах виден как удар с нулевым уроном', () => {
    // `traceFight` строит свой лог (свой массив), поэтому смотрим события в результате.
    const r = traceFight([fighter({ atk: 100 })], quest({ monsterHp: 1000, monsterDmg: 0, battle: { enemyEvaPp: 100 } }), { seed: 3, runs: 1, maxRounds: 1 })
    const hits = r.trace.events.filter((e) => e.kind === 'heroHit')
    expect(hits.length).toBe(1)
    expect(hits[0].damage).toBe(0)
    expect(hits[0].text).toMatch(/промахивается/)
    expect(r.trace.damageDealt).toBe(0)
  })
})

describe('смещение выбора цели по классу (hates_*, A71)', () => {
  const opts = { runs: 400, seed: 9, maxRounds: 8, enemyCritChance: 0, aoeChance: 0 } as const

  it('targetMult повышает долю атак по указанной группе', () => {
    // Два бойца с равной угрозой и уклонением 50%: считаем уклонения — они равны числу атак по бойцу.
    const caster = fighter({ name: 'C', group: 'Spellcaster', hp: 1e6, atk: 0, eva: 0.5, threat: 100 })
    const brute = fighter({ name: 'F', group: 'Fighter', hp: 1e6, atk: 0, eva: 0.5, threat: 100 })
    const q = quest({ monsterHp: 1e9, monsterDmg: 100, monsterAoe: 0 })
    const plain = simulateTeam([caster, brute], q, opts)
    const biased = simulateTeam([caster, brute], quest({ monsterHp: 1e9, monsterDmg: 100, monsterAoe: 0, battle: { targetGroup: 'Spellcaster', targetMult: 4 } }), opts)
    // Без смещения доли атак равны; с ×4 по Spellcaster на него приходится 4/5 ударов.
    expect(plain.perFighter[0].dodgeRate).toBeCloseTo(plain.perFighter[1].dodgeRate, 1)
    expect(biased.perFighter[0].dodgeRate).toBeGreaterThan(biased.perFighter[1].dodgeRate)
  })

  it('prepare отдаёт цель и множитель', () => {
    const p = prepare([fighter()], quest({ battle: { targetGroup: 'Rogue', targetMult: 3 } }), {})
    expect(p.targetGroup).toBe('Rogue')
    expect(p.targetMult).toBe(3)
    expect(prepare([fighter()], quest(), {}).targetMult).toBe(1)
    expect(prepare([fighter()], quest(), {}).targetGroup).toBeNull()
  })
})

describe('первая атака врага (Swift/Lightning Fast/Lightspeed, A71)', () => {
  const opts = { runs: 1, seed: 1, maxRounds: 1, aoeChance: 0 } as const

  it('+100% ATK в первой атаке: герой теряет вдвое больше HP', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 100, battle: { firstAtkPct: 100 } })
    const plain = simulateTeam([fighter({ hp: 1000, def: 0, atk: 0 })], quest({ monsterHp: 1e9, monsterDmg: 100 }), { ...opts, enemyCritChance: 0 })
    const boosted = simulateTeam([fighter({ hp: 1000, def: 0, atk: 0 })], q, { ...opts, enemyCritChance: 0 })
    // DEF 0 → ×1.5; без бонуса 150, с бонусом 300.
    expect(plain.avgMinSurvivorHpPct).toBeCloseTo(0.85, 3)
    expect(boosted.avgMinSurvivorHpPct).toBeCloseTo(0.7, 3)
  })

  it('бонус действует только в первом раунде', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 100, battle: { firstAtkPct: 100 } })
    const two = simulateTeam([fighter({ hp: 1000, def: 0, atk: 0 })], q, { runs: 1, seed: 1, maxRounds: 2, aoeChance: 0, enemyCritChance: 0 })
    // 300 + 150 = 450 потеряно из 1000 → минимум 55% HP.
    expect(two.avgMinSurvivorHpPct).toBeCloseTo(0.55, 3)
  })

  it('п.п. крита первой атаки делают крит врага гарантированным в первом раунде', () => {
    const p = prepare([fighter()], quest({ battle: { firstAtkCritPp: 100 } }), {})
    expect(p.firstAtkCritPp).toBe(100)
    const first = (battle: Quest['battle']): TraceEvent => {
      const r = traceFight([fighter({ hp: 1e6, def: 0, atk: 0 })], quest({ monsterHp: 1000, monsterDmg: 100, battle }), { seed: 4, runs: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0.1 })
      const hit = r.trace.events.find((e) => e.kind === 'enemyHit')
      if (!hit) throw new Error('нет удара врага в логе')
      return hit
    }
    // 10% базовых + 100 п.п. = 110% → крит гарантирован (×1.5 от базового урона: 150 → 225).
    expect(first({ firstAtkCritPp: 100 })).toMatchObject({ crit: true, damage: 225 })
    // Без бонуса тот же seed крита не даёт.
    expect(first(null).crit ?? false).toBe(false)
  })
})

describe('штрафы квеста героям (мини-боссы, Flash/Nullysium, Гробница; A71/A72)', () => {
  it('штраф ATK применяется как % боя', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 0, battle: { heroAtkPct: -50 } })
    const plain = simulateTeam([fighter({ atk: 1000 })], quest({ monsterHp: 1e9, monsterDmg: 0 }), { runs: 5, seed: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0 })
    const halved = simulateTeam([fighter({ atk: 1000 })], q, { runs: 5, seed: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0 })
    expect(plain.avgDamagePerRound).toBeCloseTo(1000, 6)
    expect(halved.avgDamagePerRound).toBeCloseTo(500, 6)
  })

  it('штраф ATK по классу действует только на свою группу', () => {
    const q = quest({ monsterHp: 1e9, monsterDmg: 0, battle: { groupMods: [{ group: 'Spellcaster', heroAtkPct: -50 }] } })
    const caster = fighter({ name: 'C', group: 'Spellcaster', atk: 1000 })
    const brute = fighter({ name: 'F', group: 'Fighter', atk: 1000 })
    const m = simulateTeam([caster, brute], q, { runs: 1, seed: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0 })
    expect(m.perFighter[0].damagePerHit).toBeCloseTo(500, 6)
    expect(m.perFighter[1].damagePerHit).toBeCloseTo(1000, 6)
  })

  it('штраф EVA героям снижает уклонение, крит-штраф — шанс крита', () => {
    const p = prepare([fighter({ eva: 0.5, crit: 0.5 })], quest({ battle: { heroEvaPct: -20, heroCritChancePct: -30 } }), {})
    expect(p.selfStatic[0].eva).toBeCloseTo(-0.2, 6)
    expect(p.selfStatic[0].crit).toBeCloseTo(-0.3, 6)
  })

  it('штраф HP героям снижает максимум HP', () => {
    const plain = prepare([fighter({ hp: 1000 })], quest(), {}).maxHp[0]
    const hurt = prepare([fighter({ hp: 1000 })], quest({ battle: { heroHpPct: -20 } }), {}).maxHp[0]
    expect(plain).toBe(1000)
    expect(hurt).toBe(800)
  })

  it('штраф урона крита героям снижает урон крита', () => {
    const plain = simulateTeam([fighter({ atk: 1000, crit: 1, critDmg: 2 })], quest({ monsterHp: 1e9, monsterDmg: 0 }), { runs: 1, seed: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0 })
    const hurt = simulateTeam([fighter({ atk: 1000, crit: 1, critDmg: 2 })], quest({ monsterHp: 1e9, monsterDmg: 0, battle: { heroCritDmgPct: -25 } }), { runs: 1, seed: 1, maxRounds: 1, aoeChance: 0, enemyCritChance: 0 })
    expect(plain.avgDamagePerRound).toBeCloseTo(2000, 6)
    expect(hurt.avgDamagePerRound).toBeCloseTo(1750, 6)
  })
})

describe('Flash-задания: удвоение бонусов Bjorn (A53/A72)', () => {
  const bjorn = (): Skill => {
    const s = data.skills.find((x) => x.name === 'Flash Strike Team')
    if (!s) throw new Error('нет навыка Flash Strike Team')
    return s
  }

  it('навык распознаётся как «doubled during Flash Quests»', () => {
    expect(isDoubledInFlash(bjorn())).toBe(true)
    expect(isDoubledVsBoss(bjorn())).toBe(false)
  })

  it('в Flash-квесте бонусы навыка удваиваются, в обычном — нет', () => {
    const f = fighter({ atk: 1000, critDmg: 2, skills: [bjorn()] })
    const plain = prepare([f], quest(), {})
    const flash = prepare([f], quest({ isFlash: true }), {})
    // Навык даёт +15% ATK самому чемпиону (scope self) → в бою удвоение видно по atkPct.
    expect(flash.selfStatic[0].atkPct).toBeCloseTo(plain.selfStatic[0].atkPct * 2, 6)
    expect(flash.selfStatic[0].atkPct).toBeGreaterThan(0)
  })

  it('вне Flash-квеста поведение не меняется', () => {
    const f = fighter({ atk: 1000, skills: [bjorn()] })
    const a = prepare([f], quest(), {})
    const b = prepare([f], quest({ isFlash: false }), {})
    expect(a.selfStatic[0]).toEqual(b.selfStatic[0])
  })

  it('«doubled against bosses» работает на мини-боссе (variant = miniboss)', () => {
    const ashley = data.skills.find((x) => x.name === "Ashley's Gambit")
    if (!ashley) throw new Error('нет навыка Ashley')
    const f = fighter({ skills: [ashley] })
    // Навык даёт отряду +15% ATK/DEF; на боссе бонус удваивается до +30%.
    expect(prepare([f], quest({ variant: 'normal' }), {}).selfStatic[0].atkPct).toBeCloseTo(0.15, 6)
    expect(prepare([f], quest({ variant: 'boss' }), {}).selfStatic[0].atkPct).toBeCloseTo(0.3, 6)
    expect(prepare([f], quest({ variant: 'miniboss' }), {}).selfStatic[0].atkPct).toBeCloseTo(0.3, 6)
    expect(isBossQuest(quest({ variant: 'miniboss' }))).toBe(true)
    expect(isBossQuest(quest({ variant: 'normal' }))).toBe(false)
  })
})
