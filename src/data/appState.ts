/**
 * Экспорт/импорт ВСЕГО состояния пользователя одним JSON-файлом:
 * герои, инвентарь, отметки «проходит/не проходит». Данные только в браузере пользователя.
 */
import { z } from 'zod'
import { loadHeroes, saveHeroes, upsertByName } from './heroStore.ts'
import { InventorySchema, EMPTY_INVENTORY, loadInventory, mergeInventory, saveInventory } from './inventory.ts'
import { RealityCheckSchema, loadRealityChecks, saveRealityChecks } from './realityChecks.ts'
import { HeroInstanceSchema } from './types.ts'

export const APP_STATE_FORMAT = 'st-app/state'
export const APP_STATE_VERSION = 1

export const AppStateSchema = z.object({
  format: z.literal(APP_STATE_FORMAT),
  version: z.literal(APP_STATE_VERSION),
  exportedAt: z.string(),
  heroes: z.array(HeroInstanceSchema),
  inventory: InventorySchema,
  realityChecks: z.array(RealityCheckSchema),
})
export type AppState = z.infer<typeof AppStateSchema>

export interface AppStateCounts {
  heroes: number
  inventoryItems: number
  inventoryStones: number
  inventorySpirits: number
  realityChecks: number
}

export async function exportAppStateJson(now: Date = new Date()): Promise<string> {
  const { heroes } = await loadHeroes()
  const { inventory } = await loadInventory()
  const { checks } = await loadRealityChecks()
  const state: AppState = {
    format: APP_STATE_FORMAT,
    version: APP_STATE_VERSION,
    exportedAt: now.toISOString(),
    heroes,
    inventory,
    realityChecks: checks,
  }
  return JSON.stringify(state, null, 2)
}

export interface ImportAppStateResult {
  counts: AppStateCounts
  heroesAdded: number
  heroesUpdated: number
}

/** Импорт слиянием: герои — по имени+классу, инвентарь — объединение, отметки — по id. */
export async function importAppStateJson(text: string): Promise<ImportAppStateResult | { error: string }> {
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
  const { heroes: existing } = await loadHeroes()
  const merged = upsertByName(existing, s.heroes)
  await saveHeroes(merged.heroes)
  const { inventory: curInv } = await loadInventory()
  const inv = mergeInventory(curInv ?? EMPTY_INVENTORY, s.inventory)
  await saveInventory(inv)
  const { checks } = await loadRealityChecks()
  const byId = new Set(checks.map((c) => c.id))
  const nextChecks = [...checks, ...s.realityChecks.filter((c) => !byId.has(c.id))]
  await saveRealityChecks(nextChecks)
  return {
    counts: {
      heroes: merged.heroes.length,
      inventoryItems: inv.items.length,
      inventoryStones: inv.stones.length,
      inventorySpirits: inv.spirits.length,
      realityChecks: nextChecks.length,
    },
    heroesAdded: merged.added,
    heroesUpdated: merged.updated,
  }
}
