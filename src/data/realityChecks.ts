/**
 * «Проверка на реальности»: пользователь отмечает, проходит ли отряд квест в игре.
 * Отметки копятся в IndexedDB как набор калибровки симулятора;
 * рядом показывается предсказание симуляции (win rate на момент отметки) и совпадение.
 *
 * Сводка по этим отметкам (N боёв, доля совпадений, дата калибровки) показывается на «Данных»,
 * а полный разбор — в `src/engine/calibration.ts` и отчёте `npm run calibrate`.
 */
import { z } from 'zod'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'

/**
 * Версия формата сохранённых отметок. v2: добавлено поле `modelVersion` (версия модели боя,
 * на которой считалось предсказание) — отметки 0.x считаются сделанными «до версионирования».
 */
export const REALITY_CHECKS_VERSION = 2

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
  /**
   * `ENGINE_MODEL_VERSION` на момент отметки (появилось в v2 формата).
   * Не у каждой старой отметки есть: отсутствие = «до версионирования» (0).
   */
  modelVersion: z.number().int().nonnegative().optional(),
})
export type RealityCheck = z.infer<typeof RealityCheckSchema>

const StoredSchema = z.object({ version: z.literal(REALITY_CHECKS_VERSION), checks: z.array(RealityCheckSchema) })

/** Отметки формата v1 (без `modelVersion`) — читаем, чтобы не терять накопленную калибровку. */
const StoredSchemaV1 = z.object({ version: z.literal(1), checks: z.array(RealityCheckSchema) })

export async function loadRealityChecks(store: KeyValueStore = idbStore): Promise<{ checks: RealityCheck[]; error: string | null }> {
  const raw = await store.get<unknown>(KEYS.realityChecks)
  if (raw === undefined) return { checks: [], error: null }
  const parsed = StoredSchema.safeParse(raw)
  if (parsed.success) return { checks: parsed.data.checks, error: null }
  const v1 = StoredSchemaV1.safeParse(raw)
  if (v1.success) return { checks: v1.data.checks, error: null }
  return { checks: [], error: 'Сохранённые отметки не прочитаны: формат не совпадает с текущей версией.' }
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

/** Сводка для блока «Точность модели» на «Данных»: N боёв, доля совпадений, дата калибровки. */
export interface ModelAccuracy {
  /** Сколько боёв отмечено (отметок). */
  total: number
  matched: number
  /** Доля совпадений 0..1 (0 при отсутствии отметок). */
  agreement: number
  /** Дата последней отметки — она же «дата калибровки» (ISO) или null. */
  calibratedAt: string | null
  /** Сколько отметок сделано до текущей версии модели боя (их стоит перепроверить). */
  stale: number
}

/** Модель боя, на которой считалось предсказание отметки (0 — до версионирования). */
export function checkModelVersion(c: RealityCheck): number {
  return c.modelVersion ?? 0
}

export function modelAccuracy(checks: RealityCheck[], currentModelVersion: number): ModelAccuracy {
  const aggr = agreement(checks)
  let calibratedAt: string | null = null
  for (const c of checks) {
    if (!c.createdAt) continue
    if (calibratedAt === null || Date.parse(c.createdAt) > Date.parse(calibratedAt)) calibratedAt = c.createdAt
  }
  return {
    total: aggr.total,
    matched: aggr.matched,
    agreement: aggr.total > 0 ? aggr.matched / aggr.total : 0,
    calibratedAt,
    stale: checks.filter((c) => checkModelVersion(c) < currentModelVersion).length,
  }
}
