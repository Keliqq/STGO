/**
 * Монте-Карло-симулятор боя отряда с монстром квеста.
 *
 * Формулы — ST-Central Combat Compendium (https://st-central.net/combat-compendium/, A30):
 *   · враг бьёт первым; порядок ходов отряда: 3 слота — средний → левый → правый,
 *     4 слота — средний-левый → крайний левый → крайний правый → средний-правый;
 *   · урон героя = ATK в бою (у монстров нет DEF); крит ×CritDmg;
 *   · урон врага = Monster DMG × множитель по DEF (1.5× при 0 → 0.25× на пороге 75%, между порогами линейно);
 *     крит врага ~10% ×1.5 от базового урона; AoE — по всем, отдельный урон Monster AOE DMG;
 *   · цель врага выбирается с вероятностью threat / Σ threat; EVA — шанс полного уклонения;
 *   · стихийный барьер: не пробит → урон отряда ×BARRIER_UNBROKEN_DMG_FACTOR (A9);
 *   · Extreme: штраф уклонения (A34); мана-щит гасит урон и восстанавливается после
 *     MANA_SHIELD_RECHARGE_ROUNDS раундов без урона (A32).
 * Особые механики навыков (выжить смертельный удар, лечение за раунд, рипост после уклонения,
 * «щит» лорда, серия критов, угроза→ATK, лидерские ауры, эскалация по HP, казнь цели, вторая попытка,
 * DEF щита в ATK, дренаж, случайный бонус, «+N% к эффектам чемпиона») — parseSpecials + общий движок эффектов.
 *
 * Детерминизм: свой mulberry32, seed на прогон = seed + номер прогона. Никакого Math.random.
 */
import type { Champion, ClassGroup, DefCaps, Element, GameData, HeroInstance, Quest, Skill, SkillEffect } from '../data/types.ts'
import {
  AOE_CHANCE,
  BARRIER_UNBROKEN_DMG_FACTOR,
  DEFAULT_SIM_RUNS,
  DEF_MITIGATION,
  ENEMY_CRIT_CHANCE,
  ENEMY_CRIT_MULT,
  ENEMY_DMG_MAX_FACTOR,
  EXTREME_EVA_PENALTY,
  MANA_SHIELD_RECHARGE_ROUNDS,
  MAX_EVASION,
  MAX_ROUNDS,
  RANDOM_BONUS_EXPECTED_FACTOR,
  THREAT_ATTACK_MULTIPLIER_DIVISOR,
} from './constants.ts'
import { activeSkills, calcStats, effectiveClass, heroElementValue, type CalcOptions } from './stats.ts'

/** Детерминированный PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Параметры боя, которые в игре не подтверждены напрямую и потому переопределяемы:
 * анализ чувствительности и калибровка по отметкам «проходит / не проходит» (src/engine/calibration.ts).
 * По умолчанию — константы из constants.ts; тесты и скрипт калибровки передают свои значения.
 */
export interface CombatModel {
  /** Снижение урона врага на порогах 50/70/75% DEF (A30). */
  mitigation?: { at50: number; at70: number; at75: number }
  /** Максимальный множитель урона врага при DEF = 0 (A30). */
  enemyDmgMaxFactor?: number
  /** Шанс крита врага (A30). */
  enemyCritChance?: number
  /** Шанс AoE-атаки врага (A31). */
  aoeChance?: number
  /** Множитель урона отряда при непробитом барьере (A9). */
  barrierUnbrokenFactor?: number
}

/** Параметры боя с подставленными значениями по умолчанию. */
export interface ResolvedCombatModel {
  mitigation: { at50: number; at70: number; at75: number }
  enemyDmgMaxFactor: number
  enemyCritChance: number
  aoeChance: number
  barrierUnbrokenFactor: number
}

export function resolveCombatModel(m: CombatModel = {}): ResolvedCombatModel {
  return {
    mitigation: m.mitigation ?? DEF_MITIGATION,
    enemyDmgMaxFactor: m.enemyDmgMaxFactor ?? ENEMY_DMG_MAX_FACTOR,
    enemyCritChance: m.enemyCritChance ?? ENEMY_CRIT_CHANCE,
    aoeChance: m.aoeChance ?? AOE_CHANCE,
    barrierUnbrokenFactor: m.barrierUnbrokenFactor ?? BARRIER_UNBROKEN_DMG_FACTOR,
  }
}

/**
 * Множитель урона врага по DEF цели (A30): 1.5× при DEF=0, 1.0× на половине порога 50%,
 * 0.5× / 0.3× / 0.25× на порогах 50/70/75%, между ними линейно; выше порога 75% — 0.25×.
 * Без порогов (defCaps = null, A10) — 1.0 (никакого снижения).
 * `model` — переопределение кривой (анализ чувствительности A57), по умолчанию константы.
 */
export function damageFactor(def: number, caps: DefCaps | null, model: ResolvedCombatModel = resolveCombatModel()): number {
  if (!caps || caps.p50 <= 0) return 1
  const mit = model.mitigation
  const pts: [number, number][] = [
    [0, model.enemyDmgMaxFactor],
    [caps.p50 / 2, 1],
    [caps.p50, mit.at50],
    [caps.p70, mit.at70],
    [caps.p75, mit.at75],
  ]
  if (def >= caps.p75) return mit.at75
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (def <= x1) return x1 === x0 ? y1 : y0 + ((def - x0) * (y1 - y0)) / (x1 - x0)
  }
  return mit.at75
}

/** Порядок ходов отряда (Compendium): 3 — средний→левый→правый; 4 — ср-левый→крайний левый→крайний правый→ср-правый. */
// ASSUMPTION: A33 — для 5 слотов (LCOG) порядок в источнике не указан: от центра, сначала влево.
export function turnOrderFor(n: number): number[] {
  if (n === 3) return [1, 0, 2]
  if (n === 4) return [1, 0, 3, 2]
  const mid = Math.floor((n - 1) / 2)
  const out = [mid]
  for (let d = 1; out.length < n; d++) {
    if (mid - d >= 0) out.push(mid - d)
    if (mid + d < n) out.push(mid + d)
  }
  return out.slice(0, n)
}

/** Боец: готовый набор статов + активные навыки (ступени уже вычислены). */
export interface Fighter {
  name: string
  atk: number
  def: number
  hp: number
  manaShield: number
  /** Доли: 0.05 = 5%. */
  crit: number
  /** Множитель: 2 = ×2. */
  critDmg: number
  eva: number
  threat: number
  /** Вклад в стихийный барьер: стихия → величина (отображаемая, с духами A29). */
  elements: Partial<Record<Element, number>>
  /** Сумма камней любой стихии (для «Any» — Spellblade). */
  elementAny: number
  /** «Can use any element, but only counts as N% against Elemental Barriers» (0 — не Any). */
  barrierAnyPct: number
  /**
   * «Equipped Shield's DEF is added to ATK» (Velite/Praetorian): DEF-вклад щита, прибавленный к ATK.
   * Считается в fighterFromHero (нужна экипировка), в бою просто прибавляется к ATK.
   */
  atkFromShieldDef?: number
  group?: ClassGroup
  isChampion?: boolean
  skills: Skill[]
  /**
   * Внешняя правка статов (веса статов, семена силы) — уже применена к полям выше,
   * здесь хранится только её «хвост», который бой читает отдельно: прибавка к максимуму HP
   * и к уклонению в tryHit. См. FighterBonus / applyFighterBonus.
   */
  bonus?: FighterBonus
}

/**
 * Внешняя правка статов бойца — «а что если добавить герою N стата». Нужна там, где статы
 * нельзя выразить экипировкой: веса статов (src/engine/statWeights.ts) и совет по семенам силы.
 * Поля трактуются как в эффектах навыков: atk/def — плоская прибавка к стату (то есть «+5% ATK»
 * = 0.05 × текущий ATK), hp — плоская прибавка к максимуму HP, crit/eva/critDmg — прибавка к доле
 * или множителю, threat — плоская, elementAll — величина стихии в стихии героя (для барьера).
 */
export interface FighterBonus {
  atk?: number
  def?: number
  hp?: number
  crit?: number
  eva?: number
  critDmg?: number
  threat?: number
  /** Прибавка к стихии героя (в его собственной стихии). */
  element?: number
}

/** Есть ли в бонусе хоть что-то ненулевое. */
export function hasBonus(b: FighterBonus | undefined | null): boolean {
  if (!b) return false
  return Object.values(b).some((v) => (v ?? 0) !== 0)
}

/** Боец с применённым бонусом (исходный объект не мутируется). */
export function applyFighterBonus(f: Fighter, b: FighterBonus): Fighter {
  if (!hasBonus(b)) return f
  const elements = { ...f.elements }
  if (b.element) {
    // Стихия бойца — его собственная (у «Any»-классов она пустая: стихию задаёт камень, см. stats.ts).
    const own = (Object.keys(elements) as Element[])[0]
    if (own) elements[own] = (elements[own] ?? 0) + b.element
  }
  return {
    ...f,
    atk: f.atk + (b.atk ?? 0),
    def: f.def + (b.def ?? 0),
    hp: f.hp + (b.hp ?? 0),
    crit: f.crit + (b.crit ?? 0),
    eva: f.eva + (b.eva ?? 0),
    critDmg: f.critDmg + (b.critDmg ?? 0),
    threat: f.threat + (b.threat ?? 0),
    elements,
    bonus: b,
  }
}

/** Особые боевые механики, собранные со всех навыков бойца. */
export interface CombatSpecials {
  /** «N% chance to survive one fatal blow» — один раз за бой. */
  survivePct: number
  /** «Heal N HP each turn» — себе. */
  healSelf: number
  /** «Heals party by N HP each turn» — на всех (суммируется по носителям). */
  healParty: number
  /** «Guarantees a Critical Hit after dodging an attack» (Dancer/Acrobat). */
  riposte: boolean
  /** «+N% more critical damage per consecutive critical hits. Stacks M times» (Conquistador). */
  consecCritPct: number
  consecCritMax: number
  /** «Protect an ally from a Lethal attack once per battle» (Lord). */
  lethalProtect: boolean
  /** «+N% of total Threat is added as an attack multiplier» (Chieftain). */
  threatAtkPct: number
  /** «+N% party Element bonus VS Elemental Barriers» (Rudo). */
  elemBarrierBonusPct: number
  /** «Can use any element, but only counts as N% against Elemental Barriers» (Spellblade). */
  anyElementPct: number
  /** «…first attack is always a critical hit…» / «Guaranteed evasion and critical hit on the first round» (Samurai). */
  firstRoundCrit: boolean
  /** «Evasion is set to N%» (артефакты-переопределения). */
  evaSet: number | null
  /** «Critical Hit Chance is set to N% and cannot change». */
  critSet: number | null
  /**
   * «Effect is doubled when below X% HP and tripled when below Y% HP» (Berserker/Jarl):
   * условные эффекты этого навыка усиливаются по HP владельца.
   */
  hpEscalation: { doubleBelow: number; tripleBelow: number } | null
  /** «Regain bonuses after N rounds» (Sensei/Ninja-промоушен): снимает «until damaged» после N раундов без урона. */
  regainAfterRounds: number
  /** «Upon striking, defeat any enemy below N% HP» (Dark Knight/Death Knight). */
  executeBelowPct: number
  /** Есть ли «immediate second attempt at the quest» (Chronomancer/Fateweaver). */
  secondAttempt: boolean
  /** Бонус к ATK отряда во второй попытке, % (`+15% power bonus` у Fateweaver; 0 — без бонуса). */
  secondAttemptPowerPct: number
  /** «Equipped Shield's DEF is added to ATK» (Velite/Praetorian). */
  shieldDefToAtk: boolean
  /** «Each turn, drain N% HP from all allies, healing herself for the total amount» (Hemma). */
  drain: { pct: number; atkBonusPct: number } | null
  /** «Highly random attack bonus for the party, up to +N%» (Tamas) — берём матожидание (A43). */
  randomPartyAtkUpToPct: number
  /** «+N% increased effect received from Champion skills» (Mercenary). */
  championSkillBoostPct: number
  /** «Guaranteed evasion … on the first round» (Daimyo): в 1-м раунде удары не проходят. */
  firstRoundEva: boolean
  /** «+N% to max Evasion» (Pathfinder/Insubstantial) — поднимает предел уклонения (A42). */
  maxEvaBonusPct: number
}

const SPECIAL_RE = {
  survive: /(\d+)% chance to survive one fatal blow/i,
  healParty: /heals? (?:the )?party by (\d+) hp each turn/i,
  healSelf: /\bheal (\d+) hp each turn/i,
  riposte: /guarantees a critical hit after dodging/i,
  consec: /\+(\d+)% more critical damage per consecutive critical hits\. stacks (\d+) times/i,
  protect: /protect an ally from a lethal attack once per battle/i,
  threatAtk: /(\d+)% of total threat is added as an attack multiplier/i,
  elemBonus: /\+(\d+)% party element bonus vs elemental barriers/i,
  anyElement: /only counts as (\d+)% against elemental barriers/i,
  firstCrit: /first attack is always a critical hit|guaranteed evasion and critical hit on the first round/i,
  firstRoundEva: /guaranteed evasion and critical hit on the first round/i,
  evaSet: /evasion is set to (\d+)%/i,
  critSet: /critical hit chance is set to (\d+)% and cannot change/i,
  doubledVsBoss: /bonuses are doubled against bosses/i,
  hpEscalation: /effect is doubled when below (\d+)% hp and tripled when below (\d+)% hp/i,
  regain: /regain bonuses after (\d+) rounds?/i,
  execute: /upon striking, defeat any enemy below (\d+)% hp/i,
  secondAttempt: /allows an immediate second attempt at the quest(?:,? with a \+(\d+)% power bonus)?/i,
  shieldDefToAtk: /equipped shield's def is added to atk/i,
  drainPct: /each turn, drain (\d+)% hp from all allies/i,
  drainAtk: /attack increases by the (?:total )?amount of hp drained plus (\d+)%/i,
  randomPartyAtk: /highly random attack bonus for the party, up to \+(\d+)%/i,
  championBoost: /\+(\d+)% increased effect received from champion skills/i,
  maxEva: /\+(\d+)% to max evasion/i,
} as const

export function parseSpecials(skills: Skill[]): CombatSpecials {
  const s: CombatSpecials = {
    survivePct: 0, healSelf: 0, healParty: 0, riposte: false,
    consecCritPct: 0, consecCritMax: 0, lethalProtect: false, threatAtkPct: 0,
    elemBarrierBonusPct: 0, anyElementPct: 0, firstRoundCrit: false, evaSet: null, critSet: null,
    hpEscalation: null, regainAfterRounds: 0, executeBelowPct: 0, secondAttempt: false,
    secondAttemptPowerPct: 0, shieldDefToAtk: false, drain: null, randomPartyAtkUpToPct: 0,
    championSkillBoostPct: 0, firstRoundEva: false, maxEvaBonusPct: 0,
  }
  let drainPct = 0
  let drainAtkPct = 0
  for (const sk of skills) {
    const t = sk.text
    s.survivePct = Math.max(s.survivePct, num(t, SPECIAL_RE.survive))
    s.healParty += num(t, SPECIAL_RE.healParty)
    s.healSelf += num(t, SPECIAL_RE.healSelf)
    if (SPECIAL_RE.riposte.test(t)) s.riposte = true
    const m = t.match(SPECIAL_RE.consec)
    if (m) {
      s.consecCritPct = Math.max(s.consecCritPct, Number(m[1]))
      s.consecCritMax = Math.max(s.consecCritMax, Number(m[2]))
    }
    if (SPECIAL_RE.protect.test(t)) s.lethalProtect = true
    s.threatAtkPct = Math.max(s.threatAtkPct, num(t, SPECIAL_RE.threatAtk))
    s.elemBarrierBonusPct = Math.max(s.elemBarrierBonusPct, num(t, SPECIAL_RE.elemBonus))
    s.anyElementPct = Math.max(s.anyElementPct, num(t, SPECIAL_RE.anyElement))
    if (SPECIAL_RE.firstCrit.test(t)) s.firstRoundCrit = true
    if (SPECIAL_RE.firstRoundEva.test(t)) s.firstRoundEva = true
    if (SPECIAL_RE.evaSet.test(t)) s.evaSet = num(t, SPECIAL_RE.evaSet) / 100
    if (SPECIAL_RE.critSet.test(t)) s.critSet = num(t, SPECIAL_RE.critSet) / 100
    // Эскалация по HP: «doubled below X%, tripled below Y%» — из двух порогов берём самые строгие.
    const esc = t.match(SPECIAL_RE.hpEscalation)
    if (esc) {
      const doubleBelow = Number(esc[1])
      const tripleBelow = Number(esc[2])
      const prev = s.hpEscalation
      s.hpEscalation = prev
        ? { doubleBelow: Math.max(prev.doubleBelow, doubleBelow), tripleBelow: Math.max(prev.tripleBelow, tripleBelow) }
        : { doubleBelow, tripleBelow }
    }
    s.regainAfterRounds = Math.max(s.regainAfterRounds, num(t, SPECIAL_RE.regain))
    s.executeBelowPct = Math.max(s.executeBelowPct, num(t, SPECIAL_RE.execute))
    if (SPECIAL_RE.secondAttempt.test(t)) {
      s.secondAttempt = true
      s.secondAttemptPowerPct = Math.max(s.secondAttemptPowerPct, num(t, SPECIAL_RE.secondAttempt))
    }
    if (SPECIAL_RE.shieldDefToAtk.test(t)) s.shieldDefToAtk = true
    drainPct = Math.max(drainPct, num(t, SPECIAL_RE.drainPct))
    drainAtkPct = Math.max(drainAtkPct, num(t, SPECIAL_RE.drainAtk))
    s.randomPartyAtkUpToPct = Math.max(s.randomPartyAtkUpToPct, num(t, SPECIAL_RE.randomPartyAtk))
    s.championSkillBoostPct = Math.max(s.championSkillBoostPct, num(t, SPECIAL_RE.championBoost))
    s.maxEvaBonusPct = Math.max(s.maxEvaBonusPct, num(t, SPECIAL_RE.maxEva))
  }
  if (drainPct > 0) s.drain = { pct: drainPct, atkBonusPct: drainAtkPct }
  return s
}

const num = (text: string, re: RegExp): number => Number(text.match(re)?.[1] ?? 0)

export function isDoubledVsBoss(skill: Skill): boolean {
  return SPECIAL_RE.doubledVsBoss.test(skill.text)
}

/** Боец из героя пользователя (ступени навыков — по стихии без духов, A29). */
export function fighterFromHero(hero: HeroInstance, data: GameData, options: CalcOptions = {}): Fighter {
  const stats = calcStats(hero, data, options)
  const ev = heroElementValue(hero, data)
  const cls = effectiveClass(hero, data)
  const skills = activeSkills(hero, data, ev.elementStones)
  const specials = parseSpecials(skills)
  const elements: Partial<Record<Element, number>> = {}
  if (cls && cls.element !== 'Any' && ev.element > 0) elements[cls.element] = ev.element
  // ASSUMPTION: A45 — «Equipped Shield's DEF is added to ATK» (Velite/Praetorian): берём DEF-вклад
  // щита из разбивки (с качеством, камнем, духом и бонусами предмета) и прибавляем к ATK.
  let atkFromShieldDef = 0
  if (specials.shieldDefToAtk) {
    for (const c of stats.breakdown.items) {
      const it = data.items.find((x) => x.name === c.item)
      if (it?.type === 'Shield') atkFromShieldDef += c.total.def
    }
  }
  return {
    name: hero.name,
    atk: stats.atk, def: stats.def, hp: stats.hp, manaShield: stats.manaShield,
    crit: stats.crit, critDmg: stats.critDmg, eva: stats.eva, threat: stats.threat,
    elements, elementAny: ev.elementAny, barrierAnyPct: specials.anyElementPct,
    atkFromShieldDef, group: cls?.group, skills,
  }
}

/** Боец-чемпион: база + награды рангов (накопительно, A14), стихия по Element Breakpoints (A13), лидерский навык по рангу. */
export function fighterFromChampion(champion: Champion, rank: number, data: GameData): Fighter {
  let hp = champion.base.hp
  let atk = champion.base.atk
  let def = champion.base.def
  let leader: Skill | undefined
  for (const r of champion.ranks) {
    if (r.rank > rank) continue
    if (r.reward) {
      hp += r.reward.hp
      atk += r.reward.atk
      def += r.reward.def
    }
    if (r.leaderSkill) leader = findSkill(data, r.leaderSkill) ?? leader
  }
  if (!leader && champion.leaderSkills.length > 0) leader = data.skills.find((s) => s.id === champion.leaderSkills[0])
  const skills = leader ? [leader] : []
  let elementValue = 0
  for (const bp of data.championElementBreakpoints) if (bp.rank <= rank && bp.value != null) elementValue = Math.max(elementValue, bp.value)
  const specials = parseSpecials(skills)
  return {
    name: champion.name,
    atk, def, hp, manaShield: 0,
    crit: champion.base.crit, critDmg: champion.base.critDmg, eva: champion.base.eva, threat: champion.base.threat,
    elements: elementValue > 0 ? { [champion.element]: elementValue } : {},
    elementAny: 0, barrierAnyPct: specials.anyElementPct,
    group: champion.group, isChampion: true, skills,
  }
}

function findSkill(data: GameData, idOrName: string): Skill | undefined {
  return data.skills.find((s) => s.id === idOrName) ?? data.skills.find((s) => s.name === idOrName)
}

/** Пробит ли барьер: хотя бы по одной из стихий барьера суммарная стихия отряда ≥ Barrier Health (A9). */
export function barrierBroken(fighters: Fighter[], quest: Quest, partyElementBonusPct = 0): boolean {
  if (!quest.barrier) return true
  const bonus = 1 + partyElementBonusPct / 100
  for (const el of quest.barrier.elements) {
    let v = 0
    for (const f of fighters) v += (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100)
    if (v * bonus >= quest.barrier.hp) return true
  }
  return false
}

// ─────────────────────────── симуляция ───────────────────────────

export interface SimOptions {
  /** Базовый seed; прогон r использует seed + r. */
  seed?: number
  runs?: number
  maxRounds?: number
  /** Принудительно включить экстрим-штраф уклонения; по умолчанию — quest.difficulty === 'Extreme'. */
  extreme?: boolean
  enemyCritChance?: number
  aoeChance?: number
  /** Переопределение кривой защиты и барьера (анализ чувствительности A57). */
  model?: CombatModel
  onProgress?: (done: number, total: number) => void
  shouldCancel?: () => boolean
}

export interface HeroSurvival {
  name: string
  /** Доля прогонов, где боец выжил. */
  rate: number
}

export interface SimMetrics {
  runs: number
  winRate: number
  avgRounds: number
  survival: HeroSurvival[]
  avgDamagePerRound: number
  /**
   * Средний по прогонам минимальный % HP среди выживших бойцов в конце боя (0 — если не выжил никто).
   * Третий тай-брейк оптимизатора (win rate → раунды → этот показатель → урон/раунд).
   */
  avgMinSurvivorHpPct: number
}

interface Mods {
  atkPct: number
  defPct: number
  atkFlat: number
  defFlat: number
  eva: number
  crit: number
  critDmg: number
}
const emptyMods = (): Mods => ({ atkPct: 0, defPct: 0, atkFlat: 0, defFlat: 0, eva: 0, crit: 0, critDmg: 0 })

interface EffectRef {
  e: SkillEffect
  /** Удвоить значение («Bonuses are doubled against bosses», бой с боссом). */
  dbl: boolean
}

interface CondRef extends EffectRef {
  /** Для perPartyMember — множитель значения. */
  perGroup?: ClassGroup
  /** Эскалация по HP владельца (Berserker/Jarl): ×2/×3 при низком HP. */
  esc?: { doubleBelow: number; tripleBelow: number }
  /** Эффект пришёл от лидерского навыка чемпиона (для «+N% increased effect received from Champion skills»). */
  fromChampion?: boolean
  /** Усиление эффектов чемпиона у получателя (Mercenary, ×1.25 — уже как множитель). */
  champBoost?: number
}

interface CondCtx {
  round: number
  selfHpFrac: number
  enemyHpFrac: number
  isBoss: boolean
  damagedBefore: boolean
  groupCounts: Record<ClassGroup, number>
}

function condOk(c: SkillEffect['condition'], ctx: CondCtx): boolean {
  if (!c) return true
  switch (c.kind) {
    case 'itemType':
    case 'lcogItem':
    case 'innateElementItem':
    case 'enchantedItem':
      return false // стат-уровень, уже учтён в calcStats
    case 'firstRound':
      return ctx.round === 1
    case 'rounds':
      return ctx.round <= c.rounds
    case 'selfHpBelow':
      return ctx.selfHpFrac < c.pct / 100
    case 'enemyHpBelow':
      return ctx.enemyHpFrac < c.pct / 100
    case 'vsBoss':
      return ctx.isBoss
    case 'untilDamaged':
      return !ctx.damagedBefore
    case 'perPartyMember':
      return true
  }
}

/** Множитель эскалации по HP владельца: 0–X% → ×3, X–Y% → ×2, иначе ×1 (Berserker/Jarl). */
function escalationMult(esc: CondRef['esc'], selfHpFrac: number): number {
  if (!esc) return 1
  const pct = selfHpFrac * 100
  if (pct < esc.tripleBelow) return 3
  if (pct < esc.doubleBelow) return 2
  return 1
}

function applyEffect(m: Mods, ref: EffectRef, valueMult = 1): void {
  const e = ref.e
  const v = e.value * (ref.dbl ? 2 : 1) * valueMult
  switch (e.stat) {
    case 'atk':
      if (e.mode === 'pct') m.atkPct += v / 100
      else m.atkFlat += v
      break
    case 'def':
      if (e.mode === 'pct') m.defPct += v / 100
      else m.defFlat += v
      break
    case 'hp':
    case 'manaShield':
    case 'threat':
    case 'xp':
    case 'itemStats':
      break // hp/mana — в maxHp/manaMax на подготовлении; threat — уже в статах; остальное не для боя
    case 'eva':
      m.eva += v / 100
      break
    case 'crit':
      m.crit += v / 100
      break
    case 'critDmg':
      m.critDmg += v / 100
      break
  }
}

export interface Prepared {
  fighters: Fighter[]
  specials: CombatSpecials[]
  maxHp: number[]
  manaMax: number[]
  selfStatic: Mods[]
  selfCond: CondRef[][]
  partyCond: CondRef[]
  order: number[]
  barrierBroken: boolean
  partyHeal: number
  extreme: boolean
  maxRounds: number
  enemyCritChance: number
  aoeChance: number
  /** Кривая защиты, множитель при DEF=0 и урон непробитого барьера (параметры калибровки A57). */
  combat: ResolvedCombatModel
  groupCounts: Record<ClassGroup, number>
  /** Предел уклонения отряда (A42): MAX_EVASION + «+N% to max Evasion» носителей. */
  evaCap: number
  /** Вторая попытка при поражении (Chronomancer/Fateweaver), null — её нет. */
  secondAttempt: { powerBonusPct: number } | null
}

/** Состояние симуляции до прогонов — переиспользуется score.ts для аналитической оценки. */
export function prepare(fighters: Fighter[], quest: Quest, opts: SimOptions): Prepared {
  const isBoss = quest.variant === 'boss'
  const specials = fighters.map((f) => parseSpecials(f.skills))
  const groupCounts: Record<ClassGroup, number> = { Fighter: 0, Rogue: 0, Spellcaster: 0 }
  for (const f of fighters) if (f.group) groupCounts[f.group]++

  // Скоуп party: статика раскладывается по всем бойцам, условные — в общий список.
  const partyRefs: CondRef[] = []
  const selfRefs: CondRef[][] = fighters.map(() => [])
  fighters.forEach((f, i) => {
    for (const sk of f.skills) {
      const dbl = isBoss && isDoubledVsBoss(sk)
      const esc = specials[i].hpEscalation ?? undefined
      const fromChampion = f.isChampion === true || sk.type === 'Leader'
      for (const e of sk.effects) {
        const ref: CondRef = {
          e,
          dbl,
          perGroup: e.condition?.kind === 'perPartyMember' ? e.condition.group : undefined,
          // Эскалация относится к условным эффектам навыка (Berserker/Jarl: «effect is doubled below 50% HP»).
          esc: e.condition ? esc : undefined,
          fromChampion,
        }
        if (e.scope === 'party') partyRefs.push(ref)
        else selfRefs[i].push(ref)
      }
    }
  })

  const selfStatic: Mods[] = []
  const selfCond: CondRef[][] = []
  const partyCond: CondRef[] = []
  const maxHp: number[] = []
  const manaMax: number[] = []
  // «Highly random attack bonus for the party, up to +N%» (Tamas): матожидание, одинаково всем бойцам (A43).
  const randomAtkPct = specials.reduce((a, s) => Math.max(a, s.randomPartyAtkUpToPct), 0) * RANDOM_BONUS_EXPECTED_FACTOR / 100

  fighters.forEach((f, i) => {
    const sm = emptyMods()
    sm.atkPct += randomAtkPct
    const cond: CondRef[] = []
    let hpPct = 0
    let hpFlat = 0
    let manaPct = 0
    let manaFlat = 0
    // «+N% increased effect received from Champion skills» (Mercenary): усиливает лидерские баффы у этого бойца.
    const champBoost = 1 + specials[i].championSkillBoostPct / 100
    const acc = (ref: EffectRef, mult = 1): void => {
      const e = ref.e
      const k = (ref.dbl ? 2 : 1) * mult
      if (e.stat === 'hp') {
        if (e.mode === 'pct') hpPct += (e.value * k) / 100
        else hpFlat += e.value * k
      } else if (e.stat === 'manaShield') {
        if (e.mode === 'pct') manaPct += (e.value * k) / 100
        else manaFlat += e.value * k
      } else applyEffect(sm, ref, mult)
    }
    for (const ref of selfRefs[i]) {
      if (ref.e.condition) cond.push(ref)
      else acc(ref)
    }
    for (const ref of partyRefs) {
      const mult = ref.fromChampion === true ? champBoost : 1
      // Условный party-эффект: копия с усилением (объект ref общий для всех бойцов — мутировать нельзя).
      if (ref.e.condition) partyCond.push(mult === 1 ? { ...ref } : { ...ref, champBoost: mult })
      else acc(ref, mult)
    }
    selfStatic.push(sm)
    selfCond.push(cond)
    // Внешняя правка HP (FighterBonus.hp) — плоская прибавка к максимуму, как «+N Health» навыка.
    const bonusHp = f.bonus?.hp ?? 0
    maxHp.push(Math.max(1, Math.floor((f.hp + bonusHp + hpFlat) * (1 + hpPct))))
    manaMax.push(Math.floor((f.manaShield + manaFlat) * (1 + manaPct)))
  })

  const partyHeal = specials.reduce((a, s) => a + s.healParty, 0)
  const elemBonus = specials.reduce((a, s) => Math.max(a, s.elemBarrierBonusPct), 0)
  const retry = specials.find((s) => s.secondAttempt)
  const combat = resolveCombatModel(opts.model)
  return {
    fighters,
    specials,
    maxHp,
    manaMax,
    selfStatic,
    selfCond,
    partyCond,
    order: turnOrderFor(fighters.length),
    barrierBroken: barrierBroken(fighters, quest, elemBonus),
    partyHeal,
    extreme: opts.extreme ?? quest.difficulty === 'Extreme',
    maxRounds: opts.maxRounds ?? MAX_ROUNDS,
    enemyCritChance: opts.enemyCritChance ?? combat.enemyCritChance,
    aoeChance: opts.aoeChance ?? combat.aoeChance,
    combat,
    groupCounts,
    evaCap: MAX_EVASION + specials.reduce((a, s) => Math.max(a, s.maxEvaBonusPct), 0) / 100,
    secondAttempt: retry ? { powerBonusPct: retry.secondAttemptPowerPct } : null,
  }
}

interface RunResult {
  win: boolean
  rounds: number
  alive: boolean[]
  dmgDealt: number
  /** Минимальный % HP среди выживших в конце боя (0 — не выжил никто). */
  minSurvivorHpFrac: number
}

/**
 * Один бой. При «immediate second attempt at the quest» (Chronomancer/Fateweaver) поражение
 * автоматически повторяется один раз — с бонусом к ATK, если он указан (A44).
 */
function runOnce(p: Prepared, quest: Quest, rng: () => number): RunResult {
  const first = runAttempt(p, quest, rng, 0)
  if (first.win || !p.secondAttempt) return first
  const second = runAttempt(p, quest, rng, p.secondAttempt.powerBonusPct)
  return {
    win: second.win,
    rounds: first.rounds + second.rounds,
    alive: second.alive,
    dmgDealt: first.dmgDealt + second.dmgDealt,
    minSurvivorHpFrac: second.minSurvivorHpFrac,
  }
}

/** @param powerBonusPct бонус к ATK отряда во второй попытке, % (0 — первая попытка). */
function runAttempt(p: Prepared, quest: Quest, rng: () => number, powerBonusPct: number): RunResult {
  const n = p.fighters.length
  const atkBonus = 1 + powerBonusPct / 100
  const hp = p.maxHp.slice()
  const mana = p.manaMax.slice()
  const alive = new Array<boolean>(n).fill(true)
  const damagedBefore = new Array<boolean>(n).fill(false)
  const noDmgRun = new Array<number>(n).fill(0)
  const hitThisRound = new Array<boolean>(n).fill(false)
  const riposteArmed = new Array<boolean>(n).fill(false)
  const consec = new Array<number>(n).fill(0)
  const surviveUsed = new Array<boolean>(n).fill(false)
  /** Накопленная прибавка к ATK от дренажа (Hemma): в плоских единицах. */
  const drainAtk = new Array<number>(n).fill(0)
  let protectLeft = p.specials.reduce((a, s) => a + (s.lethalProtect ? 1 : 0), 0)
  let monsterHp = quest.monsterHp
  let dmgDealt = 0
  let round = 1
  const mods = new Array<Mods>(n)

  const computeMods = (i: number, r: number, enemyHpFrac: number): Mods => {
    const m: Mods = { ...p.selfStatic[i] }
    const ctx: CondCtx = {
      round: r,
      selfHpFrac: hp[i] / p.maxHp[i],
      enemyHpFrac,
      isBoss: quest.variant === 'boss',
      damagedBefore: damagedBefore[i],
      groupCounts: p.groupCounts,
    }
    const mult = (ref: CondRef): number =>
      (ref.perGroup ? p.groupCounts[ref.perGroup] : 1) * (ref.champBoost ?? 1) * escalationMult(ref.esc, ctx.selfHpFrac)
    for (const ref of p.selfCond[i]) if (condOk(ref.e.condition, ctx)) applyEffect(m, ref, mult(ref))
    for (const ref of p.partyCond) if (condOk(ref.e.condition, ctx)) applyEffect(m, ref, mult(ref))
    return m
  }

  const minSurvivorHpFrac = (): number => {
    let m = Infinity
    for (let i = 0; i < n; i++) if (alive[i]) m = Math.min(m, hp[i] / p.maxHp[i])
    return m === Infinity ? 0 : m
  }

  const tryHit = (i: number, baseDmg: number): void => {
    if (!alive[i]) return
    const f = p.fighters[i]
    const sp = p.specials[i]
    const m = mods[i]
    // «Guaranteed evasion … on the first round» (Daimyo): в 1-м раунде удары не проходят вовсе.
    if (sp.firstRoundEva && round === 1) {
      if (sp.riposte) riposteArmed[i] = true
      return
    }
    let eva = sp.evaSet ?? f.eva + m.eva
    // Внешняя правка уклонения (веса статов): +N п.п. к шансу уклонения.
    eva += f.bonus?.eva ?? 0
    if (p.extreme) eva *= 1 - EXTREME_EVA_PENALTY
    // ASSUMPTION: A42 — уклонение ограничено пределом; «+N% to max Evasion» его поднимает.
    eva = Math.min(eva, p.evaCap + sp.maxEvaBonusPct / 100)
    if (eva >= 1 || rng() < eva) {
      if (sp.riposte) riposteArmed[i] = true
      return
    }
    const defEff = (f.def + m.defFlat) * (1 + m.defPct)
    let dmg = baseDmg * damageFactor(defEff, quest.defCaps, p.combat)
    if (rng() < p.enemyCritChance) dmg = Math.max(dmg, baseDmg) * ENEMY_CRIT_MULT
    if (mana[i] > 0) {
      const absorbed = Math.min(mana[i], dmg)
      mana[i] -= absorbed
      dmg -= absorbed
    }
    hitThisRound[i] = true
    damagedBefore[i] = true
    hp[i] -= dmg
    if (hp[i] <= 0) {
      if (protectLeft > 0 && !sp.lethalProtect) {
        protectLeft--
        hp[i] = 1
      } else if (!surviveUsed[i] && sp.survivePct > 0 && rng() * 100 < sp.survivePct) {
        surviveUsed[i] = true
        hp[i] = 1
      } else {
        alive[i] = false
        hp[i] = 0
      }
    }
  }

  for (round = 1; round <= p.maxRounds; round++) {
    const enemyHpFrac = monsterHp / quest.monsterHp
    for (let i = 0; i < n; i++) mods[i] = computeMods(i, round, enemyHpFrac)
    hitThisRound.fill(false)

    // — фаза монстра —
    const aliveIdx: number[] = []
    let threatSum = 0
    for (let i = 0; i < n; i++) if (alive[i]) { aliveIdx.push(i); threatSum += Math.max(0, p.fighters[i].threat) }
    if (aliveIdx.length === 0) return { win: false, rounds: round - 1, alive, dmgDealt, minSurvivorHpFrac: 0 }
    if (aliveIdx.length > 1 && rng() < p.aoeChance) {
      for (const i of aliveIdx) tryHit(i, quest.monsterAoe)
    } else {
      let roll = rng() * threatSum
      let target = aliveIdx[aliveIdx.length - 1]
      for (const i of aliveIdx) {
        roll -= Math.max(0, p.fighters[i].threat)
        if (roll <= 0) { target = i; break }
      }
      tryHit(target, quest.monsterDmg)
    }
    if (aliveIdx.every((i) => !alive[i])) return { win: false, rounds: round, alive, dmgDealt, minSurvivorHpFrac: 0 }

    // — фаза отряда —
    for (const i of p.order) {
      if (!alive[i]) continue
      const f = p.fighters[i]
      const sp = p.specials[i]
      const m = mods[i]
      // «Equipped Shield's DEF is added to ATK» (A45) и прибавка от дренажа (Hemma) — плоские.
      let atk = (f.atk + (f.atkFromShieldDef ?? 0) + drainAtk[i] + m.atkFlat) * (1 + m.atkPct) * atkBonus
      if (sp.threatAtkPct > 0) atk *= 1 + (sp.threatAtkPct / 100) * (f.threat / THREAT_ATTACK_MULTIPLIER_DIVISOR)
      const critChance = sp.critSet ?? f.crit + m.crit + (f.bonus?.crit ?? 0)

      let isCrit = false
      if (riposteArmed[i]) {
        isCrit = true
        riposteArmed[i] = false
      } else if (sp.firstRoundCrit && round === 1) {
        isCrit = true
      } else if (rng() < critChance) {
        isCrit = true
      }
      let dmg = atk
      if (isCrit) {
        dmg *= f.critDmg + m.critDmg + (f.bonus?.critDmg ?? 0) + consec[i] * (sp.consecCritPct / 100)
        consec[i] = Math.min(consec[i] + 1, sp.consecCritMax)
      } else consec[i] = 0
      const ignoreBarrier = sp.firstRoundCrit && round === 1 && isCrit // Iaido: крит игнорирует барьер
      if (!p.barrierBroken && !ignoreBarrier) dmg *= p.combat.barrierUnbrokenFactor
      monsterHp -= dmg
      dmgDealt += dmg
      // «Upon striking, defeat any enemy below N% HP» (Dark Knight/Death Knight).
      if (monsterHp > 0 && sp.executeBelowPct > 0 && monsterHp < (quest.monsterHp * sp.executeBelowPct) / 100) monsterHp = 0
      if (monsterHp <= 0) return { win: true, rounds: round, alive, dmgDealt, minSurvivorHpFrac: minSurvivorHpFrac() }
    }

    // — конец раунда: дренаж (Hemma), лечение и перезарядка мана-щита —
    // ASSUMPTION: A46 — «Attack increases by the total amount drained plus N% for each drain»:
    // прибавка = (слито за раунд) × (1 + N/100), накапливается по раундам. Дренаж не убивает (мин. 1 HP).
    for (let c = 0; c < n; c++) {
      const d = p.specials[c].drain
      if (!d || !alive[c]) continue
      let total = 0
      for (let i = 0; i < n; i++) {
        if (i === c || !alive[i]) continue
        const amount = Math.min(hp[i] - 1, (p.maxHp[i] * d.pct) / 100)
        if (amount <= 0) continue
        hp[i] -= amount
        total += amount
      }
      if (total > 0) {
        hp[c] = Math.min(p.maxHp[c], hp[c] + total)
        drainAtk[c] += total * (1 + d.atkBonusPct / 100)
      }
    }
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      const heal = p.specials[i].healSelf + p.partyHeal
      if (heal > 0) hp[i] = Math.min(p.maxHp[i], hp[i] + heal)
      if (hitThisRound[i]) noDmgRun[i] = 0
      else {
        noDmgRun[i]++
        // «Regain bonuses after N rounds» (Sensei): «until damaged» включается снова.
        const regain = p.specials[i].regainAfterRounds
        if (regain > 0 && noDmgRun[i] >= regain) damagedBefore[i] = false
        if (noDmgRun[i] >= MANA_SHIELD_RECHARGE_ROUNDS) mana[i] = p.manaMax[i]
      }
    }
  }
  return { win: false, rounds: p.maxRounds, alive, dmgDealt, minSurvivorHpFrac: minSurvivorHpFrac() }
}

/**
 * Доли атак монстра по каждому бойцу (в сумме 1): 20% ударов — AoE по всем живым,
 * остальные — одиночная цель с вероятностью threat / Σ threat (A30/A31).
 * Это ожидание до боя, поэтому «кто принимает удары» не зависит от исхода каждого прогона.
 */
export function threatShares(fighters: Fighter[], opts: { aoeChance?: number } = {}): number[] {
  const n = fighters.length
  if (n === 0) return []
  const aoe = opts.aoeChance ?? AOE_CHANCE
  // Один боец (или бой без AoE по механике) — все удары идут в него.
  if (n === 1) return [1]
  const sum = fighters.reduce((a, f) => a + Math.max(0, f.threat), 0)
  return fighters.map((f) => (1 - aoe) * (sum > 0 ? Math.max(0, f.threat) / sum : 1 / n) + aoe / n)
}

/** Вклад каждого бойца в каждую стихию барьера квеста: [герой][стихия] = величина. */
export function elementContributions(fighters: Fighter[], quest: Quest): { elements: Element[]; values: number[][] } {
  const elements = quest.barrier?.elements ?? []
  const values = fighters.map((f) => elements.map((el) => (f.elements[el] ?? 0) + f.elementAny * (f.barrierAnyPct / 100)))
  return { elements, values }
}

/** N прогонов Монте-Карло. Детерминированно: один и тот же seed → один и тот же результат. */
export function simulateTeam(fighters: Fighter[], quest: Quest, opts: SimOptions = {}): SimMetrics {
  const total = opts.runs ?? DEFAULT_SIM_RUNS
  const seed = (opts.seed ?? 1) >>> 0
  const p = prepare(fighters, quest, opts)
  let done = 0
  let wins = 0
  let roundsSum = 0
  let dmgSum = 0
  let minSurvSum = 0
  const aliveCount = new Array<number>(fighters.length).fill(0)
  for (let r = 0; r < total; r++) {
    if (r > 0 && opts.shouldCancel?.()) break
    const res = runOnce(p, quest, mulberry32(seed + r))
    done++
    if (res.win) wins++
    roundsSum += res.rounds
    dmgSum += res.dmgDealt
    minSurvSum += res.minSurvivorHpFrac
    res.alive.forEach((a, i) => {
      if (a) aliveCount[i]++
    })
    if (opts.onProgress && (r % 50 === 0 || r === total - 1)) opts.onProgress(r + 1, total)
  }
  return {
    runs: done,
    winRate: done > 0 ? wins / done : 0,
    avgRounds: done > 0 ? roundsSum / done : 0,
    survival: fighters.map((f, i) => ({ name: f.name, rate: done > 0 ? aliveCount[i] / done : 0 })),
    avgDamagePerRound: roundsSum > 0 ? dmgSum / roundsSum : 0,
    avgMinSurvivorHpPct: done > 0 ? minSurvSum / done : 0,
  }
}
