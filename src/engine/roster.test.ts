/**
 * Анализ ростера (сессия 28): героев на стихию (3+), архетипов на стихию (2+), «бойцов столько же,
 * сколько слотов квестов», «синих ≈ зелёных» — правила ST-Central «Foster Your Roster»
 * (https://st-central.net/foster-your-roster/). Отсюда же совет «что нанять следующим».
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { plainHero } from '../test/synthetic.ts'
import { DEFAULT_PLAN_PARTY_SIZE, maxQuestSlots, rosterReport } from './roster.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const heroes = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data).heroes

describe('анализ ростера', () => {
  it('счёт по шести стихиям и «Any»: герои, архетипы, сколько не хватает до трёх', () => {
    const report = rosterReport(data, heroes)
    expect(report.elements.map((e) => e.element)).toEqual(['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Any'])
    expect(report.elements.reduce((a, e) => a + e.heroes, 0)).toBe(heroes.length)
    const any = report.elements.find((e) => e.element === 'Any')
    // В фикстуре Spellblade нет — «Any» пустая, и она не закрывает ни одну стихию.
    expect(any?.heroes).toBe(0)
    expect(any?.missingHeroes).toBe(0)
    for (const row of report.elements.filter((e) => e.element !== 'Any')) {
      expect(row.missingHeroes).toBe(Math.max(0, 3 - row.heroes))
      expect(row.archetypes.every((g) => ['Fighter', 'Rogue', 'Spellcaster'].includes(g))).toBe(true)
    }
    expect(report.fighters + report.rogues + report.spellcasters).toBe(heroes.length)
  })

  it('героев на стихию меньше трёх → совет нанять; Spellblade за стихию не считается', () => {
    const roster = [plainHero(data, 'Mage', { id: 'm1' }), plainHero(data, 'Archmage', { id: 'm2' })]
    const report = rosterReport(data, roster)
    const fire = report.elements.find((e) => e.element === 'Fire')
    expect(fire?.heroes).toBe(2)
    expect(fire?.missingHeroes).toBe(1)
    expect(report.advice.some((a) => a.message.includes('Стихия «Fire»: героев 2 из 3'))).toBe(true)

    const withSpellblade = rosterReport(data, [...roster, plainHero(data, 'Spellblade', { id: 'sb' })])
    expect(withSpellblade.elements.find((e) => e.element === 'Fire')?.heroes).toBe(2)
    expect(withSpellblade.elements.find((e) => e.element === 'Any')?.heroes).toBe(1)
    expect(withSpellblade.fighters).toBe(0)
    expect(withSpellblade.spellcasters).toBe(3)
  })

  it('один архетип на стихию → совет про второй архетип (и честная оговорка, если его нет в игре)', () => {
    // Четыре заклинателя Огня: архетип один, а Fighter/Rogue на Огне в игре есть.
    const casters = [1, 2, 3, 4].map((i) => plainHero(data, i % 2 === 0 ? 'Mage' : 'Archmage', { id: `c${i}` }))
    const advice = rosterReport(data, casters).advice.map((a) => a.message).join(' ')
    expect(advice).toContain('Стихия «Fire»: в ростере только Spellcaster')
    expect(advice).toContain('нужен второй архетип')

    // Воздух у одиночного разбойника: в игре на этой стихии есть боец — совет называет, кого взять.
    const air = rosterReport(data, [plainHero(data, 'Thief', { id: 'air1' })])
    expect(air.elements.find((e) => e.element === 'Air')?.archetypes).toEqual(['Rogue'])
    expect(air.advice.map((a) => a.message).join(' ')).toContain('Стихия «Air»: в ростере только Rogue — нужен второй архетип (')
    // Пустой стихии совет про архетип не выдаётся — там и так «нанять героев» (иначе выходило «в ростере только »).
    expect(air.advice.map((a) => a.message).join(' ')).not.toContain('в ростере только  ')
  })

  it('бойцов столько же, сколько слотов квестов: видно и предупреждение, и выполнение', () => {
    expect(maxQuestSlots(data)).toBe(15)
    const roster = [plainHero(data, 'Knight', { id: 'k1' }), plainHero(data, 'Thief', { id: 't1' })]
    const warn = rosterReport(data, roster, { questSlots: 3 })
    expect(warn.advice.find((a) => a.message.includes('слотов квестов'))?.level).toBe('warn')
    expect(warn.advice.find((a) => a.message.includes('слотов квестов'))?.message).toContain('наймите ещё 2')

    const ok = rosterReport(data, roster, { questSlots: 1 })
    expect(ok.advice.find((a) => a.message.includes('слотов квестов'))?.level).toBe('ok')
  })

  it('синих и зелёных сравнивает, а по умолчанию берёт слоты квестов из ростера', () => {
    const roster = [
      plainHero(data, 'Thief', { id: 'r1' }),
      plainHero(data, 'Thief', { id: 'r2' }),
      plainHero(data, 'Thief', { id: 'r3' }),
      plainHero(data, 'Mage', { id: 'c1' }),
    ]
    const report = rosterReport(data, roster)
    expect(report.rogues).toBe(3)
    expect(report.spellcasters).toBe(1)
    expect(report.advice.some((a) => a.message.includes('синих меньше'))).toBe(true)
    // По умолчанию слотов столько, сколько отрядов набирается из ростера (4 героя = 1 отряд).
    expect(report.partySize).toBe(DEFAULT_PLAN_PARTY_SIZE)
    expect(report.questSlots).toBe(1)
    expect(report.parties).toBe(1)
  })

  it('у каждого совета есть источник', () => {
    for (const a of rosterReport(data, heroes).advice) {
      expect(a.source).toBe('https://st-central.net/foster-your-roster/')
    }
  })
})
