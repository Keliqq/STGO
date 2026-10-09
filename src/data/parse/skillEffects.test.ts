import { describe, expect, it } from 'vitest'
import { fixtureRows } from '../../test/fixtures.ts'
import { parseSkillEffects, splitClauses } from './skillEffects.ts'

const TYPES = new Set(['Sword', 'Axe', 'Dagger', 'Mace', 'Spear', 'Scythe', 'Bow', 'Crossbow', 'Gun', 'Staff', 'Wand', 'Instrument', 'Catalyst', 'Ring', 'Shield', 'Heavy Armor', 'Helmet', 'Gauntlets', 'Heavy Footwear', 'Herbal Medicine', 'Spell'])
const parse = (t: string) => parseSkillEffects(t, TYPES)

describe('parseSkillEffects — примеры из ТЗ', () => {
  it('"+120% DEF & +30% HP"', () => {
    expect(parse('+120% DEF & +30% HP').effects).toEqual([
      { stat: 'def', mode: 'pct', value: 120, scope: 'self' },
      { stat: 'hp', mode: 'pct', value: 30, scope: 'self' },
    ])
  })

  it('"+200% Attack with Spear" — условие по типу оружия', () => {
    expect(parse('+200% Attack with Spear').effects).toEqual([
      { stat: 'atk', mode: 'pct', value: 200, scope: 'self', condition: { kind: 'itemType', types: ['Spear'] } },
    ])
  })

  it('"+25% Crit Chance", "+75% XP", "+40% bonus stats from EQ"', () => {
    expect(parse('+25% Crit Chance').effects).toEqual([{ stat: 'crit', mode: 'pct', value: 25, scope: 'self' }])
    expect(parse('+75% XP').effects).toEqual([{ stat: 'xp', mode: 'pct', value: 75, scope: 'self' }])
    expect(parse('+40% bonus stats from EQ').effects).toEqual([{ stat: 'itemStats', mode: 'pct', value: 40, scope: 'self' }])
  })
})

describe('parseSkillEffects — навыки на оружие (типы из текста навыка)', () => {
  it('Warlord: запятая внутри списка типов не разделяет клаузы', () => {
    const r = parse('+200% Attack with Sword, Axe, Dagger, Mace, Spear, Scythe')
    expect(r.unparsed).toEqual([])
    expect(r.effects).toEqual([
      { stat: 'atk', mode: 'pct', value: 200, scope: 'self', condition: { kind: 'itemType', types: ['Sword', 'Axe', 'Dagger', 'Mace', 'Spear', 'Scythe'] } },
    ])
  })

  it('War Master: плоские/процентные статы + список оружия', () => {
    const r = parse('+10% Health, +10% Mana Shield, +200% Attack with Sword, Axe, Dagger, Mace, Spear, Scythe')
    expect(r.effects.map((e) => e.stat)).toEqual(['hp', 'manaShield', 'atk'])
    expect(r.effects[2].condition).toMatchObject({ kind: 'itemType', types: expect.arrayContaining(['Scythe']) })
  })

  it('Marksman, Adept, Shield Master, Knight (Defense with …), Monk (stats with Ring)', () => {
    expect(parse('+200% Attack with Bow, Crossbow, Gun').effects[0].condition).toEqual({ kind: 'itemType', types: ['Bow', 'Crossbow', 'Gun'] })
    expect(parse('+200% Attack with Staff, Wand, Instrument, Catalyst').effects[0].condition).toMatchObject({ types: ['Staff', 'Wand', 'Instrument', 'Catalyst'] })
    expect(parse('+100% Defense with Shield').effects[0]).toMatchObject({ stat: 'def', condition: { types: ['Shield'] } })
    expect(parse('+40% Defense with Heavy Armor, Helmet, Gauntlets, Heavy Footwear').effects[0].condition).toMatchObject({ types: ['Heavy Armor', 'Helmet', 'Gauntlets', 'Heavy Footwear'] })
    expect(parse('+100% Critical Hit Damage, +50% stats with Ring').effects).toEqual([
      { stat: 'critDmg', mode: 'pct', value: 100, scope: 'self' },
      { stat: 'itemStats', mode: 'pct', value: 50, scope: 'self', condition: { kind: 'itemType', types: ['Ring'] } },
    ])
  })

  it('неизвестный тип оружия → unparsed, а не молча', () => {
    expect(parse('+50% Attack with Laser').unparsed).toEqual(['+50% Attack with Laser'])
  })
})

describe('parseSkillEffects — суффиксы и составные клаузы', () => {
  it('отряд, за каждого героя группы', () => {
    expect(parse('+10% bonus Attack for the party, +10% bonus Defense for the party').effects).toEqual([
      { stat: 'atk', mode: 'pct', value: 10, scope: 'party' },
      { stat: 'def', mode: 'pct', value: 10, scope: 'party' },
    ])
    expect(parse('+5% Critical Hit Chance & Evasion for each Rogue').effects).toEqual([
      { stat: 'crit', mode: 'pct', value: 5, scope: 'party', condition: { kind: 'perPartyMember', group: 'Rogue' } },
      { stat: 'eva', mode: 'pct', value: 5, scope: 'party', condition: { kind: 'perPartyMember', group: 'Rogue' } },
    ])
    expect(parse('+10% bonus to party ATK, DEF and HP').effects.map((e) => [e.stat, e.scope])).toEqual([
      ['atk', 'party'],
      ['def', 'party'],
      ['hp', 'party'],
    ])
  })

  it('условия: раунды, первый раунд, HP ниже, против боссов', () => {
    expect(parse('+15% Critical Hit Chance for 3 rounds').effects[0].condition).toEqual({ kind: 'rounds', rounds: 3 })
    expect(parse('+50% Attack on the first round').effects[0].condition).toEqual({ kind: 'firstRound' })
    expect(parse('+20% Attack and +10% Evasion when HP falls below 75%').effects).toEqual([
      { stat: 'atk', mode: 'pct', value: 20, scope: 'self', condition: { kind: 'selfHpBelow', pct: 75 } },
      { stat: 'eva', mode: 'pct', value: 10, scope: 'self', condition: { kind: 'selfHpBelow', pct: 75 } },
    ])
    expect(parse('+30% Attack against bosses').effects[0].condition).toEqual({ kind: 'vsBoss' })
  })

  it('«Grants …, as well as … to the party» и «… and reduces resting time»', () => {
    expect(parse('Grants +12% bonus Attack and Defense, as well as +12% HP to the party').effects.map((e) => [e.stat, e.scope])).toEqual([
      ['atk', 'party'],
      ['def', 'party'],
      ['hp', 'party'],
    ])
    const r = parse('Grants 10 bonus HP to the party and reduces resting time by 20%')
    expect(r.effects).toEqual([{ stat: 'hp', mode: 'flat', value: 10, scope: 'party' }])
    expect(r.ignored).toEqual(['reduces resting time by 20%'])
  })

  it('отрицательные и плоские значения, предложения через точку', () => {
    expect(parse('+30 Threat. +40% of total Threat is added as an attack multiplier')).toEqual({
      effects: [{ stat: 'threat', mode: 'flat', value: 30, scope: 'self' }],
      ignored: ['+40% of total Threat is added as an attack multiplier'],
      unparsed: [],
    })
    expect(parse('-20% Resting Time').ignored).toEqual(['-20% Resting Time'])
  })

  it('пустой текст', () => {
    expect(parse('---')).toEqual({ effects: [], ignored: [], unparsed: [] })
  })

  it('splitClauses: продолжения со строчной буквы и без чисел приклеиваются', () => {
    expect(splitClauses('Upon striking, defeat any enemy below 10% HP')).toEqual(['Upon striking, defeat any enemy below 10% HP'])
    expect(splitClauses('Learns skills faster than other classes, +10% Defense')).toEqual(['Learns skills faster than other classes', '+10% Defense'])
  })
})

describe('parseSkillEffects — вся фикстура SKILLS', () => {
  it('ни одной нераспознанной клаузы; у боевых навыков есть эффекты', () => {
    const rows = fixtureRows('SKILLS').slice(1)
    const types = new Set(fixtureRows('BLUEPRINTS').slice(1).map((r) => r[1]))
    const unparsed = rows.flatMap((r) => parseSkillEffects(r[5] ?? '', types).unparsed.map((u) => `${r[0]}: ${u}`))
    expect(unparsed).toEqual([])
    const withEffects = rows.filter((r) => parseSkillEffects(r[5] ?? '', types).effects.length > 0)
    expect(withEffects.length).toBeGreaterThan(450)
  })
})
