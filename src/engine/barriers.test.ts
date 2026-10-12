/**
 * Барьеры (сессия 28): таблица «локация × сложность», вклад героев и чемпионов в стихию, готовые
 * барьерные пары и чего не хватает, если стихии мало.
 *
 * Обязательные проверки владельца:
 *   · барьерные пары действительно достигают порога — пара из отчёта пробивает барьер по боевой логике
 *     (`combat.ts → barrierBroken`), а не только по арифметике отчёта;
 *   · Spellblade засчитывается только на 50% (A9), Rudo даёт +50% стихии отряда;
 *   · при нехватке стихии видно, чего именно не хватает и чем добрать (камень, чемпион).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { plainHero } from '../test/synthetic.ts'
import { barrierBroken, fighterFromChampion, fighterFromHero } from './combat.ts'
import { barrierReport, barrierReports, contributionTo, maxDisjointPairs, maxElementStone, rosterContributions, type RosterContribution } from './barriers.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const heroes = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data).heroes
const darkBoss = data.quests.find((q) => q.area === 'Meteor Zone' && q.variant === 'boss' && q.difficulty === 'Extreme') as Quest

/** Бойцы пары — по тем же правилам, что в бою: герой своей сборкой, чемпион по рангу. */
function fightersOf(names: string[], list: RosterContribution[]) {
  return names.map((n) => {
    const c = list.find((x) => x.name === n)
    if (!c) throw new Error(`Нет вкладчика ${n}`)
    if (c.hero) return fighterFromHero(c.hero, data)
    const champion = data.champions.find((x) => x.name === n)
    if (!champion) throw new Error(`Нет чемпиона ${n}`)
    return fighterFromChampion(champion, c.kind === 'champion' ? 5 : 1, data)
  })
}

describe('вклад ростера в стихии', () => {
  it('герой даёт стихию своего класса, Spellblade — половину любой', () => {
    const contributions = rosterContributions(data, heroes)
    expect(contributions.length).toBeGreaterThan(0)
    for (const c of contributions) {
      expect(c.value).toBeGreaterThan(0)
      expect(c.partyBonusPct).toBe(0)
      expect(c.hero).not.toBeNull()
    }
    // Ни один герой фикстуры не «любой» стихии — все вкладчики со своей стихией.
    expect(contributions.every((c) => c.element !== null)).toBe(true)

    const spellblade = plainHero(data, 'Spellblade', { id: 'sb', name: 'Клинок', stone: 'Oblivion Element' })
    const [sb] = rosterContributions(data, [spellblade])
    expect(sb.element).toBeNull()
    expect(sb.anyPct).toBe(0.5)
    // Шесть камней по 35 = 210 стихии, но против барьера идёт только половина (A9).
    expect(sb.value).toBeCloseTo(210 * 0.5, 6)
    expect(contributionTo(sb, 'Dark')).toBeCloseTo(105, 6)
    expect(contributionTo(sb, 'Fire')).toBeCloseTo(105, 6)
  })

  it('чемпион даёт стихию по рангу (Element Breakpoints), Rudo — ещё и +50% стихии отряда', () => {
    const none = rosterContributions(data, [], { Rudo: 3 })
    expect(none).toHaveLength(0) // ранг 3: стихии по брейкпоинтам ещё нет (первый — на 5-м ранге, A13)
    const mid = rosterContributions(data, [], { Rudo: 5 })[0]
    expect(mid.value).toBe(15)
    // «+50% party Element bonus VS Elemental Barriers» у Rudo — награда 7-го ранга (Berserker Rampage).
    expect(mid.partyBonusPct).toBe(0)
    const top = rosterContributions(data, [], { Rudo: 7 })[0]
    expect(top.kind).toBe('champion')
    expect(top.element).toBe('Fire')
    expect(top.value).toBe(30)
    expect(top.partyBonusPct).toBe(50)
  })

  it('самый крупный камень стихии находится по данным (с тиром — «T14»)', () => {
    expect(maxElementStone(data, 'Dark')).toEqual({ name: 'Oblivion Element', value: 35, tier: 14 })
    expect(maxElementStone(data, 'Gold')).toEqual({ name: 'Platinum Element', value: 35, tier: 14 })
  })
})

describe('таблица «локация × сложность»', () => {
  /** Сильный по стихии ростер: два героя Тьмы по 210 стихии (6 камней Oblivion) — пара добирает 400. */
  const darkRoster = [plainHero(data, 'Ninja', { id: 'd1', name: 'Тёмный ниндзя' }), plainHero(data, 'Sensei', { id: 'd2', name: 'Тёмный сенсей' })]
  const strongContributions = rosterContributions(data, [...darkRoster, ...heroes], { Argon: 5 })
  const contributions = rosterContributions(data, heroes, { Argon: 5, Rudo: 7 })

  it('строка на каждый квест с барьером; стихии и величина — из QUESTS', () => {
    const withBarrier = data.quests.filter((q) => q.barrier !== null)
    const reports = barrierReports(data, data.quests, contributions)
    expect(reports).toHaveLength(withBarrier.length)
    for (const r of reports) {
      expect(r.elements.map((e) => e.element)).toEqual(r.quest.barrier?.elements)
      expect(r.elements.every((e) => e.need === r.quest.barrier?.hp)).toBe(true)
      expect(r.partySize).toBe(data.questAreas.find((a) => a.name === r.quest.area)?.partySize)
    }
  })

  it('барьерные пары достигают порога: пара из отчёта пробивает барьер по боевой логике', () => {
    const report = barrierReport(data, darkBoss, strongContributions)
    const dark = report.elements.find((e) => e.element === 'Dark')
    expect(dark?.need).toBe(400)
    const reaching = dark?.pairs.filter((p) => p.reaches) ?? []
    expect(reaching.length).toBeGreaterThan(0)
    // Каждая пара «достигает порога» ещё и в бою: без бонуса отряда barrierBroken = true.
    for (const pair of reaching.slice(0, 5)) {
      expect(barrierBroken(fightersOf([pair.a, pair.b], strongContributions), darkBoss)).toBe(true)
    }
    // Лучшая пара — не меньше любой другой и порога.
    expect(dark?.bestPair).toBeGreaterThanOrEqual(Math.max(...reaching.map((p) => p.value)))
    expect(dark?.bestPair).toBeGreaterThanOrEqual(400)
    expect(dark?.missing).toBe(0)
  })

  it('виды пар: только герои, «герой + чемпион», «герой + Spellblade»; двух чемпионов в отряде нет', () => {
    const airBoss = data.quests.find((q) => q.area === 'Howling Woods' && q.variant === 'boss' && q.difficulty === 'Extreme') as Quest
    const roster = [...heroes, plainHero(data, 'Spellblade', { id: 'sb2', name: 'Клинок' })]
    const list = rosterContributions(data, roster, { Sia: 5, Bjorn: 5 })
    const air = barrierReport(data, airBoss, list).elements.find((e) => e.element === 'Air')
    const kinds = new Set((air?.pairs ?? []).map((p) => p.kind))
    expect(kinds.has('heroes')).toBe(true)
    expect(kinds.has('hero+spellblade') || kinds.has('spellblades')).toBe(true)
    expect(kinds.has('hero+champion') || kinds.has('champion+spellblade')).toBe(true)
    // Пары из двух чемпионов не предлагаются: в отряд встаёт только один чемпион (правило 2).
    const isChampion = (name: string): boolean => list.some((c) => c.name === name && c.kind === 'champion')
    expect((air?.pairs ?? []).every((p) => !(isChampion(p.a) && isChampion(p.b)))).toBe(true)
  })

  it('сколько таких отрядов можно собрать: непересекающихся пар не больше половины вкладчиков', () => {
    expect(maxDisjointPairs([35, 35, 35, 35], 70)).toBe(2)
    expect(maxDisjointPairs([35, 35, 35, 35], 71)).toBe(0)
    expect(maxDisjointPairs([100, 40, 40, 40], 80)).toBe(2)
    const dark = barrierReport(data, darkBoss, rosterContributions(data, heroes, {})).elements.find((e) => e.element === 'Dark')
    const contributors = dark?.contributors.length ?? 0
    expect(dark?.disjointPairs).toBeLessThanOrEqual(Math.floor(contributors / 2))
  })

  it('Rudo в ростере: бонус +50% увеличивает и лучшую пару, и число отрядов', () => {
    const without = barrierReport(data, darkBoss, rosterContributions(data, heroes, {}))
    const withRudo = barrierReport(data, darkBoss, rosterContributions(data, heroes, { Rudo: 7 }))
    expect(without.bonus).toBeNull()
    expect(withRudo.bonus).toEqual({ champion: 'Rudo', pct: 50 })
    const a = without.elements.find((e) => e.element === 'Dark')
    const b = withRudo.elements.find((e) => e.element === 'Dark')
    expect(b?.bestPair).toBeGreaterThanOrEqual(a?.bestPair ?? 0)
    expect(b?.disjointPairsWithBonus).toBeGreaterThanOrEqual(a?.disjointPairsWithBonus ?? 0)
  })

  it('если стихии не хватает — видно, сколько и чем добрать', () => {
    // Ростер без героев Тьмы и без чемпионов: барьер Тьмы 400 нечем закрыть.
    const noDark = heroes.filter((h) => rosterContributions(data, [h])[0]?.element !== 'Dark')
    const dark = barrierReport(data, darkBoss, rosterContributions(data, noDark, {})).elements.find((e) => e.element === 'Dark')
    expect(dark?.missing).toBe(400)
    expect(dark?.advice.join(' ')).toContain('Не хватает 400')
    expect(dark?.advice.join(' ')).toContain('Oblivion Element')
    expect(dark?.advice.join(' ')).toContain('нет ни одного бойца')
  })
})
