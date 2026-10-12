/**
 * Статы героя по экипировке и навыкам — то, что игра показывает на карточке героя (до боя).
 *
 * Формулы — ST-Central, Combat Compendium (https://st-central.net/combat-compendium/):
 *   ATK = (База + Семена + Σ round((ATK предмета + камень + дух) × (1 + бонусы предмета)) + плоские навыки) × (1 + Σ ATK%)
 *   бонусы предмета = «bonus from all items» + «stats with <тип>» + навык на тип для этого стата (Wand Master, Shield Master…)
 *   DEF и HP — так же. Итог отбрасывает дробную часть (в статье 16307.55 → 16307).
 * Боевые условные эффекты (until damaged, when HP below…, for N rounds) в карточку не входят.
 * Сверка с экспортом TitansDB — stats.fixture.test.ts, итоги — docs/ASSUMPTIONS.md (A5–A8, A21–A26).
 */
import type { Element, Enchant, GameData, HeroClass, HeroInstance, HeroSlot, Item, Quality, Skill, SkillEffect } from '../data/types.ts'
import {
  AFFINITY_SCOPE,
  ELEMENT_AFFINITY_MULTIPLIER,
  GOLD_ELEMENT_COUNTS_FOR_ANY_HERO,
  HERO_LEVEL_STAT_GROWTH,
  LCOG_CHESTS,
  QUALITY_MULTIPLIERS,
  QUALITY_ROUNDING,
  SPIRIT_AFFINITY_MULTIPLIER,
  SPIRIT_ELEMENT_BONUS,
  SPIRIT_PLUS_RULE,
  SPIRIT_SKILL_DOUBLING_ITEMS,
  TYPED_ITEM_BONUS_STATS,
} from './constants.ts'
import { baseStatAtLevel, floorStat } from './formulas.ts'

// Формула округления живёт в formulas.ts; реэкспорт — для прежних импортов из stats.ts.
export { floorStat } from './formulas.ts'

export type MainStat = 'atk' | 'def' | 'hp'
export const MAIN_STATS: readonly MainStat[] = ['atk', 'def', 'hp']

/** Неподтверждённые параметры модели. По умолчанию — из constants.ts; в тестах калибровки переопределяются. */
export interface StatModel {
  quality: Record<Quality, number>
  elementAffinity: number
  spiritAffinity: number
  /** Что усиливает сродство стихии: камень / камень и дух / весь предмет. */
  affinityScope: 'stone' | 'enchant' | 'all'
  /** Какие статы предмета усиливают «stats with <тип>» / «bonus from all items with <тип>». */
  typedBonusStats: readonly MainStat[]
  /** Базовые ATK/DEF/HP класса на уровне. */
  baseAt: (cls: HeroClass, level: number) => Record<MainStat, number>
  /**
   * Множитель роста базы HP по уровню (1 — как в constants.ts). Параметр калибровки (A57):
   * кривая HP (A8) — главная нерешённая задача сверки, её крутим в анализе чувствительности.
   */
  hpGrowthMult?: number
}

/** База класса на уровне: база₁ × (1 + k·(L−1)) + c·(L−1), база₁ — статы из HEROES (A8). */
export function baseStatsAt(cls: HeroClass, level: number, model?: Pick<StatModel, 'hpGrowthMult'>): Record<MainStat, number> {
  const hpGrowth = HERO_LEVEL_STAT_GROWTH.hp
  const hpMult = model?.hpGrowthMult ?? 1
  const at = (st: MainStat): number => {
    const g = st === 'hp' ? { k: hpGrowth.k * hpMult, c: hpGrowth.c * hpMult } : HERO_LEVEL_STAT_GROWTH[st]
    return baseStatAtLevel(cls.base[st], level, g)
  }
  return { atk: at('atk'), def: at('def'), hp: at('hp') }
}

export const DEFAULT_MODEL: StatModel = {
  quality: QUALITY_MULTIPLIERS,
  elementAffinity: ELEMENT_AFFINITY_MULTIPLIER,
  spiritAffinity: SPIRIT_AFFINITY_MULTIPLIER,
  affinityScope: AFFINITY_SCOPE,
  typedBonusStats: TYPED_ITEM_BONUS_STATS,
  baseAt: baseStatsAt,
}
export interface ItemContribution {
  slot: number
  item: string
  /** Статы предмета с учётом качества. */
  itemStats: Record<MainStat, number>
  /** Камень (свой или встроенный) + дух. */
  enchantStats: Record<MainStat, number>
  /** Множитель 1 + бонусы предмета, по стату. */
  multiplier: Record<MainStat, number>
  /** Итоговый вклад (округлён). */
  total: Record<MainStat, number>
}

export interface StatBreakdown {
  base: Record<MainStat, number>
  /** Откуда база: модель роста по уровню или эталон из экспорта. */
  baseSource: 'model' | 'reference'
  seeds: Record<MainStat, number>
  items: ItemContribution[]
  /** Плоские прибавки навыков (`+150 Health`). */
  flat: Record<MainStat, number>
  /** Σ% модификаторов (0.3 = +30%). */
  pct: Record<MainStat, number>
  /** Действующие навыки с вычисленной ступенью. */
  skills: Skill[]
}

export interface HeroStats {
  atk: number
  def: number
  hp: number
  /** Доли: 0.05 = 5%. */
  crit: number
  /** Множитель: 2 = ×2. */
  critDmg: number
  eva: number
  threat: number
  /** Мана-щит (для симулятора боя). */
  manaShield: number
  /** Стихия героя (камни его стихии + духи A29) — от неё зависят ступени навыков и пробитие барьера. */
  element: number
  /** Сумма всех камней (для навыков «per point in any Element»). */
  elementAny: number
  breakdown: StatBreakdown
}

const zero = (): Record<MainStat, number> => ({ atk: 0, def: 0, hp: 0 })

interface Lookup {
  items: Map<string, Item>
  enchants: Map<string, Enchant>
  skills: Map<string, Skill>
  lines: Map<string, Skill[]>
  classes: Map<string, HeroClass>
}

const lookups = new WeakMap<GameData, Lookup>()
function lookup(data: GameData): Lookup {
  let l = lookups.get(data)
  if (!l) {
    const lines = new Map<string, Skill[]>()
    for (const s of data.skills) {
      if (s.type !== 'Hero') continue
      const arr = lines.get(s.line) ?? []
      arr.push(s)
      lines.set(s.line, arr)
    }
    for (const arr of lines.values()) arr.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    l = {
      items: new Map(data.items.map((i) => [i.name, i])),
      enchants: new Map(data.enchants.map((e) => [e.name, e])),
      skills: new Map(data.skills.map((s) => [s.id, s])),
      lines,
      classes: new Map(data.heroClasses.map((c) => [c.name, c])),
    }
    lookups.set(data, l)
  }
  return l
}

/** Предмет из сундуков Lost City of Gold (для навыка Midas' Tragedy). */
// ASSUMPTION: A23 — признак LCOG-предмета: сундук Luxurious/Opulent/Platinum (у них chest = goldcityN на playshoptitans.com).
export function isLcogItem(item: Item): boolean {
  return LCOG_CHESTS.some((c) => (item.unlock ?? '').toLowerCase() === c.toLowerCase())
}

/**
 * Эффективный класс героя. При «Душе Титана» базовый класс заменяется промоушеном (A47):
 * в HEROES у промоушена свои базовые статы (как правило ×2 к HP/ATK/DEF), свои слоты,
 * свой набор врождённых навыков и 4-я ступень навыка (`innateTitanSkill`).
 * Если герой уже промоушен или у класса нет промоушена — класс не меняется.
 */
export function effectiveClass(hero: HeroInstance, data: GameData): HeroClass | undefined {
  const classes = lookup(data).classes
  const cls = classes.get(hero.className)
  if (!cls) return undefined
  if (!hero.titanSoul || !cls.promotion) return cls
  return classes.get(cls.promotion) ?? cls
}

function affinityMatches(item: Item, el: Element | null): boolean {
  if (!el) return false
  return item.elementAffinity === 'All' || item.elementAffinity.includes(el)
}

/**
 * Камень слота для величины стихии: вставленный или встроенный в предмет (Mistpeak Bloom → Tide Element).
 * Статы встроенного камня уже входят в статы предмета (Combat Compendium: Mistpeak 163 + Eagle 16 = 179),
 * поэтому к статам добавляется только вставленный камень.
 */
function elementStoneOf(slot: HeroSlot, l: Lookup): Enchant | undefined {
  const name = slot.element ?? (slot.item ? l.items.get(slot.item)?.builtInElement : null)
  return name ? l.enchants.get(name) : undefined
}

export interface ElementValue {
  /** Отображаемая стихия (камни + духи-носители A29) — её показывает игра и она идёт против барьера. */
  element: number
  /** Стихия для порогов ступеней навыков: только камни (A29: духи пороги не открывают). */
  elementStones: number
  /** Сумма всех камней (для навыков «per point in any Element»). */
  elementAny: number
}

/** Стихия героя: Σ камней его стихии (A21) + духи из SPIRIT_ELEMENT_BONUS (A29). Класс `Any` (Spellblade) — любые камни. */
export function heroElementValue(hero: HeroInstance, data: GameData): ElementValue {
  const l = lookup(data)
  const cls = effectiveClass(hero, data)
  let elementStones = 0
  let elementAny = 0
  let spiritBonus = 0
  for (const s of hero.slots) {
    const stone = elementStoneOf(s, l)
    if (stone?.element && stone.elementValue) {
      elementAny += stone.elementValue
      // ASSUMPTION: A21 — в стихию героя идут только камни его стихии (+ Gold как универсальная).
      const counts =
        cls?.element === 'Any' ||
        stone.element === cls?.element ||
        (GOLD_ELEMENT_COUNTS_FOR_ANY_HERO && stone.element === 'Gold')
      if (counts) elementStones += stone.elementValue
    }
    // ASSUMPTION: A29 — некоторые духи дают +5 стихии (Селена +5, Джорди +30); на ступени навыков не влияет.
    if (s.spirit) spiritBonus += SPIRIT_ELEMENT_BONUS[s.spirit] ?? 0
  }
  return { element: elementStones + spiritBonus, elementStones, elementAny }
}

/**
 * Ступень линейки, открытая стихией героя: порог — Skill.upgradeCost (безымянная колонка SKILLS, A12);
 * высшая ступень (`Requires Class Promotion`) — только после промоушена (A22).
 */
export function skillTierFor(line: Skill[], element: number, promoted: boolean): Skill {
  let best = line[0]
  for (const s of line) {
    if ((s.upgradeCost ?? 0) <= element && (!s.requiresPromotion || promoted)) best = s
  }
  return best
}

/**
 * Действующий врождённый навык класса: ступень по стихии, с учётом Души Титана (A24/A47).
 * Отдельная функция нужна бою: он должен знать, какой из навыков бойца — врождённый,
 * чтобы не добавлять второй раз бонус, уже вошедший в базовые статы класса (A54).
 */
export function activeInnateSkill(hero: HeroInstance, data: GameData, element: number, cls = effectiveClass(hero, data)): Skill | undefined {
  if (!cls) return undefined
  const { skills } = lookup(data)
  const innate = cls.innateSkills.map((id) => skills.get(id)).filter((s): s is Skill => !!s)
  let innateSkill = innate.length > 0 ? skillTierFor(innate, element, cls.baseClass != null) : undefined
  // ASSUMPTION: A24 — ступень за Душу Титана заменяет врождённый навык и не требует порога стихии.
  const titan = cls.innateTitanSkill ? skills.get(cls.innateTitanSkill) : undefined
  if (hero.titanSoul && titan) innateSkill = titan
  return innateSkill
}

/**
 * Часть EVA/CRIT класса из скобок HEROES («30% (+20%)») — она уже входит в базовые статы (A26/A4).
 * У промоушенов скобки в листе не заполнены (Sensei: `EVA 30%`, `Crit 20%` — те же числа, что у Ninja
 * со скобками), поэтому при нулях берём значение базового класса: карточка промоушена показывает
 * ту же величину, а «until damaged» у его навыка есть (иначе возврат бонусов у Sensei не имел бы смысла).
 */
// ASSUMPTION: A54 — величины бонуса промоушена в HEROES нет.
export function innateBonusOf(cls: HeroClass, data: GameData): { eva: number; crit: number } {
  if (cls.innateBonus.eva > 0 || cls.innateBonus.crit > 0) return cls.innateBonus
  const base = cls.baseClass ? data.heroClasses.find((c) => c.name === cls.baseClass) : undefined
  return base?.innateBonus ?? { eva: 0, crit: 0 }
}

/** Все навыки, действующие на героя: обычные (ступень по стихии), врождённый, духи, артефакты. */
export function activeSkills(hero: HeroInstance, data: GameData, element: number): Skill[] {
  const { skills, lines, items, enchants } = lookup(data)
  // A47: при «Душе Титана» действуют врождённые навыки промоушена и разрешена 4-я ступень.
  const cls = effectiveClass(hero, data)
  const promoted = cls?.baseClass != null
  const out: Skill[] = []
  for (const id of hero.skills) {
    const root = skills.get(id)
    if (!root) continue
    const line = lines.get(root.line)
    out.push(line ? skillTierFor(line, element, promoted) : root)
  }
  if (cls) {
    const innateSkill = activeInnateSkill(hero, data, element, cls)
    if (innateSkill) out.push(innateSkill)
  }
  for (const s of hero.slots) {
    const item = s.item ? items.get(s.item) : undefined
    const spirit = s.spirit ? enchants.get(s.spirit) : undefined
    if (spirit?.skill) {
      const base = skills.get(spirit.skill)
      const plus = spirit.skillPlus ? skills.get(spirit.skillPlus) : undefined
      // ASSUMPTION: A5 — «+»-версия, если Spirit Affinity предмета = навык духа.
      const usePlus = SPIRIT_PLUS_RULE === 'affinity' && !!item && !!base && item.spiritAffinity === base.name
      const sk = usePlus && plus ? plus : base
      // Навыки одинаковых духов складываются: без этого ошибка ATK по фикстуре 9% вместо 2% (A5).
      if (sk) out.push(sk)
      // ASSUMPTION: A27 — Portable Totem Pole удваивает навык вставленного в него духа.
      if (sk && item && (SPIRIT_SKILL_DOUBLING_ITEMS as readonly string[]).includes(item.name)) out.push(sk)
    }
    if (item?.artifactSkill) {
      const sk = skills.get(item.artifactSkill)
      if (sk) out.push(sk)
    }
  }
  return out
}

/** Эффект действует на карточке героя (без боевых условий). */
function isSheetEffect(e: SkillEffect): boolean {
  return (
    e.scope === 'self' &&
    (!e.condition ||
      e.condition.kind === 'itemType' ||
      e.condition.kind === 'lcogItem' ||
      e.condition.kind === 'innateElementItem')
  )
}

function appliesToItem(e: SkillEffect, item: Item): boolean {
  if (!e.condition) return true
  if (e.condition.kind === 'itemType') return e.condition.types.includes(item.type)
  if (e.condition.kind === 'lcogItem') return isLcogItem(item)
  // «+N% extra bonus from equipment with innate elements» (Spellknight): предмет со встроенной стихией.
  if (e.condition.kind === 'innateElementItem') return item.builtInElement != null
  return false
}

export interface CalcOptions {
  model?: StatModel
  /** Брать базу из эталона экспорта, если уровень героя не изменился (по умолчанию да). */
  useReference?: boolean
}

export function calcStats(hero: HeroInstance, data: GameData, options: CalcOptions = {}): HeroStats {
  const model = options.model ?? DEFAULT_MODEL
  const l = lookup(data)
  const cls = effectiveClass(hero, data)
  if (!cls) throw new Error(`Неизвестный класс «${hero.className}»`)

  const { element, elementStones, elementAny } = heroElementValue(hero, data)
  // Ступени навыков считает стихия без духов (A29): экспорт Селены (95 при пороге 95) это подтверждает.
  const skills = activeSkills(hero, data, elementStones)
  const effects = skills.flatMap((s) => s.effects).filter(isSheetEffect)

  const flat = zero()
  const pct = zero()
  let manaBase = 0
  let manaFlat = 0
  let manaPct = 0
  // EVA/CRIT класса — как в HEROES, вместе с бонусом в скобках (Ninja «30% (+20%)»): так их показывает карточка героя,
  // хотя сам врождённый навык Ninja действует «until damaged» и в эффекты карточки не входит (A26, сверка: Ирвин, Нина).
  let crit = cls.base.crit
  let eva = cls.base.eva
  let critDmg = cls.base.critDmg
  let threat = cls.base.threat

  for (const e of effects) {
    if (e.condition) continue // бонусы к предметам — ниже
    const v = e.value
    if (e.stat === 'atk' || e.stat === 'def' || e.stat === 'hp') {
      if (e.mode === 'pct') pct[e.stat] += v / 100
      else flat[e.stat] += v
    } else if (e.stat === 'crit') crit += v / 100
    else if (e.stat === 'eva') eva += v / 100
    else if (e.stat === 'critDmg') critDmg += v / 100
    else if (e.stat === 'threat') threat += e.mode === 'flat' ? v : (cls.base.threat * v) / 100
    else if (e.stat === 'manaShield') {
      if (e.mode === 'pct') manaPct += v / 100
      else manaFlat += v
    }
  }
  // «+1% Attack per point in any Element» (Geomancer): парсер относит это к ignored, считаем здесь.
  for (const s of skills) {
    if (s.ignored.some((t) => /per point in any element/i.test(t))) pct.atk += elementAny / 100
  }

  const roundQ = QUALITY_ROUNDING === 'floor' ? Math.floor : Math.round
  const contributions: ItemContribution[] = []
  hero.slots.forEach((s, i) => {
    const item = s.item ? l.items.get(s.item) : undefined
    if (!item) return
    const q = model.quality[s.quality]
    const stone = s.element ? l.enchants.get(s.element) : undefined
    const spirit = s.spirit ? l.enchants.get(s.spirit) : undefined
    const elementMatch = !!stone && affinityMatches(item, stone.element)
    const affK = elementMatch ? model.elementAffinity : 1
    const spiritSkill = spirit?.skill ? l.skills.get(spirit.skill) : undefined
    const stoneK = elementMatch ? affK : 1
    // ASSUMPTION: A5, A6 — бонус сродства духа и (при affinityScope ≠ 'stone') сродства стихии к статам духа.
    const spiritK =
      (spiritSkill && item.spiritAffinity === spiritSkill.name ? model.spiritAffinity : 1) *
      (model.affinityScope !== 'stone' ? affK : 1)
    const itemK = model.affinityScope === 'all' ? affK : 1

    const itemStats = zero()
    const enchantStats = zero()
    const multiplier = zero()
    const total = zero()
    for (const st of MAIN_STATS) {
      itemStats[st] = roundQ(item.stats.Normal[st] * q * itemK)
      // Камень и дух усиливают только статы, которые у предмета есть (Combat Compendium: Tide на броне не даёт ATK;
      // на фикстуре альтернативы дают ошибку HP 16–17% против 7%).
      if (item.stats.Normal[st] > 0) {
        enchantStats[st] = Math.round((stone?.stats?.[st] ?? 0) * stoneK) + Math.round((spirit?.stats?.[st] ?? 0) * spiritK)
      }
      // «bonus from all items» — ко всем статам; «… with <тип>» — к model.typedBonusStats (A25);
      // «+N% Attack with Wand» — только к своему стату.
      let k = 1
      for (const e of effects) {
        if (e.mode !== 'pct' || !appliesToItem(e, item)) continue
        if (e.stat === 'itemStats') {
          if (e.condition?.kind !== 'itemType' || model.typedBonusStats.includes(st)) k += e.value / 100
        } else if (e.stat === st && e.condition) k += e.value / 100
      }
      multiplier[st] = k
      total[st] = Math.round((itemStats[st] + enchantStats[st]) * k)
    }
    eva += item.stats.Normal.eva
    crit += item.stats.Normal.crit
    manaBase += roundQ(item.stats.Normal.manaShield * q)
    contributions.push({ slot: i, item: item.name, itemStats, enchantStats, multiplier, total })
  })

  const seeds = { atk: hero.seeds.atk, def: hero.seeds.def, hp: hero.seeds.hp }
  // Модель роста по умолчанию подхватывает hpGrowthMult (A57); своя baseAt — как задана вызывающим.
  const ref = options.useReference === false ? null : referenceBase(hero, data, model)
  const modelBase = model.baseAt === baseStatsAt ? baseStatsAt(cls, hero.level, model) : model.baseAt(cls, hero.level)
  const base = ref ?? modelBase

  const out = zero()
  for (const st of MAIN_STATS) {
    const sum = base[st] + seeds[st] + flat[st] + contributions.reduce((a, c) => a + c.total[st], 0)
    out[st] = floorStat(sum * (1 + pct[st]))
  }

  return {
    ...out,
    crit,
    critDmg,
    eva,
    threat,
    manaShield: floorStat((manaBase + manaFlat) * (1 + manaPct)),
    element,
    elementAny,
    breakdown: { base, baseSource: ref ? 'reference' : 'model', seeds, items: contributions, flat, pct, skills },
  }
}

const ZERO_BASE: StatModel['baseAt'] = () => zero()

/**
 * База, при которой расчёт для снаряжения из эталона даёт ровно статы эталона:
 * база = эталон / (1 + Σ%) − Σ вкладов − плоские − семена. null — эталона нет или уровень уже другой.
 * Поглощает и ошибку модели роста (A8), и неточности модели предметов для этого героя.
 */
export function referenceBase(hero: HeroInstance, data: GameData, model: StatModel = DEFAULT_MODEL): Record<MainStat, number> | null {
  const r = hero.reference
  if (!r || r.level !== hero.level) return null
  const refHero: HeroInstance = { ...hero, slots: r.slots, skills: r.skills, reference: null }
  const s = calcStats(refHero, data, { model: { ...model, baseAt: ZERO_BASE }, useReference: false })
  const base = zero()
  for (const st of MAIN_STATS) {
    const known = s.breakdown.flat[st] + s.breakdown.items.reduce((a, c) => a + c.total[st], 0) + hero.seeds[st]
    base[st] = r.stats[st] / (1 + s.breakdown.pct[st]) - known
  }
  return base
}
