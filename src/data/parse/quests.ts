/**
 * QUESTS — блоки локаций. Якорь блока — ячейка `Maximum Party Size`; значения берутся через одну колонку
 * правее подписи. Колонки строк сложностей — по строке-заголовку с `Difficulty`, по именам.
 * См. docs/SCHEMA.md → QUESTS.
 */
import type { Element, Quest, QuestArea } from '../types.ts'
import { type Grid, ParseError, RejectLog, SchemaError, cell, findCells, int, isBlank, list, norm, reqInt, str, titleCase } from './cells.ts'
import { elementByName } from './simpleSheets.ts'

export const SHEET = 'QUESTS'
/** Сейчас 15 локаций. */
export const MIN_QUEST_AREAS = 10

/** Колонки строки сложности, которые нужны движку (по заголовку). */
const DIFFICULTY_COLUMNS = [
  'Difficulty',
  'Type',
  'Minimum Power',
  'Hero XP',
  'Monster Health',
  'Monster Base DMG',
  'Monster AOE DMG',
  'Barrier Type',
  'Barrier Health',
] as const
type DifficultyColumn = (typeof DIFFICULTY_COLUMNS)[number]

/** Значение «через одну колонку» от подписи в строке (в таблице между ними объединённая ячейка). */
function labelled(rows: Grid, r: number, label: string): { found: boolean; value: string } {
  const row = rows[r] ?? []
  const c = row.findIndex((v) => norm(v) === norm(label))
  if (c < 0) return { found: false, value: '' }
  const value = row.slice(c + 1, c + 4).find((v) => v.trim() !== '') ?? ''
  return { found: true, value: value.trim() }
}

function parseBarrier(type: string, hp: string): Quest['barrier'] {
  if (isBlank(type) && isBlank(hp)) return null
  if (isBlank(type) || isBlank(hp)) throw new ParseError(`барьер заполнен частично: «${type}» / «${hp}»`)
  const elements = list(type).map((e) => {
    const el = elementByName(e)
    if (!el) throw new ParseError(`Barrier Type: неизвестная стихия «${e}»`)
    return el
  })
  return { elements: elements as Element[], hp: reqInt(hp, 'Barrier Health') }
}

export function parseQuests(rows: Grid): { areas: QuestArea[]; quests: Quest[]; rejects: RejectLog } {
  const log = new RejectLog(SHEET)
  const anchors = findCells(rows, 'Maximum Party Size')
  if (anchors.length < MIN_QUEST_AREAS) {
    throw new SchemaError(SHEET, `найдено локаций: ${anchors.length}, ожидалось не меньше ${MIN_QUEST_AREAS}`)
  }
  const areas: QuestArea[] = []
  const quests: Quest[] = []
  const seenIds = new Set<string>()

  for (const [r] of anchors) {
    // Имя локации — первая непустая ячейка строки заголовка блока
    const rawName = (rows[r] ?? []).find((v) => v.trim() !== '')?.trim() ?? ''
    const area = log.guard(r, rawName || null, (): QuestArea => {
      if (!rawName || norm(rawName) === 'maximum party size') throw new ParseError('нет имени локации')
      const gold = labelled(rows, r, 'Gold Unlock Cost')
      const merchant = labelled(rows, r, 'Required Merchant Level')
      const chest = labelled(rows, r + 1, 'Chest & Key')
      const gem = labelled(rows, r + 1, 'Gem Unlock Cost')
      for (const [ok, label] of [
        [gold.found, 'Gold Unlock Cost'],
        [merchant.found, 'Required Merchant Level'],
        [chest.found, 'Chest & Key'],
        [gem.found, 'Gem Unlock Cost'],
      ] as const) {
        if (!ok) throw new ParseError(`нет подписи «${label}»`)
      }
      return {
        name: titleCase(rawName),
        partySize: reqInt(labelled(rows, r, 'Maximum Party Size').value, 'Maximum Party Size'),
        goldUnlockCost: int(gold.value, 'Gold Unlock Cost'),
        gemUnlockCost: int(gem.value, 'Gem Unlock Cost'),
        requiredMerchantLevel: int(merchant.value, 'Required Merchant Level'),
        chest: str(chest.value),
      }
    })
    if (!area) continue
    areas.push(area)

    // Строка-заголовок сложностей
    let h = -1
    for (let i = r + 1; i < Math.min(rows.length, r + 5); i++) {
      if ((rows[i] ?? []).some((v) => norm(v) === 'difficulty')) {
        h = i
        break
      }
    }
    if (h < 0) {
      log.add(r, area.name, 'нет строки-заголовка с «Difficulty»')
      continue
    }
    const col = {} as Record<DifficultyColumn, number>
    const missing: string[] = []
    for (const name of DIFFICULTY_COLUMNS) {
      const idx = rows[h].findIndex((v) => norm(v) === norm(name))
      if (idx < 0) missing.push(name)
      col[name] = idx
    }
    if (missing.length > 0) {
      log.add(h, area.name, `в заголовке нет колонок: ${missing.join(', ')}`)
      continue
    }

    for (let i = h + 1; i < rows.length; i++) {
      const difficulty = cell(rows, i, col.Difficulty)
      if (difficulty === '') break
      const q = log.guard(i, `${area.name} ${difficulty}`, (): Quest => {
        const typeCell = cell(rows, i, col.Type)
        if (!isBlank(typeCell) && !/^boss$/i.test(typeCell)) throw new ParseError(`Type: «${typeCell}»`)
        const variant = isBlank(typeCell) ? 'normal' : 'boss'
        const id = `${area.name}|${variant}|${difficulty}`
        if (seenIds.has(id)) throw new ParseError('повтор сложности')
        return {
          id,
          area: area.name,
          variant,
          difficulty,
          minPower: int(cell(rows, i, col['Minimum Power']), 'Minimum Power'),
          heroXp: int(cell(rows, i, col['Hero XP']), 'Hero XP'),
          monsterHp: reqInt(cell(rows, i, col['Monster Health']), 'Monster Health'),
          monsterDmg: reqInt(cell(rows, i, col['Monster Base DMG']), 'Monster Base DMG'),
          monsterAoe: reqInt(cell(rows, i, col['Monster AOE DMG']), 'Monster AOE DMG'),
          barrier: parseBarrier(cell(rows, i, col['Barrier Type']), cell(rows, i, col['Barrier Health'])),
          defCaps: null,
          miniBosses: [],
        }
      })
      if (q) {
        seenIds.add(q.id)
        quests.push(q)
      }
    }
  }
  return { areas, quests, rejects: log }
}
