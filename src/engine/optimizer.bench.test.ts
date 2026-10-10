/**
 * Бенчмарк полного прогона оптимизатора (тот же код, что в Web Worker): 3 героя + чемпион,
 * пул all T20 Legendary, квест-босс с барьером. Результат фиксируется в docs/PROGRESS.md.
 * Запуск: npx vitest run src/engine/optimizer.bench.test.ts --silent=false
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest, Quality } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { runOptimizer, type OptimizerInput } from './optimizer.ts'

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

describe('бенчмарк оптимизатора', () => {
  it('полный прогон (3 героя + Argon, all T20 Legendary, босс с барьером) ≤ 10 с', { timeout: 60000 }, async () => {
    const team = ['Денам', 'Джорди', 'Вестия'].map((name) => {
      const h = heroes.find((x) => x.name === name)
      if (!h) throw new Error(`нет героя ${name}`)
      return h
    })
    const input: OptimizerInput = {
      heroes: team,
      champion: { name: 'Argon', rank: 5 },
      mode: 'quest',
      quests: [{ quest, weight: 1 }],
      constraints: { maxItemTier: 20, maxQuality: 'Legendary' as Quality, maxStoneTier: 5, spirits: null },
    }
    const t0 = performance.now()
    const res = await runOptimizer(data, input)
    const ms = performance.now() - t0
    console.log(`Прогон оптимизатора: ${ms.toFixed(0)} мс, ${res.simsUsed} симуляций, win rate ${(res.winRate * 100).toFixed(1)}%`)
    expect(res.cancelled).toBe(false)
    expect(ms).toBeLessThanOrEqual(10000)
  })
})
