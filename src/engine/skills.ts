/**
 * Рекомендации по навыкам героя: вклад каждого навыка в win rate, совет, какой слот перекидывать каким
 * кубиком, и пошаговый план ролла героя по гайду Develion («Как “роллить” героев», см. A60).
 *
 * Вклад навыка = win rate отряда с навыком − win rate того же отряда без него (замена на пустой),
 * средзвешенный по целевым локациям. Навыки, встроенные в класс/духа/артефакт, не перекидываются —
 * рассматриваются только навыки из hero.skills (выданные предметами).
 *
 * Кубики — подтверждено ST-Central, «Skill Rerolls: A Basic Breakdown»
 * (https://st-central.net/skill-rerolls-roland/, изменено 22.11.2025):
 *  · базовый — слот 1, супер — слоты 1–2, мега — 1–3, идеальный — 1–4: это слоты, к **любому из которых**
 *    кубик можно применить (роллится один выбранный слот, младшие не трогаются — так в гайде Develion
 *    роллят 4-й слот, не сбивая только что найденный 2-й; разбор противоречия — A39);
 *  · стоимость: супер = 2 базовых, мега = 4, идеальный = 8 (в статье: «T2 costs double that of a T1,
 *    T3 is 4x a T1, and T4s are 8x»);
 *  · для слота N берём минимальный кубик, которым этот слот можно перекинуть (`cubeForSlot`);
 *  · блокировки: навыки с одинаковой иконкой (одна линейка) блокируют друг друга; на оружие нельзя второй
 *    обычный и нельзя второй эпический («золотой») навык (обычный + эпический вместе — можно);
 *  · Роланд: любой навык в любой слот, один раз на героя — тратить последним, обычно на слот 3;
 *  · «проверка одним кубиком»: один базовый кубик в слот 1 для сомнительного героя.
 *
 * ASSUMPTION: A39 — какие тиры навыков выпадают каким кубиком, в данных нет (в ST-Central про тиры
 * ничего нет): считаем, что кубик k может выдать навык до тира CUBE_MAX_TIER[k], Роланд — любой.
 * ASSUMPTION: A60 — шаги плана и пул навыков для оценки вероятности; слот-специфичных пулов в данных нет.
 * Шага «сначала сроллить слабую версию нужного навыка» в плане нет (A63): пары «слабая ↔ сильная версия»
 * в данных не связаны — ни по линейке (ступень выбирает стихия), ни по иконке (у пар разные файлы fankit,
 * `s_hp` / `s_megahp`). Правило гайда остаётся текстом в памятке «Как роллить».
 * На каждый слот в плане ровно одно действие: «оставить» и «сроллить» одновременно не выводятся
 * (`HeroSkillPlan.slotActions`).
 */
import type { GameData, HeroInstance, Skill } from '../data/types.ts'
import type { QuestWeight } from './optimizer.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam } from './combat.ts'
import {
  ARGONS_FINEST_TALENT_POINTS,
  CUBE_BASIC_COST,
  CUBE_MAX_TIER,
  CUBE_SLOTS,
  OPTIMIZER_CRN_SEED,
  OPTIMIZER_SIM_RUNS,
  ROLAND_PREFERRED_SLOT,
  SKILL_REROLL_EPS,
  SKILL_ROLL_FULL_LEVEL,
  SKILL_ROLL_HIRE_LEVEL,
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
  /** Индексы героев, на которых Роланд уже использован (флажок на героя) — план не предлагает его снова. */
  rolandUsed?: readonly number[]
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

/** Шаг плана ролла героя: что делать по порядку (гайд Develion, раздел «Как “роллить” героев», A60). */
export type RollStepKind =
  /** Найм/пере-найм героя (бесплатно): навык во 2-м слоте выбирается повторяемым наймом. */
  | 'hire'
  /** Прокачка уровня (и, если нужно, Душа Титана) — открывает слоты 3 и 4. */
  | 'level'
  /** Перекидка слота кубиком. */
  | 'reroll'
  /** Слот уже хорош — не трогаем. */
  | 'keep'
  /** Остаток закрываем бесплатно Роландом (один раз на героя). */
  | 'roland'

export interface RollStep {
  kind: RollStepKind
  /** Слот навыка (1-based) или null у шагов, не привязанных к слоту. */
  slot: number | null
  title: string
  detail: string
  /** Кубик шага (у найма, прокачки, «оставить» и Роланда — нет). */
  cube?: Cube
  /** Цена шага в базовых кубиках: базовый 1, супер 2, мега 4, идеальный 8; найм, прокачка и Роланд — 0. */
  basicCubes: number
  /** Сколько навыков в пуле перекидки этого слота (после блокировок) — знаменатель вероятности. */
  poolSize?: number
  /** Почему ожидаемое число бросков не показано (нужный навык в данных не задан). */
  rollsNote?: string
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
  /** Пошаговый план в порядке гайда: слот 2 → прокачка → слот 4 → слот 1 → Роланд. */
  steps: RollStep[]
  /** Одно действие на слот: шаг плана («сроллить») важнее вердикта совета («оставить», A60). */
  slotActions: SlotPlanAction[]
  /** Цена всего плана в базовых кубиках (идеальный = 8; найм и Роланд бесплатны). */
  basicCubes: number
  /** False — Роланд на этом герое уже использован (флажок «Роланд использован»). */
  rolandAvailable: boolean
}

/** Итог плана по одному слоту: «оставить» и «сроллить» для одного слота одновременно не бывает. */
export interface SlotPlanAction {
  /** Слот навыка (1-based). */
  slot: number
  /** `keep` — слот не трогаем, `reroll` — слот перекидывается шагом плана. */
  action: 'keep' | 'reroll'
  /** Шаг, который перекидывает слот (при action='reroll'): найм, кубик или Роланд. */
  step?: RollStepKind
}

/** Шаги, которыми слот перекидывается (заменяется другим навыком): «оставить» к ним не добавляется. */
const REROLL_STEP_KINDS: readonly RollStepKind[] = ['hire', 'reroll', 'roland']

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
      const wrWithout = weightedWinRate(without, data, champion, quests, seed, runs)
      out.push({
        heroIndex,
        skillIndex,
        skillId,
        skillName: skill.name,
        line: skill.line,
        rarity: skill.rarity,
        tier: skill.tier,
        contribution: base - wrWithout,
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
 * Минимальный кубик, которым можно перекинуть слот `slot` (1-based). Подтверждено ST-Central:
 * базовый — слот 1, супер — 1–2, мега — 1–3, идеальный — 1–4. Перечень означает, к каким слотам кубик
 * применим: роллится выбранный слот, младшие не трогаются (A39).
 */
export function cubeForSlot(slot: number): Cube {
  for (const c of [1, 2, 3, 4] as const) if (CUBE_SLOTS[c].includes(slot)) return c
  return 'roland'
}

/** Человекочитаемое описание: к каким слотам применим кубик и сколько базовых кубиков стоит. */export function cubeDetails(cube: Cube): string {
  if (cube === 'roland') return 'Роланд (любой навык в любой слот, один раз на героя)'
  const slots = CUBE_SLOTS[cube]
  const cost = CUBE_BASIC_COST[cube]
  return `${CUBE_LABELS[cube]}: можно применить к слоту ${slots.join(' или ')}, стоимость ${cost} базов.`
}

// ───────────────────────── пул навыков и «парные» блокировки ─────────────────────────

/** Типы предметов, которые классы ставят в 1-й слот экипировки, — оружие (для правил блокировки A40). */
function weaponTypes(data: GameData): Set<string> {
  const out = new Set<string>()
  for (const c of data.heroClasses) for (const t of c.slots[0] ?? []) out.add(t)
  return out
}

/** Навык на оружие («X Master», Warlord, Marksman…): его условие — тип предмета из оружейных. */
export function isWeaponSkill(s: Skill, weapons: Set<string>): boolean {
  return s.effects.some((e) => e.condition?.kind === 'itemType' && e.condition.types.some((t) => weapons.has(t)))
}

/** Имена классов героя, по которым ищем доступные навыки: свой класс и (при Душе Титана) промоушен. */
export function heroClassNames(data: GameData, hero: HeroInstance): string[] {
  const cls = data.heroClasses.find((c) => c.name === hero.className)
  const names = [hero.className]
  if (hero.titanSoul && cls?.promotion) names.push(cls.promotion)
  return names
}

/** Герой промоушен или с Душой Титана — только им доступны навыки «Requires Class Promotion». */
export function isPromoted(data: GameData, hero: HeroInstance): boolean {
  const cls = data.heroClasses.find((c) => c.name === hero.className)
  return hero.titanSoul || cls?.baseClass != null
}

/**
 * Все навыки, которые игра может выдать этому герою как обычный навык (Type `Hero`):
 * доступные его классу (при Душе Титана — ещё и промоушену) и разрешённые без промоушена.
 * Блокировки «одна линейка» и «второй навык на оружие» (A40) проверяются отдельно —
 * они зависят от того, какие слоты уже заняты (`rollableSkills`).
 * Используется редактором героя («доступные классу навыки», требование владельца).
 */
export function skillChoices(data: GameData, hero: HeroInstance): Skill[] {
  const classNames = heroClassNames(data, hero)
  const promoted = isPromoted(data, hero)
  return data.skills.filter(
    (s) => s.type === 'Hero' && s.rarity !== null && s.tier !== null && (!s.requiresPromotion || promoted) && s.classes.some((c) => classNames.includes(c)),
  )
}

/** Почему навык нельзя поставить в этот слот (блокировки A40). `null` — можно. */
export function skillBlockReason(data: GameData, hero: HeroInstance, skill: Skill, slot: number, choices = skillChoices(data, hero)): string | null {
  const available = new Set(choices.map((s) => s.id))
  if (!available.has(skill.id)) return `навык недоступен классу ${hero.className}${skill.requiresPromotion ? ' без промоушена' : ''}`
  const others = hero.skills
    .map((id, i) => ({ skill: data.skills.find((s) => s.id === id), slot: i + 1 }))
    .filter((x): x is { skill: Skill; slot: number } => x.skill !== undefined && x.slot !== slot)
    .map((x) => x.skill)
  if (others.some((s) => s.line === skill.line)) return `на герое уже есть навык линейки «${skill.line}» — они взаимоисключающие`
  const weapons = weaponTypes(data)
  if (isWeaponSkill(skill, weapons) && others.some((s) => isWeaponSkill(s, weapons) && s.rarity === skill.rarity)) {
    return `на оружие не больше одного ${skill.rarity === 'Epic' ? 'эпического' : 'обычного'} навыка (A40)`
  }
  return null
}

/**
 * Пул перекидки: какие навыки игра может выдать герою в слот навыка. Учитывает тип (в слоты падают
 * только `Hero`-навыки), доступность классу, промоушен и блокировки A40 (одна линейка; второй обычный
 * и второй эпический навык на оружие). Слот-специфичных пулов в данных нет — пул один на все слоты.
 *
 * ASSUMPTION: A60 — источник вероятности в плане ролла; в игре видны проценты по каждому навыку
 * (Reroll Odds), в таблице их нет. `ignoreSlots` — слоты, которые в этот момент пусты/перекидываются
 * (их навыки блокировать уже не могут).
 */
export function rollableSkills(data: GameData, hero: HeroInstance, options: { ignoreSlots?: readonly number[] } = {}): Skill[] {
  const ignore = new Set(options.ignoreSlots ?? [])
  const present = hero.skills
    .map((id, i) => ({ skill: data.skills.find((s) => s.id === id), slot: i + 1 }))
    .filter((x): x is { skill: Skill; slot: number } => x.skill !== undefined && !ignore.has(x.slot))
    .map((x) => x.skill)
  const blockedLines = new Set(present.map((s) => s.line))
  const weapons = weaponTypes(data)
  const blockedWeaponRarities = new Set(present.filter((s) => isWeaponSkill(s, weapons)).map((s) => s.rarity))
  const classNames = heroClassNames(data, hero)
  const promoted = isPromoted(data, hero)
  return data.skills.filter((s) => {
    if (s.type !== 'Hero' || s.rarity === null || s.tier === null) return false
    if (s.requiresPromotion && !promoted) return false
    if (!s.classes.some((c) => classNames.includes(c))) return false
    if (blockedLines.has(s.line)) return false
    if (isWeaponSkill(s, weapons) && blockedWeaponRarities.has(s.rarity)) return false
    return true
  })
}

/** Стоимость кубика в базовых: 'roland' бесплатен. */
const cubeCost = (cube: Cube): number => (cube === 'roland' ? 0 : CUBE_BASIC_COST[cube])

// ───────────────────────── план ролла героя ─────────────────────────

/**
 * План ролла героя по шагам гайда (A60):
 *  1) слот 2 — найм (пока навык не тот и герой не прокачан) либо кубик;
 *  2) прокачка до 35 ур. / Душа Титана (если слоты 3–4 ещё закрыты);
 *  3) слот 4 — идеальный кубик;
 *  4) слот 1 — базовый кубик;
 *  5) остаток — Роланд (если на этом герое он ещё не использован).
 * Цена — в базовых кубиках (идеальный = 8). Нужный навык в данных не задан, поэтому вместо ожидаемого
 * числа бросков показываем вероятность конкретного навыка ≈ 1 / размер пула.
 */
export function rollPlan(
  data: GameData,
  hero: HeroInstance,
  heroIndex: number,
  advice: SkillAdvice[],
  options: SkillAdviceOptions = {},
): HeroSkillPlan {
  const mine = advice.filter((a) => a.heroIndex === heroIndex)
  const stateOf = (slot: number): 'keep' | 'junk' | 'empty' => {
    const a = mine.find((x) => x.skillIndex === slot - 1)
    if (!a) return 'empty'
    return a.action === 'keep' ? 'keep' : 'junk'
  }
  const steps: RollStep[] = []
  const reasons: string[] = []
  const rolandAvailable = !(options.rolandUsed ?? []).includes(heroIndex)

  // 1. Слот 2: по гайду его «выбирают» наймом, а не кубиком, — но только пока герой не прокачан.
  const slot2 = stateOf(2)
  if (slot2 === 'keep') {
    reasons.push('во 2-м слоте уже нужный навык — кубик на него не тратим (ради этого героя и нанимали)')
  } else {
    const poolSize = rollableSkills(data, hero, { ignoreSlots: [1, 2, 3, 4] }).length
    if (slot2 === 'empty' || hero.level <= SKILL_ROLL_HIRE_LEVEL) {
      steps.push({
        kind: 'hire',
        slot: 2,
        title: 'Слот 2 — нанять героя заново',
        detail:
          `Навык во 2-м слоте выбирается наймом: нанимаем и увольняем, пока не выпадет нужный (талант «Лучшие товарищи Аргона» ` +
          `${ARGONS_FINEST_TALENT_POINTS} очков → герои сразу ${SKILL_ROLL_HIRE_LEVEL} ур., открыт 2-й слот). Это бесплатно: ` +
          'кубики на 2-й слот не тратим.',
        basicCubes: 0,
        poolSize,
        rollsNote: `нужный навык в данных не задан — сколько наймов понадобится, не считаем; вероятность конкретного навыка ≈ 1/${poolSize}`,
      })
    } else {
      const cube = cubeForSlot(2)
      steps.push({
        kind: 'reroll',
        slot: 2,
        cube,
        title: 'Слот 2 — перекинуть кубиком',
        detail: `Герой уже прокачан (${hero.level} ур.), пере-найм сбросил бы уровень — перекидываем 2-й слот: ${cubeDetails(cube)}.`,
        basicCubes: cubeCost(cube),
        poolSize,
        rollsNote: `нужный навык в данных не задан; вероятность конкретного навыка ≈ 1/${poolSize}`,
      })
    }
  }

  // 2. Уровень: слоты 3 и 4 открываются прокачкой (гайд: 35 ур.), иначе — Душой Титана.
  const cls = data.heroClasses.find((c) => c.name === hero.className)
  const unlockLevels = cls?.skillSlotLevels ?? []
  const unlocksFour = unlockLevels.length >= 4
  const neededLevel = unlockLevels.length > 0 ? Math.max(...unlockLevels) : SKILL_ROLL_FULL_LEVEL
  if (hero.level < neededLevel) {
    steps.push({
      kind: 'level',
      slot: null,
      title: `Прокачать до ${neededLevel} ур.`,
      detail:
        `Гайд: «Прокачиваем героя до ${SKILL_ROLL_FULL_LEVEL}го уровня чтобы открыть 3й и 4й навык». Сейчас ${hero.level} ур.; ` +
        `уровни слотов класса ${hero.className}: ${unlockLevels.join(' / ')}` +
        (neededLevel === SKILL_ROLL_FULL_LEVEL ? '' : ` — 4-й слот открывается на ${neededLevel} ур.`),
      basicCubes: 0,
    })
  }
  if (!unlocksFour && !hero.titanSoul) {
    reasons.push(`без Души Титана у класса ${hero.className} прокачкой открывается слотов: ${unlockLevels.length || '—'}`)
    steps.push({
      kind: 'level',
      slot: null,
      title: 'Душа Титана — открыть оставшиеся слоты',
      detail:
        `Гайд: «…(используем Душу Титана если 3й или 4й навыки недоступны)». Прокачкой у класса ${hero.className} открывается ` +
        `слотов: ${unlockLevels.length || '—'} — остальные (до четырёх) открывает Душа Титана.`,
      basicCubes: 0,
    })
  }

  // 3. Слот 4: идеальный кубик (гайд) — он не трогает остальные слоты (A39).
  const slot4 = stateOf(4)
  if (slot4 === 'keep') {
    steps.push({
      kind: 'keep',
      slot: 4,
      title: 'Слот 4 — оставить как есть',
      detail:
        'Нужный навык уже выпал при прокачке — идеальный кубик не тратим: доралливаем 1-й слот базовым и закрываем остаток Роландом (гайд).',
      basicCubes: 0,
    })
  } else {
    const pool = rollableSkills(data, hero, { ignoreSlots: [4] })
    steps.push({
      kind: 'reroll',
      slot: 4,
      cube: 4,
      title: 'Слот 4 — идеальный кубик',
      detail:
        'Идеальный кубик (8 базовых, добывается в Башне Титана) — единственный, которым можно перекинуть 4-й слот; ' +
        'остальные слоты он не задевает, поэтому 2-й слот, выбранный наймом, остаётся на месте.',
      basicCubes: cubeCost(4),
      poolSize: pool.length,
      rollsNote: `нужный навык в данных не задан; вероятность конкретного навыка ≈ 1/${pool.length}`,
    })
  }

  // 4. Слот 1: базовый кубик.
  if (stateOf(1) !== 'keep') {
    const cube = cubeForSlot(1)
    const poolSize = rollableSkills(data, hero, { ignoreSlots: [1] }).length
    steps.push({
      kind: 'reroll',
      slot: 1,
      cube,
      title: 'Слот 1 — базовый кубик',
      detail: `Гайд: после 4-го слота доралливаем 1-й базовым кубиком (создаётся синтезом). ${cubeDetails(cube)}.`,
      basicCubes: cubeCost(cube),
      poolSize,
      rollsNote: `нужный навык в данных не задан; вероятность конкретного навыка ≈ 1/${poolSize}`,
    })
  }

  // 5. Роланд — на остаток, последним. По гайду слоты 1, 2 и 4 закрываются своими механизмами
  //    (базовый кубик, найм, идеальный кубик), поэтому Роланду остаётся «оставшийся» слот — обычно 3-й
  //    (его труднее всего выкинуть кубиком).
  const handled = new Set<number>()
  for (const st of steps) if (st.slot !== null && st.slot !== ROLAND_PREFERRED_SLOT) handled.add(st.slot)
  const leftover = [1, 2, 3, 4].filter((s) => stateOf(s) !== 'keep' && !handled.has(s))
  const rolandSlot = leftover.length === 0 ? null : leftover.includes(ROLAND_PREFERRED_SLOT) ? ROLAND_PREFERRED_SLOT : Math.max(...leftover)
  let roland: HeroSkillPlan['roland'] = null
  if (leftover.length > 0) {
    const reason =
      `Роланд: любой навык в любой слот, но только один раз на героя — тратить последним, ` +
      `когда остальные слоты уже перекинуты (обычно слот ${ROLAND_PREFERRED_SLOT} — его труднее всего выкинуть кубиком)`
    if (rolandAvailable && rolandSlot !== null) {
      roland = { slot: rolandSlot, reason }
      steps.push({
        kind: 'roland',
        slot: rolandSlot,
        title: `Слот ${rolandSlot} — закрыть Роландом`,
        detail: `${reason}. Последний незакрытый слот: остаток выбирается бесплатно.`,
        basicCubes: 0,
      })
    } else {
      reasons.push('Роланд на этом герое уже использован — остаток закрываем кубиками (флажок «Роланд использован»)')
    }
  }

  // ODC (ST-Central): один базовый кубик в слот 1 для героя, у которого нет ни одного полезного навыка.
  const rerolls = mine.filter((a) => a.action === 'reroll')
  const keeps = mine.filter((a) => a.action === 'keep')
  const oneDiceCheck = rerolls.length > 0 && keeps.length === 0 && hero.skills.length > 0
  if (oneDiceCheck) {
    reasons.push(
      'проверка одним кубиком: ни один навык не даёт вклада — бросаем один базовый кубик в слот 1; если и он пустой, вкладываться в героя не стоит',
    )
  }

  // Один слот — одно действие: шаг плана («сроллить») важнее вердикта совета («оставить»).
  const slotActions: SlotPlanAction[] = []
  for (const slot of [1, 2, 3, 4]) {
    const step = steps.find((s) => s.slot === slot && REROLL_STEP_KINDS.includes(s.kind))
    if (step) slotActions.push({ slot, action: 'reroll', step: step.kind })
    else if (stateOf(slot) === 'keep') slotActions.push({ slot, action: 'keep' })
  }

  return {
    heroIndex,
    oneDiceCheck,
    roland,
    reasons,
    steps,
    slotActions,
    basicCubes: steps.reduce((a, s) => a + s.basicCubes, 0),
    rolandAvailable,
  }
}

/** Планы по всем героям отряда (пошаговый план, «проверка одним кубиком», Роланд). */
export function heroRollPlans(
  data: GameData,
  heroes: HeroInstance[],
  advice: SkillAdvice[],
  options: SkillAdviceOptions = {},
): HeroSkillPlan[] {
  return heroes.map((hero, heroIndex) => rollPlan(data, hero, heroIndex, advice, options))
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
  return { contributions, advice, plans: heroRollPlans(data, heroes, advice, options) }
}
