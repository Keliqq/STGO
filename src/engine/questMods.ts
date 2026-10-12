/**
 * Модификаторы квестов: мини-боссы (Agile/Dire/Huge/Legendary/Wealthy), флаги Flash-заданий и Nullysium,
 * и модификаторы («проклятия») Гробницы Титанов.
 *
 * Все числа — stcalc.com (сессия 34): датасет `https://stcalc.com/data/quests.json` (штрафы EVA/крита
 * у Flash/Nullysium, статы Гробницы) и бандл калькулятора `https://stcalc.com/static/js/main.<hash>.js`
 * (таблица мини-боссов и таблица модификаторов Гробницы + их применение). Код stcalc не копируется —
 * перенесены числа и проверенный смысл полей; разбор — docs/ASSUMPTIONS.md (A77, A78).
 *
 * Как это устроено: `applyQuestMods(quest, mods)` — чистая функция. Она
 *   1) пересчитывает статы квеста (HP, урон, урон AoE, шансы AoE и крита, уклонение врага) и
 *   2) собирает `QuestBattle` — то, что действует на героев и на выбор цели и полями квеста не выражается,
 *      — и кладёт его в `quest.battle`. Дальше квест с готовым `battle` можно передавать в движок как
 *      обычный квест: никаких дополнительных параметров у `simulateTeam`/`optimize` не нужно.
 */
import type { ClassGroup, Element, Quest, QuestBattle } from '../data/types.ts'
import { AOE_CHANCE, ENEMY_CRIT_CHANCE, ENEMY_CRIT_CHANCE_TOMB, FLASH_EXTREME_EVA_PENALTY_PP, MINI_BOSSES, NULLYSSIUM_CRIT_PENALTY_PP, NULLYSSIUM_EVA_PENALTY_PP, TOMB_AREA, TOMB_DEFAULT_STATS, TOMB_MODIFIERS } from './constants.ts'
import { defCapsFromCap } from './formulas.ts'

/**
 * Модификатор квеста. Сейчас у всех один вид — `stcalc` (числа из датасета/калькулятора stcalc.com);
 * поле оставлено, чтобы отличать источник, если появятся модификаторы из других источников.
 */
export interface QuestModifier {
  key: string
  label: string
  source: 'stcalc'
  /** Короткий смысл по-русски — для бейджей и «Справки». */
  desc: string
}

/** Мини-босс как модификатор (см. `MINI_BOSSES`). */
export function miniBossModifier(key: string): QuestModifier | null {
  const def = MINI_BOSSES[key]
  if (!def) return null
  return { key: `miniboss:${def.key}`, label: def.label, source: 'stcalc', desc: miniBossDesc(def.key) }
}

/** Модификатор Гробницы Титанов как модификатор (см. `TOMB_MODIFIERS`). */
export function tombModifier(key: string): QuestModifier | null {
  const def = TOMB_MODIFIERS[key]
  if (!def) return null
  return { key: def.key, label: def.label, source: 'stcalc', desc: def.desc }
}

/** Расшифровка мини-босса по-русски (числа — из `MINI_BOSSES`). */
export function miniBossDesc(key: string): string {
  const d = MINI_BOSSES[key]
  if (!d) return ''
  if (d.lootOnly) return 'добыча больше, статы те же'
  const parts: string[] = []
  if (d.hpPct) parts.push(`HP +${Math.round(d.hpPct * 100)}%`)
  if (d.atkPct) parts.push(`ATK +${Math.round(d.atkPct * 100)}%`)
  if (d.aoeMult) parts.push(`шанс AoE ×${d.aoeMult}`)
  if (d.aoePct) parts.push(`урон AoE +${Math.round(d.aoePct * 100)}%`)
  if (d.critMult) parts.push(`шанс крита врага ×${d.critMult}`)
  if (d.evaPct) parts.push(`уклонение врага +${d.evaPct}`)
  return parts.join(', ')
}

/** Модификатор по ключу: сначала Гробница, потом мини-боссы (ключи не пересекаются). */
export function questModifierByKey(key: string): QuestModifier | null {
  return tombModifier(key) ?? miniBossModifier(key)
}

// ─────────────────────────── низкоуровневые применения ───────────────────────────

/** Мини-босс: HP/ATK/AoE/крит — множителями, уклонение врага — п.п. (порядок как в stcalc). */
function applyMiniBoss(q: Quest, key: string): Quest | null {
  const d = MINI_BOSSES[key]
  if (!d) return null
  const battle: QuestBattle = { ...(q.battle ?? {}) }
  // Уклонение врага: у мини-боссов оно только прибавляется (`enemyEvasion += eva`).
  const evaPp = (battle.enemyEvaPp ?? 0) + (d.evaPct ?? 0)
  if (evaPp > 0) battle.enemyEvaPp = evaPp
  return {
    ...q,
    // Мини-босс — это босс: «Bonuses are doubled against bosses» работает и на нём (A17/A77).
    variant: q.variant === 'normal' ? 'miniboss' : q.variant,
    monsterHp: Math.round(q.monsterHp * (1 + (d.hpPct ?? 0))),
    monsterDmg: Math.round(q.monsterDmg * (1 + (d.atkPct ?? 0))),
    monsterAoe: Math.round(q.monsterAoe * (1 + (d.aoePct ?? 0))),
    // Шансы трогаем только теми множителями, которые у мини-босса есть: иначе поле остаётся как было.
    aoeChance: d.aoeMult ? Math.min(1, (q.aoeChance ?? AOE_CHANCE) * d.aoeMult) : q.aoeChance,
    enemyCritChance: d.critMult ? Math.min(1, (q.enemyCritChance ?? ENEMY_CRIT_CHANCE) * d.critMult) : q.enemyCritChance,
    battle,
  }
}

/** Общие изменения статов героев (без группы) — складываются, как в stcalc. */
interface HeroMods {
  atkPct: number
  hpPct: number
  critPp: number
  critDmgPp: number
  evaPp: number
}

const emptyHeroMods = (): HeroMods => ({ atkPct: 0, hpPct: 0, critPp: 0, critDmgPp: 0, evaPp: 0 })

/** Модификатор Гробницы: статы врага в поля квеста, остальное — в `battle`. */
function applyTomb(q: Quest, key: string, all: HeroMods, byGroup: Map<ClassGroup, HeroMods>, extra: { aoeChanceMult: number; aoeDmgPct: number }): Quest {
  const d = TOMB_MODIFIERS[key]
  if (!d) return q
  const battle: QuestBattle = { ...(q.battle ?? {}) }
  if (d.enemyEvasionPct) battle.enemyEvaPp = (battle.enemyEvaPp ?? 0) + d.enemyEvasionPct
  if (d.targetGroup && d.targetMult) {
    // Несколько модификаторов на разные классы быть не могут (игра даёт выбрать один), но если попадут —
    // берём самый сильный: цель одна.
    if ((d.targetMult ?? 0) >= (battle.targetMult ?? 0)) {
      battle.targetGroup = d.targetGroup
      battle.targetMult = d.targetMult
    }
  }
  if (d.firstAtkPct) battle.firstAtkPct = Math.max(battle.firstAtkPct ?? 0, d.firstAtkPct)
  if (d.firstAtkCritPct) battle.firstAtkCritPp = Math.max(battle.firstAtkCritPp ?? 0, d.firstAtkCritPct)
  if (d.aoeChanceMult) extra.aoeChanceMult = Math.max(extra.aoeChanceMult, d.aoeChanceMult)
  if (d.aoeDmgPct) extra.aoeDmgPct += d.aoeDmgPct
  let target = all
  if (d.heroGroup) {
    const cur = byGroup.get(d.heroGroup)
    if (cur) target = cur
    else {
      target = emptyHeroMods()
      byGroup.set(d.heroGroup, target)
    }
  }
  target.atkPct += d.heroAtkPct ?? 0
  target.hpPct += d.heroHpPct ?? 0
  target.critPp += d.heroCritPct ?? 0
  target.critDmgPp += d.heroCritDmgPct ?? 0
  target.evaPp += d.heroEvaPct ?? 0
  return {
    ...q,
    monsterHp: Math.round(q.monsterHp * (1 + (d.enemyHpPct ?? 0) / 100)),
    monsterDmg: Math.round(q.monsterDmg * (1 + (d.enemyAtkPct ?? 0) / 100)),
    battle,
  }
}

/**
 * Применить модификаторы к квесту. Возвращает новый квест (исходный не меняется) с уже пересчитанными
 * статами и полем `battle`, а также сам объект боевых параметров.
 *
 * Тонкость: возвращаемый `battle` — это ВСЕ посчитанные параметры (в том числе когда модификатор
 * не меняет ничего, что действует на героев), а в `quest.battle` попадает только непустой набор:
 * так бой не получает лишнего поля и остаётся прежним для квестов без модификаторов.
 *
 * Порядок как в игре и в stcalc: сначала статы мини-босса, затем штрафы конкретного задания
 * (Flash/Nullysium), затем модификаторы Гробницы (они складываются между собой).
 */
export function applyQuestMods(quest: Quest, mods: readonly QuestModifier[] | readonly string[] = []): { quest: Quest; battle: QuestBattle } {
  const keys = mods.map((m) => (typeof m === 'string' ? m : m.key))
  const all = emptyHeroMods()
  const byGroup = new Map<ClassGroup, HeroMods>()
  const extra = { aoeChanceMult: 1, aoeDmgPct: 0 }
  let out: Quest = { ...quest, mods: keys }
  let battle: QuestBattle = { ...(quest.battle ?? {}) }
  // Шанс AoE: пока его никто не трогал, поле остаётся как было (часто null — движок берёт AOE_CHANCE).
  let aoes = out.aoeChance ?? AOE_CHANCE
  let aoeTouched = false

  const flushHero = (): void => {
    const next: QuestBattle = { ...battle }
    if (all.atkPct) next.heroAtkPct = (next.heroAtkPct ?? 0) + all.atkPct
    if (all.hpPct) next.heroHpPct = (next.heroHpPct ?? 0) + all.hpPct
    if (all.critPp) next.heroCritChancePct = (next.heroCritChancePct ?? 0) + all.critPp
    if (all.critDmgPp) next.heroCritDmgPct = (next.heroCritDmgPct ?? 0) + all.critDmgPp
    if (all.evaPp) next.heroEvaPct = (next.heroEvaPct ?? 0) + all.evaPp
    const groups = [...byGroup.entries()]
      .map(([group, m]) => ({
        group,
        heroAtkPct: m.atkPct || null,
        heroHpPct: m.hpPct || null,
        heroCritChancePct: m.critPp || null,
        heroCritDmgPct: m.critDmgPp || null,
        heroEvaPct: m.evaPp || null,
      }))
      .filter((g) => g.heroAtkPct || g.heroHpPct || g.heroCritChancePct || g.heroCritDmgPct || g.heroEvaPct)
    if (groups.length > 0) next.groupMods = [...(next.groupMods ?? []), ...groups]
    battle = next
  }

  for (const key of keys) {
    const mini = applyMiniBoss(out, key)
    if (mini) {
      out = mini
      battle = mini.battle ?? battle
      if (MINI_BOSSES[key]?.aoeMult) {
        aoes = out.aoeChance ?? aoes
        aoeTouched = true
      }
      continue
    }
    if (TOMB_MODIFIERS[key]) {
      out = applyTomb(out, key, all, byGroup, extra)
      battle = out.battle ?? battle
    }
  }

  // Flash-задание: бонусы «doubled during Flash Quests» удваиваются (A53), у героев — штрафы из датасета.
  if (out.isFlash) {
    battle = { ...battle }
    const extreme = /extreme/i.test(out.difficulty)
    const eva = out.isNullysium ? NULLYSSIUM_EVA_PENALTY_PP : extreme ? FLASH_EXTREME_EVA_PENALTY_PP : 0
    const crit = out.isNullysium ? NULLYSSIUM_CRIT_PENALTY_PP : 0
    if (eva) battle.heroEvaPct = (battle.heroEvaPct ?? 0) - eva
    if (crit) battle.heroCritChancePct = (battle.heroCritChancePct ?? 0) - crit
  }
  if (out.isTomb) {
    // В Гробнице герои критуют реже (stcalc `critPenalty` 20 по флагу `isTomb`), крит врага — 15% (A70).
    battle = { ...battle, heroCritChancePct: (battle.heroCritChancePct ?? 0) - 20 }
    if (out.enemyCritChance == null) out = { ...out, enemyCritChance: ENEMY_CRIT_CHANCE_TOMB }
  }

  flushHero()
  // Шанс AoE множится только если модификатор его трогал: иначе поле остаётся как было (часто null —
  // тогда движок берёт константу AOE_CHANCE).
  if (extra.aoeChanceMult !== 1) {
    aoes = Math.min(1, aoes * extra.aoeChanceMult)
    aoeTouched = true
  }
  if (extra.aoeDmgPct) out = { ...out, monsterAoe: Math.round(out.monsterAoe * (1 + extra.aoeDmgPct / 100)) }
  const hasHeroSide = Object.values(battle).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== 0))
  const result: Quest = {
    ...out,
    aoeChance: aoeTouched ? aoes : (quest.aoeChance ?? null),
    battle: hasHeroSide ? battle : null,
  }
  return { quest: result, battle }
}

// ─────────────────────────── Гробница Титанов ───────────────────────────

/** Этаж Гробницы, как его вводит пользователь (хранится в IndexedDB, `data/tombFloors.ts`). */
export interface TombFloor {
  id: string
  /** Номер этажа (глубина). */
  depth: number
  monsterHp: number
  monsterDmg: number
  monsterAoe: number
  /** Defense cap с экрана игры: пороги 50/70/75% считаются как cap/6, cap/3, cap (A71). */
  defenseCap: number
  /** Стихия барьера этажа и его HP; null — барьера нет. */
  barrier: { element: string; hp: number } | null
  /** Ключи отмеченных модификаторов (`TOMB_MODIFIERS`). */
  mods: string[]
  /** Сложность этажа: у Гробницы в датасете одно значение на все сложности, по умолчанию `Extreme`. */
  difficulty: string
}

/** Неполный ввод этажа из формы — с подстановкой значений по умолчанию из датасета. */
export type TombFloorInput = Partial<Omit<TombFloor, 'id'>> & { depth: number }

export const TOMB_QUEST_VARIANT_ID = 'tomb'

/** Идентификатор синтетического квеста Гробницы: `Tomb of Titans|tomb|<этаж>`. */
export function tombQuestId(depth: number): string {
  return `${TOMB_AREA}|${TOMB_QUEST_VARIANT_ID}|${depth}`
}

/** Этаж — это квест Гробницы? (по `id` синтетического квеста). */
export function isTombQuestId(id: string): boolean {
  return id.startsWith(`${TOMB_AREA}|${TOMB_QUEST_VARIANT_ID}|`)
}

/** Этаж из идентификатора квеста (`Tomb of Titans|tomb|7` → 7); null — это не квест Гробницы. */
export function tombDepthFromQuestId(id: string): number | null {
  if (!isTombQuestId(id)) return null
  const n = Number(id.slice(`${TOMB_AREA}|${TOMB_QUEST_VARIANT_ID}|`.length))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Этаж с подставленными значениями по умолчанию. */
export function normalizeTombFloor(input: TombFloorInput): TombFloor {
  const depth = Math.max(1, Math.round(input.depth))
  const barrier = input.barrier && input.barrier.hp > 0 && input.barrier.element ? { element: input.barrier.element, hp: Math.round(input.barrier.hp) } : null
  return {
    id: tombQuestId(depth),
    depth,
    monsterHp: Math.max(1, Math.round(input.monsterHp ?? TOMB_DEFAULT_STATS.monsterHp)),
    monsterDmg: Math.max(0, Math.round(input.monsterDmg ?? TOMB_DEFAULT_STATS.monsterDmg)),
    monsterAoe: Math.max(0, Math.round(input.monsterAoe ?? TOMB_DEFAULT_STATS.monsterAoe)),
    defenseCap: Math.max(1, Math.round(input.defenseCap ?? TOMB_DEFAULT_STATS.defenseCap)),
    barrier,
    mods: [...new Set(input.mods ?? [])],
    difficulty: input.difficulty ?? 'Extreme',
  }
}

/**
 * Квест Гробницы Титанов из этажа: статы введены пользователем, пороги защиты — из одного cap
 * (`defCapsFromCap`, A71), модификаторы этажа применяются тем же `applyQuestMods`. Размер отряда
 * у Гробницы — 5, стихия барьера своя на каждый этаж, поэтому квест синтетический, а не строка таблицы.
 */
export function tombQuest(input: TombFloorInput): { quest: Quest; battle: QuestBattle } {
  const floor = normalizeTombFloor(input)
  const base: Quest = {
    id: floor.id,
    area: TOMB_AREA,
    variant: 'boss',
    difficulty: floor.difficulty,
    minPower: null,
    heroXp: null,
    monsterHp: floor.monsterHp,
    monsterDmg: floor.monsterDmg,
    monsterAoe: floor.monsterAoe,
    // Шанс AoE Гробницы известен из датасета (25%) — пишем явно, чтобы его можно было множить (massive).
    aoeChance: AOE_CHANCE,
    enemyCritChance: ENEMY_CRIT_CHANCE_TOMB,
    barrier: floor.barrier ? { elements: [floor.barrier.element as Element], hp: floor.barrier.hp } : null,
    defCaps: defCapsFromCap(floor.defenseCap),
    miniBosses: [],
    mods: [],
    battle: null,
    isFlash: false,
    isNullysium: false,
    isTomb: true,
    tombDepth: floor.depth,
  }
  return applyQuestMods(base, floor.mods)
}

/** Метка квеста для интерфейса: у Гробницы — «Tomb of Titans · этаж N · Extreme». */
export function tombFloorLabel(floor: Pick<TombFloor, 'depth' | 'difficulty'>): string {
  return `${TOMB_AREA} · этаж ${floor.depth} · ${floor.difficulty}`
}
