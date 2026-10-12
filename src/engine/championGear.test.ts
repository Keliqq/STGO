/**
 * Экипировка чемпиона (A67): аурасонг + фамильяр (+ дух в нём).
 *
 * Проверяется то, на чём стоит модель: статы предметов с качеством, навык аурасонга бьёт по всему
 * отряду (а не только по чемпиону), навык духа действует по правилам сродства (A5), ненайденный
 * предмет не выдумывается, а попадает в `notes` (UI показывает это предупреждением).
 */
import { describe, expect, it } from 'vitest'
import { fixtureGameData } from '../test/fixtures.ts'
import { championEquipment, fighterFromChampion, fighterFromHero, prepare, simulateTeam } from './combat.ts'
import { applyQuality } from './quality.ts'

const data = fixtureGameData()

/** Какой-нибудь чемпион с лидерскими навыками по рангам. */
const champion = data.champions.find((c) => c.name === 'Argon')!

/** Квест LCOG (без барьера) — для проверки, что бонус ауры доходит до всех бойцов. */
const lcogQuest = data.quests.find((q) => q.area === 'Lost City of Gold' && q.difficulty === '13')!

const auraItem = data.items.find((i) => i.type === 'Aurasong' && i.name === 'Aura of Inspiration')!
const familiarItem = data.items.find((i) => i.type === 'Familiar')!

/** Кукла героя: класс из данных, без экипировки и навыков. */
function heroOf(className: string, level = 30) {
  const cls = data.heroClasses.find((c) => c.name === className)!
  return {
    id: `hero-${className}`,
    name: className,
    className: cls.name,
    level,
    titanSoul: false,
    slots: Array.from({ length: 6 }, () => ({ item: null, quality: 'Normal' as const, element: null, spirit: null })),
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
    draft: false,
    originId: null,
  }
}

describe('экипировка чемпиона: статы предметов', () => {
  it('аурасонг даёт свои DEF/HP с множителем качества, фамильяр — свои статы', () => {
    const bare = fighterFromChampion(champion, 5, data)
    const legendary = fighterFromChampion(champion, 5, data, {
      champion: champion.name,
      rank: 5,
      aura: { item: auraItem.name, quality: 'Legendary' },
      familiar: { item: familiarItem.name, quality: 'Legendary' },
    })
    const auraStats = applyQuality(auraItem.stats.Normal, 'Legendary')
    const famStats = applyQuality(familiarItem.stats.Normal, 'Legendary')
    expect(legendary.def - bare.def).toBe(auraStats.def + famStats.def)
    expect(legendary.hp - bare.hp).toBe(auraStats.hp + famStats.hp)
    expect(legendary.atk - bare.atk).toBe(auraStats.atk + famStats.atk)
  })

  it('качество ауры меняет только статы предмета, но не силу ауры', () => {
    const normal = championEquipment({ aura: { item: auraItem.name, quality: 'Normal' } }, data)
    const legendary = championEquipment({ aura: { item: auraItem.name, quality: 'Legendary' } }, data)
    expect(normal.skills.map((s) => s.id)).toEqual(legendary.skills.map((s) => s.id))
    expect(legendary.stats.def).toBeGreaterThan(normal.stats.def)
  })

  it('«Аура Вдохновения» — сбалансированный выбор: +12% ATK, +12% DEF и +12% HP отряду', () => {
    const eq = championEquipment({ aura: { item: 'Aura of Inspiration', quality: 'Normal' } }, data)
    const skill = eq.skills.find((s) => s.type === 'Aurasong')
    expect(skill?.name).toBe('Aura of Inspiration')
    // Все три эффекта — на отряд (в бою `prepare` раскладывает их по всем бойцам, а не только на чемпиона).
    expect(skill?.effects).toEqual([
      { stat: 'atk', mode: 'pct', value: 12, scope: 'party' },
      { stat: 'def', mode: 'pct', value: 12, scope: 'party' },
      { stat: 'hp', mode: 'pct', value: 12, scope: 'party' },
    ])
  })

  it('бонус ауры получают все бойцы отряда, а не только чемпион', () => {
    const hero = heroOf('Knight')
    const hf = fighterFromHero(hero, data)
    const cf = fighterFromChampion(champion, 5, data, { champion: champion.name, rank: 5, aura: { item: 'Aura of Inspiration', quality: 'Normal' } })
    const withAura = prepare([hf, cf], lcogQuest, {})
    const without = prepare([hf, fighterFromChampion(champion, 5, data)], lcogQuest, {})
    // Аура — +12% ATK/DEF/HP: у героя выросли и статические модификаторы боя, и максимум HP.
    expect(withAura.selfStatic[0].atkPct).toBeGreaterThan(without.selfStatic[0].atkPct)
    expect(withAura.selfStatic[0].defPct).toBeGreaterThan(without.selfStatic[0].defPct)
    expect(withAura.maxHp[0]).toBeGreaterThan(without.maxHp[0])
    // И у самого чемпиона тоже (аура — «to the party», значит и на носителя).
    expect(withAura.selfStatic[1].atkPct).toBeGreaterThan(without.selfStatic[1].atkPct)
  })

  it('дух в фамильяре даёт носителю свой навык; «+»-версия — по сродству фамильяра (A5)', () => {
    // Kirin — фамильяр со Spirit Affinity = Kirin Serenity: дух Kirin Spirit получает «+»-версию.
    const kirin = data.items.find((i) => i.name === 'Kirin')
    const spirit = data.enchants.find((e) => e.name === 'Kirin Spirit')
    if (!kirin || !spirit) return
    const eq = championEquipment({ familiar: { item: kirin.name, quality: 'Normal' }, spirit: spirit.name }, data)
    const plus = data.skills.find((s) => s.id === spirit.skillPlus)
    expect(eq.skills.map((s) => s.id)).toContain(plus?.id)
    // А без сродства (Wildcard-фамильяр) — обычная версия.
    const plain = data.items.find((i) => i.type === 'Familiar' && i.spiritAffinity === null)!
    const eq2 = championEquipment({ familiar: { item: plain.name, quality: 'Normal' }, spirit: spirit.name }, data)
    expect(eq2.skills.map((s) => s.id)).toContain(spirit.skill)
  })

  it('ненайденные предмет и дух попадают в notes, а не выдумываются', () => {
    const eq = championEquipment({ aura: { item: 'Нет такой ауры', quality: 'Normal' }, familiar: { item: 'Нет такого фамильяра', quality: 'Normal' }, spirit: 'Нет такого духа' }, data)
    expect(eq.stats).toEqual({ atk: 0, def: 0, hp: 0 })
    expect(eq.skills).toEqual([])
    expect(eq.notes).toEqual({ missingAura: 'Нет такой ауры', missingFamiliar: 'Нет такого фамильяра', missingSpirit: 'Нет такого духа' })
  })

  it('без экипировки чемпион считается как раньше (обратная совместимость)', () => {
    const before = fighterFromChampion(champion, 5, data)
    const after = fighterFromChampion(champion, 5, data, null)
    expect(after).toEqual(before)
    expect(fighterFromChampion(champion, 5, data, { champion: champion.name, rank: 5 }).def).toBe(before.def)
  })
})

describe('экипировка чемпиона: влияние на бой', () => {
  it('аура с фамильяром дают не меньше побед, чем голый чемпион, на том же seed', () => {
    const team = () => [fighterFromHero(heroOf('Knight'), data), fighterFromHero(heroOf('Berserker'), data)]
    const bare = simulateTeam([...team(), fighterFromChampion(champion, 5, data)], lcogQuest, { runs: 400, seed: 7 })
    const geared = simulateTeam(
      [...team(), fighterFromChampion(champion, 5, data, {
        champion: champion.name,
        rank: 5,
        aura: { item: 'Aura of Inspiration', quality: 'Normal' },
        familiar: { item: familiarItem.name, quality: 'Normal' },
      })],
      lcogQuest,
      { runs: 400, seed: 7 },
    )
    expect(geared.winRate).toBeGreaterThanOrEqual(bare.winRate)
    // В этом квесте отряд гибнет всегда (win rate 0), поэтому раунды — это время выживания:
    // с аурой и фамильяром отряд бьёт сильнее и живёт не меньше. Проверять «не больше раундов» нельзя:
    // у гибнущего отряда рост защиты как раз удлиняет бой (после переподгонки базы A8 метрика так и перевернулась).
    expect(geared.avgDamagePerRound).toBeGreaterThanOrEqual(bare.avgDamagePerRound)
    expect(geared.avgRounds).toBeGreaterThanOrEqual(bare.avgRounds - 0.1)
  })

  it('прогон одинакового seed даёт одинаковые метрики (детерминизм)', () => {
    const fighters = [
      fighterFromHero(heroOf('Knight'), data),
      fighterFromChampion(champion, 5, data, { champion: champion.name, rank: 5, aura: { item: 'Aura of Inspiration', quality: 'Normal' } }),
    ]
    const a = simulateTeam(fighters, lcogQuest, { runs: 200, seed: 99 })
    const b = simulateTeam(fighters, lcogQuest, { runs: 200, seed: 99 })
    const c = simulateTeam(fighters, lcogQuest, { runs: 200, seed: 100 })
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })

  it('чемпион из фикстуры находится по имени, как его ищет команда', () => {
    expect(data.champions.find((c) => c.name === champion.name)).toBe(champion)
    expect(champion.leaderSkills.length).toBeGreaterThan(0)
  })
})
