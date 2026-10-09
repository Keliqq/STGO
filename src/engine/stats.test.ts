import { describe, expect, it } from 'vitest'
import type { Enchant, GameData, HeroInstance, HeroSlot, Item, Skill } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { calcStats, DEFAULT_MODEL, floorStat, heroElementValue, skillTierFor, type StatModel } from './stats.ts'

const data = fixtureGameData()
const lineRoot = (line: string): string => {
  const s = data.skills.find((x) => x.line === line && x.tier === 1)
  if (!s) throw new Error(`нет линейки ${line}`)
  return s.id
}
const empty: HeroSlot = { item: null, quality: 'Normal', element: null, spirit: null }

function hero(over: Partial<HeroInstance>): HeroInstance {
  return {
    id: 't',
    name: 'Test',
    className: 'Geomancer',
    level: 26,
    titanSoul: false,
    slots: [empty, empty, empty, empty, empty, empty],
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
    ...over,
  }
}

/** База Gong из примера компендиума. */
const gongModel: StatModel = { ...DEFAULT_MODEL, baseAt: () => ({ atk: 887, def: 0, hp: 0 }) }

describe('floorStat', () => {
  it('дробная часть отбрасывается, ошибки двоичной арифметики не портят целые', () => {
    expect(floorStat(16307.55)).toBe(16307)
    expect(floorStat(16307.99)).toBe(16307)
    expect(floorStat(5060 * 3.15)).toBe(15939)
    expect(floorStat(10)).toBe(10)
  })
})

describe('Combat Compendium: Geomancer Gong', () => {
  it('числа из статьи (2020): ATK = 16307', () => {
    // Синтетические сущности с числами статьи: предметы уже нужного качества, Wolf/Eagle по 16 ATK,
    // Wand Mastery 2-й ступени +100%, Extended Warranty +30%, Double Cast +100%, Electric Arc +80%, Wolf +5%.
    const d: GameData = structuredClone(data)
    const stats = (atk: number) => ({ atk, def: 0, hp: 0, eva: 0, crit: 0, manaShield: 0 })
    const item = (name: string, type: string, atk: number, builtIn: string | null = null): Item => ({
      name, type, tier: 8, isEquipment: true, unlock: null,
      stats: { Normal: stats(atk), Superior: stats(atk), Flawless: stats(atk), Epic: stats(atk), Legendary: stats(atk) },
      elementAffinity: [], spiritAffinity: null, builtInElement: builtIn, builtInSpirit: null, artifactSkill: null,
      starforged: [], transcendence: [], imageId: null,
    })
    const skill = (name: string, effects: Skill['effects'], ignored: string[] = []): Skill => ({
      id: name, name, type: 'Hero', tier: 1, rarity: null, upgradeCost: null, text: name, effects, ignored, unparsed: [],
      classesRaw: [], classes: ['Geomancer'], champions: [], requiresPromotion: false, line: name,
    })
    const spirit = (name: string, sk: string): Enchant => ({
      name, kind: 'spirit', element: null, elementValue: null, tier: 4, stats: stats(16), skill: sk, skillPlus: null, iconId: null, imageId: null,
    })
    d.items.push(item('T Wand of Midas', 'Wand', 1230), item('T Mistpeak Bloom', 'Herbal Medicine', 163, 'T Tide'), item('T Tarot Deck', 'Spell', 795))
    d.enchants.push(
      { name: 'T Tide', kind: 'element', element: 'Water', elementValue: 10, tier: 7, stats: stats(38), skill: null, skillPlus: null, iconId: null, imageId: null },
      spirit('T Wolf', 'T Wolf Ferocity'),
      spirit('T Eagle', 'T Eagle Accuracy'),
    )
    d.skills.push(
      skill('T Wand Mastery', [{ stat: 'atk', mode: 'pct', value: 100, scope: 'self', condition: { kind: 'itemType', types: ['Wand'] } }]),
      skill('T Extended Warranty', [{ stat: 'itemStats', mode: 'pct', value: 30, scope: 'self' }]),
      skill('T Double Cast', [{ stat: 'atk', mode: 'pct', value: 100, scope: 'self' }]),
      skill('T Electric Arc', [{ stat: 'atk', mode: 'pct', value: 80, scope: 'self' }]),
      { ...skill('T Wolf Ferocity', [{ stat: 'atk', mode: 'pct', value: 5, scope: 'self' }]), type: 'Enchantment' },
      { ...skill('T Eagle Accuracy', [{ stat: 'crit', mode: 'pct', value: 2, scope: 'self' }]), type: 'Enchantment' },
    )
    // Врождённый Geomancy (+1% ATK за очко стихии) — из данных: при стихии 30 действует 1-я ступень.
    const gong = hero({
      slots: [
        { item: 'T Wand of Midas', quality: 'Normal', element: 'T Tide', spirit: 'T Wolf' },
        { item: 'T Mistpeak Bloom', quality: 'Normal', element: null, spirit: 'T Eagle' },
        { item: 'T Tarot Deck', quality: 'Normal', element: 'T Tide', spirit: 'T Eagle' },
        empty, empty, empty,
      ],
      skills: ['T Wand Mastery', 'T Extended Warranty', 'T Double Cast', 'T Electric Arc'],
    })
    const s = calcStats(gong, d, { model: gongModel })
    expect(s.elementAny).toBe(30)
    expect(s.breakdown.items.map((c) => c.total.atk)).toEqual([2953, 233, 1104])
    expect(s.breakdown.pct.atk).toBeCloseTo(2.15)
    expect(s.atk).toBe(16307) // 5177 × 3.15 = 16307.55
  })

  it('те же предметы на текущих данных таблицы: ATK = 15797', () => {
    // Текущие значения: Wolf/Eagle Spirit дают 19 ATK; Mistpeak Bloom Normal 140 → Flawless 210;
    // при стихии 30 (3 Tide, один встроен в Mistpeak) Wand Master — 2-я ступень (+100%, порог 20),
    // Extended Warranty — 1-я (+20%, порог 2-й = 60), Double Cast и Electric Arc — 1-я.
    // Жезл:   (1230 + 38 + 19) × (1 + 1.0 + 0.2) = 2831.4 → 2831
    // Mistpeak (встроенный Tide уже в статах предмета): (210 + 19) × 1.2 = 274.8 → 275
    // Tarot: (795 + 38 + 19) × 1.2 = 1022.4 → 1022
    // ATK = (887 + 2831 + 275 + 1022) × (1 + 0.30 + 1.00 + 0.80 + 0.05) = 5015 × 3.15 = 15797.25 → 15797
    const gong = hero({
      slots: [
        { item: 'Wand of Midas', quality: 'Legendary', element: 'Tide Element', spirit: 'Wolf Spirit' },
        { item: 'Mistpeak Bloom', quality: 'Flawless', element: null, spirit: 'Eagle Spirit' },
        { item: 'Tarot Deck', quality: 'Flawless', element: 'Tide Element', spirit: 'Eagle Spirit' },
        empty, empty, empty,
      ],
      skills: ['Extended Warranty', 'Wand Master', 'Double Cast', 'Electric Arc'].map(lineRoot),
    })
    const s = calcStats(gong, data, { model: gongModel })
    expect(s.element).toBe(30)
    expect(s.breakdown.skills.map((k) => k.name).slice(0, 5)).toEqual(['Extended Warranty', 'Wand Lord', 'Double Cast', 'Electric Arc', 'Geomancy'])
    expect(s.breakdown.items.map((c) => c.total.atk)).toEqual([2831, 275, 1022])
    expect(s.atk).toBe(15797)
  })
})

describe('правила предметов', () => {
  it('камень и дух добавляют только статы, которые у предмета есть', () => {
    const h = hero({ slots: [{ item: 'Warlord Plate', quality: 'Normal', element: 'Blaze Element', spirit: 'Lion Spirit' }, empty, empty, empty, empty, empty] })
    const c = calcStats(h, data, { model: { ...DEFAULT_MODEL, baseAt: () => ({ atk: 0, def: 0, hp: 0 }) } }).breakdown.items[0]
    // Warlord Plate: ATK 0, DEF 170, HP 11; Blaze 48/32/10, Lion 48/32/10
    expect(c.enchantStats).toEqual({ atk: 0, def: 64, hp: 20 })
  })

  it('«stats with <тип>» не усиливает DEF (A25), «bonus from all items» — усиливает', () => {
    const ring: HeroSlot = { item: 'Twin Coiled Ring', quality: 'Normal', element: null, spirit: null }
    const monk = hero({ className: 'Monk', slots: [empty, empty, empty, empty, ring, empty] })
    const c = calcStats(monk, data).breakdown.items[0]
    expect(c.multiplier.atk).toBe(1.5) // Pressure Points, 1-я ступень: +50% stats with Ring
    expect(c.multiplier.def).toBe(1)
  })

  it('стихия героя — только камни его стихии; ступени навыков — по порогам', () => {
    const slots: HeroSlot[] = [
      { item: 'Owl Wing Wand', quality: 'Normal', element: 'Tide Element', spirit: null },
      { item: "Aang's Robe", quality: 'Normal', element: 'Flame Element', spirit: null },
      empty, empty, empty, empty,
    ]
    expect(heroElementValue(hero({ slots }), data)).toEqual({ element: 10, elementAny: 20 })
    const line = data.skills.filter((s) => s.line === 'Thick Skin').sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    expect(skillTierFor(line, 29, false).name).toBe('Thick Skin')
    expect(skillTierFor(line, 30, false).name).toBe('Stone Skin')
    expect(skillTierFor(line, 500, false).name).toBe('Adamantine Skin') // 4-я — только после промоушена
    expect(skillTierFor(line, 500, true).name).toBe('Titan Skin')
  })

  it('эталон экспорта: при том же уровне база берётся из него и статы воспроизводятся', () => {
    const slots: HeroSlot[] = [{ item: 'Owl Wing Wand', quality: 'Normal', element: 'Tide Element', spirit: 'Bear Spirit' }, empty, empty, empty, empty, empty]
    const stats = { hp: 300, atk: 2000, def: 400, threat: 10, crit: 0.05, critDmg: 2, eva: 0, element: 10 }
    const h = hero({ slots, reference: { level: 26, slots, skills: [], stats } })
    const s = calcStats(h, data)
    expect(s.breakdown.baseSource).toBe('reference')
    expect([s.atk, s.def, s.hp]).toEqual([2000, 400, 300])
    expect(calcStats({ ...h, level: 27 }, data).breakdown.baseSource).toBe('model')
  })
})
