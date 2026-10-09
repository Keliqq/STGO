/** Простые табличные листы: ENCHANTMENTS, HERO LEVELS, SKILLS, QUEST COMPONENTS. */
import { ELEMENTS, SKILL_TYPES, type Element, type HeroLevel, type SkillType } from '../types.ts'
import { type Grid, ParseError, RejectLog, cell, expectHeader, int, isBlank, list, reqInt, str } from './cells.ts'

// ───────────── ENCHANTMENTS ─────────────

/** Колонки 2–8 — величина стихии (заголовки-иконки, A3). */
export const ENCHANT_ELEMENT_COLUMNS: Record<number, Element> = {
  2: 'Fire',
  3: 'Water',
  4: 'Air',
  5: 'Earth',
  6: 'Light',
  7: 'Dark',
  8: 'Gold',
}

export interface EnchantRow {
  row: number
  name: string
  kind: 'element' | 'spirit'
  element: Element | null
  elementValue: number | null
}

export function parseEnchantments(rows: Grid): { rows: EnchantRow[]; rejects: RejectLog } {
  const SHEET = 'ENCHANTMENTS'
  expectHeader(SHEET, rows[0], { 0: 'Name', 1: 'Type' })
  const log = new RejectLog(SHEET)
  const out: EnchantRow[] = []
  const seen = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const name = cell(rows, r, 0)
    if (!name) continue
    const parsed = log.guard(r, name, (): EnchantRow => {
      if (seen.has(name)) throw new ParseError('повтор имени')
      const type = cell(rows, r, 1)
      if (type === 'Spirit') return { row: r, name, kind: 'spirit', element: null, elementValue: null }
      if (type !== 'Element') throw new ParseError(`неизвестный Type «${type}»`)
      const filled = Object.entries(ENCHANT_ELEMENT_COLUMNS)
        .map(([c, el]) => ({ el, v: int(cell(rows, r, Number(c)), `величина ${el}`) }))
        .filter((x) => x.v !== null)
      if (filled.length !== 1) throw new ParseError(`у камня должна быть ровно одна стихия, найдено ${filled.length}`)
      return { row: r, name, kind: 'element', element: filled[0].el, elementValue: filled[0].v }
    })
    if (parsed) {
      seen.add(name)
      out.push(parsed)
    }
  }
  return { rows: out, rejects: log }
}

// ───────────── HERO LEVELS ─────────────

export function parseHeroLevels(rows: Grid): { rows: HeroLevel[]; rejects: RejectLog } {
  const SHEET = 'HERO LEVELS'
  expectHeader(SHEET, rows[0], { 0: 'Hero Level', 1: 'XP Needed', 2: 'Max Item Tier' })
  const log = new RejectLog(SHEET)
  const out: HeroLevel[] = []
  for (let r = 1; r < rows.length; r++) {
    if (!cell(rows, r, 0)) continue
    const lv = log.guard(r, cell(rows, r, 0), () => ({
      level: reqInt(cell(rows, r, 0), 'Hero Level'),
      xp: int(cell(rows, r, 1), 'XP Needed'),
      maxItemTier: reqInt(cell(rows, r, 2), 'Max Item Tier'),
    }))
    if (lv) out.push(lv)
  }
  return { rows: out, rejects: log }
}

// ───────────── SKILLS ─────────────

export interface SkillRow {
  row: number
  name: string
  type: SkillType
  tier: number | null
  rarity: 'Common' | 'Rare' | 'Epic' | null
  upgradeCost: number | null
  text: string
  classesRaw: string[]
  requiresPromotion: boolean
  line: string
}

export function parseSkills(rows: Grid): { rows: SkillRow[]; rejects: RejectLog } {
  const SHEET = 'SKILLS'
  expectHeader(SHEET, rows[0], {
    0: 'Name',
    1: 'Type',
    2: 'Tier',
    3: 'Rarity',
    5: 'Skill Effect(s)',
    6: 'Classes',
    7: 'Requires Class Promotion',
  })
  const log = new RejectLog(SHEET)
  const out: SkillRow[] = []
  let prev: SkillRow | undefined
  for (let r = 1; r < rows.length; r++) {
    const name = cell(rows, r, 0)
    if (!name) continue
    const parsed = log.guard(r, name, (): SkillRow => {
      const typeRaw = cell(rows, r, 1)
      const type = isBlank(typeRaw) ? 'Other' : SKILL_TYPES.find((t) => t === typeRaw)
      if (!type) throw new ParseError(`неизвестный Type «${typeRaw}»`)
      const tier = int(cell(rows, r, 2), 'Tier')
      const rarityRaw = str(cell(rows, r, 3))
      if (rarityRaw && !['Common', 'Rare', 'Epic'].includes(rarityRaw)) throw new ParseError(`неизвестная Rarity «${rarityRaw}»`)
      const text = str(cell(rows, r, 5))
      if (!text) throw new ParseError('пустой Skill Effect(s)')
      // Линейка: подряд идущие строки одного типа с растущим Tier (явного ID в таблице нет)
      const continues = prev !== undefined && tier !== null && prev.tier !== null && prev.type === type && tier === prev.tier + 1
      return {
        row: r,
        name,
        type,
        tier,
        rarity: rarityRaw as SkillRow['rarity'],
        upgradeCost: int(cell(rows, r, 4), 'стоимость улучшения'),
        text,
        classesRaw: list(cell(rows, r, 6)),
        requiresPromotion: /^yes$/i.test(cell(rows, r, 7)),
        line: continues && prev ? prev.line : name,
      }
    })
    prev = parsed
    if (parsed) out.push(parsed)
  }
  return { rows: out, rejects: log }
}

// ───────────── QUEST COMPONENTS ─────────────

/** Движку подбора не нужен; проверяем только структуру, чтобы заметить поломку листа. */
export function checkQuestComponents(rows: Grid): void {
  expectHeader('QUEST COMPONENTS', rows[0], { 0: 'Name', 1: 'Type', 2: 'Tier', 3: 'Value', 4: 'Quest Area' })
}

export function elementByName(v: string): Element | null {
  return ELEMENTS.find((e) => e.toLowerCase() === v.trim().toLowerCase()) ?? null
}
