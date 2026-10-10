/**
 * Ограничения подбора по умолчанию и сценарии «что если +1 тир / +1 качество».
 * Чистые функции, без DOM/React.
 *
 * Всё покупается на рынке, поэтому пул — любые предметы таблицы, а «по карману» задают ограничения:
 *   - макс. тир = макс. тир надетого в отряде + DEFAULT_ITEM_TIER_HEADROOM;
 *   - макс. качество = DEFAULT_MAX_QUALITY;
 *   - камни — до DEFAULT_MAX_STONE_TIER (или максимум надетого, если выше);
 *   - духи — все, кроме Титана, если хоть у одного героя нет «Души Титана».
 * Пользователь может переопределить любое поле (ConstraintOverrides, null — «по умолчанию»).
 */
import type { GameData, HeroInstance, Quality } from '../data/types.ts'
import {
  DEFAULT_ITEM_TIER_HEADROOM,
  DEFAULT_MAX_QUALITY,
  DEFAULT_MAX_STONE_TIER,
  OPTIMIZER_WHATIF_SIM_BUDGET,
  TITAN_SPIRIT_NAME,
} from './constants.ts'
import { QUALITY_ORDER } from './quality.ts'
import { applyHeroConfig, capForHero, type OptimizerConstraints, type OptimizerInput, type OptimizerResult, type PerHeroCap, type SlotExplanation } from './optimizer.ts'

/** Переопределения пользователя; null — взять значение по умолчанию. */
export interface ConstraintOverrides {
  maxItemTier: number | null
  maxQuality: Quality | null
  maxStoneTier: number | null
  spirits: string[] | null
}

export const NO_OVERRIDES: ConstraintOverrides = { maxItemTier: null, maxQuality: null, maxStoneTier: null, spirits: null }

/** Макс. тир предметов в таблице (верхняя граница для «+1 тир»). */
export function maxDataTier(data: GameData): number {
  return data.items.reduce((m, i) => (i.isEquipment ? Math.max(m, i.tier) : m), 1)
}

/**
 * Ограничения по умолчанию для отряда. Без героев или без надетых предметов — тир не ограничен
 * (макс. тир таблицы). titanSoul — переопределение «Души Титана» со страницы подбора.
 *
 * Тиры считаются НА КАЖДОГО ГЕРОЯ (требование владельца, сессия 13): «макс. тир = макс. надетый
 * у этого героя + DEFAULT_ITEM_TIER_HEADROOM», иначе слабому герою предлагались вещи под сильного.
 * maxItemTier/maxStoneTier отряда остаются верхней границей (для переопределений пользователя).
 */
export function defaultConstraints(data: GameData, team: HeroInstance[], titanSoul: 'as-is' | 'on' | 'off' = 'as-is'): OptimizerConstraints {
  const itemTier = new Map(data.items.map((i) => [i.name, i.tier]))
  const stoneTier = new Map(data.enchants.filter((e) => e.kind === 'element').map((e) => [e.name, e.tier ?? 0]))
  const dataTier = maxDataTier(data)
  const perHero: PerHeroCap[] = team.map((h, hi) => {
    const equippedItems = h.slots.map((s) => (s.item ? itemTier.get(s.item) : undefined)).filter((t): t is number => t != null)
    const heroItemTier = equippedItems.length > 0 ? Math.min(dataTier, Math.max(...equippedItems) + DEFAULT_ITEM_TIER_HEADROOM) : null
    const heroStoneTier = Math.max(DEFAULT_MAX_STONE_TIER, ...h.slots.map((s) => (s.element ? (stoneTier.get(s.element) ?? 0) : 0)))
    return {
      hero: hi,
      maxItemTier: heroItemTier ?? dataTier,
      maxStoneTier: heroStoneTier,
    }
  })
  const allSoul = team.length > 0 && team.every((h) => (titanSoul === 'as-is' ? h.titanSoul : titanSoul === 'on'))
  const spirits = data.enchants.filter((e) => e.kind === 'spirit' && (allSoul || e.name !== TITAN_SPIRIT_NAME)).map((e) => e.name)
  return {
    // Верхняя граница отряда — максимум по героям (у каждого своё ограничение в perHero).
    maxItemTier: perHero.length > 0 ? Math.max(...perHero.map((c) => c.maxItemTier)) : dataTier,
    maxQuality: DEFAULT_MAX_QUALITY,
    maxStoneTier: perHero.length > 0 ? Math.max(...perHero.map((c) => c.maxStoneTier ?? 0)) : DEFAULT_MAX_STONE_TIER,
    spirits,
    perHero,
  }
}

/** Итоговые ограничения: переопределения пользователя поверх значений по умолчанию. */
export function resolveConstraints(defaults: OptimizerConstraints, o: ConstraintOverrides): OptimizerConstraints {
  const spirits = o.spirits ?? defaults.spirits
  // Ручной список духов снимает ограничения «по герою» — иначе выбор пользователя не применился бы.
  const keepPerHero = o.spirits == null
  return {
    maxItemTier: o.maxItemTier ?? defaults.maxItemTier,
    maxQuality: o.maxQuality ?? defaults.maxQuality,
    maxStoneTier: o.maxStoneTier ?? defaults.maxStoneTier,
    spirits,
    perHero: keepPerHero ? defaults.perHero : undefined,
  }
}

/**
 * Пояснение к ограничениям по герою: «Антуан — до T9, Беовульф — до T7». Пусто, если у всех
 * одинаково или ограничение снято переопределением.
 */
export function perHeroTierNote(team: HeroInstance[], cons: OptimizerConstraints): string[] {
  if (!cons.perHero || cons.perHero.length === 0) return []
  const caps = team.map((h, i) => ({ name: h.name, cap: capForHero(cons, i).maxItemTier }))
  if (new Set(caps.map((c) => c.cap)).size <= 1) return []
  return caps.map((c) => `${c.name} — до T${c.cap}`)
}

export const nextQuality = (q: Quality): Quality | null => QUALITY_ORDER[QUALITY_ORDER.indexOf(q) + 1] ?? null

export type UpgradeKind = 'tier' | 'quality'

export interface UpgradeScenario {
  kind: UpgradeKind
  /** «до T11», «до Flawless». */
  label: string
  input: OptimizerInput
}

/**
 * Сценарии «+1 тир» и «+1 качество» к найденному результату. Стартовый набор каждого сценария —
 * найденная экипировка (герои уже «одеты» в result.configs), так что объяснения сценария — это
 * именно замены ради апгрейда. Сценарий пропускается, если ограничение уже на максимуме.
 */
export function upgradeScenarios(data: GameData, input: OptimizerInput, result: OptimizerResult): UpgradeScenario[] {
  const heroes = input.heroes.map((h, i) => (result.configs[i] ? applyHeroConfig(h, result.configs[i]) : h))
  const base = { ...input, heroes, simBudget: OPTIMIZER_WHATIF_SIM_BUDGET }
  const c = input.constraints
  const out: UpgradeScenario[] = []
  if (c.maxItemTier < maxDataTier(data)) {
    const t = c.maxItemTier + 1
    out.push({ kind: 'tier', label: `до T${t}`, input: { ...base, constraints: { ...c, maxItemTier: t } } })
  }
  const q = nextQuality(c.maxQuality)
  if (q) out.push({ kind: 'quality', label: `до ${q}`, input: { ...base, constraints: { ...c, maxQuality: q } } })
  return out
}

export interface UpgradeOutcome {
  /** Цель сценария (не ниже исходной: текущий набор остаётся доступен). */
  objective: number
  /** Прирост цели относительно исходного результата, ≥ 0. */
  delta: number
  /** Замены относительно найденного набора; пусто — апгрейд ничего не дал. */
  changes: SlotExplanation[][]
  cancelled: boolean
}

/**
 * Итог сценария. Подбор сценария стартует с найденного набора, но на урезанном бюджете может
 * не найти ничего лучше — тогда прирост 0 и замен нет (можно оставить текущее).
 */
export function upgradeOutcome(base: OptimizerResult, alt: OptimizerResult): UpgradeOutcome {
  const delta = alt.objective - base.objective
  if (delta <= 0) return { objective: base.objective, delta: 0, changes: base.configs.map(() => []), cancelled: alt.cancelled }
  return { objective: alt.objective, delta, changes: alt.explanations, cancelled: alt.cancelled }
}
