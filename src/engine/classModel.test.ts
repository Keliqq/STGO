/**
 * Тесты «особенность КАЖДОГО класса и чемпиона срабатывает» + реестр моделирования.
 *
 * 1. Реестр (`src/engine/classModel.ts`): все 42 класса и все чемпионы классифицированы —
 *    ни одной неразобранной клаузы из листов HEROES/CHAMPIONS (иначе тест падает и требует
 *    добавить механику или осознанный пробел).
 * 2. Для каждого класса: синтетический герой, у которого «выключены» врождённые навыки, должен
 *    отличаться и по модели (статы/спец-механики/prepare), и по результату симуляции.
 * 3. Для каждого чемпиона: то же с лидерским навыком.
 * 4. Душа Титана: промоушен даёт свои базовые статы, свой врождённый навык и 4-ю ступень (A47).
 */
import { describe, expect, it } from 'vitest'
import type { GameData, HeroInstance, Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { syntheticHero, withoutInnateSkills } from '../test/synthetic.ts'
import { fighterFromChampion, fighterFromHero, parseSpecials, prepare, simulateTeam, type Fighter } from './combat.ts'
import { classSkills, modelWarning, modelingReport } from './classModel.ts'
import { calcStats, effectiveClass } from './stats.ts'

const data = fixtureGameData()

/**
 * Квесты-зонды подстраиваются под бойца: порог защиты ставится так, чтобы его DEF был в середине
 * кривой снижения урона (не в насыщении 0.25×), а урон монстра — чтобы гибель наступала примерно
 * на 12-м раунде. Тогда изменение DEF/EVA/HP меняет число раундов, а ATK — нанесённый урон.
 */
function probesFor(def: number, hp: number): Quest[] {
  const p50 = Math.max(10, Math.round(def * 2))
  const dmg = Math.max(1, Math.round(hp / 12))
  const base: Omit<Quest, 'id' | 'monsterDmg' | 'monsterAoe' | 'defCaps'> = {
    area: 'Probe',
    variant: 'boss',
    difficulty: 'Hard',
    minPower: null,
    heroXp: null,
    monsterHp: 1_000_000,
    barrier: { elements: ['Fire'], hp: 120 },
    miniBosses: [],
  }
  return [1, 0.5, 2, 0.25].map((k, i) => ({
    ...base,
    id: `probe|boss|Hard|${i}`,
    monsterDmg: Math.round(dmg * k),
    monsterAoe: Math.round(dmg * k * 0.4),
    defCaps: { p50: Math.round(p50 * k), p70: Math.round(p50 * 2 * k), p75: Math.round(p50 * 6 * k) },
  }))
}

interface Signals {
  model: string
  sim: string
}

/** Всё, что движок знает о бойце до боя, + результат симуляции по зондам (фиксированные seed). */
function signals(dataIn: GameData, hero: HeroInstance, probes: Quest[], extra: Fighter[] = []): Signals {
  const stats = calcStats(hero, dataIn)
  const f = fighterFromHero(hero, dataIn)
  const team = [f, ...extra]
  const p = prepare(team, probes[0], { runs: 10, seed: 1 })
  const model = JSON.stringify({
    stats: {
      atk: stats.atk, def: stats.def, hp: stats.hp, crit: stats.crit, critDmg: stats.critDmg,
      eva: stats.eva, threat: stats.threat, manaShield: stats.manaShield, element: stats.element,
    },
    skillIds: stats.breakdown.skills.map((s) => s.id).sort(),
    fighter: { atk: f.atk, def: f.def, hp: f.hp, crit: f.crit, critDmg: f.critDmg, eva: f.eva, threat: f.threat, atkFromShieldDef: f.atkFromShieldDef ?? 0, elements: f.elements },
    specials: parseSpecials(f.skills),
    maxHp: p.maxHp,
    manaMax: p.manaMax,
    selfStatic: p.selfStatic,
    selfCond: p.selfCond,
    partyCond: p.partyCond,
    barrierBroken: p.barrierBroken,
    partyHeal: p.partyHeal,
    evaCap: p.evaCap,
    secondAttempt: p.secondAttempt,
  })
  const sim = JSON.stringify(
    probes.map((q) => {
      const m = simulateTeam(team, q, { runs: 400, seed: 7 })
      return { ...m, survival: m.survival.map((s) => s.rate) }
    }),
  )
  return { model, sim }
}

/** Зонды по «полному» бойцу класса — сравниваем обе версии на одних и тех же квестах. */
function probesForHero(dataIn: GameData, hero: HeroInstance): Quest[] {
  const f = fighterFromHero(hero, dataIn)
  return probesFor(f.def, f.hp)
}

describe('реестр моделирования классов и чемпионов', () => {
  const report = modelingReport(data)

  it('в отчёте все 42 класса и все 13 чемпионов, без дублей', () => {
    const classes = report.filter((e) => e.kind === 'class')
    const champions = report.filter((e) => e.kind === 'champion')
    expect(classes).toHaveLength(data.heroClasses.length)
    expect(champions).toHaveLength(data.champions.length)
    expect(classes.length).toBe(42)
    expect(champions.length).toBe(13)
    expect(new Set(report.map((e) => e.name)).size).toBe(report.length)
  })

  it('нет неразобранных клауз: каждая либо смоделирована, либо небоевая, либо осознанный пробел', () => {
    const unclassified = report.flatMap((e) => e.unclassified.map((c) => `${e.name}: ${c}`))
    expect(unclassified).toEqual([])
  })

  it('у каждого класса есть врождённый навык, у каждого чемпиона — лидерский', () => {
    for (const e of report) {
      const skills = e.kind === 'class' ? classSkills(data, e.name) : data.skills.filter((s) => s.champions.includes(e.name) && s.type === 'Leader')
      expect(skills.length, e.name).toBeGreaterThan(0)
    }
  })

  it('уровень «частично» выставлен только там, где есть незакрытые пробелы', () => {
    for (const e of report) {
      expect(e.level === 'partial', `${e.name}: missing=${e.missing.length}`).toBe(e.missing.length > 0)
    }
    const partial = report.filter((e) => e.level === 'partial').map((e) => e.name)
    // Ninja/Sensei закрыты в сессии 15 (A54): бонус EVA/CRIT берётся из HEROES и снимается после урона.
    expect(partial.sort()).toEqual(['Bjorn'])
  })

  it('пометка для UI: у частичных классов — «оценка приблизительная: не учтено …», у остальных — про допущения', () => {
    const bjorn = modelWarning(data, 'Bjorn')
    expect(bjorn?.level).toBe('partial')
    expect(bjorn?.text).toContain('оценка приблизительная: не учтено')
    const berserker = modelWarning(data, 'Berserker')
    expect(berserker?.level).toBe('full')
    expect(berserker?.text).toContain('учтено с допущениями')
    // Ninja закрыт (A54), но с оговоркой о величине бонуса — уровня «частично» больше нет.
    const ninja = modelWarning(data, 'Ninja')
    expect(ninja?.level).toBe('full')
    expect(ninja?.text).toContain('учтено с допущениями')
    // Класс без пробелов и допущений — пометки нет вовсе.
    expect(modelWarning(data, 'Mage')).toBeNull()
  })
})

describe('особенность каждого класса срабатывает в модели и в симуляции', () => {
  for (const cls of data.heroClasses) {
    it(`${cls.name}${cls.promotion ? ` → ${cls.promotion}` : ''}: врождённый навык влияет на бой`, () => {
      const hero = syntheticHero(data, cls.name)
      const off = withoutInnateSkills(data, cls.name)
      const probes = probesForHero(data, hero)
      const withSkills = signals(data, hero, probes)
      const without = signals(off, hero, probes)
      expect(withSkills.model, `${cls.name}: особенность не отражена в модели (статы/спец-механики)`).not.toBe(without.model)
      expect(withSkills.sim, `${cls.name}: особенность не влияет на симуляцию`).not.toBe(without.sim)
    })
  }
})

describe('особенность каждого чемпиона срабатывает в модели и в симуляции', () => {
  const companion = syntheticHero(data, 'Knight')
  const probes = probesForHero(data, companion)
  for (const champ of data.champions) {
    it(`${champ.name}: лидерский навык влияет на бой`, () => {
      const rank = Math.max(...champ.ranks.map((r) => r.rank))
      const cf = fighterFromChampion(champ, rank, data)
      expect(cf.skills.length, champ.name).toBeGreaterThan(0)
      const withLeader = signals(data, companion, probes, [cf])
      const withoutLeader = signals(data, companion, probes, [{ ...cf, skills: [] }])
      expect(withLeader.model, `${champ.name}: лидерский навык не отражён в модели`).not.toBe(withoutLeader.model)
      expect(withLeader.sim, `${champ.name}: лидерский навык не влияет на симуляцию`).not.toBe(withoutLeader.sim)
    })
  }
})

describe('Душа Титана: бонусы промоушена (A47)', () => {
  const base = syntheticHero(data, 'Berserker')
  const soul: HeroInstance = { ...base, titanSoul: true }

  it('«Душа: да» подменяет класс на промоушен (Jarl)', () => {
    expect(effectiveClass(base, data)?.name).toBe('Berserker')
    expect(effectiveClass(soul, data)?.name).toBe('Jarl')
  })

  it('промоушен даёт свои базовые статы (HP/ATK/DEF выше) при том же снаряжении', () => {
    const a = calcStats(base, data, { useReference: false })
    const b = calcStats(soul, data, { useReference: false })
    expect(b.hp).toBeGreaterThan(a.hp)
    expect(b.atk).toBeGreaterThan(a.atk)
    expect(b.def).toBeGreaterThan(a.def)
  })

  it('открывается 4-я ступень врождённого навыка (The Beast Unleashed)', () => {
    const names = (h: HeroInstance): string[] => calcStats(h, data).breakdown.skills.map((s) => s.name)
    expect(names(base)).toContain('The Beast Within')
    expect(names(soul)).toContain('The Beast Unleashed')
  })

  it('уже промоушенный герой получает ту же базу и 4-ю ступень навыка с Душой', () => {
    const jarl = syntheticHero(data, 'Jarl', { titanSoul: true })
    const jarlNoSoul = syntheticHero(data, 'Jarl')
    expect(effectiveClass(jarl, data)?.name).toBe('Jarl')
    const a = calcStats(jarl, data, { useReference: false })
    const b = calcStats(jarlNoSoul, data, { useReference: false })
    // База одна и та же (промоушен не применяется повторно)…
    expect({ atk: a.atk, def: a.def, hp: a.hp }).toEqual({ atk: b.atk, def: b.def, hp: b.hp })
    // …а Душа открывает 4-ю ступень врождённого навыка (A24).
    expect(a.breakdown.skills.map((s) => s.name)).toContain('The Beast Unleashed')
    expect(b.breakdown.skills.map((s) => s.name)).toContain('The Beast Within')
  })

  it('«Душа: да» не ломает героя без промоушена в данных', () => {
    // У промоушена нет своего промоушена — effectiveClass возвращает его же.
    const acrobat = syntheticHero(data, 'Acrobat', { titanSoul: true })
    expect(effectiveClass(acrobat, data)?.name).toBe('Acrobat')
  })
})
