/**
 * Прогон сохранённой команды: win rate по выбранным квестам, вероятность гибели каждого героя,
 * средние раунды, барьер и доли ударов босса по участникам (требование владельца, «Команды»).
 *
 * Всё считается здесь (чистые функции, без DOM/React): страница «Команды» собирает бойцов и
 * прогоняет квесты, а тяжёлый Монте-Карло уходит в Web Worker (`engine.worker.ts → runTeam`).
 * Один общий seed на всю команду — это то же «common random numbers», что в оптимизаторе:
 * два прогона одной команды и сравнение двух команд имеют одинаковый шум, а значит различимы.
 */
import type { Element, GameData, HeroInstance, Quest } from '../data/types.ts'
import { AOE_CHANCE } from './constants.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam, threatShares, type ChampionBuild, type Fighter, type FighterMetrics, type PowerBoosterId, type SimMetrics } from './combat.ts'
import { partyElementBonusPct } from './statWeights.ts'

// Русские названия стихий живут в statWeights.ts (там же, где подписи шагов весов) — реэкспорт для UI.
export { ELEMENT_RU } from './statWeights.ts'

/** Seed прогона команды по умолчанию — фиксированный: результат воспроизводим от запуска к запуску. */
export const TEAM_SIM_SEED = 20261012
/** Прогонов на квест: столько же, сколько у оптимизатора (иначе сравнение команд было бы шумнее выбора экипировки). */
export const TEAM_SIM_RUNS = 2000

/** Участник прогона: герой пользователя либо экипировка чемпиона (`hero` = null). */
export interface TeamRunMember {
  hero: HeroInstance | null
  build: ChampionBuild | null
}

/** Кто сколько вносит в стихии барьера и как часто по нему бьёт босс. */
export interface MemberMetrics {
  name: string
  isChampion: boolean
  /** Доля прогонов, где боец погиб (усреднено по квестам). */
  deathRate: number
  /** Доля прогонов, где боец выжил. */
  survivalRate: number
  /** Доля одиночных атак босса, доставшихся этому бойцу (усреднено по квестам). */
  attackShare: number
  /** Вклад в стихии барьера квеста (сумма по стихиям барьера; 0 — у квеста барьера нет). */
  element: number
  /** Итоговые боевые статы (надетое + экипировка чемпиона). */
  stats: { atk: number; def: number; hp: number; crit: number; eva: number; threat: number }
  /**
   * Подробные средние по прогонам («Сводка по бойцам», усреднено по квестам): урон за удар,
   * криты, уклонения, перезарядки мана-щита, раунд гибели, доля времени с «until damaged».
   */
  sim: FighterMetrics
}

/** Результат прогона по одному квесту. */
export interface TeamQuestRun {
  quest: Quest
  label: string
  winRate: number
  avgRounds: number
  /** Пробит ли стихийный барьер квеста (A9) — с учётом бонуса отряда к стихии (Rudo). */
  barrierBroken: boolean
  /** Сколько стихии барьера даёт отряд и сколько нужно (`null` — барьера нет). */
  barrier: { elements: Element[]; need: number; have: number; best: Element | null } | null
  /** Гибель, вклад в стихии и доли одиночных атак по участникам (порядок как в `members`). */
  deaths: number[]
  elements: number[]
  shares: number[]
}

export interface TeamRunResult {
  quests: TeamQuestRun[]
  /** Средний по квестам win rate — по нему сравниваются команды. */
  winRate: number
  avgRounds: number
  /** Гибель, вклад и доли атак, усреднённые по квестам (порядок как в `members`). */
  members: MemberMetrics[]
  runs: number
  seed: number
}

/** Бойцы команды в порядке участников: герои, затем чемпион (`null` — чемпион не найден в данных). */
export function teamFighters(members: TeamRunMember[], data: GameData): (Fighter | null)[] {
  return members.map((m) => {
    if (m.hero) return fighterFromHero(m.hero, data)
    if (!m.build) return null
    const champion = data.champions.find((c) => c.name === m.build?.champion)
    return champion ? fighterFromChampion(champion, m.build.rank, data, m.build) : null
  })
}

/** Подпись типа квеста по-русски: `miniboss` — босс с выбранным мини-боссом (A17). */
export const QUEST_VARIANT_RU: Record<Quest['variant'], string> = { normal: 'обычный', boss: 'босс', miniboss: 'мини-босс' }

/** Подпись квеста — как в остальных местах интерфейса (своя копия, чтобы не тянуть optimizer.ts: цикл). */
export function questLabelRu(q: Quest): string {
  return `${q.area} · ${QUEST_VARIANT_RU[q.variant]} · ${q.difficulty}`
}

/** Суммарный вклад отряда в стихии барьера квеста: сколько нужно и сколько даёт лучшая стихия. */
export function barrierSummary(fighters: Fighter[], quest: Quest): { elements: Element[]; need: number; have: number; best: Element | null } | null {
  if (!quest.barrier) return null
  const bonus = 1 + partyElementBonusPct(fighters) / 100
  let best: Element | null = null
  let bestValue = -1
  for (const el of quest.barrier.elements) {
    const v = fighters.reduce((a, f) => a + (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100), 0) * bonus
    if (v > bestValue) {
      bestValue = v
      best = el
    }
  }
  return { elements: quest.barrier.elements, need: quest.barrier.hp, have: Math.round(bestValue), best }
}

/** Вклад каждого участника в стихии барьера квеста (сумма по стихиям барьера). */
export function elementContributionsByMember(fighters: Fighter[], quest: Quest): number[] {
  const bonus = 1 + partyElementBonusPct(fighters) / 100
  const elements = quest.barrier?.elements ?? []
  return fighters.map((f) => elements.reduce((a, el) => a + ((f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100)) * bonus, 0))
}

/**
 * Доли *одиночных* атак босса по бойцам. AoE (шанс `AOE_CHANCE`) бьёт всех, поэтому доля одиночных
 * ударов = `(1 − p_AoE) × threat / Σ threat` — «угроза» ровно как в бою (`combat.ts → threatShares`).
 */
export function attackShares(fighters: Fighter[], aoeChance: number = AOE_CHANCE): number[] {
  return threatShares(fighters, { aoeChance }).map((s) => (1 - aoeChance) * s)
}

/**
 * Свести готовые метрики симуляций в результат прогона команды (без симуляции — удобно для тестов
 * и для переиспользования уже посчитанных метрик).
 */
export function summarizeTeamRun(
  fighters: Fighter[],
  quests: Quest[],
  metrics: SimMetrics[],
  members: { name: string; isChampion: boolean }[],
): Omit<TeamRunResult, 'seed'> {
  if (quests.length !== metrics.length) throw new Error('Прогон команды: число квестов не совпало с числом симуляций')
  const perQuest: TeamQuestRun[] = quests.map((quest, qi) => {
    const m = metrics[qi]
    const barrier = barrierSummary(fighters, quest)
    const survival = m.survival ?? []
    return {
      quest,
      label: questLabelRu(quest),
      winRate: m.winRate,
      avgRounds: m.avgRounds,
      barrierBroken: barrier === null || barrier.have >= barrier.need,
      barrier,
      deaths: members.map((_, i) => survival[i]?.deathRate ?? 0),
      elements: elementContributionsByMember(fighters, quest),
      shares: attackShares(fighters),
    }
  })
  const avg = (get: (q: TeamQuestRun) => number): number => (perQuest.length > 0 ? perQuest.reduce((a, q) => a + get(q), 0) / perQuest.length : 0)
  return {
    quests: perQuest,
    winRate: avg((q) => q.winRate),
    avgRounds: avg((q) => q.avgRounds),
    members: members.map((mem, i) => {
      const death = avg((q) => q.deaths[i] ?? 0)
      return {
        name: mem.name,
        isChampion: mem.isChampion,
        deathRate: death,
        survivalRate: 1 - death,
        attackShare: avg((q) => q.shares[i] ?? 0),
        element: avg((q) => q.elements[i] ?? 0),
        stats: {
          atk: fighters[i]?.atk ?? 0,
          def: fighters[i]?.def ?? 0,
          hp: fighters[i]?.hp ?? 0,
          crit: fighters[i]?.crit ?? 0,
          eva: fighters[i]?.eva ?? 0,
          threat: fighters[i]?.threat ?? 0,
        },
        sim: {
          name: mem.name,
          hitsPerFight: mean(metrics, i, (p) => p.hitsPerFight),
          damagePerHit: mean(metrics, i, (p) => p.damagePerHit),
          critRate: mean(metrics, i, (p) => p.critRate),
          dodgeRate: mean(metrics, i, (p) => p.dodgeRate),
          shieldRecharges: mean(metrics, i, (p) => p.shieldRecharges),
          survivalRate: 1 - death,
          avgDeathRound: mean(metrics, i, (p) => p.avgDeathRound),
          untilDamagedShare: mean(metrics, i, (p) => p.untilDamagedShare),
        },
      }
    }),
    runs: metrics[0]?.runs ?? 0,
  }
}

/** Среднее поле `perFighter[i]` по всем прогонам-квестам. */
function mean(metrics: SimMetrics[], i: number, get: (p: FighterMetrics) => number): number {
  if (metrics.length === 0) return 0
  return metrics.reduce((a, m) => a + get(m.perFighter[i]), 0) / metrics.length
}

export interface TeamRunOptions {
  seed?: number
  runs?: number
  /** Усилитель силы квеста на весь отряд (A74), выбор в форме квеста. */
  powerBooster?: PowerBoosterId
}

/**
 * Прогон команды по квестам: на каждый квест — симуляция на своём seed (seed + номер квеста).
 * `simulate` передаётся вызывающим (в приложении — воркер), чтобы модуль оставался чистым.
 */
export async function runTeam(
  members: TeamRunMember[],
  quests: Quest[],
  data: GameData,
  simulate: (fighters: Fighter[], quest: Quest, opts: { runs: number; seed: number; powerBooster?: PowerBoosterId }) => Promise<SimMetrics>,
  opts: TeamRunOptions = {},
): Promise<TeamRunResult> {
  const fighters = teamFighters(members, data)
  const missing = fighters.findIndex((f) => f === null)
  if (missing >= 0) throw new Error(`Чемпион «${members[missing]?.build?.champion ?? '?'}» не найден в данных`)
  const list = fighters as Fighter[]
  const runs = opts.runs ?? TEAM_SIM_RUNS
  const seed = (opts.seed ?? TEAM_SIM_SEED) >>> 0
  const metrics: SimMetrics[] = []
  for (let i = 0; i < quests.length; i++) metrics.push(await simulate(list, quests[i], { runs, seed: (seed + i) >>> 0, powerBooster: opts.powerBooster }))
  const labels = members.map((m) => ({ name: m.hero?.name ?? m.build?.champion ?? '?', isChampion: m.hero === null }))
  return { ...summarizeTeamRun(list, quests, metrics, labels), seed }
}

/** Синхронный вариант прогона — для тестов и для случая, когда воркер не нужен. */
export function runTeamSync(
  members: TeamRunMember[],
  quests: Quest[],
  data: GameData,
  opts: TeamRunOptions = {},
): TeamRunResult {
  const fighters = teamFighters(members, data)
  const missing = fighters.findIndex((f) => f === null)
  if (missing >= 0) throw new Error(`Чемпион «${members[missing]?.build?.champion ?? '?'}» не найден в данных`)
  const list = fighters as Fighter[]
  const runs = opts.runs ?? TEAM_SIM_RUNS
  const seed = (opts.seed ?? TEAM_SIM_SEED) >>> 0
  const metrics = quests.map((q, i) => simulateTeam(list, q, { runs, seed: (seed + i) >>> 0, powerBooster: opts.powerBooster }))
  const labels = members.map((m) => ({ name: m.hero?.name ?? m.build?.champion ?? '?', isChampion: m.hero === null }))
  return { ...summarizeTeamRun(list, quests, metrics, labels), seed }
}
