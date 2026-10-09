import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import type { Quest } from '../data/types.ts'
import { cubeForTier, rerollAdvice, skillContributions } from './skills.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const quest: Quest = {
  id: 't|normal|Hard',
  area: 'T',
  variant: 'boss',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 80000,
  monsterDmg: 900,
  monsterAoe: 400,
  barrier: null,
  defCaps: { p50: 1500, p70: 3000, p75: 9000 },
  miniBosses: [],
}
const quests = [{ quest, weight: 1 }]
const opts = { runs: 150, seed: 7 }

describe('рекомендации по навыкам', () => {
  it('кубик подбирается по тиру текущего навыка, Роланд — только для сверхвысоких', () => {
    expect(cubeForTier(5)).toBe(1)
    expect(cubeForTier(10)).toBe(2)
    expect(cubeForTier(12)).toBe(2)
    expect(cubeForTier(18)).toBe(3)
    expect(cubeForTier(22)).toBe(4)
    expect(cubeForTier(26)).toBe('roland')
    expect(cubeForTier(null)).toBe(1)
  })

  it('вклад посчитан для каждого навыка из hero.skills и детерминирован', () => {
    const team = heroes.slice(0, 2)
    const c1 = skillContributions(data, team, null, quests, opts)
    const c2 = skillContributions(data, team, null, quests, opts)
    expect(c1.length).toBe(team.reduce((a, h) => a + h.skills.length, 0))
    expect(c1.length).toBeGreaterThan(0)
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2))
    for (const c of c1) {
      expect(Number.isFinite(c.contribution)).toBe(true)
      expect(c.skillName.length).toBeGreaterThan(0)
    }
  })

  it('навык с реальным вкладом не помечен на перекидку, слабый — помечен с кубиком', () => {
    const team = heroes.slice(0, 2)
    const { advice } = rerollAdvice(data, team, null, quests, opts)
    expect(advice.length).toBe(c_len(team))
    for (const a of advice) {
      if (a.action === 'reroll') expect(a.cube).toBeDefined()
      expect(a.reasons.length).toBeGreaterThan(0)
    }
    const strong = advice.filter((a) => a.action === 'keep')
    const weak = advice.filter((a) => a.action === 'reroll')
    for (const s of strong) expect(s.contribution).toBeGreaterThan(0)
    for (const w of weak) expect(w.contribution).toBeLessThanOrEqual(0.005)
  })

  it('блокировка: вторая такая же иконка помечена как взаимоисключающая', () => {
    const h = heroes.find((x) => x.skills.length > 0)!
    const line = data.skills.find((s) => s.id === h.skills[0])!.line
    const sameLine = data.skills.find((s) => s.line === line && s.id !== h.skills[0])!
    const dup = { ...h, skills: [h.skills[0], sameLine.id] }
    const { advice } = rerollAdvice(data, [dup], null, quests, opts)
    const second = advice.find((a) => a.skillIndex === 1)
    expect(second).toBeDefined()
    if (second!.action === 'reroll') {
      expect(second!.reasons.join(' ')).toMatch(/иконк/i)
    }
  })
})

function c_len(team: { skills: string[] }[]): number {
  return team.reduce((a, h) => a + h.skills.length, 0)
}
