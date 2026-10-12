import { describe, expect, it } from 'vitest'
import {
  addRealityCheck,
  agreement,
  checkMatches,
  loadRealityChecks,
  modelAccuracy,
  deathsKnown,
  REALITY_CHECKS_VERSION,
  removeRealityCheck,
  saveRealityChecks,
  setDeadHeroes,
  teamMembers,
} from './realityChecks.ts'
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

  it('отметки формата v1 (без modelVersion) читаются — калибровка не теряется', async () => {
    const store = memoryStore()
    await store.set('realityChecks', { version: 1, checks: [mk('1', true, 0.6)] })
    const r = await loadRealityChecks(store)
    expect(r.error).toBeNull()
    expect(r.checks.map((c) => c.id)).toEqual(['1'])
    // Неизвестная версия — понятная ошибка, а не падение.
    await store.set('realityChecks', { version: 99, checks: [] })
    expect((await loadRealityChecks(store)).error).toBeTruthy()
  })

  it('v3: погибшие герои — у старых отметок (v1/v2) «неизвестно», [] — «не погиб никто»', async () => {
    const store = memoryStore()
    // В v2 поля не было: даже если в записи что-то лежит, это не «никто не погиб», а неизвестно.
    await store.set('realityChecks', { version: 2, checks: [{ ...mk('1', false, 0.3), modelVersion: 15 }, { ...mk('2', true, 0.8), deadHeroes: [] }] })
    const r = await loadRealityChecks(store)
    expect(r.error).toBeNull()
    expect(r.checks.map(deathsKnown)).toEqual([false, false])
    expect(r.checks[0].modelVersion).toBe(15)

    expect(REALITY_CHECKS_VERSION).toBe(3)
    await saveRealityChecks([{ ...mk('3', true, 0.7), deadHeroes: [] }, { ...mk('4', false, 0.4), deadHeroes: ['Антуан'] }], store)
    const v3 = await loadRealityChecks(store)
    expect(v3.checks.map((c) => c.deadHeroes)).toEqual([[], ['Антуан']])
  })

  it('setDeadHeroes дозаполняет старую отметку и умеет вернуть «неизвестно»', async () => {
    const store = memoryStore()
    await saveRealityChecks([mk('1', false, 0.3), mk('2', true, 0.9)], store)
    let checks = await setDeadHeroes('1', ['Антуан'], store)
    expect(checks.find((c) => c.id === '1')?.deadHeroes).toEqual(['Антуан'])
    expect(deathsKnown(checks.find((c) => c.id === '2')!)).toBe(false)
    checks = await setDeadHeroes('1', undefined, store)
    expect(deathsKnown(checks[0])).toBe(false)
    expect('deadHeroes' in checks[0]).toBe(false)
  })

  it('teamMembers: участники по подписи отряда', () => {
    expect(teamMembers('Антуан + Беовульф + Argon')).toEqual(['Антуан', 'Беовульф', 'Argon'])
    expect(teamMembers('')).toEqual([])
  })

  it('сводка «Точность модели»: N боёв, доля совпадений, дата последней отметки, устаревшие отметки', () => {
    const old = { ...mk('1', true, 0.62), createdAt: '2026-10-01T10:00:00.000Z' }
    const fresh = { ...mk('2', false, 0.2), createdAt: '2026-10-05T10:00:00.000Z', modelVersion: 13 }
    expect(REALITY_CHECKS_VERSION).toBeGreaterThanOrEqual(2)
    const acc = modelAccuracy([old, fresh], 13)
    expect(acc).toMatchObject({ total: 2, matched: 2, agreement: 1, calibratedAt: '2026-10-05T10:00:00.000Z', stale: 1 })
    expect(modelAccuracy([], 13)).toMatchObject({ total: 0, matched: 0, agreement: 0, calibratedAt: null, stale: 0 })
  })
})
