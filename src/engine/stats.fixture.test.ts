/**
 * Сверка расчёта статов с экспортом TitansDB по двум наборам героев:
 *   · fixtures/heroes.txt — 18 героев, классы базовые, уровни 23–33;
 *   · fixtures/heroes-2026-10-12.txt — 19 героев, уровни 31–37 (классов 15).
 * Итоги и разбор расхождений — docs/ASSUMPTIONS.md (A8) и docs/PROGRESS.md.
 * Таблица по героям: REPORT=1 npx vitest run src/engine/stats.fixture.test.ts --silent=false
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { GameData, HeroInstance } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { HERO_LEVEL_STAT_GROWTH } from './constants.ts'
import { calcStats, DEFAULT_MODEL, MAIN_STATS, referenceBase, type MainStat } from './stats.ts'

const data = fixtureGameData()
const ROOT = join(import.meta.dirname, '..', '..')

const err = (calc: number, expected: number): number => calc / expected - 1
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

interface Fixture {
  file: string
  heroes: number
  /** RMS ошибки модели без эталона по ATK/DEF. */
  atkDefRms: number
  /** Предел ошибки на одного героя по ATK/DEF. */
  atkDefMax: number
  /** RMS по HP: цель ±3% (A8) недостижима — у игры своя ступенчатая таблица роста на класс. */
  hpRms: number
  /** Предел ошибки на одного героя по HP. */
  hpMax: number
  /**
   * Перекрёстная проверка «Вестия → Логарсон» (один класс, разные экипировка и навыки).
   * На T14-снаряжении новой фикстуры восстановленная база грубее (ATK +16% к HEROES), поэтому предел выше.
   */
  crossMax: number
}

const FIXTURES: Fixture[] = [
  { file: 'heroes.txt', heroes: 18, atkDefRms: 0.025, atkDefMax: 0.06, hpRms: 0.1, hpMax: 0.3, crossMax: 0.02 },
  { file: 'heroes-2026-10-12.txt', heroes: 19, atkDefRms: 0.025, atkDefMax: 0.06, hpRms: 0.1, hpMax: 0.3, crossMax: 0.05 },
]

for (const fx of FIXTURES) {
  const text = readFileSync(join(ROOT, 'fixtures', fx.file), 'utf8')
  const { heroes, issues } = importTitansDb(text, data)
  const ref = (h: HeroInstance) => {
    if (!h.reference) throw new Error('нет эталона')
    return h.reference.stats
  }
  const modelOnly = heroes.map((h) => ({ h, s: calcStats(h, data, { useReference: false }) }))

  describe(`сверка с fixtures/${fx.file}`, () => {
    it(`импорт: ${fx.heroes} героев, все предметы, камни, духи и навыки сопоставлены`, () => {
      expect(heroes).toHaveLength(fx.heroes)
      expect(issues.filter((i) => i.level === 'error')).toEqual([])
      // Ни один предмет, камень, дух или навык не должен остаться несопоставленным.
      expect(issues.filter((i) => /не найден|недоступен/.test(i.message)).map((i) => i.message)).toEqual([])
      expect(issues.map((i) => i.message)).toEqual(['навык «Mana Shield» (сопоставлен по описанию с «Magic Shield»)'])
    })

    it('модель без эталона: ATK и DEF — RMS ≤ 2,5%, каждый герой ≤ 6%', () => {
      for (const st of ['atk', 'def'] as MainStat[]) {
        const errs = modelOnly.map(({ h, s }) => err(s[st], ref(h)[st]))
        expect(rms(errs), st).toBeLessThan(fx.atkDefRms)
        for (const [i, e] of errs.entries()) expect(Math.abs(e), `${st} ${heroes[i].name}`).toBeLessThan(fx.atkDefMax)
      }
    })

    it('модель без эталона: HP — RMS ≤ 10%, каждый герой ≤ 30% (цель ±3% не достигнута, A8)', () => {
      const errs = modelOnly.map(({ h, s }) => err(s.hp, ref(h).hp))
      expect(rms(errs)).toBeLessThan(fx.hpRms)
      for (const [i, e] of errs.entries()) expect(Math.abs(e), heroes[i].name).toBeLessThan(fx.hpMax)
    })

    it('с эталоном экспорта статы воспроизводятся точно', () => {
      for (const h of heroes) {
        const s = calcStats(h, data)
        expect(s.breakdown.baseSource).toBe('reference')
        for (const st of MAIN_STATS) expect(Math.abs(s[st] - ref(h)[st]), `${h.name} ${st}`).toBeLessThanOrEqual(1)
      }
    })

    it('перекрёстная проверка: база Вестии (Geomancer) предсказывает Логарсона', () => {
      const v = heroes.find((h) => h.name === 'Вестия')
      const l = heroes.find((h) => h.name === 'Логарсон')
      if (!v || !l) throw new Error('нет героев')
      const base = referenceBase(v, data)
      if (!base) throw new Error('нет базы')
      const vcls = data.heroClasses.find((c) => c.name === v.className)!
      // База₁ класса из эталонной базы Вестии (обратный ход по форме роста), затем рост модели до уровня Логарсона.
      const base1 = {} as Record<MainStat, number>
      for (const st of MAIN_STATS) {
        const g = HERO_LEVEL_STAT_GROWTH[st]
        const x = v.level - 1
        base1[st] = (base[st] - g.c[vcls.group] * x) / (1 + g.k[vcls.group] * x + g.d * x * x)
      }
      const s = calcStats(l, data, {
        useReference: false,
        model: {
          ...DEFAULT_MODEL,
          baseAt: (cls, level) => {
            const x = level - 1
            const at = (st: MainStat): number => {
              const g = HERO_LEVEL_STAT_GROWTH[st]
              return base1[st] * (1 + g.k[cls.group] * x + g.d * x * x) + g.c[cls.group] * x
            }
            return { atk: at('atk'), def: at('def'), hp: at('hp') }
          },
        },
      })
      for (const st of MAIN_STATS) expect(Math.abs(err(s[st], ref(l)[st])), st).toBeLessThan(fx.crossMax)
    })

    it('стихия героя совпадает с экспортом у всех, кроме Селены (+5 — сродство «All», A29)', () => {
      const diff = modelOnly
        .filter(({ h, s }) => s.element !== ref(h).element)
        .map(({ h, s }) => ({ name: h.name, delta: ref(h).element - s.element }))
      expect(diff).toEqual([{ name: 'Селена', delta: 5 }])
    })

    it('модельные Σ ATK% и Σ DEF% совпадают с игровыми (колонки 18/19 экспорта) — вкл. удвоение духа в Totem Pole (A27)', () => {
      for (const h of heroes) {
        const s = calcStats(h, data, { useReference: false, model: { ...DEFAULT_MODEL, baseAt: () => ({ atk: 0, def: 0, hp: 0 }) } })
        const p = h.reference?.pct
        if (!p) throw new Error(`${h.name}: нет pct в эталоне`)
        expect(Math.round(s.breakdown.pct.atk * 100), `${h.name} ATK%`).toBe(Math.round(p.atk))
        expect(Math.round(s.breakdown.pct.def * 100), `${h.name} DEF%`).toBe(Math.round(p.def))
      }
    })

    it('Midas: Amulet of Midas = +25% сходится с Брю лучше, чем +50% (сумма квадратов ошибок ATK и DEF, A15)', () => {
      const bru = heroes.find((h) => h.name === 'Брю')
      if (!bru) throw new Error('нет Брю')
      const withSkill = (skillId: string): GameData => {
        const d = structuredClone(data)
        for (const i of d.items) if (i.name === 'Amulet of Midas') i.artifactSkill = skillId
        return d
      }
      const sq = (skillId: string) => {
        const s = calcStats(bru, withSkill(skillId), { useReference: false })
        return err(s.atk, ref(bru).atk) ** 2 + err(s.def, ref(bru).def) ** 2
      }
      // +25% остаётся лучше +50% по сумме квадратов, но после переподгонки базы (A27) различие — в пределах шума (A15).
      expect(sq("Midas' Tragedy")).toBeLessThan(sq("Midas' Tragedy #2"))
    })

    it.runIf(process.env.REPORT)('таблица точности по героям', () => {
      const rows = modelOnly.map(({ h, s }) => {
        const r = ref(h)
        return `| ${h.name} | ${h.className} ${h.level} | ${r.atk} / ${s.atk} (${pct(err(s.atk, r.atk))}) | ${r.def} / ${s.def} (${pct(err(s.def, r.def))}) | ${r.hp} / ${s.hp} (${pct(err(s.hp, r.hp))}) | ${(r.crit * 100).toFixed(0)}/${(s.crit * 100).toFixed(0)} | ${r.critDmg}/${s.critDmg.toFixed(1)} | ${(r.eva * 100).toFixed(0)}/${(s.eva * 100).toFixed(0)} | ${r.threat}/${s.threat} | ${r.element}/${s.element} |`
      })
      console.log(['| Герой | Класс, ур. | ATK экспорт / расчёт | DEF | HP | Крит % | Множ. крита | Укл. % | Угроза | Стихия |', '|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n'))
      for (const st of MAIN_STATS) {
        const errs = modelOnly.map(({ h, s }) => err(s[st], ref(h)[st]))
        console.log(st, 'RMS', pct(rms(errs)), 'max', pct(Math.max(...errs.map(Math.abs))))
      }
    })
  })
}
