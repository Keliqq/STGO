/**
 * Быстрая аналитическая оценка отряда против квеста для отсева в оптимизаторе (без Монте-Карло).
 *
 * Идея (решение сессии 3b): ожидаемый DPS × ожидаемое время жизни бойца, суммарно по отряду,
 * с поправкой на барьер, пороги DEF, уклонение, угрозу (доля атак) и лечение.
 * Проверка корреляции с simulateTeam — score.test.ts (коэффициент Пирсона — в PROGRESS.md).
 */
import type { Quest } from '../data/types.ts'
import { AOE_CHANCE, BARRIER_UNBROKEN_DMG_FACTOR, ENEMY_CRIT_CHANCE, ENEMY_CRIT_MULT, MAX_ROUNDS } from './constants.ts'
import { damageFactor, effectiveEvasion, enemyCritChanceVs, prepare, type Fighter } from './combat.ts'

export interface ScoreOptions {
  maxRounds?: number
  extreme?: boolean
  aoeChance?: number
}

/**
 * Ожидаемый суммарный урон отряда до его гибели (DPS × время жизни по каждому бойцу).
 * Больше — лучше; для ранжирования кандидатов в оптимизаторе (квест фиксирован).
 * Потолок по HP монстра НЕ ставится: он превращал оценку в константу у сильных отрядов
 * и ломал корреляцию с win rate (проверка — score.test.ts).
 */
export function quickScore(fighters: Fighter[], quest: Quest, opts: ScoreOptions = {}): number {
  const p = prepare(fighters, quest, opts)
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS
  const aoeChance = opts.aoeChance ?? AOE_CHANCE
  const barrierK = p.barrierBroken ? 1 : BARRIER_UNBROKEN_DMG_FACTOR
  const n = fighters.length
  const threatSum = fighters.reduce((a, f) => a + Math.max(0, f.threat), 0)
  let expected = 0
  fighters.forEach((f, i) => {
    const m = p.selfStatic[i]
    const sp = p.specials[i]
    const atk = (f.atk + (f.atkFromShieldDef ?? 0) + m.atkFlat) * (1 + m.atkPct)
    const crit = Math.min(1, f.crit + m.crit)
    const dps = atk * (1 + crit * (f.critDmg + m.critDmg - 1)) * barrierK
    // A34/A42: штраф Extreme вычитанием, затем предел героя; A59 — крит врага по отрицательному EVA.
    const eva = effectiveEvasion(f.eva + m.eva + (f.bonus?.eva ?? 0), p.evaCaps[i], p.extreme)
    // Среднее удорожание входящего урона из-за критов врага (по компендиуму ~10% ×1.5).
    const enemyCritK = 1 + enemyCritChanceVs(ENEMY_CRIT_CHANCE, eva) * (ENEMY_CRIT_MULT - 1)
    const defEff = (f.def + m.defFlat) * (1 + m.defPct)
    const mit = damageFactor(defEff, quest.defCaps)
    const share = n > 1 && threatSum > 0 ? Math.max(0, f.threat) / threatSum : 1
    const incoming = ((n > 1 ? share * quest.monsterDmg * mit : quest.monsterDmg * mit) + (n > 1 ? aoeChance * quest.monsterAoe * mit : 0)) * (1 - eva) * enemyCritK
    const heal = sp.healSelf + p.partyHeal
    const pool = p.maxHp[i] + p.manaMax[i]
    const lifetime = incoming <= heal ? maxRounds : Math.min(maxRounds, pool / (incoming - heal))
    expected += dps * lifetime
  })
  return expected
}

/** Коэффициент корреляции Пирсона (для проверки score ↔ симуляция). */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2 || n !== ys.length) return 0
  const mx = xs.reduce((a, x) => a + x, 0) / n
  const my = ys.reduce((a, y) => a + y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}

/** Ранговый коэффициент Спирмена (ранги → Пирсон). */
export function spearman(xs: number[], ys: number[]): number {
  const rank = (xs: number[]): number[] => {
    const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
    const out = new Array<number>(xs.length)
    idx.forEach((entry, r) => {
      out[entry[1]] = r
    })
    return out
  }
  return pearson(rank(xs), rank(ys))
}
