import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import type { HeroInstance, Quest, Skill } from '../data/types.ts'
import { CUBE_BASIC_COST, CUBE_SLOTS, ROLAND_PREFERRED_SLOT } from './constants.ts'
import {
  cubeForSlot,
  cubeForTier,
  rerollAdvice,
  rollableSkills,
  rollPlan,
  skillContributions,
  strongerInLine,
  type SkillAdvice,
} from './skills.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const quest: Quest = {
  id: 't|normal|Hard',
  area: 'T',
  variant: 'boss',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 80000,
  monsterDmg: 900,
  monsterAoe: 400,
  barrier: null,
  defCaps: { p50: 1500, p70: 3000, p75: 9000 },
  miniBosses: [],
}
const quests = [{ quest, weight: 1 }]
const opts = { runs: 150, seed: 7 }

describe('рекомендации по навыкам', () => {
  it('кубик подбирается по тиру текущего навыка, Роланд — только для сверхвысоких', () => {
    expect(cubeForTier(5)).toBe(1)
    expect(cubeForTier(10)).toBe(2)
    expect(cubeForTier(12)).toBe(2)
    expect(cubeForTier(18)).toBe(3)
    expect(cubeForTier(22)).toBe(4)
    expect(cubeForTier(26)).toBe('roland')
    expect(cubeForTier(null)).toBe(1)
  })

  it('вклад посчитан для каждого навыка из hero.skills и детерминирован', () => {
    const team = heroes.slice(0, 2)
    const c1 = skillContributions(data, team, null, quests, opts)
    const c2 = skillContributions(data, team, null, quests, opts)
    expect(c1.length).toBe(team.reduce((a, h) => a + h.skills.length, 0))
    expect(c1.length).toBeGreaterThan(0)
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2))
    for (const c of c1) {
      expect(Number.isFinite(c.contribution)).toBe(true)
      expect(c.skillName.length).toBeGreaterThan(0)
    }
  })

  it('навык с реальным вкладом не помечен на перекидку, слабый — помечен с кубиком', () => {
    const team = heroes.slice(0, 2)
    const { advice } = rerollAdvice(data, team, null, quests, opts)
    expect(advice.length).toBe(c_len(team))
    for (const a of advice) {
      if (a.action === 'reroll') expect(a.cube).toBeDefined()
      expect(a.reasons.length).toBeGreaterThan(0)
    }
    const strong = advice.filter((a) => a.action === 'keep')
    const weak = advice.filter((a) => a.action === 'reroll')
    for (const s of strong) expect(s.contribution).toBeGreaterThan(0)
    for (const w of weak) expect(w.contribution).toBeLessThanOrEqual(0.005)
  })

  it('блокировка: вторая такая же иконка помечена как взаимоисключающая', () => {
    const h = heroes.find((x) => x.skills.length > 0)!
    const line = data.skills.find((s) => s.id === h.skills[0])!.line
    const sameLine = data.skills.find((s) => s.line === line && s.id !== h.skills[0])!
    const dup = { ...h, skills: [h.skills[0], sameLine.id] }
    const { advice } = rerollAdvice(data, [dup], null, quests, opts)
    const second = advice.find((a) => a.skillIndex === 1)
    expect(second).toBeDefined()
    if (second!.action === 'reroll') {
      expect(second!.reasons.join(' ')).toMatch(/иконк/i)
    }
  })
})

function c_len(team: { skills: string[] }[]): number {
  return team.reduce((a, h) => a + h.skills.length, 0)
}

// ───────────────────────── план ролла (A60) ─────────────────────────

/** Навык без более высокой ступени в своей линейке — «сильная» версия (для слотов, которые не блокируют). */
function topOfLine(s: Skill): boolean {
  return !data.skills.some((x) => x.line === s.line && (x.tier ?? 0) > (s.tier ?? 0))
}

const baseHero = heroes[0]
/** Навыки того же типа, что падают в слоты (для слотов, которые не должны блокировать друг друга). */
const rollable = data.skills.filter((s) => s.type === 'Hero' && s.rarity !== null && s.tier !== null)
/** Слабая версия: T1/T2 линейки, у которой есть ступень выше (та же иконка → блокируют друг друга). */
const weakSkill = rollable.find((s) => (s.tier ?? 0) <= 2 && s.classes.includes(baseHero.className) && strongerInLine(data, s) !== null)!
const strongSkill = strongerInLine(data, weakSkill)!
/** «Сильные» версии чужих линеек — для слотов, которые ничего не блокируют. */
const tops = rollable.filter((s) => topOfLine(s) && s.line !== weakSkill.line)
const top1 = tops[0]
const top2 = tops.find((s) => s.line !== top1.line)!
/** Класс, которому доступны и слабая, и сильная версии линейки (у сильной — тот же промоушен). */
const pairClass = strongSkill.classes.find((c) => weakSkill.classes.includes(c))!
/** Герой промоушена: сильная версия линейки попадает в его пул после снятия блокировки (A60). */
const pairOverrides = { className: pairClass, level: 40, titanSoul: true } satisfies Partial<HeroInstance>

/** Герой фикстуры с заданными слотами навыков (и, при необходимости, уровнем/Душой). */
function heroWith(skills: string[], over: Partial<HeroInstance> = {}): HeroInstance {
  return { ...baseHero, id: 'test', name: 'Тест', skills, ...over }
}

/** Совет по слотам героя, собранный вручную: слоты из keepSlots — «нужные», остальные — на перекидку.
 *  `strongGain` — насколько вклад сильной версии линейки больше вклада слабой (0,01 по умолчанию);
 *  `null` — сильной версии в совете нет (как у навыка без ступени выше). */
function adviceOf(heroIndex: number, hero: HeroInstance, keepSlots: number[], strongGain: number | null = 0.01): SkillAdvice[] {
  return hero.skills.map((id, i) => {
    const s = data.skills.find((x) => x.id === id)!
    const keep = keepSlots.includes(i + 1)
    const contribution = keep ? 0.02 : 0
    const strong = keep ? strongerInLine(data, s) : null
    return {
      heroIndex,
      skillIndex: i,
      skillName: s.name,
      contribution,
      action: keep ? ('keep' as const) : ('reroll' as const),
      ...(keep ? {} : { cube: cubeForSlot(i + 1) }),
      ...(strong && strongGain !== null
        ? { stronger: { skillId: strong.id, skillName: strong.name, contribution: contribution + strongGain } }
        : {}),
      reasons: [],
    }
  })
}

describe('семантика кубиков (A39)', () => {
  it('перечень слотов у кубика — к каким он применим; идеальный не перекидывает младшие', () => {
    expect(cubeForSlot(1)).toBe(1)
    expect(cubeForSlot(2)).toBe(2)
    expect(cubeForSlot(3)).toBe(3)
    expect(cubeForSlot(4)).toBe(4)
    // «Perfect — skill slot 1, 2, 3 & 4» — любой из слотов, а не «все сразу» (в гайде им роллят только 4-й).
    expect(CUBE_SLOTS[4]).toEqual([1, 2, 3, 4])
    expect(CUBE_BASIC_COST[4]).toBe(8)
  })

  it('в советах нет предупреждения «кубик роллит и младшие слоты»', () => {
    const hero = heroWith([top1.id, top2.id, weakSkill.id], { level: 40, titanSoul: true })
    const { advice } = rerollAdvice(data, [hero], null, quests, opts)
    expect(advice.map((a) => a.reasons.join(' ')).join(' ')).not.toMatch(/младш/i)
  })

  it('идеальный кубик в 4-м слоте не трогает 2-й слот', () => {
    const hero = heroWith([top1.id, top2.id, weakSkill.id], { level: 40, titanSoul: true })
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [2])) // 2-й слот — нужный навык
    const slot4 = plan.steps.find((s) => s.kind === 'reroll' && s.slot === 4)
    expect(slot4?.cube).toBe(4)
    // 2-й слот в плане не упоминается вовсе: ни кубика, ни найма.
    expect(plan.steps.filter((s) => s.slot === 2)).toEqual([])
  })

  it('нужное во 2-м слоте: план не тратит на него кубик и не советует пере-найм', () => {
    const hero = heroWith([top1.id, top2.id, weakSkill.id], { level: 40, titanSoul: true })
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [2]))
    expect(plan.steps.some((s) => s.slot === 2 && (s.kind === 'hire' || s.cube !== undefined))).toBe(false)
    expect(plan.reasons.join(' ')).toMatch(/2-м слоте уже нужный навык/)
    // Цена = идеальный кубик в слот 4 + базовый в слот 1.
    expect(plan.basicCubes).toBe(CUBE_BASIC_COST[4] + CUBE_BASIC_COST[1])
  })

  it('шаг unblock показывается, когда сильная версия линейки — цель 4-го слота', () => {
    const hero = heroWith([weakSkill.id, top1.id, top2.id], pairOverrides)
    // Условие A60: сильная версия доступна герою и попадает в пул после снятия блокировки.
    expect(rollableSkills(data, hero, { ignoreSlots: [1] }).some((s) => s.id === strongSkill.id)).toBe(true)
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [1, 2, 3])) // все навыки нужные, 4-й слот пуст
    const unblock = plan.steps.findIndex((s) => s.kind === 'unblock' && s.slot === 1)
    const slot4 = plan.steps.findIndex((s) => s.kind === 'reroll' && s.slot === 4)
    expect(unblock).toBeGreaterThanOrEqual(0)
    expect(slot4).toBeGreaterThan(unblock)
    // В шаге видны оба вклада: слабой версии и более выгодной сильной.
    expect(plan.steps[unblock].detail).toMatch(new RegExp(strongSkill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    expect(plan.steps[unblock].detail).toMatch(/вклад .* п\.п\..*больше/)
    // Сильная версия линейки — цель 4-го слота: вероятность выводима из данных (1 / размер пула).
    expect(plan.steps[slot4].poolSize).toBeGreaterThan(0)
    expect(plan.steps[slot4].expectedRolls).toBe(plan.steps[slot4].poolSize)
    // Слот 1 уже перекинут шагом-разблокировкой — второй раз кубик на него не тратим.
    expect(plan.steps.filter((s) => s.kind === 'reroll' && s.slot === 1)).toEqual([])
    // «Оставить» и «сроллить» для одного слота не выводятся вместе: слот 1 — перекидка, не keep.
    expect(plan.slotActions).toContainEqual({ slot: 1, action: 'reroll', step: 'unblock' })
  })

  it('шага unblock нет, когда вклад сильной версии не больше вклада слабой', () => {
    const hero = heroWith([weakSkill.id, top1.id, top2.id], pairOverrides)
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [1, 2, 3], -0.01)) // сильная версия слабее текущей
    expect(plan.steps.some((s) => s.kind === 'unblock')).toBe(false)
    // Слабую версию не трогаем: ни шага-разблокировки, ни базового кубика в 1-й слот.
    expect(plan.steps.filter((s) => s.slot === 1)).toEqual([])
    expect(plan.slotActions).toContainEqual({ slot: 1, action: 'keep' })
    // Оговорки «можно пропустить» нет: шага просто нет.
    expect(plan.steps.map((s) => s.detail).join(' ')).not.toMatch(/можно пропустить/)
  })

  it('шага unblock нет, когда сильной версии нет в пуле после снятия блокировки', () => {
    // Базовый класс без Души Титана: сильная версия линейки требует промоушена и в пул не попадает.
    const hero = heroWith([weakSkill.id, top1.id, top2.id], { level: 40 })
    expect(rollableSkills(data, hero, { ignoreSlots: [1] }).some((s) => s.id === strongSkill.id)).toBe(false)
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [1, 2, 3])) // вклад сильной версии больше
    expect(plan.steps.some((s) => s.kind === 'unblock')).toBe(false)
    expect(plan.steps.filter((s) => s.slot === 1)).toEqual([])
    expect(plan.slotActions).toContainEqual({ slot: 1, action: 'keep' })
    expect(plan.steps.map((s) => s.detail).join(' ')).not.toMatch(/можно пропустить/)
  })

  it('вклад сильной версии измеряется так же, как вклад навыка в тот же слот', () => {
    const weakHero = heroWith([weakSkill.id, top1.id, top2.id], pairOverrides)
    const strongHero = { ...weakHero, skills: [strongSkill.id, top1.id, top2.id] }
    const weak = skillContributions(data, [weakHero], null, quests, { ...opts, eps: -1 }).find((c) => c.skillIndex === 0)!
    const strong = skillContributions(data, [strongHero], null, quests, opts).find((c) => c.skillIndex === 0)!
    expect(weak.stronger?.skillName).toBe(strongSkill.name)
    expect(weak.stronger?.contribution).toBeCloseTo(strong.contribution, 10)
    // Сильная версия считается только для навыков, которые оставляем (вклад выше eps): при eps = 1 не считается.
    expect(skillContributions(data, [weakHero], null, quests, { ...opts, eps: 1 })[0].stronger).toBeUndefined()
    // Навык без ступени выше — сильной версии нет.
    expect(skillContributions(data, [{ ...weakHero, skills: [top1.id] }], null, quests, { ...opts, eps: -1 })[0].stronger).toBeUndefined()
  })

  it('две слабые версии: цель 4-го слота — обе сильные, бросков вдвое меньше', () => {
    // Вторая линейка, чья сильная версия доступна тому же промоушену.
    const weak2 = rollable.find((s) => {
      if (s.line === weakSkill.line || (s.tier ?? 0) > 2 || !s.classes.includes(pairClass)) return false
      const st = strongerInLine(data, s)
      if (!st || s.line === top1.line) return false
      const hero = heroWith([weakSkill.id, top1.id, s.id], pairOverrides)
      return rollableSkills(data, hero, { ignoreSlots: [3] }).some((x) => x.id === st.id)
    })
    expect(weak2).toBeDefined()
    const hero = heroWith([weakSkill.id, top1.id, weak2!.id], pairOverrides)
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [1, 2, 3]))
    expect(plan.steps.filter((s) => s.kind === 'unblock').map((s) => s.slot)).toEqual([1, 3])
    const slot4 = plan.steps.find((s) => s.kind === 'reroll' && s.slot === 4)!
    expect(slot4.detail).toMatch(/Цель — .+ или .+/)
    expect(slot4.expectedRolls).toBe(Math.round(slot4.poolSize! / 2))
  })

  it('на один слот в плане ровно одно действие: «оставить» и «сроллить» вместе не выводятся', () => {
    const teams: HeroInstance[][] = [
      heroes.slice(0, 4),
      [heroWith([weakSkill.id, top1.id, top2.id], pairOverrides)],
      [heroWith([weakSkill.id, top2.id, top1.id], { level: 9 })],
      [heroWith([top1.id, top2.id], { level: 40 })],
    ]
    const plans = teams.flatMap((team) => rerollAdvice(data, team, null, quests, { runs: 40, seed: 7 }).plans)
    expect(plans.length).toBe(teams.reduce((a, t) => a + t.length, 0))
    for (const plan of plans) {
      const slots = plan.slotActions.map((x) => x.slot)
      expect(new Set(slots).size).toBe(slots.length) // по одной записи на слот
      for (const act of plan.slotActions) {
        const kinds = plan.steps.filter((s) => s.slot === act.slot).map((s) => s.kind)
        if (act.action === 'keep') expect(kinds.filter((k) => k === 'hire' || k === 'unblock' || k === 'reroll' || k === 'roland')).toEqual([])
        else expect(kinds).not.toContain('keep')
      }
    }
  })

  it('Роланд использован: шага Роланда в плане нет, остаток закрывается кубиками', () => {
    const hero = heroWith([top1.id, top2.id, weakSkill.id], { level: 40, titanSoul: true })
    const advice = adviceOf(0, hero, [1, 2]) // 3-й слот — слабая версия без вклада
    const free = rollPlan(data, hero, 0, advice)
    expect(free.roland?.slot).toBe(ROLAND_PREFERRED_SLOT)
    expect(free.steps.some((s) => s.kind === 'roland' && s.slot === ROLAND_PREFERRED_SLOT)).toBe(true)
    const used = rollPlan(data, hero, 0, advice, { rolandUsed: [0] })
    expect(used.roland).toBeNull()
    expect(used.rolandAvailable).toBe(false)
    expect(used.steps.some((s) => s.kind === 'roland')).toBe(false)
    expect(used.reasons.join(' ')).toMatch(/Роланд/)
    // Роланд бесплатен — цена плана в базовых кубиках не меняется.
    expect(used.basicCubes).toBe(free.basicCubes)
  })

  it('слот 2 пуст и герой не прокачан: план предлагает найм, а не кубик', () => {
    const hero = heroWith([top1.id, top2.id], { level: 9, titanSoul: false })
    const plan = rollPlan(data, hero, 0, adviceOf(0, hero, [1]))
    const hire = plan.steps.find((s) => s.kind === 'hire' && s.slot === 2)
    expect(hire).toBeDefined()
    expect(hire?.basicCubes).toBe(0)
    // Прокачка до 35 и Душа Титана — отдельными шагами плана.
    expect(plan.steps.filter((s) => s.kind === 'level').length).toBeGreaterThan(0)
  })

  it('пул перекидки не содержит линейки, уже стоящие на герое', () => {
    const hero = heroWith([top1.id, top2.id, weakSkill.id], { level: 40, titanSoul: true })
    const pool = rollableSkills(data, hero)
    const lines = new Set([top1.line, top2.line, weakSkill.line])
    expect(pool.every((s) => !lines.has(s.line))).toBe(true)
    // Пустой герой: пул больше — те же линейки становятся доступны.
    expect(rollableSkills(data, heroWith([], { level: 40, titanSoul: true })).length).toBeGreaterThan(pool.length)
  })
})
