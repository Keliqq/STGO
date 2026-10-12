/**
 * Правила состава отряда и пары «чемпион ↔ герой» (сессия 28).
 *
 * Проверяем ровно то, что владелец назвал обязательным:
 *   · правила 1–4 ST-Central («Team Building, Not Guesswork») на синтетическом ростере — по примерам статьи:
 *     два героя на стихию барьера, один чемпион, один «красный» (Fighter), остальные — синие/зелёные;
 *   · пары «чемпион ↔ герой» по признакам героя: EVA после штрафа экстрима, крит без защитных навыков,
 *     угроза, класс (связки гайда Develion);
 *   · у каждой подсказки есть источник, а совет «чемпион ↔ герой» помечен как совет (`info`), не приговор.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { championBuild } from '../data/teams.ts'
import { importTitansDb } from '../data/titansdb.ts'
import type { Quest } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { plainHero } from '../test/synthetic.ts'
import { championPairHints, partyFacts, partyHints, ruleHints, type PartyFighterFact } from './teamRules.ts'
import type { TeamRunMember } from './teamRunner.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')
const fixtureHeroes = importTitansDb(readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8'), data).heroes

const darkBoss = data.quests.find((q) => q.area === 'Meteor Zone' && q.variant === 'boss' && q.difficulty === 'Extreme') as Quest
const airBoss = data.quests.find((q) => q.area === 'Howling Woods' && q.variant === 'boss' && q.difficulty === 'Extreme') as Quest
const noBarrier = data.quests.find((q) => q.area === 'Howling Woods' && q.variant === 'boss' && q.difficulty === 'Hard') as Quest
/** Обычный (не боссовый) квест без барьера — для проверок «совет не появляется». */
const normalQuest = data.quests.find((q) => q.variant === 'normal' && q.barrier === null) as Quest

const hero = (className: string, opts: { id?: string; name?: string; stone?: string | null } = {}): TeamRunMember => ({
  hero: plainHero(data, className, opts),
  build: null,
})

const hint = (hints: ReturnType<typeof partyHints>, code: string) => hints.find((h) => h.code === code)

describe('правила 1–4 на синтетическом ростере (ST-Central «Team Building, Not Guesswork»)', () => {
  it('правило 1: два героя стихии барьера — «два героя на стихию барьера»', () => {
    // Барьер Meteor Zone (босс, Extreme) — Тьма 400; Oblivion в шести слотах даёт по 210 стихии на героя.
    const two = [hero('Ninja', { id: 'a', name: 'Ниндзя' }), hero('Sensei', { id: 'b', name: 'Сенсей' })]
    const ok = hint(partyHints(two, darkBoss, data, { maxPartySize: 4 }), 'barrier')
    expect(ok?.level).toBe('ok')
    expect(ok?.message).toContain('дают 2')
    expect(ok?.source).toBe('https://st-central.net/team-building-not-guesswork/')

    // Один герой Тьмы — правило нарушено, и видно, что барьер не набрать.
    const one = [hero('Ninja', { id: 'a', name: 'Ниндзя' }), hero('Knight', { id: 'b', name: 'Рыцарь' })]
    const warn = hint(partyHints(one, darkBoss, data, { maxPartySize: 4 }), 'barrier')
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain('дают 1')
  })

  it('правило 1 не применяется к квесту без барьера', () => {
    const h = hint(partyHints([hero('Knight', { id: 'a' })], noBarrier, data), 'barrier')
    expect(h?.level).toBe('ok')
    expect(h?.message).toMatch(/барьера нет/)
  })

  it('правило 2: чемпион в отряде один', () => {
    const one: TeamRunMember[] = [hero('Knight', { id: 'a' }), { hero: null, build: championBuild('Argon', 5) }]
    expect(hint(partyHints(one, airBoss, data), 'champion-count')?.level).toBe('ok')

    const two: TeamRunMember[] = [...one, { hero: null, build: championBuild('Lilu', 4) }]
    const warn = hint(partyHints(two, airBoss, data), 'champion-count')
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain('2 чемпиона')
  })

  it('правило 3: «красный» (Fighter) в отряде обязателен', () => {
    const noFighter = [hero('Thief', { id: 'a', name: 'Вор' }), hero('Mage', { id: 'b', name: 'Маг' })]
    const warn = hint(partyHints(noFighter, airBoss, data, { maxPartySize: 3 }), 'fighter')
    expect(warn?.level).toBe('warn')
    expect(warn?.verifyChampions).toEqual(expect.arrayContaining(['Argon', 'Ashley', 'Bjorn', 'Rudo']))
    expect(warn?.message).toMatch(/чемпиона-бойца/)

    const withFighter = [...noFighter, hero('Knight', { id: 'c', name: 'Рыцарь' })]
    expect(hint(partyHints(withFighter, airBoss, data, { maxPartySize: 3 }), 'fighter')?.level).toBe('ok')
  })

  it('правило 4: остальные слоты — синие/зелёные, «красных» не больше одного', () => {
    const twoFighters = [hero('Knight', { id: 'a', name: 'Рыцарь' }), hero('Barbarian', { id: 'b', name: 'Варвар' }), hero('Mage', { id: 'c', name: 'Маг' })]
    const warn = hint(partyHints(twoFighters, airBoss, data, { maxPartySize: 3 }), 'support')
    expect(warn?.level).toBe('warn')
    expect(warn?.message).toContain('Fighter в отряде 2')

    const ok = hint(partyHints([hero('Knight', { id: 'a' }), hero('Thief', { id: 'b' }), hero('Mage', { id: 'c' })], airBoss, data, { maxPartySize: 3 }), 'support')
    expect(ok?.level).toBe('ok')
    expect(ok?.message).toMatch(/Разбойников 1, заклинателей 1/)
  })

  it('факты считают стихию, класс, угрозу и защитные навыки', () => {
    const members: TeamRunMember[] = [hero('Ninja', { id: 'a', name: 'Ниндзя' }), { hero: null, build: championBuild('Argon', 5) }]
    const facts = partyFacts(members, darkBoss, data)
    expect(facts.map((f) => f.name)).toEqual(['Ниндзя', 'Argon'])
    expect(facts[0].group).toBe('Rogue')
    expect(facts[0].element).toBe('Dark')
    expect(facts[0].elementValues.Dark).toBe(6 * 35)
    // Экстрим: уклонение в фактах — уже после штрафа −20 п.п. (A34).
    expect(facts[0].evaAfterPenalty).toBeCloseTo(facts[0].eva - 0.2, 10)
    expect(facts[1].isChampion).toBe(true)
    expect(facts.reduce((a, f) => a + f.threatShare, 0)).toBeCloseTo(1, 6)
  })

  it('герои фикстуры: правила дают подсказки по каждому отряду, у всех есть источник', () => {
    const members: TeamRunMember[] = fixtureHeroes.slice(0, 3).map((h) => ({ hero: h, build: null }))
    const hints = partyHints(members, airBoss, data, { maxPartySize: 3 })
    expect(hints.length).toBeGreaterThan(4)
    for (const h of hints) {
      expect(h.source).toMatch(/^https:\/\//)
      expect(h.message.length).toBeGreaterThan(5)
    }
    // На Extreme с барьером Воздуха 30 у героев фикстуры стихии мало — правило 1 честно ругается.
    expect(hint(hints, 'barrier')).toBeDefined()
  })
})

/** Факт «глазами правил»: сюда можно положить любые числа, не собирая экипировку. */
function fact(patch: Partial<PartyFighterFact> & { name: string }): PartyFighterFact {
  const base: PartyFighterFact = {
    name: patch.name,
    isChampion: false,
    className: 'Knight',
    group: 'Fighter',
    element: 'Light',
    elementValues: {},
    barrierValue: 0,
    eva: 0,
    evaAfterPenalty: 0,
    crit: 0.05,
    critDmg: 2,
    threat: 100,
    threatShare: 0.3,
    def: 1000,
    attackPower: 1000,
    defensiveSkills: 1,
  }
  return { ...base, ...patch }
}

describe('пары «чемпион ↔ герой» по признакам героя', () => {
  it('EVA 95%+ → Lilu (выживание уклоняющегося героя)', () => {
    const hints = championPairHints([fact({ name: 'Уклон', evaAfterPenalty: 0.96 })], darkBoss, data)
    const h = hints.find((x) => x.code === 'pair-eva-sustain')
    expect(h?.verifyChampions).toEqual(['Lilu'])
    expect(h?.level).toBe('info')
  })

  it('EVA 85–95% → Donovan / Malady / Polonia', () => {
    const hints = championPairHints([fact({ name: 'Средний', evaAfterPenalty: 0.88 })], darkBoss, data)
    expect(hints.find((x) => x.code === 'pair-eva-mid')?.verifyChampions).toEqual(['Donovan', 'Malady', 'Polonia'])
  })

  it('EVA 75–85% → Yami (+20% уклонения доводит до 95%)', () => {
    const hints = championPairHints([fact({ name: 'Йами', evaAfterPenalty: 0.78 })], darkBoss, data)
    const h = hints.find((x) => x.code === 'pair-eva-yami')
    expect(h?.verifyChampions).toEqual(['Yami'])
    expect(h?.message).toContain('+20%')
  })

  it('крит без защитных навыков → Rudo / Bjorn', () => {
    const hints = championPairHints([fact({ name: 'Крит', crit: 0.55, defensiveSkills: 0 })], darkBoss, data)
    const h = hints.find((x) => x.code === 'pair-crit')
    expect(h?.verifyChampions).toEqual(['Rudo', 'Bjorn'])
    // С защитными навыками совета нет — герой доживёт до своих критов.
    expect(championPairHints([fact({ name: 'Крит', crit: 0.55, defensiveSkills: 2 })], darkBoss, data).some((x) => x.code === 'pair-crit')).toBe(false)
  })

  it('класс из связки Develion → чемпион из связки (Polonia + Trickster, Lilu + Wanderer)', () => {
    const trickster = championPairHints([fact({ name: 'Плут', className: 'Trickster', group: 'Rogue' })], noBarrier, data)
    expect(trickster.find((x) => x.code === 'pair-class-Polonia')?.verifyChampions).toEqual(['Polonia'])
    const wanderer = championPairHints([fact({ name: 'Бродяга', className: 'Wanderer', group: 'Rogue' })], noBarrier, data)
    expect(wanderer.find((x) => x.code === 'pair-class-Lilu')?.verifyChampions).toEqual(['Lilu'])
    const donovan = championPairHints([fact({ name: 'Разбойник', className: 'Thief', group: 'Rogue' })], noBarrier, data)
    expect(donovan.find((x) => x.code === 'pair-class-Donovan')?.verifyChampions).toEqual(['Donovan'])
  })

  it('сильные герои → Sia, слабые → Argon', () => {
    const facts = [
      fact({ name: 'Сильный', attackPower: 5000 }),
      fact({ name: 'Слабый', attackPower: 500 }),
      fact({ name: 'Средний', attackPower: 1500 }),
    ]
    const hints = championPairHints(facts, noBarrier, data)
    expect(hints.find((x) => x.code === 'pair-strong-sia')?.message).toContain('Сильный')
    expect(hints.find((x) => x.code === 'pair-weak-argon')?.message).toContain('Слабый')
  })

  it('боссовый квест → Ashley (бонусы удваиваются против боссов)', () => {
    expect(championPairHints([fact({ name: 'Боец' })], airBoss, data).find((x) => x.code === 'pair-boss-ashley')?.verifyChampions).toEqual(['Ashley'])
    expect(championPairHints([fact({ name: 'Боец' })], normalQuest, data).some((x) => x.code === 'pair-boss-ashley')).toBe(false)
  })

  it('барьер не пробит → совет взять чемпиона с бонусом стихии (Rudo)', () => {
    const hints = championPairHints([fact({ name: 'Боец', barrierValue: 10 })], darkBoss, data)
    const h = hints.find((x) => x.code === 'pair-barrier-rudo')
    expect(h?.verifyChampions).toEqual(['Rudo'])
    expect(h?.message).toContain('400')
  })

  it('угроза: удары идут в одного, и он не танк → предупреждение с порогом 70%', () => {
    const quest = { ...airBoss, defCaps: { p50: 100, p70: 200, p75: 600 } }
    const hints = championPairHints([fact({ name: 'Хрупкий', threatShare: 0.8, def: 50 })], quest, data)
    const h = hints.find((x) => x.code === 'pair-threat')
    expect(h?.level).toBe('warn')
    expect(h?.message).toContain('80%')
  })

  it('чемпиону Malady/Reinhold нужен боец с высокой угрозой', () => {
    const hints = championPairHints([fact({ name: 'Танк', threatShare: 0.6 })], airBoss, data, 'Malady')
    const h = hints.find((x) => x.code === 'pair-survive')
    expect(h?.message).toMatch(/Chieftain/)
    expect(championPairHints([fact({ name: 'Танк' })], airBoss, data, 'Argon').some((x) => x.code === 'pair-survive')).toBe(false)
  })

  it('вердикт по текущему чемпиону: подходит — галочка, не подходит — совет сравнить симуляцией', () => {
    const knight: TeamRunMember = { hero: fixtureHeroes[0], build: null }
    const withAshley: TeamRunMember[] = [knight, { hero: null, build: championBuild('Ashley', 5) }]
    // Боссовый квест: совет «Ashley» — и чемпион с ним совпадает.
    expect(hint(partyHints(withAshley, airBoss, data, { maxPartySize: 4 }), 'champion-fit')?.level).toBe('ok')

    const withLilu: TeamRunMember[] = [knight, { hero: null, build: championBuild('Lilu', 5) }]
    const verdict = hint(partyHints(withLilu, airBoss, data, { maxPartySize: 4 }), 'champion-fit')
    expect(verdict?.level).toBe('info')
    expect(verdict?.verifyChampions).toContain('Ashley')
  })
})

describe('правила не спорят друг с другом на реальном ростере', () => {
  it('ruleHints всегда отдаёт ровно четыре правила (1–4)', () => {
    const facts = partyFacts(fixtureHeroes.slice(0, 3).map((h) => ({ hero: h, build: null })), airBoss, data)
    const rules = ruleHints(facts, airBoss, 3)
    expect(rules.map((r) => r.code).sort()).toEqual(['barrier', 'champion-count', 'fighter', 'support'])
    for (const r of rules) expect(r.source).toMatch(/^https:\/\//)
  })
})
