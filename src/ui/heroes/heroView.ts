/**
 * Вычисления и подписи для страницы «Герои»: типы статов, строки таблицы статов, разница значений.
 * Компоненты (таблица, иконка стихии, метка черновика) — в `heroStatTable.tsx`: файл с компонентами
 * не должен экспортировать ещё и функции, иначе React Fast Refresh сбрасывает состояние формы.
 */
import type { ReactNode } from 'react'
import type { Element, Enchant, GameData } from '#/data/types.ts'
import type { HeroStats } from '#/engine/stats.ts'

/** Статы, которые умеет показывать таблица: полные статы героя или статы из эталона экспорта. */
export type ComparableStats = Pick<HeroStats, 'atk' | 'def' | 'hp' | 'crit' | 'critDmg' | 'eva' | 'threat' | 'element'>

export const ELEMENT_RU: Record<Element | 'Any', string> = {
  Fire: 'Огонь',
  Water: 'Вода',
  Air: 'Воздух',
  Earth: 'Земля',
  Light: 'Свет',
  Dark: 'Тьма',
  Gold: 'Золото',
  Any: 'любая',
}

export function pctSigned(x: number, digits = 1): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`
}

const STAT_LABEL = { atk: 'ATK', def: 'DEF', hp: 'HP' } as const

export interface StatRowSpec {
  key: string
  label: ReactNode
  value: (s: ComparableStats) => string
}

/** Строки таблицы статов: ATK/DEF/HP, крит, уклонение, угроза, стихия. */
export const STAT_ROWS: StatRowSpec[] = [
  ...(['atk', 'def', 'hp'] as const).map((st) => ({ key: st, label: STAT_LABEL[st], value: (s: ComparableStats) => String(s[st]) })),
  { key: 'crit', label: 'Крит', value: (s) => `${(s.crit * 100).toFixed(0)}% ×${s.critDmg.toFixed(1)}` },
  { key: 'eva', label: 'Уклонение', value: (s) => `${(s.eva * 100).toFixed(0)}%` },
  { key: 'threat', label: 'Угроза', value: (s) => String(s.threat) },
  { key: 'element', label: 'Стихия', value: (s) => String(s.element) },
]

/** Разница двух значений вида «1234» или «5% ×2.0» — по первому числу в строке. */
export function deltaText(a: string, b: string): string {
  const na = Number(a.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN)
  const nb = Number(b.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN)
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a === b ? '—' : '≠'
  const d = na - nb
  if (d === 0) return '—'
  const sign = d > 0 ? '+' : ''
  const percent = nb !== 0 ? ` (${sign}${((d / nb) * 100).toFixed(1)}%)` : ''
  return `${sign}${Math.round(d * 100) / 100}${percent}`
}

/** Поиск камня/духа по имени (для иконок в карточке). */
export function enchantByName(data: GameData, name: string | null): Enchant | undefined {
  return name ? data.enchants.find((e) => e.name === name) : undefined
}
