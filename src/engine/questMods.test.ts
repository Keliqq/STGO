/**
 * Модификаторы квестов (A71/A72): мини-боссы, флаги Flash/Nullysium и модификаторы Гробницы Титанов.
 * Числа — stcalc.com (датасет `data/quests.json` и бандл калькулятора); проверяется ПОВЕДЕНИЕ
 * (`applyQuestMods` → статы квеста и `battle`, бой в `combat.test.ts`), а не парсинг констант.
 */
import { describe, expect, it } from 'vitest'
import type { Quest } from '../data/types.ts'
import { AOE_CHANCE, ENEMY_CRIT_CHANCE, MINI_BOSSES, TOMB_DEFAULT_STATS, TOMB_MODIFIERS } from './constants.ts'
import { applyQuestMods, miniBossDesc, questModifierByKey, tombDepthFromQuestId, tombQuest, tombQuestId, type TombFloor } from './questMods.ts'

function quest(patch: Partial<Quest> = {}): Quest {
  return {
    id: 'Test|boss|Hard',
    area: 'Test',
    variant: 'boss',
    difficulty: 'Hard',
    minPower: null,
    heroXp: null,
    monsterHp: 1000,
    monsterDmg: 100,
    monsterAoe: 50,
    aoeChance: null,
    enemyCritChance: null,
    barrier: null,
    defCaps: null,
    miniBosses: [],
    mods: [],
    battle: null,
    isFlash: false,
    isNullysium: false,
    isTomb: false,
    tombDepth: null,
    ...patch,
  }
}

describe('мини-боссы (A17/A72)', () => {
  it('все пять вариантов описаны в таблице, у каждого — подпись и смысл', () => {
    expect(Object.keys(MINI_BOSSES).sort()).toEqual(['agile', 'dire', 'huge', 'legendary', 'wealthy'])
    for (const key of Object.keys(MINI_BOSSES)) {
      const mod = questModifierByKey(key)
      expect(mod, key).not.toBeNull()
      expect(mod?.label).toBe(MINI_BOSSES[key].label)
      expect(miniBossDesc(key).length, key).toBeGreaterThan(0)
    }
    // Wealthy статы не меняет — только добыча.
    expect(miniBossDesc('wealthy')).toMatch(/добыча/)
  })

  it('Agile: +50% HP и уклонение врага 40%', () => {
    const { quest: q, battle } = applyQuestMods(quest(), ['agile'])
    expect(q.monsterHp).toBe(1500)
    expect(q.monsterDmg).toBe(100)
    expect(battle.enemyEvaPp).toBe(40)
    // Уже боссовый квест остаётся боссом; обычный квест с мини-боссом становится `miniboss`.
    expect(q.variant).toBe('boss')
    expect(applyQuestMods(quest({ variant: 'normal' }), ['agile']).quest.variant).toBe('miniboss')
  })

  it('Dire: +50% HP и шанс крита врага ×3 (от базовых 10% → 30%)', () => {
    const { quest: q } = applyQuestMods(quest(), ['dire'])
    expect(q.monsterHp).toBe(1500)
    expect(q.enemyCritChance).toBeCloseTo(0.3, 6)
  })

  it('Huge: +100% HP и шанс AoE ×3 (25% → 75%)', () => {
    const { quest: q } = applyQuestMods(quest(), ['huge'])
    expect(q.monsterHp).toBe(2000)
    expect(q.aoeChance).toBeCloseTo(AOE_CHANCE * 3, 6)
    // Урон AoE не менялся: у Huge множится только шанс.
    expect(q.monsterAoe).toBe(50)
  })

  it('Legendary: +50% HP, +25% ATK и урона AoE, крит ×1,5, уклонение 10', () => {
    const { quest: q, battle } = applyQuestMods(quest(), ['legendary'])
    expect(q.monsterHp).toBe(1500)
    expect(q.monsterDmg).toBe(125)
    expect(q.monsterAoe).toBe(63) // 50 × 1.25 = 62.5 → 63
    expect(q.enemyCritChance).toBeCloseTo(0.15, 6)
    expect(battle.enemyEvaPp).toBe(10)
  })

  it('Wealthy статы не меняет', () => {
    const base = quest()
    const { quest: q } = applyQuestMods(base, ['wealthy'])
    expect(q.monsterHp).toBe(base.monsterHp)
    expect(q.monsterDmg).toBe(base.monsterDmg)
    expect(q.aoeChance).toBe(base.aoeChance)
    expect(q.enemyCritChance).toBe(base.enemyCritChance)
    // Battle есть, но пустой: бой от такого модификатора не меняется.
    expect(applyQuestMods(base, ['wealthy']).quest.battle).toBeNull()
    expect(q.battle?.enemyEvaPp ?? 0).toBe(0)
  })

  it('шанс AoE и крита упираются в 100% при наложении двух мини-боссов', () => {
    const { quest: q } = applyQuestMods(quest(), ['huge', 'dire'])
    expect(q.aoeChance).toBeLessThanOrEqual(1)
    expect(q.enemyCritChance).toBeLessThanOrEqual(1)
    expect(q.monsterHp).toBe(1000 * 2 * 1.5)
  })
})

describe('Flash-задания и Nullysium (A53/A72)', () => {
  it('Flash на Extreme: штраф уклонения героев 20 п.п.', () => {
    const { battle } = applyQuestMods(quest({ isFlash: true, difficulty: 'Extreme' }), [])
    expect(battle.heroEvaPct).toBe(-20)
  })

  it('Flash на обычной сложности штрафов не даёт', () => {
    const { battle } = applyQuestMods(quest({ isFlash: true, difficulty: 'Hard' }), [])
    expect(battle.heroEvaPct ?? 0).toBe(0)
    expect(battle.heroCritChancePct ?? 0).toBe(0)
  })

  it('Nullysium: −30 EVA и −30 крита героям независимо от сложности', () => {
    for (const difficulty of ['Easy', 'Extreme']) {
      const { battle } = applyQuestMods(quest({ isFlash: true, isNullysium: true, difficulty }), [])
      expect(battle.heroEvaPct, difficulty).toBe(-30)
      expect(battle.heroCritChancePct, difficulty).toBe(-30)
    }
  })

  it('без флага Flash штрафов нет', () => {
    const { battle } = applyQuestMods(quest({ difficulty: 'Extreme' }), [])
    expect(battle.heroEvaPct ?? 0).toBe(0)
    expect(battle.heroCritChancePct ?? 0).toBe(0)
  })
})

describe('модификаторы Гробницы Титанов (A71/A72)', () => {
  it('таблица покрывает требуемый набор, у каждого модификатора есть подпись и смысл', () => {
    const required = [
      'adamantine', 'armored', 'armored_and_plated', 'eagle_eye', 'fortified', 'hates_fighters',
      'hates_rogues', 'hates_spellcasters', 'immortal', 'lightning_swift', 'lightspeed', 'magic_eater',
      'magic_resistance', 'massive', 'mythical', 'necrotic', 'no_weakness', 'reaper', 'sniper',
      'stone_skinned', 'swift', 'titan_sized', 'vigorous',
    ]
    for (const key of required) {
      const mod = questModifierByKey(key)
      expect(mod, key).not.toBeNull()
      expect(mod?.desc.length, key).toBeGreaterThan(0)
      expect(TOMB_MODIFIERS[key]?.label.length, key).toBeGreaterThan(0)
    }
  })

  it('HP и ATK врага: vigorous +50%, immortal +100%, mythical +40%/+30%/+15 EVA', () => {
    expect(applyQuestMods(quest(), ['vigorous']).quest.monsterHp).toBe(1500)
    expect(applyQuestMods(quest(), ['immortal']).quest.monsterHp).toBe(2000)
    const myth = applyQuestMods(quest(), ['mythical'])
    expect(myth.quest.monsterHp).toBe(1400)
    expect(myth.quest.monsterDmg).toBe(130)
    expect(myth.battle.enemyEvaPp).toBe(15)
  })

  it('AoE: massive ×2 / +25%, titan_sized ×3 / +100%', () => {
    const mas = applyQuestMods(quest(), ['massive'])
    expect(mas.quest.aoeChance).toBeCloseTo(0.5, 6)
    expect(mas.quest.monsterAoe).toBe(63) // 50 × 1.25
    const tit = applyQuestMods(quest(), ['titan_sized'])
    expect(tit.quest.aoeChance).toBeCloseTo(0.75, 6)
    expect(tit.quest.monsterAoe).toBe(100)
  })

  it('первая атака врага: swift +100% ATK, lightning_swift +100%/+100 крита, lightspeed +300%/+200', () => {
    expect(applyQuestMods(quest(), ['swift']).battle).toMatchObject({ firstAtkPct: 100 })
    expect(applyQuestMods(quest(), ['lightning_swift']).battle).toMatchObject({ firstAtkPct: 100, firstAtkCritPp: 100 })
    expect(applyQuestMods(quest(), ['lightspeed']).battle).toMatchObject({ firstAtkPct: 300, firstAtkCritPp: 200 })
  })

  it('цель по классу: hates_fighters ×2, hates_rogues ×3, hates_spellcasters ×4', () => {
    expect(applyQuestMods(quest(), ['hates_fighters']).battle).toMatchObject({ targetGroup: 'Fighter', targetMult: 2 })
    expect(applyQuestMods(quest(), ['hates_rogues']).battle).toMatchObject({ targetGroup: 'Rogue', targetMult: 3 })
    expect(applyQuestMods(quest(), ['hates_spellcasters']).battle).toMatchObject({ targetGroup: 'Spellcaster', targetMult: 4 })
  })

  it('штрафы героям: уклонение (eagle_eye −20, sniper −30), крит (fortified −20, no_weakness −30)', () => {
    expect(applyQuestMods(quest(), ['eagle_eye']).battle.heroEvaPct).toBe(-20)
    expect(applyQuestMods(quest(), ['sniper']).battle.heroEvaPct).toBe(-30)
    expect(applyQuestMods(quest(), ['fortified']).battle.heroCritChancePct).toBe(-20)
    expect(applyQuestMods(quest(), ['no_weakness']).battle.heroCritChancePct).toBe(-30)
  })

  it('ASSUMPTION A71: «−N» у armored/adamantine/armored_and_plated — это урон крита (×CritDmg), не шанс', () => {
    // Ошибочное чтение «крит −25» как шанса крита ломало бы бой: у armored в stcalc `playerCritDmgPct`.
    const arm = applyQuestMods(quest(), ['armored'])
    expect(arm.battle.heroAtkPct).toBe(-10)
    expect(arm.battle.heroCritDmgPct).toBe(-25)
    expect(arm.battle.heroCritChancePct ?? 0).toBe(0)
    expect(applyQuestMods(quest(), ['adamantine']).battle).toMatchObject({ heroAtkPct: -20, heroCritDmgPct: -70 })
    expect(applyQuestMods(quest(), ['armored_and_plated']).battle).toMatchObject({ heroAtkPct: -20, heroCritDmgPct: -50 })
  })

  it('штрафы по классу: magic_resistance −50% ATK Spellcaster, magic_eater −20% и цель Spellcaster', () => {
    const mr = applyQuestMods(quest(), ['magic_resistance'])
    expect(mr.battle.heroAtkPct ?? 0).toBe(0)
    expect(mr.battle.groupMods).toEqual([{ group: 'Spellcaster', heroAtkPct: -50, heroHpPct: null, heroCritChancePct: null, heroCritDmgPct: null, heroEvaPct: null }])
    const me = applyQuestMods(quest(), ['magic_eater'])
    expect(me.battle.groupMods?.[0]).toMatchObject({ group: 'Spellcaster', heroAtkPct: -20 })
    expect(me.battle).toMatchObject({ targetGroup: 'Spellcaster', targetMult: 4 })
  })

  it('stone_skinned — ATK −30% для Fighter (и Rogue: группа Fighter)', () => {
    const sk = applyQuestMods(quest(), ['stone_skinned'])
    expect(sk.battle.groupMods).toEqual([{ group: 'Fighter', heroAtkPct: -30, heroHpPct: null, heroCritChancePct: null, heroCritDmgPct: null, heroEvaPct: null }])
  })

  it('HP героев: necrotic −20%, reaper −10% (урон крита врага в модели не поддержан, A72)', () => {
    expect(applyQuestMods(quest(), ['necrotic']).battle.heroHpPct).toBe(-20)
    expect(applyQuestMods(quest(), ['reaper']).battle.heroHpPct).toBe(-10)
  })

  it('штрафы разных модификаторов складываются, а не перезаписывают друг друга', () => {
    const { battle } = applyQuestMods(quest(), ['fortified', 'no_weakness'])
    expect(battle.heroCritChancePct).toBe(-50)
    const both = applyQuestMods(quest(), ['armored', 'adamantine'])
    expect(both.battle.heroCritDmgPct).toBe(-95)
    expect(both.battle.heroAtkPct).toBe(-30)
  })

  it('неизвестный ключ игнорируется', () => {
    const base = quest()
    const { quest: q } = applyQuestMods(base, ['нет-такого'])
    expect(q.monsterHp).toBe(base.monsterHp)
    expect(q.mods).toEqual(['нет-такого'])
  })

  it('исходный квест не мутируется', () => {
    const base = quest()
    applyQuestMods(base, ['immortal', 'agile'])
    expect(base.monsterHp).toBe(1000)
    expect(base.battle).toBeNull()
    expect(base.mods).toEqual([])
  })
})

describe('Гробница Титанов: этаж и синтетический квест (A70/A71)', () => {
  const floor: TombFloor = {
    id: tombQuestId(3),
    depth: 3,
    monsterHp: 5_000_000,
    monsterDmg: 250,
    monsterAoe: 100,
    defenseCap: 90_000,
    barrier: { element: 'Dark', hp: 200 },
    mods: [],
    difficulty: 'Extreme',
  }

  it('id этажа и разбор этажа из id', () => {
    expect(floor.id).toBe('Tomb of Titans|tomb|3')
    expect(tombDepthFromQuestId(floor.id)).toBe(3)
    expect(tombDepthFromQuestId('Howling Woods|boss|Hard')).toBeNull()
  })

  it('квест этажа: статы пользователя, пороги из cap (X · 2X · 6X), крит врага 15%', () => {
    const { quest: q } = tombQuest(floor)
    expect(q.area).toBe('Tomb of Titans')
    expect(q.variant).toBe('boss')
    expect(q.isTomb).toBe(true)
    expect(q.tombDepth).toBe(3)
    expect(q.monsterHp).toBe(5_000_000)
    expect(q.monsterDmg).toBe(250)
    expect(q.defCaps).toEqual({ p50: 15_000, p70: 30_000, p75: 90_000 })
    expect(q.barrier).toEqual({ elements: ['Dark'], hp: 200 })
    expect(q.enemyCritChance).toBeCloseTo(0.15, 6)
    // Штраф крита героям — у Гробницы (stcalc `critPenalty` 20 по флагу isTomb).
    expect(q.battle?.heroCritChancePct).toBe(-20)
  })

  it('без аргументов — значения по умолчанию из датасета stcalc', () => {
    const { quest: q } = tombQuest({ depth: 1 })
    expect(q.monsterHp).toBe(TOMB_DEFAULT_STATS.monsterHp)
    expect(q.monsterDmg).toBe(TOMB_DEFAULT_STATS.monsterDmg)
    expect(q.monsterAoe).toBe(TOMB_DEFAULT_STATS.monsterAoe)
    expect(q.defCaps?.p75).toBe(TOMB_DEFAULT_STATS.defenseCap)
    expect(q.defCaps?.p50).toBe(TOMB_DEFAULT_STATS.defenseCap / 6)
    expect(q.barrier).toBeNull()
  })

  it('модификаторы этажа применяются к квесту этажа', () => {
    const { quest: q, battle } = tombQuest({ ...floor, mods: ['immortal', 'hates_rogues', 'armored'] })
    expect(q.monsterHp).toBe(10_000_000) // +100% от введённых 5 000 000
    expect(battle).toMatchObject({ targetGroup: 'Rogue', targetMult: 3, heroAtkPct: -10, heroCritDmgPct: -25 })
    // Крит героям складывается: 20 (Гробница) + ничего от armored (там урон крита).
    expect(battle.heroCritChancePct).toBe(-20)
  })

  it('AoE этажа: 25% по умолчанию, massive ×2 с +100% урона у titan_sized', () => {
    expect(tombQuest({ depth: 2 }).quest.aoeChance).toBeCloseTo(AOE_CHANCE, 6)
    expect(tombQuest({ depth: 2, mods: ['massive'] }).quest.aoeChance).toBeCloseTo(0.5, 6)
    const tit = tombQuest({ depth: 2, monsterAoe: 100, mods: ['titan_sized'] })
    expect(tit.quest.aoeChance).toBeCloseTo(0.75, 6)
    expect(tit.quest.monsterAoe).toBe(200)
  })

  it('miniboss-модификатор на этаже Гробницы не ломает квест', () => {
    const { quest: q } = tombQuest({ depth: 4, monsterHp: 1000, mods: ['agile'] })
    expect(q.monsterHp).toBe(1500)
    expect(q.battle?.enemyEvaPp).toBe(40)
    expect(q.battle?.heroCritChancePct).toBe(-20)
  })
})

describe('запись боевых модификаторов в квест', () => {
  it('если боевых параметров нет — `battle` остаётся null (бой не меняется)', () => {
    const { quest: q } = applyQuestMods(quest(), [])
    expect(q.battle).toBeNull()
    expect(q.enemyCritChance).toBeNull()
    expect(q.aoeChance).toBeNull()
  })

  it('крит врага по умолчанию не подставляется для не-Гробницы', () => {
    const { quest: q } = applyQuestMods(quest(), ['immortal'])
    expect(q.enemyCritChance).toBeNull()
    expect(ENEMY_CRIT_CHANCE).toBeCloseTo(0.1, 6)
  })
})
