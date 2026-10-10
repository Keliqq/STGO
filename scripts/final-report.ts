/**
 * Финальная проверка оптимизатора на fixtures/heroes.txt: типовые локации + универсальный режим,
 * каждый случай в трёх пулах: «all до T20» (эталонный верх), «all до T(макс. тир героев + 1)»
 * и «по умолчанию» (ограничения страницы «Подбор»: макс. надетый тир + 1, Superior, камни до T9, духи без Титана).
 * Результат — docs/REPORT.md. Запуск: node scripts/final-report.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureGameData } from '../src/test/fixtures.ts'
import { importTitansDb } from '../src/data/titansdb.ts'
import type { OptimizerConstraints, OptimizerInput, OptimizerResult } from '../src/engine/optimizer.ts'
import type { Quest } from '../src/data/types.ts'
import { defaultConstraints } from '../src/engine/constraints.ts'
import { fighterFromChampion, fighterFromHero, simulateTeam } from '../src/engine/combat.ts'
import { applyHeroConfig, questLabel, runOptimizer } from '../src/engine/optimizer.ts'
import { rerollAdvice } from '../src/engine/skills.ts'
import { threatWarning } from '../src/engine/statWeights.ts'

const ROOT = join(import.meta.dirname, '..')
const data = fixtureGameData()
const text = readFileSync(join(ROOT, 'fixtures', 'heroes.txt'), 'utf8')
const { heroes } = importTitansDb(text, data)

const pick = (name: string) => heroes.find((h) => h.name === name)!
const team = [pick('Антуан'), pick('Беовульф'), pick('Эбигейл')]
const champion = { name: 'Argon', rank: 5 }

// Самые тяжёлые квесты фикстур (по HP монстра), чтобы исход завис от подбора, а не был 100% из коробки.
const byHp = (a: Quest, b: Quest): number => b.monsterHp - a.monsterHp
const allBoss = [...data.quests.filter((q) => q.variant === 'boss')].sort(byHp)
const allNormal = [...data.quests.filter((q) => q.variant === 'normal')].sort(byHp)
const bossPlain = allBoss.find((q) => !q.barrier)
const withBarrier = allBoss.find((q) => q.barrier)
const normal = allNormal[0]
// Cinderlake Volcano Extreme (босс) — локация из sanity-вопроса: 0 % → 100 % только на пуле all до T20.
const cinderlake = data.quests.find((q) => q.area === 'Cinderlake Volcano' && q.variant === 'boss' && q.difficulty === 'Extreme')
const chosen: Quest[] = [bossPlain, withBarrier, normal, cinderlake].filter((q): q is Quest => !!q)

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

// Максимальный тир предметов по HERO LEVELS для уровня каждого героя отряда + 1 — «достижимый» потолок.
const heroMaxTier = (level: number): number => data.heroLevels.find((l) => l.level === level)?.maxItemTier ?? 0
const realTier = Math.max(...team.map((h) => heroMaxTier(h.level))) + 1

const defaults = defaultConstraints(data, team)
/** Потолки тира по героям: «макс. надетый у него + 1» (сессия 13 — ограничения на героя). */
const perHeroNote = (defaults.perHero ?? []).map((c, i) => `${team[i]?.name ?? `герой ${i + 1}`} T${c.maxItemTier}`).join(', ')

interface PoolCase {
  title: string
  constraints: OptimizerConstraints
}
const pools: PoolCase[] = [
  {
    title: 'пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)',
    constraints: { maxItemTier: 20, maxQuality: 'Legendary', maxStoneTier: null, spirits: null },
  },
  {
    title: `пул all: любые предметы и камни до T${realTier} (макс. тир героев ${realTier - 1} + 1), Legendary`,
    constraints: { maxItemTier: realTier, maxQuality: 'Legendary', maxStoneTier: realTier, spirits: null },
  },
  {
    title: `ограничения по умолчанию: до T${defaults.maxItemTier} на героя (макс. надетый у него + 1; ${perHeroNote}), ${defaults.maxQuality}, камни до T${defaults.maxStoneTier}, духи без Титана`,
    constraints: defaults,
  },
]

function baseWinRate(qs: Quest[], weights: number[]): number {
  const fighters = team.map((h) => fighterFromHero(h, data))
  const champ = data.champions.find((c) => c.name === champion.name)
  if (champ) fighters.push(fighterFromChampion(champ, champion.rank, data))
  const wSum = weights.reduce((a, b) => a + b, 0)
  return qs.reduce((a, q, i) => a + weights[i] * simulateTeam(fighters, q, { runs: 2000, seed: 42 }).winRate, 0) / wSum
}

function renderCase(title: string, res: OptimizerResult, ms: number, before: number, adviceText: string[]): string[] {
  const lines: string[] = []
  lines.push(`### ${title}`)
  lines.push('')
  lines.push(`- Цель: **${pct(res.objective)}** (до подбора — ${pct(before)}), симуляций: ${res.simsUsed}, время: ${(ms / 1000).toFixed(1)} с${res.tieBreakUsed ? ', выбор частично по тай-брейку' : ''}`)
  for (const pq of res.perQuest) lines.push(`- ${pq.label}: win rate ${pct(pq.winRate)}, раундов ${pq.avgRounds.toFixed(1)}, барьер ${pq.barrierBroken ? 'пробит' : 'НЕ пробит'}`)
  if (res.worstQuest) lines.push(`- Худшая локация: ${res.worstQuest.label} — ${pct(res.worstQuest.winRate)}`)
  for (const w of res.warnings) lines.push(`- ⚠ ${w}`)
  lines.push('')
  lines.push('| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |')
  lines.push('|---|---|---|---|---|---|')
  res.explanations.forEach((expls, hi) => {
    for (const e of expls) {
      const why = [e.statHint?.text, e.statHint?.fallback ? `минус: ${e.statHint.fallback}` : '', e.statHint?.note ?? ''].filter(Boolean).join(' · ')
      lines.push(`| ${team[hi].name} | ${e.slot + 1} | ${e.from} | ${e.to} | ${e.winRateDelta >= 0 ? '+' : ''}${(e.winRateDelta * 100).toFixed(1)} п.п. | ${why || '—'} |`)
    }
  })
  const w = res.statWeights
  if (w) {
    lines.push('')
    lines.push(`Веса статов (метрика: ${w.metric}${w.probe ? `, на ослабленном зонде: HP ÷ ${w.probe.hpFactor.toFixed(0)}, урон ÷ ${w.probe.dmgFactor.toFixed(1)}` : ''}):`)
    for (const h of w.heroes) lines.push(`- ${h.name}: ${h.headline}`)
    const shares = w.threat.map((t) => `${t.name} ${(t.share * 100).toFixed(0)}%`).join(', ')
    lines.push(`- Доли атак босса: ${shares}`)
    const tankIdx = team.length > 1 ? team.map((h) => fighterFromHero(h, data).def).reduce((b, d, i, a) => (d > a[b] ? i : b), 0) : null
    const warn = threatWarning(w, tankIdx)
    if (warn) lines.push(`- ⚠ ${warn}`)
    if (w.barrier) lines.push(`- Барьер ${w.barrier.bestElement} ${w.barrier.hp}: у отряда ${w.barrier.have}${w.barrier.broken ? ' (пробит)' : `, не хватает ${w.barrier.missing}`}`)
  }
  if (adviceText.length) {
    lines.push('')
    lines.push('Навыки:')
    for (const a of adviceText) lines.push(`- ${a}`)
  }
  lines.push('')
  return lines
}

const out: string[] = []
out.push('# Отчёт: финальная проверка оптимизатора')
out.push('')
out.push(`Сгенерировано: ${new Date().toISOString().slice(0, 10)} командой \`node scripts/final-report.ts\`.`)
out.push('')
out.push(`Отряд: ${team.map((h) => `${h.name} (${h.className} ${h.level})`).join(', ')} + чемпион ${champion.name} ранг ${champion.rank}.`)
out.push('Данные — фикстуры листов (fixtures/sheets), пороги защиты — из фикстур (без stcentral-hub).')
out.push('')
out.push('Каждая локация посчитана в трёх пулах (см. «Пулы» ниже). Sanity-вывод по «Cinderlake Volcano Extreme 0 % → 100 %»:')
out.push(`это достигается только на пуле all до T20 с качеством Legendary (раздел с пометкой «эталонный верх»);`)
out.push(`для героев 25–26 уровней (макс. тир ${realTier - 1} по HERO LEVELS) T20-набор недостижим — см. разделы «достижимый пул» и «ограничения по умолчанию».`)
out.push('')

for (const q of chosen) {
  for (const p of pools) {
    const input: OptimizerInput = {
      heroes: team,
      champion,
      mode: 'quest',
      quests: [{ quest: q, weight: 1 }],
      constraints: p.constraints,
      withStatWeights: true,
      statWeightRuns: 500,
    }
    const before = baseWinRate([q], [1])
    const t0 = Date.now()
    const res = await runOptimizer(data, input)
    const ms = Date.now() - t0
    let adviceText: string[] = []
    if (p.constraints.maxItemTier === 20) {
      const adv = rerollAdvice(data, input.heroes.map((h, i) => applyHeroConfig(h, res.configs[i])), champion, [{ quest: q, weight: 1 }], { runs: 500 })
      adviceText = adv.advice.filter((a) => a.action === 'reroll').map((a) => `${a.skillName} (слот ${a.skillIndex + 1}): ${(a.contribution * 100).toFixed(1)} п.п. — ${a.reasons[0]}`)
    }
    out.push(...renderCase(`Локация: ${questLabel(q)} — ${p.title}`, res, ms, before, adviceText))
  }
}

const uniQuests = allBoss.slice(0, 4)
for (const p of pools) {
  const uniInput: OptimizerInput = {
    heroes: team,
    champion,
    mode: 'universal',
    quests: uniQuests.map((q) => ({ quest: q, weight: 1 })),
    constraints: p.constraints,
  }
  const beforeUni = baseWinRate(uniQuests, uniQuests.map(() => 1))
  const t0 = Date.now()
  const uniRes = await runOptimizer(data, uniInput)
  out.push(...renderCase(`Универсальный режим: ${uniQuests.map((q) => q.area).join(', ')} (Hard, боссы) — ${p.title}`, uniRes, Date.now() - t0, beforeUni, []))
}

writeFileSync(join(ROOT, 'docs', 'REPORT.md'), out.join('\n') + '\n', 'utf8')
console.log(`docs/REPORT.md записан (${out.length} строк)`)
