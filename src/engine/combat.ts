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
 * «щит» лорда, серия критов, угроза→ATK, лидерские ауры) — parseSpecials + общий движок эффектов.
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
  MAX_ROUNDS,
  THREAT_ATTACK_MULTIPLIER_DIVISOR,
} from './constants.ts'
import { activeSkills, calcStats, heroElementValue, type CalcOptions } from './stats.ts'

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
 * Множитель урона врага по DEF цели (A30): 1.5× при DEF=0, 1.0× на половине порога 50%,
 * 0.5× / 0.3× / 0.25× на порогах 50/70/75%, между ними линейно; выше порога 75% — 0.25×.
 * Без порогов (defCaps = null, A10) — 1.0 (никакого снижения).
 */
export function damageFactor(def: number, caps: DefCaps | null): number {
  if (!caps || caps.p50 <= 0) return 1
  const pts: [number, number][] = [
    [0, ENEMY_DMG_MAX_FACTOR],
    [caps.p50 / 2, 1],
    [caps.p50, DEF_MITIGATION.at50],
    [caps.p70, DEF_MITIGATION.at70],
    [caps.p75, DEF_MITIGATION.at75],
  ]
  if (def >= caps.p75) return DEF_MITIGATION.at75
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (def <= x1) return x1 === x0 ? y1 : y0 + ((def - x0) * (y1 - y0)) / (x1 - x0)
  }
  return DEF_MITIGATION.at75
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
  group?: ClassGroup
  isChampion?: boolean
  skills: Skill[]
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
  evaSet: /evasion is set to (\d+)%/i,
  critSet: /critical hit chance is set to (\d+)% and cannot change/i,
  doubledVsBoss: /bonuses are doubled against bosses/i,
} as const

export function parseSpecials(skills: Skill[]): CombatSpecials {
  const s: CombatSpecials = {
    survivePct: 0, healSelf: 0, healParty: 0, riposte: false,
    consecCritPct: 0, consecCritMax: 0, lethalProtect: false, threatAtkPct: 0,
    elemBarrierBonusPct: 0, anyElementPct: 0, firstRoundCrit: false, evaSet: null, critSet: null,
  }
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
    if (SPECIAL_RE.evaSet.test(t)) s.evaSet = num(t, SPECIAL_RE.evaSet) / 100
    if (SPECIAL_RE.critSet.test(t)) s.critSet = num(t, SPECIAL_RE.critSet) / 100
  }
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
  const cls = data.heroClasses.find((c) => c.name === hero.className)
  const skills = activeSkills(hero, data, ev.elementStones)
  const specials = parseSpecials(skills)
  const elements: Partial<Record<Element, number>> = {}
  if (cls && cls.element !== 'Any' && ev.element > 0) elements[cls.element] = ev.element
  return {
    name: hero.name,
    atk: stats.atk, def: stats.def, hp: stats.hp, manaShield: stats.manaShield,
    crit: stats.crit, critDmg: stats.critDmg, eva: stats.eva, threat: stats.threat,
    elements, elementAny: ev.elementAny, barrierAnyPct: specials.anyElementPct,
    group: cls?.group, skills,
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
  aoeChance: number
  groupCounts: Record<ClassGroup, number>
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
      for (const e of sk.effects) {
        const ref: CondRef = { e, dbl, perGroup: e.condition?.kind === 'perPartyMember' ? e.condition.group : undefined }
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

  fighters.forEach((f, i) => {
    const sm = emptyMods()
    const cond: CondRef[] = []
    let hpPct = 0
    let hpFlat = 0
    let manaPct = 0
    let manaFlat = 0
    const acc = (ref: EffectRef, toCond: boolean): void => {
      const e = ref.e
      if (e.condition) {
        if (toCond) cond.push(ref as CondRef)
        else partyCond.push(ref as CondRef)
        return
      }
      if (e.stat === 'hp') {
        if (e.mode === 'pct') hpPct += (e.value * (ref.dbl ? 2 : 1)) / 100
        else hpFlat += e.value * (ref.dbl ? 2 : 1)
      } else if (e.stat === 'manaShield') {
        if (e.mode === 'pct') manaPct += (e.value * (ref.dbl ? 2 : 1)) / 100
        else manaFlat += e.value * (ref.dbl ? 2 : 1)
      } else applyEffect(sm, ref)
    }
    for (const ref of selfRefs[i]) acc(ref, true)
    for (const ref of partyRefs) acc(ref, false)
    selfStatic.push(sm)
    selfCond.push(cond)
    maxHp.push(Math.max(1, Math.floor((f.hp + hpFlat) * (1 + hpPct))))
    manaMax.push(Math.floor((f.manaShield + manaFlat) * (1 + manaPct)))
  })

  const partyHeal = specials.reduce((a, s) => a + s.healParty, 0)
  const elemBonus = specials.reduce((a, s) => Math.max(a, s.elemBarrierBonusPct), 0)
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
    enemyCritChance: opts.enemyCritChance ?? ENEMY_CRIT_CHANCE,
    aoeChance: opts.aoeChance ?? AOE_CHANCE,
    groupCounts,
  }
}

interface RunResult {
  win: boolean
  rounds: number
  alive: boolean[]
  dmgDealt: number
}

function runOnce(p: Prepared, quest: Quest, rng: () => number): RunResult {
  const n = p.fighters.length
  const hp = p.maxHp.slice()
  const mana = p.manaMax.slice()
  const alive = new Array<boolean>(n).fill(true)
  const damagedBefore = new Array<boolean>(n).fill(false)
  const noDmgRun = new Array<number>(n).fill(0)
  const hitThisRound = new Array<boolean>(n).fill(false)
  const riposteArmed = new Array<boolean>(n).fill(false)
  const consec = new Array<number>(n).fill(0)
  const surviveUsed = new Array<boolean>(n).fill(false)
  let protectLeft = p.specials.reduce((a, s) => a + (s.lethalProtect ? 1 : 0), 0)
  let monsterHp = quest.monsterHp
  let dmgDealt = 0
  const mods = new Array<Mods>(n)

  const computeMods = (i: number, round: number, enemyHpFrac: number): Mods => {
    const m: Mods = { ...p.selfStatic[i] }
    const ctx: CondCtx = {
      round,
      selfHpFrac: hp[i] / p.maxHp[i],
      enemyHpFrac,
      isBoss: quest.variant === 'boss',
      damagedBefore: damagedBefore[i],
      groupCounts: p.groupCounts,
    }
    for (const ref of p.selfCond[i]) if (condOk(ref.e.condition, ctx)) applyEffect(m, ref, ref.perGroup ? p.groupCounts[ref.perGroup] : 1)
    for (const ref of p.partyCond) if (condOk(ref.e.condition, ctx)) applyEffect(m, ref, ref.perGroup ? p.groupCounts[ref.perGroup] : 1)
    return m
  }

  const tryHit = (i: number, baseDmg: number): void => {
    if (!alive[i]) return
    const f = p.fighters[i]
    const sp = p.specials[i]
    const m = mods[i]
    let eva = sp.evaSet ?? f.eva + m.eva
    if (p.extreme) eva *= 1 - EXTREME_EVA_PENALTY
    if (eva >= 1 || rng() < eva) {
      if (sp.riposte) riposteArmed[i] = true
      return
    }
    const defEff = (f.def + m.defFlat) * (1 + m.defPct)
    let dmg = baseDmg * damageFactor(defEff, quest.defCaps)
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

  for (let round = 1; round <= p.maxRounds; round++) {
    const enemyHpFrac = monsterHp / quest.monsterHp
    for (let i = 0; i < n; i++) mods[i] = computeMods(i, round, enemyHpFrac)
    hitThisRound.fill(false)

    // — фаза монстра —
    const aliveIdx: number[] = []
    let threatSum = 0
    for (let i = 0; i < n; i++) if (alive[i]) { aliveIdx.push(i); threatSum += Math.max(0, p.fighters[i].threat) }
    if (aliveIdx.length === 0) return { win: false, rounds: round - 1, alive, dmgDealt }
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
    if (aliveIdx.every((i) => !alive[i])) return { win: false, rounds: round, alive, dmgDealt }

    // — фаза отряда —
    for (const i of p.order) {
      if (!alive[i]) continue
      const f = p.fighters[i]
      const sp = p.specials[i]
      const m = mods[i]
      let atk = (f.atk + m.atkFlat) * (1 + m.atkPct)
      if (sp.threatAtkPct > 0) atk *= 1 + (sp.threatAtkPct / 100) * (f.threat / THREAT_ATTACK_MULTIPLIER_DIVISOR)
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
        dmg *= f.critDmg + m.critDmg + consec[i] * (sp.consecCritPct / 100)
        consec[i] = Math.min(consec[i] + 1, sp.consecCritMax)
      } else consec[i] = 0
      const ignoreBarrier = sp.firstRoundCrit && round === 1 && isCrit // Iaido: крит игнорирует барьер
      if (!p.barrierBroken && !ignoreBarrier) dmg *= BARRIER_UNBROKEN_DMG_FACTOR
      monsterHp -= dmg
      dmgDealt += dmg
      if (monsterHp <= 0) return { win: true, rounds: round, alive, dmgDealt }
    }

    // — конец раунда: лечение и перезарядка мана-щита —
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      const heal = p.specials[i].healSelf + p.partyHeal
      if (heal > 0) hp[i] = Math.min(p.maxHp[i], hp[i] + heal)
      if (hitThisRound[i]) noDmgRun[i] = 0
      else {
        noDmgRun[i]++
        if (noDmgRun[i] >= MANA_SHIELD_RECHARGE_ROUNDS) mana[i] = p.manaMax[i]
      }
    }
  }
  return { win: false, rounds: p.maxRounds, alive, dmgDealt }
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
  const aliveCount = new Array<number>(fighters.length).fill(0)
  for (let r = 0; r < total; r++) {
    if (r > 0 && opts.shouldCancel?.()) break
    const res = runOnce(p, quest, mulberry32(seed + r))
    done++
    if (res.win) wins++
    roundsSum += res.rounds
    dmgSum += res.dmgDealt
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
  }
}
