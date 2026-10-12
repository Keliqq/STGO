/**
 * Команды: сохранённые составы отряда для конкретной локации (требование владельца, сессия 27).
 *
 * Что хранится: имя команды, состав (герои — снимком экипировки и навыков на момент сохранения,
 * см. `TeamMember`), чемпион с рангом, аурой, фамильяром и духом, целевая локация и сложность.
 * Почему герои — снимком, а не ссылкой на `HeroInstance.id`: команда должна оставаться воспроизводимой
 * и сравниваемой, даже если героя потом переоденут. Ссылка (`heroId`) сохраняется отдельно — по ней
 * команда ищет «живого» героя (например, чтобы отметить погибших по имени).
 *
 * Правила состава (`validateParty`) — из листа QUESTS (`Maximum Party Size`) и требования владельца:
 * «не больше одного чемпиона в отряде». Типовой отряд по ST-Central — 1 чемпион + 3 героя, но игра
 * допускает и 4 героев без чемпиона, и соло/дуэт, поэтому нижней границы у проверки нет — только
 * предупреждение «отряд меньше, чем влезает в локацию».
 */
import { z } from 'zod'
import { championEquipment } from '../engine/combat.ts'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'
import { HeroSlotSchema, QUALITIES, type GameData, type HeroInstance, type Quest } from './types.ts'

/** Версия записи команд. 1 — первая. */
export const TEAMS_VERSION = 1

/**
 * Участник команды: снимок героя (`hero`) + ссылка на сохранённого героя (`heroId`).
 * Снимок — то, по чему идёт расчёт; ссылка — для поиска оригинала и обновления снимка.
 */
export const TeamMemberSchema = z.object({
  heroId: z.string().nullable(),
  hero: z.object({
    id: z.string().min(1),
    name: z.string(),
    className: z.string().min(1),
    level: z.number().int().min(1).max(99),
    titanSoul: z.boolean(),
    slots: z.array(HeroSlotSchema).length(6),
    skills: z.array(z.string()),
    seeds: z.object({ atk: z.number().nonnegative(), def: z.number().nonnegative(), hp: z.number().nonnegative() }),
    draft: z.boolean().optional(),
  }),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>

/** Чемпион команды: имя, ранг и экипировка (аурасонг + фамильяр + дух в нём). */
export const ChampionBuildSchema = z.object({
  champion: z.string().min(1),
  rank: z.number().int().min(1).max(20),
  aura: z.object({ item: z.string().min(1), quality: z.enum(QUALITIES) }).nullable(),
  familiar: z.object({ item: z.string().min(1), quality: z.enum(QUALITIES) }).nullable(),
  spirit: z.string().nullable(),
})
export type TeamChampion = z.infer<typeof ChampionBuildSchema>

/** Целевая локация команды: квест (id) и человекочитаемая подпись на момент сохранения. */
export const TeamTargetSchema = z.object({
  questId: z.string(),
  label: z.string(),
})
export type TeamTarget = z.infer<typeof TeamTargetSchema>

export const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  members: z.array(TeamMemberSchema),
  champion: ChampionBuildSchema.nullable(),
  /**
   * Лишние чемпионы, если команда записана с нарушением («не больше одного чемпиона»).
   * В интерфейсе второй чемпион выбрать нельзя, поле существует, чтобы правило было проверяемым
   * и чтобы чужая/старая запись не терялась молча. Пустой массив — обычный случай.
   */
  extraChampions: z.array(ChampionBuildSchema).optional(),
  target: TeamTargetSchema.nullable(),
  /** Заметка пользователя (например, «для фарма эликсиров»). */
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Team = z.infer<typeof TeamSchema>

/** Снимок героя для команды (без эталона и черновикового происхождения: они к бою не относятся). */
export function memberFromHero(hero: HeroInstance): TeamMember {
  return {
    heroId: hero.id,
    hero: {
      id: hero.id,
      name: hero.name,
      className: hero.className,
      level: hero.level,
      titanSoul: hero.titanSoul,
      slots: hero.slots.map((s) => ({ ...s })),
      skills: [...hero.skills],
      seeds: { ...hero.seeds },
      draft: hero.draft,
    },
  }
}

/** Снимок героя → `HeroInstance` для движка. Эталона нет: команда считается «героем как записан». */
export function heroFromMember(member: TeamMember): HeroInstance {
  return {
    ...member.hero,
    reference: null,
    draft: member.hero.draft ?? false,
    originId: null,
  }
}

/**
 * Обновить снимок участника данными сохранённого героя, сохранив связь по id: нужно для кнопки
 * «обновить состав из героев» — команда перестаёт отставать от текущей экипировки и уровня.
 * Герой с чужим id не подменяется (иначе можно было бы случайно перепутать участников).
 */
export function fitMemberToHero(member: TeamMember, hero: HeroInstance): TeamMember {
  if (member.heroId !== null && member.heroId !== hero.id) return member
  return memberFromHero(hero)
}

/** Сборка чемпиона команды: имя, ранг и (необязательно) аурасонг, фамильяр и дух. */
export function championBuild(
  champion: string,
  rank: number,
  gear: { aura?: TeamChampion['aura']; familiar?: TeamChampion['familiar']; spirit?: string | null } = {},
): TeamChampion {
  return {
    champion,
    rank,
    aura: gear.aura ?? null,
    familiar: gear.familiar ?? null,
    spirit: gear.spirit ?? null,
  }
}

/** Подпись команды: «Антуан + Беовульф + Эбигейл + Argon». */
export function teamLabel(team: Team): string {
  return [...team.members.map((m) => m.hero.name), team.champion?.champion].filter(Boolean).join(' + ')
}

/** Сколько бойцов в команде (герои + чемпион, если он выбран). */
export function partySizeOf(team: Team): number {
  return team.members.length + (team.champion ? 1 : 0)
}

export type PartyIssueCode = 'size' | 'champion' | 'empty'

export interface PartyIssue {
  code: PartyIssueCode
  message: string
}

/**
 * Проверка состава команды под локацию (лист QUESTS → `Maximum Party Size`; требование владельца —
 * «не больше одного чемпиона»). Отсутствие локации (`quest` = null) проверяет только «есть кто-то»
 * и «один чемпион»: размер локации неизвестен.
 */
export function validateParty(team: Team, quest: Quest | null, areaPartySize?: number | null): PartyIssue[] {
  const issues: PartyIssue[] = []
  const size = partySizeOf(team)
  if (size === 0) issues.push({ code: 'empty', message: 'В команде нет ни одного героя и нет чемпиона.' })
  // ASSUMPTION: A67 — размер отряда: `Maximum Party Size` локации (3/4/5), чемпион занимает место героя.
  if (extraChampionsOf(team) > 1) {
    issues.push({ code: 'champion', message: `В отряде ${extraChampionsOf(team)} чемпиона — игра пускает только одного.` })
  }
  const max = areaPartySize ?? null
  if (max != null && size > max) {
    issues.push({
      code: 'size',
      message: `В локации «${quest?.area ?? ''}» в отряд помещается ${max} бойцов, а в команде ${size}.`,
    })
  }
  return issues
}

/** Сколько чемпионов записано в команде (обычная команда — 1 или 0; больше — нарушение правила). */
export function extraChampionsOf(team: Team): number {
  return (team.champion ? 1 : 0) + (team.extraChampions?.length ?? 0)
}

/** Помещается ли состав в локацию (без учёта «чемпион — не герой»: это отдельная проверка). */
export function fitsPartySize(team: Team, areaPartySize: number | null): boolean {
  return areaPartySize == null || partySizeOf(team) <= areaPartySize
}

// ───────────────────────────── хранение ─────────────────────────────

const StoredTeamsSchema = z.object({ version: z.literal(TEAMS_VERSION), teams: z.array(TeamSchema) })

export interface LoadedTeams {
  teams: Team[]
  error: string | null
}

export async function loadTeams(store: KeyValueStore = idbStore): Promise<LoadedTeams> {
  const raw = await store.get<unknown>(KEYS.teams)
  if (raw === undefined) return { teams: [], error: null }
  const parsed = StoredTeamsSchema.safeParse(raw)
  if (!parsed.success) return { teams: [], error: 'Сохранённые команды не прочитаны: формат не совпадает с текущей версией.' }
  return { teams: parsed.data.teams, error: null }
}

export async function saveTeams(teams: Team[], store: KeyValueStore = idbStore): Promise<void> {
  await store.set(KEYS.teams, { version: TEAMS_VERSION, teams })
}

export async function upsertTeam(team: Team, store: KeyValueStore = idbStore): Promise<Team[]> {
  const { teams } = await loadTeams(store)
  const rest = teams.filter((t) => t.id !== team.id)
  const next = [...rest, team]
  await saveTeams(next, store)
  return next
}

export async function removeTeam(id: string, store: KeyValueStore = idbStore): Promise<Team[]> {
  const { teams } = await loadTeams(store)
  const next = teams.filter((t) => t.id !== id)
  await saveTeams(next, store)
  return next
}

/** Новая пустая команда (id и время задаёт вызывающий, чтобы функция оставалась чистой). */
export function newTeam(id: string, at: string = new Date().toISOString()): Team {
  return { id, name: 'Новая команда', members: [], champion: null, extraChampions: [], target: null, createdAt: at, updatedAt: at }
}

/**
 * Команда использует героя (по ссылке или по снимку). Нужно для «сколько команд у героя»:
 * в «плане на локацию» герой должен быть только в одной команде, в вариантах — в нескольких.
 */
export function teamUsesHero(team: Team, heroId: string): boolean {
  return team.members.some((m) => m.heroId === heroId || m.hero.id === heroId)
}

/** Команды, в которых встречается герой (для предупреждения «герой уже в другой команде»). */
export function teamsWithHero(teams: Team[], heroId: string, exceptTeamId?: string): Team[] {
  return teams.filter((t) => t.id !== exceptTeamId && teamUsesHero(t, heroId))
}

/** Локация команды из данных (по id квеста); null — квест исчез из таблицы. */
export function targetQuest(team: Team, data: GameData): Quest | null {
  if (!team.target) return null
  return data.quests.find((q) => q.id === team.target?.questId) ?? null
}

/** Размер отряда локации по её имени (QUESTS → `Maximum Party Size`); null — локации нет в данных. */
export function areaPartySize(data: GameData, areaName: string | null | undefined): number | null {
  if (!areaName) return null
  return data.questAreas.find((a) => a.name === areaName)?.partySize ?? null
}

/** Варианты экипировки чемпиона из данных: аурасонги, фамильяры и духи. */
export function championGearChoices(data: GameData): { auras: string[]; familiars: string[]; spirits: string[] } {
  const byName = (a: string, b: string): number => (a < b ? -1 : 1)
  return {
    auras: data.items.filter((i) => i.type === 'Aurasong').map((i) => i.name).sort(byName),
    familiars: data.items.filter((i) => i.type === 'Familiar').map((i) => i.name).sort(byName),
    spirits: data.enchants.filter((e) => e.kind === 'spirit').map((e) => e.name).sort(byName),
  }
}

/**
 * Что даёт экипировка чемпиона — подпись для интерфейса. Считает тот же `championEquipment`, что и бой,
 * поэтому подпись не может разойтись с расчётом. `notes` — чего нет в данных (предупреждение в UI).
 */
export function championGearSummary(gear: TeamChampion | null, data: GameData): { effects: string[]; stats: string; notes: string[] } {
  if (!gear) return { effects: [], stats: '', notes: [] }
  const eq = championEquipment(gear, data)
  const effects = eq.skills.map((s) => `${s.name}: ${s.text}`)
  const stats = eq.stats.atk + eq.stats.def + eq.stats.hp > 0 ? `+${eq.stats.atk} ATK, +${eq.stats.def} DEF, +${eq.stats.hp} HP` : ''
  const notes = [
    eq.notes.missingAura ? `аурасонг «${eq.notes.missingAura}» не найден в данных` : '',
    eq.notes.missingFamiliar ? `фамильяр «${eq.notes.missingFamiliar}» не найден в данных` : '',
    eq.notes.missingSpirit ? `дух «${eq.notes.missingSpirit}» не найден в данных` : '',
  ].filter(Boolean)
  return { effects, stats, notes }
}
