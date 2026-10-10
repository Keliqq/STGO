/**
 * Реестр моделирования классов и чемпионов: что учтено в движке, а что нет.
 *
 * Зачем: подбор должен учитывать особенности КАЖДОГО класса. Часть клауз врождённых и лидерских
 * навыков — небоевые (время отдыха, лут, шанс кражи) и движку не нужны, часть — боевые механики
 * (эскалация по HP, казнь цели, вторая попытка, DEF щита в ATK, дренаж). Этот модуль:
 *   1) классифицирует каждую клаузу из листов HEROES/CHAMPIONS (`classifyClause`),
 *   2) собирает отчёт по всем 42 классам и всем чемпионам (`modelingReport`),
 *   3) даёт текст предупреждения для UI («оценка приблизительная: не учтено …»).
 *
 * Реестр ничего не считает сам: он проверяет данные листов. Тест `classModel.test.ts` требует,
 * чтобы каждая клауза была классифицирована (иначе при обновлении таблицы тест упадёт и заставит
 * добавить механику), а `modelingReport` используется тестом «эффект срабатывает в симуляции».
 */
import type { GameData, Skill } from '../data/types.ts'

export type ModelLevel = 'full' | 'partial' | 'none'

export interface ModelEntry {
  name: string
  /** `class` — класс героя, `champion` — чемпион. */
  kind: 'class' | 'champion'
  /** Класс-промоушен (для базовых классов) — для справки в отчёте. */
  promotion: string | null
  level: ModelLevel
  /** Боевые клаузы, которые движок НЕ учитывает (человеческое объяснение). */
  missing: string[]
  /** Учтено, но с допущением — в UI показывается мягче (docs/ASSUMPTIONS.md). */
  assumptions: string[]
  /** Небоевые клаузы: на подбор не влияют (время, лут, экономика). */
  nonCombat: string[]
  /** Клаузы, которых нет ни в одном списке (тест требует пустоты). */
  unclassified: string[]
}

/**
 * Реализованные механики: клаузы, которые разбирает движок (combat.ts → parseSpecials,
 * stats.ts → эффекты, constants.ts). Ссылки — на допущения в docs/ASSUMPTIONS.md.
 */
const MODELED: [RegExp, string][] = [
  [/chance to survive one fatal blow/i, 'A36'],
  [/heals? (?:the )?party by \d+ hp each turn/i, 'A36'],
  [/\bheal \d+ hp each turn/i, 'A36'],
  [/guarantees a critical hit after dodging/i, 'A36'],
  [/more critical damage per consecutive critical hits/i, 'A36'],
  [/^stacks \d+ times$/i, 'A36'],
  [/protect an ally from a lethal attack once per battle/i, 'A36'],
  [/first attack is always a critical hit/i, 'A36'],
  [/guaranteed evasion and critical hit on the first round/i, 'A49'],
  [/this attack ignores elemental barriers/i, 'A49'],
  [/of total threat is added as an attack multiplier/i, 'A35'],
  [/party element bonus vs elemental barriers/i, 'A9'],
  [/only counts as \d+% against elemental barriers/i, 'A9'],
  [/per point in any element/i, 'A36'],
  [/bonuses are doubled against bosses/i, 'A36'],
  [/effect is doubled when below \d+% hp and tripled when below \d+% hp/i, 'A48'],
  [/regain bonuses after \d+ rounds?/i, 'A49'],
  [/upon striking, defeat any enemy below \d+% hp/i, 'A50'],
  [/allows an immediate second attempt at the quest/i, 'A51'],
  [/equipped shield's def is added to atk/i, 'A45'],
  [/each turn, drain \d+% hp from all allies/i, 'A46'],
  [/attack increases by the (?:total )?amount of hp drained plus \d+%/i, 'A46'],
  [/highly random attack bonus for the party, up to \+\d+%/i, 'A43'],
  [/increased effect received from champion skills/i, 'A52'],
  [/\+(\d+)% to max evasion/i, 'A42'],
]

/** Небоевые клаузы: на исход боя и подбор не влияют (экономика, лут, время, обучение). */
const NON_COMBAT: [RegExp, string][] = [
  [/learns? skills? faster|chance to learn|learn a very powerful|exclusive skill/i, 'обучение навыкам'],
  [/steal chance|max items stolen|chance to steal/i, 'кража предметов'],
  [/resting time|quest time/i, 'время отдыха/квеста'],
  [/components found/i, 'добыча компонентов'],
  [/seed bonus/i, 'семена силы (прогрессия вне боя)'],
  [/break chance/i, 'шанс поломки предмета (прочность, не бой)'],
  [/bonus loot|finds .* as bonus loot|earn .* as bonus loot|leather items/i, 'бонусный лут'],
  [/extra flash quest attempt/i, 'доп. попытка Flash Quest'],
]

/**
 * Человеческие пояснения к пробелам и допущениям по конкретным классам/чемпионам.
 * Пробелы (missing) → уровень `partial`; допущения (assumptions) → уровень `full` с пометкой.
 */
const NOTES: Record<string, { missing?: string[]; assumptions?: string[] }> = {
  Ninja: {
    missing: [
      'врождённый бонус EVA/CRIT уже входит в базовые статы класса (A26), а в бою он применяется ещё раз: уклонение и крит завышены, пока герой не получил урон',
    ],
  },
  Sensei: {
    missing: [
      'врождённый бонус EVA/CRIT уже входит в базовые статы класса (A26), а в бою он применяется ещё раз: уклонение и крит завышены, пока герой не получил урон',
    ],
  },
  Bjorn: {
    missing: ['удвоение бонусов в Flash Quests — Flash Quests в модели квестов нет'],
  },
  Tamas: {
    assumptions: ['«highly random attack bonus, up to +N%» взят математическим ожиданием (N/2) — A43'],
  },
  Chieftain: { assumptions: ['«+N% of total Threat is added as an attack multiplier» — трактовка A35'] },
  Berserker: { assumptions: ['эскалация «effect is doubled/tripled» по порогам HP — трактовка A48'] },
  Jarl: { assumptions: ['эскалация «effect is doubled/tripled» по порогам HP — трактовка A48'] },
  Velite: { assumptions: ['«Shield’s DEF is added to ATK» — берётся DEF-вклад щита со всеми бонусами (A45)'] },
  Praetorian: { assumptions: ['«Shield’s DEF is added to ATK» — берётся DEF-вклад щита со всеми бонусами (A45)'] },
  Hemma: { assumptions: ['дренаж и рост ATK «plus N% for each drain» — трактовка A46'] },
  Fateweaver: { assumptions: ['«+15% power bonus» второй попытки применён к ATK — трактовка A44'] },
  Chronomancer: { assumptions: ['вторая попытка моделируется как повторный бой с теми же HP отряда (A51)'] },
  Pathfinder: { assumptions: ['«+3% to max Evasion» поднимает предел уклонения; сам предел в игре неизвестен (A42)'] },
  Mercenary: { assumptions: ['«+25% increased effect received from Champion skills» применено к лидерским баффам (A52)'] },
}

/**
 * Клаузы, которые сознательно оставлены неучтёнными: механика вне модели приложения
 * (например, Flash Quests). Класс с такой клаузой получает уровень `partial`.
 */
const DELIBERATE_GAPS: [RegExp, string][] = [
  [/doubled during flash quests/i, 'бонусы удваиваются только в Flash Quests — таких квестов в модели нет (A53)'],
]

/**
 * Классификация одной клаузы навыка:
 *  · `modeled` — механика разобрана движком (в квадратных скобках — id допущения);
 *  · `nonCombat` — небоевое (в квадратных скобках — категория);
 *  · `gap` — боевое, но сознательно вне модели;
 *  · `unclassified` — не разобрано: тест требует, чтобы таких не было.
 */
export function classifyClause(text: string): { kind: 'modeled' | 'nonCombat' | 'gap' | 'unclassified'; note: string } {
  const t = text.trim()
  for (const [re, note] of MODELED) if (re.test(t)) return { kind: 'modeled', note }
  for (const [re, note] of DELIBERATE_GAPS) if (re.test(t)) return { kind: 'gap', note }
  for (const [re, note] of NON_COMBAT) if (re.test(t)) return { kind: 'nonCombat', note }
  return { kind: 'unclassified', note: '' }
}

/** Все клаузы, которые парсер эффектов отложил в `ignored`/`unparsed`, по набору навыков. */
export function clausesOf(skills: Skill[]): string[] {
  const out = new Set<string>()
  for (const s of skills) for (const t of [...s.ignored, ...s.unparsed]) out.add(t.trim())
  return [...out]
}

function entryByName(data: GameData, name: string): Skill | undefined {
  return data.skills.find((s) => s.id === name) ?? data.skills.find((s) => s.name === name)
}

/** Навыки, определяющие «особенность» класса: врождённые ступени + ступень за Душу Титана. */
export function classSkills(data: GameData, className: string): Skill[] {
  const cls = data.heroClasses.find((c) => c.name === className)
  if (!cls) return []
  const ids = [...cls.innateSkills, ...(cls.innateTitanSkill ? [cls.innateTitanSkill] : [])]
  return ids.map((id) => entryByName(data, id)).filter((s): s is Skill => !!s)
}

/** Навыки чемпиона: все лидерские ступени (в бою действует одна — по рангу). */
export function championSkills(data: GameData, championName: string): Skill[] {
  const ch = data.champions.find((c) => c.name === championName)
  if (!ch) return []
  return ch.leaderSkills.map((id) => entryByName(data, id)).filter((s): s is Skill => !!s)
}

function buildEntry(data: GameData, name: string, kind: 'class' | 'champion'): ModelEntry {
  const skills = kind === 'class' ? classSkills(data, name) : championSkills(data, name)
  const cls = kind === 'class' ? data.heroClasses.find((c) => c.name === name) : undefined
  const nonCombat: string[] = []
  const unclassified: string[] = []
  const gaps: string[] = []
  for (const clause of clausesOf(skills)) {
    const c = classifyClause(clause)
    if (c.kind === 'nonCombat') nonCombat.push(`${clause} — ${c.note}`)
    else if (c.kind === 'gap') gaps.push(c.note)
    else if (c.kind === 'unclassified') unclassified.push(clause)
  }
  const notes = NOTES[name] ?? {}
  // Явное пояснение из NOTES важнее общей формулировки из DELIBERATE_GAPS.
  const missing = notes.missing && notes.missing.length > 0 ? [...notes.missing] : gaps
  const level: ModelLevel = missing.length > 0 ? 'partial' : 'full'
  return {
    name,
    kind,
    promotion: cls?.promotion ?? null,
    level,
    missing,
    assumptions: notes.assumptions ?? [],
    nonCombat,
    unclassified,
  }
}

/** Отчёт по всем классам (42) и всем чемпионам: что смоделировано полностью / частично / нет. */
export function modelingReport(data: GameData): ModelEntry[] {
  return [
    ...data.heroClasses.map((c) => buildEntry(data, c.name, 'class')),
    ...data.champions.map((c) => buildEntry(data, c.name, 'champion')),
  ]
}

/** Отчёт по конкретному классу или чемпиону (для UI). */
export function modelEntryFor(data: GameData, heroOrChampionName: string): ModelEntry | undefined {
  if (data.heroClasses.some((c) => c.name === heroOrChampionName)) return buildEntry(data, heroOrChampionName, 'class')
  if (data.champions.some((c) => c.name === heroOrChampionName)) return buildEntry(data, heroOrChampionName, 'champion')
  return undefined
}

/** Подпись для UI у героя, чей класс смоделирован не полностью: `null` — показывать нечего. */
export function modelWarning(data: GameData, className: string): { level: ModelLevel; text: string } | null {
  const e = modelEntryFor(data, className)
  if (!e) return null
  const parts: string[] = []
  if (e.missing.length > 0) parts.push(`оценка приблизительная: не учтено — ${e.missing.join('; ')}`)
  if (e.assumptions.length > 0) parts.push(`учтено с допущениями: ${e.assumptions.join('; ')}`)
  if (parts.length === 0) return null
  return { level: e.level, text: parts.join('. ') }
}

/** Строка таблицы для docs/PROGRESS.md. */
export function reportRow(e: ModelEntry): string {
  const level = e.level === 'full' ? 'полностью' : e.level === 'partial' ? 'частично' : 'нет'
  const detail = [...e.missing, ...e.assumptions.map((a) => `⚠️ ${a}`)].join('; ')
  return `| ${e.name}${e.promotion ? ` → ${e.promotion}` : ''} | ${e.kind === 'class' ? 'класс' : 'чемпион'} | ${level} | ${detail || '—'} |`
}
