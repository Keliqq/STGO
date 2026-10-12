/**
 * Монте-Карло-симулятор боя отряда с монстром квеста.
 *
 * Формулы — ST-Central Combat Compendium (https://st-central.net/combat-compendium/, A30):
 *   · враг бьёт первым; порядок ходов отряда: 3 слота — средний → левый → правый,
 *     4 слота — средний-левый → крайний левый → крайний правый → средний-правый; вариант
 *     `turn-order-shuffle` перемешивает отряд каждый раунд (stcalc, A73);
 *   · урон героя = ATK в бою (у монстров нет DEF); крит ×CritDmg;
 *   · урон врага = Monster DMG × множитель по DEF (1.5× при 0 → 0.25× на пороге 75%, между порогами линейно);
 *     крит врага ~10% (в Гробнице Титанов 15%, A70) ×1.5 от базового урона; AoE — по всем, отдельный урон
 *     Monster AOE DMG, шанс 25% (A31/A70); квест может задать свои шансы полями Quest.aoeChance /
 *     Quest.enemyCritChance; усилитель силы квеста (A74) — % боя на весь отряд;
 *   · цель врага выбирается с вероятностью threat / Σ threat; EVA — шанс полного уклонения;
 *   · стихийный барьер: не пробит → урон отряда ×BARRIER_UNBROKEN_DMG_FACTOR (A9);
 *   · Extreme: уклонение −20 п.п. и предел 75% (A34/A42), у героя с отрицательным уклонением
 *     повышен шанс получить крит врага (A59); мана-щит гасит урон и восстанавливается после
 *     MANA_SHIELD_RECHARGE_ROUNDS раундов без урона (A32).
 * Особые механики навыков (выжить смертельный удар, лечение за раунд, рипост после уклонения,
 * «щит» лорда, серия критов, угроза→ATK, лидерские ауры, эскалация по HP, казнь цели, вторая попытка,
 * DEF щита в ATK, дренаж, случайный бонус, «+N% к эффектам чемпиона») — parseSpecials + общий движок эффектов.
 *
 * Детерминизм: свой mulberry32, seed на прогон = seed + номер прогона. Никакого Math.random.
 */
import type { Champion, ClassGroup, DefCaps, Element, GameData, HeroInstance, Quality, Quest, Skill, SkillEffect } from '../data/types.ts'
import { applyQuality } from './quality.ts'
import {
  AOE_CHANCE,
  BARRIER_UNBROKEN_DMG_FACTOR,
  DEFAULT_SIM_RUNS,
  DEF_MITIGATION,
  ENEMY_CRIT_CHANCE,
  ENEMY_DMG_MAX_FACTOR,
  MANA_SHIELD_RECHARGE_ROUNDS,
  MAX_ROUNDS,
  NEGATIVE_EVA_CRIT_MODE,
  PCT_STACKING,
  POWER_BOOSTERS,
  SPIRIT_PLUS_RULE,
  TURN_ORDER,
} from './constants.ts'
import {
  combatStat,
  critMultiplier,
  damageFactor as damageFactorOnCurve,
  drainAttackGain,
  effectiveEvasion,
  enemyCritChanceVs,
  enemyCritDamage,
  escalationMult,
  evasionCap,
  randomAttackBonus,
  threatAttackMultiplier,
  threatShareList,
} from './formulas.ts'
import { activeInnateSkill, activeSkills, calcStats, effectiveClass, heroElementValue, innateBonusOf, type CalcOptions } from './stats.ts'

// Формулы живут в formulas.ts; реэкспорт — для прежних импортов из combat.ts.
export { effectiveEvasion, enemyCritChanceVs } from './formulas.ts'

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
  /**
   * Как надбавка за отрицательное уклонение складывается с базовым шансом крита врага (A59):
   * `additive` (по умолчанию) — прибавляется к `enemyCritChance`; `absolute` — задаёт шанс сама.
   */
  negativeEvaCrit?: 'additive' | 'absolute'
  /** Как % боя складываются с % карточки (A62): `pooled` (Compendium) или `multiplicative`. */
  pctStacking?: 'pooled' | 'multiplicative'
  /**
   * Порядок ходов отряда (A73): `fixed` — Compendium (один и тот же все раунды, `turnOrderFor`),
   * `shuffle` — как в stcalc: отряд перемешивается каждый раунд.
   */
  turnOrder?: 'fixed' | 'shuffle'
}

/** Параметры боя с подставленными значениями по умолчанию. */
export interface ResolvedCombatModel {
  mitigation: { at50: number; at70: number; at75: number }
  enemyDmgMaxFactor: number
  enemyCritChance: number
  aoeChance: number
  barrierUnbrokenFactor: number
  negativeEvaCrit: 'additive' | 'absolute'
  pctStacking: 'pooled' | 'multiplicative'
  turnOrder: 'fixed' | 'shuffle'
}

export function resolveCombatModel(m: CombatModel = {}): ResolvedCombatModel {
  return {
    mitigation: m.mitigation ?? DEF_MITIGATION,
    enemyDmgMaxFactor: m.enemyDmgMaxFactor ?? ENEMY_DMG_MAX_FACTOR,
    enemyCritChance: m.enemyCritChance ?? ENEMY_CRIT_CHANCE,
    aoeChance: m.aoeChance ?? AOE_CHANCE,
    barrierUnbrokenFactor: m.barrierUnbrokenFactor ?? BARRIER_UNBROKEN_DMG_FACTOR,
    negativeEvaCrit: m.negativeEvaCrit ?? NEGATIVE_EVA_CRIT_MODE,
    pctStacking: m.pctStacking ?? PCT_STACKING,
    turnOrder: m.turnOrder ?? TURN_ORDER,
  }
}

/**
 * Множитель урона врага по DEF цели (A30): 1.5× при DEF=0, 1.0× на половине порога 50%,
 * 0.5× / 0.3× / 0.25× на порогах 50/70/75%, между ними линейно; выше порога 75% — 0.25×.
 * Без порогов (defCaps = null, A10) — 1.0 (никакого снижения).
 * `model` — переопределение кривой (анализ чувствительности A57), по умолчанию константы.
 */
export function damageFactor(def: number, caps: DefCaps | null, model: ResolvedCombatModel = resolveCombatModel()): number {
  return damageFactorOnCurve(def, caps, model)
}

/**
 * Предел уклонения бойца (A42): MAX_EVASION плюс его собственные «+N% to max Evasion»
 * (Pathfinder/Insubstantial). Предел — персональный: у Pathfinder 78%, у остальных 75%.
 */
export function evaCapOf(sp: CombatSpecials): number {
  return evasionCap(sp.maxEvaBonusPct)
}

/**
 * Порядок ходов отряда (Compendium): 3 — средний→левый→правый; 4 — ср-левый→крайний левый→крайний правый→ср-правый.
 */
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

/**
 * Случайный порядок ходов на раунд (A73): перемешивание Фишера — Йетса тем же PRNG, что и бой,
 * поэтому прогон остаётся детерминированным при том же seed. Нужно только варианту калибровки
 * `turn-order-shuffle` (stcalc перемешивает отряд каждый раунд); базовая модель — фиксированный
 * порядок Compendium (`turnOrderFor`).
 */
export function shuffleOrder(order: readonly number[], rng: () => number): number[] {
  const out = [...order]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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
  /**
   * Σ% карточки по ATK/DEF/HP (0.3 = +30%), уже входящие в atk/def/hp. Нужны, чтобы % боя
   * складывались с ними, а не умножались поверх (PCT_STACKING = pooled, A62). Нет — считаем 0.
   */
  sheetPct?: { atk: number; def: number; hp: number }
  group?: ClassGroup
  isChampion?: boolean
  skills: Skill[]
  /**
   * id действующего врождённого навыка класса (ступень по стихии, с учётом Души Титана). Нужен,
   * чтобы отличить его «until damaged» эффекты от таких же эффектов других навыков (A54).
   */
  innateSkillId?: string | null
  /**
   * Врождённый бонус EVA/CRIT из скобок HEROES («30% (+20%)»), УЖЕ входящий в поля eva/crit выше (A26/A54).
   * В бою он не добавляется, а снимается, когда «until damaged» перестаёт действовать: см. innateBonusLoss.
   */
  innateBonus?: { eva: number; crit: number }
  /**
   * Внешняя правка статов (веса статов, семена силы) — уже применена к полям выше
   * (applyFighterBonus); здесь только для справки. Бой её повторно НЕ прибавляет.
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

/** «Effect is doubled when below X% HP and tripled when below Y% HP» этого навыка (Berserker/Jarl). */
function hpEscalationOf(skill: Skill): { doubleBelow: number; tripleBelow: number } | undefined {
  const m = skill.text.match(SPECIAL_RE.hpEscalation)
  return m ? { doubleBelow: Number(m[1]), tripleBelow: Number(m[2]) } : undefined
}

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
  // ASSUMPTION: A54 — врождённый бонус EVA/CRIT уже входит в базовые статы класса (HEROES «30% (+20%)», A26),
  // поэтому в бою он НЕ добавляется: пока урон не получен, статы такие же, как в карточке/экспорте, а после
  // первого урона бонус снимается (innateBonusLoss). Величину берём из HEROES, а не из текста ступеней:
  // у Ninja скобки (+20/+20) не совпадают с текстом ступеней (+15% EVA у 1-й, +40% CRIT у 3-й).
  const innate = activeInnateSkill(hero, data, ev.elementStones, cls)
  const declared = cls ? innateBonusOf(cls, data) : { eva: 0, crit: 0 }
  const innateBonus = { eva: 0, crit: 0 }
  if (innate) {
    // Снимаем ровно те статы, которые у врождённого навыка действительно «until damaged».
    for (const e of innate.effects) {
      if (e.condition?.kind !== 'untilDamaged') continue
      if (e.stat === 'eva') innateBonus.eva = declared.eva
      else if (e.stat === 'crit') innateBonus.crit = declared.crit
    }
  }
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
    atkFromShieldDef, sheetPct: { ...stats.breakdown.pct }, group: cls?.group, skills,
    innateSkillId: innate?.id ?? null, innateBonus,
  }
}

/**
 * Экипировка чемпиона. Чемпион не носит «слотов класса» (у него их нет ни в HEROES, ни в CHAMPIONS):
 * игра даёт ему два предмета поддержки отряда — аурасонг (`Aurasong`) и фамильяра (`Familiar`),
 * а в фамильяра вставляется дух. Правила игры описаны в ASSUMPTIONS A67.
 */
export interface ChampionBuild {
  /** Имя чемпиона (`Champion.name`). */
  champion: string
  rank: number
  /** Аурасонг — предмет даёт DEF/HP, навык типа `Aurasong` с тем же именем усиливает весь отряд. */
  aura?: { item: string; quality: Quality } | null
  /** Фамильяр — DEF/HP/ATK-предмет; в него вставляется дух. */
  familiar?: { item: string; quality: Quality } | null
  /** Дух в фамильяре (`Enchant.name`); его навык действует на носителя, «+»-версия — по сродству (A5). */
  spirit?: string | null
}

/** Только предметы экипировки чемпиона — то, что нужно сборке статов и навыков (`championEquipment`). */
export type ChampionEquipment = Pick<ChampionBuild, 'aura' | 'familiar' | 'spirit'>

/** Что не удалось найти в данных при сборке чемпиона — показывается в UI, а не теряется молча. */
export interface ChampionBuildNotes {
  missingAura: string | null
  missingFamiliar: string | null
  missingSpirit: string | null
}

/**
 * Статы и навыки экипировки чемпиона. Навык аурасонга ищется по имени предмета в SKILLS
 * (у этих предметов `Type = Aurasong`, `Name` совпадает с предметом; у BLUEPRINTS своего поля нет).
 * Навык духа даётся по тем же правилам сродства, что и у героя (A5): «+»-версия — если `Spirit Affinity`
 * фамильяра совпадает с навыком духа.
 */
export function championEquipment(build: ChampionEquipment | null | undefined, data: GameData): { stats: { atk: number; def: number; hp: number }; skills: Skill[]; notes: ChampionBuildNotes } {
  const skills: Skill[] = []
  const notes: ChampionBuildNotes = { missingAura: null, missingFamiliar: null, missingSpirit: null }
  const stats = { atk: 0, def: 0, hp: 0 }
  if (!build) return { stats, skills, notes }

  const gear = (slot: { item: string; quality: Quality } | null | undefined, what: 'aura' | 'familiar'): void => {
    if (!slot?.item) return
    const item = data.items.find((i) => i.name === slot.item)
    if (!item) {
      if (what === 'aura') notes.missingAura = slot.item
      else notes.missingFamiliar = slot.item
      return
    }
    const st = applyQuality(item.stats.Normal, slot.quality)
    stats.atk += st.atk
    stats.def += st.def
    stats.hp += st.hp
    if (what === 'aura') {
      // ASSUMPTION: A67 — связь аурасонга с навыком — по имени предмета (у BLUEPRINTS нет колонки навыка).
      const aura = data.skills.find((s) => s.type === 'Aurasong' && s.name === item.name)
      if (aura) skills.push(aura)
    }
  }
  gear(build.aura, 'aura')
  gear(build.familiar, 'familiar')

  if (build.spirit) {
    const spirit = data.enchants.find((e) => e.name === build.spirit)
    if (!spirit) {
      notes.missingSpirit = build.spirit
    } else if (spirit.skill) {
      const familiar = build.familiar?.item ? data.items.find((i) => i.name === build.familiar?.item) : undefined
      const base = data.skills.find((s) => s.id === spirit.skill)
      const plus = spirit.skillPlus ? data.skills.find((s) => s.id === spirit.skillPlus) : undefined
      const usePlus = SPIRIT_PLUS_RULE === 'affinity' && !!familiar && !!base && familiar.spiritAffinity === base.name
      const sk = usePlus && plus ? plus : base
      if (sk) skills.push(sk)
    }
  }
  return { stats, skills, notes }
}

/**
 * Боец-чемпион: база + награды рангов (накопительно, A14), стихия по Element Breakpoints (A13),
 * лидерский навык по рангу + экипировка (`ChampionBuild`): статы аурасонга и фамильяра, навык аурасонга
 * (эффекты «to the party» движок раскладывает на всех — `prepare`) и навык вставленного духа.
 */
export function fighterFromChampion(champion: Champion, rank: number, data: GameData, build?: ChampionBuild | null): Fighter {
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
  const gear = championEquipment(build, data)
  atk += gear.stats.atk
  def += gear.stats.def
  hp += gear.stats.hp
  // Экипировка собрана без найденных предметов (build с несуществующим именем) — это не ошибка: чемпион
  // просто без ауры. О ненайденном сообщает `championEquipment(...).notes` (UI) и оптимизатор (предупреждение).
  const skills = [...(leader ? [leader] : []), ...gear.skills]
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
  /** Явное переопределение шанса крита врага (важнее поля квеста и модели). */
  enemyCritChance?: number
  /** Явное переопределение шанса AoE (важнее поля квеста и модели). */
  aoeChance?: number
  /**
   * Усилитель силы квеста на весь отряд (A74): `normal` / `super` / `mega`. % боя — складываются
   * с % карточки (A62). По умолчанию `none` — усилитель не выбран.
   */
  powerBooster?: PowerBoosterId
  /** Переопределение кривой защиты и барьера (анализ чувствительности A57). */
  model?: CombatModel
  onProgress?: (done: number, total: number) => void
  shouldCancel?: () => boolean
}

/** Что выбрано в форме квеста: усилитель силы на весь отряд (A74). */
export type PowerBoosterId = keyof typeof POWER_BOOSTERS

export interface HeroSurvival {
  name: string
  /** Доля прогонов, где боец выжил. */
  rate: number
  /**
   * Доля прогонов, где боец погиб (в конце боя мёртв — при второй попытке Chronomancer — во второй).
   * Это ровно то, что игра показывает после боя, — с ним сверяются отметки «кто погиб».
   */
  deathRate: number
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
  /** Как надбавка за отрицательное уклонение складывается с базовым критом врага (A59/A57). */
  negativeEvaCrit: 'additive' | 'absolute'
  aoeChance: number
  /** Кривая защиты, множитель при DEF=0 и урон непробитого барьера (параметры калибровки A57). */
  combat: ResolvedCombatModel
  groupCounts: Record<ClassGroup, number>
  /** Предел уклонения каждого бойца (A42): MAX_EVASION + его «+N% to max Evasion» (Pathfinder → 78%). */
  evaCaps: number[]
  /** Вторая попытка при поражении (Chronomancer/Fateweaver), null — её нет. */
  secondAttempt: { powerBonusPct: number } | null
}

/**
 * «until damaged» эффект EVA/CRIT врождённого навыка класса — тот бонус, который уже включён
 * в базовые статы бойца из HEROES (A26/A54) и потому в бою добавляться не должен.
 */
function isInnateBakedIn(f: Fighter, sk: Skill, e: SkillEffect): boolean {
  if (f.innateSkillId == null || f.innateSkillId !== sk.id) return false
  if (e.condition?.kind !== 'untilDamaged') return false
  return e.stat === 'eva' || e.stat === 'crit'
}

/**
 * A54: врождённый бонус EVA/CRIT класса уже входит в статы (`Fighter.innateBonus`, из скобок HEROES),
 * поэтому в бою он не добавляется, а после первого полученного урона снимается — «until damaged»
 * перестал действовать. У Sensei бонус возвращается после `regainAfterRounds` раундов без урона (A49):
 * там `damagedBefore` сбрасывается, и функция снова вернёт нули. Величина — из HEROES («+20/+20»),
 * даже если текст ступени говорит другое (у Ninja 1-я ступень обещает +15% EVA).
 */
export function innateBonusLoss(f: Fighter, damagedBefore: boolean): { eva: number; crit: number } {
  if (!damagedBefore || !f.innateBonus) return { eva: 0, crit: 0 }
  return { eva: -f.innateBonus.eva, crit: -f.innateBonus.crit }
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
      // Эскалация — только у эффектов того навыка, в тексте которого она написана (Berserk Rage),
      // а не у всех условных эффектов бойца.
      const esc = hpEscalationOf(sk)
      const fromChampion = f.isChampion === true || sk.type === 'Leader'
      for (const e of sk.effects) {
        // ASSUMPTION: A54 — «until damaged» бонус врождённого навыка класса уже входит в статы бойца
        // (HEROES «30% (+20%)»), поэтому в бою он не добавляется: боец теряет его сам при получении урона.
        if (isInnateBakedIn(f, sk, e)) continue
        const ref: CondRef = {
          e,
          dbl,
          perGroup: e.condition?.kind === 'perPartyMember' ? e.condition.group : undefined,
          // Эскалация относится к условным эффектам навыка (Berserker/Jarl: «effect is doubled below 50% HP»).
          esc: e.condition && esc ? esc : undefined,
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
  const randomAtkPct = randomAttackBonus(specials.reduce((a, s) => Math.max(a, s.randomPartyAtkUpToPct), 0))
  const combat = resolveCombatModel(opts.model)
  // Усилитель силы квеста (A74): % боя на весь отряд, складывается с % карточки (A62), не поверх.
  const booster = POWER_BOOSTERS[opts.powerBooster ?? 'none']

  fighters.forEach((f, i) => {
    const sm = emptyMods()
    sm.atkPct += randomAtkPct
    sm.atkPct += booster.atkPct / 100
    sm.defPct += booster.defPct / 100
    sm.crit += booster.crit
    sm.critDmg += booster.critDmg
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
    // Внешняя правка HP (FighterBonus.hp) уже входит в f.hp (applyFighterBonus). % боя — с % карточки (A62).
    maxHp.push(Math.max(1, Math.floor(combatStat(f.hp, f.sheetPct?.hp ?? 0, hpFlat, hpPct, combat.pctStacking))))
    manaMax.push(Math.floor((f.manaShield + manaFlat) * (1 + manaPct)))
  })

  const partyHeal = specials.reduce((a, s) => a + s.healParty, 0)
  const elemBonus = specials.reduce((a, s) => Math.max(a, s.elemBarrierBonusPct), 0)
  const retry = specials.find((s) => s.secondAttempt)
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
    // Приоритет: явное переопределение (тесты, калибровка) → значение квеста (A70) → модель боя → константа.
    enemyCritChance: opts.enemyCritChance ?? quest.enemyCritChance ?? combat.enemyCritChance,
    negativeEvaCrit: combat.negativeEvaCrit,
    aoeChance: opts.aoeChance ?? quest.aoeChance ?? combat.aoeChance,
    combat,
    groupCounts,
    evaCaps: specials.map((s) => evaCapOf(s)),
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
  /** Раунд, в котором боец потерял «until damaged» (для возврата у Sensei); 0 — не терял. */
  const lostRound = new Array<number>(n).fill(0)
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
    // A54: врождённый бонус EVA/CRIT уже сидит в статах бойца — после первого урона снимаем его
    // (у Sensei возвращается через regainAfterRounds раундов без урона: damagedBefore сбрасывается, A49).
    const innateLoss = innateBonusLoss(p.fighters[i], ctx.damagedBefore)
    m.eva += innateLoss.eva
    m.crit += innateLoss.crit
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
    // ASSUMPTION: A34/A42 — сначала штраф Extreme вычитанием, затем предел героя
    // («+N% to max Evasion» поднимает именно предел: у Pathfinder 78%).
    eva = effectiveEvasion(eva, p.evaCaps[i], p.extreme)
    if (rng() < eva) {
      if (sp.riposte) riposteArmed[i] = true
      return
    }
    const defEff = combatStat(f.def, f.sheetPct?.def ?? 0, m.defFlat, m.defPct, p.combat.pctStacking)
    let dmg = baseDmg * damageFactor(defEff, quest.defCaps, p.combat)
    // A59: у героя с отрицательным уклонением (только на Extreme) шанс крита врага выше базового.
    // Как именно выше (базовый + надбавка или надбавка вместо базового) — параметр A57.
    if (rng() < enemyCritChanceVs(p.enemyCritChance, eva, p.negativeEvaCrit)) dmg = enemyCritDamage(dmg, baseDmg)
    if (mana[i] > 0) {
      const absorbed = Math.min(mana[i], dmg)
      mana[i] -= absorbed
      dmg -= absorbed
    }
    hitThisRound[i] = true
    if (!damagedBefore[i]) lostRound[i] = round
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
    // A73: базовая модель — фиксированный порядок Compendium; вариант `turn-order-shuffle` (stcalc)
    // перемешивает отряд каждый раунд (тем же rng, поэтому прогон детерминирован).
    const order = p.combat.turnOrder === 'shuffle' ? shuffleOrder(p.order, rng) : p.order
    for (const i of order) {
      if (!alive[i]) continue
      const f = p.fighters[i]
      const sp = p.specials[i]
      // Модификаторы — на момент удара, а не на начало раунда: враг бьёт первым и может снять
      // «until damaged» ещё до атаки героя (ST-Central, Hero Academia → Ninja: «hitting the Ninja and
      // eliminating the passive boost before the Ninja even attacks»). Так же — пороги HP и HP врага.
      const m = computeMods(i, round, monsterHp / quest.monsterHp)
      // «Equipped Shield's DEF is added to ATK» (A45) и прибавка от дренажа (Hemma) — плоские; % боя — с % карточки (A62).
      const atkFlat = (f.atkFromShieldDef ?? 0) + drainAtk[i] + m.atkFlat
      let atk = combatStat(f.atk, f.sheetPct?.atk ?? 0, atkFlat, m.atkPct, p.combat.pctStacking) * atkBonus
      if (sp.threatAtkPct > 0) atk *= threatAttackMultiplier(sp.threatAtkPct, f.threat)
      const critChance = sp.critSet ?? f.crit + m.crit

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
        dmg *= critMultiplier(f.critDmg + m.critDmg, consec[i], sp.consecCritPct)
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
        drainAtk[c] += drainAttackGain(total, d.atkBonusPct)
      }
    }
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      const heal = p.specials[i].healSelf + p.partyHeal
      if (heal > 0) hp[i] = Math.min(p.maxHp[i], hp[i] + heal)
      if (hitThisRound[i]) noDmgRun[i] = 0
      else {
        noDmgRun[i]++
        if (noDmgRun[i] >= MANA_SHIELD_RECHARGE_ROUNDS) mana[i] = p.manaMax[i]
      }
      // «Regain bonuses after N rounds» (Sensei): бонус возвращается через N раундов после потери,
      // попал ли враг в промежутке — неважно (ST-Central, Hero Academia → Sensei: удар → атака без бонуса →
      // враг бьёт снова, «doesn't matter if it hits or you evade» → атака без бонуса → бонус снова до хода врага).
      const regain = p.specials[i].regainAfterRounds
      if (regain > 0 && damagedBefore[i] && round - lostRound[i] + 1 >= regain) damagedBefore[i] = false
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
  return threatShareList(fighters.map((f) => f.threat), opts.aoeChance ?? AOE_CHANCE)
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
    survival: fighters.map((f, i) => ({
      name: f.name,
      rate: done > 0 ? aliveCount[i] / done : 0,
      deathRate: done > 0 ? (done - aliveCount[i]) / done : 0,
    })),
    avgDamagePerRound: roundsSum > 0 ? dmgSum / roundsSum : 0,
    avgMinSurvivorHpPct: done > 0 ? minSurvSum / done : 0,
  }
}
