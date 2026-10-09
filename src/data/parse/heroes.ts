/**
 * HEROES — «карточки» классов. Якорь карточки — ячейка с подписью `Prerequisite`;
 * все остальные поля ищутся относительно неё и проверяются по подписям (docs/SCHEMA.md → HEROES).
 */
import { CLASS_GROUPS, type ClassGroup, type Element, type HeroBaseStats } from '../types.ts'
import {
  type Grid,
  ParseError,
  RejectLog,
  SchemaError,
  cell,
  cost,
  findCells,
  isBlank,
  multiplier,
  norm,
  pctWithBonus,
  reqInt,
  str,
  titleCase,
} from './cells.ts'
import { elementByName } from './simpleSheets.ts'

export const SHEET = 'HEROES'
/** Если карточек меньше — лист, скорее всего, сломан. Сейчас их 46. */
export const MIN_HERO_CARDS = 30

export interface HeroCard {
  row: number
  name: string
  group: ClassGroup
  baseClass: string | null
  element: Element | 'Any'
  prerequisite: string | null
  goldHireCost: number | null
  gemHireCost: number | null
  base: HeroBaseStats
  innateBonus: { eva: number; crit: number }
  slots: string[][]
  skillSlotLevels: number[]
}

/** Подписи карточки: [смещение строки, смещение колонки, текст]. */
const LABELS: [number, number, string][] = [
  [0, 2, 'Prerequisite'],
  [0, 4, 'HP'],
  [0, 6, 'ELEMENT'],
  [1, 2, 'Critical Hit Chance'],
  [1, 4, 'ATK'],
  [2, 0, 'Gold Hire Cost'],
  [2, 2, 'Critical Hit Damage'],
  [2, 4, 'DEF'],
  [3, 0, 'Gem Hire Cost'],
  [3, 2, 'Threat Rating'],
  [3, 4, 'EVA'],
  [4, 0, 'Equipment Slot 1'],
  [4, 5, 'Equipment Slot 6'],
  [4, 6, 'Skill Slot Unlock'],
]

/** Группа — по ближайшему сверху заголовку `FIGHTER CLASSES` / … в той же колонке. */
function groupAbove(rows: Grid, r: number, c: number): ClassGroup | null {
  for (let i = r; i >= 0; i--) {
    const m = cell(rows, i, c).match(/^(FIGHTER|ROGUE|SPELLCASTER) CLASSES$/i)
    if (m) return CLASS_GROUPS.find((g) => g.toLowerCase() === m[1].toLowerCase()) ?? null
  }
  return null
}

function parseCard(rows: Grid, r: number, c0: number): HeroCard {
  for (const [dr, dc, label] of LABELS) {
    if (norm(cell(rows, r + dr, c0 + dc)) !== norm(label)) {
      throw new ParseError(`нет подписи «${label}» (строка +${dr}, колонка +${dc})`)
    }
  }
  const rawName = cell(rows, r, c0)
  const [firstLine, ...rest] = rawName.split(/\r?\n/)
  if (!firstLine.trim()) throw new ParseError('пустое имя класса')
  const promo = rest.join(' ').match(/\(\s*(.+?)\s+Class Promotion\s*\)/i)

  const group = groupAbove(rows, r, c0)
  if (!group) throw new ParseError('не найден заголовок группы (FIGHTER/ROGUE/SPELLCASTER CLASSES)')

  const elRaw = cell(rows, r + 2, c0 + 6)
  const element = /^any$/i.test(elRaw) ? 'Any' : elementByName(elRaw)
  if (!element) throw new ParseError(`неизвестная стихия «${elRaw}»`)

  const crit = pctWithBonus(cell(rows, r + 1, c0 + 3), 'Critical Hit Chance')
  const eva = pctWithBonus(cell(rows, r + 3, c0 + 5), 'EVA')

  // Списки типов по слотам: строки ниже `Equipment Slot N` до пустой строки
  const slots: string[][] = [[], [], [], [], [], []]
  const skillSlotLevels: number[] = []
  for (let i = r + 5; i < rows.length; i++) {
    const segment = Array.from({ length: 7 }, (_, k) => cell(rows, i, c0 + k))
    if (segment.every((v) => v === '')) break
    segment.slice(0, 6).forEach((v, k) => {
      if (!isBlank(v)) slots[k].push(v)
    })
    const lv = segment[6].match(/^Lv\.\s*(\d+)$/i)
    if (lv) skillSlotLevels.push(Number(lv[1]))
    else if (!isBlank(segment[6])) throw new ParseError(`Skill Slot Unlock: «${segment[6]}»`)
  }
  const empty = slots.findIndex((s) => s.length === 0)
  if (empty >= 0) throw new ParseError(`слот ${empty + 1} без допустимых типов`)

  return {
    row: r,
    name: titleCase(firstLine.trim()),
    group,
    baseClass: promo ? titleCase(promo[1]) : null,
    element,
    prerequisite: str(cell(rows, r, c0 + 3)),
    goldHireCost: cost(cell(rows, r + 2, c0 + 1), 'Gold Hire Cost'),
    gemHireCost: cost(cell(rows, r + 3, c0 + 1), 'Gem Hire Cost'),
    base: {
      hp: reqInt(cell(rows, r, c0 + 5), 'HP'),
      atk: reqInt(cell(rows, r + 1, c0 + 5), 'ATK'),
      def: reqInt(cell(rows, r + 2, c0 + 5), 'DEF'),
      eva: eva.value,
      crit: crit.value,
      critDmg: multiplier(cell(rows, r + 2, c0 + 3), 'Critical Hit Damage'),
      threat: reqInt(cell(rows, r + 3, c0 + 3), 'Threat Rating'),
    },
    innateBonus: { eva: eva.bonus, crit: crit.bonus },
    slots,
    skillSlotLevels,
  }
}

export function parseHeroes(rows: Grid): { cards: HeroCard[]; rejects: RejectLog } {
  const log = new RejectLog(SHEET)
  const anchors = findCells(rows, 'Prerequisite')
  if (anchors.length < MIN_HERO_CARDS) {
    throw new SchemaError(SHEET, `найдено карточек классов: ${anchors.length}, ожидалось не меньше ${MIN_HERO_CARDS}`)
  }
  const cards: HeroCard[] = []
  const seen = new Set<string>()
  for (const [r, c] of anchors) {
    const c0 = c - 2
    const card = log.guard(r, cell(rows, r, c0).split(/\r?\n/)[0] || null, () => {
      const card = parseCard(rows, r, c0)
      if (seen.has(card.name)) throw new ParseError('повтор класса')
      return card
    })
    if (card) {
      seen.add(card.name)
      cards.push(card)
    }
  }
  return { cards, rejects: log }
}
