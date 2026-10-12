/**
 * Правила редактора героя: допустимые предметы, камни, духи и навыки; пересчёт статов; эталон.
 *
 * Ключевая проверка (требование владельца): у героя уровня L в списке предметов слота нет
 * ни одного предмета тира > Max Item Tier(L) и ни одного типа, которого нет в этом слоте класса.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importTitansDb } from '../data/titansdb.ts'
import type { GameData, HeroInstance, HeroSlot } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { HERO_LEVEL_STAT_GROWTH } from './constants.ts'
import {
  artifactNames,
  baseAccuracyNote,
  changeLevel,
  classChoices,
  draftCopy,
  emptySlot,
  heroMaxItemTier,
  heroSkillChoices,
  heroSkillOptions,
  itemBlockCode,
  itemOptions,
  newHero,
  skillBlockedForSlot,
  slotEnchantChoices,
  spiritAffinityOnItem,
  spiritAllowedOnItem,
  stoneAffinityOnItem,
  stoneAllowedOnItem,
  stoneCountsForHeroElement,
  tierOverflowSlots,
  validateHero,
  weaponTypes,
} from './heroEditor.ts'
import { isWeaponSkill, skillBlockReason, skillChoices } from './skills.ts'
import { activeSkills, calcStats, effectiveClass, referenceBase } from './stats.ts'

const data: GameData = fixtureGameData()
const { heroes: fixtureHeroes } = importTitansDb(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8'), data)
/** Герой из фикстуры: у него есть эталон экспорта (A8). */
const fixtureHero = (name = 'Антуан'): HeroInstance => structuredClone(fixtureHeroes.find((h) => h.name === name)!)

/** Герой без эталона и без экипировки — как созданный вручную. */
function blankHero(className: string, level = 30): HeroInstance {
  return {
    ...newHero(className, 'Тест'),
    id: `test-${className}`,
    level,
    slots: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  }
}

/** Найти доступные варианты, выбрав первый подходящий предмет (для проверок блокировок). */
function firstAllowed(data: GameData, hero: HeroInstance, slot: number) {
  return itemOptions(data, hero, slot).find((o) => o.code == null)!
}

describe('список предметов слота: тир по уровню и типы класса', () => {
  it('у героя уровня L нет в списке предметов тира выше Max Item Tier(L)', () => {
    for (const level of [1, 5, 12, 26, 40, 50]) {
      const hero = blankHero('Soldier', level)
      const cap = heroMaxItemTier(data, level)!
      for (let slot = 0; slot < 6; slot++) {
        const options = itemOptions(data, hero, slot)
        const allowed = options.filter((o) => o.code == null)
        expect(allowed.length, `уровень ${level}, слот ${slot + 1}: список не пуст`).toBeGreaterThan(0)
        for (const o of allowed) expect(o.item.tier, `${o.item.name} (уровень ${level}, слот ${slot + 1})`).toBeLessThanOrEqual(cap)
      }
    }
  })

  it('в списке слота нет типов, которых нет у слота класса (у промоушена — его слоты)', () => {
    for (const className of ['Soldier', 'Thief', 'Mage', 'Spellblade', 'Ninja']) {
      const hero = blankHero(className, 40)
      const cls = effectiveClass(hero, data)!
      for (let slot = 0; slot < 6; slot++) {
        const allowed = itemOptions(data, hero, slot).filter((o) => o.code == null)
        for (const o of allowed) expect(cls.slots[slot], `${className}, слот ${slot + 1}`).toContain(o.item.type)
      }
    }
  })

  it('«Душа Титана» берёт слоты промоушена: Soldier → Mercenary (появляется Spear)', () => {
    const soldier = blankHero('Soldier', 40)
    const titan = { ...soldier, titanSoul: true }
    const types = (hero: HeroInstance): Set<string> => new Set(itemOptions(data, hero, 0).filter((o) => o.code == null).map((o) => o.item.type))
    expect(types(soldier).has('Spear')).toBe(false)
    expect(types(titan).has('Spear')).toBe(true)
  })

  it('предмет выше потолка помечен причиной «tier», а не просто отсутствует', () => {
    const hero = blankHero('Soldier', 1)
    const cap = heroMaxItemTier(data, 1)!
    const highTier = data.items.find((i) => i.type === 'Sword' && i.tier > cap)!
    const option = itemOptions(data, hero, 0).find((o) => o.item.name === highTier.name)!
    expect(option.code).toBe('tier')
    expect(itemBlockCode(data, hero, highTier, 0, cap)).toBe('tier')
  })

  it('потолок тира берётся из HERO LEVELS и растёт с уровнем', () => {
    const tiers = [1, 10, 20, 30, 40, 50].map((l) => heroMaxItemTier(data, l)!)
    expect(tiers[0]).toBe(1)
    expect(tiers.at(-1)).toBe(Math.max(...data.heroLevels.map((l) => l.maxItemTier)))
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1])
  })
})

describe('артефакты: не больше одного на героя', () => {
  /** Первый артефакт, который герой класса `className` действительно может надеть, и его слот. */
  function wearableArtifact(className: string): { hero: HeroInstance; item: (typeof data.items)[number]; slot: number } | null {
    const hero = blankHero(className, 50)
    const cls = effectiveClass(hero, data)!
    for (const item of data.items) {
      if (!item.artifactSkill) continue
      const slot = cls.slots.findIndex((types) => types.includes(item.type))
      if (slot < 0) continue
      if (itemBlockCode(data, hero, item, slot, 16) == null) return { hero, item, slot }
    }
    return null
  }

  it('второй артефакт скрыт с причиной «артефакт уже надет»', () => {
    const found = wearableArtifact('Soldier')
    if (!found) return
    const { hero, item, slot } = found
    const withArtifact: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === slot ? { ...s, item: item.name } : s)) }
    const other = data.items.find((i) => i.artifactSkill && i.name !== item.name)!
    const otherSlot = effectiveClass(hero, data)!.slots.findIndex((types) => types.includes(other.type))
    expect(itemBlockCode(data, withArtifact, other, otherSlot >= 0 ? otherSlot : 0, 16)).toBe('artifact')
    const option = itemOptions(data, withArtifact, otherSlot >= 0 ? otherSlot : 0).find((o) => o.item.name === other.name && o.code === 'artifact')
    expect(option?.reason).toContain('артефакт')
  })

  it('артефакт в том же слоте не блокирует сам себя', () => {
    const found = wearableArtifact('Soldier')
    if (!found) return
    const { hero, item, slot } = found
    const withArtifact: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === slot ? { ...s, item: item.name } : s)) }
    expect(itemBlockCode(data, withArtifact, item, slot, 16)).toBeNull()
  })
})

describe('предметы, привязанные к классу/навыку', () => {
  it('предмет с сродством духа не попадает чужому классу', () => {
    // Ищем пару «предмет со Spirit Affinity» + класс, которому этот навык недоступен.
    const item = data.items.find((i) => i.spiritAffinity && i.isEquipment)!
    const skill = data.skills.find((s) => s.name.replace(/\+$/, '') === item.spiritAffinity)!
    const foreign = data.heroClasses.find((c) => !skill.classes.includes(c.name) && !item.type.startsWith('X'))
    if (!foreign) return
    const hero = blankHero(foreign.name, 50)
    const slot = data.heroClasses.find((c) => c.name === foreign.name)!.slots.findIndex((types) => types.includes(item.type))
    if (slot < 0) return
    expect(itemBlockCode(data, hero, item, slot, 16)).toBe('classBound')
  })

  it('тот же предмет доступен классу из его навыка', () => {
    const item = data.items.find((i) => i.spiritAffinity && i.isEquipment)!
    const skill = data.skills.find((s) => s.name.replace(/\+$/, '') === item.spiritAffinity)!
    const owner = skill.classes.find((c) => data.heroClasses.some((h) => h.name === c))
    if (!owner) return
    const hero = blankHero(owner, 50)
    const slot = data.heroClasses.find((c) => c.name === owner)!.slots.findIndex((types) => types.includes(item.type))
    if (slot < 0) return
    expect(itemBlockCode(data, hero, item, slot, 16)).toBeNull()
  })
})

describe('навыки: доступность классу, промоушен и блокировки A40', () => {
  it('в список попадают только навыки этого класса (и промоушена при Душе Титана)', () => {
    const hero = blankHero('Ninja', 35)
    for (const s of heroSkillChoices(data, hero)) {
      expect(s.classes).toContain('Ninja')
      expect(s.requiresPromotion).toBe(false)
    }
    const titan = { ...hero, titanSoul: true }
    const withTitan = heroSkillChoices(data, titan)
    expect(withTitan.some((s) => s.requiresPromotion)).toBe(true)
    expect(withTitan.some((s) => s.classes.includes('Sensei'))).toBe(true)
  })

  it('навык, требующий промоушена, не попадает в пул обычного класса (A60)', () => {
    const hero = blankHero('Ninja', 35)
    expect(heroSkillChoices(data, hero).some((s) => s.requiresPromotion)).toBe(false)
    expect(heroSkillChoices(data, { ...hero, titanSoul: true }).some((s) => s.requiresPromotion)).toBe(true)
  })

  it('чужой навык не появляется в списке даже с причиной, а неизвестный класс даёт пустой список', () => {
    const ninja = blankHero('Ninja', 35)
    const foreign = data.skills.find((s) => s.type === 'Hero' && s.rarity && s.tier && !s.classes.includes('Ninja') && !s.requiresPromotion)!
    expect(heroSkillChoices(data, ninja).some((s) => s.id === foreign.id)).toBe(false)
    expect(heroSkillOptions(data, ninja).some((o) => o.skill.id === foreign.id)).toBe(false)
    expect(heroSkillChoices(data, { ...ninja, className: 'НетТакогоКласса' })).toEqual([])
  })

  it('второй навык той же линейки запрещён (A40)', () => {
    const hero = blankHero('Ninja', 35)
    const choices = skillChoices(data, hero)
    const first = choices[0]
    const twin = choices.find((s) => s.id !== first.id && s.line === first.line)
    if (!twin) return
    const withFirst: HeroInstance = { ...hero, skills: [first.id] }
    expect(skillBlockReason(data, withFirst, twin, 2)).toContain('взаимоисключающие')
    expect(skillBlockedForSlot(data, withFirst, twin.id, 2)).not.toBeNull()
  })

  it('на оружие — не больше одного обычного и одного эпического навыка', () => {
    const hero = blankHero('Ninja', 35)
    const weapons = weaponTypes(data)
    const choices = skillChoices(data, hero)
    const weaponCommon = choices.find((s) => isWeaponSkill(s, weapons) && s.rarity === 'Common')
    const otherCommon = choices.find((s) => s.id !== weaponCommon?.id && isWeaponSkill(s, weapons) && s.rarity === 'Common' && s.line !== weaponCommon?.line)
    if (!weaponCommon || !otherCommon) return
    const withWeapon: HeroInstance = { ...hero, skills: [weaponCommon.id] }
    expect(skillBlockReason(data, withWeapon, otherCommon, 2)).toContain('оружие')
  })

  it('герой класса, промоушен которого неизвестен, не получает чужих навыков', () => {
    const hero = blankHero('Soldier', 35)
    const ids = new Set(heroSkillChoices(data, hero).map((s) => s.id))
    const foreign = data.skills.find((s) => s.type === 'Hero' && s.rarity && s.tier && !s.classes.includes('Soldier') && !s.requiresPromotion)!
    expect(ids.has(foreign.id)).toBe(false)
  })

  it('в списке формы видно, почему навык нельзя поставить (линейка и оружие)', () => {
    const hero = blankHero('Ninja', 35)
    const choices = heroSkillChoices(data, hero)
    const first = choices[0]
    const twin = choices.find((s) => s.id !== first.id && s.line === first.line)
    if (twin) {
      const options = heroSkillOptions(data, { ...hero, skills: [first.id] })
      expect(options.find((o) => o.skill.id === twin.id)?.code).toBe('line')
      expect(options.find((o) => o.skill.id === twin.id)?.reason).toContain('линейка')
    }
    const weapons = weaponTypes(data)
    const weaponCommon = choices.find((s) => isWeaponSkill(s, weapons) && s.rarity === 'Common')
    const otherCommon = choices.find((s) => s.id !== weaponCommon?.id && isWeaponSkill(s, weapons) && s.rarity === 'Common' && s.line !== weaponCommon?.line)
    if (weaponCommon && otherCommon) {
      const options = heroSkillOptions(data, { ...hero, skills: [weaponCommon.id] })
      expect(options.find((o) => o.skill.id === otherCommon.id)?.code).toBe('weapon')
    }
  })
})

describe('камни и духи вставляются в любой предмет, сродство — бонус (A65)', () => {
  /** Предмет слота 2 (броня) с сродством заданной стихии. */
  function armorWithAffinity(element: 'Earth' | 'Water'): (typeof data.items)[number] | null {
    for (const item of data.items) {
      if (item.type !== 'Heavy Armor' || !Array.isArray(item.elementAffinity) || !item.elementAffinity.includes(element)) continue
      if (data.enchants.some((e) => e.kind === 'element' && e.element === element)) return item
    }
    return null
  }

  it('в списке камней — все камни стихий, включая чужие предмету и герою', () => {
    const item = armorWithAffinity('Water')!
    const hero = blankHero('Soldier', 50) // Soldier — Earth
    const withItem: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: item.name } : s)) }
    const { stones } = slotEnchantChoices(data, withItem, 1)
    const all = data.enchants.filter((e) => e.kind === 'element' && (e.elementValue ?? 0) > 0)
    expect(stones).toHaveLength(all.length)
    for (const st of all) expect(stones.some((o) => o.enchant.name === st.name), st.name).toBe(true)
    // Сродство помечает только камни стихии предмета — и оно включает бонус (A6), а не разрешение.
    for (const o of stones) expect(o.affinity).toBe(stoneAffinityOnItem(o.enchant, item))
    expect(stones.find((o) => o.enchant.element === 'Water')?.affinity).toBe(true)
    expect(stones.find((o) => o.enchant.element === 'Earth')?.affinity).toBe(false)
  })

  it('камень чужой стихии разрешён, но помечен «не даёт стихию этому герою» (A21)', () => {
    const hero = blankHero('Soldier', 50) // Earth
    const item = data.items.find((i) => i.type === 'Heavy Armor' && Array.isArray(i.elementAffinity) && i.elementAffinity.length === 0)!
    const withItem: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: item.name } : s)) }
    const { stones } = slotEnchantChoices(data, withItem, 1)
    const earth = stones.find((o) => o.enchant.element === 'Earth')!
    const water = stones.find((o) => o.enchant.element === 'Water')!
    expect(earth.note).toBeNull()
    expect(water.note).toContain('не даёт стихию')
    // У брони без сродства бонуса нет ни у одного камня, но камень всё равно доступен.
    expect(stones.every((o) => o.affinity === false)).toBe(true)
    expect(stoneAllowedOnItem(water.enchant, item)).toBe(true)
  })

  it('камни Gold и стихии героя засчитываются в его стихию, чужие — нет (A21)', () => {
    const cls = data.heroClasses.find((c) => c.name === 'Soldier')!
    const stone = (el: string) => data.enchants.find((e) => e.kind === 'element' && e.element === el)!
    expect(stoneCountsForHeroElement(stone('Earth'), cls)).toBe(true)
    expect(stoneCountsForHeroElement(stone('Gold'), cls)).toBe(true)
    expect(stoneCountsForHeroElement(stone('Water'), cls)).toBe(false)
  })

  it('духи: доступны все и на любом предмете, «✦ сродство» — по Spirit Affinity предмета (A5)', () => {
    const hero = blankHero('Soldier', 50)
    const item = data.items.find((i) => i.type === 'Heavy Armor' && i.spiritAffinity)!
    const withItem: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: item.name } : s)) }
    const spirits = slotEnchantChoices(data, withItem, 1).spirits
    const all = data.enchants.filter((e) => e.kind === 'spirit')
    expect(spirits).toHaveLength(all.length)
    for (const sp of spirits) expect(sp.affinity).toBe(spiritAffinityOnItem(data, sp.enchant, item))
    expect(spirits.some((o) => o.affinity)).toBe(true)

    // Предмет без сродства духа: дух всё равно вставляется, просто без «+»-версии навыка.
    const noAffinity = data.items.find((i) => i.type === 'Heavy Armor' && !i.spiritAffinity)!
    const without: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: noAffinity.name } : s)) }
    const plain = slotEnchantChoices(data, without, 1).spirits
    expect(plain).toHaveLength(all.length)
    expect(plain.every((o) => o.affinity === false)).toBe(true)
    expect(spiritAllowedOnItem(plain[0].enchant, noAffinity)).toBe(true)
  })

  it('Титан доступен и герою без Души Титана: ограничения нет ни в данных, ни в источниках (A65)', () => {
    const hero = blankHero('Soldier', 50)
    const item = data.items.find((i) => i.type === 'Heavy Armor')!
    const withItem: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: item.name } : s)) }
    const noSoul = slotEnchantChoices(data, withItem, 1).spirits.map((s) => s.enchant.name)
    const withSoul = slotEnchantChoices(data, { ...withItem, titanSoul: true }, 1).spirits.map((s) => s.enchant.name)
    expect(noSoul).toContain('Titan Spirit')
    expect(withSoul).toContain('Titan Spirit')
  })

  it('валидация набора не считает ошибкой камень чужой стихии и духа без сродства (A65)', () => {
    const hero = blankHero('Soldier', 50) // Earth
    const item = data.items.find((i) => i.type === 'Heavy Armor' && Array.isArray(i.elementAffinity) && i.elementAffinity.length === 0)!
    const water = data.enchants.find((e) => e.kind === 'element' && e.element === 'Water')!
    const spirit = data.enchants.find((e) => e.kind === 'spirit')!
    const dressed: HeroInstance = {
      ...hero,
      slots: hero.slots.map((s, i) => (i === 1 ? { ...s, item: item.name, element: water.name, spirit: spirit.name } : s)),
    }
    expect(validateHero(data, dressed).ok).toBe(true)
    // …а камень, которого нет в данных, — по-прежнему ошибка.
    const broken: HeroInstance = { ...dressed, slots: dressed.slots.map((s, i) => (i === 1 ? { ...s, element: 'НетТакогоКамня' } : s)) }
    expect(validateHero(data, broken).slots[1]).toContain('не найден')
  })
})

describe('проверка набора героя', () => {
  it('пустой герой валиден, а запрещённые вещи попадают в отчёт', () => {
    const hero = blankHero('Soldier', 1)
    expect(validateHero(data, hero).ok).toBe(true)
    const highTier = data.items.find((i) => i.type === 'Sword' && i.tier > heroMaxItemTier(data, 1)!)!
    const broken: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: highTier.name } : s)) }
    const v = validateHero(data, broken)
    expect(v.ok).toBe(false)
    expect(v.slots[0]).toContain('выше потолка')
  })

  it('предмет не того типа слота — это ошибка', () => {
    const hero = blankHero('Soldier', 50)
    const hat = data.items.find((i) => i.type === 'Magician Hat')!
    const broken: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: hat.name } : s)) }
    expect(validateHero(data, broken).slots[0]).toContain('не для слота')
  })

  it('второй артефакт — ошибка', () => {
    const hero = blankHero('Soldier', 50)
    const artifacts = [...artifactNames(data)]
    const a1 = data.items.find((i) => i.name === artifacts[0])!
    const a2 = data.items.find((i) => i.name === artifacts[1])!
    const broken: HeroInstance = { ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: a1.name } : i === 5 ? { ...s, item: a2.name } : s)) }
    const v = validateHero(data, broken)
    expect(v.slots.some((s) => s?.includes('второй артефакт'))).toBe(true)
  })
})

describe('статы пересчитываются сразу (calcStats), база и эталон', () => {
  it('смена предмета меняет статы без перезагрузки', () => {
    const hero = blankHero('Soldier', 30)
    const before = calcStats(hero, data)
    const sword = firstAllowed(data, hero, 0).item
    const after = calcStats({ ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: sword.name } : s)) }, data)
    expect(after.atk).toBeGreaterThan(before.atk)
    expect(after.breakdown.baseSource).toBe('model')
  })

  it('качество умножает статы предмета (A7)', () => {
    const hero = blankHero('Soldier', 30)
    const sword = firstAllowed(data, hero, 0).item
    const at = (quality: HeroSlot['quality']): number => calcStats({ ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: sword.name, quality } : s)) }, data).atk
    expect(at('Legendary')).toBeGreaterThan(at('Normal'))
  })

  it('эталон: пока уровень не менялся, база берётся из экспорта', () => {
    const hero = fixtureHero()
    const stats = calcStats(hero, data)
    expect(stats.breakdown.baseSource).toBe('reference')
    expect(referenceBase(hero, data)).not.toBeNull()
    // Статы эталона воспроизводятся при прежней экипировке (A8).
    expect(stats.atk).toBe(hero.reference!.stats.atk)
    expect(stats.hp).toBe(hero.reference!.stats.hp)
  })

  it('после смены уровня эталон не применяется: базу считает модель (только экипировка — эталон сохраняется)', () => {
    const hero = fixtureHero()
    // Меняем только экипировку — база из эталона остаётся (требование владельца, п. 4).
    const otherItem = data.items.find((i) => i.type === 'Sword' && i.tier <= heroMaxItemTier(data, hero.level)!)!
    const reEquipped = { ...hero, slots: hero.slots.map((s, i) => (i === 0 ? { ...s, item: otherItem.name } : s)) }
    expect(calcStats(reEquipped, data).breakdown.baseSource).toBe('reference')

    // Меняем уровень — эталон того же уровня больше не подходит.
    const { hero: leveled, referenceOutdated } = changeLevel(hero, hero.level + 1)
    expect(referenceOutdated).toBe(true)
    const up = calcStats(leveled, data)
    expect(up.breakdown.baseSource).toBe('model')
    expect(referenceBase(leveled, data)).toBeNull()
    expect(baseAccuracyNote(leveled)).toContain('±9%')
    for (const st of ['atk', 'def', 'hp'] as const) {
      expect(up.breakdown.base[st]).toBeGreaterThan(0)
      // Модель и эталон расходятся — это и есть та самая неточность (±9% по HP, A8).
      expect(Math.abs(up.breakdown.base[st] - calcStats(hero, data).breakdown.base[st]) / calcStats(hero, data).breakdown.base[st]).toBeLessThan(1)
    }
    expect(up.breakdown.base.atk).not.toBe(calcStats(hero, data).breakdown.base.atk)

    // Вернули уровень обратно — эталон снова рабочий (он не потерян).
    const back = changeLevel(leveled, hero.level)
    expect(back.referenceOutdated).toBe(false)
    expect(calcStats(back.hero, data).breakdown.baseSource).toBe('reference')
    expect(baseAccuracyNote(back.hero)).toBeNull()
  })

  it('рост базы по уровню — из HERO_LEVEL_STAT_GROWTH (A8)', () => {
    const hero = blankHero('Soldier', 10)
    const model = calcStats(hero, data)
    const cls = effectiveClass(hero, data)!
    expect(model.breakdown.base.atk).toBeCloseTo(cls.base.atk * (1 + HERO_LEVEL_STAT_GROWTH.atk.k * 9) + HERO_LEVEL_STAT_GROWTH.atk.c * 9, 6)
  })

  it('семена прибавляются к базе напрямую (A55)', () => {
    const hero = blankHero('Soldier', 30)
    const plain = calcStats(hero, data)
    const seeded = calcStats({ ...hero, seeds: { atk: 10, def: 5, hp: 20 } }, data)
    expect(seeded.atk - plain.atk).toBe(10)
    expect(seeded.def - plain.def).toBe(5)
    expect(seeded.hp - plain.hp).toBe(20)
  })

  it('навык, доступный классу, учитывается в расчёте', () => {
    const hero = blankHero('Ninja', 35)
    const skill = skillChoices(data, hero).find((s) => s.effects.some((e) => e.stat === 'atk' || e.stat === 'hp'))
    if (!skill) return
    const before = calcStats(hero, data)
    const after = calcStats({ ...hero, skills: [skill.id] }, data)
    expect(after.breakdown.skills.length).toBeGreaterThan(before.breakdown.skills.length)
    expect(after.atk + after.hp + after.def + after.crit + after.eva).not.toBe(before.atk + before.hp + before.def + before.crit + before.eva)
  })
})

describe('подсветка предметов выше потолка при понижении уровня', () => {
  it('надетый предмет выше нового потолка не удаляется, а подсвечивается', () => {
    const hero = fixtureHero()
    const item = data.items.find((i) => i.name === hero.slots[0].item)!
    const cap = heroMaxItemTier(data, 1)!
    expect(item.tier).toBeGreaterThan(cap)
    const lowered = { ...hero, level: 1, reference: null }
    expect(tierOverflowSlots(data, lowered)).toContain(0)
    expect(lowered.slots[0].item).toBe(hero.slots[0].item)
    // Валидация прямо говорит, что герой это не наденет.
    expect(validateHero(data, lowered).slots[0]).toContain('не наденет')
  })
})

describe('создание, копия для экспериментов и применение набора', () => {
  it('newHero — пустой герой без эталона, класс из данных', () => {
    const hero = newHero('Soldier', 'Новый')
    expect(hero.level).toBe(1)
    expect(hero.reference).toBeNull()
    expect(hero.draft).toBe(false)
    expect(hero.slots).toHaveLength(6)
    expect(hero.slots.every((s) => s.item === null)).toBe(true)
    expect(classChoices(data).some((c) => c.name === hero.className)).toBe(true)
  })

  it('draftCopy — копия с другим id, пометкой «черновик» и ссылкой на оригинал', () => {
    const hero = fixtureHero()
    const copy = draftCopy(hero)
    expect(copy.id).not.toBe(hero.id)
    expect(copy.draft).toBe(true)
    expect(copy.originId).toBe(hero.id)
    expect(copy.name).toContain('черновик')
    expect(copy.slots).toEqual(hero.slots)
    expect(calcStats(copy, data).atk).toBe(calcStats(hero, data).atk)
  })

  it('созданный вручную герой считается моделью роста и не падает на calcStats', () => {
    const hero = blankHero('Mage', 25)
    const stats = calcStats(hero, data)
    expect(stats.breakdown.baseSource).toBe('model')
    expect(stats.hp).toBeGreaterThan(0)
    expect(activeSkills(hero, data, stats.element).length).toBeGreaterThan(0) // врождённый навык класса
  })
})
