/**
 * Правила ручного создания и правки героя: что герою можно надеть и какие навыки ему доступны.
 *
 * Модуль существует потому, что до сессии 25 герой попадал в приложение только импортом из TitansDB,
 * а пользователь не мог ни создать героя, ни поменять ему уровень/экипировку. Формы «Новый герой» и
 * «Изменить» (src/ui/heroes/HeroEditor.tsx) спрашивают здесь списки вариантов, чтобы в выпадающем
 * списке было ТОЛЬКО то, что герой действительно может надеть.
 *
 * Правила — из листов таблицы (docs/SCHEMA.md), собственных допущений у редактора нет:
 *   · тип предмета разрешён слоту класса — HEROES, «Equipment Slot 1–6»; у промоушена свои слоты,
 *     а «Душа Титана» подменяет класс промоушеном (A47, `effectiveClass`);
 *   · тир предмета ≤ `Max Item Tier` уровня героя — HERO LEVELS (A8: статов по уровням там нет,
 *     но потолок тира есть; то же ограничение действует и в подборе — A66);
 *   · не больше одного артефактного предмета на героя (правило движка, `optimizer.ts → allowed`);
 *   · навыки — доступные классу и промоушену, блокировки A40 (`skills.ts → skillChoices/skillBlockReason`);
 *   · камень стихии и дух вставляются в ЛЮБОЙ предмет (A65): сродство предмета (`Elemental Affinity`,
 *     `Spirit Affinity`) — не разрешение, а бонус (A5/A6). Камень чужой стихии стихии герою не даёт (A21).
 */
import type { Enchant, GameData, HeroClass, HeroInstance, HeroSlot, Item, Quality, Skill } from '../data/types.ts'
import { NON_EQUIPMENT_TYPES } from '../data/types.ts'
import { GOLD_ELEMENT_COUNTS_FOR_ANY_HERO, QUALITY_MULTIPLIERS } from './constants.ts'
import { maxItemTierFor } from './formulas.ts'
import { heroClassNames, isWeaponSkill, skillBlockReason, skillChoices } from './skills.ts'
import { effectiveClass } from './stats.ts'

/** Почему предмета нет в списке слота. Показывается в UI словами (REASON_TEXT). */
export type ItemBlockCode =
  /** Тип предмета не разрешён этому слоту класса (HEROES, Equipment Slot 1–6). */
  | 'slotType'
  /** Тир выше потолка уровня героя (HERO LEVELS → Max Item Tier). */
  | 'tier'
  /** Артефакт, а у героя уже есть артефактный предмет в другом слоте. */
  | 'artifact'
  /** Предмет привязан к классу/навыку, которого у героя нет (навык предмета недоступен). */
  | 'classBound'
  /** Не экипировка (камень, дух, руна). */
  | 'nonEquipment'

export interface ItemOption {
  item: Item
  code: ItemBlockCode | null
  reason: string | null
}

const REASON_TEXT: Record<ItemBlockCode, string> = {
  slotType: 'тип не для этого слота класса',
  tier: 'выше потолка уровня',
  artifact: 'артефакт уже надет',
  classBound: 'привязан к чужому классу',
  nonEquipment: 'не экипировка',
}

export function blockReasonText(code: ItemBlockCode, detail = ''): string {
  return REASON_TEXT[code] + (detail ? `: ${detail}` : '')
}

const ARTIFACT_SETS = new WeakMap<GameData, Set<string>>()
const WEAPON_TYPE_SETS = new WeakMap<GameData, Set<string>>()

/** Имена артефактных предметов (у них есть `artifactSkill`, A15). */
export function artifactNames(data: GameData): Set<string> {
  let s = ARTIFACT_SETS.get(data)
  if (!s) {
    s = new Set(data.items.filter((i) => i.artifactSkill).map((i) => i.name))
    ARTIFACT_SETS.set(data, s)
  }
  return s
}

/** Типы предметов 1-го слота классов = оружие (для правил блокировки навыков A40). */
export function weaponTypes(data: GameData): Set<string> {
  let s = WEAPON_TYPE_SETS.get(data)
  if (!s) {
    s = new Set<string>()
    for (const c of data.heroClasses) for (const t of c.slots[0] ?? []) s.add(t)
    WEAPON_TYPE_SETS.set(data, s)
  }
  return s
}

/** Артефакт уже надет в другом слоте героя? */
export function heroHasArtifact(data: GameData, hero: HeroInstance, exceptSlot?: number): boolean {
  const artifacts = artifactNames(data)
  return hero.slots.some((s, i) => i !== exceptSlot && s.item != null && artifacts.has(s.item))
}

/**
 * Эффективный класс героя для проверок (A47). `null` — класс из данных не найден:
 * в списки тогда не попадает ничего, а UI показывает ошибку, а не «всё разрешено».
 */
export function editorClass(data: GameData, hero: HeroInstance): HeroClass | null {
  return effectiveClass(hero, data) ?? null
}

/** Максимальный тир предмета для уровня героя (HERO LEVELS); null — данных нет. */
export function heroMaxItemTier(data: GameData, level: number): number | null {
  return maxItemTierFor(data, level)
}

/**
 * Может ли герой надеть этот предмет в этот слот. `null` — может; иначе код причины.
 * `slot` — индекс слота (0–5) или null, когда слот ещё не выбран (проверяем только сам предмет).
 */
export function itemBlockCode(data: GameData, hero: HeroInstance, item: Item, slot: number | null, maxTier: number | null): ItemBlockCode | null {
  if (!item.isEquipment || NON_EQUIPMENT_TYPES.includes(item.type)) return 'nonEquipment'
  const cls = editorClass(data, hero)
  if (slot != null && !(cls?.slots[slot] ?? []).includes(item.type)) return 'slotType'
  if (maxTier != null && item.tier > maxTier) return 'tier'
  if (item.artifactSkill && heroHasArtifact(data, hero, slot ?? undefined)) return 'artifact'
  if (!itemUsableByHero(data, hero, item)) return 'classBound'
  return null
}

/** Навыки, к которым привязан предмет: сродство духа (BLUEPRINTS.Spirit Affinity) и артефактный навык. */
function boundSkills(data: GameData, item: Item): Skill[] {
  const out: Skill[] = []
  if (item.artifactSkill) {
    const s = data.skills.find((x) => x.id === item.artifactSkill)
    if (s) out.push(s)
  }
  if (item.spiritAffinity) {
    // ENCHANTMENTS(Spirit).Name → SKILLS.Name, первое слово (docs/SCHEMA.md); ступени «+» у линейки.
    for (const s of data.skills) {
      if (s.name.replace(/\+$/, '') !== item.spiritAffinity) continue
      // Ступени одной линейки перечисляют одни и те же классы — берём первую.
      if (!out.some((x) => x.line === s.line)) out.push(s)
    }
  }
  return out
}

/**
 * Предмет привязан к классу/навыку: его навык (сродство духа или артефактный) доступен этому классу.
 * Если навык доступен нескольким классам — предмет общий для них (в Classes так и записано).
 */
function itemUsableByHero(data: GameData, hero: HeroInstance, item: Item): boolean {
  const cls = editorClass(data, hero)
  if (!cls) return false
  const names = heroClassNames(data, hero)
  const bound = boundSkills(data, item)
  if (bound.length === 0) return true
  return bound.some((s) => s.classes.some((c) => names.includes(c)))
}

/**
 * Полный список предметов для списка слота: разрешённые сверху (сортировка по тиру, затем по имени),
 * запрещённые — в конце, с причиной. UI скрывает/блокирует их, но показывает причину, чтобы
 * пользователь понимал, почему вещи нет в списке (требование владельца).
 */
export function itemOptions(data: GameData, hero: HeroInstance, slot: number, search = ''): ItemOption[] {
  const maxTier = heroMaxItemTier(data, hero.level)
  const cls = editorClass(data, hero)
  const types = new Set(cls?.slots[slot] ?? [])
  const needle = search.trim().toLowerCase()
  const out: ItemOption[] = []
  for (const item of data.items) {
    if (needle && !item.name.toLowerCase().includes(needle)) continue
    const code = itemBlockCode(data, hero, item, slot, maxTier)
    // В список слота попадают только предметы его типов; остальные типы — шум (у класса их десятки).
    if (code === 'slotType' && !types.has(item.type)) continue
    out.push({ item, code, reason: code ? blockReasonText(code) : null })
  }
  const rank = (o: ItemOption): number => (o.code ? 1 : 0)
  return out.sort((a, b) => rank(a) - rank(b) || b.item.tier - a.item.tier || (a.item.name < b.item.name ? -1 : 1))
}

/** Надетые предметы выше потолка уровня: при понижении уровня их не удаляем, а подсвечиваем. */
export function tierOverflowSlots(data: GameData, hero: HeroInstance): number[] {
  const maxTier = heroMaxItemTier(data, hero.level)
  if (maxTier == null) return []
  const byName = new Map(data.items.map((i) => [i.name, i]))
  const out: number[] = []
  hero.slots.forEach((s, i) => {
    const item = s.item ? byName.get(s.item) : undefined
    if (item && item.tier > maxTier) out.push(i)
  })
  return out
}

// ───────────────────────── камни и духи ─────────────────────────

/** Камень стихии: у него есть стихия и её величина (ENCHANTMENTS, колонки 2–8 — A3). */
function isElementStone(enchant: Enchant): boolean {
  return enchant.kind === 'element' && (enchant.elementValue ?? 0) > 0
}

/**
 * Камень стихии вставляется в ЛЮБОЙ предмет: сродство предмета — не разрешение, а бонус (A65).
 * Источник: официальные заметки 9.0.0 — «Elements that don't match the blueprint's affinity can still
 * be enchanted like before. They simply won't receive the special benefits» (см. A6/A65).
 */
export function stoneAllowedOnItem(enchant: Enchant, item: Item | null): boolean {
  return item != null && isElementStone(enchant)
}

/** Сродство предмета совпадает с камнем → включается бонус сродства (×ELEMENT_AFFINITY_MULTIPLIER, A6). */
export function stoneAffinityOnItem(enchant: Enchant, item: Item | null): boolean {
  if (!item || enchant.element == null) return false
  return item.elementAffinity === 'All' || item.elementAffinity.includes(enchant.element)
}

/**
 * Камень считается в стихию героя: его стихия, `Any` у класса (Spellblade) или Gold — всем (A21).
 * Камень другой стихии вставить можно, но стихии этому герою он не даёт — гайд Develion: «не получится
 * пробить воздушный барьер Мушкетером (являющегося огненным героем), зачаровав его вещи камнями воздуха».
 */
export function stoneCountsForHeroElement(enchant: Enchant, cls: HeroClass | null): boolean {
  if (!cls) return false
  if (cls.element === 'Any') return true
  return enchant.element === cls.element || (GOLD_ELEMENT_COUNTS_FOR_ANY_HERO && enchant.element === 'Gold')
}

/** Навык, который даст дух: обычная и «+»-версия (Enchant.skill / skillPlus). */
export function spiritSkillOf(data: GameData, enchant: Enchant): Skill | null {
  return (enchant.skill ? data.skills.find((s) => s.id === enchant.skill) : null) ?? null
}

/**
 * Дух вставляется в ЛЮБОЙ предмет (A65): сродство предмета тоже только бонус. Источник — официальные
 * заметки 9.0.0: «Blueprint Spirit Affinities … works the same as the Elemental Affinity explained above,
 * but replaces the element score bonus with a slightly stronger Spirit skill effect».
 */
export function spiritAllowedOnItem(enchant: Enchant, item: Item | null): boolean {
  return item != null && enchant.kind === 'spirit'
}

/** Сродство предмета — навык этого духа: включается «+»-версия навыка (A5). */
export function spiritAffinityOnItem(data: GameData, enchant: Enchant, item: Item | null): boolean {
  if (!item || !item.spiritAffinity) return false
  const skill = spiritSkillOf(data, enchant)
  if (!skill) return false
  return item.spiritAffinity === skill.name || item.spiritAffinity === skill.name.replace(/\+$/, '')
}

/** Вариант зачарования в списке: сам камень/дух и что даёт сродство предмета (A65). */
export interface EnchantChoice {
  enchant: Enchant
  /** Сродство предмета совпадает → включается бонус: камень ×1,5 (A6), у духа навык «+» (A5). */
  affinity: boolean
  /** Оговорка к варианту для списка: «не даёт стихию этому герою» (A21). */
  note: string | null
}

export interface SlotEnchantChoices {
  /** Камни стихии: любой камень на любой предмет, с пометкой сродства (A65). */
  stones: EnchantChoice[]
  /** Духи: любой дух на любой предмет, с пометкой сродства (A65). */
  spirits: EnchantChoice[]
}

/**
 * Камни и духи для слота: показываем ВСЁ, что можно вставить, и помечаем бонус сродства («✦ сродство»).
 * Ограничение по предмету убрано в сессии 26 (A65): сродство — бонус, а не разрешение.
 */
export function slotEnchantChoices(data: GameData, hero: HeroInstance, slot: number): SlotEnchantChoices {
  const item = hero.slots[slot]?.item ? (data.items.find((i) => i.name === hero.slots[slot].item) ?? null) : null
  const cls = editorClass(data, hero)
  const stones = data.enchants
    .filter((e) => stoneAllowedOnItem(e, item))
    .map((e) => ({
      enchant: e,
      affinity: stoneAffinityOnItem(e, item),
      note: stoneCountsForHeroElement(e, cls) ? null : 'не даёт стихию этому герою',
    }))
  const spirits = data.enchants
    .filter((e) => spiritAllowedOnItem(e, item))
    .map((e) => ({ enchant: e, affinity: spiritAffinityOnItem(data, e, item), note: null }))
  return { stones, spirits }
}

/** Доступные герою навыки как навыки-варианты (без блокировок слотов): список для формы. */
export function heroSkillChoices(data: GameData, hero: HeroInstance): Skill[] {
  return skillChoices(data, hero)
}

/** Навыки с причиной блокировки — для списка «почему нельзя» в форме (A40). */
export function heroSkillOptions(data: GameData, hero: HeroInstance): { skill: Skill; code: 'ok' | 'level' | 'promotion' | 'line' | 'weapon'; reason: string | null }[] {
  const choices = skillChoices(data, hero)
  const available = new Set(choices.map((s) => s.id))
  const weapons = weaponTypes(data)
  const others = hero.skills.map((id) => data.skills.find((s) => s.id === id)).filter((s): s is Skill => !!s)
  const blockedLines = new Set(others.map((s) => s.line))
  const blockedWeaponRarities = new Set(others.filter((s) => isWeaponSkill(s, weapons)).map((s) => s.rarity))
  // Все Hero-навыки классов героя: и недоступные по промоушену — их показываем с причиной, а не выкидываем молча.
  const names = heroClassNames(data, hero)
  const pool = data.skills.filter((s) => s.type === 'Hero' && s.rarity !== null && s.tier !== null && s.classes.some((c) => names.includes(c)))
  return pool.map((skill) => {
    if (!available.has(skill.id)) return { skill, code: 'promotion' as const, reason: 'требует промоушена класса' }
    if (blockedLines.has(skill.line) && !hero.skills.includes(skill.id)) return { skill, code: 'line' as const, reason: `линейка «${skill.line}» уже есть на герое` }
    if (isWeaponSkill(skill, weapons) && blockedWeaponRarities.has(skill.rarity)) {
      return { skill, code: 'weapon' as const, reason: `на оружие уже есть ${skill.rarity === 'Epic' ? 'эпический' : 'обычный'} навык` }
    }
    return { skill, code: 'ok' as const, reason: null }
  })
}

/** Проверка конкретного навыка в слот (кнопка «поставить» в форме). */
export function skillBlockedForSlot(data: GameData, hero: HeroInstance, skillId: string, slot: number): string | null {
  const skill = data.skills.find((s) => s.id === skillId)
  if (!skill) return 'навык не найден в данных'
  return skillBlockReason(data, hero, skill, slot)
}

// ───────────────────────── проверка набора целиком ─────────────────────────

export interface HeroValidation {
  ok: boolean
  /** Проблемы по слотам (0–5): текст для UI. */
  slots: (string | null)[]
  /** Общие проблемы героя (навыки, класс). */
  general: string[]
}

/**
 * Проверка всего набора героя: типы и тир предметов, один артефакт, доступность навыков.
 * Камень и дух проверяются только на «есть в данных»: вставить их можно в любой предмет (A65),
 * а «камень чужой стихии» — не ошибка, а оговорка в списке слота (A21).
 */
export function validateHero(data: GameData, hero: HeroInstance): HeroValidation {
  const slots: (string | null)[] = [null, null, null, null, null, null]
  const general: string[] = []
  const cls = editorClass(data, hero)
  if (!cls) general.push(`класс «${hero.className}» не найден в данных`)
  const maxTier = heroMaxItemTier(data, hero.level)
  const artifacts = artifactNames(data)
  hero.slots.forEach((s, i) => {
    const problems: string[] = []
    if (!s.item) return (slots[i] = null)
    const item = data.items.find((x) => x.name === s.item)
    if (!item) {
      slots[i] = `предмет «${s.item}» не найден в данных`
      return
    }
    if (!item.isEquipment || NON_EQUIPMENT_TYPES.includes(item.type)) problems.push('не экипировка')
    if (cls && !cls.slots[i].includes(item.type)) problems.push(`тип «${item.type}» не для слота ${i + 1} класса ${cls.name}`)
    if (maxTier != null && item.tier > maxTier) problems.push(`тир T${item.tier} выше потолка T${maxTier} для ${hero.level} ур. — «не наденет на этом уровне»`)
    if (item.artifactSkill) {
      const other = hero.slots.some((x, j) => j !== i && x.item != null && artifacts.has(x.item))
      if (other) problems.push('второй артефакт на героя')
    }
    if (s.element && !data.enchants.some((e) => e.name === s.element)) problems.push(`камень «${s.element}» не найден в данных`)
    if (s.spirit && !data.enchants.some((e) => e.name === s.spirit)) problems.push(`дух «${s.spirit}» не найден в данных`)
    slots[i] = problems.length > 0 ? problems.join('; ') : null
  })
  hero.skills.forEach((id, i) => {
    const reason = skillBlockedForSlot(data, hero, id, i + 1)
    if (reason) general.push(`навык ${i + 1}: ${reason}`)
  })
  const ok = slots.every((s) => s == null) && general.length === 0
  return { ok, slots, general }
}

// ───────────────────────── создание, копирование, применение ─────────────────────────

/** Пустой слот экипировки (Normal, без камня и духа). */
export function emptySlot(): HeroSlot {
  return { item: null, quality: 'Normal', element: null, spirit: null }
}

/** Классы для выпадающего списка: базовые, у промоушена — подпись базового класса. */
export function classChoices(data: GameData): HeroClass[] {
  return [...data.heroClasses].sort((a, b) => {
    const ga = a.baseClass ?? a.name
    const gb = b.baseClass ?? b.name
    return ga.localeCompare(gb, 'ru') || Number(a.baseClass != null) - Number(b.baseClass != null)
  })
}

/** Новый пустой герой (форма «Новый герой»): уровень 1, без экипировки, эталона нет. */
export function newHero(className: string, name = ''): HeroInstance {
  return {
    id: crypto.randomUUID(),
    name,
    className,
    level: 1,
    titanSoul: false,
    slots: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()],
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
    draft: false,
    originId: null,
  }
}

/**
 * Копия героя для экспериментов (черновик): своё имя с пометкой «черновик», `originId` — на оригинал,
 * чтобы UI показал сравнение статов «до/после». Эталон копии — её собственный (копируем как есть).
 */
export function draftCopy(hero: HeroInstance): HeroInstance {
  return {
    ...structuredClone(hero),
    id: crypto.randomUUID(),
    name: `${hero.name} (черновик)`,
    draft: true,
    originId: hero.id,
  }
}

/** Пустой слот-конфиг: применяется к герою из результата подбора. */
export function applySlots(hero: HeroInstance, slots: readonly HeroSlot[]): HeroInstance {
  return { ...hero, slots: slots.map((s) => ({ ...s })) }
}

/**
 * Смена уровня героя. Эталон TitansDB (A8) действует, только пока уровень не менялся, — поэтому при
 * смене уровня он перестаёт участвовать в расчёте: база берётся из модели роста, и точность HP падает
 * (по сверке A8 — примерно ±9%). Если уровень вернули обратно, эталон снова рабочий. Сам эталон
 * не удаляем: он остаётся памятью об экспорте (требование владельца — «не удалять молча»).
 */
export interface LevelChange {
  hero: HeroInstance
  /** Эталон есть, но больше не подходит по уровню: HP считается моделью (A8). */
  referenceOutdated: boolean
}

export function changeLevel(hero: HeroInstance, level: number): LevelChange {
  return { hero: { ...hero, level }, referenceOutdated: hero.reference != null && hero.reference.level !== level }
}

/** Точность базы героя словами — то, что показывается рядом с уровнем (A8). */
export function baseAccuracyNote(hero: HeroInstance): string | null {
  if (!hero.reference || hero.reference.level === hero.level) return null
  return `уровень изменён (эталон с ${hero.reference.level} ур.) — база считается моделью роста, HP приблизительно ±9%`
}

/** Множитель качества в статах предмета (A7). */
export function qualityMultiplier(q: Quality): number {
  return QUALITY_MULTIPLIERS[q]
}
