/**
 * Подсказка по защите: где DEF бойца стоит на кривой урона врага и куда двигаться дальше.
 *
 * Кривая — та же, что в бою (`formulas.ts → damageFactor`, A30): ×1.5 урона при DEF = 0,
 * ×1.0 на половине порога 50%, ×0.5 / ×0.3 / ×0.25 на порогах 50 / 70 / 75% (cap).
 * Источники:
 *   · ST-Central Combat Compendium — сама кривая и её пороги;
 *   · гайд stcalc.com по защите — «вкладываться стоит примерно до трети cap»: cap/3 — это и есть
 *     порог 70% (A71: p50 = cap/6, p70 = cap/3, p75 = cap), после которого кривая почти плоская
 *     (×0.3 → ×0.25 при том, что DEF растёт втрое).
 * Поэтому зоны такие: ниже p50/2 — урон врага выше 100%, защита окупается сильнее всего;
 * до p50; до p70; выше p70 — «дальше защита почти ничего не даёт, лучше HP/ATK».
 *
 * Совет «урезать DEF» не даётся герою с малым HP: у него потеря защиты конвертируется в гибель
 * (A75).
 */
import type { DefCaps } from '../data/types.ts'
import { damageFactor, resolveCombatModel, type CombatModel } from './combat.ts'

/** Зона DEF на кривой: где стоит защита бойца относительно порогов квеста. */
export type DefZone = 'no-caps' | 'below-half' | 'to-p50' | 'to-p70' | 'above-p70'

export interface DefAdviceInput {
  /** Боевая защита бойца (уже со всеми бонусами). */
  def: number
  /** HP бойца — чтобы не советовать урезать DEF тому, у кого HP мало. */
  hp?: number
  /** HP остальных бойцов отряда: «мало HP» — ниже медианы отряда (A75). */
  partyHp?: number[]
  /** Пороги защиты квеста (A10/A71); null — порогов нет, кривую посчитать нельзя. */
  caps: DefCaps | null
  /** Переопределение кривой (анализ чувствительности A57). */
  model?: CombatModel
}

/** Куда ещё имеет смысл добрать DEF: ближайший порог. */
export interface DefNextStep {
  threshold: 'p50' | 'p70'
  /** Значение порога. */
  at: number
  /** Сколько DEF не хватает до порога. */
  delta: number
  /** Множитель урона врага на пороге (0.5 у p50, 0.3 у p70). */
  damageFactorAt: number
}

export interface DefAdvice {
  zone: DefZone
  /** Множитель урона врага при текущем DEF: 1.5 = 150%, 0.25 = 25%. */
  damageFactor: number
  /** Ближайший порог (null — уже выше p70 или порогов нет). */
  next: DefNextStep | null
  /** Короткая подпись зоны для таблицы: «ниже p50/2», «до p50», «выше p70»… */
  short: string
  /** Короткий заголовок для таблицы. */
  title: string
  /** Полное пояснение. */
  text: string
  /** У бойца мало HP: советовать урезать DEF нельзя. */
  lowHp: boolean
}

/** Медиана (для правила «мало HP»). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ASSUMPTION: A75 — «мало HP» = HP ниже медианы отряда (при 1 бойце сравнить не с чем — правило
// не применяется): снижать защиту герою, которого и так убивают первым, нельзя.
export function hasLowHp(hp: number, partyHp: number[] | undefined): boolean {
  if (hp == null || !partyHp || partyHp.length < 2) return false
  return hp < median(partyHp)
}

const pctOf = (factor: number): string => `${Math.round(factor * 100)}%`
const r0 = (x: number): string => `${Math.round(x)}`

/** Подсказка по защите бойца: зона на кривой, ближайший порог и что делать дальше. */
export function defAdvice(input: DefAdviceInput): DefAdvice {
  const { def, caps } = input
  const model = resolveCombatModel(input.model)
  const lowHp = hasLowHp(input.hp ?? 0, input.partyHp)
  const hpNote = lowHp ? ` У героя мало HP (${r0(input.hp ?? 0)}) — урезать DEF нельзя, сначала HP.` : ''

  if (!caps || caps.p50 <= 0) {
    return {
      zone: 'no-caps',
      short: 'порогов нет',
      damageFactor: 1,
      next: null,
      title: 'Порогов нет',
      text:
        'Для этой локации нет порогов защиты (их не было на STC Hub и вы не вписали Defense cap на «Данных»), ' +
        'поэтому кривая урона не строится: считаем, что DEF урона не снижает. Впишите Defense cap с экрана игры.',
      lowHp,
    }
  }

  const half = caps.p50 / 2
  const factor = damageFactor(def, caps, model)
  const at50 = damageFactor(caps.p50, caps, model)
  const at70 = damageFactor(caps.p70, caps, model)
  const base = `Пороги квеста: p50 ${r0(caps.p50)} (урон ${pctOf(at50)}), p70 ${r0(caps.p70)} (${pctOf(at70)}), cap ${r0(caps.p75)} (${pctOf(model.mitigation.at75)}).`

  if (def < half) {
    return {
      zone: 'below-half',
      short: 'ниже p50/2',
      damageFactor: factor,
      next: { threshold: 'p50', at: caps.p50, delta: caps.p50 - def, damageFactorAt: at50 },
      title: `Ниже p50/2 — урон ${pctOf(factor)}`,
      text: `DEF ${r0(def)} — ниже половины порога 50% (${r0(half)}): враг бьёт на ${pctOf(factor)} своего урона, то есть больше 100%. Здесь каждый пункт защиты окупается лучше всего — есть смысл добрать ${r0(caps.p50 - def)} DEF до p50. ${base}`,
      lowHp,
    }
  }
  if (def < caps.p50) {
    return {
      zone: 'to-p50',
      short: 'до p50',
      damageFactor: factor,
      next: { threshold: 'p50', at: caps.p50, delta: caps.p50 - def, damageFactorAt: at50 },
      title: `До p50 — урон ${pctOf(factor)}`,
      text: `DEF ${r0(def)} между половиной p50 (${r0(half)}) и p50 (${r0(caps.p50)}): урон врага ${pctOf(factor)}. Отдача защиты здесь ещё хорошая, до p50 остаётся ${r0(caps.p50 - def)} DEF. ${base}`,
      lowHp,
    }
  }
  if (def < caps.p70) {
    return {
      zone: 'to-p70',
      short: 'до p70',
      damageFactor: factor,
      next: { threshold: 'p70', at: caps.p70, delta: caps.p70 - def, damageFactorAt: at70 },
      title: `До p70 — урон ${pctOf(factor)}`,
      text: `DEF ${r0(def)} между p50 (${r0(caps.p50)}) и p70 (${r0(caps.p70)}): урон врага ${pctOf(factor)}. Главный выигрыш уже получен (порог 50% пройден), до p70 остаётся ${r0(caps.p70 - def)} DEF — это ещё даёт немного. ${base}`,
      lowHp,
    }
  }
  return {
    zone: 'above-p70',
    short: 'выше p70',
    damageFactor: factor,
    next: null,
    title: `Выше p70 — урон ${pctOf(factor)}`,
    text: `DEF ${r0(def)} выше p70 (${r0(caps.p70)}): урон врага ${pctOf(factor)}. Дальше защита почти ничего не даёт — до cap ${r0(caps.p75)} урон падает всего до ${pctOf(model.mitigation.at75)}, а вложить придётся ещё ${r0(caps.p75 - def)} DEF; лучше HP/ATK.${hpNote} ${base}`,
    lowHp,
  }
}
