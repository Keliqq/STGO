/**
 * Бенчмарк: 2000 прогонов одной группы (тот же код, что выполняется в Web Worker).
 * Результат фиксируется в docs/PROGRESS.md. Запуск: npx vitest run src/engine/combat.bench.test.ts --silent=false
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, simulateTeam } from './combat.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const quest: Quest = {
  id: 'bench|boss|Extreme',
  area: 'Bench',
  variant: 'boss',
  difficulty: 'Extreme',
  minPower: null,
  heroXp: null,
  monsterHp: 120000,
  monsterDmg: 900,
  monsterAoe: 450,
  barrier: { elements: ['Fire'], hp: 90 },
  defCaps: { p50: 2000, p70: 4000, p75: 12000 },
  miniBosses: [],
}

describe('бенчмарк симуляции', () => {
  it('2000 прогонов группы из 3 героев укладываются в разумное время', () => {
    const team = ['Денам', 'Джорди', 'Вестия'].map((name) => {
      const h = heroes.find((x) => x.name === name)
      if (!h) throw new Error(`нет героя ${name}`)
      return fighterFromHero(h, data)
    })
    const t0 = performance.now()
    const m = simulateTeam(team, quest, { runs: 2000, seed: 1 })
    const ms = performance.now() - t0
    console.log(`2000 прогонов: ${ms.toFixed(1)} мс (win rate ${(m.winRate * 100).toFixed(1)}%, среднее раундов ${m.avgRounds.toFixed(1)})`)
    expect(m.runs).toBe(2000)
    expect(ms).toBeLessThan(1000)
  })
})
