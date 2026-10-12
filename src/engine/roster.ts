/**
 * Анализ ростера (требование владельца, сессия 28).
 *
 * Считается по «Foster Your Roster» (https://st-central.net/foster-your-roster/):
 *   · героев на каждую стихию — не меньше трёх (Spellblade не считается: у него стихия «Any»);
 *   · архетипов (Fighter/Rogue/Spellcaster) на стихию — не меньше двух;
 *   · «красных» (Fighter) столько же, сколько слотов квестов: каждому одновременному походу нужен боец;
 *   · синих (Spellcaster) и зелёных (Rogue) примерно поровну.
 * Отсюда же совет «что нанять следующим»: чего в ростере не хватает по этим четырём правилам.
 *
 * Стихия героя берётся из его класса (`HEROES` → `ELEMENT`), а не из камней: правило ростера — про то,
 * какие герои вообще есть. Сколько герой реально даёт барьеру (с камнями) — считает barriers.ts.
 */
import { ELEMENTS, type ClassGroup, type Element, type GameData, type HeroInstance } from '../data/types.ts'
import { fighterFromHero } from './combat.ts'
import { ROSTER_BLUE_GREEN_TOLERANCE, ROSTER_MIN_ARCHETYPES_PER_ELEMENT, ROSTER_MIN_HEROES_PER_ELEMENT, RULES_ROSTER_URL } from './constants.ts'
import { effectiveClass } from './stats.ts'

export interface RosterElementRow {
  /** Стихия класса; `Any` — герои с «любой» стихией (Spellblade/Spellknight: за стихию не считаются). */
  element: Element | 'Any'
  heroes: number
  /** Сколько героев дают эту стихию в барьер (есть камни их стихии) — по `barriers.ts`. */
  withElement: number
  /** Архетипы, которые в ростере на этой стихии есть. */
  archetypes: ClassGroup[]
  /** Архетипы, которые есть в игре на этой стихии, но не в ростере. */
  missingArchetypes: ClassGroup[]
  /** Сколько героев не хватает до ROSTER_MIN_HEROES_PER_ELEMENT. */
  missingHeroes: number
}

export interface RosterAdvice {
  level: 'ok' | 'info' | 'warn'
  message: string
  source: string
}

export interface RosterClassRow {
  className: string
  group: ClassGroup
  element: Element | 'Any'
  count: number
}

export interface RosterReport {
  elements: RosterElementRow[]
  fighters: number
  rogues: number
  spellcasters: number
  classes: RosterClassRow[]
  /** Максимум слотов квестов в игре (лист SLOTS) и принятое в расчёте число (настройка пользователя). */
  maxQuestSlots: number
  questSlots: number
  /** Сколько отрядов размера `partySize` набирается из ростера. */
  parties: number
  partySize: number
  advice: RosterAdvice[]
}

/** Максимум слотов квестов из листа SLOTS (блок QUEST SLOTS): столько походов можно вести одновременно. */
export function maxQuestSlots(data: GameData): number {
  const slots = data.accountSlots.filter((s) => s.kind === 'quest').map((s) => s.n)
  return slots.length > 0 ? Math.max(...slots) : 0
}

/** Размер отряда по умолчанию для «сколько отрядов набирается» — самый частый размер локаций. */
export const DEFAULT_PLAN_PARTY_SIZE = 4

/**
 * Отчёт по ростеру. `questSlots` — сколько походов пользователь ведёт одновременно (по умолчанию —
 * сколько отрядов набирается из ростера, но не больше максимума из данных).
 */
export function rosterReport(
  data: GameData,
  heroes: HeroInstance[],
  opts: { questSlots?: number; partySize?: number } = {},
): RosterReport {
  const partySize = opts.partySize ?? DEFAULT_PLAN_PARTY_SIZE
  const max = maxQuestSlots(data)
  const parties = Math.floor(heroes.length / partySize)
  const questSlots = Math.max(1, opts.questSlots ?? Math.min(max > 0 ? max : parties, Math.max(1, parties)))

  const classesByElement = new Map<Element | 'Any', Set<ClassGroup>>()
  for (const cls of data.heroClasses) {
    const set = classesByElement.get(cls.element) ?? new Set<ClassGroup>()
    set.add(cls.group)
    classesByElement.set(cls.element, set)
  }

  const classes: RosterClassRow[] = []
  const elements: RosterElementRow[] = []
  let fighters = 0
  let rogues = 0
  let spellcasters = 0
  /** По герою: его стихия и сколько он реально даёт этой стихии (камни его стихии, A21). */
  const heroFacts: { element: Element | 'Any'; value: number }[] = []
  for (const hero of heroes) {
    const cls = effectiveClass(hero, data)
    if (!cls) continue
    const row = classes.find((c) => c.className === cls.name)
    if (row) row.count++
    else classes.push({ className: cls.name, group: cls.group, element: cls.element, count: 1 })
    if (cls.group === 'Fighter') fighters++
    else if (cls.group === 'Rogue') rogues++
    else spellcasters++
    const f = fighterFromHero(hero, data)
    heroFacts.push({ element: cls.element, value: cls.element === 'Any' ? f.elementAny : (f.elements[cls.element] ?? 0) })
  }
  for (const element of [...ELEMENTS.filter((e) => e !== 'Gold'), 'Any' as const]) {
    const rows = classes.filter((c) => c.element === element)
    const count = rows.reduce((a, c) => a + c.count, 0)
    const present = [...new Set(rows.map((c) => c.group))].sort()
    const available = [...(classesByElement.get(element) ?? new Set<ClassGroup>())].sort()
    const missingArchetypes = available.filter((g) => !present.includes(g))
    // «Spellblade не считается»: стихия «Any» не закрывает ни одну стихию, в правило «3+ на стихию» не идёт.
    const withElement = element === 'Any' ? 0 : heroFacts.filter((h) => h.element === element && h.value > 0).length
    elements.push({
      element,
      heroes: count,
      withElement,
      archetypes: present,
      missingArchetypes,
      missingHeroes: element === 'Any' ? 0 : Math.max(0, ROSTER_MIN_HEROES_PER_ELEMENT - count),
    })
  }

  const advice: RosterAdvice[] = []
  for (const row of elements) {
    if (row.element === 'Any') continue
    if (row.missingHeroes > 0) {
      advice.push({
        level: row.heroes === 0 ? 'warn' : 'info',
        message: `Стихия «${row.element}»: героев ${row.heroes} из ${ROSTER_MIN_HEROES_PER_ELEMENT} — нанять ещё ${row.missingHeroes}.${row.withElement === 0 && row.heroes > 0 ? ' Камней этой стихии ни у кого нет — стихию барьеру они не дают.' : ''}`,
        source: RULES_ROSTER_URL,
      })
    }
    if (row.heroes > 0 && row.archetypes.length < ROSTER_MIN_ARCHETYPES_PER_ELEMENT) {
      advice.push({
        level: 'info',
        message:
          row.missingArchetypes.length > 0
            ? `Стихия «${row.element}»: в ростере только ${row.archetypes.join('/')} — нужен второй архетип (${row.missingArchetypes.join('/')}).`
            : `Стихия «${row.element}»: в игре у неё всего ${row.archetypes.join('/')} — второго архетипа не существует, стихию придётся закрывать камнями и чемпионом.`,
        source: RULES_ROSTER_URL,
      })
    }
  }
  advice.push(
    fighters >= questSlots
      ? { level: 'ok', message: `Бойцов (Fighter) ${fighters} при ${questSlots} слотах квестов — правило «бойцов столько же, сколько слотов квестов» выполняется.`, source: RULES_ROSTER_URL }
      : { level: 'warn', message: `Бойцов (Fighter) ${fighters}, а слотов квестов ${questSlots} — наймите ещё ${questSlots - fighters}: каждому одновременному походу нужен «красный».`, source: RULES_ROSTER_URL },
  )
  advice.push(
    Math.abs(rogues - spellcasters) <= ROSTER_BLUE_GREEN_TOLERANCE
      ? { level: 'ok', message: `Разбойников (зелёных) ${rogues}, заклинателей (синих) ${spellcasters} — их примерно поровну.`, source: RULES_ROSTER_URL }
      : {
          level: 'info',
          message:
            rogues > spellcasters
              ? `Разбойников ${rogues}, заклинателей ${spellcasters} — синих меньше: наймите героя-заклинателя (Rogue/Spellcaster должны быть примерно в равном счёте).`
              : `Заклинателей ${spellcasters}, разбойников ${rogues} — зелёных меньше: наймите героя-разбойника.`,
          source: RULES_ROSTER_URL,
        },
  )
  const anyCount = elements.find((e) => e.element === 'Any')?.heroes ?? 0
  if (anyCount > 0) {
    advice.push({
      level: 'info',
      message: `Героев со стихией «Any» (Spellblade/Spellknight) ${anyCount}: за стихию они не считаются, но дают 50% любой стихии против барьера.`,
      source: RULES_ROSTER_URL,
    })
  }
  return { elements, fighters, rogues, spellcasters, classes, maxQuestSlots: max, questSlots, parties, partySize, advice }
}
