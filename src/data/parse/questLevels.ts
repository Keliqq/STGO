/**
 * QUEST LEVELS — локации по горизонтали. Якорь — пара подписей `Level | Reward`,
 * имя локации — в ячейке над `Level`. См. docs/SCHEMA.md → QUEST LEVELS.
 */
import type { QuestLevelReward } from '../types.ts'
import { type Grid, RejectLog, SchemaError, cell, findCells, norm, reqInt, titleCase } from './cells.ts'

export const SHEET = 'QUEST LEVELS'
export const MIN_QUEST_LEVEL_AREAS = 10

export function parseQuestLevels(rows: Grid): { rows: QuestLevelReward[]; rejects: RejectLog } {
  const log = new RejectLog(SHEET)
  const anchors = findCells(rows, 'Level').filter(([r, c]) => norm(cell(rows, r, c + 1)) === 'reward')
  if (anchors.length < MIN_QUEST_LEVEL_AREAS) {
    throw new SchemaError(SHEET, `найдено локаций: ${anchors.length}, ожидалось не меньше ${MIN_QUEST_LEVEL_AREAS}`)
  }
  const out: QuestLevelReward[] = []
  for (const [r, c] of anchors) {
    const areaRaw = cell(rows, r - 1, c)
    if (!areaRaw) {
      log.add(r, null, 'над подписью «Level» нет имени локации')
      continue
    }
    const area = titleCase(areaRaw)
    for (let i = r + 1; i < rows.length && cell(rows, i, c) !== ''; i++) {
      const row = log.guard(i, `${area} ${cell(rows, i, c)}`, () => ({
        area,
        level: reqInt(cell(rows, i, c), 'Level'),
        reward: cell(rows, i, c + 1),
      }))
      if (row) out.push(row)
    }
  }
  return { rows: out, rejects: log }
}
