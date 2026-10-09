/**
 * SLOTS — покупаемые слоты аккаунта (не слоты экипировки!). Блоки по горизонтали, якорь — заголовок
 * `HERO SLOTS` / `CRAFTING SLOTS` / …, под ним строка `# | Level Required | Gold Cost | Gem Cost`.
 */
import type { AccountSlot } from '../types.ts'
import { type Grid, ParseError, RejectLog, SchemaError, cell, int, norm, reqInt, str } from './cells.ts'

export const SHEET = 'SLOTS'

const KINDS = { HERO: 'hero', CRAFTING: 'crafting', QUEST: 'quest', TRADE: 'trade', PET: 'pet' } as const
const SUBHEADER = ['#', 'Level Required', 'Gold Cost', 'Gem Cost']

export function parseSlots(rows: Grid): { rows: AccountSlot[]; rejects: RejectLog } {
  const log = new RejectLog(SHEET)
  const anchors: { r: number; c: number; kind: AccountSlot['kind'] }[] = []
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      const m = v.trim().match(/^(HERO|CRAFTING|QUEST|TRADE|PET) SLOTS$/i)
      if (m) anchors.push({ r, c, kind: KINDS[m[1].toUpperCase() as keyof typeof KINDS] })
    }),
  )
  if (!anchors.some((a) => a.kind === 'hero')) throw new SchemaError(SHEET, 'нет блока «HERO SLOTS»')

  const out: AccountSlot[] = []
  for (const { r, c, kind } of anchors) {
    const okHeader = SUBHEADER.every((label, k) => norm(cell(rows, r + 1, c + k)) === norm(label))
    if (!okHeader) {
      log.add(r + 1, kind, `под заголовком нет строки «${SUBHEADER.join(' | ')}»`)
      continue
    }
    for (let i = r + 2; i < rows.length && cell(rows, i, c) !== ''; i++) {
      const slot = log.guard(i, `${kind} ${cell(rows, i, c)}`, (): AccountSlot => {
        const n = reqInt(cell(rows, i, c), '#')
        if (n <= 0) throw new ParseError('# должен быть > 0')
        return {
          kind,
          n,
          requirement: str(cell(rows, i, c + 1)),
          goldCost: int(cell(rows, i, c + 2), 'Gold Cost'),
          gemCost: int(cell(rows, i, c + 3), 'Gem Cost'),
        }
      })
      if (slot) out.push(slot)
    }
  }
  return { rows: out, rejects: log }
}
