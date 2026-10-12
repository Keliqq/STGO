/**
 * «План команд на локацию» (требование владельца, сессия 28).
 *
 * Задача: выбрать локацию и сложность — и разложить ростер на максимальное число отрядов так, чтобы
 * каждый герой и чемпион попал ровно в одну команду. Сначала жадный сбор по правилам 1–4 ST-Central
 * (сначала самое трудное — стихия барьера и чемпионы-добытчики Sia/Polonia/Malady), затем улучшение
 * обменами героев между командами: решение принимает симуляция (цель — сумма win rate или число команд
 * с win rate ≥ порога). Обмены-кандидаты отбираются быстрой оценкой (quickScore героев и вклад в стихию) —
 * тот же приём, что в оптимизаторе экипировки (A38): быстрая оценка только отбирает кандидатов,
 * выбирает всегда симуляция.
 *
 * Тяжёлая часть (сотни прогонов) считается в Web Worker: `engine.worker.ts → planTeams`, с прогрессом
 * и отменой (`shouldCancel`). Модуль остаётся чистым: симуляция подставляется (`opts.simulate`).
 *
 * Правила и источники — constants.ts → RULES_* и teamRules.ts; механика барьера — A9 (barriers.ts).
 */
import type { ClassGroup, Element, GameData, HeroInstance, Quest } from '../data/types.ts'
import {
  BARRIER_BONUS_SKILL_RE,
  FIGHTER_CHAMPIONS,
  LOOT_CHAMPIONS,
  PARTY_FIGHTERS_MIN,
  PARTY_HEROES_PER_BARRIER_ELEMENT,
  PLAN_FINAL_RUNS,
  PLAN_IMPROVE_PASSES,
  PLAN_SIM_BUDGET,
  PLAN_SIM_RUNS,
  PLAN_SWAP_CANDIDATES,
  PLAN_WIN_THRESHOLD,
} from './constants.ts'
import { elementContribution } from './barriers.ts'
import { fighterFromChampion, fighterFromHero, parseSpecials, simulateTeam, type ChampionBuild, type Fighter, type SimMetrics } from './combat.ts'
import { quickScore } from './score.ts'
import { effectiveClass } from './stats.ts'
import { partyHints, type PartyHint } from './teamRules.ts'
import type { TeamRunMember } from './teamRunner.ts'

/** Seed плана по умолчанию: результат воспроизводим (общий seed на все команды — common random numbers). */
export const PLAN_SIM_SEED = 20261012

/** Чемпион в плане: имя и ранг (экипировку — ауру и фамильяра — план не задаёт, её ставят на «Командах»). */
export interface PlanChampion {
  name: string
  rank: number
}

/** Цель улучшения обменами: сумма win rate команд или число команд с win rate ≥ порога. */
export type PlanObjective = 'sum' | 'threshold'

/** Отряд плана (герои + необязательный чемпион) — из него собирается сохранённая команда. */
export interface PlannedTeam {
  members: HeroInstance[]
  champion: PlanChampion | null
  winRate: number | null
  avgRounds: number | null
  /** Стихийный барьер квеста для этого отряда (null — у квеста барьера нет). */
  barrier: { elements: Element[]; need: number; have: number; broken: boolean } | null
  /** Подсказки по составу (правила 1–4 и пары «чемпион ↔ герой») — те же, что в редакторе команды. */
  hints: PartyHint[]
  /** Как собирался отряд (шаги жадного алгоритма) — чтобы план был объяснимым. */
  notes: string[]
}

export type PlanSimulate = (fighters: Fighter[], quest: Quest, opts: { runs: number; seed: number }) => SimMetrics

export interface TeamPlanOptions {
  data: GameData
  quest: Quest
  heroes: HeroInstance[]
  /** Доступные чемпионы с рангами: каждый чемпион попадает не больше чем в одну команду. */
  champions: PlanChampion[]
  objective?: PlanObjective
  /** Порог win rate для цели `threshold`. */
  threshold?: number
  runs?: number
  finalRuns?: number
  seed?: number
  /** Бюджет вызовов симуляции на улучшение (1 вызов = 1 команда на 1 квесте). */
  budget?: number
  swapCandidates?: number
  passes?: number
  onProgress?: (done: number, total: number) => void
  shouldCancel?: () => boolean
  simulate?: PlanSimulate
}

export interface TeamPlanResult {
  teams: PlannedTeam[]
  /** Герои, не попавшие ни в одну команду. */
  leftover: HeroInstance[]
  unusedChampions: string[]
  objective: PlanObjective
  threshold: number
  /** Средний win rate команд и число команд с win rate ≥ порога. */
  sumWinRate: number
  teamsAbove: number
  sims: number
  runs: number
  finalRuns: number
  seed: number
  partySize: number
  /** Есть отряд меньшего размера, чем вмещает локация (героев не хватило). */
  undersized: boolean
  cancelled: boolean
  notes: string[]
}

/** Размер отряда локации (QUESTS → Maximum Party Size). */
export function partySizeForQuest(data: GameData, quest: Quest): number {
  return data.questAreas.find((a) => a.name === quest.area)?.partySize ?? 3
}

/** Что нужно знать о герое ростера для жадного сбора (считается один раз на героя). */
interface HeroInfo {
  hero: HeroInstance
  group: ClassGroup | null
  /** Быстрая оценка героя в этом квесте (quickScore по одному бойцу). */
  score: number
  /** Вклад в каждую стихию как в стихию барьера (своя стихия + «Any», A9). */
  barrierValues: Partial<Record<Element, number>>
}

const PLAN_ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold'] as const

function heroInfo(data: GameData, hero: HeroInstance, quest: Quest): HeroInfo {
  const fighter = fighterFromHero(hero, data)
  const barrierValues: Partial<Record<Element, number>> = {}
  for (const el of PLAN_ELEMENTS) {
    const v = elementContribution(fighter, el)
    if (v > 0) barrierValues[el] = v
  }
  return { hero, group: effectiveClass(hero, data)?.group ?? null, score: quickScore([fighter], quest), barrierValues }
}

/** Экипировка чемпиона в плане пустая: стихию даёт ранг, ауру и фамильяр пользователь ставит на «Командах». */
function championBuildOf(c: PlanChampion): ChampionBuild {
  return { champion: c.name, rank: c.rank, aura: null, familiar: null, spirit: null }
}

/** Бойцы отряда плана: герои + чемпион (без аур и фамильяров). */
function plannedFighters(team: Pick<PlannedTeam, 'members' | 'champion'>, data: GameData): Fighter[] {
  const out = team.members.map((h) => fighterFromHero(h, data))
  if (team.champion) {
    const champion = data.champions.find((c) => c.name === team.champion?.name)
    if (champion) out.push(fighterFromChampion(champion, team.champion.rank, data, championBuildOf(team.champion)))
  }
  return out
}

function runMembersOf(team: Pick<PlannedTeam, 'members' | 'champion'>): TeamRunMember[] {
  return [
    ...team.members.map((h) => ({ hero: h, build: null })),
    ...(team.champion ? [{ hero: null, build: championBuildOf(team.champion) }] : []),
  ]
}

/** Сколько стихии барьера даёт отряд и пробит ли он (с бонусом чемпиона «+N% party Element bonus», A9). */
function teamBarrier(team: Pick<PlannedTeam, 'members' | 'champion'>, quest: Quest, data: GameData): PlannedTeam['barrier'] {
  if (!quest.barrier) return null
  const fighters = plannedFighters(team, data)
  const bonusPct = fighters.reduce((a, f) => Math.max(a, parseSpecials(f.skills).elemBarrierBonusPct), 0)
  const bonus = 1 + bonusPct / 100
  let have = 0
  for (const el of quest.barrier.elements) {
    have = Math.max(have, fighters.reduce((a, f) => a + elementContribution(f, el), 0) * bonus)
  }
  return { elements: quest.barrier.elements, need: quest.barrier.hp, have: Math.round(have), broken: have >= quest.barrier.hp }
}

/** Даёт ли чемпион «+N% party Element bonus VS Elemental Barriers» (Rudo, награда 7-го ранга). */
function barrierBonusChampion(data: GameData, name: string): boolean {
  const champion = data.champions.find((c) => c.name === name)
  if (!champion) return false
  return champion.leaderSkills.some((id) => BARRIER_BONUS_SKILL_RE.test(data.skills.find((s) => s.id === id)?.text ?? ''))
}

interface DraftTeam {
  members: HeroInstance[]
  champion: PlanChampion | null
  notes: string[]
}

/**
 * План команд на квесте. Синхронная чистая функция: в приложении вызывается из воркера, в тестах —
 * напрямую (симуляция подставляется через `opts.simulate`).
 */
export function planTeams(opts: TeamPlanOptions): TeamPlanResult {
  const { data, quest } = opts
  const objective: PlanObjective = opts.objective ?? 'sum'
  const threshold = opts.threshold ?? PLAN_WIN_THRESHOLD
  const runs = Math.max(1, opts.runs ?? PLAN_SIM_RUNS)
  const finalRuns = Math.max(1, opts.finalRuns ?? PLAN_FINAL_RUNS)
  const budget = Math.max(0, opts.budget ?? PLAN_SIM_BUDGET)
  const maxCandidates = Math.max(1, opts.swapCandidates ?? PLAN_SWAP_CANDIDATES)
  const passes = Math.max(0, opts.passes ?? PLAN_IMPROVE_PASSES)
  const seed = (opts.seed ?? PLAN_SIM_SEED) >>> 0
  const simulate: PlanSimulate = opts.simulate ?? simulateTeam
  const P = partySizeForQuest(data, quest)
  const notes: string[] = []
  const isCancelled = (): boolean => opts.shouldCancel?.() === true

  const infos = opts.heroes.map((h) => heroInfo(data, h, quest))
  const infoById = new Map(infos.map((i) => [i.hero.id, i]))
  // Стихия барьера, по которой собираем отряды: та, где ростер сильнее всего (её и закрывать труднее).
  let targetElement: Element | null = null
  let bestSum = -1
  for (const el of quest.barrier?.elements ?? []) {
    const sum = infos.reduce((a, i) => a + (i.barrierValues[el] ?? 0), 0)
    if (sum > bestSum) {
      bestSum = sum
      targetElement = el
    }
  }
  const needBarrier = quest.barrier?.hp ?? 0

  const champions = opts.champions.filter((c) => c.rank >= 1 && data.champions.some((x) => x.name === c.name))
  // ── сколько команд влезает: n отрядов требуют n×P мест, чемпион занимает место героя ──
  let teamsCount = 0
  for (let n = 1; n <= Math.max(1, infos.length); n++) {
    if (n * P - Math.min(n, champions.length) <= infos.length) teamsCount = n
    else break
  }
  if (teamsCount === 0 && infos.length > 0) teamsCount = 1
  const emptyResult = (extra: string[]): TeamPlanResult => ({
    teams: [], leftover: [], unusedChampions: champions.map((c) => c.name), objective, threshold,
    sumWinRate: 0, teamsAbove: 0, sims: 0, runs, finalRuns, seed, partySize: P, undersized: false, cancelled: false,
    notes: extra,
  })
  if (infos.length === 0) return emptyResult(['Ростер пуст: героев нет — собирать нечего.'])
  if (teamsCount === 0) return emptyResult(['Героев не хватает даже на один отряд.'])

  // ── чемпионы: сначала «добытчики» (Sia/Polonia/Malady), затем тот, кто закрывает барьер (Rudo), затем бойцы ──
  const championPriority = (c: PlanChampion): number => {
    let s = 0
    const loot = LOOT_CHAMPIONS.indexOf(c.name)
    if (loot >= 0) s += 100 - loot
    if (barrierBonusChampion(data, c.name)) s += 50
    if (FIGHTER_CHAMPIONS.includes(c.name)) s += 20
    return s
  }
  const championsSorted = [...champions].sort((a, b) => championPriority(b) - championPriority(a) || a.name.localeCompare(b.name))

  // ── жадный сбор отрядов ──
  const remaining = [...infos]
  const draft: DraftTeam[] = []
  for (let t = 0; t < teamsCount; t++) {
    const champion = championsSorted[t] ?? null
    const slots = P - (champion ? 1 : 0)
    const chosen: HeroInfo[] = []
    const teamNotes: string[] = []
    const championIsFighter = champion ? data.champions.find((c) => c.name === champion.name)?.group === 'Fighter' : false
    if (champion) {
      teamNotes.push(
        LOOT_CHAMPIONS.includes(champion.name)
          ? `Чемпион ${champion.name} (ранг ${champion.rank}) — добыча: ставим в первую очередь (Sia/Polonia/Malady).`
          : barrierBonusChampion(data, champion.name)
            ? `Чемпион ${champion.name} (ранг ${champion.rank}) — +50% стихии отряда против барьера.`
            : `Чемпион ${champion.name} (ранг ${champion.rank}).`,
      )
    }
    const take = (info: HeroInfo, why: string): void => {
      chosen.push(info)
      remaining.splice(remaining.indexOf(info), 1)
      teamNotes.push(why)
    }
    // 1) барьер: набираем стихию до порога, но не меньше двух героев (правило 1)
    if (targetElement) {
      const el: Element = targetElement
      const sorted = [...remaining].sort((a, b) => (b.barrierValues[el] ?? 0) - (a.barrierValues[el] ?? 0))
      for (const info of sorted) {
        if (chosen.length >= slots) break
        const value = info.barrierValues[el] ?? 0
        const contributors = chosen.filter((c) => (c.barrierValues[el] ?? 0) > 0).length
        const have = chosen.reduce((a, c) => a + (c.barrierValues[el] ?? 0), 0)
        if (contributors >= PARTY_HEROES_PER_BARRIER_ELEMENT && have >= needBarrier) break
        if (value <= 0) continue
        const after = have + value
        take(info, `Барьер «${el}»: +${Math.round(value)} стихии${after < needBarrier ? ` (${Math.round(after)} из ${needBarrier})` : ''}.`)
      }
    }
    // 2) «красный» — правило 3 (чемпион-боец считается)
    if (!championIsFighter && !chosen.some((c) => c.group === 'Fighter') && chosen.length < slots) {
      const bestFighter = remaining.filter((i) => i.group === 'Fighter').sort((a, b) => b.score - a.score)[0]
      if (bestFighter) take(bestFighter, 'Красный (Fighter) — правило 3.')
    }
    // 3) остальное — «синие/зелёные» (правило 4), по быстрой оценке
    while (chosen.length < slots && remaining.length > 0) {
      const supports = remaining.filter((i) => i.group === 'Rogue' || i.group === 'Spellcaster')
      const pool = supports.length > 0 ? supports : remaining
      const best = [...pool].sort((a, b) => b.score - a.score)[0]
      take(best, `${best.group ?? 'без группы'} — свободные слоты (правило 4: синие/зелёные).`)
    }
    draft.push({ members: chosen.map((c) => c.hero), champion, notes: teamNotes })
  }
  if (remaining.length > 0) {
    notes.push(`Вне плана осталось героев: ${remaining.length} — на ${teamsCount} отряд(а) мест не хватило (по ${P} бойца).`)
  }

  // ── оценка и улучшение обменами ──
  let sims = 0
  const total = budget + 2 * draft.length
  const report = (): void => opts.onProgress?.(sims, total)
  const sim = (i: number, tag: 'run' | 'final'): SimMetrics => {
    sims++
    report()
    return simulate(plannedFighters(draft[i], data), quest, { runs: tag === 'final' ? finalRuns : runs, seed: (seed + i + (tag === 'final' ? 1000 : 0)) >>> 0 })
  }
  const initial = draft.map((_, i) => sim(i, 'run'))
  let winRates = initial.map((m) => m.winRate)
  let rounds = initial.map((m) => m.avgRounds)
  let cancelledFlag = false

  const objectiveOf = (rates: number[]): { sum: number; above: number } => ({
    sum: rates.reduce((a, r) => a + r, 0) / Math.max(1, rates.length),
    above: rates.filter((r) => r >= threshold).length,
  })
  const better = (a: { sum: number; above: number }, b: { sum: number; above: number }): boolean =>
    objective === 'threshold' ? a.above > b.above || (a.above === b.above && a.sum > b.sum + 1e-9) : a.sum > b.sum + 1e-9

  /** Сколько «красных» в отряде: чемпион-боец считается (правило 3 не должно сломаться обменом). */
  const fighterCount = (team: DraftTeam): number => {
    const heroes = team.members.filter((h) => effectiveClass(h, data)?.group === 'Fighter').length
    const champFighter = team.champion ? data.champions.find((c) => c.name === team.champion?.name)?.group === 'Fighter' : false
    return heroes + (champFighter ? 1 : 0)
  }
  /** Вклад отряда в целевую стихию барьера — по нему ищем обмен «стихия туда, где её не хватает». */
  const barrierOf = (team: DraftTeam): number => team.members.reduce((a, h) => a + (infoById.get(h.id)?.barrierValues[targetElement as Element] ?? 0), 0)

  for (let pass = 0; pass < passes; pass++) {
    if (sims >= budget) break
    if (isCancelled()) {
      cancelledFlag = true
      break
    }
    // Обмены-кандидаты: сильного героя — в слабую команду; героя со стихией — туда, где барьер не пробит.
    const order = draft.map((_, i) => i).sort((a, b) => winRates[a] - winRates[b])
    const barrierNeed = draft.map((t) => needBarrier - barrierOf(t))
    const candidates: { i: number; j: number; ai: number; bi: number; delta: number; why: string }[] = []
    for (let wi = 0; wi < order.length; wi++) {
      for (let si = wi + 1; si < order.length; si++) {
        const weak = order[wi]
        const strong = order[si]
        for (let ai = 0; ai < draft[weak].members.length; ai++) {
          for (let bi = 0; bi < draft[strong].members.length; bi++) {
            const a = infoById.get(draft[weak].members[ai].id)
            const b = infoById.get(draft[strong].members[bi].id)
            if (!a || !b) continue
            const aOut = a.group === 'Fighter' ? 1 : 0
            const bOut = b.group === 'Fighter' ? 1 : 0
            if (fighterCount(draft[weak]) - aOut + bOut < PARTY_FIGHTERS_MIN) continue
            if (fighterCount(draft[strong]) - bOut + aOut < PARTY_FIGHTERS_MIN) continue
            const scoreDelta = b.score - a.score
            const barrierDelta = (b.barrierValues[targetElement as Element] ?? 0) - (a.barrierValues[targetElement as Element] ?? 0)
            const helpsBarrier = targetElement !== null && barrierNeed[weak] > 0 && barrierDelta > 0
            if (scoreDelta <= 0 && !helpsBarrier) continue
            candidates.push({
              i: weak,
              j: strong,
              ai,
              bi,
              delta: Math.max(0, scoreDelta) + (helpsBarrier ? barrierDelta : 0),
              why: helpsBarrier ? 'стихия барьера — в отряд, где её не хватает' : 'сильный герой — в слабую команду',
            })
          }
        }
      }
    }
    const top = candidates.sort((x, y) => y.delta - x.delta || x.i - y.i || x.ai - y.ai).slice(0, maxCandidates)
    let bestSwap: { i: number; j: number; ai: number; bi: number; rates: number[]; rounds: number[]; why: string } | null = null
    let bestValue = objectiveOf(winRates)
    for (const c of top) {
      if (sims + 2 > budget || isCancelled()) {
        cancelledFlag = cancelledFlag || isCancelled()
        break
      }
      const swapMembers = (): void => {
        const a = draft[c.i].members[c.ai]
        draft[c.i].members[c.ai] = draft[c.j].members[c.bi]
        draft[c.j].members[c.bi] = a
      }
      swapMembers()
      const mi = sim(c.i, 'run')
      const mj = sim(c.j, 'run')
      swapMembers()
      const rates = [...winRates]
      rates[c.i] = mi.winRate
      rates[c.j] = mj.winRate
      if (better(objectiveOf(rates), bestValue)) {
        bestValue = objectiveOf(rates)
        const nextRounds = [...rounds]
        nextRounds[c.i] = mi.avgRounds
        nextRounds[c.j] = mj.avgRounds
        bestSwap = { i: c.i, j: c.j, ai: c.ai, bi: c.bi, rates, rounds: nextRounds, why: c.why }
      }
    }
    if (!bestSwap) break
    const moved = draft[bestSwap.i].members[bestSwap.ai]
    draft[bestSwap.i].members[bestSwap.ai] = draft[bestSwap.j].members[bestSwap.bi]
    draft[bestSwap.j].members[bestSwap.bi] = moved
    winRates = bestSwap.rates
    rounds = bestSwap.rounds
    notes.push(
      `Обмен: команды ${bestSwap.i + 1} и ${bestSwap.j + 1} — ${bestSwap.why}; цель «${objective === 'sum' ? 'сумма win rate' : `команд с win rate ≥ ${Math.round(threshold * 100)}%`}» улучшилась.`,
    )
  }

  // ── итоговые метрики (если расчёт не отменён) ──
  if (!cancelledFlag) {
    const finals = draft.map((_, i) => sim(i, 'final'))
    winRates = finals.map((m) => m.winRate)
    rounds = finals.map((m) => m.avgRounds)
  }
  const teams: PlannedTeam[] = draft.map((t, i) => ({
    members: t.members,
    champion: t.champion,
    winRate: winRates[i] ?? null,
    avgRounds: rounds[i] ?? null,
    barrier: teamBarrier(t, quest, data),
    hints: partyHints(runMembersOf(t), quest, data, { maxPartySize: P }),
    notes: t.notes,
  }))
  const value = objectiveOf(winRates)
  if (cancelledFlag) notes.push('Расчёт отменён: показаны метрики последнего удачного состояния.')
  if (champions.length < draft.length) notes.push(`Чемпионов ${champions.length} на ${draft.length} отряд(а): часть отрядов пойдёт без чемпиона.`)
  return {
    teams,
    leftover: remaining.map((i) => i.hero),
    unusedChampions: championsSorted.slice(draft.length).map((c) => c.name),
    objective,
    threshold,
    sumWinRate: value.sum,
    teamsAbove: value.above,
    sims,
    runs,
    finalRuns,
    seed,
    partySize: P,
    undersized: teams.some((t) => t.members.length + (t.champion ? 1 : 0) < P),
    cancelled: cancelledFlag,
    notes,
  }
}
