/**
 * Оптимизатор экипировки, камней и духов. Чистые функции, без DOM/React (запускается в Web Worker).
 *
 * Алгоритм (решения сессий 5 и 7):
 *   1. Отсев по quickScore: топ-K вариантов на слот + обязательные «разнообразные» кандидаты
 *      (лучший по каждому стату/артефакт/связь стихии) + адаптивное расширение K на плоской полке
 *      quickScore (A38). Проверка «лучший по симуляции не отсекается» — optimizer.test.ts /
 *      optimizer.prune.test.ts, доля промахов зафиксирована в PROGRESS.md.
 *   2. Координатный спуск по слотам (сначала по ролям: танк — DEF/угроза до порога, ДД — урон+выживаемость,
 *      затем совместная доводка) — по quickScore.
 *   3. Финальный выбор — ВСЕГДА симуляцией: beam кандидатов + симуляция-доводка по слотам.
 *      Все кандидаты сравниваются на общих seed (common random numbers) — шум не решает исход.
 *   4. Бюджет симуляций (≈500 × 2000 прогонов ≈ 10 с), прогресс и отмена через хуки.
 *   5. Объяснение: для каждого изменённого слота — на сколько вырос win rate относительно набора «без этой замены».
 *
 * Ограничения: в слоте только допустимые классом типы; не больше 1 артефакта на героя;
 * камень — только стихии героя (Any/Spellblade — любой; против барьера «Any» считает combat.ts);
 * Стихия не пробивает барьер → симуляция уже штрафует урон ×BARRIER_UNBROKEN_DMG_FACTOR (A9),
 * в результат добавляется предупреждение.
 */
import type { Element, GameData, HeroClass, HeroInstance, Item, Quality, Quest } from '../data/types.ts'
import { NON_EQUIPMENT_TYPES } from '../data/types.ts'
import {
  GOLD_ELEMENT_COUNTS_FOR_ANY_HERO,
  OPTIMIZER_BEAM,
  OPTIMIZER_CRN_SEED,
  OPTIMIZER_K_ADAPT_STEP,
  OPTIMIZER_K_ADAPT_TOL,
  OPTIMIZER_LOCAL_NEIGHBORS,
  OPTIMIZER_SIM_BUDGET,
  OPTIMIZER_SIM_RUNS,
  OPTIMIZER_TOP_K,
  OPTIMIZER_YIELD_INTERVAL_MS,
} from './constants.ts'
import { barrierBroken, fighterFromChampion, fighterFromHero, simulateTeam, type Fighter, type SimMetrics } from './combat.ts'
import { quickScore } from './score.ts'

// ─────────────────────────── вход/выход ───────────────────────────

export interface SlotConfig {
  item: string | null
  quality: Quality
  /** Камень стихии (Enchant.name) или null. */
  element: string | null
  /** Дух (Enchant.name) или null. */
  spirit: string | null
}
export type HeroConfig = SlotConfig[]

export interface OptimizerConstraints {
  maxItemTier: number
  maxQuality: Quality
  /** Максимальный тир камней стихии; null — без ограничения. */
  maxStoneTier: number | null
  /** Доступные духи; null — все из таблицы. */
  spirits: string[] | null
}

export interface QuestWeight {
  quest: Quest
  weight: number
}

export interface OptimizerInput {
  /** 1–3 героя. Уровень и «Душа» задаются в самих HeroInstance (или через titanSoul ниже). */
  heroes: HeroInstance[]
  champion?: { name: string; rank: number } | null
  mode: 'quest' | 'universal'
  /** В режиме `quest` — один квест; в `universal` — список локаций с весами. */
  quests: QuestWeight[]
  /** universal: максимизировать минимум win rate по локациям. */
  robust?: boolean
  /** Пул — любые предметы таблицы (всё покупается на рынке), в пределах этих ограничений. */
  constraints: OptimizerConstraints
  /** Переопределить «Душа Титана» у всех героев (есть/нет). */
  titanSoul?: 'as-is' | 'on' | 'off'
  /** Общий seed кандидатов (CRN). */
  seed?: number
  topK?: number
  simBudget?: number
  simRuns?: number
}

export interface SlotExplanation {
  slot: number
  from: string
  to: string
  /** Насколько финальный win rate выше win rate набора «вернуть этот слот в исходное». */
  winRateDelta: number
}

export interface QuestOutcome {
  questId: string
  label: string
  weight: number
  winRate: number
  avgRounds: number
  barrierBroken: boolean
}

export interface OptimizerResult {
  /** Финальная экипировка по героям (порядок как в input.heroes). */
  configs: HeroConfig[]
  /** Целевая функция: win rate (quest) / средзвешенное или минимум (universal). */
  objective: number
  /** Средзвешенный win rate (для universal — по всем локациям). */
  winRate: number
  perQuest: QuestOutcome[]
  /** Худшая локация (universal) — минимальный win rate. */
  worstQuest: QuestOutcome | null
  explanations: SlotExplanation[][]
  warnings: string[]
  simsUsed: number
  cancelled: boolean
  /**
   * True — среди проверенных кандидатов есть другие наборы с тем же win rate (цель),
   * и финальный выбор сделан по тай-брейку (меньше раундов → больше мин. % HP выжившего → урон/раунд).
   */
  tieBreakUsed: boolean
}

export interface OptimizerHooks {
  onProgress?: (done: number, total: number) => void
  shouldCancel?: () => boolean
  /**
   * Отдать управление событийному циклу (в Web Worker — чтобы обработать входящий cancel():
   * синхронный код воркера сообщения не читает). По умолчанию — no-op, тесты остаются синхронными.
   */
  yieldControl?: () => Promise<void>
}

// ─────────────────────────── вспомогательное ───────────────────────────

const slotKey = (c: SlotConfig): string => `${c.item}|${c.quality}|${c.element}|${c.spirit}`
const heroKey = (cfg: HeroConfig): string => cfg.map(slotKey).join(';')
const configKey = (cfgs: HeroConfig[]): string => cfgs.map(heroKey).join('#')

const cloneSlot = (c: SlotConfig): SlotConfig => ({ ...c })
const cloneTeam = (cfgs: HeroConfig[]): HeroConfig[] => cfgs.map((h) => h.map(cloneSlot))

export function questLabel(q: Quest): string {
  return `${q.area} · ${q.variant === 'boss' ? 'босс' : 'обычный'} · ${q.difficulty}`
}

/** Герой с заменённой экипировкой (конфиг слотов) — для тестов и UI. */
export function applyHeroConfig(hero: HeroInstance, cfg: HeroConfig): HeroInstance {
  return applyConfig(hero, cfg)
}

function applyConfig(hero: HeroInstance, cfg: HeroConfig): HeroInstance {
  return { ...hero, slots: cfg.map((c) => ({ item: c.item, quality: c.quality, element: c.element, spirit: c.spirit })) }
}

const itemLabel = (c: SlotConfig): string => (c.item ? `${c.item} (${c.quality})${c.element ? ` +${c.element}` : ''}${c.spirit ? ` +${c.spirit}` : ''}` : '—')

// ─────────────────────────── перебор вариантов ───────────────────────────

function itemChoices(data: GameData, cons: OptimizerConstraints, types: string[]): { item: Item; quality: Quality }[] {
  return data.items
    .filter((it) => it.isEquipment && !NON_EQUIPMENT_TYPES.includes(it.type) && types.includes(it.type) && it.tier <= cons.maxItemTier)
    .map((item) => ({ item, quality: cons.maxQuality }))
    .sort((a, b) => (a.item.name < b.item.name ? -1 : 1))
}

function stoneChoices(data: GameData, cons: OptimizerConstraints, heroEl: Element | 'Any'): string[] {
  const out: string[] = []
  for (const e of data.enchants) {
    if (e.kind !== 'element' || !e.elementValue) continue
    if (cons.maxStoneTier != null && (e.tier ?? 0) > cons.maxStoneTier) continue
    const okEl = heroEl === 'Any' || e.element === heroEl || (GOLD_ELEMENT_COUNTS_FOR_ANY_HERO && e.element === 'Gold')
    if (!okEl) continue
    out.push(e.name)
  }
  return out
}

function spiritChoices(data: GameData, cons: OptimizerConstraints): string[] {
  const out: string[] = []
  for (const e of data.enchants) {
    if (e.kind !== 'spirit') continue
    if (cons.spirits && !cons.spirits.includes(e.name)) continue
    out.push(e.name)
  }
  return out
}

// ─────────────────────────── отсев вариантов слота ───────────────────────────

/** Признаки предмета для «разнообразных» кандидатов отсева (лучший по каждому измерению). */
export interface SlotFeatures {
  atk: number
  def: number
  hp: number
  eva: number
  crit: number
  /** Величина стихии (встроенный камень или вставленный). */
  element: number
  artifact: boolean
  /** Есть связь стихии/духа с героем (elementAffinity). */
  affinity: boolean
}

/**
 * Отсев вариантов слота: top-K по quickScore + обязательные «разнообразные» кандидаты
 * (лучший по каждому стату ATK/DEF/HP/EVA/CRIT/стихии, лучший артефакт, лучший со связью)
 * + адаптивное расширение K на плоской полке quickScore (A38).
 * Возвращает подмножество scored в порядке убывания quickScore.
 */
export function selectSlotCandidates(
  scored: { sc: SlotConfig; score: number }[],
  topK: number,
  feats: (sc: SlotConfig) => SlotFeatures,
): SlotConfig[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score || (a.sc.item! < b.sc.item! ? -1 : 1))
  const n = sorted.length
  let k = Math.min(topK, n)
  while (k + OPTIMIZER_K_ADAPT_STEP <= n) {
    const a = sorted[k - 1].score
    const b = sorted[k - 1 + OPTIMIZER_K_ADAPT_STEP].score
    if (a - b > OPTIMIZER_K_ADAPT_TOL * Math.max(1, Math.abs(a))) break
    k += OPTIMIZER_K_ADAPT_STEP
  }
  const sel = new Set<number>()
  for (let i = 0; i < k; i++) sel.add(i)
  const f = sorted.map((x) => feats(x.sc))
  const dims: ((x: SlotFeatures) => number)[] = [
    (x) => x.atk, (x) => x.def, (x) => x.hp, (x) => x.eva, (x) => x.crit, (x) => x.element,
    (x) => (x.artifact ? 1 : 0), (x) => (x.affinity ? 1 : 0),
  ]
  for (const dim of dims) {
    let bestI = -1
    let bestV = 0
    for (let i = 0; i < n; i++) {
      const v = dim(f[i])
      if (v > bestV) {
        bestV = v
        bestI = i
      }
    }
    if (bestI >= 0) sel.add(bestI)
  }
  return sorted.filter((_, i) => sel.has(i)).map((x) => x.sc)
}

// ─────────────────────────── оптимизатор ───────────────────────────

interface HeroCtx {
  hero: HeroInstance
  cls: HeroClass
  /** Варианты (item, quality) на каждый из 6 слотов. */
  items: { item: Item; quality: Quality }[][]
  stones: string[]
  spirits: string[]
  tank: boolean
}

interface CandEval {
  per: SimMetrics[]
  obj: number
  /** Лексикографический тай-брейк после цели: средние раунды → мин. % HP выжившего → урон/раунд. */
  tie: number[]
  wr: number
}

export async function runOptimizer(data: GameData, input: OptimizerInput, hooks: OptimizerHooks = {}): Promise<OptimizerResult> {
  const warnings: string[] = []
  const topK = input.topK ?? OPTIMIZER_TOP_K
  const budget = input.simBudget ?? OPTIMIZER_SIM_BUDGET
  const runs = input.simRuns ?? OPTIMIZER_SIM_RUNS
  const seed = (input.seed ?? OPTIMIZER_CRN_SEED) >>> 0
  const quests = input.quests
  if (quests.length === 0) throw new Error('Не выбран ни один квест')
  if (input.heroes.length === 0) throw new Error('Не выбран ни один герой')
  const cancel = () => hooks.shouldCancel?.() === true
  const progress = (done: number): void => hooks.onProgress?.(done, budget)
  // Уступка не чаще OPTIMIZER_YIELD_INTERVAL_MS — иначе setTimeout(0) в воркере добавляет ~1–4 мс на симуляцию.
  const rawYield = hooks.yieldControl
  let lastYield = Date.now()
  const yieldC = async (): Promise<void> => {
    if (!rawYield) return
    const now = Date.now()
    if (now - lastYield < OPTIMIZER_YIELD_INTERVAL_MS) return
    lastYield = now
    await rawYield()
  }

  const heroes = input.heroes.map((h) =>
    input.titanSoul && input.titanSoul !== 'as-is' ? { ...h, titanSoul: input.titanSoul === 'on' } : h,
  )

  const champion = input.champion ? data.champions.find((c) => c.name === input.champion?.name) : undefined
  if (input.champion && !champion) warnings.push(`Чемпион «${input.champion.name}» не найден в данных — без чемпиона.`)
  const champFighter = champion && input.champion ? fighterFromChampion(champion, input.champion.rank, data) : null
  const artifacts = new Set(data.items.filter((i) => i.artifactSkill).map((i) => i.name))
  const itemByName = new Map(data.items.map((i) => [i.name, i]))
  const elValue = new Map(data.enchants.filter((e) => e.kind === 'element').map((e) => [e.name, e.elementValue ?? 0]))
  const slotFeats = (ctx: HeroCtx) => (sc: SlotConfig): SlotFeatures => {
    const it = itemByName.get(sc.item!)!
    const st = it.stats[sc.quality]
    const el = sc.element ? (elValue.get(sc.element) ?? 0) : it.builtInElement ? (elValue.get(it.builtInElement) ?? 0) : 0
    const affinity = it.elementAffinity === 'All' || it.elementAffinity.some((e) => ctx.cls.element === 'Any' || e === ctx.cls.element)
    return { atk: st.atk, def: st.def, hp: st.hp, eva: st.eva, crit: st.crit, element: el, artifact: !!it.artifactSkill, affinity }
  }

  const ctxs: HeroCtx[] = heroes.map((hero) => {
    const cls = data.heroClasses.find((c) => c.name === hero.className)
    if (!cls) throw new Error(`Неизвестный класс «${hero.className}»`)
    return {
      hero,
      cls,
      items: cls.slots.map((types) => itemChoices(data, input.constraints, types)),
      stones: stoneChoices(data, input.constraints, cls.element),
      spirits: spiritChoices(data, input.constraints),
      tank: false,
    }
  })

  const baseline: HeroConfig[] = heroes.map((h) => h.slots.map((s) => ({ item: s.item, quality: s.quality, element: s.element, spirit: s.spirit })))
  const heroFighter = (hi: number, cfg: HeroConfig): Fighter => fighterFromHero(applyConfig(heroes[hi], cfg), data)
  const teamOf = (cfgs: HeroConfig[]): Fighter[] => {
    const fs = cfgs.map((c, i) => heroFighter(i, c))
    if (champFighter) fs.push(champFighter)
    return fs
  }

  // Танк (для порядка и тай-брейка ролевого прохода): самый DEF в базовом наборе.
  // ASSUMPTION: A37 — «танк» = герой с наибольшим DEF базового набора; ДД — остальные.
  const baseFighters = teamOf(baseline)
  let tankIdx = 0
  baseFighters.forEach((f, i) => {
    if (i < ctxs.length && f.def > baseFighters[tankIdx].def) tankIdx = i
  })
  if (ctxs.length > 1) ctxs[tankIdx].tank = true
  const defCap75 = Math.max(0, ...quests.map((q) => q.quest.defCaps?.p75 ?? 0))

  const wSum = quests.reduce((a, q) => a + q.weight, 0)
  const quickObj = (cfgs: HeroConfig[]): number => {
    const fs = teamOf(cfgs)
    let s = 0
    for (const q of quests) s += q.weight * (quickScore(fs, q.quest) / q.quest.monsterHp)
    return s / wSum
  }

  // Не больше 1 артефакта на героя.
  const allowed = (cfg: HeroConfig[], hi: number, si: number, opt: SlotConfig): boolean => {
    let n = opt.item && artifacts.has(opt.item) ? 1 : 0
    cfg[hi].forEach((sc, j) => {
      if (j !== si && sc.item && artifacts.has(sc.item)) n++
    })
    return n <= 1
  }

  // Симуляционный слой (используется и для финального выбора, и для finish при ранней отмене).
  let simsUsed = 0
  const simCache = new Map<string, CandEval>()
  // Лексикографический тай-брейк (решение по итогам сессии 7): win rate → средние раунды (меньше) →
  // мин. % HP выжившего (больше) → урон/раунд (больше). В universal метрики усредняются по весам локаций.
  const objectiveOf = (per: SimMetrics[]): { obj: number; tie: number[]; wr: number } => {
    const wmean = (get: (m: SimMetrics) => number): number => per.reduce((a, m, i) => a + get(m) * quests[i].weight, 0) / wSum
    const tieRest = [-wmean((m) => m.avgRounds), wmean((m) => m.avgMinSurvivorHpPct), wmean((m) => m.avgDamagePerRound)]
    if (input.mode === 'quest') return { obj: per[0].winRate, tie: tieRest, wr: per[0].winRate }
    const mean = wmean((m) => m.winRate)
    const worst = Math.min(...per.map((m) => m.winRate))
    return input.robust ? { obj: worst, tie: [mean, ...tieRest], wr: mean } : { obj: mean, tie: tieRest, wr: mean }
  }
  const evaluate = async (cfg: HeroConfig[]): Promise<CandEval> => {
    const k = configKey(cfg)
    const hit = simCache.get(k)
    if (hit) return hit
    await yieldC()
    const fs = teamOf(cfg)
    const per = quests.map((qw) => simulateTeam(fs, qw.quest, { runs, seed }))
    const ev: CandEval = { per, ...objectiveOf(per) }
    simCache.set(k, ev)
    simsUsed++
    return ev
  }
  const cmpTie = (a: number[], b: number[]): number => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  const betterEval = (a: CandEval, b: CandEval): boolean => a.obj > b.obj || (a.obj === b.obj && cmpTie(a.tie, b.tie) > 0)

  // ── 1. Отсев: top-K + «разнообразные» + адаптивный K на слот (item → камень → дух, по quickScore в контексте текущего набора) ──
  const pruneSlot = (hi: number, si: number, cfgs: HeroConfig[]): SlotConfig[] => {
    const ctx = ctxs[hi]
    const base = cfgs[hi][si]
    const tryCfg = (sc: SlotConfig): number => {
      const trial = cloneTeam(cfgs)
      trial[hi][si] = sc
      return quickObj(trial)
    }
    const stage1: { sc: SlotConfig; score: number }[] = []
    for (const ch of ctx.items[si]) {
      const sc: SlotConfig = { item: ch.item.name, quality: ch.quality, element: null, spirit: null }
      stage1.push({ sc, score: tryCfg(sc) })
    }
    const kept = selectSlotCandidates(stage1, topK, slotFeats(ctx))
    const score1 = new Map(stage1.map((x) => [slotKey(x.sc), x.score]))
    const stage2: { sc: SlotConfig; score: number }[] = []
    for (const sc0 of kept) {
      let best = { sc: sc0, score: score1.get(slotKey(sc0))! }
      for (const st of ctx.stones) {
        const sc = { ...sc0, element: st }
        const s = tryCfg(sc)
        if (s > best.score) best = { sc, score: s }
      }
      stage2.push(best)
    }
    const kept2 = selectSlotCandidates(stage2, topK, slotFeats(ctx))
    const score2 = new Map(stage2.map((x) => [slotKey(x.sc), x.score]))
    const out: SlotConfig[] = []
    for (const sc0 of kept2) {
      let best = { sc: sc0, score: score2.get(slotKey(sc0))! }
      for (const sp of ctx.spirits) {
        const sc = { ...best.sc, spirit: sp }
        const s = tryCfg(sc)
        if (s > best.score) best = { sc, score: s }
      }
      out.push(best.sc)
    }
    if (!out.some((o) => slotKey(o) === slotKey(base))) out.unshift(base)
    return out
  }

  const options: SlotConfig[][][] = ctxs.map((_, hi) => ctxs[hi].items.map((_, si) => pruneSlot(hi, si, baseline)))
  await yieldC()
  if (cancel()) return finish(cloneTeam(baseline), [], 'Отменено на этапе отсева')

  // ── 2. Координатный спуск по quickScore: сначала по ролям (танк → ДД), затем совместная доводка ──
  let best = cloneTeam(baseline)
  let bestScore = quickObj(best)
  const beam = new Map<string, { cfg: HeroConfig[]; score: number }>()
  const addBeam = (cfg: HeroConfig[], score: number): void => {
    const k = configKey(cfg)
    const prev = beam.get(k)
    if (!prev || score > prev.score) beam.set(k, { cfg: cloneTeam(cfg), score })
    if (beam.size > OPTIMIZER_BEAM * 4) {
      const keep = [...beam.entries()].sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1)).slice(0, OPTIMIZER_BEAM)
      beam.clear()
      for (const [k2, v] of keep) beam.set(k2, v)
    }
  }
  addBeam(best, bestScore)

  // Тай-брейк ролей при близких quickScore: танк — DEF (до порога 75%) и угроза; ДД — урон и выживаемость.
  const betterQuick = (s: number, trial: HeroConfig[], hi: number, bs: number, bestCfg: HeroConfig[]): boolean => {
    if (s > bs * 1.01) return true
    if (s < bs * 0.99) return false
    const a = heroFighter(hi, trial[hi])
    const b = heroFighter(hi, bestCfg[hi])
    if (ctxs[hi].tank) {
      const da = defCap75 > 0 ? Math.min(a.def, defCap75) : a.def
      const db = defCap75 > 0 ? Math.min(b.def, defCap75) : b.def
      if (da !== db) return da > db
      return a.threat > b.threat
    }
    if (a.atk !== b.atk) return a.atk > b.atk
    return a.hp > b.hp
  }

  const tryOption = (hi: number, si: number, opt: SlotConfig, roleTie: boolean): boolean => {
    if (!allowed(best, hi, si, opt)) return false
    const trial = cloneTeam(best)
    trial[hi][si] = opt
    const s = quickObj(trial)
    addBeam(trial, s)
    const better = roleTie ? betterQuick(s, trial, hi, bestScore, best) : s > bestScore
    if (better) {
      best = trial
      bestScore = s
      return true
    }
    return false
  }

  const roleOrder = [...ctxs.keys()].sort((a, b) => Number(ctxs[b].tank) - Number(ctxs[a].tank))
  for (const hi of roleOrder) {
    await yieldC()
    if (cancel()) return finish(best, [], 'Отменено во время подбора по ролям')
    for (let si = 0; si < ctxs[hi].items.length; si++) {
      for (const opt of options[hi][si]) tryOption(hi, si, opt, true)
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    await yieldC()
    if (cancel()) return finish(best, [], 'Отменено во время совместной доводки')
    let changed = false
    for (let hi = 0; hi < ctxs.length; hi++) {
      for (let si = 0; si < ctxs[hi].items.length; si++) {
        for (const opt of options[hi][si]) if (tryOption(hi, si, opt, false)) changed = true
      }
    }
    if (!changed) break
  }

  // ── 3. Финальный выбор симуляцией (CRN: один seed на всех кандидатов) ──
  let bestEv = await evaluate(best)
  const changedCount = best.reduce((n, cfg, hi) => n + cfg.filter((sc, si) => slotKey(sc) !== slotKey(baseline[hi][si])).length, 0)
  const explCost = changedCount * quests.length

  // ── 3a. Локальный поиск: после спуска для каждого слота прогнать симуляцией N следующих по рангу
  // quickScore кандидатов — ловит предметы, которые quickScore недооценил (A38). ──
  local: for (let round = 0; round < 2; round++) {
    let improved = false
    for (let hi = 0; hi < ctxs.length; hi++) {
      for (let si = 0; si < ctxs[hi].items.length; si++) {
        const opts = options[hi][si]
        const cur = opts.findIndex((o) => slotKey(o) === slotKey(best[hi][si]))
        for (let j = 1; j <= OPTIMIZER_LOCAL_NEIGHBORS; j++) {
          const opt = opts[cur + j]
          if (!opt) break
          if (!allowed(best, hi, si, opt)) continue
          await yieldC()
          if (cancel()) return finish(best, [], 'Отменено при локальном поиске', simsUsed, bestEv)
          if (simsUsed + quests.length > budget - explCost) break local
          const trial = cloneTeam(best)
          trial[hi][si] = opt
          const ev = await evaluate(trial)
          if (betterEval(ev, bestEv)) {
            bestEv = ev
            best = trial
            improved = true
          }
          progress(simsUsed)
        }
      }
    }
    if (!improved) break
  }

  const cands = [...beam.values()].sort((a, b) => b.score - a.score || (configKey(a.cfg) < configKey(b.cfg) ? -1 : 1)).slice(0, OPTIMIZER_BEAM)
  for (const c of cands) {
    await yieldC()
    if (cancel()) return finish(best, [], 'Отменено при сравнении кандидатов', simsUsed, bestEv)
    const ev = await evaluate(c.cfg)
    if (betterEval(ev, bestEv)) {
      bestEv = ev
      best = c.cfg
    }
    progress(simsUsed)
  }

  // Симуляционная доводка по слотам: пока хватает бюджета — менять по одному слоту, выбор симуляцией.
  outer: for (let round = 0; round < 4; round++) {
    let improved = false
    for (let hi = 0; hi < ctxs.length; hi++) {
      for (let si = 0; si < ctxs[hi].items.length; si++) {
        for (const opt of options[hi][si]) {
          if (slotKey(best[hi][si]) === slotKey(opt)) continue
          if (!allowed(best, hi, si, opt)) continue
          await yieldC()
          if (cancel()) return finish(best, [], 'Отменено при симуляционной доводке', simsUsed, bestEv)
          if (simsUsed + quests.length > budget - explCost) break outer
          const trial = cloneTeam(best)
          trial[hi][si] = opt
          const ev = await evaluate(trial)
          if (betterEval(ev, bestEv)) {
            bestEv = ev
            best = trial
            improved = true
          }
          progress(simsUsed)
        }
      }
    }
    if (!improved) break
  }

  // ── 4. Объяснения: отдача каждого изменённого слота (win rate с заменой − без неё) ──
  const explanations: SlotExplanation[][] = []
  for (let hi = 0; hi < best.length; hi++) {
    const out: SlotExplanation[] = []
    for (let si = 0; si < best[hi].length; si++) {
      const sc = best[hi][si]
      const b = baseline[hi][si]
      if (slotKey(sc) === slotKey(b)) continue
      let delta = 0
      if (simsUsed + quests.length <= budget) {
        const trial = cloneTeam(best)
        trial[hi][si] = b
        delta = bestEv.wr - (await evaluate(trial)).wr
      }
      out.push({ slot: si, from: itemLabel(b), to: itemLabel(sc), winRateDelta: delta })
    }
    explanations.push(out)
  }

  return finish(best, explanations, null, simsUsed, bestEv)

  // ── сборка результата ──
  function finish(
    cfg: HeroConfig[],
    expl: SlotExplanation[][],
    cancelNote: string | null,
    sims = 0,
    ev: CandEval | null = null,
  ): OptimizerResult {
    const fs = teamOf(cfg)
    const per = ev?.per ?? quests.map((qw) => simulateTeam(fs, qw.quest, { runs, seed }))
    const perQuest: QuestOutcome[] = per.map((m, i) => ({
      questId: quests[i].quest.id,
      label: questLabel(quests[i].quest),
      weight: quests[i].weight,
      winRate: m.winRate,
      avgRounds: m.avgRounds,
      barrierBroken: barrierBroken(fs, quests[i].quest),
    }))
    for (const pq of perQuest) {
      if (!pq.barrierBroken) warnings.push(`Барьер квеста «${pq.label}» не пробит — урон отряда снижен (стихия не подходит или её мало).`)
    }
    const o = ev ?? objectiveOf(per)
    let worst: QuestOutcome | null = null
    if (input.mode === 'universal') worst = perQuest.reduce((a, b) => (b.winRate < a.winRate ? b : a), perQuest[0])
    if (cancelNote) warnings.push(cancelNote)
    // Были ли среди проверенных кандидатов другие наборы с той же целью (выбор сделал тай-брейк)?
    let tieBreakUsed = false
    if (ev) {
      const bestKey = configKey(cfg)
      for (const [k, e] of simCache) {
        if (k !== bestKey && Math.abs(e.obj - ev.obj) < 1e-12) {
          tieBreakUsed = true
          break
        }
      }
    }
    return {
      configs: cfg,
      objective: o.obj,
      winRate: o.wr,
      perQuest,
      worstQuest: worst,
      explanations: expl,
      warnings,
      simsUsed: sims,
      cancelled: cancelNote != null,
      tieBreakUsed,
    }
  }
}
