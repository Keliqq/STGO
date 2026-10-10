/** Ключ-значение поверх IndexedDB (idb-keyval). В тестах подменяется на memoryStore(). */
import { createStore, del, get, set, type UseStore } from 'idb-keyval'

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  /** Одна запись = одна транзакция IndexedDB, т. е. замена значения атомарна. */
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

let idb: UseStore | undefined
function idbHandle(): UseStore {
  idb ??= createStore('st-app', 'kv')
  return idb
}

export const idbStore: KeyValueStore = {
  get: <T>(key: string) => get<T>(key, idbHandle()),
  set: (key, value) => set(key, value, idbHandle()),
  del: (key) => del(key, idbHandle()),
}

export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>(Object.entries(initial))
  // structuredClone — как в IndexedDB: наружу не утекают ссылки на сохранённые объекты
  return {
    get: async <T>(key: string) => (m.has(key) ? (structuredClone(m.get(key)) as T) : undefined),
    set: async (key, value) => {
      m.set(key, structuredClone(value))
    },
    del: async (key) => {
      m.delete(key)
    },
    dump: () => Object.fromEntries(m),
  }
}

/** Ключи в хранилище. */
export const KEYS = {
  gameData: 'gameData',
  breakpoints: 'breakpoints',
  settings: 'settings',
  heroes: 'heroes',
  // 'inventory' — инвентарь до сессии 11; запись в старых базах остаётся и игнорируется.
  realityChecks: 'realityChecks',
  optimizeCache: 'optimizeCache',
  optimizeSettings: 'optimizeSettings',
} as const
