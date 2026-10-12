/**
 * Экспорт/импорт ВСЕГО состояния пользователя одним JSON-файлом:
 * герои, команды и отметки «проходит/не проходит». Данные только в браузере пользователя.
 * Поле `inventory` из файлов старых версий (до сессии 11) при импорте игнорируется.
 */
import { z } from 'zod'
import { loadHeroes, normalizeHero, saveHeroes, upsertByName } from './heroStore.ts'
import { RealityCheckSchema, loadRealityChecks, saveRealityChecks } from './realityChecks.ts'
import { TeamSchema, loadTeams, saveTeams } from './teams.ts'
import { idbStore, type KeyValueStore } from './storage.ts'
import { HeroInstanceSchema } from './types.ts'

export const APP_STATE_FORMAT = 'st-app/state'
/** Версия 3 добавила команды (`teams`); файлы 1 и 2 читаются — команд в них просто нет. */
export const APP_STATE_VERSION = 3

export const AppStateSchema = z.object({
  format: z.literal(APP_STATE_FORMAT),
  /** Версия 1 (до появления черновиков) и 2 (до команд) тоже принимаются: поля достроит zod. */
  version: z.union([z.literal(1), z.literal(2), z.literal(APP_STATE_VERSION)]),
  exportedAt: z.string(),
  heroes: z.array(HeroInstanceSchema),
  realityChecks: z.array(RealityCheckSchema),
  teams: z.array(TeamSchema).optional(),
})
export type AppState = z.infer<typeof AppStateSchema>

export interface AppStateCounts {
  heroes: number
  realityChecks: number
  teams: number
}

export async function exportAppStateJson(now: Date = new Date(), store: KeyValueStore = idbStore): Promise<string> {
  const { heroes } = await loadHeroes(store)
  const { checks } = await loadRealityChecks(store)
  const { teams } = await loadTeams(store)
  const state: AppState = {
    format: APP_STATE_FORMAT,
    version: APP_STATE_VERSION,
    exportedAt: now.toISOString(),
    heroes,
    realityChecks: checks,
    teams,
  }
  return JSON.stringify(state, null, 2)
}

export interface ImportAppStateResult {
  counts: AppStateCounts
  heroesAdded: number
  heroesUpdated: number
}

/** Импорт слиянием: герои — по имени+классу, отметки — по id. */
export async function importAppStateJson(text: string, store: KeyValueStore = idbStore): Promise<ImportAppStateResult | { error: string }> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { error: 'Файл не является JSON.' }
  }
  const parsed = AppStateSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue && issue.path.length > 0 ? ` (поле ${issue.path.join('.')})` : ''
    return { error: `Это не файл состояния этого приложения или другая версия формата${where}.` }
  }
  const s = parsed.data
  const { heroes: existing } = await loadHeroes(store)
  const merged = upsertByName(existing, s.heroes.map(normalizeHero))
  await saveHeroes(merged.heroes, store)
  const { checks } = await loadRealityChecks(store)
  const byId = new Set(checks.map((c) => c.id))
  const nextChecks = [...checks, ...s.realityChecks.filter((c) => !byId.has(c.id))]
  await saveRealityChecks(nextChecks, store)
  // Команды — по id: чужие не затираем, свои обновляем (файлы до v3 поля не содержат).
  const { teams: existingTeams } = await loadTeams(store)
  const incomingTeams = s.teams ?? []
  const incomingIds = new Set(incomingTeams.map((t) => t.id))
  const nextTeams = [...existingTeams.filter((t) => !incomingIds.has(t.id)), ...incomingTeams]
  if (incomingTeams.length > 0) await saveTeams(nextTeams, store)
  return {
    counts: { heroes: merged.heroes.length, realityChecks: nextChecks.length, teams: nextTeams.length },
    heroesAdded: merged.added,
    heroesUpdated: merged.updated,
  }
}
