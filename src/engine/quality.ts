import { QUALITY_MULTIPLIERS, QUALITY_ROUNDING, QUALITY_SCALED_STATS } from './constants.ts'

export type QualityName = keyof typeof QUALITY_MULTIPLIERS
export const QUALITY_ORDER = Object.keys(QUALITY_MULTIPLIERS) as QualityName[]

export interface StatBlock {
  atk: number
  def: number
  hp: number
  eva: number
  crit: number
  manaShield: number
}

/** Статы предмета заданного качества из статов Normal. */
export function applyQuality(base: StatBlock, quality: QualityName): StatBlock {
  const k = QUALITY_MULTIPLIERS[quality]
  const round = QUALITY_ROUNDING === 'floor' ? Math.floor : Math.round
  const out = { ...base }
  for (const stat of QUALITY_SCALED_STATS) out[stat] = round(base[stat] * k)
  return out
}

/** Все качества сразу. */
export function statsByQuality(base: StatBlock): Record<QualityName, StatBlock> {
  return Object.fromEntries(QUALITY_ORDER.map((q) => [q, applyQuality(base, q)])) as Record<QualityName, StatBlock>
}
