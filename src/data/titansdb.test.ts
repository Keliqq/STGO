import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureGameData } from '../test/fixtures.ts'
import { exportHeroesJson, loadHeroes, mergeHeroes, parseHeroesJson, saveHeroes, upsertByName } from './heroStore.ts'
import { memoryStore } from './storage.ts'
import { effectKeys, importTitansDb, nameKey, parseTitansDb } from './titansdb.ts'

const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const lines = text.trim().split(/\r?\n/)
const data = fixtureGameData()

describe('parseTitansDb', () => {
  it('18 героев, без ошибок', () => {
    const { heroes, errors } = parseTitansDb(text)
    expect(errors).toEqual([])
    expect(heroes).toHaveLength(18)
  })

  it('поля первого героя', () => {
    const [h] = parseTitansDb(text).heroes
    expect(h).toMatchObject({
      line: 1,
      name: 'Антуан',
      className: 'Knight',
      level: 26,
      titanSoul: false,
      artifact: null,
      heroElement: 'Light',
      stats: { hp: 527, atk: 1366, def: 5393, threat: 120, crit: 0.05, critDmg: 2, eva: 0.2, element: 90 },
    })
    expect(h.slots[0]).toEqual({
      slotType: 'Spear',
      item: 'Twicicle Javelin',
      itemTier: 7,
      quality: 'Normal',
      element: { value: 15, tier: 9, element: 'Light' },
      spirit: { name: 'Mammoth Spirit', description: '+10%DEF +10 Threat' },
    })
    expect(h.skills.map((s) => s.name)).toEqual(['Warlord', 'Thick Skin', 'Acrobatics'])
    expect(h.skills[0].description).toBeNull()
  })

  it('пустые камни и духи, артефакт', () => {
    const bru = parseTitansDb(text).heroes.find((h) => h.name === 'Брю')
    expect(bru?.artifact).toBe('Amulet of Midas')
    expect(bru?.slots[0].element).toBeNull()
    expect(bru?.slots[1].element).toEqual({ value: 10, tier: 7, element: 'Earth' })
    expect(bru?.slots.every((s) => s.spirit === null)).toBe(true)
  })

  it('блок через «|» ищется динамически: лишняя колонка перед ним не ломает разбор', () => {
    const shifted = lines[0].split('\t')
    shifted.splice(20, 0, 'extra')
    const { heroes, errors } = parseTitansDb(shifted.join('\t'))
    expect(errors).toEqual([])
    expect(heroes[0].className).toBe('Knight')
  })

  it('сломанная строка → ошибка с номером, остальные разбираются', () => {
    const { heroes, errors } = parseTitansDb(['мусор\tбез блока', lines[1], ''].join('\n'))
    expect(heroes).toHaveLength(1)
    expect(errors).toEqual([{ line: 1, message: 'нет блока снаряжения (поле с разделителями «|»)' }])
  })
})

describe('сопоставление с GameData', () => {
  it('все 18 сопоставлены; навыки хранятся линейкой (1-я ступень)', () => {
    const { heroes, issues } = importTitansDb(text, data)
    expect(heroes).toHaveLength(18)
    expect(issues).toEqual([{ hero: 'Логарсон', line: 18, level: 'warning', message: 'навык «Mana Shield» (сопоставлен по описанию с «Magic Shield»)' }])
    const antoine = heroes[0]
    expect(antoine.skills).toEqual(['Warlord', 'Thick Skin', 'Acrobatics'])
    expect(antoine.slots[0]).toEqual({ item: 'Twicicle Javelin', quality: 'Normal', element: 'Sacred Element', spirit: 'Mammoth Spirit' })
    expect(antoine.reference?.level).toBe(26)
  })

  it('id иконки вместо имени (S_scythemaster → Scythe Master)', () => {
    const irvin = importTitansDb(text, data).heroes.find((h) => h.name === 'Ирвин')
    expect(irvin?.skills[0]).toBe('Scythe Master')
  })

  it('имена без учёта регистра и вида апострофа; несопоставленное — в отчёт', () => {
    const line = lines[3].replace("Whack-O'-Lantern", 'WHACK-O’-LANTERN').replace('Landsknecht Plate', 'Nonexistent Plate').replace('Flame Brand', 'Renamed Brand').replace('Shield Master (+250% Defense with Shield)', 'Unknown Skill (+999% ATK)')
    const { heroes, issues } = importTitansDb(line, data)
    expect(heroes[0].slots[0].item).toBe("Whack-O'-Lantern")
    expect(heroes[0].slots[1].item).toBeNull()
    expect(issues.map((i) => i.message)).toEqual([
      'слот 2: предмет «Nonexistent Plate» не найден',
      'навык «Renamed Brand» (сопоставлен по описанию с «Flame Brand»)',
      'навык «Unknown Skill» не найден',
    ])
  })

  it('неизвестный класс — герой пропущен с ошибкой', () => {
    const { heroes, issues } = importTitansDb(lines[0].replace('|Knight|', '|Paladin|'), data)
    expect(heroes).toEqual([])
    expect(issues[0]).toMatchObject({ level: 'error', message: 'класс «Paladin» не найден — герой пропущен' })
  })

  it('ключи эффектов одинаковы для SKILLS и сокращений TitansDB', () => {
    expect(effectKeys('+120% DEF & +30% HP')).toEqual(['def%120', 'hp%30'])
    expect(effectKeys('+120% Defense, +30% Health, +30% Mana Shield')).toEqual(['def%120', 'hp%30', 'manaShield%30'])
    expect(effectKeys('+10%DEF +10 Threat')).toEqual(['def%10', 'threat10'])
    expect(nameKey('Jack-o’-Bongo')).toBe(nameKey("JACK-O'-BONGO"))
  })
})

describe('хранилище героев', () => {
  const { heroes } = importTitansDb(text, data)

  it('сохранение и загрузка через IndexedDB-обёртку', async () => {
    const store = memoryStore()
    expect(await loadHeroes(store)).toEqual({ heroes: [], error: null })
    await saveHeroes(heroes, store)
    expect((await loadHeroes(store)).heroes).toEqual(heroes)
  })

  it('повреждённая запись не роняет приложение', async () => {
    const store = memoryStore({ heroes: { version: 999, heroes: [] } })
    const r = await loadHeroes(store)
    expect(r.heroes).toEqual([])
    expect(r.error).toMatch(/формат записи/)
  })

  it('экспорт → импорт JSON без потерь', () => {
    const json = exportHeroesJson(heroes, new Date('2026-10-09T00:00:00Z'))
    expect(parseHeroesJson(json)).toEqual({ heroes })
  })

  it('чужой JSON и не-JSON — понятная ошибка', () => {
    expect(parseHeroesJson('{oops')).toEqual({ error: 'Файл не является JSON.' })
    expect(parseHeroesJson('{"a":1}')).toMatchObject({ error: expect.stringMatching(/не файл героев/) })
  })

  it('слияние: тот же id заменяется, новые добавляются', () => {
    const [a, b, c] = heroes
    const merged = mergeHeroes([a, b], [{ ...b, name: 'Новое имя' }, c])
    expect(merged.map((h) => h.name)).toEqual([a.name, 'Новое имя', c.name])
  })

  it('повторный импорт того же экспорта обновляет героев, а не дублирует', () => {
    const again = importTitansDb(text, data).heroes
    const r = upsertByName(heroes, again)
    expect(r).toMatchObject({ added: 0, updated: 18 })
    expect(r.heroes.map((h) => h.id)).toEqual(heroes.map((h) => h.id))
  })
})
