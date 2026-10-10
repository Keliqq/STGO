/**
 * Web Worker с тяжёлыми расчётами движка (Comlink). UI не зависает:
 * simulate() гоняет Монте-Карло в воркере, шлёт прогресс и слушает отмену.
 */
import * as Comlink from 'comlink'
import type { GameData, HeroInstance, Quest } from '../data/types.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam, type Fighter, type SimMetrics } from '../engine/combat.ts'
import { SEED_STAT_PER_SEED } from '../engine/constants.ts'
import { runOptimizer, type OptimizerInput, type OptimizerResult, type QuestWeight } from '../engine/optimizer.ts'
import { rerollAdvice, type SkillAdviceOptions, type SkillAdviceResult } from '../engine/skills.ts'
import { seedAdvice, statWeights, type SeedAdvice, type StatWeightsResult } from '../engine/statWeights.ts'

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
  async optimize(
    data: GameData,
    input: OptimizerInput,
    onProgress?: (done: number, total: number) => void,
  ): Promise<OptimizerResult> {
    cancelled = false
    return runOptimizer(data, input, {
      onProgress: onProgress ? (done, total) => void onProgress(done, total) : undefined,
      shouldCancel: () => cancelled,
      // Без уступки событийному циклу воркер не обработал бы входящий cancel() до конца расчёта.
      yieldControl: () => new Promise<void>((r) => setTimeout(r, 0)),
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
  /**
   * Веса статов отряда на выбранном квесте («почему именно эти вещи») + доля атак босса и вклад
   * в стихийный барьер + совет по семенам. Тяжёлый Монте-Карло — потому и в воркере.
   */
  statWeights(
    data: GameData,
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    quest: Quest,
    runs?: number,
  ): { weights: StatWeightsResult; seeds: (SeedAdvice & { heroIndex: number })[] } {
    cancelled = false
    const champ = champion ? data.champions.find((c) => c.name === champion.name) : undefined
    const fighters = heroes.map((h) => fighterFromHero(h, data))
    if (champ && champion) fighters.push(fighterFromChampion(champ, champion.rank, data))
    const heroesOnly = fighters.slice(0, heroes.length)
    const weights = statWeights(heroesOnly, quest, { runs })
    const seeds = heroesOnly.map((_, i) => ({ ...seedAdvice(heroesOnly, quest, SEED_STAT_PER_SEED, { runs, heroIndex: i }), heroIndex: i }))
    return { weights, seeds }
  },
  cancel(): void {
    cancelled = true
  },
}

Comlink.expose(api)
export type EngineApi = typeof api
