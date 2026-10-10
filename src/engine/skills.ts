/**
 * Рекомендации по навыкам героя: вклад каждого навыка в win rate и совет, какой слот
 * перекидывать каким кубиком.
 *
 * Вклад навыка = win rate отряда с навыком − win rate того же отряда без него (замена на пустой),
 * средзвешенный по целевым локациям. Навыки, встроенные в класс/духа/артефакт, не перекидываются —
 * рассматриваются только навыки из hero.skills (выданные предметами).
 *
 * Кубики — подтверждено ST-Central, «Skill Rerolls: A Basic Breakdown»
 * (https://st-central.net/skill-rerolls-roland/, 21–22.11.2025):
 *  · базовый роллит слот 1, супер — слоты 1–2, мега — 1–3, идеальный — 1–4;
 *  · стоимость: супер = 2 базовых, мега = 4, идеальный = 8 (в статье: «T2 costs double that of a T1,
 *    T3 is 4x a T1, and T4s are 8x»);
 *  · кубик k перекидывает и все младшие слоты, поэтому для слота N берём минимальный кубик,
 *    который его покрывает (`cubeForSlot`), а не «побольше»;
 *  · блокировки: навыки с одинаковой иконкой блокируют друг друга; на оружие нельзя второй обычный
 *    и нельзя второй эпический навык (обычный + эпический вместе — можно);
 *  · Роланд: любой навык в любой слот, один раз на героя — тратить последним, обычно на слот 3;
 *  · «проверка одним кубиком»: один базовый кубик в слот 1 для сомнительного героя.
 *
 * ASSUMPTION: A39 — какие тиры навыков выпадают каким кубиком, в данных нет (в ST-Central про тиры
 * ничего нет): считаем, что кубик k может выдать навык до тира CUBE_MAX_TIER[k], Роланд — любой.
 */
import type { GameData, HeroInstance, Skill } from '../data/types.ts'
import type { QuestWeight } from './optimizer.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam } from './combat.ts'
import {
  CUBE_BASIC_COST,
  CUBE_MAX_TIER,
  CUBE_SLOTS,
  OPTIMIZER_CRN_SEED,
  OPTIMIZER_SIM_RUNS,
  ROLAND_PREFERRED_SLOT,
  SKILL_REROLL_EPS,
} from './constants.ts'

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
  /** План по каждому герою: «проверка одним кубиком» и совет по Роланду. */
  plans: HeroSkillPlan[]
}

/** Сводный план по герою (не по навыку). */
export interface HeroSkillPlan {
  heroIndex: number
  /**
   * «Проверка одним кубиком»: у героя нет ни одного навыка с полезным вкладом — стоит один раз
   * бросить базовый кубик в слот 1; если и он пустой, вкладываться в героя не стоит.
   */
  oneDiceCheck: boolean
  /** Роланд: любой навык в любой слот, один раз на героя — тратить последним, обычно на слот 3. */
  roland: { slot: number; reason: string } | null
  reasons: string[]
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

/** Минимальный кубик, способный выдать навык тира выше текущего (A39 — тиры в данных не подтверждены). */
export function cubeForTier(tier: number | null): Cube {
  const t = tier ?? 0
  for (const c of [1, 2, 3, 4] as const) if (CUBE_MAX_TIER[c] > t) return c
  return 'roland'
}

/**
 * Минимальный кубик, роллящий слот `slot` (1-based). Подтверждено ST-Central: базовый — слот 1,
 * супер — 1–2, мега — 1–3, идеальный — 1–4. Кубик перекидывает все младшие слоты тоже.
 */
export function cubeForSlot(slot: number): Cube {
  for (const c of [1, 2, 3, 4] as const) if (CUBE_SLOTS[c].includes(slot)) return c
  return 'roland'
}

/** Человекочитаемое описание: какие слоты роллит кубик и сколько базовых кубиков стоит. */
export function cubeDetails(cube: Cube): string {
  if (cube === 'roland') return 'Роланд (любой навык в любой слот, один раз на героя)'
  const slots = CUBE_SLOTS[cube]
  const cost = CUBE_BASIC_COST[cube]
  return `${CUBE_LABELS[cube]}: слоты ${slots.join('–')}, стоимость ${cost} базов.`
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
    // Вклад ≈ 0 → перекидываем. Кубик — минимальный, роллящий этот слот (подтверждено ST-Central).
    const cube = cubeForSlot(c.skillIndex + 1)
    const byTier = cubeForTier(c.tier)
    const sameLine = hero.skills.filter((id, j) => j !== c.skillIndex && data.skills.find((s) => s.id === id)?.line === c.line)
    if (sameLine.length > 0) reasons.push('на герое уже есть навык с такой иконкой — они взаимоисключающи, новый будет с другой иконкой')
    const epics = hero.skills.filter((id, j) => j !== c.skillIndex && data.skills.find((s) => s.id === id)?.rarity === 'Epic').length
    if (c.rarity === 'Epic' && epics > 0) reasons.push('эпический слот оружия уже занят — на оружие не больше одного эпического навыка')
    if (c.rarity !== 'Epic' && epics > 0 && hero.skills.length - epics <= 1) reasons.push('общий слот оружия этот — новый навык тоже будет общим')
    if (cube !== 'roland' && CUBE_SLOTS[cube].length > 1) {
      reasons.push(`кубик роллит и младшие слоты (${CUBE_SLOTS[cube].join(', ')}) — следи, чтобы там не было нужных навыков`)
    }
    if (byTier !== 'roland' && cube !== 'roland' && CUBE_MAX_TIER[byTier] > 0 && CUBE_MAX_TIER[byTier] > CUBE_MAX_TIER[cube]) {
      reasons.push(`навык T${c.tier ?? '?'}: чтобы выкинуть выше текущего тира, по допущению A39 нужен ${CUBE_LABELS[byTier]}`)
    }
    advice.push({
      heroIndex: c.heroIndex,
      skillIndex: c.skillIndex,
      skillName: c.skillName,
      contribution: c.contribution,
      action: 'reroll',
      cube,
      reasons: [
        `вклад ${(c.contribution * 100).toFixed(1)} п.п. — перекинуть: ${cubeDetails(cube)}`,
        ...reasons,
      ],
    })
  }
  return { contributions, advice, plans: heroPlans(heroes, advice) }
}

/** Планы по героям: «проверка одним кубиком» и «приберечь Роланда». */
function heroPlans(heroes: HeroInstance[], advice: SkillAdvice[]): HeroSkillPlan[] {
  return heroes.map((hero, heroIndex) => {
    const mine = advice.filter((a) => a.heroIndex === heroIndex)
    const rerolls = mine.filter((a) => a.action === 'reroll')
    const keeps = mine.filter((a) => a.action === 'keep')
    const reasons: string[] = []
    // ODC (ST-Central): один базовый кубик в слот 1 для героя, у которого нет ни одного полезного навыка.
    const oneDiceCheck = rerolls.length > 0 && keeps.length === 0 && hero.skills.length > 0
    if (oneDiceCheck) {
      reasons.push(
        'проверка одним кубиком: ни один навык не даёт вклада — бросаем один базовый кубик в слот 1; если и он пустой, вкладываться в героя не стоит',
      )
    }
    const slot = Math.min(ROLAND_PREFERRED_SLOT, hero.skills.length)
    const roland =
      rerolls.length > 0 && slot >= 1
        ? {
            slot,
            reason:
              `Роланд: любой навык в любой слот, но только один раз на героя — тратить последним, ` +
              `когда остальные слоты уже перекинуты (обычно слот ${ROLAND_PREFERRED_SLOT} — его труднее всего выкинуть кубиком)`,
          }
        : null
    return { heroIndex, oneDiceCheck, roland, reasons }
  })
}
