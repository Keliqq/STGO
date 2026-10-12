/**
 * Web Worker с тяжёлыми расчётами движка (Comlink). UI не зависает:
 * simulate() гоняет Монте-Карло в воркере, шлёт прогресс и слушает отмену.
 */
import * as Comlink from 'comlink'
import type { GameData, HeroInstance, Quest } from '../data/types.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam, type Fighter, type PowerBoosterId, type SimMetrics } from '../engine/combat.ts'
import { questsToCheck, type QuestCheckSuggestion } from '../engine/calibration.ts'
import { SEED_STAT_PER_SEED } from '../engine/constants.ts'
import { runOptimizer, type OptimizerInput, type OptimizerResult, type QuestWeight } from '../engine/optimizer.ts'
import { rerollAdvice, type SkillAdviceOptions, type SkillAdviceResult } from '../engine/skills.ts'
import { seedAdvice, statWeights, type SeedAdvice, type StatWeightsResult } from '../engine/statWeights.ts'
import { planTeams, type TeamPlanOptions, type TeamPlanResult } from '../engine/teamPlan.ts'
import { runTeam, type TeamRunMember, type TeamRunResult } from '../engine/teamRunner.ts'

/**
 * Вход плана команд для воркера: всё, кроме `data` (её шлёт вызывающий) и колбэков отмены/прогресса,
 * которые подставляет сам воркер.
 */
export type WorkerPlanInput = Omit<TeamPlanOptions, 'data' | 'onProgress' | 'shouldCancel' | 'simulate'>

let cancelled = false

const api = {
  /**
   * N прогонов симуляции. onProgress — колбэк основной стороны (Comlink.proxy).
   * Отмена — cancel(): цикл симуляции останавливается на границе прогона.
   */
  simulate(
    fighters: Fighter[],
    quest: Quest,
    opts: { runs?: number; seed?: number; maxRounds?: number; extreme?: boolean; powerBooster?: PowerBoosterId },
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
    powerBooster?: PowerBoosterId,
  ): { weights: StatWeightsResult; seeds: (SeedAdvice & { heroIndex: number })[] } {
    cancelled = false
    const champ = champion ? data.champions.find((c) => c.name === champion.name) : undefined
    const fighters = heroes.map((h) => fighterFromHero(h, data))
    if (champ && champion) fighters.push(fighterFromChampion(champ, champion.rank, data))
    const heroesOnly = fighters.slice(0, heroes.length)
    const weights = statWeights(heroesOnly, quest, { runs, powerBooster })
    const seeds = heroesOnly.map((_, i) => ({ ...seedAdvice(heroesOnly, quest, SEED_STAT_PER_SEED, { runs, heroIndex: i, powerBooster }), heroIndex: i }))
    return { weights, seeds }
  },
  /**
   * «Что отметить»: квесты, где варианты допущений калибровки сильнее всего расходятся по win rate
   * для этого отряда. Прогресс — пройденные квесты; отмена — cancel() (вернётся то, что успели).
   */
  questsToCheck(
    data: GameData,
    quests: Quest[],
    heroes: HeroInstance[],
    champion: { name: string; rank: number } | null,
    onProgress?: (done: number, total: number) => void,
  ): QuestCheckSuggestion[] {
    cancelled = false
    const champ = champion ? data.champions.find((c) => c.name === champion.name) : undefined
    return questsToCheck({
      data,
      quests,
      heroes,
      champion: champ && champion ? { champion: champ, rank: champion.rank } : null,
      onProgress: onProgress ? (done, total) => void onProgress(done, total) : undefined,
      shouldCancel: () => cancelled,
    })
  },
  /**
   * Прогон сохранённой команды по её квестам («Команды»): win rate, гибель каждого бойца, раунды,
   * барьер и доли ударов босса. Бойцы собираются здесь из состава команды — на главном потоке
   * остаётся только отрисовка.
   */
  async runTeam(
    members: TeamRunMember[],
    quests: Quest[],
    data: GameData,
    opts: { seed?: number; runs?: number; powerBooster?: PowerBoosterId },
    onProgress?: (done: number, total: number) => void,
  ): Promise<TeamRunResult> {
    cancelled = false
    let done = 0
    return runTeam(members, quests, data, (fighters, quest, o) => {
      const m = simulateTeam(fighters, quest, {
        ...o,
        onProgress: onProgress ? (d) => void onProgress(done + d, (opts.runs ?? 0) * quests.length) : undefined,
        shouldCancel: () => cancelled,
      })
      done += o.runs
      return Promise.resolve(m)
    }, opts)
  },
  /**
   * «План команд на локацию»: жадный сбор отрядов по правилам 1–4 и улучшение обменами по симуляции.
   * Прогресс — сделанные симуляции из бюджета; отмена — cancel() (вернётся последнее удачное состояние).
   */
  planTeams(data: GameData, input: WorkerPlanInput, onProgress?: (done: number, total: number) => void): TeamPlanResult {
    cancelled = false
    return planTeams({
      ...input,
      data,
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
