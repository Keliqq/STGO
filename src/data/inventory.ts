/**
 * Инвентарь пользователя: какие предметы/камни/духи у него есть (пул `owned` в оптимизаторе).
 * Ручной ввод или CSV; хранится только в его браузере (IndexedDB).
 * Формат строк: `type,name[,quality]`, type = item | stone | spirit (quality обязателен для item);
 * строка заголовка `type,name,quality` необязательна.
 */
import Papa from 'papaparse'
import { z } from 'zod'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'
import { QualitySchema, type GameData, type Quality } from './types.ts'

export const INVENTORY_VERSION = 1

export const InventoryItemSchema = z.object({
  name: z.string().min(1),
  quality: QualitySchema,
})
export type InventoryItem = z.infer<typeof InventoryItemSchema>

export const InventorySchema = z.object({
  version: z.literal(INVENTORY_VERSION),
  /** Предметы экипировки (Item.name + качество). */
  items: z.array(InventoryItemSchema),
  /** Камни стихии (Enchant.name). */
  stones: z.array(z.string()),
  /** Духи (Enchant.name). */
  spirits: z.array(z.string()),
})
export type Inventory = z.infer<typeof InventorySchema>

export const EMPTY_INVENTORY: Inventory = { version: INVENTORY_VERSION, items: [], stones: [], spirits: [] }

export interface LoadedInventory {
  inventory: Inventory
  error: string | null
}

export async function loadInventory(store: KeyValueStore = idbStore): Promise<LoadedInventory> {
  const raw = await store.get<unknown>(KEYS.inventory)
  if (raw === undefined) return { inventory: EMPTY_INVENTORY, error: null }
  const parsed = InventorySchema.safeParse(raw)
  if (!parsed.success) return { inventory: EMPTY_INVENTORY, error: 'Сохранённый инвентарь не прочитан: формат не совпадает с текущей версией.' }
  return { inventory: parsed.data, error: null }
}

export async function saveInventory(inventory: Inventory, store: KeyValueStore = idbStore): Promise<void> {
  await store.set(KEYS.inventory, inventory)
}

export interface InventoryParseResult {
  inventory: Inventory
  /** Имена, которых нет в игровых данных (опечатки) — предметы из импорта исключаются. */
  unknown: string[]
  errors: string[]
}

/**
 * Разбор CSV/ручного ввода. Строки вида `type,name[,quality]`; пустые пропускаются,
 * строка заголовка `type,name,...` в начале необязательна и игнорируется.
 * Имена сверяются с GameData: неизвестные собираются в `unknown` и не попадают в инвентарь.
 */
export function parseInventoryCsv(text: string, data: GameData): InventoryParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  const errors = parsed.errors.map((e) => `Строка ${(e.row ?? 0) + 1}: ${e.message}`)
  const itemNames = new Set(data.items.filter((i) => i.isEquipment).map((i) => i.name))
  const stoneNames = new Set(data.enchants.filter((e) => e.kind === 'element').map((e) => e.name))
  const spiritNames = new Set(data.enchants.filter((e) => e.kind === 'spirit').map((e) => e.name))
  const items = new Map<string, Quality>()
  const stones = new Set<string>()
  const spirits = new Set<string>()
  const unknown: string[] = []
  parsed.data.forEach((row, i) => {
    const type = (row[0] ?? '').trim().toLowerCase()
    const name = (row[1] ?? '').trim()
    if (i === 0 && type === 'type') return
    if (!name) return
    if (type === 'item') {
      if (!itemNames.has(name)) {
        unknown.push(name)
        return
      }
      const q = QualitySchema.safeParse((row[2] ?? 'Normal').trim())
      const quality = q.success ? q.data : 'Normal'
      const cur = items.get(name)
      const order = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary']
      if (!cur || order.indexOf(quality) > order.indexOf(cur)) items.set(name, quality)
    } else if (type === 'stone') {
      if (!stoneNames.has(name)) unknown.push(name)
      else stones.add(name)
    } else if (type === 'spirit') {
      if (!spiritNames.has(name)) unknown.push(name)
      else spirits.add(name)
    } else {
      errors.push(`Неизвестный тип «${row[0] ?? ''}» у «${name}» — строка пропущена (ожидается item/stone/spirit).`)
    }
  })
  return {
    inventory: {
      version: INVENTORY_VERSION,
      items: [...items.entries()].map(([name, quality]) => ({ name, quality })),
      stones: [...stones],
      spirits: [...spirits],
    },
    unknown: [...new Set(unknown)],
    errors,
  }
}

/** Слияние: прибывает то, чего не было (по имени; для предметов — качество берётся лучшее). */
export function mergeInventory(a: Inventory, b: Inventory): Inventory {
  const order = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary']
  const items = new Map(a.items.map((i) => [i.name, i.quality]))
  for (const i of b.items) {
    const cur = items.get(i.name)
    if (!cur || order.indexOf(i.quality) > order.indexOf(cur)) items.set(i.name, i.quality)
  }
  return {
    version: INVENTORY_VERSION,
    items: [...items.entries()].map(([name, quality]) => ({ name, quality })),
    stones: [...new Set([...a.stones, ...b.stones])],
    spirits: [...new Set([...a.spirits, ...b.spirits])],
  }
}
