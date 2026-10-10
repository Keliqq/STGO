/**
 * Веса статов: «что даст герою +1% крита / +5% ATK / +10 стихии» — измеряется симуляцией.
 *
 * Зачем: игрок должен понимать, ПОЧЕМУ программа предложила именно этот предмет. Веса считаются
 * на том же наборе экипировки, что и результат подбора, на общих seed (common random numbers):
 * базовый прогон и все варианты «+стат» идут с одним seed, поэтому разница — не шум.
 *
 * Метрика (решение сессии 13): если базовый win rate < 100%, вес = прирост win rate в п.п.;
 * если 100% (или 0% — цель не различает наборы), вес = прирост урона за раунд в % и прирост
 * минимального % HP выжившего в п.п. Так веса остаются осмысленными и на «непобедимых» квестах.
 *
 * Добавка стата — FighterBonus (combat.ts): atk/def — плоская прибавка (= доля от текущего стата),
 * hp — к максимуму HP, crit/eva — к доле, critDmg — к множителю, threat — плоская, element — к стихии героя.
 */
import type { Element, Quest } from '../data/types.ts'
import {
  STAT_WEIGHT_CRIT_DMG_PCT,
  STAT_WEIGHT_CRIT_PCT,
  STAT_WEIGHT_ELEMENT,
  STAT_WEIGHT_EVA_PCT,
  STAT_WEIGHT_MAIN_PCT,
  STAT_WEIGHT_RUNS,
  STAT_WEIGHT_THREAT,
  PROBE_TARGET_WIN_RATE,
  PROBE_WIN_RATE_MAX,
  PROBE_WIN_RATE_MIN,
  WEIGHTS_PROBE_FACTORS,
} from './constants.ts'
import {
  applyFighterBonus,
  elementContributions,
  parseSpecials,
  simulateTeam,
  threatShares,
  type Fighter,
  type FighterBonus,
  type SimMetrics,
} from './combat.ts'

/** Стат, для которого считается вес (порядок — как в UI). */
export const STAT_WEIGHT_STATS = ['crit', 'critDmg', 'eva', 'atk', 'hp', 'def', 'element', 'threat'] as const
export type StatWeightStat = (typeof STAT_WEIGHT_STATS)[number]

/** Статы защиты: на насыщенных квестах их ценность видна в выживаемости, а не в уроне. */
export const DEFENSIVE_STATS: readonly StatWeightStat[] = ['hp', 'def', 'eva']

const ELEMENT_RU: Record<string, string> = {
  Fire: 'Огонь',
  Water: 'Вода',
  Air: 'Воздух',
  Earth: 'Земля',
  Light: 'Свет',
  Dark: 'Тьма',
  Gold: 'Золото',
}

/** Подпись шага: «+1% CRIT», «+10% CRIT DMG», «+5% ATK», «+10 стихии (Свет)». */
export function statStepLabel(stat: StatWeightStat, element: Element | null = null): string {
  switch (stat) {
    case 'crit':
      return '+1% CRIT'
    case 'critDmg':
      return '+10% CRIT DMG'
    case 'eva':
      return '+1% EVA'
    case 'atk':
      return '+5% ATK'
    case 'hp':
      return '+5% HP'
    case 'def':
      return '+5% DEF'
    case 'element':
      return `+${STAT_WEIGHT_ELEMENT} стихии${element ? ` (${ELEMENT_RU[element] ?? element})` : ''}`
    case 'threat':
      return `+${STAT_WEIGHT_THREAT} угрозы`
  }
}

/** Краткая подпись стата для таблицы («CRIT», «ATK», «стихия»). */
export function statShortLabel(stat: StatWeightStat, element: Element | null = null): string {
  if (stat === 'element') return element ? `стихия (${ELEMENT_RU[element] ?? element})` : 'стихия'
  if (stat === 'critDmg') return 'CRIT DMG'
  if (stat === 'crit') return 'CRIT'
  if (stat === 'eva') return 'EVA'
  if (stat === 'threat') return 'угроза'
  return stat.toUpperCase()
}

const STAT_FULL_LABEL: Record<StatWeightStat, string> = {
  crit: 'шанс крита',
  critDmg: 'урон крита',
  eva: 'уклонение',
  atk: 'атака',
  hp: 'HP',
  def: 'защита',
  element: 'стихия',
  threat: 'угроза',
}

export interface StatWeight {
  stat: StatWeightStat
  /** Подпись шага: «+5% ATK». */
  stepLabel: string
  /** Что именно прибавлено (для расшифровки). */
  plus: FighterBonus
  /** Прирост win rate в п.п. */
  winRatePp: number
  /** Прирост урона за раунд, в долях (0.04 = +4%). */
  damagePct: number
  /** Прирост минимального % HP выжившего, в долях (0.02 = +2 п.п.). */
  minSurvivorHpPp: number
  /** В какой метрике этот стат оценивается на этом квесте (см. metricOf). */
  metric: 'winRatePp' | 'damagePct' | 'minSurvivorHpPp'
}

/** Метрика, показываемая в UI по умолчанию (у защитных статов на насыщенном квесте — мин. HP). */
export type WeightMetric = 'winRatePp' | 'damagePct' | 'minSurvivorHpPp'

export interface HeroStatWeights {
  index: number
  name: string
  /** База: статы бойца, по которым считались прибавки. */
  base: { atk: number; def: number; hp: number; crit: number; critDmg: number; eva: number; threat: number; element: number }
  weights: StatWeight[]
  /** Ключ главного стата («что важнее всего для героя»). */
  best: StatWeightStat | null
  /** Одна фраза: «Главное для героя: шанс крита: +1% ≈ +2.1 п.п. win rate». */
  headline: string
  /** Есть ли польза от прибавок: false — статы вообще не влияют на исход. */
  meaningful: boolean
}

export interface SeedAdviceRow {
  kind: 'atk' | 'hp' | 'def'
  label: string
  /** Прибавка к базовому стату за одно семя (плоская). */
  perSeed: number
  /** Что одно семя даёт в win rate / уроне (как StatWeight). */
  weight: StatWeight
  /** Сколько семян нужно до +1 п.п. win rate (null — не добрать/не нужно). */
  seedsPerPp: number | null
}

export interface SeedAdvice {
  rows: SeedAdviceRow[]
  /** Лучший тип семян на этого героя. */
  best: 'atk' | 'hp' | 'def' | null
  /** Одна фраза-рекомендация. */
  text: string
}

export interface ThreatShare {
  index: number
  name: string
  threat: number
  /** Доля атак босса (0.42 = 42%). */
  share: number
}

/** Информация о квесте-зонде, на котором посчитаны веса (когда настоящий квест не различает наборы). */
export interface ProbeInfo {
  /** Подпись настоящего квеста. */
  label: string
  /** Во сколько раз ослаблены HP монстра и его урон. */
  hpFactor: number
  dmgFactor: number
  /** Хватило ли отряду урона за раунд, чтобы квест стал проходимым. */
  byDamage: boolean
}

export interface BarrierInfo {  /** Стихия, которая ближе всего к пробитию (или первая из барьера). */
  bestElement: Element | null
  /** Величина барьера. */
  hp: number
  /** Собрано отрядом в лучшей стихии. */
  have: number
  /** Не хватает (0 — пробит). */
  missing: number
  broken: boolean
  /** Вклад каждого бойца в лучшую стихию. */
  contributions: { index: number; name: string; value: number }[]
}

export interface StatWeightsOptions {
  runs?: number
  seed?: number
  /** Стихия барьера, на которую считать вес «+стихия» (по умолчанию — лучшая для отряда). */
  element?: Element | null
  /**
   * Win rate, по которому выбирается метрика объяснения. Нужен, когда расчёт идёт на ослабленном
   * зонде: на настоящем квесте win rate 0%, и «прирост win rate» ничего не сказал бы.
   */
  baseWinRate?: number
  /** В UI: помечать, что это веса с зонда (ослабленный квест). */
  probeNote?: string | null
}

export interface StatWeightsResult {
  runs: number
  seed: number
  base: { winRate: number; avgRounds: number; avgDamagePerRound: number; avgMinSurvivorHpPct: number }
  /** Метрика, в которой сравниваются веса по умолчанию (у защитных статов может отличаться). */
  metric: WeightMetric
  /** Win rate на настоящем квесте (не на зонде): для отряда это 0 % — иначе зонд не понадобился бы. */
  realWinRate: number
  /** По героям (порядок как в team). */
  heroes: HeroStatWeights[]
  /** Сумма весов по отряду для каждого стата (для столбиков в UI). */
  team: Record<StatWeightStat, number>
  /** Доля атак босса по каждому бойцу. */
  threat: ThreatShare[]
  /** Индекс бойца, принимающего больше всех ударов (обычно танк). */
  topThreatIndex: number
  /** Стихия барьера и вклад отряда. */
  barrier: BarrierInfo | null
  /**
   * Веса посчитаны не на самом квесте, а на ослабленном зонде (квест не различает наборы:
   * win rate 0% при полном провале). null — считались на настоящем квесте.
   */
  probe: ProbeInfo | null
}

/** Ключ героя в карте весов (позиция в отряде). */
export const TEAM_WEIGHT_KEYS: readonly StatWeightStat[] = STAT_WEIGHT_STATS

const round = (x: number, digits = 4): number => Math.round(x * 10 ** digits) / 10 ** digits

/**
 * Метрика, по которой сравниваются веса:
 *  · win rate не насыщен → прирост win rate (п.п.);
 *  · win rate 100% → урон за раунд для атакующих статов и мин. % HP выжившего для защитных
 *    (добавка HP/DEF не увеличивает урон за раунд, её ценность — в выживаемости);
 *  · win rate 0% при полном провале → мин. % HP (веса всё равно ≈0 — нужен зонд).
 */
export function metricOf(baseWinRate: number, stat?: StatWeightStat): 'winRatePp' | 'damagePct' | 'minSurvivorHpPp' {
  if (baseWinRate > 0.01 && baseWinRate < 0.99) return 'winRatePp'
  if (stat && DEFENSIVE_STATS.includes(stat)) return 'minSurvivorHpPp'
  return 'damagePct'
}

/** Значимость веса в «единицах метрики»: п.п. win rate, доля урона или п.п. мин. HP. */
export function weightValue(w: StatWeight, baseWinRate: number): number {
  return w[metricOf(baseWinRate, w.stat)]
}

const metricValue = (w: StatWeight, baseWinRate: number): number => w[metricOf(baseWinRate, w.stat)]

/**
 * Ослабленный «зонд» квеста: HP и урон монстра делятся на factor. Нужен, когда настоящий квест
 * не различает наборы (отряд проигрывает всегда — все веса ровно 0).
 */
export function weightsProbeQuest(quest: Quest, factor: number): Quest {
  return {
    ...quest,
    monsterHp: Math.max(1, Math.round(quest.monsterHp / factor)),
    // Урон ослабляем мягче, чем HP (иначе зонд превращается в лёгкую прогулку, где статы не нужны).
    monsterDmg: Math.max(1, Math.round(quest.monsterDmg / Math.sqrt(factor))),
    monsterAoe: Math.max(0, Math.round(quest.monsterAoe / Math.sqrt(factor))),
  }
}

/**
 * Веса статов для отряда на одном квесте. Число симуляций: (1 база + 8 статов) × длина отряда,
 * все на общем seed — сравнение честное (CRN), шум не решает.
 */
export function statWeights(fighters: Fighter[], quest: Quest, options: StatWeightsOptions = {}): StatWeightsResult {
  const runs = options.runs ?? STAT_WEIGHT_RUNS
  const seed = (options.seed ?? 1) >>> 0
  const real = computeAt(fighters, quest, quest, runs, seed, options)
  if (real.base.winRate > 0) return real
  // Win rate 0 %: квест не различает наборы (отряд проваливается всегда), веса были бы нулями.
  // Перебор зондов идёт на коротких прогонах (выбрать множитель — грубая задача), а победитель
  // пересчитывается на полном числе прогонов, чтобы дельты были точными.
  const short = Math.max(100, Math.round(runs / 4))
  const probeOf = (factor: number, r: number): StatWeightsResult => {
    const q = weightsProbeQuest(quest, factor)
    return computeAt(fighters, q, quest, r, seed, { ...options, baseWinRate: undefined }, {
      label: `${quest.area} · ${quest.difficulty}`,
      hpFactor: quest.monsterHp / q.monsterHp,
      dmgFactor: quest.monsterDmg / q.monsterDmg,
      byDamage: false,
    })
  }
  const probed = WEIGHTS_PROBE_FACTORS.map((factor) => ({ factor, w: probeOf(factor, short) }))
  const best = bestProbe(probed.map((x) => x.w))
  if (!best) return real
  const factor = probed.find((x) => x.w === best)?.factor ?? 1
  return probeOf(factor, runs)
}

/** Двигает ли шаг в стат исход и насколько сильно (для выбора лучшего зонда). */
function discrimination(w: StatWeightsResult): number {
  let score = 0
  for (const h of w.heroes) {
    for (const x of h.weights) {
      score = Math.max(score, Math.abs(x.winRatePp), Math.abs(x.minSurvivorHpPp), Math.abs(x.damagePct) / 10)
    }
  }
  return score
}

/**
 * Насколько зонд пригоден: win rate как можно ближе к 50 % (у 0 % и 100 % шаг стата переворачивает
 * исход целиком — вклад одного прогона из N — и дельта перестаёт быть мерой), при прочих равных —
 * чем сильнее статы двигают исход, тем лучше.
 */
function probeRank(r: StatWeightsResult): number {
  const dist = Math.min(Math.abs(r.base.winRate - PROBE_TARGET_WIN_RATE), Math.abs(r.base.winRate - (1 - PROBE_TARGET_WIN_RATE)))
  return dist + (r.base.winRate > PROBE_WIN_RATE_MIN && r.base.winRate < PROBE_WIN_RATE_MAX ? 0 : 0.25)
}

/** Выбирает из зондов тот, у которого win rate ближе к 50 % (и исход заметнее зависит от статов). */
function bestProbe(cands: StatWeightsResult[]): StatWeightsResult | null {
  const usable = cands.filter((r) => r.base.winRate > PROBE_WIN_RATE_MIN && r.base.winRate < PROBE_WIN_RATE_MAX)
  const pool = usable.length > 0 ? usable : cands
  let best: StatWeightsResult | null = null
  for (const r of pool) {
    if (best == null) {
      best = r
      continue
    }
    const d = probeRank(r) - probeRank(best)
    if (d < 0 || (d === 0 && discrimination(r) > discrimination(best))) best = r
  }
  return best
}

/** Расчёт весов на заданном квесте; `displayQuest` — настоящий квест (для барьера). */
function computeAt(
  fighters: Fighter[],
  q: Quest,
  displayQuest: Quest,
  runs: number,
  seed: number,
  options: StatWeightsOptions,
  probe: StatWeightsResult['probe'] = null,
): StatWeightsResult {
  const sim = (fs: Fighter[]): SimMetrics => simulateTeam(fs, q, { runs, seed })
  const base = sim(fighters)
  // win rate на НАСТОЯЩЕМ квесте: на зонде он показывается отдельно (числа там — от ослабленного боя).
  const realWinRate = q === displayQuest ? base.winRate : simulateTeam(fighters, displayQuest, { runs, seed }).winRate
  // Метрика выбирается по win rate ЗОНДА (options.baseWinRate, если веса считаются на ослабленном
  // квесте): на настоящем квесте он может быть 0% или 100%, и «прирост win rate» ничего не объясняет.
  const qwin = options.baseWinRate ?? base.winRate

  const barrierEl = options.element ?? bestBarrierElement(fighters, displayQuest)
  const partyBonus = partyElementBonusPct(fighters)
  const shares = threatShares(fighters)

  const heroes: HeroStatWeights[] = fighters.map((f, i) => {
    const ownElement = (Object.keys(f.elements) as Element[])[0] ?? null
    const steps: FighterBonus[] = [
      { crit: STAT_WEIGHT_CRIT_PCT / 100 },
      { critDmg: STAT_WEIGHT_CRIT_DMG_PCT / 100 },
      { eva: STAT_WEIGHT_EVA_PCT / 100 },
      { atk: (f.atk * STAT_WEIGHT_MAIN_PCT) / 100 },
      { hp: (f.hp * STAT_WEIGHT_MAIN_PCT) / 100 },
      { def: (f.def * STAT_WEIGHT_MAIN_PCT) / 100 },
      { element: STAT_WEIGHT_ELEMENT },
      { threat: STAT_WEIGHT_THREAT },
    ]
    const weights = STAT_WEIGHT_STATS.map((stat, si) => {
      const fs = fighters.map((x, j) => (j === i ? applyFighterBonus(x, steps[si]) : x))
      const m = sim(fs)
      return {
        stat,
        stepLabel: statStepLabel(stat, stat === 'element' ? (barrierEl ?? ownElement) : null),
        plus: steps[si],
        winRatePp: round(m.winRate - base.winRate),
        damagePct: base.avgDamagePerRound > 0 ? round(m.avgDamagePerRound / base.avgDamagePerRound - 1) : 0,
        minSurvivorHpPp: round(m.avgMinSurvivorHpPct - base.avgMinSurvivorHpPct),
        metric: metricOf(qwin, stat),
      }
    })
    const best = bestStat(weights, qwin)
    const b = best ? weights.find((w) => w.stat === best)! : null
    return {
      index: i,
      name: f.name,
      base: { atk: f.atk, def: f.def, hp: f.hp, crit: f.crit, critDmg: f.critDmg, eva: f.eva, threat: f.threat, element: ownElement ? (f.elements[ownElement] ?? 0) : 0 },
      weights,
      best,
      headline: b ? headlineFor(b) : 'Статы героя на этом квесте исход не меняют.',
      meaningful: weights.some((w) => w.winRatePp !== 0 || w.damagePct !== 0 || w.minSurvivorHpPp !== 0),
    }
  })

  const team = {} as Record<StatWeightStat, number>
  for (const st of STAT_WEIGHT_STATS) {
    team[st] = round(heroes.reduce((a, h) => a + (h.weights.find((w) => w.stat === st)?.[metricOf(qwin, st)] ?? 0), 0))
  }

  const topThreatIndex = shares.length > 0 ? shares.indexOf(Math.max(...shares)) : -1
  return {
    runs,
    seed,
    base: {
      winRate: base.winRate,
      avgRounds: base.avgRounds,
      avgDamagePerRound: base.avgDamagePerRound,
      avgMinSurvivorHpPct: base.avgMinSurvivorHpPct,
    },
    metric: metricOf(qwin),
    realWinRate,
    heroes,
    team,
    threat: fighters.map((f, i) => ({ index: i, name: f.name, threat: f.threat, share: round(shares[i]) })),
    topThreatIndex,
    barrier: barrierInfo(fighters, displayQuest, barrierEl, partyBonus),
    probe,
  }
}

function bestStat(weights: StatWeight[], baseWinRate: number): StatWeightStat | null {
  let best: StatWeight | null = null
  for (const w of weights) {
    const v = metricValue(w, baseWinRate)
    if (v <= 0) continue
    if (!best || v > metricValue(best, baseWinRate)) best = w
  }
  // Всё нулевое или в минусе — показываем хоть что-то осмысленное: сначала выживаемость, потом урон.
  if (!best) for (const w of weights) if (w.minSurvivorHpPp > 0 && (!best || w.minSurvivorHpPp > best.minSurvivorHpPp)) best = w
  if (!best) for (const w of weights) if (w.damagePct > 0 && (!best || w.damagePct > best.damagePct)) best = w
  return best?.stat ?? null
}

/** Одна фраза «Главное для героя: …»: у защитных статов на насыщенном квесте — выживаемость, у атакующих — урон. */
function headlineFor(w: StatWeight): string {
  const label = STAT_FULL_LABEL[w.stat]
  if (w.metric === 'winRatePp' && w.winRatePp > 0) {
    return `Главное для героя: ${label}: ${w.stepLabel} ≈ +${(w.winRatePp * 100).toFixed(1)} п.п. win rate`
  }
  if (w.metric === 'minSurvivorHpPp' && w.minSurvivorHpPp > 0) {
    return `Главное для героя: ${label}: ${w.stepLabel} ≈ +${(w.minSurvivorHpPp * 100).toFixed(1)} п.п. мин. HP выжившего`
  }
  const dmg = `${w.damagePct >= 0 ? '+' : ''}${(w.damagePct * 100).toFixed(1)}% урона`
  const hp = w.metric === 'damagePct' && w.minSurvivorHpPp > 0 ? `, +${(w.minSurvivorHpPp * 100).toFixed(1)} п.п. мин. HP` : ''
  return `Главное для героя: ${label}: ${w.stepLabel} ≈ ${dmg}${hp}`
}

/**
 * Совет по семенам из уже посчитанных весов статов: прибавка за одно семя — плоское число из
 * таблицы SEED_STAT_PER_SEED (A55), поэтому одно семя = тот же шаг, что и у веса ATK/HP/DEF.
 * Отдельной симуляции не нужно — веса ATK/HP/DEF уже посчитаны.
 */
export function seedAdviceFromWeights(
  weights: StatWeightsResult,
  perSeed: Record<'atk' | 'hp' | 'def', number>,
  heroIndex = 0,
): SeedAdvice {
  const hero = weights.heroes[heroIndex]
  if (!hero) return { rows: [], best: null, text: 'Нет героя для совета по семенам.' }
  const kinds: ('atk' | 'hp' | 'def')[] = ['atk', 'hp', 'def']
  const rows: SeedAdviceRow[] = kinds.map((kind) => {
    const w = hero.weights.find((x) => x.stat === kind)!
    const scaled: StatWeight = {
      ...w,
      stepLabel: `+${perSeed[kind]} ${kind.toUpperCase()}`,
      plus: { [kind]: perSeed[kind] } as FighterBonus,
    }
    return {
      kind,
      label: kind.toUpperCase(),
      perSeed: perSeed[kind],
      weight: scaled,
      seedsPerPp: scaled.winRatePp > 0 ? Math.ceil(0.01 / scaled.winRatePp) : null,
    }
  })
  const best = bestSeedKind(rows)
  return { rows, best, text: seedText(rows, best, hero.name) }
}

/**
 * Совет по семенам силы: какое одно семя (ATK/HP/DEF) даёт больше на этого героя.
 * Прибавка за семя — из таблицы SEED_STAT_PER_SEED (constants.ts, ASSUMPTION A55).
 */
export function seedAdvice(
  fighters: Fighter[],
  quest: Quest,
  perSeed: Record<'atk' | 'hp' | 'def', number>,
  options: StatWeightsOptions & { heroIndex?: number } = {},
): SeedAdvice {
  const idx = options.heroIndex ?? 0
  const f = fighters[idx]
  if (!f) return { rows: [], best: null, text: 'Нет героя для совета по семенам.' }
  const runs = options.runs ?? STAT_WEIGHT_RUNS
  const seed = (options.seed ?? 1) >>> 0
  const sim = (fs: Fighter[]): SimMetrics => simulateTeam(fs, quest, { runs, seed })
  const base = sim(fighters)
  const kinds: ('atk' | 'hp' | 'def')[] = ['atk', 'hp', 'def']
  const rows: SeedAdviceRow[] = kinds.map((kind) => {
    const add = perSeed[kind]
    const bonus: FighterBonus = kind === 'atk' ? { atk: add } : kind === 'hp' ? { hp: add } : { def: add }
    const m = sim(fighters.map((x, j) => (j === idx ? applyFighterBonus(x, bonus) : x)))
    const winRatePp = round(m.winRate - base.winRate)
    return {
      kind,
      label: kind === 'atk' ? 'ATK' : kind === 'hp' ? 'HP' : 'DEF',
      perSeed: add,
      weight: {
        stat: kind,
        stepLabel: `+${add} ${kind === 'atk' ? 'ATK' : kind === 'hp' ? 'HP' : 'DEF'}`,
        plus: bonus,
        winRatePp,
        damagePct: base.avgDamagePerRound > 0 ? round(m.avgDamagePerRound / base.avgDamagePerRound - 1) : 0,
        minSurvivorHpPp: round(m.avgMinSurvivorHpPct - base.avgMinSurvivorHpPct),
        metric: metricOf(base.winRate, kind),
      },
      seedsPerPp: winRatePp > 0 ? Math.ceil(0.01 / winRatePp) : null,
    }
  })
  const best = bestSeedKind(rows)
  return { rows, best, text: seedText(rows, best, f.name) }
}

function bestSeedKind(rows: SeedAdviceRow[]): SeedAdviceRow['kind'] | null {
  let best: SeedAdviceRow | null = null
  for (const r of rows) {
    const v = r.weight[r.weight.metric]
    if (v <= 0) continue
    if (!best || v > best.weight[best.weight.metric]) best = r
  }
  if (!best) for (const r of rows) if (r.weight.minSurvivorHpPp > 0 && (!best || r.weight.minSurvivorHpPp > best.weight.minSurvivorHpPp)) best = r
  if (!best) for (const r of rows) if (r.weight.damagePct > 0 && (!best || r.weight.damagePct > best.weight.damagePct)) best = r
  return best?.kind ?? null
}

function seedText(rows: SeedAdviceRow[], best: SeedAdviceRow['kind'] | null, name: string): string {
  if (!best) return `Семена силы на ${name} при этом квесте исход не меняют — тратить не обязательно.`
  const r = rows.find((x) => x.kind === best)!
  const m = r.weight.metric
  const value =
    m === 'winRatePp'
      ? `+${(r.weight.winRatePp * 100).toFixed(2)} п.п. win rate`
      : m === 'minSurvivorHpPp'
        ? `+${(r.weight.minSurvivorHpPp * 100).toFixed(2)} п.п. мин. HP выжившего`
        : `+${(r.weight.damagePct * 100).toFixed(2)}% урона`
  const per = r.seedsPerPp != null && r.seedsPerPp > 1 && r.seedsPerPp < 1000 ? ` (≈${r.seedsPerPp} семян до +1 п.п. win rate)` : ''
  return `Лучшие семена для ${name}: ${r.label} — одно семя (+${r.perSeed}) даёт ${value}${per}.`
}

function threatShareOf(fighters: Fighter[], i: number): number {
  const s = threatShares(fighters)
  return s[i] ?? 0
}

/** Доля атак босса по бойцу (для подсказок UI). */
export const shareOf = threatShareOf

/**
 * Подсказка по угрозе в отряде: если ДД принимает удары чаще танка — удары достаются тому,
 * кто бьёт сильнее (в бою монстр выбирает цель по угрозе).
 */
export function threatWarning(weights: StatWeightsResult, tankIndex: number | null): string | null {
  if (tankIndex == null || weights.threat.length < 2) return null
  const tank = weights.threat[tankIndex]
  if (!tank) return null
  const worst = weights.threat.filter((t) => t.index !== tankIndex).reduce((a, b) => (b.share > a.share ? b : a))
  if (worst.share <= tank.share + 0.05) return null
  return `${worst.name} получает ${(worst.share * 100).toFixed(0)} % ударов босса — больше танка ${tank.name} (${(tank.share * 100).toFixed(0)} %). Угроза у ДД выше танка: удары достаются тому, кто бьёт сильнее.`
}

/** Стихия барьера, к которой отряд ближе всего (её и предлагаем набирать). */
export function bestBarrierElement(fighters: Fighter[], quest: Quest): Element | null {
  const b = quest.barrier
  if (!b) return null
  let best: Element | null = null
  let bestVal = -1
  for (const el of b.elements) {
    const v = fighters.reduce((a, f) => a + (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100), 0)
    if (v > bestVal) {
      bestVal = v
      best = el
    }
  }
  return best
}

/** Вклад отряда в барьер: собранная стихия, дефицит, вклад каждого бойца. */
export function barrierInfo(fighters: Fighter[], quest: Quest, element: Element | null = null, partyBonusPct = 0): BarrierInfo | null {
  const b = quest.barrier
  if (!b) return null
  const bonus = 1 + partyBonusPct / 100
  const el = element ?? bestBarrierElement(fighters, quest)
  const { elements, values } = elementContributions(fighters, quest)
  const col = el ? elements.indexOf(el) : -1
  const contributions = fighters.map((f, i) => ({ index: i, name: f.name, value: col >= 0 ? values[i][col] * bonus : 0 }))
  const have = Math.round(contributions.reduce((a, c) => a + c.value, 0))
  return { bestElement: el, hp: b.hp, have, missing: Math.max(0, b.hp - have), broken: have >= b.hp, contributions }
}

/** «+N% party Element bonus VS Elemental Barriers» (Rudo) — общий множитель стихии отряда (A9). */
export function partyElementBonusPct(fighters: Fighter[]): number {
  return fighters.reduce((a, f) => Math.max(a, parseSpecials(f.skills).elemBarrierBonusPct), 0)
}
