/**
 * Команды: модель, проверка состава под локацию и прогон (сессия 27).
 *
 * Проверяются три вещи, которые владелец назвал обязательными:
 *   · размер отряда — `Maximum Party Size` локации (3/4/5) и «не больше одного чемпиона»;
 *   · прогон команды детерминирован: один и тот же seed → одни и те же метрики;
 *   · метрики прогона — win rate, гибель каждого участника, барьер и доли ударов босса.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import {
  areaPartySize,
  championBuild,
  extraChampionsOf,
  fitMemberToHero,
  heroFromMember,
  loadTeams,
  memberFromHero,
  newTeam,
  partySizeOf,
  removeTeam,
  saveTeams,
  targetQuest,
  teamLabel,
  teamsWithHero,
  teamUsesHero,
  upsertTeam,
  validateParty,
  type Team,
} from '../data/teams.ts'
import { memoryStore } from '../data/storage.ts'
import type { HeroInstance } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { TEAM_SIM_RUNS, attackShares, barrierSummary, runTeamSync, teamFighters, type TeamRunMember } from './teamRunner.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const heroes: HeroInstance[] = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data).heroes

/** Команда из первых N героев фикстуры (герои фикстуры — импортированные, с эталоном). */
function teamOf(count: number, champion: { name: string; rank: number } | null = null, questId: string | null = null): Team {
  const list = heroes.slice(0, count)
  return {
    ...newTeam('t1', '2026-01-01T00:00:00.000Z'),
    name: 'Тест',
    members: list.map(memberFromHero),
    champion: champion ? championBuild(champion.name, champion.rank) : null,
    target: questId ? { questId, label: questId } : null,
  }
}

const lcog = data.quests.find((q) => q.area === 'Lost City of Gold' && q.difficulty === '13' && q.variant === 'boss')!
const howling = data.quests.find((q) => q.area === 'Howling Woods' && q.variant === 'boss' && q.difficulty === 'Hard')!

describe('размер отряда локации (QUESTS → Maximum Party Size)', () => {
  it('в данных локации на 3, 4 и 5 бойцов', () => {
    expect(areaPartySize(data, 'Howling Woods')).toBe(3)
    expect(areaPartySize(data, 'Sun God\'s Tomb')).toBe(4)
    expect(areaPartySize(data, 'Lost City of Gold')).toBe(5)
    expect(areaPartySize(data, 'Нет такой локации')).toBeNull()
  })

  it('отряд в пределах размера локации проходит проверку; больше — нет', () => {
    const three = teamOf(2, { name: 'Argon', rank: 5 }) // 2 героя + чемпион = 3
    expect(partySizeOf(three)).toBe(3)
    expect(validateParty(three, howling, areaPartySize(data, 'Howling Woods'))).toEqual([])

    const four = teamOf(3, { name: 'Argon', rank: 5 }) // 4 бойца
    expect(validateParty(four, howling, 3).map((i) => i.code)).toEqual(['size'])
    expect(validateParty(four, lcog, 5).map((i) => i.code)).toEqual([])
  })

  it('типовой отряд 1 чемпион + 3 героя влезает только в локацию на 4+', () => {
    const typical = teamOf(3, { name: 'Argon', rank: 5 })
    expect(partySizeOf(typical)).toBe(4)
    expect(validateParty(typical, howling, 3)).toHaveLength(1)
    expect(validateParty(typical, data.quests.find((q) => q.area === 'Meteor Zone') ?? null, 4)).toEqual([])
  })

  it('соло и дуэт разрешены: нижней границы у проверки нет', () => {
    const solo = teamOf(1, null)
    const duo = teamOf(2, null)
    expect(validateParty(solo, howling, 3)).toEqual([])
    expect(validateParty(duo, howling, 3)).toEqual([])
    expect(validateParty(teamOf(0, null), howling, 3).map((i) => i.code)).toEqual(['empty'])
  })

  it('больше одного чемпиона — ошибка состава', () => {
    const two = { ...teamOf(2, { name: 'Argon', rank: 5 }), extraChampions: [championBuild('Lilu', 4)] }
    expect(extraChampionsOf(two)).toBe(2)
    expect(validateParty(two, howling, 4).map((i) => i.code)).toEqual(['champion'])
    expect(extraChampionsOf(teamOf(2, null))).toBe(0)
  })
})

describe('хранение команд', () => {
  it('сохранение, обновление по id и удаление', async () => {
    const store = memoryStore()
    const a = teamOf(2, { name: 'Argon', rank: 5 }, lcog.id)
    await upsertTeam(a, store)
    const b = { ...a, name: 'Переименованная', updatedAt: '2026-02-02T00:00:00.000Z' }
    await upsertTeam(b, store)
    let loaded = await loadTeams(store)
    expect(loaded.error).toBeNull()
    expect(loaded.teams).toHaveLength(1)
    expect(loaded.teams[0].name).toBe('Переименованная')

    await upsertTeam({ ...newTeam('t2', '2026-01-02T00:00:00.000Z'), name: 'Вторая' }, store)
    loaded = await loadTeams(store)
    expect(loaded.teams.map((t) => t.id).sort()).toEqual(['t1', 't2'])

    await removeTeam('t1', store)
    expect((await loadTeams(store)).teams.map((t) => t.id)).toEqual(['t2'])
  })

  it('повреждённая запись не роняет приложение: пустой список и понятная ошибка', async () => {
    const store = memoryStore({ teams: { version: 1, teams: [{ id: 'x' }] } })
    const loaded = await loadTeams(store)
    expect(loaded.teams).toEqual([])
    expect(loaded.error).toMatch(/не прочитаны/)
  })

  it('снимок героя переживает пересохранение и отличается от живой ссылки', async () => {
    const store = memoryStore()
    const team = teamOf(2, null)
    await saveTeams([team], store)
    const restored = (await loadTeams(store)).teams[0]
    expect(restored.members[0].hero.name).toBe(heroes[0].name)
    // Эталона в снимке нет: команда считается по записанным экипировке и уровню (герой «как записан»).
    expect(restored.members[0].hero).not.toHaveProperty('reference')
    expect(heroFromMember(restored.members[0]).reference).toBeNull()

    // Героя переодели и подняли уровень — сам снимок команды не поменялся.
    const changed: HeroInstance = { ...heroes[0], level: heroes[0].level + 5 }
    expect(restored.members[0].hero.level).toBe(heroes[0].level)
    // А «обновить из героя» осознанно подтягивает текущие данные (только своего героя, по id).
    expect(fitMemberToHero(restored.members[0], changed).hero.level).toBe(heroes[0].level + 5)
    expect(fitMemberToHero(restored.members[0], { ...changed, id: 'чужой' })).toEqual(restored.members[0])
  })

  it('команда знает, каких героев она использует', () => {
    const team = teamOf(2, null)
    expect(teamUsesHero(team, heroes[0].id)).toBe(true)
    expect(teamUsesHero(team, 'нет-такого')).toBe(false)
    expect(teamsWithHero([team], heroes[0].id)).toHaveLength(1)
    expect(teamsWithHero([team], heroes[0].id, team.id)).toHaveLength(0)
  })

  it('локация команды находится по id квеста; подпись собирается из состава', () => {
    const team = teamOf(2, { name: 'Argon', rank: 5 }, lcog.id)
    expect(targetQuest(team, data)?.id).toBe(lcog.id)
    expect(teamLabel(team)).toBe(`${heroes[0].name} + ${heroes[1].name} + Argon`)
    expect(targetQuest({ ...team, target: { questId: 'нет', label: 'нет' } }, data)).toBeNull()
  })
})

describe('прогон команды', () => {
  const members: TeamRunMember[] = [
    { hero: heroes[0], build: null },
    { hero: heroes[1], build: null },
    { hero: null, build: championBuild('Argon', 5) },
  ]

  it('бойцы собираются в порядке состава, чемпион — последним', () => {
    const fs = teamFighters(members, data)
    expect(fs.map((f) => f?.name)).toEqual([heroes[0].name, heroes[1].name, 'Argon'])
    expect(fs[2]?.isChampion).toBe(true)
  })

  it('один и тот же seed даёт одинаковые метрики (детерминизм прогона)', () => {
    const a = runTeamSync(members, [lcog], data, { runs: 300, seed: 4242 })
    const b = runTeamSync(members, [lcog], data, { runs: 300, seed: 4242 })
    expect(a).toEqual(b)
    expect(a.seed).toBe(4242)
    expect(a.runs).toBe(300)
    // Другой seed — другой шум (но не обязательство, что метрики разойдутся: сравним только структуру).
    const c = runTeamSync(members, [lcog], data, { runs: 300, seed: 4243 })
    expect(c.quests[0].label).toBe(a.quests[0].label)
  })

  it('метрики: win rate, гибель каждого, раунды, барьер и доли ударов', () => {
    const r = runTeamSync(members, [lcog], data, { runs: 300, seed: 11 })
    const q = r.quests[0]
    expect(q.winRate).toBeGreaterThanOrEqual(0)
    expect(q.winRate).toBeLessThanOrEqual(1)
    expect(q.avgRounds).toBeGreaterThan(0)
    expect(r.winRate).toBeCloseTo(q.winRate)
    expect(q.deaths).toHaveLength(3)
    expect(q.shares).toHaveLength(3)
    // Доли одиночных атак — по угрозе: у чемпиона своя, у героев фикстуры своя; сумма ≤ 1 (часть — AoE).
    expect(q.shares.reduce((a, s) => a + s, 0)).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.members.map((m) => m.name)).toEqual([heroes[0].name, heroes[1].name, 'Argon'])
    expect(r.members[2].isChampion).toBe(true)
    // Вероятность гибели и выживания дают в сумме 1.
    for (const m of r.members) expect(m.deathRate + m.survivalRate).toBeCloseTo(1, 10)
  })

  it('барьер: у квеста без барьера его нет, у квеста с барьером видно, сколько даёт отряд', () => {
    const noBarrier = data.quests.filter((q) => q.barrier === null)
    const withBarrier = data.quests.filter((q) => q.barrier !== null)
    expect(noBarrier.length).toBeGreaterThan(0)
    expect(withBarrier.length).toBeGreaterThan(0)
    const fighters = teamFighters(members, data).filter((f) => f !== null)
    expect(barrierSummary(fighters, noBarrier[0])).toBeNull()
    const s = barrierSummary(fighters, withBarrier[0])
    expect(s?.need).toBe(withBarrier[0].barrier?.hp)
    expect(s?.elements).toEqual(withBarrier[0].barrier?.elements)
    expect(s?.have).toBeGreaterThanOrEqual(0)
  })

  it('доли ударов считаются по угрозе: больше угрозы — больше одиночных ударов', () => {
    const fs = teamFighters(members, data).filter((f) => f !== null)
    const shares = attackShares(fs)
    const sortedByThreat = [...fs].sort((a, b) => b.threat - a.threat)
    const sortedByShare = [...fs].sort((a, b) => b.threat - a.threat).map((f) => shares[fs.indexOf(f)])
    expect(sortedByShare[0]).toBeGreaterThanOrEqual(sortedByShare[sortedByShare.length - 1])
    expect(sortedByThreat.length).toBe(3)
  })

  it('неизвестный чемпион — понятная ошибка, а не пустой бой', () => {
    expect(() => runTeamSync([{ hero: null, build: championBuild('Нет такого', 5) }], [lcog], data, { runs: 10 })).toThrow(/не найден/)
  })

  it('прогонов по умолчанию столько же, сколько у оптимизатора', () => {
    expect(TEAM_SIM_RUNS).toBe(2000)
  })
})
