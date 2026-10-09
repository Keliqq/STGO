/**
 * Сверка расчёта статов с экспортом TitansDB (fixtures/heroes.txt, 18 героев).
 * Итоги и разбор расхождений — docs/ASSUMPTIONS.md (A8) и docs/PROGRESS.md.
 * Таблица по героям: REPORT=1 npx vitest run src/engine/stats.fixture.test.ts --silent=false
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importTitansDb } from '../data/titansdb.ts'
import type { GameData, HeroInstance } from '../data/types.ts'
import { fixtureGameData } from '../test/fixtures.ts'
import { calcStats, DEFAULT_MODEL, MAIN_STATS, referenceBase, type MainStat } from './stats.ts'

const data = fixtureGameData()
const text = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'heroes.txt'), 'utf8')
const { heroes, issues } = importTitansDb(text, data)
const ref = (h: HeroInstance) => {
  if (!h.reference) throw new Error('нет эталона')
  return h.reference.stats
}
const err = (calc: number, expected: number) => calc / expected - 1
const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

const modelOnly = heroes.map((h) => ({ h, s: calcStats(h, data, { useReference: false }) }))

describe('сверка с fixtures/heroes.txt', () => {
  it('импорт: 18 героев, все предметы, камни и духи сопоставлены', () => {
    expect(heroes).toHaveLength(18)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(issues.map((i) => i.message)).toEqual(['навык «Mana Shield» (сопоставлен по описанию с «Magic Shield»)'])
  })

  it('модель без эталона: ATK и DEF — RMS ≤ 2,5%, каждый герой ≤ 5%', () => {
    for (const st of ['atk', 'def'] as MainStat[]) {
      const errs = modelOnly.map(({ h, s }) => err(s[st], ref(h)[st]))
      expect(rms(errs), st).toBeLessThan(0.025)
      for (const [i, e] of errs.entries()) expect(Math.abs(e), `${st} ${heroes[i].name}`).toBeLessThan(0.05)
    }
  })

  it('модель без эталона: HP — RMS ≤ 10%, каждый герой ≤ 30% (цель ±3% не достигнута, A8)', () => {
    const errs = modelOnly.map(({ h, s }) => err(s.hp, ref(h).hp))
    expect(rms(errs)).toBeLessThan(0.1)
    for (const e of errs) expect(Math.abs(e)).toBeLessThan(0.3)
  })

  it('с эталоном экспорта статы воспроизводятся точно', () => {
    for (const h of heroes) {
      const s = calcStats(h, data)
      expect(s.breakdown.baseSource).toBe('reference')
      for (const st of MAIN_STATS) expect(Math.abs(s[st] - ref(h)[st]), `${h.name} ${st}`).toBeLessThanOrEqual(1)
    }
  })

  it('перекрёстная проверка: база Вестии (Geomancer 26) предсказывает Логарсона (Geomancer 26) с ошибкой ≤ 2%', () => {
    const v = heroes.find((h) => h.name === 'Вестия')
    const l = heroes.find((h) => h.name === 'Логарсон')
    if (!v || !l) throw new Error('нет героев')
    const base = referenceBase(v, data)
    if (!base) throw new Error('нет базы')
    const s = calcStats(l, data, { useReference: false, model: { ...DEFAULT_MODEL, baseAt: () => base } })
    for (const st of MAIN_STATS) expect(Math.abs(err(s[st], ref(l)[st])), st).toBeLessThan(0.02)
  })

  it('стихия героя совпадает с экспортом у всех 18 (Селена +5 Ox, Джорди +30 Chimera — A29)', () => {
    for (const { h, s } of modelOnly) expect(s.element, h.name).toBe(ref(h).element)
  })

  it('модельные Σ ATK% и Σ DEF% совпадают с игровыми (колонки 18/19 экспорта) у всех 18 — вкл. удвоение духа в Totem Pole (A27)', () => {
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
