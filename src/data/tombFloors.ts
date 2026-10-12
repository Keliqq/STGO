/**
 * Этажи Гробницы Титанов (A71/A77): пользователь вводит этаж — HP, ATK врага, урон AoE, Defense cap
 * с экрана игры, барьер и отмечает действующие модификаторы этажа — и сохраняет его.
 *
 * Хранение — только в браузере пользователя (IndexedDB), ключ `tombFloors`; в снапшот и репозиторий
 * данные не попадают. Набор этажей экспортируется и импортируется JSON-файлом (как герои и команды).
 * Квест этажа для движка собирает `engine/questMods.ts → tombQuest`, пороги — из одного cap (`defCapsFromCap`).
 */
import { z } from 'zod'
import { TOMB_AREA } from '../engine/constants.ts'
import { normalizeTombFloor, tombQuestId, type TombFloor, type TombFloorInput } from '../engine/questMods.ts'
import { type KeyValueStore, KEYS } from './storage.ts'

const TombFloorSchema = z.object({
  id: z.string().min(1),
  depth: z.number().int().positive(),
  monsterHp: z.number().int().positive(),
  monsterDmg: z.number().int().nonnegative(),
  monsterAoe: z.number().int().nonnegative(),
  defenseCap: z.number().int().positive(),
  barrier: z.object({ element: z.string().min(1), hp: z.number().int().positive() }).nullable(),
  mods: z.array(z.string()),
  difficulty: z.string().min(1),
})

export const TombFloorsSchema = z.object({ floors: z.array(TombFloorSchema) })
export type TombFloorsFile = z.infer<typeof TombFloorsSchema>

/** Этажи по возрастанию глубины; одинаковые этажи (по id) схлопываются, последний выигрывает. */
function sorted(floors: TombFloor[]): TombFloor[] {
  const byId = new Map(floors.map((f) => [f.id, f]))
  return [...byId.values()].sort((a, b) => a.depth - b.depth)
}

export async function loadTombFloors(store: KeyValueStore): Promise<TombFloor[]> {
  const raw = await store.get<unknown>(KEYS.tombFloors).catch(() => undefined)
  const parsed = z.array(TombFloorSchema).safeParse(raw)
  return parsed.success ? sorted(parsed.data) : []
}

export async function saveTombFloors(floors: TombFloor[], store: KeyValueStore): Promise<void> {
  await store.set(KEYS.tombFloors, sorted(floors))
}

/**
 * Добавить или обновить этаж: ключ — номер этажа (id синтетического квеста `Tomb of Titans|tomb|N`),
 * поэтому повторный ввод того же этажа перезаписывает его, а не плодит дубликат.
 */
export async function upsertTombFloor(input: TombFloorInput, store: KeyValueStore): Promise<TombFloor[]> {
  const floor = normalizeTombFloor(input)
  const floors = await loadTombFloors(store)
  const next = sorted([...floors.filter((f) => f.id !== floor.id && f.depth !== floor.depth), floor])
  await saveTombFloors(next, store)
  return next
}

export async function removeTombFloor(depth: number, store: KeyValueStore): Promise<TombFloor[]> {
  const id = tombQuestId(depth)
  const next = sorted((await loadTombFloors(store)).filter((f) => f.id !== id && f.depth !== depth))
  await saveTombFloors(next, store)
  return next
}

/** Экспорт этажей в JSON (для файла): pretty-print, версия формата — на будущее. */
export function tombFloorsToJson(floors: TombFloor[]): string {
  return JSON.stringify({ app: 'st-app', kind: 'tombFloors', area: TOMB_AREA, version: 1, floors: sorted(floors) }, null, 2)
}

/** Разбор JSON-файла с этажами. Ошибка — человекочитаемая строка (её показываем в интерфейсе). */
export function tombFloorsFromJson(text: string): { floors: TombFloor[] } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { error: `не JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  // Принимаем и файл-обёртку, и просто массив этажей.
  const candidate = Array.isArray(parsed) ? { floors: parsed } : parsed
  const res = TombFloorsSchema.safeParse(candidate)
  if (!res.success) return { error: `не подходит по формату: ${res.error.issues[0]?.message ?? 'неизвестно'}` }
  return { floors: sorted(res.data.floors) }
}

/**
 * Слияние импортированных этажей с текущими: этаж с тем же номером заменяется импортированным
 * (импорт — источник истины для тех этажей, что в нём есть), остальные сохраняются.
 */
export function mergeTombFloors(current: TombFloor[], imported: TombFloor[]): TombFloor[] {
  const byDepth = new Map(current.map((f) => [f.depth, f]))
  for (const f of imported) byDepth.set(f.depth, f)
  return sorted([...byDepth.values()])
}
