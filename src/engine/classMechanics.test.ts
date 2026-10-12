/**
 * Тесты отдельных боевых механик классов и чемпионов, добавленных в сессии 12:
 * эскалация по HP (Berserker/Jarl), возврат бонусов (Sensei), казнь цели (Death Knight),
 * вторая попытка (Chronomancer/Fateweaver), DEF щита в ATK (Velite/Praetorian), дренаж (Hemma),
 * случайный бонус (Tamas), усиление чемпионских навыков (Mercenary), уклонение в 1-м раунде (Daimyo),
 * предел уклонения (Pathfinder), бонус к предметам со встроенной стихией (Spellknight).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HeroInstance, Quest, Skill } from '../data/types.ts'
import { importTitansDb } from '../data/titansdb.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { syntheticHero, withoutInnateSkills } from '../test/synthetic.ts'
import { fighterFromChampion, fighterFromHero, innateBonusLoss, parseSpecials, prepare, simulateTeam, type Fighter } from './combat.ts'
import { calcStats } from './stats.ts'

const data = fixtureGameData()

const skill = (name: string): Skill => {
  const s = data.skills.find((x) => x.name === name)
  if (!s) throw new Error(`нет навыка «${name}»`)
  return s
}
/** Копия навыка без указанной клаузы (чтобы сравнить «с механикой» и «без»). */
const withoutClause = (s: Skill, re: RegExp): Skill => ({
  ...s,
  text: s.text.replace(re, '').replace(/\.\s*$/, ''),
  ignored: s.ignored.filter((t) => !re.test(t)),
})

/** Копия навыка только с эффектами ATK (убирает уклонение — тест становится детерминированным). */
const atkOnly = (s: Skill, keepEscalation: boolean): Skill => ({
  ...s,
  effects: s.effects.filter((e) => e.stat === 'atk'),
  text: keepEscalation ? s.text : s.text.replace(/effect is doubled[^.]*/i, ''),
  ignored: keepEscalation ? s.ignored : s.ignored.filter((t) => !/effect is doubled/i.test(t)),
})

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
  defCaps: null,
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

describe('Berserker/Jarl: эскалация условного бонуса по HP (A48)', () => {
  const angerPoint = skill('Anger Point')

  it('навык распознан: ×2 ниже 50% HP, ×3 ниже 25%', () => {
    expect(parseSpecials([angerPoint]).hpEscalation).toEqual({ doubleBelow: 50, tripleBelow: 25 })
  })

  it('урон растёт ровно на добавку от ×2 и ×3', () => {
    // 100 урона монстра в раунд, HP 1000: враг бьёт первым, герой бьёт в раундах 1–9 и гибнет в 10-м.
    // Базовая условная прибавка (+30% ATK ниже 75% HP) есть в обеих версиях и в разницу не входит.
    // HP — на момент удара героя (после удара врага): 40/30% → ×2 (раунды 6–7, +30 урона каждый),
    // 20/10% → ×3 (раунды 8–9, +60). Итого добавка эскалации: 30 + 30 + 60 + 60 = 180 урона.
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100 })
    const opts = { runs: 5, seed: 3, enemyCritChance: 0, aoeChance: 0 } as const
    const withEsc = fighter({ hp: 1000, atk: 100, skills: [atkOnly(angerPoint, true)] })
    const noEsc = fighter({ hp: 1000, atk: 100, skills: [atkOnly(angerPoint, false)] })
    const a = simulateTeam([withEsc], q, opts)
    const b = simulateTeam([noEsc], q, opts)
    expect(a.avgRounds).toBe(10)
    expect(b.avgRounds).toBe(10)
    expect((a.avgDamagePerRound - b.avgDamagePerRound) * a.avgRounds).toBeCloseTo(180, 2)
  })
})

describe('эскалация по HP — только у своего навыка', () => {
  const angerPoint = skill('Anger Point')
  /** Чужой условный навык без эскалации: +30% ATK ниже 75% HP. */
  const other: Skill = {
    ...angerPoint,
    id: 'Test Rage',
    name: 'Test Rage',
    text: '+30% Attack when HP falls below 75%',
    effects: [{ stat: 'atk', mode: 'pct', value: 30, scope: 'self', condition: { kind: 'selfHpBelow', pct: 75 } }],
    ignored: [],
  }

  it('условный эффект другого навыка Berserker не удваивается и не утраивается', () => {
    // Как в тесте выше: HP 1000, 100 урона в раунд, герой бьёт в раундах 1–9. Ниже 75% HP на момент
    // удара — раунды 3–9: чужой навык даёт ровно 7 × 30 = 210 урона (с эскалацией было бы 390).
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100 })
    const opts = { runs: 5, seed: 3, enemyCritChance: 0, aoeChance: 0 } as const
    const both = fighter({ hp: 1000, atk: 100, skills: [atkOnly(angerPoint, true), other] })
    const own = fighter({ hp: 1000, atk: 100, skills: [atkOnly(angerPoint, true)] })
    const a = simulateTeam([both], q, opts)
    const b = simulateTeam([own], q, opts)
    expect(a.avgRounds).toBe(10)
    expect((a.avgDamagePerRound - b.avgDamagePerRound) * a.avgRounds).toBeCloseTo(210, 2)
  })
})

describe('Ninja: враг бьёт первым и снимает «until damaged» до атаки героя', () => {
  it('удар врага в 1-м раунде — первая атака героя уже без бонуса крита', () => {
    // ST-Central, Hero Academia → Ninja: «the enemy always attacks first, potentially hitting the Ninja and
    // eliminating the passive boost before the Ninja even attacks». +100% крита до урона, враг всегда попадает.
    const ninja: Skill = {
      ...skill('Shadow Assassin'),
      id: 'Test Ninja',
      text: '+100% Critical Hit Chance until damaged',
      effects: [{ stat: 'crit', mode: 'pct', value: 100, scope: 'self', condition: { kind: 'untilDamaged' } }],
      ignored: [],
    }
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 10 })
    const r = simulateTeam([fighter({ atk: 100, critDmg: 2, skills: [ninja] })], q, { runs: 5, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 })
    expect(r.avgDamagePerRound).toBe(100)
  })
})

describe('Sensei: возврат бонусов после 2 раундов без урона (A49)', () => {
  const it_ = skill('It From the Dark')

  it('навык распознан', () => {
    const sp = parseSpecials([it_])
    expect(sp.regainAfterRounds).toBe(2)
    expect(sp.hpEscalation).toBeNull()
  })

  it('с возвратом бонусов герой живёт дольше', () => {
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100, defCaps: null })
    const opts = { runs: 300, seed: 5, enemyCritChance: 0, aoeChance: 0 } as const
    const base = { hp: 1000, eva: 0.5, atk: 0 }
    const withRegain = fighter({ ...base, skills: [it_] })
    const noRegain = fighter({ ...base, skills: [withoutClause(it_, /regain bonuses after \d+ rounds?/i)] })
    expect(simulateTeam([withRegain], q, opts).avgRounds).toBeGreaterThan(simulateTeam([noRegain], q, opts).avgRounds)
  })

  it('снятый после урона врождённый бонус возвращается через 2 раунда (A54)', () => {
    // Бонус уже в статах (innateBonus): бой его не добавляет, а снимает после первого урона —
    // «Regain bonuses after 2 rounds» возвращает его, поэтому герой живёт дольше, чем без клаузы.
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100, defCaps: null })
    const opts = { runs: 300, seed: 5, enemyCritChance: 0, aoeChance: 0 } as const
    const base = { hp: 1000, eva: 0.5, atk: 0, innateSkillId: it_.id, innateBonus: { eva: 0.2, crit: 0.2 } }
    const withRegain = fighter({ ...base, skills: [it_] })
    const noRegain = fighter({ ...base, skills: [withoutClause(it_, /regain bonuses after \d+ rounds?/i)] })
    expect(simulateTeam([withRegain], q, opts).avgRounds).toBeGreaterThan(simulateTeam([noRegain], q, opts).avgRounds)
  })
})

describe('Ninja/Sensei: врождённый бонус EVA/CRIT (A54)', () => {
  const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
  const heroes = importTitansDb(text, data).heroes
  const irwin = (): HeroInstance => {
    const h = heroes.find((x) => x.name === 'Ирвин')
    if (!h) throw new Error('нет Ирвина')
    return h
  }

  it('величина бонуса — из HEROES (`30% (+20%)`), а не из текста ступеней (+15% EVA у 1-й)', () => {
    const f = fighterFromHero(irwin(), data)
    expect(f.innateBonus).toEqual({ eva: 0.2, crit: 0.2 })
    // У промоушена скобки в HEROES не заполнены — берём значение базового класса.
    expect(fighterFromHero(syntheticHero(data, 'Sensei'), data).innateBonus).toEqual({ eva: 0.2, crit: 0.2 })
  })

  it('Ниндзя без урона имеет статы из экспорта: бонус не добавлен второй раз', () => {
    const h = irwin()
    const s = calcStats(h, data)
    // Сверка: EVA/CRIT расчёта совпадают с экспортом (Ирвин 71/20 — stats.fixture.test.ts).
    expect(s.eva).toBeCloseTo(h.reference!.stats.eva, 6)
    expect(s.crit).toBeCloseTo(h.reference!.stats.crit, 6)
    // В бою старт — те же статы: «until damaged» эффект врождённого навыка не попадает в модификаторы,
    // а сами модификаторы совпадают с версией, где врождённых навыков нет вовсе (вклад врождённого — ноль).
    const f = fighterFromHero(h, data)
    const p = prepare([f], quest(), { runs: 1, seed: 1 })
    expect(p.selfCond[0].filter((r) => r.e.condition?.kind === 'untilDamaged')).toEqual([])
    const off = prepare([fighterFromHero(h, withoutInnateSkills(data, 'Ninja'))], quest(), { runs: 1, seed: 1 })
    expect(p.selfStatic[0]).toEqual(off.selfStatic[0])
    expect(innateBonusLoss(f, false)).toEqual({ eva: 0, crit: 0 })
  })

  it('после удара статы меньше ровно на величину бонуса, и бой это учитывает', () => {
    const f = fighterFromHero(irwin(), data)
    expect(innateBonusLoss(f, true)).toEqual({ eva: -0.2, crit: -0.2 })

    // Интеграционная проверка на бойце с врождённым бонусом в статах (как у Ninja/Sensei): вариант «lost»
    // теряет бонус после первого урона, вариант «kept» (innateBonus = 0) — не теряет его никогда.
    const ninja = skill('One With the Dark')
    const base = { hp: 1000, atk: 100, crit: 0.5, critDmg: 2, eva: 0.5, innateSkillId: ninja.id, innateBonus: { eva: 0.2, crit: 0.2 } }
    const lost = fighter({ ...base, skills: [ninja] })
    const kept = fighter({ ...base, innateBonus: { eva: 0, crit: 0 }, skills: [ninja] })
    const opts = { runs: 300, seed: 11, enemyCritChance: 0, aoeChance: 0 } as const
    // Уклонение: без бонуса больше ударов доходит — герой гибнет раньше.
    const evaQuest = quest({ monsterHp: 10_000_000, monsterDmg: 50 })
    expect(simulateTeam([lost], evaQuest, opts).avgRounds).toBeLessThan(simulateTeam([kept], evaQuest, opts).avgRounds)
    // Крит: после первого удара крит падает на бонус, поэтому урон за раунд ниже (бой идёт 50 раундов у обоих).
    const critQuest = quest({ monsterHp: 10_000_000, monsterDmg: 0 })
    const a = simulateTeam([lost], critQuest, opts)
    const b = simulateTeam([kept], critQuest, opts)
    expect(a.avgRounds).toBe(b.avgRounds)
    expect(a.avgDamagePerRound).toBeLessThan(b.avgDamagePerRound)
  })
})

describe('Dark Knight/Death Knight: казнь цели ниже 10% HP (A50)', () => {
  const cull = skill('Cull the Weak')

  it('навык распознан', () => expect(parseSpecials([cull]).executeBelowPct).toBe(10))

  it('цель добивается на 10-м ударе, без казни — нет', () => {
    const q = quest({ monsterHp: 1000, monsterDmg: 0, defCaps: null })
    const opts = { runs: 3, seed: 1, maxRounds: 10, enemyCritChance: 0, aoeChance: 0 } as const
    const withExecute = fighter({ atk: 95, hp: 1000, skills: [cull] })
    const noExecute = fighter({ atk: 95, hp: 1000, skills: [withoutClause(cull, /upon striking[^.]*/i)] })
    // 95 × 10 = 950 → у монстра 50 HP (это < 10% от 1000) — казнь.
    expect(simulateTeam([withExecute], q, opts).winRate).toBe(1)
    expect(simulateTeam([noExecute], q, opts).winRate).toBe(0)
  })
})

describe('Chronomancer/Fateweaver: вторая попытка квеста (A51)', () => {
  it('навыки распознаны: Chronomancer без бонуса, Fateweaver +15% (A44)', () => {
    expect(parseSpecials([skill('Nine Lives')]).secondAttemptPowerPct).toBe(0)
    expect(parseSpecials([skill('Chaos Control')]).secondAttemptPowerPct).toBe(15)
  })

  it('win rate растёт как 1−(1−p)²', () => {
    // Монстр не бьёт: исход определяется критами героя за 2 раунда — победа только при двух критах (p = 0.25).
    // Берём «Twist of Fate» (T1, без стат-бонусов), чтобы вклад давала только вторая попытка.
    const q = quest({ monsterHp: 1000, monsterDmg: 0, defCaps: null })
    const opts = { runs: 600, seed: 11, maxRounds: 2, enemyCritChance: 0, aoeChance: 0 } as const
    const plain = fighter({ atk: 300, crit: 0.5, hp: 1000 })
    const withRetry = fighter({ ...plain, skills: [skill('Twist of Fate')] })
    const p = simulateTeam([plain], q, opts).winRate
    const twice = simulateTeam([withRetry], q, opts).winRate
    expect(p).toBeGreaterThan(0.1)
    expect(p).toBeLessThan(0.9)
    expect(twice).toBeGreaterThan(p)
    expect(twice).toBeCloseTo(1 - (1 - p) ** 2, 1)
  })
})

describe('Velite/Praetorian: DEF щита прибавляется к ATK (A45)', () => {
  it('DEF-вклад щита уходит в ATK', () => {
    const hero = syntheticHero(data, 'Praetorian')
    const f = fighterFromHero(hero, data)
    const stats = calcStats(hero, data)
    const shieldSlot = hero.slots.findIndex((s) => s.item && data.items.find((i) => i.name === s.item)?.type === 'Shield')
    expect(shieldSlot).toBeGreaterThanOrEqual(0)
    const shieldDef = stats.breakdown.items.find((c) => c.slot === shieldSlot)?.total.def ?? 0
    expect(shieldDef).toBeGreaterThan(0)
    expect(f.atkFromShieldDef).toBe(shieldDef)
    // Без щита прибавки нет.
    const noShield = { ...hero, slots: hero.slots.map((s, i) => (i === shieldSlot ? { ...s, item: null } : s)) }
    expect(fighterFromHero(noShield, data).atkFromShieldDef).toBe(0)
  })

  it('прибавка увеличивает урон в бою', () => {
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 0, defCaps: null })
    const opts = { runs: 3, seed: 1, maxRounds: 2, enemyCritChance: 0, aoeChance: 0 } as const
    const withDef = fighter({ atk: 100, atkFromShieldDef: 500 })
    const withoutDef = fighter({ atk: 100 })
    expect(simulateTeam([withDef], q, opts).avgDamagePerRound).toBeGreaterThan(simulateTeam([withoutDef], q, opts).avgDamagePerRound)
  })
})

describe('Hemma: дренаж союзников и рост ATK (A46)', () => {
  const drain = skill('Consume Essence')

  it('навык распознан: 8% HP в раунд, +100% к слитому у T5', () => {
    expect(parseSpecials([drain]).drain).toEqual({ pct: 8, atkBonusPct: 100 })
  })

  it('союзник теряет HP, а Hemma бьёт сильнее', () => {
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 0, defCaps: null })
    const opts = { runs: 3, seed: 1, maxRounds: 5, enemyCritChance: 0, aoeChance: 0 } as const
    const ally = fighter({ name: 'ally', hp: 10_000, atk: 0, threat: 0 })
    const hemma = fighter({ name: 'hemma', atk: 100, hp: 10_000, crit: 0 })
    const withDrain = simulateTeam([ally, { ...hemma, skills: [drain] }], q, opts)
    const noDrain = simulateTeam([ally, { ...hemma, skills: [withoutClause(drain, /each turn, drain[^.]*/i)] }], q, opts)
    // Союзник дренирован (мин. % HP выжившего < 1), урон Hemma выше за счёт накопленной прибавки.
    expect(withDrain.avgMinSurvivorHpPct).toBeLessThan(1)
    expect(noDrain.avgMinSurvivorHpPct).toBe(1)
    expect(withDrain.avgDamagePerRound).toBeGreaterThan(noDrain.avgDamagePerRound)
  })
})

describe('Tamas: «highly random» бонус взят математическим ожиданием (A43)', () => {
  it('+200% «up to» → +100% к ATK отряда', () => {
    const tamas = data.champions.find((c) => c.name === 'Tamas')
    if (!tamas) throw new Error('нет Tamas')
    const cf = fighterFromChampion(tamas, 4, data)
    const p = prepare([fighter(), cf], quest(), { runs: 1 })
    expect(p.selfStatic[0].atkPct).toBeCloseTo(1, 6)
  })
})

describe('Mercenary: +25% к эффектам от навыков чемпиона (A52)', () => {
  const argon = data.champions.find((c) => c.name === 'Argon')
  if (!argon) throw new Error('нет Argon')

  it('лидерский бафф сильнее у Mercenary, чем у другого героя', () => {
    const champ = fighterFromChampion(argon, 11, data)
    const merc = fighter({ name: 'merc', skills: [skill('Elite Mercenary')] })
    const other = fighter({ name: 'other' })
    const p = prepare([merc, other, champ], quest(), { runs: 1 })
    // Aura of the Paladin (ранг 11): +40% ATK отряду; у Mercenary — ×1.25 = +50%.
    expect(p.selfStatic[0].atkPct).toBeCloseTo(0.5, 6)
    expect(p.selfStatic[1].atkPct).toBeCloseTo(0.4, 6)
  })
})

describe('Daimyo: гарантированное уклонение в 1-м раунде (A49)', () => {
  const iaido = skill('Perfect Form Iaido')

  it('навык распознан', () => {
    const sp = parseSpecials([iaido])
    expect(sp.firstRoundEva).toBe(true)
    expect(sp.firstRoundCrit).toBe(true)
  })

  it('в 1-м раунде урон не проходит', () => {
    const q = quest({ monsterHp: 1000, monsterDmg: 1000, defCaps: null })
    const opts = { runs: 5, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 } as const
    const withIaido = fighter({ hp: 100, atk: 0, skills: [iaido] })
    const plain = fighter({ hp: 100, atk: 0 })
    expect(simulateTeam([withIaido], q, opts).survival[0].rate).toBe(1)
    expect(simulateTeam([plain], q, opts).survival[0].rate).toBe(0)
  })
})

describe('Pathfinder: «+3% to max Evasion» поднимает предел уклонения (A42)', () => {
  it('предел 75% у остальных и 78% у носителя', () => {
    const withInsubstantial = prepare([fighter({ skills: [skill('Insubstantial')] })], quest(), { runs: 1 })
    const plain = prepare([fighter()], quest(), { runs: 1 })
    expect(withInsubstantial.evaCaps[0]).toBeCloseTo(0.78, 6)
    expect(plain.evaCaps[0]).toBeCloseTo(0.75, 6)
  })

  it('предел персональный: носитель навыка не поднимает его союзникам', () => {
    const p = prepare([fighter({ skills: [skill('Insubstantial')] }), fighter({ name: 'G' })], quest(), { runs: 1 })
    expect(p.evaCaps).toEqual([0.78, 0.75])
  })
})

describe('Spellknight: +50% к предметам со встроенной стихией', () => {
  it('предмет со встроенным камнем получает +50% сверх обычного бонуса', () => {
    const hero = syntheticHero(data, 'Spellknight')
    const maxTier = data.heroLevels.find((l) => l.level === hero.level)?.maxItemTier ?? 16
    const innate = data.items
      .filter((i) => i.builtInElement && i.tier <= maxTier)
      .sort((a, b) => b.stats.Normal.atk + b.stats.Normal.def + b.stats.Normal.hp - (a.stats.Normal.atk + a.stats.Normal.def + a.stats.Normal.hp))[0]
    if (!innate) throw new Error('в данных нет предметов со встроенной стихией')
    const slot = hero.slots.findIndex((_, i) => data.heroClasses.find((c) => c.name === hero.className)?.slots[i].includes(innate.type))
    expect(slot, `слот под «${innate.name}» (${innate.type})`).toBeGreaterThanOrEqual(0)
    const withInnate = { ...hero, slots: hero.slots.map((s, i) => (i === slot ? { ...s, item: innate.name } : s)) }
    const plainSlot = hero.slots.findIndex((s, i) => i !== slot && s.item && !data.items.find((x) => x.name === s.item)?.builtInElement)
    expect(plainSlot).toBeGreaterThanOrEqual(0)
    const stats = calcStats(withInnate, data)
    const mult = (i: number): number => stats.breakdown.items.find((c) => c.slot === i)?.multiplier.atk ?? 0
    expect(mult(slot) - mult(plainSlot)).toBeCloseTo(0.5, 6)
    expect(mult(plainSlot)).toBeGreaterThan(1)
  })
})
