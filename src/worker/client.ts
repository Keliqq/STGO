/**
 * Клиент воркера движка: createEngine() → simulate/optimize/cancel/dispose.
 * Прогресс — колбэком (проксируется через Comlink), отмена — cancel() в любой момент,
 * результат придёт с partial-метриками по уже сделанным прогонам.
 * Результаты optimize() кэшируются в IndexedDB по хешу входа (данные + настройки).
 */
import * as Comlink from 'comlink'
import EngineWorker from './engine.worker?worker'
import type { EngineApi } from './engine.worker.ts'
import type { QuestCheckSuggestion } from '../engine/calibration.ts'
import type { Fighter, SimMetrics } from '../engine/combat.ts'
import type { OptimizerInput, OptimizerResult, QuestWeight } from '../engine/optimizer.ts'
import type { SkillAdviceOptions, SkillAdviceResult } from '../engine/skills.ts'
import type { SeedAdvice, StatWeightsResult } from '../engine/statWeights.ts'
import type { GameData, HeroInstance, Quest } from '../data/types.ts'
import { ENGINE_MODEL_VERSION } from '../engine/constants.ts'
import { idbStore, KEYS, type KeyValueStore } from '../data/storage.ts'

export interface Engine {
  simulate(
    fighters: Fighter[],
    quest: Quest,
    opts?: { runs?: number; seed?: number; maxRounds?: number; extreme?: boolean },
    onProgress?: (done: number, total: number) => void,
  ): Promise<SimMetrics>
  /** Вклад навыков в win rate и советы по перекидке (выполняется в воркере). */
  skillAdvice(
    data: GameData,
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    quests: QuestWeight[],
    options?: SkillAdviceOptions,
  ): Promise<SkillAdviceResult>
  /** Веса статов («+1% крита ≈ …»), угроза, барьер и совет по семенам — в воркере. */
  statWeights(
    data: GameData,
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    quest: Quest,
    runs?: number,
  ): Promise<{ weights: StatWeightsResult; seeds: (SeedAdvice & { heroIndex: number })[] }>
  /** «Что отметить»: квесты, где варианты калибровки сильнее всего расходятся по win rate (в воркере). */
  questsToCheck(
    data: GameData,
    quests: Quest[],
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    onProgress?: (done: number, total: number) => void,
  ): Promise<QuestCheckSuggestion[]>
  /**
   * Оптимизатор. Сначала кэш IndexedDB по хешу входа; промах — расчёт в воркере, затем запись в кэш.
   * Отменённые результаты не кэшируются.
   */
  optimize(
    data: GameData,
    input: OptimizerInput,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ result: OptimizerResult; fromCache: boolean }>
  cancel(): void
  dispose(): void
}

/** Хеш входа оптимизатора (FNV-1a): смена данных, настроек или модели боя → другой ключ. */
export function optimizerInputHash(data: GameData, input: OptimizerInput): string {
  const s = `${ENGINE_MODEL_VERSION}|${data.fetchedAt}|${JSON.stringify(input)}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

const CACHE_LIMIT = 50
type OptCache = Record<string, { savedAt: string; result: OptimizerResult }>

async function cacheRead(store: KeyValueStore): Promise<OptCache> {
  return (await store.get<OptCache>(KEYS.optimizeCache).catch(() => undefined)) ?? {}
}

async function cacheWrite(store: KeyValueStore, cache: OptCache, hash: string, result: OptimizerResult): Promise<void> {
  cache[hash] = { savedAt: new Date().toISOString(), result }
  const keys = Object.keys(cache)
  for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) delete cache[k]
  await store.set(KEYS.optimizeCache, cache).catch(() => undefined)
}

export function createEngine(store: KeyValueStore = idbStore): Engine {
  const worker = new EngineWorker()
  const remote = Comlink.wrap<EngineApi>(worker)
  return {
    simulate: (fighters, quest, opts, onProgress) =>
      remote.simulate(fighters, quest, opts ?? {}, onProgress ? Comlink.proxy(onProgress) : undefined),
    skillAdvice: (data, heroes, champion, quests, options) =>
      remote.skillAdvice(data, heroes, champion, quests, options),
    statWeights: (data, heroes, champion, quest, runs) => remote.statWeights(data, heroes, champion, quest, runs),
    questsToCheck: (data, quests, heroes, champion, onProgress) =>
      remote.questsToCheck(data, quests, heroes, champion, onProgress ? Comlink.proxy(onProgress) : undefined),
    optimize: async (data, input, onProgress) => {
      const hash = optimizerInputHash(data, input)
      const cache = await cacheRead(store)
      const hit = cache[hash]
      if (hit) return { result: hit.result, fromCache: true }
      const result = await remote.optimize(
        data,
        input,
        onProgress ? Comlink.proxy(onProgress) : undefined,
      )
      if (!result.cancelled) await cacheWrite(store, cache, hash, result)
      return { result, fromCache: false }
    },
    cancel: () => void remote.cancel(),
    dispose: () => worker.terminate(),
  }
}
