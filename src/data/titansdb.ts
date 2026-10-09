/**
 * Импорт героев из экспорта TitansDB (.txt). Формат — docs/SCHEMA.md → «Экспорт TitansDB».
 *
 * Два шага:
 *  1. parseTitansDb(text) — только разбор строк, без игровых данных;
 *  2. matchTitansDb(parsed, data) — сопоставление имён с GameData → HeroInstance + отчёт импорта.
 */
import { imageMap } from './images.ts'
import { norm } from './parse/cells.ts'
import type { Element, GameData, HeroInstance, HeroSlot, Quality, Skill } from './types.ts'
import { ELEMENTS, QUALITIES } from './types.ts'

// ───────────────────────────── Разбор ─────────────────────────────

export interface TitansDbSlot {
  /** Тип слота как в экспорте (`Spear`, `Cape`, …). */
  slotType: string
  /** Имя предмета без хвоста `(ATK/DEF) - T7`. */
  item: string | null
  itemTier: number | null
  quality: string | null
  /** `15 / Tier 9` + стихия камня из отдельной колонки. */
  element: { value: number; tier: number; element: string } | null
  /** `Lion Spirit (+5%ATK +1%EVA)` → name + описание навыка. */
  spirit: { name: string; description: string | null } | null
}

export interface TitansDbHero {
  /** Номер строки в файле, с 1. */
  line: number
  name: string
  groupLabel: string
  className: string
  level: number
  titanSoul: boolean
  slots: TitansDbSlot[]
  skills: { name: string; description: string | null }[]
  /** Артефактный предмет (колонка перед блоком через `|`) или null. */
  artifact: string | null
  /** Статы из экспорта. crit/eva — доли. */
  stats: { hp: number; atk: number; def: number; threat: number; crit: number; critDmg: number; eva: number; element: number }
  heroElement: string | null
}

export interface TitansDbParseError {
  line: number
  message: string
}

/** Колонки до блока через `|` (TAB-разделённые). */
const COL = { name: 0, group: 1, hp: 4, atk: 5, def: 6, threat: 7, crit: 8, critDmg: 9, eva: 10, element: 11, heroElement: 12 } as const
/** Смещения внутри блока через `|`. */
const BLOCK = { titanSoul: 0, className: 2, slotTypes: 3, items: 9, qualities: 15, enchants: 21, spirits: 27, skills: 33, level: 37, stoneElements: 41 } as const
const BLOCK_MIN_PARTS = 30

/** `Name (описание)` → {name, description}. Описание может само содержать скобки. */
function nameWithDescription(v: string): { name: string; description: string | null } {
  const m = v.match(/^(.*?)\s*\((.*)\)\s*$/)
  return m ? { name: m[1].trim(), description: m[2].trim() } : { name: v.trim(), description: null }
}

function parseNumber(v: string | undefined, what: string): number {
  const n = Number((v ?? '').trim())
  if ((v ?? '').trim() === '' || !Number.isFinite(n)) throw new Error(`${what}: не число «${v ?? ''}»`)
  return n
}

function parseLine(line: string, lineNo: number): TitansDbHero {
  const cols = line.split('\t')
  const blockIdx = cols.findIndex((c) => c.split('|').length > BLOCK_MIN_PARTS)
  if (blockIdx < 0) throw new Error('нет блока снаряжения (поле с разделителями «|»)')
  const b = cols[blockIdx].split('|').map((s) => s.trim())
  const at = (i: number): string => b[i] ?? ''

  const slots: TitansDbSlot[] = []
  for (let i = 0; i < 6; i++) {
    const itemRaw = at(BLOCK.items + i)
    const im = itemRaw.match(/^(.*?)\s*(?:\([^)]*\))?\s*-\s*T(\d+)\s*$/)
    const enchRaw = at(BLOCK.enchants + i)
    const em = enchRaw.match(/^(\d+)\s*\/\s*Tier\s*(\d+)$/i)
    if (enchRaw !== '' && !em) throw new Error(`слот ${i + 1}: камень «${enchRaw}» — ожидалось «15 / Tier 9»`)
    const spiritRaw = at(BLOCK.spirits + i)
    slots.push({
      slotType: at(BLOCK.slotTypes + i),
      item: itemRaw === '' ? null : im ? im[1].trim() : itemRaw,
      itemTier: im ? Number(im[2]) : null,
      quality: at(BLOCK.qualities + i) || null,
      element: em ? { value: Number(em[1]), tier: Number(em[2]), element: at(BLOCK.stoneElements + i) } : null,
      spirit: spiritRaw === '' ? null : nameWithDescription(spiritRaw),
    })
  }

  const skills = [0, 1, 2, 3].map((i) => at(BLOCK.skills + i)).filter((s) => s !== '').map(nameWithDescription)
  const artifactRaw = blockIdx > 0 ? cols[blockIdx - 1].trim() : ''
  const pct = (v: string | undefined, what: string): number => Math.round(parseNumber(v, what) * 1e4) / 1e6

  return {
    line: lineNo,
    name: (cols[COL.name] ?? '').trim(),
    groupLabel: (cols[COL.group] ?? '').trim(),
    className: at(BLOCK.className),
    level: parseNumber(at(BLOCK.level), 'уровень'),
    titanSoul: /^yes$/i.test(at(BLOCK.titanSoul)),
    slots,
    skills,
    artifact: artifactRaw === '' || /^none$/i.test(artifactRaw) ? null : artifactRaw,
    stats: {
      hp: parseNumber(cols[COL.hp], 'HP'),
      atk: parseNumber(cols[COL.atk], 'ATK'),
      def: parseNumber(cols[COL.def], 'DEF'),
      threat: parseNumber(cols[COL.threat], 'угроза'),
      crit: pct(cols[COL.crit], 'шанс крита'),
      critDmg: parseNumber(cols[COL.critDmg], 'множитель крита'),
      eva: pct(cols[COL.eva], 'уклонение'),
      element: parseNumber(cols[COL.element], 'стихия'),
    },
    heroElement: (cols[COL.heroElement] ?? '').trim() || null,
  }
}

/** Разобрать текст экспорта. Пустые строки пропускаются, сломанные — в errors. */
export function parseTitansDb(text: string): { heroes: TitansDbHero[]; errors: TitansDbParseError[] } {
  const heroes: TitansDbHero[] = []
  const errors: TitansDbParseError[] = []
  // BOM в начале файла (Блокнот Windows)
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  body
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim() === '') return
      try {
        heroes.push(parseLine(line, i + 1))
      } catch (e) {
        errors.push({ line: i + 1, message: e instanceof Error ? e.message : String(e) })
      }
    })
  return { heroes, errors }
}

// ───────────────────────────── Сопоставление ─────────────────────────────

export interface ImportIssue {
  hero: string
  line: number
  level: 'error' | 'warning'
  message: string
}

export interface ImportResult {
  heroes: HeroInstance[]
  issues: ImportIssue[]
}

/** Сравнение имён без учёта регистра, лишних пробелов и вида апострофа. */
export function nameKey(v: string): string {
  return norm(v.replace(/[‘’ʼ`´]/g, "'"))
}

/**
 * Ключи «стат+величина» из текста эффекта. Одинаково работает для текста SKILLS (`+120% Defense, +30% Health`)
 * и для сокращённых описаний TitansDB (`+120% DEF & +30% HP`, `+10%DEF +10 Threat`).
 */
export function effectKeys(text: string): string[] {
  const keys: string[] = []
  for (const m of text.matchAll(/([+-]\d+(?:\.\d+)?)\s*(%?)\s*([A-Za-z][A-Za-z' ]*)/g)) {
    const w = m[3].trim().toLowerCase()
    const stat = /^(attack|atk)\b/.test(w) ? 'atk'
      : /^(defense|def)\b/.test(w) ? 'def'
      : /^(health|hp)\b/.test(w) ? 'hp'
      : /^(evasion|eva)\b/.test(w) ? 'eva'
      : /^crit(ical)?( hit)? chance/.test(w) ? 'crit'
      : /^crit(ical)?( hit)? damage/.test(w) ? 'critDmg'
      : /^mana shield/.test(w) ? 'manaShield'
      : /^threat/.test(w) ? 'threat'
      : /^xp\b/.test(w) ? 'xp'
      : /^(bonus|stats)/.test(w) ? 'itemStats'
      : /^break chance/.test(w) ? 'break'
      : /^resting time/.test(w) ? 'rest'
      : w
    keys.push(`${stat}${m[2]}${Number(m[1])}`)
  }
  return keys
}

/** Сколько ключей описания нашлось в тексте (мультимножество). */
function matchScore(descKeys: string[], text: string): number {
  const pool = effectKeys(text)
  let score = 0
  for (const k of descKeys) {
    const i = pool.indexOf(k)
    if (i >= 0) {
      score++
      pool.splice(i, 1)
    }
  }
  return score
}

interface Indexes {
  items: Map<string, GameData['items'][number]>
  enchants: Map<string, GameData['enchants'][number]>
  classes: Map<string, GameData['heroClasses'][number]>
  /** Ключ имени (любой ступени и имени линейки) → линейка. */
  skillLines: Map<string, Skill[]>
  /** id иконки fankit (`s_scythemaster`) → линейка. */
  skillIconLines: Map<string, Skill[]>
  heroSkillLines: Skill[][]
}

function buildIndexes(data: GameData, skillIcons: Record<string, string>): Indexes {
  const lines = new Map<string, Skill[]>()
  for (const s of data.skills) {
    if (s.type !== 'Hero') continue
    const arr = lines.get(s.line) ?? []
    arr.push(s)
    lines.set(s.line, arr)
  }
  const skillLines = new Map<string, Skill[]>()
  const skillIconLines = new Map<string, Skill[]>()
  for (const [line, skills] of lines) {
    skills.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    skillLines.set(nameKey(line), skills)
    for (const s of skills) {
      if (!skillLines.has(nameKey(s.name))) skillLines.set(nameKey(s.name), skills)
      const icon = skillIcons[s.name]?.match(/icon_global_skill_([^/]+?)\.png$/i)?.[1]
      if (icon && !skillIconLines.has(icon.toLowerCase())) skillIconLines.set(icon.toLowerCase(), skills)
    }
  }
  return {
    items: new Map(data.items.map((i) => [nameKey(i.name), i])),
    enchants: new Map(data.enchants.map((e) => [nameKey(e.name), e])),
    classes: new Map(data.heroClasses.map((c) => [nameKey(c.name), c])),
    skillLines,
    skillIconLines,
    heroSkillLines: [...lines.values()],
  }
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface MatchOptions {
  /** Навык → путь иконки fankit; по умолчанию из imageMap.json. */
  skillIcons?: Record<string, string>
}

/** Сопоставить разобранных героев с GameData. */
export function matchTitansDb(parsed: TitansDbHero[], data: GameData, options: MatchOptions = {}): ImportResult {
  const idx = buildIndexes(data, options.skillIcons ?? imageMap.skills)
  const heroes: HeroInstance[] = []
  const issues: ImportIssue[] = []

  for (const h of parsed) {
    const issue = (level: ImportIssue['level'], message: string): void => {
      issues.push({ hero: h.name, line: h.line, level, message })
    }
    const cls = idx.classes.get(nameKey(h.className))
    if (!cls) {
      issue('error', `класс «${h.className}» не найден — герой пропущен`)
      continue
    }

    const slots: HeroSlot[] = h.slots.map((s, i) => {
      const n = i + 1
      let item: string | null = null
      if (s.item) {
        const found = idx.items.get(nameKey(s.item))
        if (!found) issue('warning', `слот ${n}: предмет «${s.item}» не найден`)
        else {
          item = found.name
          if (s.itemTier !== null && s.itemTier !== found.tier) issue('warning', `слот ${n}: «${found.name}» — в экспорте T${s.itemTier}, в таблице T${found.tier}`)
        }
      }
      let quality: Quality = 'Normal'
      if (s.quality) {
        const q = QUALITIES.find((x) => x.toLowerCase() === s.quality?.toLowerCase())
        if (q) quality = q
        else if (s.item) issue('warning', `слот ${n}: неизвестное качество «${s.quality}», считаю Normal`)
      }
      let element: string | null = null
      if (s.element) {
        const el = ELEMENTS.find((x) => x.toLowerCase() === s.element?.element.toLowerCase()) as Element | undefined
        const stone = el
          ? data.enchants.find((e) => e.kind === 'element' && e.element === el && e.elementValue === s.element?.value)
          : undefined
        if (!stone) issue('warning', `слот ${n}: камень «${s.element.element} ${s.element.value} / T${s.element.tier}» не найден`)
        else {
          element = stone.name
          if (stone.tier !== null && stone.tier !== s.element.tier) issue('warning', `слот ${n}: «${stone.name}» — в экспорте T${s.element.tier}, в таблице T${stone.tier}`)
        }
      }
      let spirit: string | null = null
      if (s.spirit) {
        const found = idx.enchants.get(nameKey(s.spirit.name))
        if (!found || found.kind !== 'spirit') issue('warning', `слот ${n}: дух «${s.spirit.name}» не найден`)
        else spirit = found.name
      }
      return { item, quality, element, spirit }
    })

    const skills: string[] = []
    for (const sk of h.skills) {
      let line = idx.skillLines.get(nameKey(sk.name)) ?? idx.skillIconLines.get(sk.name.toLowerCase())
      let how = ''
      if (!line && sk.description) {
        // Имя в TitansDB может отличаться от таблицы (`Mana Shield` = линейка `Magic Shield`): ищем по описанию
        const keys = effectKeys(sk.description)
        const candidates = idx.heroSkillLines.filter(
          (l) => l.some((s) => s.classes.includes(cls.name)) && l.some((s) => matchScore(keys, s.text) === keys.length),
        )
        if (candidates.length === 1) {
          line = candidates[0]
          how = ` (сопоставлен по описанию с «${line[0].line}»)`
        }
      }
      if (!line) {
        issue('warning', `навык «${sk.name}» не найден`)
        continue
      }
      // Храним линейку (1-я ступень). Реальную ступень движок считает по стихии героя (A12, A22):
      // TitansDB показывает описание высшей ступени, для выбора ступени оно не годится.
      skills.push(line[0].id)
      if (how) issue('warning', `навык «${sk.name}»${how}`)
      if (!line.some((s) => s.classes.includes(cls.name))) issue('warning', `навык «${line[0].name}» недоступен классу ${cls.name} по таблице`)
    }

    if (h.artifact && !slots.some((s) => s.item && nameKey(s.item) === nameKey(h.artifact ?? ''))) {
      issue('warning', `артефакт «${h.artifact}» не надет ни в один слот`)
    }

    heroes.push({
      id: newId(),
      name: h.name,
      className: cls.name,
      level: h.level,
      titanSoul: h.titanSoul,
      slots,
      skills,
      seeds: { atk: 0, def: 0, hp: 0 },
      reference: { level: h.level, slots: structuredClone(slots), skills: [...skills], stats: { ...h.stats } },
    })
  }
  return { heroes, issues }
}

/** Разбор + сопоставление одним вызовом (для UI). */
export function importTitansDb(text: string, data: GameData, options: MatchOptions = {}): ImportResult {
  const { heroes, errors } = parseTitansDb(text)
  const result = matchTitansDb(heroes, data, options)
  return {
    heroes: result.heroes,
    issues: [...errors.map((e): ImportIssue => ({ hero: '', line: e.line, level: 'error', message: e.message })), ...result.issues],
  }
}
