/**
 * Синтетические герои для тестов «особенность класса/чемпиона срабатывает».
 * В фикстуре пробуждённых (Titan Soul) героев нет, поэтому герой собирается из листов:
 * класс + лучшие доступные предметы по типам его слотов + камни стихии на максимум величины.
 */
import type { Element, GameData, HeroInstance, HeroSlot, Item } from '../data/types.ts'
import { classSkills } from '../engine/classModel.ts'

export interface SyntheticOptions {
  titanSoul?: boolean
  level?: number
}

/** Лучший (по сумме ATK+DEF+HP) предмет типа `type` не выше `maxTier`. */
function bestItem(data: GameData, type: string, maxTier: number): Item | undefined {
  return data.items
    .filter((it) => it.type === type && it.tier <= maxTier)
    .sort((a, b) => {
      const sum = (x: Item): number => x.stats.Normal.atk + x.stats.Normal.def + x.stats.Normal.hp
      return sum(b) - sum(a)
    })[0]
}

/** Максимальный камень стихии `element` (для порогов ступеней навыков нужна большая величина). */
function maxStone(data: GameData, element: Element): string | null {
  const stone = data.enchants
    .filter((e) => e.kind === 'element' && e.element === element && (e.elementValue ?? 0) > 0)
    .sort((a, b) => (b.elementValue ?? 0) - (a.elementValue ?? 0))[0]
  return stone?.name ?? null
}

/**
 * Синтетический герой класса: уровни 35 (макс. тир предметов из HERO LEVELS), предметы — лучшие
 * по типам слотов, при этом типы, упомянутые в эффектах врождённого навыка («+N% Attack with Dagger»,
 * «stats with Ring», «Shield's DEF»), обязательно надеты — иначе особенность класса не проявится.
 */
export function syntheticHero(data: GameData, className: string, options: SyntheticOptions = {}): HeroInstance {
  const cls = data.heroClasses.find((c) => c.name === className)
  if (!cls) throw new Error(`Нет класса «${className}»`)
  const level = options.level ?? 35
  const maxTier = data.heroLevels.find((l) => l.level === level)?.maxItemTier ?? 16
  const innate = classSkills(data, className)

  // Типы, которые нужно надеть обязательно: из условий «with <тип>» и из «Shield's DEF is added to ATK».
  const needed = new Set<string>()
  for (const s of innate) {
    for (const e of s.effects) if (e.condition?.kind === 'itemType') for (const t of e.condition.types) needed.add(t)
    if (/shield's def is added to atk/i.test(s.text)) needed.add('Shield')
  }

  const slots: HeroSlot[] = cls.slots.map(() => ({ item: null, quality: 'Normal', element: null, spirit: null }))
  const used = new Set<number>()
  for (const type of needed) {
    const idx = cls.slots.findIndex((allowed, i) => !used.has(i) && allowed.includes(type))
    if (idx < 0) continue
    const item = bestItem(data, type, maxTier)
    if (!item) continue
    slots[idx] = { ...slots[idx], item: item.name }
    used.add(idx)
  }
  cls.slots.forEach((allowed, i) => {
    if (used.has(i)) return
    const item = allowed.map((t) => bestItem(data, t, maxTier)).filter((x): x is Item => !!x).sort((a, b) => b.tier - a.tier)[0]
    if (item) slots[i] = { ...slots[i], item: item.name }
  })

  const element: Element = cls.element === 'Any' ? 'Fire' : cls.element
  const stone = maxStone(data, element)
  for (const s of slots) s.element = stone

  return {
    id: `synth-${className}`,
    name: `Тест ${className}`,
    className,
    level,
    titanSoul: options.titanSoul ?? false,
    slots,
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
  }
}

/** Копия GameData без врождённых навыков класса — «выключенная» особенность класса. */
export function withoutInnateSkills(data: GameData, className: string): GameData {
  const copy = structuredClone(data)
  const cls = copy.heroClasses.find((c) => c.name === className)
  if (!cls) throw new Error(`Нет класса «${className}»`)
  cls.innateSkills = []
  cls.innateTitanSkill = null
  return copy
}

/**
 * Простой герой для тестов правил состава и плана команд: класс, уровень, слоты без предметов.
 * Камень `stone` вставляется в первые `stoneCount` слотов — так задаётся стихия героя (A21) без сбора
 * экипировки. По умолчанию берётся самый крупный камень стихии класса.
 */
export function plainHero(
  data: GameData,
  className: string,
  opts: { id?: string; name?: string; level?: number; stone?: string | null; stoneCount?: number } = {},
): HeroInstance {
  const cls = data.heroClasses.find((c) => c.name === className)
  if (!cls) throw new Error(`Нет класса «${className}»`)
  const stone = opts.stone === undefined ? maxStone(data, cls.element === 'Any' ? 'Fire' : cls.element) : opts.stone
  const count = opts.stoneCount ?? 6
  const slots: HeroSlot[] = cls.slots.map((_, i) => ({ item: null, quality: 'Normal', element: i < count ? stone : null, spirit: null }))
  return {
    id: opts.id ?? `plain-${className}`,
    name: opts.name ?? `Тест ${className}`,
    className,
    level: opts.level ?? 35,
    titanSoul: false,
    slots,
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
  }
}
