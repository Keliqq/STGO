import { describe, expect, it } from 'vitest'
import { fixtureGameData, fixtureSheets, withCell } from '../test/fixtures.ts'
import { buildGameData } from './build.ts'
import { SchemaError } from './parse/cells.ts'
import { GameDataSchema } from './types.ts'

const data = fixtureGameData()

const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)

describe('buildGameData на фикстурах', () => {
  it('количество сущностей', () => {
    expect({
      items: data.items.length,
      enchants: data.enchants.length,
      heroClasses: data.heroClasses.length,
      heroLevels: data.heroLevels.length,
      skills: data.skills.length,
      champions: data.champions.length,
      questAreas: data.questAreas.length,
      quests: data.quests.length,
      elementBreakpoints: data.championElementBreakpoints.length,
    }).toEqual({
      items: 1549,
      enchants: 73,
      heroClasses: 42,
      heroLevels: 50,
      skills: 621,
      champions: 13,
      questAreas: 15,
      quests: 138,
      elementBreakpoints: 10,
    })
    expect(data.rejects).toEqual([])
  })

  it('нет дублей ключей', () => {
    expect(dupes(data.items.map((i) => i.name))).toEqual([])
    expect(dupes(data.enchants.map((e) => e.name))).toEqual([])
    expect(dupes(data.heroClasses.map((c) => c.name))).toEqual([])
    expect(dupes(data.skills.map((s) => s.id))).toEqual([])
    expect(dupes(data.champions.map((c) => c.name))).toEqual([])
    expect(dupes(data.quests.map((q) => q.id))).toEqual([])
    // Повтор имени в SKILLS получает суффикс
    expect(data.skills.filter((s) => s.name === "Midas' Tragedy").map((s) => s.id)).toEqual(["Midas' Tragedy", "Midas' Tragedy #2"])
  })

  it('у каждого класса 6 слотов и на каждый слот есть предметы', () => {
    const equipmentTypes = new Set(data.items.filter((i) => i.isEquipment).map((i) => i.type))
    for (const c of data.heroClasses) {
      expect(c.slots, c.name).toHaveLength(6)
      c.slots.forEach((types, k) => {
        expect(types.some((t) => equipmentTypes.has(t)), `${c.name}, слот ${k + 1}: ${types.join('/')}`).toBe(true)
      })
    }
  })

  it('связи: промоушены, врождённые навыки, Душа Титана', () => {
    const merc = data.heroClasses.find((c) => c.name === 'Mercenary')!
    expect(merc.baseClass).toBe('Soldier')
    expect(data.heroClasses.find((c) => c.name === 'Soldier')?.promotion).toBe('Mercenary')
    expect(merc.innateSkills).toEqual(['Second-in-Command', 'Elite Mercenary', 'Supreme Sellsword'])
    expect(merc.innateTitanSkill).toBe('Sellsword Lord')
    expect(data.heroClasses.every((c) => c.innateSkills.length > 0)).toBe(true)
  })

  it('группы в Classes раскрыты; чемпионы отделены', () => {
    const adept = data.skills.find((s) => s.name === 'Adept')!
    expect(adept.classes).toEqual(expect.arrayContaining(['Mage', 'Archmage', 'Geomancer', 'Dancer']))
    expect(adept.classes).not.toContain('Soldier')
    expect(data.skills.find((s) => s.name === 'Aura of Courage')?.champions).toEqual(['Argon'])
    expect(data.champions.find((c) => c.name === 'Argon')?.leaderSkills).toHaveLength(4)
  })

  it('духи: навык и «+»-версия, статы из BLUEPRINTS; камни: стихия и величина', () => {
    expect(data.enchants.find((e) => e.name === 'Ram Spirit')).toMatchObject({
      kind: 'spirit',
      skill: 'Ram Robustness',
      skillPlus: 'Ram Robustness+',
      stats: { atk: 19, def: 12, hp: 4 },
      iconId: 'turtle',
    })
    expect(data.enchants.filter((e) => e.kind === 'spirit').every((e) => e.skill && e.skillPlus)).toBe(true)
    expect(data.enchants.find((e) => e.name === 'Inferno Element')).toMatchObject({ element: 'Fire', elementValue: 25, tier: 12 })
  })

  it('предметы: качество, артефакты, встроенная стихия', () => {
    const sword = data.items.find((i) => i.name === 'Squire Sword')!
    expect(sword.stats.Normal.atk).toBe(16)
    expect(sword.stats.Legendary.atk).toBe(48)
    expect(data.items.find((i) => i.name === 'Kiku-Ichimonji')?.artifactSkill).toBe("Muramonji's Style")
    expect(data.items.filter((i) => i.artifactSkill).length).toBeGreaterThanOrEqual(11)
    expect(data.items.some((i) => i.builtInElement)).toBe(true)
  })

  it('≥95% предметов имеют id картинки', () => {
    const withImage = data.items.filter((i) => i.imageId).length
    expect(withImage / data.items.length).toBeGreaterThanOrEqual(0.95)
  })

  it('результат проходит GameDataSchema', () => {
    expect(GameDataSchema.safeParse(data).success).toBe(true)
  })

  it('непарсящаяся строка → в rejects (с листом, строкой и причиной), остальное собирается', () => {
    const raw = fixtureSheets()
    raw.BLUEPRINTS = withCell(raw.BLUEPRINTS, 1, 5, 'первый') // Tier у Squire Sword
    const d = buildGameData(raw)
    expect(d.rejects).toEqual([{ sheet: 'BLUEPRINTS', row: 2, key: 'Squire Sword', reason: 'Tier: не число «первый»' }])
    expect(d.items).toHaveLength(1548)
  })

  it('сломанная структура или нехватка листа → SchemaError', () => {
    const raw = fixtureSheets()
    raw.BLUEPRINTS = withCell(raw.BLUEPRINTS, 0, 44, 'Attack')
    expect(() => buildGameData(raw)).toThrow(SchemaError)
    const noSheet = fixtureSheets()
    delete noSheet.SKILLS
    expect(() => buildGameData(noSheet)).toThrow(/SKILLS/)
  })

  it('обрезанный лист (мало строк) → SchemaError по минимальному количеству', () => {
    const raw = fixtureSheets()
    raw.BLUEPRINTS = raw.BLUEPRINTS.slice(0, 200)
    expect(() => buildGameData(raw)).toThrow(/items: собрано/)
  })
})

describe('артефакты с общим именем навыка', () => {
  it('Midas Tragedy: Amulet of Midas (T10) → +25%, Ring of Midas (T15) → +50% (A15)', () => {
    const d = fixtureGameData()
    const skillOf = (n: string) => d.skills.find((s) => s.id === d.items.find((i) => i.name === n)?.artifactSkill)?.text
    expect(skillOf('Amulet of Midas')).toMatch(/\+25%/)
    expect(skillOf('Ring of Midas')).toMatch(/\+50%/)
  })
})
