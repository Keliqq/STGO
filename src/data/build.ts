/**
 * Сырые листы → GameData.
 * - Структура листа не та (нет заголовка/якорей, слишком мало сущностей) → SchemaError: такие данные
 *   нельзя класть в кэш (ensureFresh оставит старые).
 * - Отдельная строка не разбирается → Reject: строка пропускается, причина видна в UI («Данные»).
 * - Несостыковки между листами (ссылка на неизвестный навык и т. п.) → warnings.
 */
import type { z } from 'zod'
import { statsByQuality } from '../engine/quality.ts'
import { EMPTY_IMAGE_MAP, type ImageMap } from './imageMapTypes.ts'
import { parseBlueprints } from './parse/blueprints.ts'
import { type RejectLog, SchemaError, norm } from './parse/cells.ts'
import { parseChampions } from './parse/champions.ts'
import { parseHeroes } from './parse/heroes.ts'
import { parseQuestLevels } from './parse/questLevels.ts'
import { parseQuests } from './parse/quests.ts'
import { checkQuestComponents, parseEnchantments, parseHeroLevels, parseSkills } from './parse/simpleSheets.ts'
import { parseSkillEffects } from './parse/skillEffects.ts'
import { parseSlots } from './parse/slots.ts'
import {
  type Champion,
  ChampionSchema,
  type Enchant,
  EnchantSchema,
  GAME_DATA_VERSION,
  type GameData,
  type HeroClass,
  HeroClassSchema,
  type Item,
  ItemSchema,
  NON_EQUIPMENT_TYPES,
  QuestAreaSchema,
  QuestSchema,
  type RawSheets,
  type Reject,
  type Skill,
  SkillSchema,
} from './types.ts'

/** Листы, без которых GameData не собрать. */
export const REQUIRED_SHEETS = [
  'BLUEPRINTS',
  'ENCHANTMENTS',
  'HEROES',
  'HERO LEVELS',
  'SKILLS',
  'CHAMPIONS',
  'QUESTS',
  'QUEST COMPONENTS',
  'QUEST LEVELS',
  'SLOTS',
] as const

/**
 * Минимальные количества сущностей. Меньше — считаем, что лист сломан или обрезан, и кэш не трогаем.
 * Сейчас: предметов 1549, классов 46, навыков 621, квестов 162 — пороги с большим запасом.
 */
export const MIN_COUNTS = { items: 800, enchants: 40, heroClasses: 30, skills: 300, quests: 80, champions: 8 } as const

export interface BuildOptions {
  fetchedAt?: string
  imageMap?: ImageMap
}

/** Группы из SKILLS.Classes → фильтр по классу. */
const CLASS_GROUP_FILTERS: Record<string, (c: HeroClass) => boolean> = {
  'all classes': () => true,
  'all promoted classes': (c) => c.baseClass !== null,
  'all fighters': (c) => c.group === 'Fighter',
  'all promoted fighters': (c) => c.group === 'Fighter' && c.baseClass !== null,
  'all rogues': (c) => c.group === 'Rogue',
  'all promoted rogues': (c) => c.group === 'Rogue' && c.baseClass !== null,
  'all spellcasters': (c) => c.group === 'Spellcaster',
  'all promoted spellcasters': (c) => c.group === 'Spellcaster' && c.baseClass !== null,
}

function loose(s: string): string {
  return norm(s).replace(/['’`]/g, '')
}

function sheet(raw: RawSheets, name: string): string[][] {
  const rows = raw[name]
  if (!rows || rows.length === 0) throw new SchemaError(name, 'лист отсутствует или пуст')
  return rows
}

/** Проверка zod: не прошло → отказ, а не падение всей сборки. */
function validated<T>(schema: z.ZodType<T>, value: unknown, rejects: Reject[], sheetName: string, row: number | null, key: string): T | undefined {
  const res = schema.safeParse(value)
  if (res.success) return res.data
  const issues = res.error.issues.map((i) => `${i.path.join('.') || '·'}: ${i.message}`).join('; ')
  rejects.push({ sheet: sheetName, row: row === null ? null : row + 1, key, reason: `не прошло проверку схемы — ${issues}` })
  return undefined
}

export function buildGameData(raw: RawSheets, options: BuildOptions = {}): GameData {
  const imageMap = options.imageMap ?? EMPTY_IMAGE_MAP
  const rejects: Reject[] = []
  const warnings: string[] = []
  const collect = (log: RejectLog) => rejects.push(...log.items)
  const warnOnce = new Set<string>()
  const warn = (msg: string) => {
    if (!warnOnce.has(msg)) {
      warnOnce.add(msg)
      warnings.push(msg)
    }
  }

  for (const name of REQUIRED_SHEETS) sheet(raw, name)

  // ── Разбор листов (SchemaError пробрасывается наружу)
  const bp = parseBlueprints(sheet(raw, 'BLUEPRINTS'))
  const en = parseEnchantments(sheet(raw, 'ENCHANTMENTS'))
  const sk = parseSkills(sheet(raw, 'SKILLS'))
  const he = parseHeroes(sheet(raw, 'HEROES'))
  const hl = parseHeroLevels(sheet(raw, 'HERO LEVELS'))
  const ch = parseChampions(sheet(raw, 'CHAMPIONS'))
  const qu = parseQuests(sheet(raw, 'QUESTS'))
  const ql = parseQuestLevels(sheet(raw, 'QUEST LEVELS'))
  const sl = parseSlots(sheet(raw, 'SLOTS'))
  checkQuestComponents(sheet(raw, 'QUEST COMPONENTS'))
  for (const log of [bp.rejects, en.rejects, sk.rejects, he.rejects, hl.rejects, ch.rejects, qu.rejects, ql.rejects, sl.rejects]) collect(log)

  const itemTypes = new Set(bp.rows.map((r) => r.type))
  const bpByName = new Map(bp.rows.map((r) => [r.name, r]))

  // ── Классы героев
  const classByNorm = new Map(he.cards.map((c) => [norm(c.name), c]))
  const promotionOf = new Map<string, string>()
  for (const c of he.cards) {
    if (!c.baseClass) continue
    const base = classByNorm.get(norm(c.baseClass))
    if (base) promotionOf.set(base.name, c.name)
    else warn(`HEROES: промоушен «${c.name}» ссылается на неизвестный класс «${c.baseClass}»`)
  }
  for (const c of he.cards) {
    for (const t of c.slots.flat()) if (!itemTypes.has(t)) warn(`HEROES: у класса «${c.name}» в слоте тип «${t}», которого нет в BLUEPRINTS`)
  }
  const classesDraft: HeroClass[] = he.cards.map((c) => ({
    name: c.name,
    group: c.group,
    baseClass: c.baseClass ? (classByNorm.get(norm(c.baseClass))?.name ?? c.baseClass) : null,
    promotion: promotionOf.get(c.name) ?? null,
    element: c.element,
    prerequisite: c.prerequisite,
    goldHireCost: c.goldHireCost,
    gemHireCost: c.gemHireCost,
    base: c.base,
    innateBonus: c.innateBonus,
    slots: c.slots,
    skillSlotLevels: c.skillSlotLevels,
    innateSkills: [],
    innateTitanSkill: null,
    iconPath: imageMap.classes[c.name] ?? null,
  }))
  const championNames = new Map(ch.cards.map((c) => [norm(c.name), c.name]))

  // ── Навыки
  const skillIds = new Map<string, number>()
  const skills: Skill[] = []
  for (const s of sk.rows) {
    const n = (skillIds.get(s.name) ?? 0) + 1
    skillIds.set(s.name, n)
    const id = n === 1 ? s.name : `${s.name} #${n}`
    const classes = new Set<string>()
    const champions: string[] = []
    for (const entry of s.classesRaw) {
      const group = CLASS_GROUP_FILTERS[norm(entry)]
      if (group) {
        for (const c of classesDraft) if (group(c)) classes.add(c.name)
        continue
      }
      const cls = classByNorm.get(norm(entry))
      if (cls) classes.add(cls.name)
      else if (championNames.has(norm(entry))) champions.push(championNames.get(norm(entry))!)
      else warn(`SKILLS: в Classes неизвестное имя «${entry}» (нет ни в HEROES, ни в CHAMPIONS)`)
    }
    const parsed = parseSkillEffects(s.text, itemTypes)
    const skill = validated(
      SkillSchema,
      {
        id,
        name: s.name,
        type: s.type,
        tier: s.tier,
        rarity: s.rarity,
        upgradeCost: s.upgradeCost,
        text: s.text,
        effects: parsed.effects,
        ignored: parsed.ignored,
        unparsed: parsed.unparsed,
        classesRaw: s.classesRaw,
        classes: [...classes],
        champions,
        requiresPromotion: s.requiresPromotion,
        line: s.line,
      } satisfies Skill,
      rejects,
      'SKILLS',
      s.row,
      id,
    )
    if (skill) skills.push(skill)
  }
  const skillByName = new Map<string, Skill>()
  const skillByLoose = new Map<string, Skill>()
  for (const s of skills) {
    if (!skillByName.has(s.name)) skillByName.set(s.name, s)
    if (!skillByLoose.has(loose(s.name))) skillByLoose.set(loose(s.name), s)
  }
  /** Ссылки на навыки из других листов: точное имя, иначе без учёта регистра и апострофов (`Davy Jone's Muggin'`). */
  const findSkill = (name: string): Skill | undefined => skillByName.get(name) ?? skillByLoose.get(loose(name))

  // Врождённые навыки по классам
  for (const c of classesDraft) {
    const innate = skills.filter((s) => s.type === 'Innate' && s.classes.includes(c.name))
    c.innateSkills = innate.filter((s) => !s.requiresPromotion).map((s) => s.id)
    c.innateTitanSkill = innate.find((s) => s.requiresPromotion)?.id ?? null
    if (innate.length === 0) warn(`SKILLS: у класса «${c.name}» нет врождённого навыка`)
  }
  const heroClasses: HeroClass[] = []
  for (const c of classesDraft) {
    const card = he.cards.find((x) => x.name === c.name)
    const ok = validated(HeroClassSchema, c, rejects, 'HEROES', card?.row ?? null, c.name)
    if (ok) heroClasses.push(ok)
  }

  // ── Камни стихий и духи
  const spiritSkillByKey = new Map(Object.entries(imageMap.spiritSkills).map(([name, key]) => [key, name]))
  const enchants: Enchant[] = []
  for (const e of en.rows) {
    const row = bpByName.get(e.name)
    let skill: string | null = null
    let skillPlus: string | null = null
    let iconId: string | null = e.element ? e.element.toLowerCase() : null
    if (e.kind === 'spirit') {
      iconId = imageMap.spirits[e.name] ?? null
      // Точная связь — через ключ игры; запасная — по первому слову («Ram Spirit» → «Ram Robustness»)
      const byKey = iconId ? spiritSkillByKey.get(iconId) : undefined
      const prefix = e.name.replace(/\s+Spirit$/i, '').split(/\s+/)[0]
      const base =
        (byKey && skillByName.get(byKey)) ||
        skills.find((s) => s.type === 'Enchantment' && !s.name.endsWith('+') && s.name.split(/\s+/)[0] === prefix)
      if (base) {
        skill = base.id
        skillPlus = skillByName.get(`${base.name}+`)?.id ?? null
      } else warn(`ENCHANTMENTS: для духа «${e.name}» не найден навык в SKILLS`)
    }
    if (!row) warn(`ENCHANTMENTS: «${e.name}» нет в BLUEPRINTS — статы неизвестны`)
    const ok = validated(
      EnchantSchema,
      {
        name: e.name,
        kind: e.kind,
        element: e.element,
        elementValue: e.elementValue,
        tier: row?.tier ?? null,
        stats: row ? row.base : null,
        skill,
        skillPlus,
        iconId,
        imageId: imageMap.items[e.name] ?? null,
      } satisfies Enchant,
      rejects,
      'ENCHANTMENTS',
      e.row,
      e.name,
    )
    if (ok) enchants.push(ok)
  }
  const enchantNames = new Set(enchants.map((e) => e.name))

  // ── Предметы (всё из BLUEPRINTS, кроме самих камней/духов — они в enchants)
  const items: Item[] = []
  for (const r of bp.rows) {
    if (r.type === 'Enchantment') continue
    if (r.spiritAffinity && !findSkill(r.spiritAffinity)) warn(`BLUEPRINTS: «${r.name}» — Spirit Affinity «${r.spiritAffinity}» нет в SKILLS`)
    if (r.builtInElement && !enchantNames.has(r.builtInElement)) warn(`BLUEPRINTS: «${r.name}» — Built-In Element «${r.builtInElement}» нет в ENCHANTMENTS`)
    const artifactName = imageMap.artifacts[r.name]
    const artifactSkill = artifactName ? (findSkill(artifactName)?.id ?? null) : null
    if (artifactName && !artifactSkill) warn(`Артефакт «${r.name}»: навык «${artifactName}» не найден в SKILLS`)
    if (!artifactName && /artifact chest/i.test(r.unlock ?? '')) warn(`Артефакт «${r.name}»: неизвестен навык (нет в карте playshoptitans)`)
    const ok = validated(
      ItemSchema,
      {
        name: r.name,
        type: r.type,
        tier: r.tier,
        isEquipment: !NON_EQUIPMENT_TYPES.includes(r.type),
        unlock: r.unlock,
        stats: statsByQuality(r.base),
        elementAffinity: r.elementAffinity,
        spiritAffinity: r.spiritAffinity,
        builtInElement: r.builtInElement,
        builtInSpirit: r.builtInSpirit,
        artifactSkill,
        starforged: r.starforged,
        transcendence: r.transcendence,
        imageId: imageMap.items[r.name] ?? null,
      } satisfies Item,
      rejects,
      'BLUEPRINTS',
      r.row,
      r.name,
    )
    if (ok) items.push(ok)
  }

  // ── Чемпионы
  const champions: Champion[] = []
  for (const c of ch.cards) {
    const leaderSkills = skills.filter((s) => s.type === 'Leader' && s.champions.includes(c.name)).map((s) => s.id)
    for (const r of c.ranks) {
      if (r.leaderSkill && !findSkill(r.leaderSkill)) warn(`CHAMPIONS: «${c.name}» ранг ${r.rank} — навык «${r.leaderSkill}» нет в SKILLS`)
    }
    const ok = validated(
      ChampionSchema,
      {
        name: c.name,
        guest: c.guest,
        element: c.element,
        group: c.group,
        prerequisite: c.prerequisite,
        unlockCost: c.unlockCost,
        base: c.base,
        ranks: c.ranks.map((r) => ({ ...r, leaderSkill: r.leaderSkill ? (findSkill(r.leaderSkill)?.id ?? r.leaderSkill) : null })),
        powerUp: c.powerUp,
        leaderSkills,
      } satisfies Champion,
      rejects,
      'CHAMPIONS',
      c.row,
      c.name,
    )
    if (ok) champions.push(ok)
  }

  // ── Квесты
  const questAreas = qu.areas.filter((a) => validated(QuestAreaSchema, a, rejects, 'QUESTS', null, a.name))
  const quests = qu.quests.filter((q) => validated(QuestSchema, q, rejects, 'QUESTS', null, q.id))
  const areaNames = new Set(questAreas.map((a) => norm(a.name)))
  for (const a of new Set(ql.rows.map((r) => r.area))) {
    if (!areaNames.has(norm(a))) warn(`QUEST LEVELS: локации «${a}» нет в QUESTS`)
  }

  const data: GameData = {
    version: GAME_DATA_VERSION,
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    items,
    enchants,
    heroClasses,
    heroLevels: hl.rows,
    skills,
    champions,
    championElementBreakpoints: ch.elementBreakpoints,
    questAreas,
    quests,
    questLevels: ql.rows,
    accountSlots: sl.rows,
    rejects,
    warnings,
  }
  checkCounts(data)
  return data
}

/** Слишком мало сущностей → лист, скорее всего, обрезан или сломан. */
export function checkCounts(data: GameData): void {
  const actual = {
    items: data.items.length,
    enchants: data.enchants.length,
    heroClasses: data.heroClasses.length,
    skills: data.skills.length,
    quests: data.quests.length,
    champions: data.champions.length,
  }
  for (const [key, min] of Object.entries(MIN_COUNTS) as [keyof typeof MIN_COUNTS, number][]) {
    if (actual[key] < min) throw new SchemaError('итог сборки', `${key}: собрано ${actual[key]}, ожидалось не меньше ${min}`)
  }
}
