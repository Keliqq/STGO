/**
 * Web Worker с тяжёлыми расчётами движка (Comlink). UI не зависает:
 * simulate() гоняет Монте-Карло в воркере, шлёт прогресс и слушает отмену.
 */
import * as Comlink from 'comlink'
import type { GameData, HeroInstance, Quest } from '../data/types.ts'
import { simulateTeam, type Fighter, type SimMetrics } from '../engine/combat.ts'
import { runOptimizer, type OptimizerInput, type OptimizerResult, type QuestWeight } from '../engine/optimizer.ts'
import { rerollAdvice, type SkillAdviceOptions, type SkillAdviceResult } from '../engine/skills.ts'

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
  /**
   * Оптимизатор экипировки (отсев → координатный спуск → финальная симуляция).
   * Прогресс — использованные симуляции из бюджета; отмена — cancel() (частичный результат).
   */
  optimize(
    data: GameData,
    input: OptimizerInput,
    onProgress?: (done: number, total: number) => void,
  ): OptimizerResult {
    cancelled = false
    return runOptimizer(data, input, {
      onProgress: onProgress ? (done, total) => void onProgress(done, total) : undefined,
      shouldCancel: () => cancelled,
    })
  },
  /** Вклад навыков в win rate и советы по перекидке (кубики). */
  skillAdvice(
    data: GameData,
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    quests: QuestWeight[],
    options?: SkillAdviceOptions,
  ): SkillAdviceResult {
    return rerollAdvice(data, heroes, champion, quests, options ?? {})
  },
  cancel(): void {
    cancelled = true
  },
}

Comlink.expose(api)
export type EngineApi = typeof api
