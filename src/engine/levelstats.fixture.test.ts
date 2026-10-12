/**
 * Сверка модели роста базы героя (HERO_LEVEL_STAT_GROWTH) с таблицей stcalc.com по уровням:
 * 42 класса × 50 уровней, индекс 0 = уровень 1.
 *
 * fixtures/stcalc-levelstats.json — только для локальной проверки: лицензии у файла нет,
 * в репозиторий и в бандл он не попадает (.gitignore, см. A8). Если файла нет — тест пропускается.
 *
 * Запуск с числами: npx vitest run src/engine/levelstats.fixture.test.ts --silent=false
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureGameData } from '../test/fixtures.ts'
import { MAIN_STATS, baseStatsAt, type MainStat } from './stats.ts'

type Table = Record<string, Record<MainStat, number[]>>

const FILE = join(import.meta.dirname, '..', '..', 'fixtures', 'stcalc-levelstats.json')
const path = existsSync(FILE) ? FILE : null
const LEVELS = 50
const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)

describe.skipIf(path === null)('сверка с таблицей статов по уровням (stcalc, локальный файл)', () => {
  const data = fixtureGameData()
  const table = path === null ? ({} as Table) : (JSON.parse(readFileSync(path, 'utf8')) as Table)
  const classes = Object.keys(table)

  it('таблица: 42 класса по 50 уровней, все классы есть в HEROES', () => {
    expect(classes).toHaveLength(42)
    for (const cls of classes) {
      for (const st of MAIN_STATS) expect(table[cls][st], `${cls}.${st}`).toHaveLength(LEVELS)
      expect(data.heroClasses.find((c) => c.name === cls), cls).toBeDefined()
    }
  })

  it('уровень 1 в таблице совпадает с базой класса из HEROES (кроме Mage ATK)', () => {
    // У Mage ATK таблица даёт 20, лист HEROES — 24. Движок работает по HEROES, поэтому здесь это
    // осознанное исключение: расхождение источников, а не модели (см. A8).
    const expected = new Set(['Mage.atk'])
    const mismatches: string[] = []
    for (const cls of classes) {
      const card = data.heroClasses.find((c) => c.name === cls)!
      for (const st of MAIN_STATS) {
        if (table[cls][st][0] !== card.base[st]) mismatches.push(`${cls}.${st}`)
      }
    }
    expect(mismatches).toEqual([...expected])
  })

  it('модель роста: расхождение с таблицей зафиксировано (регрессия — не хуже записанного)', () => {
    const errs: Record<MainStat, number[]> = { atk: [], def: [], hp: [] }
    const rows: string[] = []
    for (const cls of classes) {
      const card = data.heroClasses.find((c) => c.name === cls)!
      const line: string[] = []
      for (const st of MAIN_STATS) {
        const e = Array.from({ length: LEVELS }, (_, i) => baseStatsAt(card, i + 1)[st] / table[cls][st][i] - 1)
        errs[st].push(...e)
        line.push(`${st} RMS ${pct(rms(e))} max ${pct(Math.max(...e.map(Math.abs)))}`)
      }
      rows.push(`| ${cls} | ${card.group} | ${line.join(' | ')} |`)
    }
    const summary = MAIN_STATS.map((st) => `${st} RMS ${pct(rms(errs[st]))} max ${pct(Math.max(...errs[st].map(Math.abs)))}`)
    console.log(`Итого 42 класса × 50 уровней: ${summary.join(' · ')}`)
    if (process.env.REPORT) console.log(['| Класс | Группа | ATK | DEF | HP |', '|---|---|---|---|---|', ...rows].join('\n'))
    // Границы с запасом к записанному в A8 (ATK ≈ 58%, DEF ≈ 61%, HP ≈ 24%). Сверка не должна незаметно ухудшаться.
    expect(rms(errs.atk)).toBeLessThan(0.7)
    expect(rms(errs.def)).toBeLessThan(0.7)
    expect(rms(errs.hp)).toBeLessThan(0.3)
  })
})
