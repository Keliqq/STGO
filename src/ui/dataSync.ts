/** Запуск синхронизации данных при старте приложения и настройки актуальности. */
import { useSyncExternalStore } from 'react'
import { idbStore, KEYS } from '#/data/storage.ts'
import {
  type DataStatus,
  ensureFresh,
  getCurrentData,
  getStatus,
  loadGameData,
  subscribeStatus,
  syncBreakpoints,
} from '#/data/sync.ts'
import type { GameData } from '#/data/types.ts'

export interface Settings {
  /** Через сколько часов перечитывать таблицу. */
  ttlHours: number
}
export const DEFAULT_SETTINGS: Settings = { ttlHours: 24 }

export async function loadSettings(): Promise<Settings> {
  const s = await idbStore.get<Partial<Settings>>(KEYS.settings).catch(() => undefined)
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function saveSettings(s: Settings): Promise<void> {
  await idbStore.set(KEYS.settings, s)
}

let started = false

/** Кэш/снапшот сразу, затем фоном — проверка свежести таблицы и пороги защиты. */
export function startDataSync(): void {
  if (started) return
  started = true
  void (async () => {
    await loadGameData()
    const { ttlHours } = await loadSettings()
    void ensureFresh(ttlHours)
    void syncBreakpoints()
  })().catch((e: unknown) => console.error('Загрузка данных:', e))
}

export function refreshNow(): void {
  void ensureFresh(0, { force: true })
  void syncBreakpoints({ force: true })
}

export function useDataStatus(): DataStatus {
  return useSyncExternalStore(subscribeStatus, getStatus)
}

/** Текущие GameData (перерисовка при смене статуса — данные меняются только вместе с ним). */
export function useGameData(): GameData | null {
  useDataStatus()
  return getCurrentData()
}
