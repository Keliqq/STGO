/**
 * Клиент воркера движка: createEngine() → simulate/cancel/dispose.
 * Прогресс — колбэком (проксируется через Comlink), отмена — cancel() в любой момент,
 * результат придёт с partial-метриками по уже сделанным прогонам.
 */
import * as Comlink from 'comlink'
import EngineWorker from './engine.worker?worker'
import type { EngineApi } from './engine.worker.ts'
import type { Fighter, SimMetrics } from '../engine/combat.ts'
import type { Quest } from '../data/types.ts'

export interface Engine {
  simulate(
    fighters: Fighter[],
    quest: Quest,
    opts?: { runs?: number; seed?: number; maxRounds?: number; extreme?: boolean },
    onProgress?: (done: number, total: number) => void,
  ): Promise<SimMetrics>
  cancel(): void
  dispose(): void
}

export function createEngine(): Engine {
  const worker = new EngineWorker()
  const remote = Comlink.wrap<EngineApi>(worker)
  return {
    simulate: (fighters, quest, opts, onProgress) =>
      remote.simulate(fighters, quest, opts ?? {}, onProgress ? Comlink.proxy(onProgress) : undefined),
    cancel: () => void remote.cancel(),
    dispose: () => worker.terminate(),
  }
}
