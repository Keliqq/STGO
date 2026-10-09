/**
 * CHAMPIONS — карточки чемпионов (якорь `Prerequisite`) и общая таблица Element Breakpoints
 * (якорь `Element Breakpoints`, A13). См. docs/SCHEMA.md → CHAMPIONS.
 */
import { CLASS_GROUPS, type ClassGroup, type Element, type ElementBreakpoint, type HeroBaseStats } from '../types.ts'
import {
  type Grid,
  ParseError,
  RejectLog,
  SchemaError,
  cell,
  findCells,
  int,
  isBlank,
  multiplier,
  norm,
  pctWithBonus,
  reqInt,
  str,
  titleCase,
} from './cells.ts'
import { elementByName } from './simpleSheets.ts'

export const SHEET = 'CHAMPIONS'
/** Сейчас 13 чемпионов. */
export const MIN_CHAMPION_CARDS = 8

type StatReward = { hp: number; atk: number; def: number }

export interface ChampionCard {
  row: number
  name: string
  guest: boolean
  element: Element
  group: ClassGroup
  prerequisite: string | null
  unlockCost: string | null
  base: HeroBaseStats
  ranks: { rank: number; coins: number | null; reward: StatReward | null; leaderSkill: string | null }[]
  powerUp: { coinsFormula: string; reward: StatReward } | null
}

const LABELS: [number, number, string][] = [
  [0, 2, 'Prerequisite'],
  [0, 4, 'HP'],
  [1, 0, 'Element'],
  [1, 2, 'Critical Hit Chance'],
  [1, 4, 'ATK'],
  [2, 0, 'Unlock Cost'],
  [2, 2, 'Critical Hit Damage'],
  [2, 4, 'DEF'],
  [3, 0, 'Class Type'],
  [3, 2, 'Threat Rating'],
  [3, 4, 'EVA'],
  [4, 0, 'Rank'],
  [4, 1, 'Coins Needed'],
  [4, 2, 'Rank Reward'],
]

/** `+7 Health, +31 Attack, +43 Defense` → {hp, atk, def}. */
export function parseStatReward(v: string): StatReward {
  const get = (word: string) => {
    const m = v.match(new RegExp(`([+-]?\\d[\\d,]*)\\s+${word}`, 'i'))
    return m ? Number(m[1].replace(/,/g, '')) : 0
  }
  const reward = { hp: get('Health'), atk: get('Attack'), def: get('Defense') }
  if (reward.hp === 0 && reward.atk === 0 && reward.def === 0) throw new ParseError(`награда ранга: «${v}»`)
  return reward
}

function parseCard(rows: Grid, r: number, c0: number): ChampionCard {
  for (const [dr, dc, label] of LABELS) {
    if (norm(cell(rows, r + dr, c0 + dc)) !== norm(label)) {
      throw new ParseError(`нет подписи «${label}» (строка +${dr}, колонка +${dc})`)
    }
  }
  const rawName = cell(rows, r, c0)
  const guest = /\(Guest Champion\)/i.test(rawName)
  const name = titleCase(rawName.replace(/\(.*?\)/g, '').trim())
  if (!name) throw new ParseError('пустое имя чемпиона')

  const element = elementByName(cell(rows, r + 1, c0 + 1))
  if (!element) throw new ParseError(`неизвестная стихия «${cell(rows, r + 1, c0 + 1)}»`)
  const groupRaw = cell(rows, r + 3, c0 + 1)
  const group = CLASS_GROUPS.find((g) => g.toLowerCase() === groupRaw.toLowerCase())
  if (!group) throw new ParseError(`неизвестный Class Type «${groupRaw}»`)

  const ranks: ChampionCard['ranks'] = []
  let powerUp: ChampionCard['powerUp'] = null
  for (let i = r + 5; i < rows.length; i++) {
    const rankCell = cell(rows, i, c0)
    if (rankCell === '') break
    const rewardText = cell(rows, i, c0 + 2)
    const plus = rankCell.match(/^(\d+)\s*\(\+X\)$/i)
    if (plus) {
      powerUp = { coinsFormula: cell(rows, i, c0 + 1), reward: parseStatReward(rewardText) }
      continue
    }
    if (!/^\d+$/.test(rankCell)) throw new ParseError(`ранг «${rankCell}»`)
    const leader = rewardText.match(/^Leader Skill Upgraded:\s*(.+)$/i)
    ranks.push({
      rank: Number(rankCell),
      coins: int(cell(rows, i, c0 + 1), 'Coins Needed'),
      reward: leader || isBlank(rewardText) ? null : parseStatReward(rewardText),
      leaderSkill: leader ? leader[1].trim() : null,
    })
  }
  if (ranks.length === 0) throw new ParseError('нет строк рангов')

  return {
    row: r,
    name,
    guest,
    element,
    group,
    prerequisite: str(cell(rows, r, c0 + 3)),
    unlockCost: str(cell(rows, r + 2, c0 + 1)),
    base: {
      hp: reqInt(cell(rows, r, c0 + 5), 'HP'),
      atk: reqInt(cell(rows, r + 1, c0 + 5), 'ATK'),
      def: reqInt(cell(rows, r + 2, c0 + 5), 'DEF'),
      eva: pctWithBonus(cell(rows, r + 3, c0 + 5), 'EVA').value,
      crit: pctWithBonus(cell(rows, r + 1, c0 + 3), 'Critical Hit Chance').value,
      critDmg: multiplier(cell(rows, r + 2, c0 + 3), 'Critical Hit Damage'),
      threat: reqInt(cell(rows, r + 3, c0 + 3), 'Threat Rating'),
    },
    ranks,
    powerUp,
  }
}

/** Таблица `Rank → Element Value` под подписью `Element Breakpoints`. */
function parseElementBreakpoints(rows: Grid, log: RejectLog): ElementBreakpoint[] {
  const [anchor] = findCells(rows, 'Element Breakpoints')
  if (!anchor) throw new SchemaError(SHEET, 'нет таблицы «Element Breakpoints»')
  const [ar, ac] = anchor
  let header = -1
  for (let i = ar + 1; i < Math.min(rows.length, ar + 6); i++) {
    if (norm(cell(rows, i, ac)) === 'rank' && norm(cell(rows, i, ac + 1)) === 'element value') {
      header = i
      break
    }
  }
  if (header < 0) throw new SchemaError(SHEET, 'Element Breakpoints: нет строки «Rank | Element Value»')
  const out: ElementBreakpoint[] = []
  for (let i = header + 1; i < rows.length && cell(rows, i, ac) !== ''; i++) {
    const bp = log.guard(i, `Element Breakpoints ${cell(rows, i, ac)}`, () => ({
      rank: reqInt(cell(rows, i, ac), 'Rank'),
      value: int(cell(rows, i, ac + 1), 'Element Value'),
    }))
    if (bp) out.push(bp)
  }
  return out
}

export function parseChampions(rows: Grid): {
  cards: ChampionCard[]
  elementBreakpoints: ElementBreakpoint[]
  rejects: RejectLog
} {
  const log = new RejectLog(SHEET)
  const anchors = findCells(rows, 'Prerequisite')
  if (anchors.length < MIN_CHAMPION_CARDS) {
    throw new SchemaError(SHEET, `найдено карточек чемпионов: ${anchors.length}, ожидалось не меньше ${MIN_CHAMPION_CARDS}`)
  }
  const cards: ChampionCard[] = []
  for (const [r, c] of anchors) {
    const card = log.guard(r, cell(rows, r, c - 2) || null, () => parseCard(rows, r, c - 2))
    if (card) cards.push(card)
  }
  return { cards, elementBreakpoints: parseElementBreakpoints(rows, log), rejects: log }
}
