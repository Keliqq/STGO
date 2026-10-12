/**
 * Правила состава отряда и связки «чемпион ↔ герой» (требование владельца, сессия 28).
 *
 * Источники (каждое правило и каждый совет подписаны ссылкой в интерфейсе):
 *   · ST-Central, «Team Building, Not Guesswork» (https://st-central.net/team-building-not-guesswork/):
 *     правила 1–4 — два героя на стихию барьера, один чемпион на отряд, один «красный» (Fighter) на отряд,
 *     остальные слоты — «синие/зелёные» (Spellcaster/Rogue); советы «чемпион ↔ герой» по признакам героя
 *     (уклонение после штрафа, крит без защитных навыков, угроза, класс), «Rudo +50% стихии отряда»,
 *     «Spellblade — только добавка на 50%», «мало бойцов → чемпион-боец»;
 *   · «Гайд по героям и защитникам Shop Titans 2.0» (Develion, ссылка в constants.ts → RULES_DEVELION_URL):
 *     связки чемпион + классы героев, «Ashley сильнее на боссах», «Donovan — за каждого разбойника».
 *
 * Подсказка — не приговор: совет «чемпион ↔ герой» помечается уровнем `info` и в интерфейсе рядом с ним
 * есть кнопка «проверить симуляцией» (прогон с предложенным чемпионом и с текущим). Уровень `warn`
 * оставлен только нарушениям правил 1–4.
 */
import { ELEMENTS, type ClassGroup, type Element, type GameData, type Quest } from '../data/types.ts'
import {
  AOE_CHANCE,
  BARRIER_BONUS_SKILL_RE,
  CHAMPION_CLASS_PAIRS,
  CRIT_BUILD_MIN,
  CRIT_CHAMPIONS,
  EVA_CHAMPION_MID_MIN,
  EVA_CHAMPION_SUSTAIN,
  EVA_CHAMPION_SUSTAIN_MIN,
  EVA_CHAMPION_YAMI,
  EVA_CHAMPION_YAMI_MIN,
  EVA_CHAMPIONS_MID,
  EXTREME_EVA_PENALTY,
  FIGHTER_CHAMPIONS,
  PARTY_FIGHTERS_MAX,
  PARTY_FIGHTERS_MIN,
  PARTY_HEROES_PER_BARRIER_ELEMENT,
  PARTY_MAX_CHAMPIONS,
  RULES_DEVELION_URL,
  RULES_TEAM_URL,
  SURVIVE_CHAMPIONS,
  THREAT_SHARE_WARN,
} from './constants.ts'
import { elementContribution } from './barriers.ts'
import { parseSpecials, threatShares, type Fighter } from './combat.ts'
import { effectiveClass } from './stats.ts'
import { teamFighters, type TeamRunMember } from './teamRunner.ts'

/** Уровень подсказки: `warn` — нарушено правило 1–4, `info` — совет (проверяется симуляцией), `ok` — всё по правилу. */
export type HintLevel = 'ok' | 'info' | 'warn'

export interface PartyHint {
  code: string
  level: HintLevel
  title: string
  message: string
  /** Ссылка на источник правила/совета — подсказка без источника не выводится. */
  source: string
  /** Чемпионы, с которыми советует сравнить отряд симуляцией («проверить симуляцией» в интерфейсе). */
  verifyChampions?: string[]
}

/** Факты о бойце, из которых собираются подсказки. */
export interface PartyFighterFact {
  name: string
  isChampion: boolean
  /** Имя класса героя (у чемпиона — «Champion»). */
  className: string
  group: ClassGroup | null
  /** Своя стихия; null — «любая» (Spellblade: стихию задаёт камень). */
  element: Element | null
  /** Вклад в каждую стихию как в стихию барьера (своя стихия + «Any» × доля, A9). */
  elementValues: Partial<Record<Element, number>>
  /** Сумма вклада по стихиям барьера квеста. */
  barrierValue: number
  eva: number
  /** Уклонение после штрафа Extreme (A34: вычитание до предела) — по нему выбирается чемпион под EVA. */
  evaAfterPenalty: number
  crit: number
  critDmg: number
  threat: number
  /** Доля атак босса по бойцу (угроза + AoE, как в бою). */
  threatShare: number
  def: number
  /** Условная «сила» бойца: ATK с поправкой на крит — по ней сравниваем героев внутри отряда. */
  attackPower: number
  /** Сколько навыков дают защиту (DEF/HP/мана-щит/уклонение) или лечат/спасают от смерти. */
  defensiveSkills: number
}

/** Сколько навыков бойца работают на выживание — «крит без защитных навыков» считается по этому счёту. */
function defensiveSkillCount(f: Fighter): number {
  let n = 0
  for (const s of f.skills) {
    const helps = s.effects.some((e) => ['def', 'hp', 'manaShield', 'eva'].includes(e.stat) && e.value > 0)
    if (helps) n++
  }
  const sp = parseSpecials(f.skills)
  if (sp.healSelf > 0 || sp.healParty > 0 || sp.survivePct > 0 || sp.lethalProtect) n++
  return n
}

/** Факты по составу отряда: герои снимками и/или чемпион своей экипировкой (как в прогоне команды). */
export function partyFacts(members: TeamRunMember[], quest: Quest | null, data: GameData): PartyFighterFact[] {
  // Пара «боец ↔ участник» держится вместе: чемпион, не найденный в данных, даёт null и выпадает,
  // и индексы списка бойцов перестают совпадать с индексами `members`.
  const pairs = teamFighters(members, data)
    .map((f, i) => ({ f, member: members[i] }))
    .filter((p): p is { f: Fighter; member: TeamRunMember } => p.f !== null)
  const list = pairs.map((p) => p.f)
  const shares = list.length > 0 ? threatShares(list, { aoeChance: AOE_CHANCE }) : []
  const barrierElements = quest?.barrier?.elements ?? []
  return pairs.map(({ f, member }, i) => {
    const cls = member?.hero ? effectiveClass(member.hero, data) : undefined
    const elementValues: Partial<Record<Element, number>> = {}
    let barrierValue = 0
    for (const el of ELEMENTS) {
      const v = elementContribution(f, el)
      if (v > 0) elementValues[el] = v
      if (barrierElements.includes(el)) barrierValue += v
    }
    return {
      name: f.name,
      isChampion: f.isChampion === true,
      className: cls?.name ?? (f.isChampion ? 'Champion' : ''),
      group: f.group ?? null,
      element: cls && cls.element !== 'Any' ? cls.element : null,
      elementValues,
      barrierValue,
      eva: f.eva,
      // ASSUMPTION: A34 — штраф Extreme вычитается из суммы уклонения; предел (A42) сюда не применяем:
      // совет «75% → Yami (+20% до 95%)» опирается именно на сумму до предела.
      evaAfterPenalty: f.eva - ((quest?.difficulty === 'Extreme' ? 1 : 0) * EXTREME_EVA_PENALTY),
      crit: f.crit,
      critDmg: f.critDmg,
      threat: f.threat,
      threatShare: shares[i] ?? 0,
      def: f.def,
      attackPower: f.atk * (1 + Math.min(1, f.crit) * Math.max(0, f.critDmg - 1)),
      defensiveSkills: defensiveSkillCount(f),
    }
  })
}

/** Правила 1–4: что нарушено (галочка/предупреждение), а не «приговор» составу. */
export function ruleHints(facts: PartyFighterFact[], quest: Quest | null, partySize: number | null): PartyHint[] {
  const hints: PartyHint[] = []
  const heroes = facts.filter((f) => !f.isChampion)
  const champions = facts.filter((f) => f.isChampion)

  // Правило 1 — два героя на стихию барьера.
  if (!quest) {
    hints.push({ code: 'barrier', level: 'info', title: 'Барьер: локация не выбрана', message: 'Выберите целевую локацию — проверятся стихия барьера и её величина.', source: RULES_TEAM_URL })
  } else if (!quest.barrier) {
    hints.push({ code: 'barrier', level: 'ok', title: 'Барьер: правила нет', message: `У квеста «${quest.area} · ${quest.difficulty}» стихийного барьера нет — правило «два героя на стихию барьера» не применяется.`, source: RULES_TEAM_URL })
  } else {
    let best: { el: Element; sum: number; count: number } | null = null
    for (const el of quest.barrier.elements) {
      const sum = facts.reduce((a, f) => a + (f.elementValues[el] ?? 0), 0)
      const count = facts.filter((f) => (f.elementValues[el] ?? 0) > 0).length
      if (!best || sum > best.sum) best = { el, sum, count }
    }
    const el = best?.el ?? quest.barrier.elements[0]
    const count = best?.count ?? 0
    const sum = Math.round(best?.sum ?? 0)
    const need = quest.barrier.hp
    const ok = count >= PARTY_HEROES_PER_BARRIER_ELEMENT
    const covered = sum >= need
    hints.push({
      code: 'barrier',
      level: ok ? 'ok' : 'warn',
      title: ok
        ? 'Правило 1: два героя на стихию барьера'
        : covered
          ? 'Правило 1: на стихию барьера меньше двух героев'
          : 'Правило 1 нарушено: барьер не пробить',
      message: ok
        ? `Лучшая стихия барьера — «${el}»: дают ${count} бойца, отряд набирает ${sum} из ${need}.`
        : covered
          ? `Стихию «${el}» дают ${count} боец(а), а правило просит не меньше ${PARTY_HEROES_PER_BARRIER_ELEMENT}; отряд набирает ${sum} из ${need} — порог закрыт, но запаса на смерть или замену героя нет.`
          : `Стихию «${el}» дают ${count} боец(а), а нужно не меньше ${PARTY_HEROES_PER_BARRIER_ELEMENT}: отряд набирает ${sum} из ${need} — этого мало. Добавьте героев этой стихии (камни их стихии) или чемпиона этой стихии.`,
      source: RULES_TEAM_URL,
    })
  }

  // Правило 2 — один чемпион на отряд.
  if (champions.length > PARTY_MAX_CHAMPIONS) {
    hints.push({
      code: 'champion-count',
      level: 'warn',
      title: 'Правило 2 нарушено: чемпионов больше одного',
      message: `В отряде ${champions.length} чемпиона — игра пускает в бой только одного (${champions.map((c) => c.name).join(', ')}).`,
      source: RULES_TEAM_URL,
    })
  } else if (champions.length === 0) {
    hints.push({
      code: 'champion-count',
      level: 'info',
      title: 'Правило 2: чемпиона нет',
      message: 'Правило допускает отряд без чемпиона, но чемпион усиливает весь отряд лидерским навыком — обычно его берут.',
      source: RULES_TEAM_URL,
    })
  } else {
    hints.push({
      code: 'champion-count',
      level: 'ok',
      title: 'Правило 2: один чемпион на отряд',
      message: `В отряде один чемпион — ${champions[0].name}.`,
      source: RULES_TEAM_URL,
    })
  }

  // Правило 3 — один «красный» (Fighter).
  const fighters = facts.filter((f) => f.group === 'Fighter')
  if (fighters.length < PARTY_FIGHTERS_MIN) {
    hints.push({
      code: 'fighter',
      level: 'warn',
      title: 'Правило 3 нарушено: в отряде нет «красного»',
      message: `Ни одного Fighter в отряде. Мало бойцов — берите чемпиона-бойца (${FIGHTER_CHAMPIONS.join('/')}) вместо танка-героя или добавьте бойца в состав.`,
      source: RULES_TEAM_URL,
      verifyChampions: [...FIGHTER_CHAMPIONS],
    })
  } else {
    hints.push({
      code: 'fighter',
      level: 'ok',
      title: 'Правило 3: «красный» (Fighter) в отряде есть',
      message: `Бойцы в отряде: ${fighters.map((f) => f.name).join(', ')}.`,
      source: RULES_TEAM_URL,
    })
  }

  // Правило 4 — остальные слоты «синие/зелёные».
  const supports = facts.filter((f) => f.group === 'Rogue' || f.group === 'Spellcaster')
  const rogues = facts.filter((f) => f.group === 'Rogue').length
  const casters = facts.filter((f) => f.group === 'Spellcaster').length
  if (heroes.length + champions.length > 0 && fighters.length > PARTY_FIGHTERS_MAX) {
    hints.push({
      code: 'support',
      level: 'warn',
      title: 'Правило 4 нарушено: «красных» больше одного',
      message: `Fighter в отряде ${fighters.length}, а остальные слоты по правилу занимают «синие/зелёные» (Rogue/Spellcaster): сейчас их ${supports.length} (разбойников ${rogues}, заклинателей ${casters}).`,
      source: RULES_TEAM_URL,
    })
  } else {
    const free = partySize != null ? Math.max(0, partySize - facts.length) : 0
    hints.push({
      code: 'support',
      level: 'ok',
      title: 'Правило 4: остальные слоты — «синие/зелёные»',
      message:
        `Разбойников ${rogues}, заклинателей ${casters}.` +
        (free > 0 ? ` Свободных мест в локации: ${free} — их лучше занять Rogue/Spellcaster.` : ''),
      source: RULES_TEAM_URL,
    })
  }
  return hints
}

/** Собирает совет по чемпиону из признаков героев (EVA после штрафа, крит, угроза, класс). */
function pairSuggestion(
  code: string,
  champions: readonly string[],
  heroes: PartyFighterFact[],
  reason: string,
  source: string,
  level: HintLevel = 'info',
): PartyHint | null {
  if (heroes.length === 0 || champions.length === 0) return null
  return {
    code,
    level,
    title: `Пара «чемпион ↔ герой»: ${champions.join(' / ')}`,
    message: `${heroes.map((h) => h.name).join(', ')} — ${reason}`,
    source,
    verifyChampions: [...champions],
  }
}

/** Советы «чемпион ↔ герой» по признакам героев отряда. */
export function championPairHints(
  facts: PartyFighterFact[],
  quest: Quest | null,
  data: GameData,
  championName: string | null = null,
): PartyHint[] {
  const hints: PartyHint[] = []
  const heroes = facts.filter((f) => !f.isChampion)
  const pct = (x: number): string => `${Math.round(x * 100)}%`
  const add = (s: PartyHint | null): void => {
    if (s) hints.push(s)
  }

  const sustain = heroes.filter((h) => h.evaAfterPenalty >= EVA_CHAMPION_SUSTAIN_MIN)
  add(pairSuggestion('pair-eva-sustain', [EVA_CHAMPION_SUSTAIN], sustain, `уклонение ${sustain.map((h) => pct(h.evaAfterPenalty)).join(', ')} — уже на пределе: нужен тот, кто вылечит и добавит HP и мана-щит`, RULES_TEAM_URL))

  const mid = heroes.filter((h) => h.evaAfterPenalty >= EVA_CHAMPION_MID_MIN && h.evaAfterPenalty < EVA_CHAMPION_SUSTAIN_MIN)
  add(pairSuggestion('pair-eva-mid', EVA_CHAMPIONS_MID, mid, `уклонение ${mid.map((h) => pct(h.evaAfterPenalty)).join(', ')} — до предела добирают +10–15% уклонения отряда и крит`, RULES_TEAM_URL))

  const yami = heroes.filter((h) => h.evaAfterPenalty >= EVA_CHAMPION_YAMI_MIN && h.evaAfterPenalty < EVA_CHAMPION_MID_MIN)
  add(pairSuggestion('pair-eva-yami', [EVA_CHAMPION_YAMI], yami, `уклонение ${yami.map((h) => pct(h.evaAfterPenalty)).join(', ')}: +20% уклонения отряда (4-й ранг лидерского навыка) доводит до 95% — и штраф экстрима перестаёт мешать`, RULES_TEAM_URL))

  const critBuild = heroes.filter((h) => h.crit >= CRIT_BUILD_MIN && h.defensiveSkills === 0)
  add(pairSuggestion('pair-crit', CRIT_CHAMPIONS, critBuild, `крит ${critBuild.map((h) => pct(h.crit)).join(', ')} без защитных навыков: Rudo даёт крит отряду на несколько раундов, Bjorn — крит-урон; самому герою нужна защита, иначе он не доживёт до своих критов`, RULES_TEAM_URL))

  // Класс героя → чемпион по гайду Develion (Donovan — за разбойника, Lilu — с Wanderers, Polonia — с Tricksters).
  for (const [champion, classes] of Object.entries(CHAMPION_CLASS_PAIRS)) {
    const matched = heroes.filter((h) => classes.includes(h.className) || (h.group !== null && classes.includes(h.group)))
    add(pairSuggestion(`pair-class-${champion}`, [champion], matched, `класс из связки гайда Develion (${classes.join('/')}): лидерский навык ${champion} усиливает именно таких героев`, RULES_DEVELION_URL))
  }

  // Сильные и слабые герои: Sia приносит добычу, когда герои тянут бой сами; Argon вытягивает слабых.
  if (heroes.length > 1) {
    const avg = heroes.reduce((a, h) => a + h.attackPower, 0) / heroes.length
    const strong = heroes.filter((h) => h.attackPower >= avg * 1.2)
    const weak = heroes.filter((h) => h.attackPower <= avg * 0.8)
    add(pairSuggestion('pair-strong-sia', ['Sia'], strong, 'заметно сильнее остальных отряда — бой вытянут и без поддержки, а Sia принесёт компоненты', RULES_TEAM_URL))
    add(pairSuggestion('pair-weak-argon', ['Argon'], weak, 'заметно слабее остальных отряда — Argon (+ATK и DEF всему отряду) помогает слабым героям больше', RULES_TEAM_URL))
  }

  // Барьер: бонус чемпиона к стихии отряда (Rudo) — «позволяет пробить барьер одним героем».
  if (quest?.barrier) {
    const bonusChampions = data.champions
      .filter((c) => c.leaderSkills.some((id) => BARRIER_BONUS_SKILL_RE.test(data.skills.find((s) => s.id === id)?.text ?? '')))
      .map((c) => c.name)
    // Барьер пробивает любая ОДНА из его стихий (A9) — берём лучшую, а не сумму по всем стихиям
    // (иначе Spellblade с «любой» стихией засчитался бы в каждую).
    const have = Math.max(0, ...quest.barrier.elements.map((el) => facts.reduce((a, f) => a + (f.elementValues[el] ?? 0), 0)))
    if (bonusChampions.length > 0 && have < quest.barrier.hp) {
      hints.push({
        code: 'pair-barrier-rudo',
        level: 'info',
        title: `Пара «чемпион ↔ барьер»: ${bonusChampions.join(' / ')}`,
        message: `Отряд набирает ${Math.round(have)} из ${quest.barrier.hp} — чемпион с «+50% party Element bonus VS Elemental Barriers» умножает стихию отряда на 1,5 (у Rudo это награда 7-го ранга, «Berserker Rampage»), и барьер пробивается меньшим числом героев.`,
        source: RULES_TEAM_URL,
        verifyChampions: bonusChampions,
      })
    }
  }

  // Боссы: у Ashley бонусы удваиваются — по гайду она сильнее Argon на боссах и мини-боссах.
  if (quest?.variant === 'boss') {
    hints.push({
      code: 'pair-boss-ashley',
      level: 'info',
      title: 'Пара «чемпион ↔ босс»: Ashley',
      message: 'Квест боссовый: бонусы Ashley удваиваются против боссов, поэтому на боссах она сильнее Argon.',
      source: RULES_DEVELION_URL,
      verifyChampions: ['Ashley'],
    })
  }

  // Угроза: босс бьёт по самой «громкой» цели — она должна быть танком, а не хрупким героем.
  const top = [...heroes].sort((a, b) => b.threatShare - a.threatShare)[0]
  if (top && quest && top.threatShare >= THREAT_SHARE_WARN) {
    const p70 = quest.defCaps?.p70 ?? null
    const squishy = p70 !== null && top.def < p70
    hints.push({
      code: 'pair-threat',
      level: squishy ? 'warn' : 'info',
      title: 'Угроза: удары босса идут в одну цель',
      message: squishy
        ? `По ${top.name} приходит ${Math.round(top.threatShare * 100)}% ударов, а его DEF ${Math.round(top.def)} ниже порога 70% (${p70}) — он получает почти полный урон. Передайте угрозу танку (Chieftain и подобные бойцы) или поднимите ему DEF.`
        : `По ${top.name} приходит ${Math.round(top.threatShare * 100)}% ударов — это самая «громкая» цель отряда; держите его защиту не ниже порога 70% квеста.`,
      source: RULES_TEAM_URL,
    })
  }

  // Чемпионы, которым важно выжить: им нужен боец с высокой угрозой, который примет удары.
  if (championName && SURVIVE_CHAMPIONS.includes(championName)) {
    const tough = [...heroes].sort((a, b) => b.threatShare - a.threatShare)[0]
    hints.push({
      code: 'pair-survive',
      level: 'info',
      title: `Угроза: ${championName} должен выжить`,
      message:
        `${championName} приносит добычу, только если выживет. Дайте отряду бойца с высокой угрозой (например, Chieftain), чтобы удары шли в него, и не ставьте чемпиона в отряд без такого бойца.` +
        (tough ? ` Сейчас больше всех ударов принимает ${tough.name} (${Math.round(tough.threatShare * 100)}%).` : ''),
      source: RULES_TEAM_URL,
    })
  }
  return hints
}

/** Все подсказки по составу отряда: правила 1–4 + пары «чемпион ↔ герой» + вердикт по текущему чемпиону. */
export function partyHints(
  members: TeamRunMember[],
  quest: Quest | null,
  data: GameData,
  opts: { maxPartySize?: number | null } = {},
): PartyHint[] {
  const facts = partyFacts(members, quest, data)
  const champion = facts.find((f) => f.isChampion)?.name ?? null
  const rules = ruleHints(facts, quest, opts.maxPartySize ?? null)
  const pairs = championPairHints(facts, quest, data, champion)
  const out = [...rules, ...pairs]
  if (champion) {
    const fitting = pairs.find((h) => h.verifyChampions?.includes(champion))
    const suggested = pairs.flatMap((h) => h.verifyChampions ?? []).filter((n) => n !== champion)
    out.push(
      fitting
        ? { code: 'champion-fit', level: 'ok', title: `Чемпион ${champion} подходит отряду`, message: fitting.message, source: fitting.source }
        : {
            code: 'champion-fit',
            level: 'info',
            title: `Чемпион ${champion} не назван в советах под признаки героев`,
            message: suggested.length > 0 ? `По признакам героев советуют ${[...new Set(suggested)].join('/')} — сравните симуляцией, прежде чем менять.` : 'Признаков героев, под которые советуют другого чемпиона, не нашлось — состав можно проверять прогоном.',
            source: RULES_TEAM_URL,
            verifyChampions: [...new Set(suggested)],
          },
    )
  }
  return out
}

