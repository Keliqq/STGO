import { describe, expect, it } from 'vitest'
import { addRealityCheck, agreement, checkMatches, loadRealityChecks, removeRealityCheck } from './realityChecks.ts'
import { memoryStore } from './storage.ts'

const mk = (id: string, passed: boolean, wr: number) => ({
  id,
  questId: 'q',
  questLabel: 'Лес · босс · Hard',
  teamLabel: 'Антуан',
  passed,
  simWinRate: wr,
  createdAt: '2026-10-09T00:00:00.000Z',
})

describe('отметки «проверка на реальности»', () => {
  it('совпадение: «проходит» ↔ win rate ≥ 50%', () => {
    expect(checkMatches(mk('1', true, 0.62))).toBe(true)
    expect(checkMatches(mk('2', true, 0.4))).toBe(false)
    expect(checkMatches(mk('3', false, 0.1))).toBe(true)
    expect(agreement([mk('1', true, 0.62), mk('2', true, 0.4)]).matched).toBe(1)
  })

  it('add заменяет отметку той же пары «квест + отряд», remove удаляет', async () => {
    const store = memoryStore()
    await addRealityCheck(mk('1', true, 0.6), store)
    let checks = await addRealityCheck(mk('2', false, 0.6), store)
    expect(checks).toHaveLength(1)
    expect(checks[0].id).toBe('2')
    checks = await addRealityCheck({ ...mk('3', true, 0.2), questId: 'other' }, store)
    expect(checks).toHaveLength(2)
    checks = await removeRealityCheck('3', store)
    expect(checks).toHaveLength(1)
    const r = await loadRealityChecks(store)
    expect(r.checks.map((c) => c.id)).toEqual(['2'])
  })
})
