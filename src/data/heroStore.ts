/**
 * Герои пользователя: хранение в IndexedDB и экспорт/импорт JSON.
 * Данные живут только в браузере пользователя (CLAUDE.md → «Данные пользователя»).
 */
import { z } from 'zod'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'
import { HERO_INSTANCE_VERSION, HeroInstanceSchema, type HeroInstance } from './types.ts'

const StoredHeroesSchema = z.object({
  version: z.literal(HERO_INSTANCE_VERSION),
  heroes: z.array(HeroInstanceSchema),
})

/** Файл экспорта. `format` отличает его от чужих JSON. */
export const HEROES_FILE_FORMAT = 'st-app/heroes'
const HeroesFileSchema = z.object({
  format: z.literal(HEROES_FILE_FORMAT),
  version: z.literal(HERO_INSTANCE_VERSION),
  exportedAt: z.string(),
  heroes: z.array(HeroInstanceSchema),
})

export interface LoadedHeroes {
  heroes: HeroInstance[]
  /** Запись в IndexedDB есть, но не прошла проверку (другая версия, повреждена). Сама запись не удаляется. */
  error: string | null
}

export async function loadHeroes(store: KeyValueStore = idbStore): Promise<LoadedHeroes> {
  const raw = await store.get<unknown>(KEYS.heroes)
  if (raw === undefined) return { heroes: [], error: null }
  const parsed = StoredHeroesSchema.safeParse(raw)
  if (!parsed.success) return { heroes: [], error: 'Сохранённые герои не прочитаны: формат записи не совпадает с текущей версией.' }
  return { heroes: parsed.data.heroes, error: null }
}

export async function saveHeroes(heroes: HeroInstance[], store: KeyValueStore = idbStore): Promise<void> {
  await store.set(KEYS.heroes, { version: HERO_INSTANCE_VERSION, heroes })
}

export function exportHeroesJson(heroes: HeroInstance[], now: Date = new Date()): string {
  return JSON.stringify({ format: HEROES_FILE_FORMAT, version: HERO_INSTANCE_VERSION, exportedAt: now.toISOString(), heroes }, null, 2)
}

/** Разобрать файл экспорта. Ошибка — по-русски, с первым проблемным полем. */
export function parseHeroesJson(text: string): { heroes: HeroInstance[] } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { error: 'Файл не является JSON.' }
  }
  const parsed = HeroesFileSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length > 0 ? ` (поле ${issue.path.join('.')})` : ''
    return { error: `Это не файл героев этого приложения или другая версия формата${where}.` }
  }
  return { heroes: parsed.data.heroes }
}

/** Добавить героев: с тем же id — заменить, новые — в конец. */
export function mergeHeroes(existing: HeroInstance[], incoming: HeroInstance[]): HeroInstance[] {
  const byId = new Map(incoming.map((h) => [h.id, h]))
  const out = existing.map((h) => byId.get(h.id) ?? h)
  const known = new Set(existing.map((h) => h.id))
  return [...out, ...incoming.filter((h) => !known.has(h.id))]
}

/**
 * Импорт из TitansDB: герой с тем же именем и классом обновляется (id сохраняется), остальные добавляются.
 * Так повторная загрузка того же экспорта не плодит дубли.
 */
export function upsertByName(existing: HeroInstance[], incoming: HeroInstance[]): { heroes: HeroInstance[]; added: number; updated: number } {
  const key = (h: HeroInstance) => `${h.name}\u0000${h.className}`
  const byKey = new Map(existing.map((h) => [key(h), h]))
  const replaced = new Map<string, HeroInstance>()
  const added: HeroInstance[] = []
  for (const h of incoming) {
    const old = byKey.get(key(h))
    if (old) replaced.set(old.id, { ...h, id: old.id })
    else added.push(h)
  }
  return { heroes: [...existing.map((h) => replaced.get(h.id) ?? h), ...added], added: added.length, updated: replaced.size }
}
