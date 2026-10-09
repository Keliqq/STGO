/**
 * Текст эффекта навыка → структурированные эффекты.
 *
 * Грамматика (явный whitelist, см. docs/SCHEMA.md → SKILLS → «Формат эффектов»):
 *   клауза  := [Grants] части [суффикс]
 *   части   := часть { (and|&) часть }          — «+120% DEF & +30% HP», «+20% Attack and +10% Evasion»
 *   часть   := ±N[%] [bonus] [to party] статы [with типы]
 *   статы   := стат { (,|and|&) стат }         — «Attack and Defense», «ATK, DEF and HP»
 *   суффикс := for/to the party | for each <Группа> | for N rounds | on the first round
 *              | when HP falls below N% | when enemy's HP is below N% | against bosses | until damaged
 * Запятая не всегда разделяет клаузы: «+200% Attack with Sword, Axe, Dagger» — продолжение списка.
 * Поэтому сегменты без чисел и сегменты со строчной буквы приклеиваются к предыдущему.
 *
 * Что не стат-эффект: известные механики/небоевое → `ignored`, остальное → `unparsed` (видно в UI).
 */
import type { EffectCondition, EffectStat, SkillEffect } from '../types.ts'

export interface ParsedEffects {
  effects: SkillEffect[]
  ignored: string[]
  unparsed: string[]
}

const STAT_ALIASES: Record<string, EffectStat> = {
  attack: 'atk',
  atk: 'atk',
  defense: 'def',
  def: 'def',
  health: 'hp',
  hp: 'hp',
  evasion: 'eva',
  eva: 'eva',
  'critical hit chance': 'crit',
  'critical chance': 'crit',
  'crit chance': 'crit',
  crit: 'crit',
  'critical hit damage': 'critDmg',
  'critical damage': 'critDmg',
  'crit damage': 'critDmg',
  'mana shield': 'manaShield',
  threat: 'threat',
  xp: 'xp',
}

/**
 * Распознанные клаузы, которые не являются прибавкой к стату: небоевые бонусы (время, лут, XP-экономика)
 * и особые боевые механики, которые движок будет моделировать отдельно (сессия 3).
 */
const IGNORED_PATTERNS: RegExp[] = [
  /resting time|quest time|quest speed|break chance|energy cost|components found|bonus loot|steal/i,
  /flash quest|collection value|collection score|dragon invasion|airship|tower and tomb/i,
  /learns? skills|learn (a very )?powerful|exclusive skill|polonia|items stolen|item cannot break/i,
  /survive one fatal blow|heals? (party )?(by )?\d+ hp|each turn|drain|hemma's attack|protect an ally/i,
  /ignores? elemental barriers|any element|element bonus vs|guaranteed|first attack is always/i,
  /upon striking|seed bonus|stacks \d+ times|consecutive critical|regain bonuses|guarantees a critical/i,
  /shield's def is added|threat is added|effect received from champion|nullify effects/i,
  /weapons grant no bonuses|is set to \d+%|user deals|begins combat|party is defeated|second attempt/i,
  /\bdoubled\b|highly random|per point in any element|max evasion|xp\s*→|reduces resting/i,
]

const GROUPS = { fighter: 'Fighter', rogue: 'Rogue', spellcaster: 'Spellcaster' } as const

interface Suffix {
  scope: 'self' | 'party'
  condition?: EffectCondition
}

/** Разбить текст на клаузы с учётом продолжений списков. */
export function splitClauses(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/\.\s+/)) {
    for (const rawSeg of sentence.split(/,\s+/)) {
      const seg = rawSeg.trim().replace(/\.$/, '')
      if (seg === '') continue
      const prev = out.length > 0 ? out[out.length - 1] : undefined
      const continuation =
        prev !== undefined &&
        (/^[a-z]/.test(seg) || (!/\d/.test(seg) && !IGNORED_PATTERNS.some((re) => re.test(seg))))
      if (continuation) out[out.length - 1] = `${prev}, ${seg}`
      else out.push(seg)
    }
  }
  return out
}

function stripSuffix(clause: string): { body: string; suffix: Suffix } {
  let body = clause.trim()
  let scope: Suffix['scope'] = 'self'
  let condition: EffectCondition | undefined

  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = body.match(re)
    if (m) body = body.slice(0, m.index).trim()
    return m
  }

  let m: RegExpMatchArray | null
  if ((m = take(/\s+for each (Fighter|Rogue|Spellcaster)$/i))) {
    condition = { kind: 'perPartyMember', group: GROUPS[m[1].toLowerCase() as keyof typeof GROUPS] }
    scope = 'party'
  }
  if (take(/\s+(?:for|to) the party$/i) || take(/\s+earned by the party$/i)) scope = 'party'
  if ((m = take(/\s+for (\d+) rounds$/i))) condition = { kind: 'rounds', rounds: Number(m[1]) }
  else if (take(/\s+on the first round$/i)) condition = { kind: 'firstRound' }
  else if ((m = take(/\s+when HP falls below (\d+)%$/i))) condition = { kind: 'selfHpBelow', pct: Number(m[1]) }
  else if ((m = take(/\s+when enemy's HP is below (\d+)%$/i))) condition = { kind: 'enemyHpBelow', pct: Number(m[1]) }
  else if (take(/\s+against bosses$/i)) condition = { kind: 'vsBoss' }
  else if (take(/\s+until damaged$/i)) condition = { kind: 'untilDamaged' }
  // «Grants … to the party for each Spellcaster» — party мог остаться перед for each
  if (take(/\s+(?:for|to) the party$/i)) scope = 'party'

  return { body, suffix: { scope, condition } }
}

function parseStatList(s: string): EffectStat[] | null {
  const words = s
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
  if (words.length === 0) return null
  const stats: EffectStat[] = []
  for (const w of words) {
    const stat = STAT_ALIASES[w]
    if (!stat) return null
    stats.push(stat)
  }
  return stats
}

function parseTypeList(s: string, itemTypes: ReadonlySet<string>): string[] | null {
  const types = s
    .split(/\s*,\s*|\s+and\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const byLower = new Map([...itemTypes].map((t) => [t.toLowerCase(), t]))
  const out: string[] = []
  for (const t of types) {
    const known = byLower.get(t.toLowerCase())
    if (!known) return null
    out.push(known)
  }
  return out.length > 0 ? out : null
}

/** «±N[%] остаток» → эффекты или null. */
function parsePart(part: string, suffix: Suffix, itemTypes: ReadonlySet<string>): SkillEffect[] | null {
  const m = part.trim().match(/^([+-]?)(\d+(?:\.\d+)?)(%?)\s+(.+)$/)
  if (!m) return null
  const value = (m[1] === '-' ? -1 : 1) * Number(m[2])
  const mode = m[3] === '%' ? 'pct' : 'flat'
  let rest = m[4].trim()
  let scope = suffix.scope
  if (/^bonus to party\s+/i.test(rest)) {
    rest = rest.replace(/^bonus to party\s+/i, '')
    scope = 'party'
  }
  rest = rest.replace(/^(?:bonus|more)\s+/i, '')

  const mk = (stat: EffectStat, condition?: EffectCondition): SkillEffect => {
    const c = condition ?? suffix.condition
    return c ? { stat, mode, value, scope, condition: c } : { stat, mode, value, scope }
  }

  let x: RegExpMatchArray | null
  // Бонус к статам экипировки
  if ((x = rest.match(/^from all items(?: with (.+))?$/i)) || (x = rest.match(/^stats with (.+)$/i))) {
    if (!x[1]) return [mk('itemStats')]
    const types = parseTypeList(x[1], itemTypes)
    return types ? [mk('itemStats', { kind: 'itemType', types })] : null
  }
  if (/^stats from (?:eq|equipment)$/i.test(rest)) return [mk('itemStats')]
  if (/^stats from lost city of gold equipment$/i.test(rest)) return [mk('itemStats', { kind: 'lcogItem' })]
  if (/^extra bonus from equipment with innate elements$/i.test(rest)) return [mk('itemStats', { kind: 'innateElementItem' })]
  if (/^to enchanted item's stats$/i.test(rest)) return [mk('itemStats', { kind: 'enchantedItem' })]

  // Статы [with типы]
  x = rest.match(/^(.+?)\s+with\s+(.+)$/i)
  if (x) {
    const stats = parseStatList(x[1])
    const types = parseTypeList(x[2], itemTypes)
    if (!stats || !types) return null
    return stats.map((s) => mk(s, { kind: 'itemType', types }))
  }
  const stats = parseStatList(rest)
  return stats ? stats.map((s) => mk(s)) : null
}

/**
 * Разобрать текст эффектов навыка.
 * @param itemTypes известные типы предметов (для «with Sword, Axe»); неизвестный тип → клауза в unparsed.
 */
export function parseSkillEffects(text: string, itemTypes: ReadonlySet<string>): ParsedEffects {
  const result: ParsedEffects = { effects: [], ignored: [], unparsed: [] }
  const t = text.trim()
  if (t === '' || t === '---') return result

  for (const clause of splitClauses(t)) {
    // «Also increases XP earned by N%»
    const xpAlso = clause.match(/^Also increases XP earned by (\d+)%$/i)
    if (xpAlso) {
      result.effects.push({ stat: 'xp', mode: 'pct', value: Number(xpAlso[1]), scope: 'self' })
      continue
    }
    const normalized = clause.replace(/^Grants\s+/i, '').replace(/,\s+as well as\s+/i, ' and ')
    const { body, suffix } = stripSuffix(normalized)
    const parts = body.split(/\s+(?:and|&)\s+(?=[+-]?\d)|\s*&\s*(?=[+-]?\d)|\s+and\s+(?=reduces |heals )/i)
    for (const part of parts) {
      // У части может быть свой суффикс: «10 bonus HP to the party and reduces resting time by 20%»
      const own = stripSuffix(part)
      const partSuffix: Suffix = {
        scope: own.suffix.scope === 'party' ? 'party' : suffix.scope,
        condition: own.suffix.condition ?? suffix.condition,
      }
      const effects = parsePart(own.body, partSuffix, itemTypes)
      if (effects) result.effects.push(...effects)
      else if (IGNORED_PATTERNS.some((re) => re.test(part) || re.test(clause))) result.ignored.push(part === body ? clause : part)
      else result.unparsed.push(part === body ? clause : part)
    }
  }
  return result
}
