/**
 * Web Worker с тяжёлыми расчётами движка (Comlink). UI не зависает:
 * simulate() гоняет Монте-Карло в воркере, шлёт прогресс и слушает отмену.
 */
import * as Comlink from 'comlink'
import type { Quest } from '../data/types.ts'
import { simulateTeam, type Fighter, type SimMetrics } from '../engine/combat.ts'

let cancelled = false

const api = {
  /**
   * N прогонов симуляции. onProgress — колбэк основной стороны (Comlink.proxy).
   * Отмена — cancel(): цикл симуляции останавливается на границе прогона.
   */
  simulate(
    fighters: Fighter[],
    quest: Quest,
    opts: { runs?: number; seed?: number; maxRounds?: number; extreme?: boolean },
    onProgress?: (done: number, total: number) => void,
  ): SimMetrics {
    cancelled = false
    return simulateTeam(fighters, quest, {
      ...opts,
      onProgress: onProgress ? (done, total) => void onProgress(done, total) : undefined,
      shouldCancel: () => cancelled,
    })
  },
  cancel(): void {
    cancelled = true
  },
}

Comlink.expose(api)
export type EngineApi = typeof api
