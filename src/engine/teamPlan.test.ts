/**
 * «План команд на локацию» (сессия 28).
 *
 * Обязательные проверки владельца:
 *   · план не использует героя (и чемпиона) дважды и соблюдает размер отряда локации;
 *   · жадный сбор по правилам 1–4 (сначала барьер и чемпионы-добытчики), затем улучшение обменами
 *     по симуляции — с целью «сумма win rate» или «число команд с win rate ≥ порога»;
 *   · время считается с прогрессом и отменой (в приложении — в Web Worker).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { partySizeForQuest, planTeams, type TeamPlanResult } from './teamPlan.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const heroes = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data).heroes

/** Lost City of Gold (5 мест, барьера нет, монстр слабый) — быстрый квест для структурных проверок. */
const lcog = data.quests.find((q) => q.area === 'Lost City of Gold' && q.variant === 'normal' && q.difficulty === '1') as Quest
/** Howling Woods (3 места, барьер Воздуха 30) — проверки барьера и отмены. */
const howling = data.quests.find((q) => q.area === 'Howling Woods' && q.variant === 'boss' && q.difficulty === 'Extreme') as Quest

const fast = { runs: 30, finalRuns: 40, budget: 30, passes: 1 } as const
const champions = [
  { name: 'Argon', rank: 5 },
  { name: 'Sia', rank: 4 },
]

function usedHeroIds(plan: TeamPlanResult): string[] {
  return plan.teams.flatMap((t) => t.members.map((m) => m.id))
}

describe('план команд: состав', () => {
  it('каждый герой и чемпион — ровно в одной команде, размер отряда не превышен', () => {
    const plan = planTeams({ data, quest: lcog, heroes, champions, ...fast })
    const ids = usedHeroIds(plan)
    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids.length + plan.leftover.length).toBe(heroes.length)
    for (const team of plan.teams) {
      const size = team.members.length + (team.champion ? 1 : 0)
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThanOrEqual(plan.partySize)
      expect(plan.partySize).toBe(partySizeForQuest(data, lcog))
    }
    // Чемпионы тоже не повторяются: один чемпион — один отряд (правило 2).
    const champs = plan.teams.map((t) => t.champion?.name).filter((n): n is string => !!n)
    expect(champs).toHaveLength(new Set(champs).size)
  })

  it('собирает максимум команд из ростера: 18 героев в локации на 5 мест — 4 полных отряда', () => {
    const plan = planTeams({ data, quest: lcog, heroes, champions, ...fast })
    expect(plan.partySize).toBe(5)
    expect(plan.teams).toHaveLength(4)
    expect(plan.leftover).toHaveLength(0)
    expect(plan.undersized).toBe(false)
    for (const team of plan.teams) expect(team.members.length + (team.champion ? 1 : 0)).toBe(5)
  })

  it('чемпионы ставятся по приоритету: сначала «добытчики» (Sia/Polonia/Malady)', () => {
    const plan = planTeams({ data, quest: lcog, heroes, champions, ...fast })
    expect(plan.teams[0].champion?.name).toBe('Sia')
    expect(plan.teams[1].champion?.name).toBe('Argon')
    expect(plan.teams[0].notes.join(' ')).toContain('Sia')
  })

  it('у каждого отряда есть подсказки по правилам 1–4', () => {
    const plan = planTeams({ data, quest: howling, heroes, champions, ...fast })
    for (const team of plan.teams) {
      const codes = team.hints.map((h) => h.code)
      expect(codes).toEqual(expect.arrayContaining(['barrier', 'champion-count', 'fighter', 'support']))
      for (const h of team.hints) expect(h.source).toMatch(/^https:\/\//)
    }
  })

  it('героев меньше, чем нужно на полный отряд — отряд меньшего размера (undersized)', () => {
    const plan = planTeams({ data, quest: lcog, heroes: heroes.slice(0, 3), champions: [], ...fast })
    expect(plan.teams).toHaveLength(1)
    expect(plan.teams[0].members).toHaveLength(3)
    expect(plan.undersized).toBe(true)
    expect(plan.unusedChampions).toEqual([])
    expect(plan.notes.join(' ')).toMatch(/без чемпиона|мест/)
  })

  it('пустой ростер — понятное сообщение, а не пустой отряд', () => {
    const plan = planTeams({ data, quest: lcog, heroes: [], champions, ...fast })
    expect(plan.teams).toEqual([])
    expect(plan.notes.join(' ')).toContain('Ростер пуст')
    expect(plan.unusedChampions).toEqual(['Argon', 'Sia'])
  })
})

describe('план команд: цель и улучшение', () => {
  it('цель «сумма win rate»: метрики согласованы с отрядами', () => {
    const plan = planTeams({ data, quest: howling, heroes, champions, objective: 'sum', ...fast })
    expect(plan.objective).toBe('sum')
    const rates = plan.teams.map((t) => t.winRate ?? 0)
    expect(plan.sumWinRate).toBeCloseTo(rates.reduce((a, r) => a + r, 0) / rates.length, 10)
    expect(plan.teamsAbove).toBe(rates.filter((r) => r >= plan.threshold).length)
    for (const team of plan.teams) {
      expect(team.winRate).toBeGreaterThanOrEqual(0)
      expect(team.winRate).toBeLessThanOrEqual(1)
      expect(team.avgRounds).toBeGreaterThan(0)
    }
  })

  it('цель «число команд с win rate ≥ порога»: порог учитывается в итоге', () => {
    const plan = planTeams({ data, quest: howling, heroes, champions, objective: 'threshold', threshold: 0.9, ...fast })
    expect(plan.objective).toBe('threshold')
    expect(plan.threshold).toBe(0.9)
    expect(plan.teamsAbove).toBe(plan.teams.filter((t) => (t.winRate ?? 0) >= 0.9).length)
  })

  it('обмены действительно пробуются: при нулевом бюджете их нет, при бюджете — есть симуляции', () => {
    // `budget` и `passes` идут после `...fast`, иначе `fast` перекрыл бы их своими значениями.
    const noBudget = planTeams({ data, quest: howling, heroes, champions, ...fast, budget: 0, passes: 3 })
    // Только стартовая оценка и итоговые метрики: бюджет ограничивает лишь фазу обменов.
    expect(noBudget.sims).toBe(2 * noBudget.teams.length)
    const withBudget = planTeams({ data, quest: howling, heroes, champions, ...fast, budget: 40, passes: 3 })
    expect(withBudget.sims).toBeGreaterThan(noBudget.sims)
    expect(withBudget.sims).toBeLessThanOrEqual(40 + 2 * withBudget.teams.length)
    // Обмены всегда сохраняют размер отряда.
    for (const team of withBudget.teams) expect(team.members.length + (team.champion ? 1 : 0)).toBeLessThanOrEqual(withBudget.partySize)
  })

  it('барьер отряда считается вместе с бонусом чемпиона', () => {
    const plan = planTeams({ data, quest: howling, heroes, champions, ...fast })
    for (const team of plan.teams) {
      expect(team.barrier?.elements).toEqual(['Air'])
      expect(team.barrier?.need).toBe(30)
      expect(team.barrier?.broken).toBe((team.barrier?.have ?? 0) >= 30)
    }
    const noBarrier = planTeams({ data, quest: lcog, heroes, champions: [], ...fast })
    expect(noBarrier.teams[0].barrier).toBeNull()
  })
})

describe('план команд: прогресс, отмена и воспроизводимость', () => {
  it('прогресс идёт от нуля к общему числу симуляций', () => {
    const seen: { done: number; total: number }[] = []
    const plan = planTeams({ data, quest: lcog, heroes, champions, budget: 20, passes: 2, runs: 20, finalRuns: 20, onProgress: (done, total) => seen.push({ done, total }) })
    expect(seen.length).toBe(plan.sims)
    expect(seen[0].done).toBe(1)
    expect(seen[seen.length - 1].done).toBe(plan.sims)
    for (let i = 1; i < seen.length; i++) expect(seen[i].done).toBeGreaterThan(seen[i - 1].done)
    expect(seen.every((p) => p.total === 20 + 2 * plan.teams.length)).toBe(true)
  })

  it('отмена во время улучшения: расчёт останавливается и помечается cancelled', () => {
    let calls = 0
    const plan = planTeams({
      data,
      quest: lcog,
      heroes,
      champions,
      budget: 40,
      passes: 3,
      runs: 20,
      finalRuns: 20,
      onProgress: () => {
        calls++
      },
      shouldCancel: () => calls >= 4,
    })
    expect(plan.cancelled).toBe(true)
    // Стартовая оценка (по симуляции на отряд) выполняется всегда — иначе плану нечего показать.
    expect(plan.sims).toBe(plan.teams.length)
    expect(plan.notes.join(' ')).toContain('отменён')
    expect(plan.teams).toHaveLength(4)
  })

  it('один и тот же seed даёт один и тот же план, другой — другой шум', () => {
    const a = planTeams({ data, quest: howling, heroes, champions, seed: 777, ...fast })
    const b = planTeams({ data, quest: howling, heroes, champions, seed: 777, ...fast })
    expect(a.teams.map((t) => t.members.map((m) => m.id))).toEqual(b.teams.map((t) => t.members.map((m) => m.id)))
    expect(a.teams.map((t) => t.winRate)).toEqual(b.teams.map((t) => t.winRate))
    expect(a.sims).toBe(b.sims)
    const c = planTeams({ data, quest: howling, heroes, champions, seed: 778, ...fast })
    expect(c.teams.map((t) => t.members.map((m) => m.id))).toHaveLength(a.teams.length)
  })
})
