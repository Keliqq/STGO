/**
 * Сверка механик из данных владельца по stcalc.com (сессия 32, A72): что движок уже делает так,
 * а что пришлось добавить. Источники по каждой механике — в docs/ASSUMPTIONS.md (A72) и в комментариях
 * constants.ts; changelog stcalc публично недоступен (`https://stcalc.com/changelog` → 404, сайт — SPA),
 * поэтому у части пунктов источник — только данные владельца, и это отмечено в тесте.
 *
 * Здесь проверяется поведение, а не парсинг: парсер уже покрыт combat.test.ts и stats.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { HeroInstance, HeroSlot, Quest, Skill } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { simulateTeam, type Fighter } from './combat.ts'
import { rollableSkills, skillBlockReason } from './skills.ts'
import { calcStats, DEFAULT_MODEL, skillTierFor, type StatModel } from './stats.ts'

const data = fixtureGameData()
const empty: HeroSlot = { item: null, quality: 'Normal', element: null, spirit: null }
/** Базы классов обнуляем: тесты про предметы и навыки, а не про кривую роста уровня (A8). */
const zeroBase: StatModel = { ...DEFAULT_MODEL, baseAt: () => ({ atk: 0, def: 0, hp: 0 }) }

function hero(over: Partial<HeroInstance> = {}): HeroInstance {
  return {
    id: 't',
    name: 'Test',
    className: 'Geomancer',
    level: 30,
    titanSoul: false,
    slots: [empty, empty, empty, empty, empty, empty],
    skills: [],
    seeds: { atk: 0, def: 0, hp: 0 },
    reference: null,
    ...over,
  }
}

const skillByName = (name: string): Skill => {
  const s = data.skills.find((x) => x.name === name)
  if (!s) throw new Error(`навык «${name}» не найден`)
  return s
}

const item = (name: string): HeroSlot => ({ item: name, quality: 'Normal', element: null, spirit: null })

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'F',
  atk: 100,
  def: 0,
  hp: 1000,
  manaShield: 0,
  crit: 0,
  critDmg: 2,
  eva: 0,
  threat: 100,
  elements: {},
  elementAny: 0,
  barrierAnyPct: 0,
  skills: [],
  ...over,
})

/** Квест без порогов защиты: множитель урона 1, чтобы арифметика теста была видна. */
const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'test|normal|Hard',
  area: 'Test',
  variant: 'normal',
  difficulty: 'Hard',
  minPower: null,
  heroXp: null,
  monsterHp: 1000,
  monsterDmg: 0,
  monsterAoe: 0,
  barrier: null,
  defCaps: null,
  miniBosses: [],
  ...over,
})

describe('Bow + Quiver (A25-дополнение, A72)', () => {
  it('«+30% bonus from all items with Bow» усиливает ATK, DEF и HP лука', () => {
    // Maplewood Gale — лук, у которого есть и DEF, и ATK: без исключения A25 бонус усилил бы только ATK.
    const bow = calcStats(hero({ slots: [item('Maplewood Gale'), empty, empty, empty, empty, empty], skills: ['Quiver Bow Bonus'] }), data, { model: zeroBase })
    expect(bow.breakdown.items[0].multiplier).toEqual({ atk: 1.3, def: 1.3, hp: 1.3 })
  })

  it('колчан работает только с дальним оружием: к броне бонус не применяется', () => {
    const armor = calcStats(hero({ slots: [item('Warlord Plate'), empty, empty, empty, empty, empty], skills: ['Quiver Bow Bonus'] }), data, { model: zeroBase })
    expect(armor.breakdown.items[0].multiplier).toEqual({ atk: 1, def: 1, hp: 1 })
  })
})

describe('Spellblade / Spellknight (A72)', () => {
  it('врождённый «+N% bonus from all items» усиливает и DEF, и HP', () => {
    for (const className of ['Spellblade', 'Spellknight']) {
      const plate = calcStats(hero({ className, slots: [item('Warlord Plate'), empty, empty, empty, empty, empty] }), data, { model: zeroBase })
      // 1-я ступень (Jack of All Trades / его промоушен-версия): +10% ко всем статам предмета (A25 не применяется:
      // у эффекта нет условия itemType — он «bonus from all items»).
      expect([className, plate.breakdown.items[0].multiplier]).toEqual([className, { atk: 1.1, def: 1.1, hp: 1.1 }])
    }
  })
})

describe('Titan Spirit (A72)', () => {
  const withSpirits = (className: string, titanSoul: boolean): HeroInstance =>
    hero({
      className,
      titanSoul,
      slots: [
        { item: 'Warlord Plate', quality: 'Normal', element: null, spirit: 'Titan Spirit' },
        { item: 'Twin Coiled Ring', quality: 'Normal', element: null, spirit: 'Titan Spirit' },
        empty,
        empty,
        empty,
        empty,
      ],
    })

  it('несколько Titan Spirit не складываются: навык Titan Solemnity действует один раз', () => {
    const s = calcStats(withSpirits('Knight', true), data, { model: zeroBase })
    const titan = s.breakdown.skills.filter((x) => x.name.startsWith('Titan Solemnity'))
    expect(titan).toHaveLength(1)
    expect(s.breakdown.pct.hp).toBeCloseTo(0.15, 6)
  })

  it('у базового класса дух даёт только плоские статы: навык не действует (Exclusive to Titan classes)', () => {
    const s = calcStats(withSpirits('Knight', false), data, { model: zeroBase })
    expect(s.breakdown.skills.filter((x) => x.name.startsWith('Titan Solemnity'))).toHaveLength(0)
    expect(s.breakdown.pct.hp).toBe(0)
    // Плоские статы самого духа (DEF 109 / HP 33) остаются — их даёт предмет.
    expect(s.breakdown.items[0].enchantStats.def).toBeGreaterThanOrEqual(109)
  })
})

describe('духи Mammoth, Rhino, Shark (A72)', () => {
  const withSpirit = (spirit: string | null): HeroInstance =>
    hero({ className: 'Knight', slots: [{ item: 'Warlord Plate', quality: 'Normal', element: null, spirit }, empty, empty, empty, empty, empty] })

  it('Mammoth Spirit: +10% DEF и +10 угрозы; Rhino Spirit: +5 угрозы', () => {
    const plain = calcStats(withSpirit(null), data, { model: zeroBase })
    const mammoth = calcStats(withSpirit('Mammoth Spirit'), data, { model: zeroBase })
    const rhino = calcStats(withSpirit('Rhino Spirit'), data, { model: zeroBase })
    expect(mammoth.threat - plain.threat).toBe(10)
    expect(rhino.threat - plain.threat).toBe(5)
    expect(mammoth.breakdown.pct.def).toBeCloseTo(0.1, 6)
  })

  it('Shark Bloodlust: +20% ATK, когда HP врага ниже 50%', () => {
    const shark = skillByName('Shark Bloodlust')
    const opts = { runs: 1, seed: 1, maxRounds: 5, enemyCritChance: 0, aoeChance: 0 }
    // Монстр 1000 HP, удар 600: в 1-м раунде HP врага 100% (бонуса нет), во 2-м — 40% (< 50%, удар 720).
    const withSkill = simulateTeam([fighter({ atk: 600, hp: 10_000, skills: [shark] })], quest(), opts)
    const without = simulateTeam([fighter({ atk: 600, hp: 10_000 })], quest(), opts)
    expect(withSkill.avgDamagePerRound).toBeCloseTo(660, 6)
    expect(without.avgDamagePerRound).toBeCloseTo(600, 6)
  })
})

describe('ограничения ролла навыков (A72)', () => {
  it('Sturdy и Impervious несовместимы: второй не попадает в пул перекидки', () => {
    const sturdy = skillByName('Sturdy')
    const impervious = skillByName('Impervious')
    const withSturdy = hero({ className: 'Knight', skills: [sturdy.id] })
    expect(skillBlockReason(data, withSturdy, impervious, 2)).toMatch(/несовместим/)
    expect(rollableSkills(data, withSturdy).some((s) => s.name === 'Impervious')).toBe(false)
    // Без Sturdy Impervious доступен — исключение именно взаимное.
    expect(rollableSkills(data, hero({ className: 'Knight' })).some((s) => s.name === 'Impervious')).toBe(true)
  })

  it('Fast Learner (+25% XP) не влияет на боевые статы и не считается дважды', () => {
    const once = calcStats(hero({ skills: ['Fast Learner'] }), data, { model: zeroBase })
    const twice = calcStats(hero({ skills: ['Fast Learner', 'Fast Learner'] }), data, { model: zeroBase })
    const sheet = (s: ReturnType<typeof calcStats>): number[] => [s.atk, s.def, s.hp, s.crit, s.critDmg, s.eva, s.threat]
    expect(sheet(twice)).toEqual(sheet(once))
  })

  it('без Души Титана ступень навыка не выше 3-й (ни одного навыка с Requires Promotion)', () => {
    const lines = new Map<string, Skill[]>()
    for (const s of data.skills) {
      if (s.type !== 'Hero') continue
      const arr = lines.get(s.line)
      if (arr) arr.push(s)
      else lines.set(s.line, [s])
    }
    expect(lines.size).toBeGreaterThan(50)
    for (const [line, arr] of lines) {
      const sorted = [...arr].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
      const unsouled = skillTierFor(sorted, 9999, false)
      // Сообщение собираем строкой: при падении видно, какая линейка и какая ступень выбралась.
      expect(`${line}: ${unsouled.name} (tier ${unsouled.tier}, promo ${unsouled.requiresPromotion})`).toBe(
        `${line}: ${unsouled.name} (tier ${unsouled.tier}, promo false)`,
      )
      expect(unsouled.tier ?? 0).toBeLessThanOrEqual(3)
    }
    // Душа Титана (промоушен) снимает предел: у линейки Thick Skin открывается 4-я ступень.
    const thick = [...(lines.get('Thick Skin') ?? [])].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    expect(skillTierFor(thick, 9999, false).tier).toBe(3)
    expect(skillTierFor(thick, 9999, true).requiresPromotion).toBe(true)
  })
})

describe('особые механики боя (A72)', () => {
  it('после смерти врага герои больше не бьют', () => {
    const team = [fighter({ name: 'A', atk: 1000, hp: 10_000 }), fighter({ name: 'B', atk: 1000, hp: 10_000 }), fighter({ name: 'C', atk: 1000, hp: 10_000 })]
    const m = simulateTeam(team, quest({ monsterHp: 100 }), { runs: 5, seed: 3, maxRounds: 3, enemyCritChance: 0, aoeChance: 0 })
    expect(m.winRate).toBe(1)
    // Урон одного удара (1000), а не трёх (3000): бой заканчивается на смерти монстра.
    expect(m.avgDamagePerRound).toBeCloseTo(1000, 6)
  })

  it('Acrobat/Dancer: гарантированный крит после уклонения увеличивает урон', () => {
    const opts = { runs: 300, seed: 5, maxRounds: 10, enemyCritChance: 0, aoeChance: 0 }
    const q = quest({ monsterHp: 1_000_000 })
    const withRiposte = simulateTeam([fighter({ atk: 100, eva: 0.75, skills: [skillByName('Devastating Riposte')] })], q, opts)
    const plain = simulateTeam([fighter({ atk: 100, eva: 0.75 })], q, opts)
    expect(withRiposte.avgDamagePerRound).toBeGreaterThan(plain.avgDamagePerRound)
  })

  it('Lord защищает союзника от смертельного удара (один раз за бой)', () => {
    const opts = { runs: 5, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 }
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100 })
    const weak = fighter({ name: 'Weak', hp: 10, atk: 0, threat: 1000 })
    const lord = fighter({ name: 'Lord', hp: 10_000, atk: 0, threat: 0, skills: [skillByName('Lifesaver')] })
    expect(simulateTeam([lord, weak], q, opts).survival[1].rate).toBe(1)
    expect(simulateTeam([fighter({ name: 'Lord', hp: 10_000, atk: 0, threat: 0 }), weak], q, opts).survival[1].rate).toBe(0)
  })

  it('Bishop переживает смертельный удар («100% chance to survive one fatal blow»)', () => {
    const opts = { runs: 5, seed: 1, maxRounds: 1, enemyCritChance: 0, aoeChance: 0 }
    const q = quest({ monsterHp: 1_000_000, monsterDmg: 100 })
    expect(simulateTeam([fighter({ name: 'Bishop', hp: 10, atk: 0, skills: [skillByName('Miracle')] })], q, opts).survival[0].rate).toBe(1)
    expect(simulateTeam([fighter({ name: 'Кто-то', hp: 10, atk: 0 })], q, opts).survival[0].rate).toBe(0)
  })
})
