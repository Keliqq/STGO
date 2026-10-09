/** BLUEPRINTS: одна строка = один предмет (включая камни стихий и духов). См. docs/SCHEMA.md → BLUEPRINTS. */
import { ELEMENTS, type Element, type Upgrade } from '../types.ts'
import { type Grid, ParseError, RejectLog, cell, expectHeader, int, isBlank, list, num, reqInt, str } from './cells.ts'

export const SHEET = 'BLUEPRINTS'

/** Колонки по индексу: у части колонок в таблице иконки вместо заголовков (A2), поэтому проверяем подписи там, где они есть. */
export const COL = {
  name: 0,
  type: 1,
  unlock: 2,
  tier: 5,
  atk: 44,
  def: 45,
  hp: 46,
  eva: 47,
  crit: 48,
  manaShield: 49,
  elementAffinity: 51,
  spiritAffinity: 52,
  builtInElement: 53,
  builtInSpirit: 54,
  starforgedFrom: 67,
  transcendenceFrom: 84,
} as const

export const EXPECTED_HEADER: Record<number, string> = {
  [COL.name]: 'Name',
  [COL.type]: 'Type',
  [COL.unlock]: 'Unlock Prerequisite',
  [COL.tier]: 'Tier',
  [COL.atk]: 'ATK',
  [COL.def]: 'DEF',
  [COL.hp]: 'HP',
  [COL.eva]: 'EVA',
  [COL.crit]: 'CRIT',
  [COL.manaShield]: 'Mana Shield',
  [COL.elementAffinity]: 'Elemental Affinity',
  [COL.spiritAffinity]: 'Spirit Affinity',
  [COL.builtInElement]: 'Built-In Element',
  [COL.builtInSpirit]: 'Built-In Spirit',
  [COL.starforgedFrom]: 'Starforged Milestone 1',
  [COL.starforgedFrom + 8]: 'Starforged Milestone 5',
  [COL.transcendenceFrom]: 'Transcendence Upgrade 1',
  [COL.transcendenceFrom + 4]: 'Transcendence Upgrade 3',
}

export interface BlueprintRow {
  row: number
  name: string
  type: string
  tier: number
  unlock: string | null
  base: { atk: number; def: number; hp: number; eva: number; crit: number; manaShield: number }
  elementAffinity: 'All' | Element[]
  spiritAffinity: string | null
  builtInElement: string | null
  builtInSpirit: string | null
  starforged: Upgrade[]
  transcendence: Upgrade[]
}

function parseAffinity(v: string): 'All' | Element[] {
  if (isBlank(v)) return []
  if (/^all$/i.test(v.trim())) return 'All'
  return list(v).map((e) => {
    const el = ELEMENTS.find((x) => x.toLowerCase() === e.toLowerCase())
    if (!el) throw new ParseError(`Elemental Affinity: неизвестная стихия «${e}»`)
    return el
  })
}

function upgrades(rows: Grid, r: number, from: number, count: number): Upgrade[] {
  const out: Upgrade[] = []
  for (let k = 0; k < count; k++) {
    const text = str(cell(rows, r, from + 2 * k))
    if (text) out.push({ text, need: int(cell(rows, r, from + 2 * k + 1), 'Crafts/Seals Needed') })
  }
  return out
}

export function parseBlueprints(rows: Grid): { rows: BlueprintRow[]; rejects: RejectLog } {
  expectHeader(SHEET, rows[0], EXPECTED_HEADER)
  const log = new RejectLog(SHEET)
  const out: BlueprintRow[] = []
  const seen = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const name = cell(rows, r, COL.name)
    if (rows[r].every((c) => c.trim() === '')) continue
    const parsed = log.guard(r, name || null, (): BlueprintRow => {
      if (!name) throw new ParseError('пустое имя')
      if (seen.has(name)) throw new ParseError('повтор имени')
      const type = str(cell(rows, r, COL.type))
      if (!type) throw new ParseError('пустой Type')
      const stat = (c: number, what: string) => num(cell(rows, r, c), what) ?? 0
      return {
        row: r,
        name,
        type,
        tier: reqInt(cell(rows, r, COL.tier), 'Tier'),
        unlock: str(cell(rows, r, COL.unlock)),
        base: {
          atk: stat(COL.atk, 'ATK'),
          def: stat(COL.def, 'DEF'),
          hp: stat(COL.hp, 'HP'),
          eva: stat(COL.eva, 'EVA'),
          crit: stat(COL.crit, 'CRIT'),
          manaShield: stat(COL.manaShield, 'Mana Shield'),
        },
        elementAffinity: parseAffinity(cell(rows, r, COL.elementAffinity)),
        spiritAffinity: str(cell(rows, r, COL.spiritAffinity)),
        builtInElement: str(cell(rows, r, COL.builtInElement)),
        builtInSpirit: str(cell(rows, r, COL.builtInSpirit)),
        starforged: upgrades(rows, r, COL.starforgedFrom, 5),
        transcendence: upgrades(rows, r, COL.transcendenceFrom, 3),
      }
    })
    if (parsed) {
      seen.add(parsed.name)
      out.push(parsed)
    }
  }
  return { rows: out, rejects: log }
}
