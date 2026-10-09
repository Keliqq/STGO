/**
 * Рекомендации по навыкам героя: вклад каждого навыка в win rate и совет, какой слот
 * перекидывать каким кубиком.
 *
 * Вклад навыка = win rate отряда с навыком − win rate того же отряда без него (замена на пустой),
 * средзвешенный по целевым локациям. Навыки, встроенные в класс/духа/артефакт, не перекидываются —
 * рассматриваются только навыки из hero.skills (выданные предметами).
 *
 * Кубики (решение владельца, A39): 1 — базовый, 2 — супер, 3 — мега, 4 — идеальный, Роланд — последним.
 * ASSUMPTION: A39 — какие ступени навыков выпадают каким кубиком, в данных нет; считаем, что кубик k
 * может выдать навык до тира CUBE_MAX_TIER[k], Роланд — любой. Совет: минимальный кубик, способный
 * выдать навык тира выше текущего; Роланд — только когда текущий навык уже выше тира идеального кубика.
 *
 * Блокировки (A40):
 *  · одна иконка — взаимоисключение: два навыка одной линейки (одной иконки) на герое не уживаются;
 *  · на оружие — не больше одного общего (Common/Rare) и одного эпического навыка.
 */
import type { GameData, HeroInstance, Skill } from '../data/types.ts'
import type { QuestWeight } from './optimizer.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam } from './combat.ts'
import { CUBE_MAX_TIER, OPTIMIZER_CRN_SEED, OPTIMIZER_SIM_RUNS, SKILL_REROLL_EPS } from './constants.ts'

export type Cube = 1 | 2 | 3 | 4 | 'roland'
export const CUBE_LABELS: Record<Cube, string> = {
  1: 'базовый кубик',
  2: 'суперкубик',
  3: 'мегакубик',
  4: 'идеальный кубик',
  roland: 'Роланд',
}

export interface SkillAdviceOptions {
  seed?: number
  runs?: number
  /** Вклад выше этого порога — навык оставляем (доля win rate, 0.005 = 0,5 п.п.). */
  eps?: number
}

export interface SkillContribution {
  heroIndex: number
  /** Индекс в hero.skills (слот навыка 0..3). */
  skillIndex: number
  skillId: string
  skillName: string
  line: string
  rarity: Skill['rarity']
  tier: number | null
  /** win rate с навыком − win rate без него (средзвешенный по квестам). */
  contribution: number
}

export interface SkillAdvice {
  heroIndex: number
  skillIndex: number
  skillName: string
  contribution: number
  action: 'keep' | 'reroll'
  /** Каким кубиком перекидывать (только при action='reroll'). */
  cube?: Cube
  reasons: string[]
}

export interface SkillAdviceResult {
  contributions: SkillContribution[]
  advice: SkillAdvice[]
}

function weightedWinRate(heroes: HeroInstance[], data: GameData, champion: { name: string; rank: number } | null | undefined, quests: QuestWeight[], seed: number, runs: number): number {
  const fighters = heroes.map((h) => fighterFromHero(h, data))
  if (champion) {
    const c = data.champions.find((x) => x.name === champion.name)
    if (c) fighters.push(fighterFromChampion(c, champion.rank, data))
  }
  const wSum = quests.reduce((a, q) => a + q.weight, 0) || 1
  return quests.reduce((a, qw) => a + qw.weight * simulateTeam(fighters, qw.quest, { runs, seed }).winRate, 0) / wSum
}

/** Вклад каждого навыка из hero.skills в win rate (замена на пустой). */
export function skillContributions(
  data: GameData,
  heroes: HeroInstance[],
  champion: { name: string; rank: number } | null | undefined,
  quests: QuestWeight[],
  options: SkillAdviceOptions = {},
): SkillContribution[] {
  if (quests.length === 0 || heroes.length === 0) return []
  const seed = (options.seed ?? OPTIMIZER_CRN_SEED) >>> 0
  const runs = options.runs ?? OPTIMIZER_SIM_RUNS
  const base = weightedWinRate(heroes, data, champion, quests, seed, runs)
  const out: SkillContribution[] = []
  heroes.forEach((hero, heroIndex) => {
    hero.skills.forEach((skillId, skillIndex) => {
      const skill = data.skills.find((s) => s.id === skillId)
      if (!skill) return
      const without = heroes.map((h, i) => (i === heroIndex ? { ...h, skills: h.skills.filter((_, j) => j !== skillIndex) } : h))
      const wr = weightedWinRate(without, data, champion, quests, seed, runs)
      out.push({
        heroIndex,
        skillIndex,
        skillId,
        skillName: skill.name,
        line: skill.line,
        rarity: skill.rarity,
        tier: skill.tier,
        contribution: base - wr,
      })
    })
  })
  return out
}

/** Минимальный кубик, способный выдать навык тира выше текущего (A39). */
export function cubeForTier(tier: number | null): Cube {
  const t = tier ?? 0
  for (const c of [1, 2, 3, 4] as const) if (CUBE_MAX_TIER[c] > t) return c
  return 'roland'
}

/**
 * Советы по перекидке: навык с вкладом ≤ eps перекидываем минимальным подходящим кубиком;
 * учитываем блокировки (одна иконка, «общий + эпический» на оружие).
 */
export function rerollAdvice(
  data: GameData,
  heroes: HeroInstance[],
  champion: { name: string; rank: number } | null | undefined,
  quests: QuestWeight[],
  options: SkillAdviceOptions = {},
): SkillAdviceResult {
  const eps = options.eps ?? SKILL_REROLL_EPS
  const contributions = skillContributions(data, heroes, champion, quests, options)
  const advice: SkillAdvice[] = []
  for (const c of contributions) {
    const hero = heroes[c.heroIndex]
    const reasons: string[] = []
    if (c.contribution > eps) {
      advice.push({
        heroIndex: c.heroIndex,
        skillIndex: c.skillIndex,
        skillName: c.skillName,
        contribution: c.contribution,
        action: 'keep',
        reasons: [`навык добавляет ${(c.contribution * 100).toFixed(1)} п.п. win rate`],
      })
      continue
    }
    // Вклад ≈ 0 → перекидываем. Блокировки (A40).
    const sameLine = hero.skills.filter((id, j) => j !== c.skillIndex && data.skills.find((s) => s.id === id)?.line === c.line)
    if (sameLine.length > 0) reasons.push('на герое уже есть навык с такой иконкой — они взаимоисключающи, новый будет с другой иконкой')
    const epics = hero.skills.filter((id, j) => j !== c.skillIndex && data.skills.find((s) => s.id === id)?.rarity === 'Epic').length
    if (c.rarity === 'Epic' && epics > 0) reasons.push('эпический слот оружия уже занят — на оружие не больше одного эпического навыка')
    if (c.rarity !== 'Epic' && epics > 0 && hero.skills.length - epics <= 1) reasons.push('общий слот оружия этот — новый навык тоже будет общим')
    const cube = cubeForTier(c.tier)
    advice.push({
      heroIndex: c.heroIndex,
      skillIndex: c.skillIndex,
      skillName: c.skillName,
      contribution: c.contribution,
      action: 'reroll',
      cube,
      reasons: [
        cube === 'roland'
          ? `вклад ${(c.contribution * 100).toFixed(1)} п.п. — перекинуть; навык T${c.tier ?? '?'} выше тира идеального кубика, остаётся Роланд (он — последняя инстанция)`
          : `вклад ${(c.contribution * 100).toFixed(1)} п.п. — перекинуть ${CUBE_LABELS[cube]} (может выдать навык до T${CUBE_MAX_TIER[cube]})`,
        ...reasons,
      ],
    })
  }
  return { contributions, advice }
}
