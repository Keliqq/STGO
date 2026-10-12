/**
 * Стихийные барьеры (требование владельца, сессия 28).
 *
 * Что считается: по листу QUESTS (`Barrier Type`, `Barrier Health`) — какие стихии и какая величина
 * нужны на каждой локации и сложности; сколько стихии даёт ростер (герои — своей стихией, Spellblade —
 * любой за 50%, чемпионы — своей стихией по рангу, Element Breakpoints) и какие ПАРЫ бойцов добирают
 * до порога. Если пары не хватает — чего именно не хватает (сколько стихии, сколько камней какого
 * размера, поможет ли Rudo).
 *
 * Механика барьера — A9: суммарная стихия отряда по любой из стихий барьера ≥ `Barrier Health`; не пробит —
 * урон отряда ×0.2 (`BARRIER_UNBROKEN_DMG_FACTOR`). Источники: ST-Central «Hero Academia» → Elemental
 * Barriers (ценность порога и 50% у Spellblade, https://st-central.net/hero-academia/) и «Team Building,
 * Not Guesswork» (два героя на стихию барьера, Rudo +50%, https://st-central.net/team-building-not-guesswork/).
 */
import type { Element, GameData, HeroInstance, Quest } from '../data/types.ts'
import { BARRIER_PAIRS_LIST_LIMIT, PARTY_HEROES_PER_BARRIER_ELEMENT } from './constants.ts'
import { fighterFromChampion, fighterFromHero, parseSpecials, type Fighter } from './combat.ts'
import { QUEST_VARIANT_RU } from './teamRunner.ts'
import { effectiveClass } from './stats.ts'
import { ELEMENT_RU } from './statWeights.ts'

// Русские названия стихий — в statWeights.ts (там же подписи шагов весов) — реэкспорт для UI.
export { ELEMENT_RU }

/**
 * Один вкладчик стихии из ростера. `element` = null — герой с «любой» стихией (`cls.element === 'Any'`,
 * Spellblade/Spellknight): он даёт `value` в ЛЮБУЮ стихию барьера, но засчитывается только на `anyPct`.
 */
export interface RosterContribution {
  name: string
  kind: 'hero' | 'champion'
  /** Имя класса (у чемпиона — его группа-класс: Fighter/Rogue/Spellcaster). */
  className: string | null
  /** id героя (для «плана команд»: того же героя ставим в отряд). */
  heroId: string | null
  /** Стихия, в которую идёт вклад; null — любая (Spellblade). */
  element: Element | null
  /** Величина стихии (отображаемая, с духами — A29). */
  value: number
  /** Доля зачёта в барьер (1 — своя стихия, 0.5 — «Any» у Spellblade). */
  anyPct: number
  /** «+N% party Element bonus VS Elemental Barriers» у чемпиона (Rudo) — множитель стихии всего отряда. */
  partyBonusPct: number
  /** Ссылка на героя ростера (для плана) — у чемпиона null. */
  hero: HeroInstance | null
}

/** Вклад бойца в стихию барьера: своя стихия целиком + «любая» на её долю (Spellblade 50%, A9). */
export function elementContribution(f: Fighter, el: Element): number {
  return (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100)
}

/** Сколько стихии даёт ростер: герои + чемпионы (по рангу). Только вкладчики с ненулевой величиной. */
export function rosterContributions(data: GameData, heroes: HeroInstance[], championRanks: Record<string, number> = {}): RosterContribution[] {
  const out: RosterContribution[] = []
  for (const hero of heroes) {
    const f = fighterFromHero(hero, data)
    const cls = effectiveClass(hero, data)
    const element = cls && cls.element !== 'Any' ? cls.element : null
    const value = element ? (f.elements[element] ?? 0) : f.elementAny * (f.barrierAnyPct / 100)
    if (value <= 0) continue
    out.push({
      name: hero.name,
      kind: 'hero',
      className: cls?.name ?? null,
      heroId: hero.id,
      element,
      value,
      // ASSUMPTION: A9 — «Can use any element, but only counts as N% against Elemental Barriers» (Spellblade).
      anyPct: element ? 1 : f.barrierAnyPct > 0 ? f.barrierAnyPct / 100 : 0,
      partyBonusPct: parseSpecials(f.skills).elemBarrierBonusPct,
      hero,
    })
  }
  for (const [name, rank] of Object.entries(championRanks)) {
    const champion = data.champions.find((c) => c.name === name)
    if (!champion || rank < 1) continue
    const f = fighterFromChampion(champion, rank, data)
    const value = f.elements[champion.element] ?? 0
    if (value <= 0) continue
    out.push({
      name,
      kind: 'champion',
      className: champion.group,
      heroId: null,
      element: champion.element,
      value,
      anyPct: 1,
      partyBonusPct: parseSpecials(f.skills).elemBarrierBonusPct,
      hero: null,
    })
  }
  return out.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/** Вклад вкладчика именно в эту стихию барьера (0 — он в неё не попадает). */
export function contributionTo(c: RosterContribution, el: Element): number {
  return c.element === null ? c.value : c.element === el ? c.value : 0
}

/** Самый крупный камень стихии в данных — им и оцениваем, чем добрать недостающее (с тиром: «T14»). */
export function maxElementStone(data: GameData, el: Element): { name: string; value: number; tier: number | null } | null {
  const stones = data.enchants
    .filter((e) => e.kind === 'element' && e.element === el && (e.elementValue ?? 0) > 0)
    .sort((a, b) => (b.elementValue ?? 0) - (a.elementValue ?? 0))
  const best = stones[0]
  return best ? { name: best.name, value: best.elementValue ?? 0, tier: best.tier } : null
}

export type BarrierPairKind = 'heroes' | 'hero+champion' | 'hero+spellblade' | 'champion+spellblade' | 'spellblades'

/** Пара бойцов, добирающая барьер: значение — сумма их вкладов (без бонуса Rudo). */
export interface BarrierPair {
  kind: BarrierPairKind
  a: string
  b: string
  value: number
  /** Хватает ли сырой суммы; `reachesWithBonus` — с «+N% party Element bonus» чемпиона из ростера. */
  reaches: boolean
  reachesWithBonus: boolean
}

export interface BarrierElementReport {
  element: Element
  need: number
  /** Вкладчики этой стихии по убыванию вклада. */
  contributors: RosterContribution[]
  /** Пары, добирающие порог (сырой суммой или бонусом); в списке — не больше BARRIER_PAIRS_LIST_LIMIT. */
  pairs: BarrierPair[]
  /** Сколько всего пар добирает порог сырой суммой (без обрезки списка). */
  pairsTotal: number
  /** Сколько НЕПЕРЕСЕКАЮЩИХСЯ пар (каждый боец в одной) добирает порог — «сколько таких отрядов можно собрать». */
  disjointPairs: number
  /** То же, но с бонусом Rudo к стихии отряда (бонус получает только одна пара — чемпион один). */
  disjointPairsWithBonus: number
  /** Лучшая пара (сырая сумма) и лучший отряд размера локации. */
  bestPair: number
  bestParty: number
  /** Сколько не хватает лучшей паре до порога (0 — хватает). */
  missing: number
  /** Чего именно не хватает и чем добрать — готовые советы для интерфейса. */
  advice: string[]
}

export interface BarrierReport {
  quest: Quest
  label: string
  /** Размер отряда локации (QUESTS → Maximum Party Size). */
  partySize: number
  elements: BarrierElementReport[]
  /** «+N% party Element bonus VS Elemental Barriers» у чемпиона ростера (Rudo) — общий множитель стихии. */
  bonus: { champion: string; pct: number } | null
}

/** Пары-комбинации: чемпион с чемпионом в один отряд не встанет, поэтому такие пары не предлагаются. */
function pairKind(a: RosterContribution, b: RosterContribution): BarrierPairKind | null {
  const any = (c: RosterContribution): boolean => c.element === null
  const champ = (c: RosterContribution): boolean => c.kind === 'champion'
  if (champ(a) && champ(b)) return null
  if (any(a) && any(b)) return 'spellblades'
  if (champ(a) || champ(b)) return any(a) || any(b) ? 'champion+spellblade' : 'hero+champion'
  return any(a) || any(b) ? 'hero+spellblade' : 'heroes'
}

/** Максимум непересекающихся пар со суммой ≥ порога: жадно — сильнейший с сильнейшим, слабый без пары отпадает. */
export function maxDisjointPairs(values: number[], need: number): number {
  const v = [...values].filter((x) => x > 0).sort((a, b) => b - a)
  let i = 0
  let j = v.length - 1
  let count = 0
  while (i < j) {
    if (v[i] + v[j] >= need) {
      count++
      i++
      j--
    } else {
      j--
    }
  }
  return count
}

/**
 * То же с бонусом чемпиона (Rudo): чемпион встаёт только в ОДИН отряд, поэтому бонус получает одна пара.
 * Сначала собираем пары без бонуса, затем проверяем, добирает ли бонус ещё одну пару из оставшихся.
 */
export function maxDisjointPairsWithBonus(values: number[], need: number, bonusK: number): number {
  const base = maxDisjointPairs(values, need)
  if (bonusK <= 1) return base
  const v = [...values].filter((x) => x > 0).sort((a, b) => b - a)
  // Повторяем жадный проход и запоминаем, кто остался без пары.
  const used = new Set<number>()
  let i = 0
  let j = v.length - 1
  while (i < j) {
    if (v[i] + v[j] >= need) {
      used.add(i++)
      used.add(j--)
    } else {
      j--
    }
  }
  const rest = v.filter((_, k) => !used.has(k))
  return rest.length >= 2 && (rest[0] + rest[1]) * bonusK >= need ? base + 1 : base
}

/** Отчёт по одному квесту: стихии барьера, пары и дефицит. Без барьера — пустой `elements`. */
export function barrierReport(data: GameData, quest: Quest, contributions: RosterContribution[]): BarrierReport {
  const partySize = data.questAreas.find((a) => a.name === quest.area)?.partySize ?? 3
  const bonusContributor = contributions.find((c) => c.partyBonusPct > 0)
  const bonus = bonusContributor ? { champion: bonusContributor.name, pct: bonusContributor.partyBonusPct } : null
  const bonusK = bonus ? 1 + bonus.pct / 100 : 1
  const elements: BarrierElementReport[] = []
  for (const el of quest.barrier?.elements ?? []) {
    const need = quest.barrier?.hp ?? 0
    const contributors = contributions.filter((c) => contributionTo(c, el) > 0).sort((a, b) => contributionTo(b, el) - contributionTo(a, el))
    const values = contributors.map((c) => contributionTo(c, el))
    const pairs: BarrierPair[] = []
    let pairsTotal = 0
    for (let i = 0; i < contributors.length; i++) {
      for (let j = i + 1; j < contributors.length; j++) {
        const kind = pairKind(contributors[i], contributors[j])
        if (!kind) continue
        const value = values[i] + values[j]
        const reaches = value >= need
        const reachesWithBonus = value * bonusK >= need
        if (!reaches && !reachesWithBonus) continue
        if (reaches) pairsTotal++
        if (pairs.length < BARRIER_PAIRS_LIST_LIMIT) pairs.push({ kind, a: contributors[i].name, b: contributors[j].name, value, reaches, reachesWithBonus })
      }
    }
    pairs.sort((a, b) => b.value - a.value)
    const bestPair = values.length >= 2 ? values[0] + values[1] : 0
    const bestParty = values.slice(0, partySize).reduce((a, v) => a + v, 0)
    const missing = Math.max(0, need - bestPair)
    const elementRu = ELEMENT_RU[el] ?? el
    const advice: string[] = []
    if (missing > 0) {
      advice.push(`Не хватает ${missing} стихии «${elementRu}» даже лучшей паре.`)
      const stone = maxElementStone(data, el)
      if (stone) {
        advice.push(`Добрать камнями: «${stone.name}»${stone.tier ? ` (T${stone.tier})` : ''} даёт +${stone.value} — нужно ещё ${Math.ceil(missing / stone.value)}.`)
      }
      if (bonus) {
        advice.push(
          `Или поставить ${bonus.champion} в отряд: +${bonus.pct}% к стихии отряда против барьера → ${Math.round(bestPair * bonusK)} из ${need}.`,
        )
      }
      if (values.length === 0) advice.push(`В ростере нет ни одного бойца стихии «${elementRu}» — нужен герой этой стихии (или чемпион).`)
      if (bestParty * bonusK >= need) advice.push(`Парой не выходит, но отряд из ${partySize} бойцов наберёт ${Math.round(bestParty * bonusK)}.`)
    } else if (values.length < PARTY_HEROES_PER_BARRIER_ELEMENT) {
      advice.push(`Порог пара добирает, но правило «два героя на стихию барьера» выполнить нечем: вкладчиков всего ${values.length}.`)
    }
    elements.push({
      element: el,
      need,
      contributors,
      pairs,
      pairsTotal,
      disjointPairs: maxDisjointPairs(values, need),
      disjointPairsWithBonus: maxDisjointPairsWithBonus(values, need, bonusK),
      bestPair,
      bestParty: Math.round(bestParty * bonusK),
      missing,
      advice,
    })
  }
  return { quest, label: `${quest.area} · ${QUEST_VARIANT_RU[quest.variant]} · ${quest.difficulty}`, partySize, elements, bonus }
}

/** Отчёты по всем квестам с барьером (локация × сложность) — источник таблицы «Барьеры». */
export function barrierReports(data: GameData, quests: Quest[], contributions: RosterContribution[]): BarrierReport[] {
  return quests.filter((q) => q.barrier !== null).map((q) => barrierReport(data, q, contributions))
}
