/**
 * Усилители силы квеста (Power Boosters, A74): идентификаторы, подписи и разбор значения из ссылки.
 * Отдельный модуль (без React) — чтобы `PowerBoosterPicker.tsx` экспортировал только компонент
 * (правило react-refresh: файл с компонентом не должен экспортировать ещё и константы).
 */
import type { PowerBoosterId } from '#/engine/combat.ts'

export const POWER_BOOSTER_IDS: readonly PowerBoosterId[] = ['none', 'normal', 'super', 'mega']

export const POWER_BOOSTER_LABELS: Record<PowerBoosterId, string> = {
  none: 'без усилителя',
  normal: 'Normal — +20% ATK/DEF',
  super: 'Super — +40% ATK/DEF, +10% крита',
  mega: 'Mega — +80% ATK/DEF, +25% крита, +50% урона крита',
}

export const POWER_BOOSTER_HINT =
  'Усилитель силы, который вы используете в этом квесте: действует на весь отряд. Числа — stcalc.com; ' +
  '% суммируются с % карточки героя и аурами, а не умножаются поверх (A62).'

/** Из ссылки (`?booster=`) принимаем только известные усилители, иначе — «без усилителя». */
export function powerBoosterFrom(value: string | null | undefined): PowerBoosterId {
  return value && (POWER_BOOSTER_IDS as readonly string[]).includes(value) ? (value as PowerBoosterId) : 'none'
}
