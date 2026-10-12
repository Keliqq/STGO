/**
 * «Defense cap с экрана игры» — пороги защиты квестов, которых нет ни в таблице, ни на stcentral-hub
 * (Lost City of Gold и всё, что не совпало по локации/сложности, — A10). Игра показывает один cap
 * (порог 75%), остальные пороги кратны ему: 50% = cap/6, 70% = cap/3 (`formulas.ts → defCapsFromCap`,
 * A71) — тот же формат, что «X · 2X · 6X» у stcentral-hub.
 *
 * Значение вводит пользователь на странице «Данные»; хранится только в его браузере (IndexedDB),
 * в снапшот и репозиторий не попадает. Пороги самого stcentral-hub (загружаемые в рантайме) важнее:
 * введённый cap подставляется только тем квестам, у которых порогов ещё нет.
 */
import { z } from 'zod'
import { defCapsFromCap } from '../engine/formulas.ts'
import { type KeyValueStore, KEYS } from './storage.ts'
import type { Quest } from './types.ts'

/** Ключ — `Quest.id` (`Howling Woods|normal|Easy`), значение — cap с экрана игры (>0). */
export const QuestCapsSchema = z.record(z.string().min(1), z.number().int().positive())
export type QuestCaps = z.infer<typeof QuestCapsSchema>

export async function loadQuestCaps(store: KeyValueStore): Promise<QuestCaps> {
  const raw = await store.get<unknown>(KEYS.questCaps).catch(() => undefined)
  const parsed = QuestCapsSchema.safeParse(raw)
  return parsed.success ? parsed.data : {}
}

export async function saveQuestCaps(caps: QuestCaps, store: KeyValueStore): Promise<void> {
  await store.set(KEYS.questCaps, caps)
}

/**
 * Подставить пороги из введённых cap'ов: только квестам без `defCaps` (то есть без данных хаба).
 * Возвращает новые объекты квестов — исходный GameData не меняется.
 */
export function applyUserQuestCaps(quests: Quest[], caps: QuestCaps): { quests: Quest[]; matched: number } {
  let matched = 0
  const out = quests.map((q) => {
    if (q.defCaps) return q
    const cap = caps[q.id]
    if (!cap) return q
    matched++
    return { ...q, defCaps: defCapsFromCap(cap) }
  })
  return { quests: out, matched }
}
