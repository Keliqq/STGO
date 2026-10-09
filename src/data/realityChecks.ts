/**
 * «Проверка на реальности»: пользователь отмечает, проходит ли отряд квест в игре.
 * Отметки копятся в IndexedDB как будущий набор калибровки симулятора;
 * рядом показывается предсказание симуляции (win rate на момент отметки) и совпадение.
 */
import { z } from 'zod'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'

export const REALITY_CHECKS_VERSION = 1

export const RealityCheckSchema = z.object({
  id: z.string().min(1),
  questId: z.string(),
  questLabel: z.string(),
  /** Подпись отряда (имена героев + чемпион) — человекочитаемая. */
  teamLabel: z.string(),
  passed: z.boolean(),
  /** Предсказанный симуляцией win rate (0..1) на момент отметки. */
  simWinRate: z.number().min(0).max(1),
  createdAt: z.string(),
})
export type RealityCheck = z.infer<typeof RealityCheckSchema>

const StoredSchema = z.object({ version: z.literal(REALITY_CHECKS_VERSION), checks: z.array(RealityCheckSchema) })

export async function loadRealityChecks(store: KeyValueStore = idbStore): Promise<{ checks: RealityCheck[]; error: string | null }> {
  const raw = await store.get<unknown>(KEYS.realityChecks)
  if (raw === undefined) return { checks: [], error: null }
  const parsed = StoredSchema.safeParse(raw)
  if (!parsed.success) return { checks: [], error: 'Сохранённые отметки не прочитаны: формат не совпадает с текущей версией.' }
  return { checks: parsed.data.checks, error: null }
}

export async function saveRealityChecks(checks: RealityCheck[], store: KeyValueStore = idbStore): Promise<void> {
  await store.set(KEYS.realityChecks, { version: REALITY_CHECKS_VERSION, checks })
}

export async function addRealityCheck(check: RealityCheck, store: KeyValueStore = idbStore): Promise<RealityCheck[]> {
  const { checks } = await loadRealityChecks(store)
  // Одна отметка на пару «квест + отряд»: новая заменяет старую.
  const rest = checks.filter((c) => !(c.questId === check.questId && c.teamLabel === check.teamLabel))
  const next = [...rest, check]
  await saveRealityChecks(next, store)
  return next
}

export async function removeRealityCheck(id: string, store: KeyValueStore = idbStore): Promise<RealityCheck[]> {
  const { checks } = await loadRealityChecks(store)
  const next = checks.filter((c) => c.id !== id)
  await saveRealityChecks(next, store)
  return next
}

/** Совпало ли предсказание с отметкой: «проходит» ↔ win rate ≥ 50%. */
export function checkMatches(c: RealityCheck): boolean {
  return c.passed === c.simWinRate >= 0.5
}

export function agreement(checks: RealityCheck[]): { total: number; matched: number } {
  return { total: checks.length, matched: checks.filter(checkMatches).length }
}
