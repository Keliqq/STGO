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
 * тир предмета ≤ min(ограничение подбора A41, `Max Item Tier` уровня героя — HERO LEVELS, A66);
 * камень — только стихии героя (Any/Spellblade — любой; против барьера «Any» считает combat.ts).
 * Камень чужой стихии игра вставить разрешает (A65), но стихии герою он не даёт (A21), а статы камней
 * одного тира у всех стихий одинаковы — поэтому в перебор они не входят.
 * Стихия не пробивает барьер → симуляция уже штрафует урон ×BARRIER_UNBROKEN_DMG_FACTOR (A9),
 * в результат добавляется предупреждение.
 */
import type { Element, GameData, HeroClass, HeroInstance, Item, Quality, Quest } from '../data/types.ts'
import { NON_EQUIPMENT_TYPES } from '../data/types.ts'
import {
  EXTREME_EVA_PENALTY,
  GOLD_ELEMENT_COUNTS_FOR_ANY_HERO,
  OPTIMIZER_BEAM,
  OPTIMIZER_BEAM_SLACK,
  OPTIMIZER_CRN_SEED,
  OPTIMIZER_K_ADAPT_STEP,
  OPTIMIZER_K_ADAPT_TOL,
  OPTIMIZER_LOCAL_NEIGHBORS,
  OPTIMIZER_LOCAL_PASSES,
  OPTIMIZER_QUICK_PASSES,
  OPTIMIZER_ROLE_TIE_TOL,
  OPTIMIZER_SIM_BUDGET,
  OPTIMIZER_SIM_PASSES,
  OPTIMIZER_SIM_RUNS,
  OPTIMIZER_TOP_K,
  OPTIMIZER_YIELD_INTERVAL_MS,
} from './constants.ts'
import { barrierBroken, championEquipment, evaCapOf, fighterFromChampion, fighterFromHero, parseSpecials, simulateTeam, type ChampionBuild, type Fighter, type PowerBoosterId, type SimMetrics } from './combat.ts'
import { maxItemTierFor } from './formulas.ts'
import { quickScore } from './score.ts'
import { partyElementBonusPct, STAT_WEIGHT_STATS, statWeights, type StatWeightStat, type StatWeightsResult } from './statWeights.ts'
import { effectiveClass } from './stats.ts'

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
  /**
   * Ограничения НА ГЕРОЯ, а не на отряд (требование владельца, сессия 13): по умолчанию
   * «макс. тир = макс. надетый у ЭТОГО героя + 1», поэтому слабому герою не предлагаются
   * вещи под сильного. Значения пользователя (maxItemTier/maxQuality/maxStoneTier) —
   * дополнительный потолок сверху: итог = min(своё значение, ограничение отряда).
   */
  perHero?: PerHeroCap[]
}

/** Ограничение на одного героя (массивы в порядке input.heroes). */
export interface PerHeroCap {
  /** Индекс героя в отряде. */
  hero: number
  /** Макс. тир предметов для этого героя. */
  maxItemTier: number
  /** Макс. тир камней для этого героя (null — без ограничения, если и у отряда его нет). */
  maxStoneTier: number | null
}

/** Итоговые ограничения героя: не выше ограничения отряда и не выше собственного потолка. */
export function capForHero(cons: OptimizerConstraints, hi: number): PerHeroCap {
  const own = cons.perHero?.find((c) => c.hero === hi)
  return {
    hero: hi,
    maxItemTier: own?.maxItemTier != null ? Math.min(own.maxItemTier, cons.maxItemTier) : cons.maxItemTier,
    maxStoneTier: own?.maxStoneTier != null ? (cons.maxStoneTier != null ? Math.min(own.maxStoneTier, cons.maxStoneTier) : own.maxStoneTier) : cons.maxStoneTier,
  }
}

/**
 * Потолок тира предмета для героя: min(ограничение подбора A41, `Max Item Tier` уровня — HERO LEVELS).
 * Второе — правило игры («выше этого тира герой не наденет»), поэтому оно ограничивает подбор так же,
 * как список предметов в редакторе (`heroEditor.ts`), и его нельзя поднять переопределением (A66).
 */
export function tierCapFor(data: GameData, cons: OptimizerConstraints, hi: number, level: number): number {
  const own = capForHero(cons, hi).maxItemTier
  const levelCap = maxItemTierFor(data, level)
  return levelCap != null ? Math.min(own, levelCap) : own
}

export interface QuestWeight {
  quest: Quest
  weight: number
}

export interface OptimizerInput {
  /** 1–`Maximum Party Size` локации героев (правило игры — A67), но не больше 5. Уровень и «Душа» — в самих HeroInstance. */
  heroes: HeroInstance[]
  champion?: { name: string; rank: number } | null
  /**
   * Экипировка чемпиона: аурасонг, фамильяр и дух в нём (A67). Задаётся командой («Команды»):
   * тот же чемпион, что и в прогоне команды, иначе win rate подбора разошёлся бы с прогоном.
   * Ранг берётся отсюда; `champion.rank` — значение по умолчанию, если `championBuild` нет.
   */
  championBuild?: ChampionBuild | null
  mode: 'quest' | 'universal'
  /** В режиме `quest` — один квест; в `universal` — список локаций с весами. */
  quests: QuestWeight[]
  /** universal: максимизировать минимум win rate по локациям. */
  robust?: boolean
  /** Пул — любые предметы таблицы (всё покупается на рынке), в пределах этих ограничений. */
  constraints: OptimizerConstraints
  /** Переопределить «Душа Титана» у всех героев (есть/нет). */
  titanSoul?: 'as-is' | 'on' | 'off'
  /**
   * Усилитель силы квеста на весь отряд (A74), выбор в форме квеста: `normal` / `super` / `mega`.
   * Учитывается во всех симуляциях подбора — как % боя поверх карточки (A62).
   */
  powerBooster?: PowerBoosterId
  /** Общий seed кандидатов (CRN). */
  seed?: number
  /**
   * Считать веса статов (симуляция «+1% CRIT / +5% ATK / …», src/engine/statWeights.ts).
   * Дорого (≈ (1 + 8) × героев симуляций) — включается, когда результат показывают пользователю.
   */
  withStatWeights?: boolean
  /** Прогонов на симуляцию в весах статов (по умолчанию STAT_WEIGHT_RUNS). */
  statWeightRuns?: number
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
  /** Главный стат, который дала замена (для строки «почему» в UI). */
  statHint?: SlotStatHint | null
}

export interface QuestOutcome {
  questId: string
  label: string
  weight: number
  winRate: number
  avgRounds: number
  barrierBroken: boolean
}

/**
 * Строка «почему» для слота: какой стат дала замена и сколько это в win rate или уроне.
 * Считается относительно надетого ранее (baseline) — то есть «что дал именно этот предмет».
 */
export interface SlotStatHint {
  /** «+ATK: +614 (было 12238)». */
  text: string
  /** Стат, по которому замена сильнее всего (для сортировки/подписи). */
  stat: StatWeightStat | 'other'
  /** Цифра «сколько это в win rate» или уроне (в единицах веса), если удалось измерить. */
  value?: number
  /** Что за цифра: п.п. win rate или доля урона. */
  metric?: 'winRatePp' | 'damagePct'
  /** Что стало хуже в замене (например, HP −95) — показывается отдельно. */
  fallback?: string
  /**
   * Отдельная оговорка к замене: сейчас — «уклонение упирается в предел 75%», когда замена добавила
   * EVA выше предела (A42): в бою такой излишек не работает (на Extreme — до предела + 20 п.п., A34).
   */
  note?: string
}

export interface OptimizerResult {
  /** Финальная экипировка по героям (порядок как в input.heroes). */
  configs: HeroConfig[]
  /** Целевая функция: win rate (quest) / средзвешенное или минимум (universal). */
  objective: number
  /** Средзвешенный win rate (для universal — по всем локациям). */
  winRate: number
  /** Прирост win rate относительно надетой экипировки (п.п.); на отмене может быть 0. */
  improvement: number
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
  /**
   * Веса статов на найденном наборе (если input.withStatWeights): «почему именно эти вещи» —
   * прирост от +1% CRIT / +5% ATK и т. д. Считается тем же seed (CRN). null — не считались.
   * Массив `heroes` соответствует всем бойцам (герои отряда + чемпион), у элемента есть `isChampion`.
   */
  statWeights?: StatWeightsResult | null
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

/** Пометка типа квеста для интерфейса: `miniboss` — босс с выбранным мини-боссом (A17). */
export const QUEST_VARIANT_RU: Record<Quest['variant'], string> = { normal: 'обычный', boss: 'босс', miniboss: 'мини-босс' }

export function questLabel(q: Quest): string {
  return `${q.area} · ${QUEST_VARIANT_RU[q.variant]} · ${q.difficulty}`
}

/** Герой с заменённой экипировкой (конфиг слотов) — для тестов и UI. */
export function applyHeroConfig(hero: HeroInstance, cfg: HeroConfig): HeroInstance {
  return applyConfig(hero, cfg)
}

function applyConfig(hero: HeroInstance, cfg: HeroConfig): HeroInstance {
  return { ...hero, slots: cfg.map((c) => ({ item: c.item, quality: c.quality, element: c.element, spirit: c.spirit })) }
}

const itemLabel = (c: SlotConfig): string => (c.item ? `${c.item} (${c.quality})${c.element ? ` +${c.element}` : ''}${c.spirit ? ` +${c.spirit}` : ''}` : '—')

/** Статы, по которым сравниваются предметы в строке «почему» (как в весах, но без урона крита «в единицах»). */
type SlotStatStat = 'atk' | 'def' | 'hp' | 'crit' | 'eva' | 'critDmg' | 'threat' | 'element'

/** «+614 ATK», «+3% CRIT», «+15 стихии». */
function statDeltaText(key: SlotStatStat, value: number): string {
  const sign = value > 0 ? '+' : ''
  switch (key) {
    case 'crit':
      return `${sign}${Math.round(value)}% CRIT`
    case 'eva':
      return `${sign}${Math.round(value)}% EVA`
    case 'critDmg':
      return `${sign}${Math.round((value / 10) * 100)}% урона крита`
    case 'element':
      return `${sign}${Math.round(value)} стихии`
    case 'threat':
      return `${sign}${Math.round(value)} угрозы`
    default:
      return `${sign}${Math.round(value)} ${key.toUpperCase()}`
  }
}

/**
 * «Уклонение упирается в предел N%»: EVA выше предела героя в бою не даёт ничего (A42).
 * На Extreme предел тот же, но 20 п.п. съедает штраф (A34), поэтому там излишек начинается только
 * после предела + 20 п.п. (95% при пределе 75%). В смешанном наборе локаций берём строгий случай:
 * если хоть одна локация не Extreme, уклонение сверх предела уже потеряно.
 * `null` — излишка нет.
 */
export function evasionSurplusNote(eva: number, cap: number, extremeOnly: boolean): string | null {
  const useful = cap + (extremeOnly ? EXTREME_EVA_PENALTY : 0)
  if (eva <= useful + 1e-9) return null
  return `уклонение упирается в предел ${Math.round(cap * 100)}%`
}

// ─────────────────────────── перебор вариантов ───────────────────────────

function itemChoices(data: GameData, cons: OptimizerConstraints, types: string[], hi: number, level: number): { item: Item; quality: Quality }[] {
  const cap = tierCapFor(data, cons, hi, level)
  return data.items
    .filter((it) => it.isEquipment && !NON_EQUIPMENT_TYPES.includes(it.type) && types.includes(it.type) && it.tier <= cap)
    .map((item) => ({ item, quality: cons.maxQuality }))
    .sort((a, b) => (a.item.name < b.item.name ? -1 : 1))
}

function stoneChoices(data: GameData, cons: OptimizerConstraints, heroEl: Element | 'Any', hi: number): string[] {
  const cap = capForHero(cons, hi).maxStoneTier
  const out: string[] = []
  for (const e of data.enchants) {
    if (e.kind !== 'element' || !e.elementValue) continue
    if (cap != null && (e.tier ?? 0) > cap) continue
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
  // Экипировка чемпиона (A67): ранг из championBuild, если он задан, иначе из input.champion.
  const champBuild: ChampionBuild | null =
    champion && input.champion
      ? { ...input.championBuild, champion: champion.name, rank: input.championBuild?.rank ?? input.champion.rank }
      : null
  if (champBuild) {
    const notes = championEquipment(champBuild, data).notes
    if (notes.missingAura) warnings.push(`Аурасонг «${notes.missingAura}» не найден в данных — чемпион без ауры.`)
    if (notes.missingFamiliar) warnings.push(`Фамильяр «${notes.missingFamiliar}» не найден в данных — чемпион без фамильяра.`)
    if (notes.missingSpirit) warnings.push(`Дух «${notes.missingSpirit}» не найден в данных — фамильяр без духа.`)
  }
  const champFighter = champion && champBuild ? fighterFromChampion(champion, champBuild.rank, data, champBuild) : null
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

  const ctxs: HeroCtx[] = heroes.map((hero, hi) => {
    // A47: при «Душе Титана» слоты и стихия берутся у промоушена (у него шире список типов).
    const cls = effectiveClass(hero, data)
    if (!cls) throw new Error(`Неизвестный класс «${hero.className}»`)
    return {
      hero,
      cls,
      items: cls.slots.map((types) => itemChoices(data, input.constraints, types, hi, hero.level)),
      stones: stoneChoices(data, input.constraints, cls.element, hi),
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
  /** Win rate надетой экипировки (для «+N п.п. к надетому»); null — ещё не считался (ранняя отмена). */
  let baselineWinRate: number | null = null
  /** Симуляции, потраченные на веса статов (сверх бюджета поиска). */
  let weightSims = 0
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
    const per = quests.map((qw) => simulateTeam(fs, qw.quest, { runs, seed, powerBooster: input.powerBooster }))
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
  /** Win rate надетой экипировки (для «+N п.п. к надетому»); считается в блоке финального выбора. */
  const beam = new Map<string, { cfg: HeroConfig[]; score: number }>()
  const addBeam = (cfg: HeroConfig[], score: number): void => {
    const k = configKey(cfg)
    const prev = beam.get(k)
    if (!prev || score > prev.score) beam.set(k, { cfg: cloneTeam(cfg), score })
    if (beam.size > OPTIMIZER_BEAM * OPTIMIZER_BEAM_SLACK) {
      const keep = [...beam.entries()].sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1)).slice(0, OPTIMIZER_BEAM)
      beam.clear()
      for (const [k2, v] of keep) beam.set(k2, v)
    }
  }
  addBeam(best, bestScore)

  // Тай-брейк ролей при близких quickScore: танк — DEF (до порога 75%) и угроза; ДД — урон и выживаемость.
  const betterQuick = (s: number, trial: HeroConfig[], hi: number, bs: number, bestCfg: HeroConfig[]): boolean => {
    if (s > bs * (1 + OPTIMIZER_ROLE_TIE_TOL)) return true
    if (s < bs * (1 - OPTIMIZER_ROLE_TIE_TOL)) return false
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
  for (let pass = 0; pass < OPTIMIZER_QUICK_PASSES; pass++) {
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
  // Базовая экипировка (то, что надето) — точка отсчёта для строки «+N п.п. к надетому».
  // Надетый набор симулируется всегда: без него «+N п.п. к надетому» не с чем сравнить,
  // и он же — законный кандидат (если спуск по quickScore увёл в худший по симуляции набор).
  const baseEv = await evaluate(baseline)
  baselineWinRate = baseEv.wr
  let bestEv = await evaluate(best)
  if (betterEval(baseEv, bestEv)) {
    bestEv = baseEv
    best = cloneTeam(baseline)
  }
  const changedCount = best.reduce((n, cfg, hi) => n + cfg.filter((sc, si) => slotKey(sc) !== slotKey(baseline[hi][si])).length, 0)
  const explCost = changedCount * quests.length

  // ── 3a. Локальный поиск: после спуска для каждого слота прогнать симуляцией N следующих по рангу
  // quickScore кандидатов — ловит предметы, которые quickScore недооценил (A38). ──
  local: for (let round = 0; round < OPTIMIZER_LOCAL_PASSES; round++) {
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
  outer: for (let round = 0; round < OPTIMIZER_SIM_PASSES; round++) {
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

  // ── 4. Объяснения: отдача каждого изменённого слота (win rate с заменой − без неё) + какой стат дала замена ──
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
      out.push({ slot: si, from: itemLabel(b), to: itemLabel(sc), winRateDelta: delta, statHint: slotStatHint(hi, si, b, sc) })
    }
    explanations.push(out)
  }

  // Веса статов — после выбора набора: объясняют, ПОЧЕМУ он такой (и заодно дают барьер/угрозу).
  const weights = computeWeights(teamOf(best))
  return finish(best, explanations, null, simsUsed, bestEv, weights)

  /** «Почему» для слота: какой стат дала замена (сравнение бойца с этой вещью и без неё). */
  function slotStatHint(hi: number, si: number, from: SlotConfig, to: SlotConfig): SlotStatHint | null {
    if (!to.item) return null
    const withNew = heroFighter(hi, best[hi])
    const withOld = heroFighter(hi, best[hi].map((sc, j) => (j === si ? from : sc)) as HeroConfig)
    const deltas: { key: SlotStatStat; value: number; rel: number }[] = []
    const add = (key: SlotStatStat, value: number, basis: number): void => {
      if (value !== 0) deltas.push({ key, value, rel: basis > 0 ? Math.abs(value) / basis : Math.abs(value) })
    }
    add('atk', withNew.atk - withOld.atk, withOld.atk)
    add('def', withNew.def - withOld.def, withOld.def)
    add('hp', withNew.hp - withOld.hp, withOld.hp)
    add('crit', (withNew.crit - withOld.crit) * 100, withOld.crit * 100)
    add('eva', (withNew.eva - withOld.eva) * 100, withOld.eva * 100)
    add('critDmg', (withNew.critDmg - withOld.critDmg) * 10, withOld.critDmg * 10)
    add('threat', withNew.threat - withOld.threat, withOld.threat)
    const elNew = elementOf(withNew)
    const elOld = elementOf(withOld)
    add('element', elNew - elOld, elOld)
    if (deltas.length === 0) return { text: `«${to.item}» даёт тот же набор статов, что и прежний предмет`, stat: 'other' }
    const up = deltas.filter((d) => d.value > 0).sort((a, b) => b.rel - a.rel)
    const down = deltas.filter((d) => d.value < 0).sort((a, b) => b.rel - a.rel)
    const top = up[0] ?? null
    const worst = down[0] ?? null
    if (!top) {
      return { text: `«${to.item}» меняет статы в минус (${statDeltaText(worst!.key, worst!.value)})`, stat: 'other', fallback: statDeltaText(worst!.key, worst!.value) }
    }
    const parts = up.slice(0, 2).map((d) => statDeltaText(d.key, d.value))
    return {
      text: `${parts.join(', ')}${up.length > 2 ? ' и др.' : ''}`,
      stat: top.key,
      fallback: worst ? statDeltaText(worst.key, worst.value) : undefined,
      // Излишек уклонения сверх предела в бою не работает (A42) — о нём и предупреждаем.
      note: deltas.some((d) => d.key === 'eva' && d.value > 0)
        ? (evasionSurplusNote(withNew.eva, evaCapOf(parseSpecials(withNew.skills)), extremeOnlyQuests()) ?? undefined)
        : undefined,
    }
  }

  /** Все локации запуска Extreme? (в смешанном наборе излишек EVA теряется уже на обычной.) */
  function extremeOnlyQuests(): boolean {
    return quests.length > 0 && quests.every((q) => q.quest.difficulty === 'Extreme')
  }

  /** Стихия бойца (отображаемая величина в его стихии). */
  function elementOf(f: Fighter): number {
    const own = (Object.keys(f.elements) as Element[])[0]
    return own ? (f.elements[own] ?? 0) : 0
  }

  /**
   * Веса статов на финальном наборе. Только для режима «квест»: в универсальном веса зависели бы
   * от нескольких локалий сразу и объясняли бы хуже, чем таблица win rate по локациям.
   */
  function computeWeights(fs: Fighter[]): StatWeightsResult | null {
    if (!input.withStatWeights || quests.length !== 1) return null
    // Чемпион не входит в веса героев: его экипировку программа не подбирает.
    const heroesOnly = fs.slice(0, heroes.length)
    const w = statWeights(heroesOnly, quests[0].quest, { runs: input.statWeightRuns, seed, powerBooster: input.powerBooster })
    weightSims += w.heroes.length * (1 + STAT_WEIGHT_STATS.length) + 1
    return w
  }

  // ── сборка результата ──
  function finish(
    cfg: HeroConfig[],
    expl: SlotExplanation[][],
    cancelNote: string | null,
    sims = 0,
    ev: CandEval | null = null,
    weights: StatWeightsResult | null = null,
  ): OptimizerResult {
    const fs = teamOf(cfg)
    const per = ev?.per ?? quests.map((qw) => simulateTeam(fs, qw.quest, { runs, seed, powerBooster: input.powerBooster }))
    const perQuest: QuestOutcome[] = per.map((m, i) => ({
      questId: quests[i].quest.id,
      label: questLabel(quests[i].quest),
      weight: quests[i].weight,
      winRate: m.winRate,
      avgRounds: m.avgRounds,
      // С бонусом отряда к стихии против барьера (Rudo) — как в бою (prepare).
      barrierBroken: barrierBroken(fs, quests[i].quest, partyElementBonusPct(fs)),
    }))
    for (const pq of perQuest) {
      if (!pq.barrierBroken) warnings.push(`Барьер квеста «${pq.label}» не пробит — урон отряда снижен (стихия не подходит или её мало).`)
    }
    const o = ev ?? objectiveOf(per)
    let worst: QuestOutcome | null = null
    if (input.mode === 'universal') worst = perQuest.reduce((a, b) => (b.winRate < a.winRate ? b : a), perQuest[0])
    // Насколько вырос win rate относительно надетого (для строки «итого» в UI).
    // На раннем выходе (отмена до симуляций) надетый набор не считался — прироста не показываем.
    const improvement = baselineWinRate == null ? 0 : o.wr - baselineWinRate
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
      /** Прирост win rate относительно надетой экипировки (п.п.). */
      improvement,
      perQuest,
      worstQuest: worst,
      explanations: expl,
      warnings,
      simsUsed: sims + weightSims,
      cancelled: cancelNote != null,
      tieBreakUsed,
      statWeights: weights,
    }
  }
}
