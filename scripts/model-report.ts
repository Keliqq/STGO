/**
 * Отчёт «что смоделировано» по всем классам и чемпионам — таблица для docs/PROGRESS.md.
 * Запуск: `node scripts/model-report.ts` (данные — из fixtures/sheets, без сети).
 */
import { modelingReport, reportRow } from '../src/engine/classModel.ts'
import { fixtureGameData } from '../src/test/fixtures.ts'

const data = fixtureGameData()
const report = modelingReport(data)

const classes = report.filter((e) => e.kind === 'class')
const champions = report.filter((e) => e.kind === 'champion')
const full = report.filter((e) => e.level === 'full').length
const partial = report.filter((e) => e.level === 'partial').length
const none = report.filter((e) => e.level === 'none').length

console.log(`Всего: ${report.length} (классов ${classes.length}, чемпионов ${champions.length})`)
console.log(`Полностью: ${full} · частично: ${partial} · не смоделировано: ${none}`)

const unclassified = report.flatMap((e) => e.unclassified.map((c) => `${e.name}: ${c}`))
console.log(`\nНеклассифицированных клауз: ${unclassified.length}`)
for (const u of unclassified) console.log(`  ! ${u}`)

console.log('\n## Классы\n')
console.log('| Класс (→ промоушен) | Вид | Смоделирован | Что не учтено |')
console.log('|---|---|---|---|')
for (const e of classes) console.log(reportRow(e))

console.log('\n## Чемпионы\n')
console.log('| Чемпион | Вид | Смоделирован | Что не учтено |')
console.log('|---|---|---|---|')
for (const e of champions) console.log(reportRow(e))

console.log('\n## Небоевые клаузы по классам (на подбор не влияют)\n')
for (const e of classes) {
  if (e.nonCombat.length === 0) continue
  console.log(`- **${e.name}**: ${e.nonCombat.join('; ')}`)
}
