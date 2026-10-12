/**
 * Калибровка симуляции по отметкам пользователя «проходит / не проходит в игре».
 *
 * Отметки копятся в браузере (`src/data/realityChecks.ts`), экспорт — JSON. Здесь мы
 *  1) пересчитываем предсказание симуляции на каждую отметку и считаем метрики:
 *     доля верных (порог 50 %), Brier score и разрезы ошибок (класс, квест, сложность,
 *     экстрим/барьер, стихия);
 *  2) прогоняем наборы вариантов допущений из ASSUMPTIONS.md (множители качества, бонус
 *     сродства, крит врага, AoE, кривая защиты, база HP) и ранжируем их по влиянию на ошибку;
 *  3) подбираем 2–3 самых влиятельных параметра, не ломая сверку статов по fixtures/heroes.txt.
 *
 * Модуль чистый: без DOM, без ввода-вывода (скрипт `scripts/calibrate.ts` — обёртка).
 * Допущение метода: игра после боя показывает только «прошёл / не прошёл» и кто погиб. Поэтому
 * Brier score считается (а) по бинарному исходу и (б) по смерти каждого героя (если она отмечена),
 * а не по доле HP или раундам — их в игре не видно.
 *
 * 4) «что отметить»: квесты, где варианты допущений сильнее всего расходятся по win rate для
 *    текущих героев (`questsToCheck`) — бой там лучше всего различит варианты.
 */
import type { Champion, GameData, HeroInstance, Quest } from '../data/types.ts'
import type { RealityCheck } from '../data/realityChecks.ts'
import { CALIBRATION_DEATH_BRIER_WEIGHT, CHECK_SUGGEST_MIN_SPREAD, CHECK_SUGGEST_RUNS, CHECK_SUGGEST_TOP, DEFAULT_SIM_RUNS } from './constants.ts'
import { type CombatModel, fighterFromChampion, resolveCombatModel, fighterFromHero, simulateTeam, type Fighter, type SimMetrics } from './combat.ts'
import { calcStats, DEFAULT_MODEL, effectiveClass, MAIN_STATS, type MainStat, type StatModel } from './stats.ts'

/** Эталонные статы героя из экспорта TitansDB (fixtures/heroes.txt) — для проверки сверки. */
export interface ReferenceStats {
  atk: number
  def: number
  hp: number
}

/** Отметка вместе с тем, что нужно для пересчёта предсказания. */
export interface PredictionInput {
  check: RealityCheck
  quest: Quest
  /** Герои отряда отметки (порядок — как выбирал пользователь). */
  heroes: HeroInstance[]
  /** Чемпион, если он был в отряде (в отметке хранится только его имя в teamLabel). */
  champion?: { champion: Champion; rank: number } | null
}

// ───────────────────────────── прогноз ─────────────────────────────

export interface PredictionOptions {
  /** Прогонов Монте-Карло на отметку (по умолчанию DEFAULT_SIM_RUNS). */
  runs?: number
  /** Базовый seed; каждая отметка получает свой сдвиг от него. */
  seed?: number
  /** Сдвиг seed для варианта модели: варианты не должны переиспользовать одни и те же прогоны. */
  seedOffset?: number
  model?: StatModel
  /** Параметры боя: кривая защиты, крит врага, AoE, барьер (A30/A31/A9). */
  combat?: CombatModel
  /** Брать базу статов из эталона экспорта (A8) — по умолчанию да. */
  useReference?: boolean
}

/** Боец отметки: то, с чем он вошёл в бой (статы, стихия, угроза). */
export interface PredictionFighterInfo {
  name: string
  kind: 'hero' | 'champion'
  className: string | null
  group: string | null
  element: string | null
  level: number | null
  atk: number
  def: number
  hp: number
  elementValue: number
  threat: number
  crit: number
  eva: number
}

export interface PredictionRecord {
  check: RealityCheck
  quest: Quest
  teamLabel: string
  heroes: HeroInstance[]
  champion: { name: string; rank: number } | null
  fighters: PredictionFighterInfo[]
  /** Пробит ли стихийный барьер квеста этой экипировкой (A9). */
  barrierBroken: boolean
  metrics: SimMetrics
  /** Предсказание симуляции: win rate 0..1. */
  predicted: number
  /** Исход в игре: 1 — отметка «проходит», 0 — «не проходит» (см. outcomeOf). */
  outcome: 0 | 1
  /** Совпало ли предсказание с отметкой при пороге 50 % (см. predictionMatches). */
  matched: boolean
  /** Промах: −1 — предсказали ≥50 %, а в игре не прошло; +1 — наоборот; 0 — совпало. */
  error: -1 | 0 | 1
  /** Что сохранила отметка в момент постановки (win rate «тогда») — для сравнения с пересчётом. */
  storedWinRate: number
  /** Смерть каждого бойца: предсказание и отметка; null — кто погиб, в отметке неизвестно. */
  deaths: DeathPrediction[] | null
}

/** Смерть одного бойца в бою отметки: доля боёв симуляции, где он погиб, против отметки. */
export interface DeathPrediction {
  name: string
  /** Доля прогонов симуляции, где боец погиб (SimMetrics.survival[].deathRate). */
  predicted: number
  /** 1 — в игре погиб, 0 — выжил. */
  outcome: 0 | 1
}

const normName = (s: string): string => s.trim().toLowerCase()

/**
 * Пары «предсказание смерти ↔ отметка» по бойцам отряда. Бойцы сопоставляются по имени
 * (в отметке — имена из `teamLabel`); отметка без `deadHeroes` — null (неизвестно).
 */
export function deathPredictions(check: RealityCheck, metrics: SimMetrics): DeathPrediction[] | null {
  if (check.deadHeroes === undefined) return null
  const dead = new Set(check.deadHeroes.map(normName))
  return metrics.survival.map((s) => ({ name: s.name, predicted: s.deathRate, outcome: dead.has(normName(s.name)) ? 1 : 0 }))
}

/** Симуляция одного квеста для героев и чемпиона одной отметки. */
export function runPrediction(input: PredictionInput, data: GameData, options: PredictionOptions = {}, index = 0): PredictionRecord {
  const { check, quest, heroes, champion = null } = input
  const statOpts = {
    model: options.model ?? DEFAULT_MODEL,
    ...(options.useReference === undefined ? {} : { useReference: options.useReference }),
  }
  const fighters: Fighter[] = heroes.map((h) => fighterFromHero(h, data, statOpts))
  const championFighter = champion ? fighterFromChampion(champion.champion, champion.rank, data) : null
  const all = championFighter ? [...fighters, championFighter] : fighters
  const seed = ((options.seed ?? 1) >>> 0) + (options.seedOffset ?? 0) + index * 7919
  const metrics = simulateTeam(all, quest, { runs: options.runs ?? DEFAULT_SIM_RUNS, seed, model: options.combat })
  const predicted = metrics.winRate
  return {
    check,
    quest,
    teamLabel: check.teamLabel,
    heroes,
    champion: champion ? { name: champion.champion.name, rank: champion.rank } : null,
    fighters: describeFighters(fighters, championFighter, heroes, data),
    barrierBroken: prepareBarrier(all, quest),
    metrics,
    predicted,
    outcome: outcomeOf(check),
    matched: predictionMatches(check, predicted),
    error: predictionError(check, predicted),
    storedWinRate: check.simWinRate,
    deaths: deathPredictions(check, metrics),
  }
}

/**
 * Исход в игре как число: 1 — «проходит», 0 — «не проходит». Бинарность отметки — свойство
 * источника (пользователь отмечает «прошёл / не прошёл»), а не упрощение: доля выживших в игре
 * неизвестна. От неё зависит Brier score.
 */
export const outcomeOf = (check: RealityCheck): 0 | 1 => (check.passed ? 1 : 0)

/** Промах: −1 — предсказали ≥50 %, а в игре не прошло; +1 — наоборот; 0 — совпало. */
export const predictionError = (check: RealityCheck, predicted: number): -1 | 0 | 1 =>
  predictionMatches(check, predicted) ? 0 : check.passed ? 1 : -1

/** Совпало ли предсказание с отметкой при пороге win rate 50 % (та же логика, что в UI). */
export const predictionMatches = (check: RealityCheck, predicted: number): boolean => check.passed === predicted >= 0.5

/** Статы бойцов «как в бою» — для разрезов ошибок и отчёта. */
function describeFighters(fighters: Fighter[], champion: Fighter | null, heroes: HeroInstance[], data: GameData): PredictionFighterInfo[] {
  const out: PredictionFighterInfo[] = []
  fighters.forEach((f, i) => {
    const hero = heroes[i]
    const cls = hero ? effectiveClass(hero, data) : undefined
    out.push({
      name: f.name,
      kind: 'hero',
      className: cls?.name ?? hero?.className ?? null,
      group: f.group ?? null,
      element: cls?.element ?? null,
      level: hero?.level ?? null,
      atk: f.atk,
      def: f.def,
      hp: f.hp,
      elementValue: elementOf(f),
      threat: f.threat,
      crit: f.crit,
      eva: f.eva,
    })
  })
  if (champion) {
    out.push({
      name: champion.name,
      kind: 'champion',
      className: null,
      group: champion.group ?? null,
      element: null,
      level: null,
      atk: champion.atk,
      def: champion.def,
      hp: champion.hp,
      elementValue: elementOf(champion),
      threat: champion.threat,
      crit: champion.crit,
      eva: champion.eva,
    })
  }
  return out
}

/** Стихия бойца в бою (одна — своя; для «Any»-классов берём первую из камней). */
function elementOf(f: Fighter): number {
  let sum = 0
  for (const v of Object.values(f.elements)) sum += v ?? 0
  return sum
}

/** Пробит ли барьер — копия логики combat.ts без учёта лидерских бонусов барьера. */
function prepareBarrier(fighters: Fighter[], quest: Quest): boolean {
  if (!quest.barrier) return true
  for (const el of quest.barrier.elements) {
    let v = 0
    for (const f of fighters) v += (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100)
    if (v >= quest.barrier.hp) return true
  }
  return false
}

// ───────────────────────────── метрики ─────────────────────────────

export interface GroupStat {
  key: string
  n: number
  /** Совпадений при пороге win rate 50 %. */
  matched: number
  /** Доля фактических «проходит» среди отметок группы. */
  actualPassRate: number
  /** Средний предсказанный win rate в группе. */
  meanPredicted: number
  /** Предсказали «проходит», в игре не прошло. */
  over: number
  /** Предсказали «не проходит», в игре прошло. */
  under: number
}

export interface CalibrationSummary {
  n: number
  matched: number
  /** Доля верных при пороге win rate 50 %. */
  agreement: number
  /** Средний Brier score: mean((predicted − outcome)²). 0 — идеально, 0.25 — «всегда 0.5». */
  brier: number
  /** Согласие по хранившимся отметкам (win rate на момент постановки) — «тогда» против «сейчас». */
  agreementStored: number
  /** Brier по хранившимся отметкам. */
  brierStored: number
  /** Доля отметок «проходит в игре». */
  passRate: number
  meanPredicted: number
  /** Систематическая ошибка в долях: over − under. */
  bias: number
  /** Сколько пар «боец ↔ отметка смерти» (только отметки, где известно, кто погиб). */
  deathN: number
  /** Brier по смерти каждого бойца: mean((доля смертей в симуляции − погиб)²); 0 при deathN = 0. */
  deathBrier: number
  /** Доля верных по смерти при пороге 50 %: «погиб» ↔ доля смертей ≥ 50 %. */
  deathAgreement: number
}

export function calibrationSummary(records: PredictionRecord[]): CalibrationSummary {
  const n = records.length
  if (n === 0) {
    return { n: 0, matched: 0, agreement: 0, brier: 0, agreementStored: 0, brierStored: 0, passRate: 0, meanPredicted: 0, bias: 0, deathN: 0, deathBrier: 0, deathAgreement: 0 }
  }
  let deathN = 0
  let deathBrier = 0
  let deathMatched = 0
  let matched = 0
  let matchedStored = 0
  let brier = 0
  let brierStored = 0
  let predicted = 0
  let outcome = 0
  let bias = 0
  for (const r of records) {
    // Считаем по полям отметки и предсказанию, а не по сохранённым в записи `matched`/`error`:
    // так сводка остаётся верной, даже если `predicted` пересчитан (например, в тестах).
    if (predictionMatches(r.check, r.predicted)) matched++
    if (predictionMatches(r.check, r.storedWinRate)) matchedStored++
    const o = outcomeOf(r.check)
    brier += (r.predicted - o) ** 2
    brierStored += (r.storedWinRate - o) ** 2
    predicted += r.predicted
    outcome += o
    bias += predictionError(r.check, r.predicted)
    for (const d of r.deaths ?? []) {
      deathN++
      deathBrier += (d.predicted - d.outcome) ** 2
      if ((d.outcome === 1) === (d.predicted >= 0.5)) deathMatched++
    }
  }
  return {
    n,
    matched,
    agreement: matched / n,
    brier: brier / n,
    agreementStored: matchedStored / n,
    brierStored: brierStored / n,
    passRate: outcome / n,
    meanPredicted: predicted / n,
    bias: bias / n,
    deathN,
    deathBrier: deathN > 0 ? deathBrier / deathN : 0,
    deathAgreement: deathN > 0 ? deathMatched / deathN : 0,
  }
}

export type GroupBy = 'class' | 'quest' | 'difficulty' | 'variant' | 'barrier' | 'extreme' | 'hero'

/** Разрезы ошибок: классы, квесты, сложность, обычный/босс, барьер, Extreme и сам герой. */
export function groupStats(records: PredictionRecord[], by: GroupBy): GroupStat[] {
  const buckets = new Map<string, PredictionRecord[]>()
  const keysOf = (r: PredictionRecord): string[] => {
    switch (by) {
      case 'class': {
        const keys = r.heroes.map((h) => h.className)
        if (r.champion) keys.push('чемпион')
        return keys.length > 0 ? keys : ['(неизвестно)']
      }
      case 'quest':
        return [r.check.questLabel || `${r.quest.area} · ${r.quest.difficulty}`]
      case 'difficulty':
        return [r.quest.difficulty]
      case 'variant':
        return [r.quest.variant === 'normal' ? 'обычный' : r.quest.variant === 'miniboss' ? 'мини-босс' : 'босс']
      case 'barrier':
        return [r.quest.barrier ? (r.barrierBroken ? 'барьер пробит' : 'барьер НЕ пробит') : 'без барьера']
      case 'extreme':
        return [r.quest.difficulty === 'Extreme' ? 'Extreme' : 'не Extreme']
      case 'hero':
        return [...r.heroes.map((h) => h.name), ...(r.champion ? [r.champion.name] : [])]
    }
  }
  for (const r of records) {
    for (const k of keysOf(r)) {
      const arr = buckets.get(k)
      if (arr) arr.push(r)
      else buckets.set(k, [r])
    }
  }
  const out: GroupStat[] = []
  for (const [key, arr] of buckets) {
    const s = calibrationSummary(arr)
    let over = 0
    let under = 0
    for (const r of arr) {
      const err = predictionError(r.check, r.predicted)
      if (err === -1) over++
      else if (err === 1) under++
    }
    out.push({ key, n: s.n, matched: s.matched, actualPassRate: s.passRate, meanPredicted: s.meanPredicted, over, under })
  }
  return out.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
}

/** Группы, где модель ошибается чаще всего (учитывает группы не меньше minN отметок). */
export interface GroupError extends GroupStat {
  errRate: number
}

export function worstGroups(records: PredictionRecord[], by: GroupBy, minN = 2): GroupError[] {
  return groupStats(records, by)
    .filter((g) => g.n >= minN)
    .map((g) => ({ ...g, errRate: 1 - g.matched / g.n }))
    .sort((a, b) => b.errRate - a.errRate || b.n - a.n)
}

// ───────────────────────────── варианты допущений ─────────────────────────────

/**
 * Вариант модели: переопределение стат-модели и параметров боя относительно базовых.
 * `id` стабилен — по нему вариант попадает в отчёт; `assumption` — пункт ASSUMPTIONS.md.
 */
export interface ModelVariant {
  id: string
  label: string
  /** Пункт docs/ASSUMPTIONS.md, который вариант проверяет. */
  assumption: string
  stat?: Partial<StatModel>
  combat?: CombatModel
}

// Значения по умолчанию — из constants.ts (через resolveCombatModel), а не копией чисел.
const DEFAULT_COMBAT: Required<{ [K in keyof CombatModel]-?: CombatModel[K] }> = resolveCombatModel()

/** Допущения, проверяемые вариантом: сверка статов (A5–A8, A25) и симулятор (A9, A30, A31). */
export const MODEL_VARIANTS: ModelVariant[] = [
  { id: 'base', label: 'базовая модель', assumption: '—' },

  // множители качества (A7)
  {
    id: 'quality-mult-low',
    label: 'все множители качества ×0.9 (Flawless 1.35, Epic 1.8, Legendary 2.7)',
    assumption: 'A7',
    stat: { quality: { Normal: 1, Superior: 1.125, Flawless: 1.35, Epic: 1.8, Legendary: 2.7 } },
  },
  {
    id: 'quality-mult-high',
    label: 'все множители качества ×1.1 (Superior 1.375, Flawless 1.65, Epic 2.2, Legendary 3.3)',
    assumption: 'A7',
    stat: { quality: { Normal: 1, Superior: 1.375, Flawless: 1.65, Epic: 2.2, Legendary: 3.3 } },
  },

  // бонус сродства (A5, A6)
  { id: 'affinity-none', label: 'бонус сродства ×1 (выключен)', assumption: 'A6', stat: { elementAffinity: 1, spiritAffinity: 1 } },
  { id: 'affinity-2', label: 'бонус сродства ×2 (стихия и дух)', assumption: 'A6', stat: { elementAffinity: 2, spiritAffinity: 2 } },
  { id: 'affinity-scope-stone', label: 'сродство усиливает только камень (AFFINITY_SCOPE = stone)', assumption: 'A6', stat: { affinityScope: 'stone' } },
  // SPIRIT_PLUS_RULE в StatModel не входит — вариант проверяет только усиление статов духа сродством.
  { id: 'spirit-affinity-off', label: 'сродство духа не усиливает его статы (SPIRIT_AFFINITY_MULTIPLIER = 1)', assumption: 'A5', stat: { spiritAffinity: 1 } },

  // база HP героя (A8)
  { id: 'hp-growth-0', label: 'рост базы HP выключен (база = статы 1-го уровня)', assumption: 'A8', stat: { hpGrowthMult: 0 } },
  { id: 'hp-growth-0.5', label: 'рост базы HP ×0.5', assumption: 'A8', stat: { hpGrowthMult: 0.5 } },
  { id: 'hp-growth-1.5', label: 'рост базы HP ×1.5', assumption: 'A8', stat: { hpGrowthMult: 1.5 } },

  // вторичные статы предметов (A25)
  { id: 'typed-def-on', label: '«stats with <тип>» усиливает и DEF (TYPED_ITEM_BONUS_STATS = atk, hp, def)', assumption: 'A25', stat: { typedBonusStats: ['atk', 'hp', 'def'] } },

  // бой (A9, A30, A31, A70, A73)
  { id: 'enemy-crit-0', label: 'крит врага 0 %', assumption: 'A30', combat: { enemyCritChance: 0 } },
  { id: 'enemy-crit-0.25', label: 'крит врага 25 %', assumption: 'A30', combat: { enemyCritChance: 0.25 } },
  { id: 'aoe-0', label: 'AoE выключено', assumption: 'A31', combat: { aoeChance: 0 } },
  { id: 'aoe-0.2', label: 'шанс AoE 20 % (нижняя граница компендиума)', assumption: 'A31', combat: { aoeChance: 0.2 } },
  { id: 'aoe-0.5', label: 'шанс AoE 50 % (особые квесты/враги по stcalc)', assumption: 'A70', combat: { aoeChance: 0.5 } },
  { id: 'enemy-crit-0.15', label: 'крит врага 15 % (как в Гробнице Титанов по датасету stcalc)', assumption: 'A70', combat: { enemyCritChance: 0.15 } },
  {
    id: 'turn-order-shuffle',
    label: 'отряд перемешивается каждый раунд (stcalc), а не фиксированный порядок компендиума',
    assumption: 'A73',
    combat: { turnOrder: 'shuffle' },
  },
  {
    id: 'def-curve-strong',
    label: 'кривая защиты сильнее: 0.45/0.25/0.20, при DEF=0 ×2.1',
    assumption: 'A30',
    combat: { mitigation: { at50: 0.45, at70: 0.25, at75: 0.2 }, enemyDmgMaxFactor: 2.1 },
  },
  {
    id: 'def-curve-weak',
    label: 'кривая защиты слабее: 0.55/0.35/0.30, при DEF=0 ×1.9',
    assumption: 'A30',
    combat: { mitigation: { at50: 0.55, at70: 0.35, at75: 0.3 }, enemyDmgMaxFactor: 1.9 },
  },
  { id: 'barrier-0.1', label: 'непробитый барьер: урон отряда ×0.1', assumption: 'A9', combat: { barrierUnbrokenFactor: 0.1 } },
  { id: 'barrier-0.4', label: 'непробитый барьер: урон отряда ×0.4', assumption: 'A9', combat: { barrierUnbrokenFactor: 0.4 } },
  {
    id: 'pct-multiplicative',
    label: '% боя (ауры, условные навыки) умножаются поверх % карточки, а не суммируются',
    assumption: 'A62',
    combat: { pctStacking: 'multiplicative' },
  },
  {
    id: 'negative-eva-absolute',
    label: 'крит по отрицательному EVA задаёт шанс сам (0 EVA на Extreme → 5%, а не 15%)',
    assumption: 'A59',
    combat: { negativeEvaCrit: 'absolute' },
  },
]

const fmtValue = (v: unknown): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))

/** Описание того, чем вариант отличается от базовой модели (значения параметров). */
export function describeVariant(variant: ModelVariant): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(variant.stat ?? {})) {
    parts.push(`${k}: ${fmtValue((DEFAULT_MODEL as unknown as Record<string, unknown>)[k])} → ${fmtValue(v)}`)
  }
  for (const [k, v] of Object.entries(variant.combat ?? {})) {
    parts.push(`${k}: ${fmtValue((DEFAULT_COMBAT as unknown as Record<string, unknown>)[k])} → ${fmtValue(v)}`)
  }
  return parts.join('; ') || 'без изменений'
}

/** Модель варианта: базовые значения (или свои) + переопределения варианта. */
export function variantModel(variant: ModelVariant, base: StatModel = DEFAULT_MODEL): StatModel {
  return { ...base, ...variant.stat }
}

// ───────────────────────────── чувствительность ─────────────────────────────

export interface FixtureHeroes {
  data: GameData
  heroes: HeroInstance[]
  /** Эталонные статы из экспорта TitansDB по герою. */
  reference: (h: HeroInstance) => ReferenceStats
}

/** RMS относительной ошибки модели статов (без эталона) по героям фикстуры. */
export function fixtureStatRms(f: FixtureHeroes, model: StatModel = DEFAULT_MODEL): Record<MainStat, number> {
  const errs: Record<MainStat, number[]> = { atk: [], def: [], hp: [] }
  for (const h of f.heroes) {
    const s = calcStats(h, f.data, { useReference: false, model })
    const ref = f.reference(h)
    for (const st of MAIN_STATS) errs[st].push(ref[st] > 0 ? s[st] / ref[st] - 1 : 0)
  }
  const rms = (xs: number[]): number => (xs.length === 0 ? 0 : Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length))
  return { atk: rms(errs.atk), def: rms(errs.def), hp: rms(errs.hp) }
}

/** Допустимое ухудшение сверки статов относительно базовой модели: сверку ломать нельзя. */
export const FIXTURE_RMS_GUARD = 0.005

/**
 * Сдвиг seed базового прогона. Один и тот же для прямого расчёта (`runPrediction` со `seedOffset`)
 * и для базового варианта в анализе чувствительности, иначе их Brier не сравнить: разные потоки
 * случайных чисел дают разный шум Монте-Карло на том же входе.
 */
export const CALIBRATION_BASE_SEED_OFFSET = 7_919_003

/** Одна строка анализа чувствительности: что стало с ошибкой предсказаний. */
export interface SensitivityRow {
  id: string
  label: string
  assumption: string
  /** Значения параметров, которыми вариант отличается от базового. */
  change: string
  summary: CalibrationSummary
  /** Изменение согласия в п.п. относительно базовой модели (положительное — лучше). */
  agreementDeltaPp: number
  /** Выигрыш по Brier относительно базовой модели (положительный — лучше). */
  brierDelta: number
  /** Выигрыш по Brier смертей героев относительно базовой модели (0, если погибшие нигде не отмечены). */
  deathBrierDelta: number
  /** Ошибка сверки статов по fixtures/heroes.txt (RMS, доли): насколько вариант ломает стат-модель. */
  fixtureRms: Record<MainStat, number>
}

export interface SensitivityArgs {
  records: PredictionInput[]
  data: GameData
  fixture?: FixtureHeroes
  runs?: number
  seed?: number
  useReference?: boolean
  variants?: ModelVariant[]
  onVariant?: (id: string, done: number, total: number) => void
}

/**
 * Прогон всех вариантов допущений: метрики предсказаний + ошибка сверки статов.
 * Каждый вариант получает свой сдвиг seed: иначе разница между вариантами тонула бы
 * в общем шуме Монте-Карло (один и тот же поток случайных чисел маскирует эффект параметра).
 */
export function sensitivityAnalysis(args: SensitivityArgs): SensitivityRow[] {
  const variants = args.variants ?? MODEL_VARIANTS
  const rows: SensitivityRow[] = []
  variants.forEach((variant, i) => {
    const model = variantModel(variant)
    const records = args.records.map((r, index) =>
      runPrediction(
        r,
        args.data,
        { runs: args.runs, seed: args.seed, seedOffset: 1_000_003 * i, model, combat: variant.combat, useReference: args.useReference },
        index,
      ),
    )
    rows.push({
      id: variant.id,
      label: variant.label,
      assumption: variant.assumption,
      change: describeVariant(variant),
      summary: calibrationSummary(records),
      agreementDeltaPp: 0,
      brierDelta: 0,
      deathBrierDelta: 0,
      fixtureRms: args.fixture ? fixtureStatRms(args.fixture, model) : { atk: 0, def: 0, hp: 0 },
    })
    args.onVariant?.(variant.id, i + 1, variants.length)
  })
  const base = rows.find((r) => r.id === 'base') ?? rows[0]
  if (base) {
    for (const r of rows) {
      r.agreementDeltaPp = (r.summary.agreement - base.summary.agreement) * 100
      r.brierDelta = base.summary.brier - r.summary.brier
      r.deathBrierDelta = base.summary.deathBrier - r.summary.deathBrier
    }
  }
  return rows
}

/** Варианты, сильнее всего меняющие ошибку (Brier исхода и смертей, согласие), — от самого влиятельного. */
export function rankInfluence(rows: SensitivityRow[]): SensitivityRow[] {
  const influence = (r: SensitivityRow): number => Math.abs(r.brierDelta) + Math.abs(r.deathBrierDelta) + Math.abs(r.agreementDeltaPp) / 100
  return [...rows].filter((r) => r.id !== 'base').sort((a, b) => influence(b) - influence(a))
}

// ───────────────────────────── подгонка параметров ─────────────────────────────

/** Крутилка калибровки: один параметр модели с диапазоном значений. */
export interface TuningKnob {
  id: string
  label: string
  assumption: string
  /** Значение по умолчанию. */
  from: number
  min: number
  max: number
  step: number
  /** Вариант с заданным значением параметра. */
  variant: (value: number) => ModelVariant
}

export const TUNING_KNOBS: TuningKnob[] = [
  {
    id: 'qualityScale',
    label: 'множители качества (все, кроме Normal)',
    assumption: 'A7',
    from: 1,
    min: 0.7,
    max: 1.4,
    step: 0.05,
    variant: (v) => ({
      id: `quality-scale-${v.toFixed(2)}`,
      label: `множители качества ×${v.toFixed(2)}`,
      assumption: 'A7',
      stat: { quality: { Normal: 1, Superior: 1.25 * v, Flawless: 1.5 * v, Epic: 2 * v, Legendary: 3 * v } },
    }),
  },
  {
    id: 'affinity',
    label: 'бонус сродства (стихия и дух)',
    assumption: 'A6',
    from: 1.5,
    min: 1,
    max: 2,
    step: 0.1,
    variant: (v) => ({
      id: `affinity-${v.toFixed(2)}`,
      label: `бонус сродства ×${v.toFixed(2)}`,
      assumption: 'A6',
      stat: { elementAffinity: v, spiritAffinity: v },
    }),
  },
  {
    id: 'enemyCrit',
    label: 'шанс крита врага',
    assumption: 'A30',
    from: 0.1,
    min: 0,
    max: 0.3,
    step: 0.05,
    variant: (v) => ({ id: `enemy-crit-${v.toFixed(2)}`, label: `крит врага ${(v * 100).toFixed(0)} %`, assumption: 'A30', combat: { enemyCritChance: v } }),
  },
  {
    id: 'aoe',
    label: 'шанс AoE врага',
    assumption: 'A31',
    from: 0.25,
    min: 0,
    max: 0.5,
    step: 0.05,
    variant: (v) => ({ id: `aoe-${v.toFixed(2)}`, label: `шанс AoE ${(v * 100).toFixed(0)} %`, assumption: 'A31', combat: { aoeChance: v } }),
  },
  {
    id: 'turnOrder',
    label: 'перемешивание отряда каждый раунд (0 — фиксированный порядок, 1 — как в stcalc)',
    assumption: 'A73',
    from: 0,
    min: 0,
    max: 1,
    step: 1,
    variant: (v) => ({
      id: `turn-order-${v}`,
      label: v >= 0.5 ? 'порядок ходов перемешивается каждый раунд' : 'порядок ходов фиксированный',
      assumption: 'A73',
      combat: { turnOrder: v >= 0.5 ? 'shuffle' : 'fixed' },
    }),
  },
  {
    id: 'mitigation',
    label: 'кривая защиты (множитель к 0.5/0.3/0.25)',
    assumption: 'A30',
    from: 1,
    min: 0.6,
    max: 1.4,
    step: 0.1,
    variant: (v) => ({
      id: `def-curve-${v.toFixed(2)}`,
      label: `кривая защиты ×${v.toFixed(2)}`,
      assumption: 'A30',
      combat: { mitigation: { at50: 0.5 * v, at70: 0.3 * v, at75: 0.25 * v } },
    }),
  },
  {
    id: 'hpGrowth',
    label: 'рост базы HP',
    assumption: 'A8',
    from: 1,
    min: 0,
    max: 2,
    step: 0.25,
    variant: (v) => ({ id: `hp-growth-${v.toFixed(2)}`, label: `рост базы HP ×${v.toFixed(2)}`, assumption: 'A8', stat: { hpGrowthMult: v } }),
  },
  {
    id: 'barrier',
    label: 'множитель урона при непробитом барьере',
    assumption: 'A9',
    from: 0.2,
    min: 0.05,
    max: 0.6,
    step: 0.05,
    variant: (v) => ({ id: `barrier-${v.toFixed(2)}`, label: `непробитый барьер ×${v.toFixed(2)}`, assumption: 'A9', combat: { barrierUnbrokenFactor: v } }),
  },
]

export interface TunedKnob {
  id: string
  label: string
  assumption: string
  from: number
  to: number
  brierBefore: number
  brierAfter: number
  deathBrierBefore: number
  deathBrierAfter: number
  agreementBefore: number
  agreementAfter: number
}

export interface TuningResult {
  values: Record<string, number>
  knobs: TunedKnob[]
  before: CalibrationSummary
  after: CalibrationSummary
  fixtureRmsBefore: Record<MainStat, number>
  fixtureRmsAfter: Record<MainStat, number>
  /** True — хотя бы один параметр сдвинулся и дал выигрыш по Brier. */
  improved: boolean
}

export interface TuningArgs {
  records: PredictionInput[]
  data: GameData
  fixture?: FixtureHeroes
  knobs?: TuningKnob[]
  /** Сколько самых влиятельных крутилок подгонять (по умолчанию 3). */
  maxKnobs?: number
  runs?: number
  seed?: number
  useReference?: boolean
  /** Минимальный выигрыш по Brier, при котором ход принимается. */
  minBrierGain?: number
  onStep?: (message: string) => void
}

/**
 * Цель подгонки: Brier исхода + Brier смертей героев (с весом CALIBRATION_DEATH_BRIER_WEIGHT).
 * Пока погибшие не отмечены ни в одной отметке, deathBrier = 0 и цель — просто Brier исхода.
 */
export const calibrationObjective = (s: CalibrationSummary): number => s.brier + CALIBRATION_DEATH_BRIER_WEIGHT * s.deathBrier

/**
 * Координатный спуск по самым влиятельным параметрам: крутим по одному и принимаем ход,
 * если цель (`calibrationObjective`) падает и сверка статов не выходит за FIXTURE_RMS_GUARD от базовой модели.
 * Число крутилок ограничено (по умолчанию 3) — «подгоняем не больше 2–3 параметров».
 */
export function tuneParameters(args: TuningArgs): TuningResult {
  const knobs = (args.knobs ?? TUNING_KNOBS).slice()
  const minGain = args.minBrierGain ?? 1e-4
  const seed = args.seed
  const values: Record<string, number> = Object.fromEntries(knobs.map((k) => [k.id, k.from]))

  const statOf = (vals: Record<string, number>): StatModel => {
    const stat: Partial<StatModel> = {}
    for (const k of knobs) Object.assign(stat, k.variant(vals[k.id]).stat ?? {})
    return { ...DEFAULT_MODEL, ...stat }
  }
  const combatOf = (vals: Record<string, number>): CombatModel => {
    const combat: CombatModel = {}
    for (const k of knobs) Object.assign(combat, k.variant(vals[k.id]).combat ?? {})
    return combat
  }
  const evaluate = (vals: Record<string, number>, seedOffset: number): { summary: CalibrationSummary; rms: Record<MainStat, number> } => {
    const model = statOf(vals)
    const records = args.records.map((r, index) =>
      runPrediction(r, args.data, { runs: args.runs, seed, seedOffset, model, combat: combatOf(vals), useReference: args.useReference }, index),
    )
    return { summary: calibrationSummary(records), rms: args.fixture ? fixtureStatRms(args.fixture, model) : { atk: 0, def: 0, hp: 0 } }
  }

  const baseOffset = CALIBRATION_BASE_SEED_OFFSET
  const base = evaluate(values, baseOffset)
  const guard = (rms: Record<MainStat, number>): boolean => MAIN_STATS.every((st) => rms[st] <= base.rms[st] + FIXTURE_RMS_GUARD)

  const order = rankInfluence(
    sensitivityAnalysis({
      records: args.records,
      data: args.data,
      fixture: args.fixture,
      runs: args.runs,
      seed,
      useReference: args.useReference,
      variants: [{ id: 'base', label: 'базовая модель', assumption: '—' }, ...knobs.map((k) => k.variant(k.from))],
    }),
  ).map((r) => r.id)

  const tuned: TunedKnob[] = []
  let current = { ...values }
  let currentEval = base
  const maxKnobs = args.maxKnobs ?? 3
  for (const id of order.slice(0, maxKnobs)) {
    const knob = knobs.find((k) => k.id === id)
    if (!knob) continue
    const before = currentEval.summary
    const from = current[knob.id]
    let best = { value: from, ...currentEval }
    for (const dir of [1, -1]) {
      for (let v = from + dir * knob.step; v <= knob.max + 1e-9 && v >= knob.min - 1e-9; v += dir * knob.step) {
        const rounded = Math.round(v * 1000) / 1000
        const trial = { ...current, [knob.id]: rounded }
        const ev = evaluate(trial, baseOffset)
        if (!guard(ev.rms)) {
          args.onStep?.(`${knob.id} = ${rounded}: сверка статов выходит за допуск — ход отклонён`)
          break
        }
        if (calibrationObjective(ev.summary) < calibrationObjective(best.summary) - 1e-9) best = { value: rounded, ...ev }
        else break
      }
    }
    if (best.value !== from && calibrationObjective(before) - calibrationObjective(best.summary) >= minGain) {
      current = { ...current, [knob.id]: best.value }
      currentEval = { summary: best.summary, rms: best.rms }
      tuned.push({
        id: knob.id,
        label: knob.label,
        assumption: knob.assumption,
        from,
        to: best.value,
        brierBefore: before.brier,
        brierAfter: best.summary.brier,
        deathBrierBefore: before.deathBrier,
        deathBrierAfter: best.summary.deathBrier,
        agreementBefore: before.agreement,
        agreementAfter: best.summary.agreement,
      })
      args.onStep?.(`${knob.id}: ${from} → ${best.value} (Brier ${before.brier.toFixed(4)} → ${best.summary.brier.toFixed(4)})`)
    } else {
      args.onStep?.(`${knob.id}: менять не стоит (лучший проверенный Brier ${best.summary.brier.toFixed(4)})`)
    }
  }

  return {
    values: current,
    knobs: tuned,
    before: base.summary,
    after: currentEval.summary,
    fixtureRmsBefore: base.rms,
    fixtureRmsAfter: currentEval.rms,
    improved: tuned.length > 0,
  }
}

// ───────────────────────────── что отметить ─────────────────────────────

/** Квест, где варианты допущений сильнее всего расходятся по win rate, — кандидат на отметку. */
export interface QuestCheckSuggestion {
  quest: Quest
  /** Win rate базовой модели. */
  baseWinRate: number
  /** Разброс win rate: максимум − минимум по базовой модели и всем вариантам. */
  spread: number
  /** Вариант, дальше всех ушедший от базовой модели: его этот бой проверит лучше всего. */
  variant: { id: string; label: string; assumption: string }
  variantWinRate: number
  /** Win rate каждого варианта (без базового). */
  byVariant: { id: string; winRate: number }[]
}

export interface QuestsToCheckArgs {
  data: GameData
  quests: Quest[]
  /** Текущие герои отряда (как надеты сейчас). */
  heroes: HeroInstance[]
  champion?: { champion: Champion; rank: number } | null
  /** Варианты допущений (по умолчанию MODEL_VARIANTS без базового). */
  variants?: ModelVariant[]
  /** Прогонов на квест и вариант (по умолчанию CHECK_SUGGEST_RUNS). */
  runs?: number
  seed?: number
  /** Сколько квестов вернуть (по умолчанию CHECK_SUGGEST_TOP). */
  top?: number
  /** Минимальный разброс win rate (по умолчанию CHECK_SUGGEST_MIN_SPREAD). */
  minSpread?: number
  useReference?: boolean
  onProgress?: (done: number, total: number) => void
  shouldCancel?: () => boolean
}

/**
 * «Что отметить»: для текущих героев прогоняем каждый квест базовой моделью и каждым вариантом
 * допущений и ранжируем квесты по разбросу win rate. Бинарная отметка различает варианты тем лучше,
 * чем дальше их предсказания друг от друга: где все варианты говорят «≈ 100 %», отметка ничего не скажет.
 *
 * Все варианты одного квеста гоняются на одном seed (общие случайные числа): разница между ними —
 * эффект допущения, а не шум Монте-Карло. (В анализе чувствительности наоборот — там seed разный,
 * чтобы не подгонять модель под один поток случайных чисел.)
 */
export function questsToCheck(args: QuestsToCheckArgs): QuestCheckSuggestion[] {
  const variants = (args.variants ?? MODEL_VARIANTS).filter((v) => v.id !== 'base')
  const runs = args.runs ?? CHECK_SUGGEST_RUNS
  const seed = (args.seed ?? 1) >>> 0
  const champion = args.champion ?? null
  const useRef = args.useReference === undefined ? {} : { useReference: args.useReference }
  const teamFor = (variant: ModelVariant | null): Fighter[] => {
    const model = variant ? variantModel(variant) : DEFAULT_MODEL
    const team = args.heroes.map((h) => fighterFromHero(h, args.data, { model, ...useRef }))
    if (champion) team.push(fighterFromChampion(champion.champion, champion.rank, args.data))
    return team
  }
  // Команды по вариантам собираются один раз: от квеста статы героев не зависят.
  const baseTeam = teamFor(null)
  const teams = variants.map((v) => (v.stat ? teamFor(v) : baseTeam))
  const total = args.quests.length
  const out: QuestCheckSuggestion[] = []
  for (let qi = 0; qi < total; qi++) {
    if (qi > 0 && args.shouldCancel?.()) break
    const quest = args.quests[qi]
    const qSeed = seed + qi * 7919
    const baseWinRate = simulateTeam(baseTeam, quest, { runs, seed: qSeed }).winRate
    const byVariant = variants.map((v, i) => ({ id: v.id, winRate: simulateTeam(teams[i], quest, { runs, seed: qSeed, model: v.combat }).winRate }))
    let lo = baseWinRate
    let hi = baseWinRate
    let farthest = -1
    let farDelta = -1
    byVariant.forEach((b, i) => {
      lo = Math.min(lo, b.winRate)
      hi = Math.max(hi, b.winRate)
      const d = Math.abs(b.winRate - baseWinRate)
      if (d > farDelta) {
        farDelta = d
        farthest = i
      }
    })
    if (farthest >= 0) {
      const v = variants[farthest]
      out.push({
        quest,
        baseWinRate,
        spread: hi - lo,
        variant: { id: v.id, label: v.label, assumption: v.assumption },
        variantWinRate: byVariant[farthest].winRate,
        byVariant,
      })
    }
    args.onProgress?.(qi + 1, total)
  }
  // При равном разбросе — квест, где базовая модель ближе к 50 %: исход там менее предсказуем.
  return out
    .filter((s) => s.spread > 0 && s.spread >= (args.minSpread ?? CHECK_SUGGEST_MIN_SPREAD))
    .sort((a, b) => b.spread - a.spread || Math.abs(a.baseWinRate - 0.5) - Math.abs(b.baseWinRate - 0.5))
    .slice(0, args.top ?? CHECK_SUGGEST_TOP)
}
