/**
 * Проверка, что быстрая аналитическая оценка quickScore согласована с Монте-Карло.
 * Коэффициент корреляции выводится в лог: npx vitest run src/engine/score.test.ts --silent=false
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { fighterFromHero, mulberry32, simulateTeam, type Fighter } from './combat.ts'
import { pearson, quickScore, spearman } from './score.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'rnd|normal|Hard',
  area: 'T',
  variant: 'normal',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 50000,
  monsterDmg: 500,
  monsterAoe: 250,
  barrier: null,
  defCaps: { p50: 1500, p70: 3000, p75: 9000 },
  miniBosses: [],
  ...over,
})

describe('quickScore ↔ симуляция', () => {
  it('корреляция с win rate на 60 случайных отрядах: Спирмен > 0,8', () => {
    const rng = mulberry32(2026)
    const scores: number[] = []
    const winRates: number[] = []
    for (let i = 0; i < 60; i++) {
      const team: Fighter[] = []
      for (let k = 0; k < 3; k++) {
        const h = heroes[Math.floor(rng() * heroes.length)]
        const f = fighterFromHero(h, data)
        f.atk = Math.round(f.atk * (0.5 + rng() * 1.5))
        f.def = Math.round(f.def * (0.2 + rng() * 2.8))
        f.hp = Math.round(f.hp * (0.5 + rng() * 1.5))
        f.eva = rng() * 0.5
        f.crit = rng() * 0.4
        team.push(f)
      }
      const q = quest({
        variant: rng() < 0.5 ? 'boss' : 'normal',
        monsterHp: Math.round(30000 + rng() * 370000),
        monsterDmg: Math.round(600 + rng() * 1900),
        monsterAoe: Math.round(300 + rng() * 900),
      })
      const m = simulateTeam(team, q, { runs: 400, seed: 1000 + i })
      // Отношение потенциала урона к HP монстра: >1 — «в среднем убивает раньше, чем его».
      scores.push(quickScore(team, q) / q.monsterHp)
      winRates.push(m.winRate)
    }
    const r = pearson(scores, winRates)
    const rho = spearman(scores, winRates)
    console.log(`quickScore ↔ win rate: Пирсон r = ${r.toFixed(3)}, Спирмен ρ = ${rho.toFixed(3)} (60 отрядов × 400 прогонов)`)
    expect(rho).toBeGreaterThan(0.8)
  })

  it('усиление отряда не уменьшает оценку', () => {
    const base = [fighterFromHero(heroes[0], data), fighterFromHero(heroes[1], data)]
    const q = quest()
    const weak = quickScore(base, q)
    const buffed = base.map((f) => ({ ...f, atk: f.atk * 2, hp: f.hp * 2 }))
    expect(quickScore(buffed, q)).toBeGreaterThanOrEqual(weak)
  })
})
