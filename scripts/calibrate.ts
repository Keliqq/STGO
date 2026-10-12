/**
 * Калибровка симуляции по отметкам «проходит / не проходит в игре».
 *
 * Запуск: `npm run calibrate` (или `node scripts/calibrate.ts --file fixtures/reality.json`).
 * Вход — JSON со страницы «Данные»: либо экспорт отметок, либо полная резервная копия
 * (`st-app/state`: герои + отметки). Героев можно взять и из экспорта TitansDB (`fixtures/heroes.txt`).
 *
 * Что делает:
 *  1) пересчитывает предсказание симуляции на каждую отметку: доля верных (порог 50 %), Brier score,
 *     разрезы ошибок (класс, квест, сложность, экстрим, барьер, герой);
 *  2) прогоняет варианты допущений ASSUMPTIONS.md (множители качества, сродство, крит врага, AoE,
 *     кривая защиты, база HP и др.) и ранжирует их по влиянию на ошибку;
 *  3) подгоняет не больше 3 (по умолчанию 3) самых влиятельных параметров, требуя, чтобы сверка статов
 *     по fixtures/heroes.txt не стала хуже (FIXTURE_RMS_GUARD);
 *  4) пишет отчёт `docs/CALIBRATION.md` (до/после) — числа для docs/PROGRESS.md.
 *
 * Пороги защиты квестов (stcentral-hub, CC BY-NC-ND 4.0, A10) в репозиторий не кладутся: скрипт читает
 * страницу вживую и кэширует только локально в test-results/ (в .gitignore), как и браузер.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { applyBreakpoints, parseBreakpointsHtml, BREAKPOINTS_SOURCE } from '../src/data/breakpoints.ts'
import { importTitansDb } from '../src/data/titansdb.ts'
import type { Champion, GameData, HeroInstance, Quest } from '../src/data/types.ts'
import {
  CALIBRATION_BASE_SEED_OFFSET,
  calibrationSummary,
  fixtureStatRms,
  FIXTURE_RMS_GUARD,
  MODEL_VARIANTS,
  rankInfluence,
  runPrediction,
  sensitivityAnalysis,
  TUNING_KNOBS,
  tuneParameters,
  worstGroups,
  type FixtureHeroes,
  type GroupBy,
  type PredictionInput,
  type PredictionRecord,
  type SensitivityRow,
  type TuningResult,
} from '../src/engine/calibration.ts'
import { MAIN_STATS, type MainStat } from '../src/engine/stats.ts'
import { fixtureGameData } from '../src/test/fixtures.ts'

const ROOT = join(import.meta.dirname, '..')
const CACHE_DIR = join(ROOT, 'test-results')
const BP_CACHE = join(CACHE_DIR, 'breakpoints.html')

// ───────────────────────────── аргументы ─────────────────────────────

interface CliArgs {
  file: string
  runs: number
  seed: number
  useReference: boolean
  out: string
  tune: boolean
  maxKnobs: number
  heroes: string
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const num = (name: string, fallback: number): number => {
    const v = get(name)
    const n = v === undefined ? NaN : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    file: get('file') ?? 'fixtures/reality.json',
    runs: num('runs', 2000),
    seed: num('seed', 42),
    useReference: argv.includes('--no-reference') ? false : true,
    out: get('out') ?? 'docs/CALIBRATION.md',
    tune: !argv.includes('--no-tune'),
    maxKnobs: num('max-knobs', 3),
    heroes: get('heroes') ?? 'fixtures/heroes.txt',
  }
}

// ───────────────────────────── входные данные ─────────────────────────────

interface RealityCheckPlain {
  id: string
  questId: string
  questLabel: string
  teamLabel: string
  passed: boolean
  simWinRate: number
  createdAt: string
  /** Кто погиб (нет поля — неизвестно). */
  deadHeroes?: string[]
}

interface JsonInput {
  checks: RealityCheckPlain[]
  heroes: HeroInstance[] | null
  source: string
}

function asChecks(v: unknown, where: string): RealityCheckPlain[] {
  if (!Array.isArray(v)) throw new Error(`${where}: ожидался массив отметок`)
  return v.map((raw, i) => {
    const c = raw as Record<string, unknown>
    if (typeof c.questId !== 'string' || typeof c.passed !== 'boolean' || typeof c.simWinRate !== 'number') {
      throw new Error(`${where}: отметка №${i + 1} не похожа на RealityCheck`)
    }
    return {
      id: String(c.id ?? i),
      questId: c.questId,
      questLabel: typeof c.questLabel === 'string' ? c.questLabel : '',
      teamLabel: typeof c.teamLabel === 'string' ? c.teamLabel : '',
      passed: c.passed,
      simWinRate: c.simWinRate,
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
      ...(Array.isArray(c.deadHeroes) ? { deadHeroes: c.deadHeroes.filter((x): x is string => typeof x === 'string') } : {}),
    }
  })
}

function readJsonInput(path: string): JsonInput {
  const text = readFileSync(path, 'utf8')
  const json = JSON.parse(text) as Record<string, unknown>
  if (json.format === 'st-app/state' || Array.isArray(json.heroes)) {
    return { checks: asChecks(json.realityChecks ?? [], path), heroes: (json.heroes as HeroInstance[]) ?? [], source: `${path} (резервная копия приложения)` }
  }
  if (Array.isArray(json.checks)) return { checks: asChecks(json.checks, path), heroes: null, source: `${path} (экспорт отметок)` }
  if (Array.isArray(json)) return { checks: asChecks(json, path), heroes: null, source: `${path} (массив отметок)` }
  throw new Error(`${path}: не найдены ни «realityChecks», ни «checks»`)
}

/** Пороги защиты квестов: живая страница stcentral-hub (кэш — локальный, не в репозитории). */
async function loadCaps(data: GameData): Promise<{ quests: Quest[]; matched: number; source: string }> {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true })
  // Свежая загрузка; не вышло — локальный кэш (страница могла измениться, тогда parse вернёт мало блоков).
  const load = async (): Promise<{ html: string | null; source: string }> => {
    try {
      const res = await fetch(BREAKPOINTS_SOURCE.url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      writeFileSync(BP_CACHE, html, 'utf8')
      return { html, source: 'stcentral-hub (свежая загрузка)' }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      if (existsSync(BP_CACHE)) return { html: readFileSync(BP_CACHE, 'utf8'), source: `локальный кэш ${BP_CACHE} (страница недоступна: ${why})` }
      return { html: null, source: `недоступны (${why})` }
    }
  }
  const { html, source } = await load()
  if (html === null) return { quests: data.quests, matched: 0, source: `${source} — режим «без порогов»` }
  const blocks = parseBreakpointsHtml(html)
  const applied = applyBreakpoints(data.quests, blocks)
  return { quests: applied.quests, matched: applied.matched, source: `${source}; покрыто ${applied.matched} из ${data.quests.length}` }
}

/** Поиск квеста: по id, затем по подписи, затем по «локация · тип · сложность». */
function findQuest(quests: Quest[], check: RealityCheckPlain): { quest: Quest | null; why: string } {
  const byId = quests.find((q) => q.id === check.questId)
  if (byId) return { quest: byId, why: 'id' }
  const label = (q: Quest): string => `${q.area} · ${q.variant === 'boss' ? 'босс' : 'обычный'} · ${q.difficulty}`
  const byLabel = quests.find((q) => label(q) === check.questLabel)
  if (byLabel) return { quest: byLabel, why: 'подпись' }
  const tail = check.questId.split('|')
  if (tail.length >= 3) {
    const [area, variant, difficulty] = tail
    const byParts = quests.find((q) => q.area === area && q.variant === variant && q.difficulty === difficulty)
    if (byParts) return { quest: byParts, why: 'разбор id' }
  }
  return { quest: null, why: 'не найден' }
}

// ───────────────────────────── сборка предсказаний ─────────────────────────────

interface BuildResult {
  records: PredictionInput[]
  /** Отметки, которые не удалось сопоставить. */
  problems: string[]
  /** Чемпионы, которых пришлось взять с максимальным рангом (в отметке ранга нет). */
  championNotes: string[]
}

function buildRecords(data: GameData, quests: Quest[], checks: RealityCheckPlain[], heroes: HeroInstance[]): BuildResult {
  const records: PredictionInput[] = []
  const problems: string[] = []
  const championNotes = new Set<string>()
  const byName = new Map(heroes.map((h) => [h.name.trim().toLowerCase(), h]))
  const championByName = new Map(data.champions.map((c) => [c.name.trim().toLowerCase(), c]))

  for (const check of checks) {
    const { quest } = findQuest(quests, check)
    if (!quest) {
      problems.push(`отметка «${check.questLabel || check.questId}»: квест не найден в данных`)
      continue
    }
    // teamLabel: «Антуан + Беовульф + Argon» — имена героев и, если есть, чемпион.
    const parts = check.teamLabel
      .split('+')
      .map((s) => s.trim())
      .filter(Boolean)
    const team: HeroInstance[] = []
    let champion: { champion: Champion; rank: number } | null = null
    const unknown: string[] = []
    for (const part of parts) {
      const hero = byName.get(part.toLowerCase())
      if (hero) {
        team.push(hero)
        continue
      }
      const champ = championByName.get(part.toLowerCase())
      if (champ && !champion) {
        const rank = Math.max(1, ...champ.ranks.map((r) => r.rank))
        champion = { champion: champ, rank }
        championNotes.add(`${champ.name}: ранг в отметке не сохраняется, взят максимальный (${rank})`)
        continue
      }
      unknown.push(part)
    }
    if (team.length === 0) {
      problems.push(`отметка «${check.questLabel}»: в teamLabel «${check.teamLabel}» не нашлось ни одного героя`)
      continue
    }
    if (unknown.length > 0) problems.push(`отметка «${check.questLabel}»: в teamLabel не опознаны «${unknown.join('», «')}»`)
    records.push({ check: { ...check, id: check.id || `${check.questId}#${records.length}` }, quest, heroes: team, champion })
  }
  return { records, problems, championNotes: [...championNotes] }
}

// ───────────────────────────── отчёт ─────────────────────────────

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits).replace('.', ',')}%`
const signedPp = (x: number): string => `${x >= 0 ? '+' : ''}${x.toFixed(1)} п.п.`
const rmsText = (r: Record<MainStat, number>): string => MAIN_STATS.map((st) => `${st.toUpperCase()} ${pct(r[st])}`).join(' · ')
const fmtDate = (iso: string): string => (iso ? new Date(iso).toLocaleString('ru-RU') : '—')

function groupTable(title: string, records: PredictionRecord[], by: GroupBy, minN = 2): string {
  const groups = worstGroups(records, by, minN)
  if (groups.length === 0) return `### ${title}\n\nНедостаточно отметок.\n`
  const lines = [`### ${title}`, '', '| Группа | Отметок | Верных | Ошибок | Предсказали «пройдёт», а не прошло | Предсказали «не пройдёт», а прошло | Сказали win rate | В игре прошло |', '|---|---|---|---|---|---|---|---|']
  for (const g of groups) {
    lines.push(
      `| ${g.key} | ${g.n} | ${g.matched} (${pct(g.matched / g.n, 0)}) | ${g.n - g.matched} (${pct(g.errRate, 0)}) | ${g.over} | ${g.under} | ${pct(g.meanPredicted, 0)} | ${pct(g.actualPassRate, 0)} |`,
    )
  }
  return lines.join('\n') + '\n'
}

function renderReport(args: {
  cli: CliArgs
  input: string
  capsSource: string
  heroesSource: string
  data: GameData
  records: PredictionInput[]
  predictions: PredictionRecord[]
  problems: string[]
  championNotes: string[]
  sens: SensitivityRow[] | null
  tuning: TuningResult | null
  fixture: FixtureHeroes
  fixtureRms: Record<MainStat, number>
  baselineRms: Record<MainStat, number>
}): string {
  const { cli, records, predictions } = args
  const s = calibrationSummary(predictions)
  const dates = predictions.map((r) => r.check.createdAt).filter(Boolean).sort()
  const out: string[] = []
  out.push('# Калибровка симуляции по отметкам «проходит / не проходит в игре»')
  out.push('')
  out.push(`Сгенерировано: ${new Date().toISOString()} · вход: ${args.input} · отметок: ${records.length} · прогонов на отметку: ${cli.runs} · seed ${cli.seed}`)

  out.push('')
  out.push('## Что считалось')
  out.push('')
  out.push(`- **Пороги защиты квестов:** ${args.capsSource}`)
  out.push(`- **Герои:** ${args.heroesSource}`)
  out.push(
    `- **База статов героя:** ${cli.useReference ? 'из эталона экспорта TitansDB (как в браузере, A8)' : 'из модели роста по уровню (A8, без эталона)'}`,
  )
  out.push('- Игровая отметка — бинарная («прошёл / не прошёл»), поэтому Brier score считается по бинарному исходу отметки, а не по доле выживших в игре.')
  out.push('- Предсказание — win rate симуляции; «верно» = win rate ≥ 50 % совпал с отметкой.')
  if (args.championNotes.length > 0) {
    out.push('')
    out.push('Оговорки:')
    for (const n of args.championNotes) out.push(`- ${n}`)
    out.push('- Уровень героев берётся из их карточек (переопределение уровня в отметке не сохраняется).')
  }
  if (args.problems.length > 0) {
    out.push('')
    out.push(`Не удалось использовать отметок: **${args.problems.length}**`)
    for (const p of args.problems) out.push(`- ${p}`)
  }

  out.push('')
  out.push('## 1. Метрики')
  out.push('')
  out.push('| Метрика | Значение |')
  out.push('|---|---|')
  out.push(`| Отметок (боёв) | **${s.n}** |`)
  out.push(`| Совпало с порогом 50 % | **${s.matched} из ${s.n} (${pct(s.agreement)})** |`)
  out.push(`| Brier score (пересчёт сейчас) | **${s.brier.toFixed(4)}** |`)
  out.push(`| Brier score (win rate в момент отметки) | ${s.brierStored.toFixed(4)} |`)
  out.push(`| Согласие по win rate в момент отметки | ${pct(s.agreementStored)} |`)
  out.push(`| Отметок «проходит» | ${pct(s.passRate)} |`)
  out.push(`| Средний предсказанный win rate | ${pct(s.meanPredicted)} |`)
  out.push(
    s.deathN > 0
      ? `| Brier по смерти героев (${s.deathN} пар «боец ↔ отметка») | **${s.deathBrier.toFixed(4)}**, верно ${pct(s.deathAgreement)} |`
      : '| Brier по смерти героев | погибшие не отмечены ни в одной отметке |',
  )
  out.push(`| Смещение (предсказали «пройдёт» чаще, чем было) | ${s.bias >= 0 ? '+' : ''}${(s.bias * 100).toFixed(1)} п.п. |`)
  out.push(`| Дата последней отметки (дата калибровки) | ${fmtDate(dates[dates.length - 1] ?? '')} |`)
  out.push('')
  out.push(s.brier >= 0.25 ? '> Brier на уровне «всегда 0.5»: предсказания не лучше монетки, смотреть разрезы ниже.' : '> Для справки: у «всегда 0.5» Brier был бы 0.25.')

  out.push('')
  out.push('## 2. Где ошибаемся')
  out.push('')
  out.push(groupTable('По классам героев (мультигеройная отметка считается в каждой группе)', predictions, 'class', 2))
  out.push(groupTable('По героям', predictions, 'hero', 2))
  out.push(groupTable('По квестам', predictions, 'quest', 1))
  out.push(groupTable('По сложности', predictions, 'difficulty', 1))
  out.push(groupTable('Экстрим и барьер', predictions, 'extreme', 1))
  out.push(groupTable('По барьеру', predictions, 'barrier', 1))
  out.push(groupTable('По типу квеста', predictions, 'variant', 1))

  out.push('')
  out.push('## 3. Чувствительность к допущениям')
  out.push('')
  out.push(`Ошибка сверки статов по fixtures/heroes.txt у базовой модели: ${rmsText(args.baselineRms)}. Допуск на подгонку — не хуже +${pct(FIXTURE_RMS_GUARD)} по каждому стату.`)
  if (!args.sens) {
    out.push('')
    out.push('Анализ чувствительности не считался (`--no-tune`).')
  } else {
    out.push('')
    out.push('| Вариант допущения | A | Brier | Согласие | Δ согласия | Δ Brier | Δ Brier смертей | Сверка статов (RMS) |')
    out.push('|---|---|---|---|---|---|---|---|')
    const base = args.sens.find((r) => r.id === 'base')
    const rows = base ? [base, ...rankInfluence(args.sens)] : args.sens
    for (const r of rows) {
      const isBase = r.id === 'base'
      out.push(
        `| ${r.label} | ${r.assumption} | ${r.summary.brier.toFixed(4)} | ${pct(r.summary.agreement)} | ${isBase ? '—' : signedPp(r.agreementDeltaPp)} | ${isBase ? '—' : `${r.brierDelta >= 0 ? '+' : ''}${r.brierDelta.toFixed(4)}`} | ${isBase || r.summary.deathN === 0 ? '—' : `${r.deathBrierDelta >= 0 ? '+' : ''}${r.deathBrierDelta.toFixed(4)}`} | ${rmsText(r.fixtureRms)} |`,
      )
    }
    const top = rankInfluence(args.sens).slice(0, 5)
    out.push('')
    out.push('Сильнее всего на ошибку влияют:')
    top.forEach((r, i) => {
      out.push(`${i + 1}. **${r.label}** (${r.assumption}) — Δ Brier ${r.brierDelta >= 0 ? '+' : ''}${r.brierDelta.toFixed(4)}, Δ согласия ${signedPp(r.agreementDeltaPp)}`)
    })
    out.push('')
    out.push('Полный список вариантов — в `src/engine/calibration.ts` (`MODEL_VARIANTS`).')
  }

  out.push('')
  out.push('## 4. Подгонка параметров (до / после)')
  out.push('')
  if (!args.tuning) {
    out.push('Подгонка не выполнялась (`--no-tune`).')
  } else {
    const t = args.tuning
    out.push('Цель подгонки — Brier исхода + Brier смертей героев (если погибшие отмечены).')
    out.push('')
    out.push('| | Доля верных | Brier | Brier смертей | Сверка статов (RMS) |')
    out.push('|---|---|---|---|---|')
    out.push(`| До | ${pct(t.before.agreement)} | ${t.before.brier.toFixed(4)} | ${t.before.deathBrier.toFixed(4)} | ${rmsText(t.fixtureRmsBefore)} |`)
    out.push(`| После | ${pct(t.after.agreement)} | ${t.after.brier.toFixed(4)} | ${t.after.deathBrier.toFixed(4)} | ${rmsText(t.fixtureRmsAfter)} |`)
    out.push('')
    if (t.knobs.length === 0) {
      out.push('Ни один из проверенных параметров не улучшил Brier в пределах допуска по сверке статов — трогать нечего.')
    } else {
      out.push(`Изменено параметров: **${t.knobs.length}** (не больше ${cli.maxKnobs}).`)
      out.push('')
      out.push('| Параметр | A | Было | Стало | Brier до → после | Согласие до → после |')
      out.push('|---|---|---|---|---|---|')
      for (const k of t.knobs) {
        out.push(`| ${k.label} | ${k.assumption} | ${k.from} | **${k.to}** | ${k.brierBefore.toFixed(4)} → ${k.brierAfter.toFixed(4)} | ${pct(k.agreementBefore)} → ${pct(k.agreementAfter)} |`)
      }
      out.push('')
      out.push('Проверенные, но не тронутые параметры:')
      for (const k of TUNING_KNOBS) {
        if (!t.knobs.some((x) => x.id === k.id)) out.push(`- ${k.label} (${k.assumption}) — значение ${t.values[k.id]}`)
      }
    }
    out.push('')
    out.push(`Условие «не ломать сверку статов»: RMS по fixtures/heroes.txt не хуже базовой модели более чем на ${pct(FIXTURE_RMS_GUARD)}.`)
  }

  out.push('')
  out.push('## 5. Предсказания по отметкам')
  out.push('')
  out.push('| Квест | Отряд | В игре | win rate (сейчас) | win rate (в отметке) | Верно |')
  out.push('|---|---|---|---|---|---|')
  for (const r of predictions) {
    out.push(
      `| ${r.check.questLabel || r.quest.id} | ${r.teamLabel} | ${r.check.passed ? 'проходит' : 'не проходит'} | ${pct(r.predicted)} | ${pct(r.storedWinRate)} | ${r.matched ? 'да' : '**нет**'} |`,
    )
  }
  out.push('')
  return out.join('\n')
}

// ───────────────────────────── main ─────────────────────────────

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2))
  const data = fixtureGameData()
  const jsonPath = join(ROOT, cli.file)
  if (!existsSync(jsonPath)) {
    console.error(`Нет файла с отметками: ${jsonPath}`)
    console.error('Экспорт со страницы «Данные» положите как fixtures/reality.json или укажите --file <путь>.')
    process.exitCode = 2
    return
  }
  const input = readJsonInput(jsonPath)
  if (input.checks.length === 0) {
    console.error(`${input.source}: отметок 0 — калибровать нечего.`)
    console.error('Отметьте бои в игре на странице «Подбор» (кнопки «проходит» / «не проходит») и экспортируйте JSON на «Данных».')
    process.exitCode = 3
    return
  }

  // Герои: из резервной копии, иначе из экспорта TitansDB.
  let heroes = input.heroes ?? []
  let heroesSource = `${input.source} (герои из того же файла)`
  if (heroes.length === 0) {
    const heroesPath = join(ROOT, cli.heroes)
    if (existsSync(heroesPath)) {
      const parsed = importTitansDb(readFileSync(heroesPath, 'utf8'), data)
      heroes = parsed.heroes
      heroesSource = `${heroesPath} (экспорт TitansDB, героев ${heroes.length})`
      for (const issue of parsed.issues) console.warn(`  ! импорт: ${issue.message}`)
    } else {
      console.error(`${input.source}: в файле нет героев, и не найден ${heroesPath}.`)
      process.exitCode = 4
      return
    }
  }

  const caps = await loadCaps(data)
  const built = buildRecords(data, caps.quests, input.checks, heroes)
  if (built.records.length === 0) {
    console.error('Ни одну отметку не удалось сопоставить с героями и квестами:')
    for (const p of built.problems) console.error(`  - ${p}`)
    process.exitCode = 5
    return
  }

  // Сверка статов — всегда по экспорту TitansDB (fixtures/heroes.txt), как в stats.fixture.test.ts.
  const fixtureHeroesPath = join(ROOT, cli.heroes)
  if (!existsSync(fixtureHeroesPath)) {
    console.error(`Для сверки статов нужен ${fixtureHeroesPath} (экспорт TitansDB).`)
    process.exitCode = 6
    return
  }
  const fixtureParsed = importTitansDb(readFileSync(fixtureHeroesPath, 'utf8'), data)
  const fixture: FixtureHeroes = {
    data,
    heroes: fixtureParsed.heroes,
    reference: (h) => {
      if (!h.reference) throw new Error(`${h.name}: нет эталона экспорта`)
      return h.reference.stats
    },
  }

  console.log(`Отметок: ${built.records.length} (не сопоставлено: ${built.problems.length}), героев: ${heroes.length}`)
  const baselineRms = fixtureStatRms(fixture)

  // Тот же seed, что у базового варианта в анализе чувствительности, — иначе Brier раздела 1
  // и базовой строки раздела 3 различались бы шумом Монте-Карло, а не моделью.
  const predictions = built.records.map((r, i) =>
    runPrediction(r, data, { runs: cli.runs, seed: cli.seed, seedOffset: CALIBRATION_BASE_SEED_OFFSET, useReference: cli.useReference }, i),
  )
  const s = calibrationSummary(predictions)
  console.log(`Базовая модель: верных ${s.matched} из ${s.n} (${pct(s.agreement)}), Brier ${s.brier.toFixed(4)}`)
  if (s.deathN > 0) console.log(`Смерти героев: ${s.deathN} пар, Brier ${s.deathBrier.toFixed(4)}, верно ${pct(s.deathAgreement)}`)
  console.log(`Сверка статов по ${cli.heroes}: ${rmsText(baselineRms)}`)

  let sens: SensitivityRow[] | null = null
  let tuning: TuningResult | null = null
  if (cli.tune) {
    console.log(`Варианты допущений: ${MODEL_VARIANTS.length}…`)
    sens = sensitivityAnalysis({
      records: built.records,
      data,
      fixture,
      runs: cli.runs,
      seed: cli.seed,
      useReference: cli.useReference,
      onVariant: (id, done, total) => console.log(`  [${done}/${total}] ${id}`),
    })
    console.log('Самые влиятельные допущения:')
    for (const r of rankInfluence(sens).slice(0, 5)) {
      console.log(`  ${r.label} — Δ Brier ${r.brierDelta.toFixed(4)}, Δ согласия ${signedPp(r.agreementDeltaPp)}`)
    }
    console.log(`Подгонка (не больше ${cli.maxKnobs} параметров)…`)
    tuning = tuneParameters({
      records: built.records,
      data,
      fixture,
      runs: cli.runs,
      seed: cli.seed,
      useReference: cli.useReference,
      maxKnobs: cli.maxKnobs,
      onStep: (m) => console.log(`  ${m}`),
    })
    console.log(`До: ${pct(tuning.before.agreement)} верных, Brier ${tuning.before.brier.toFixed(4)}`)
    console.log(`После: ${pct(tuning.after.agreement)} верных, Brier ${tuning.after.brier.toFixed(4)} (изменено параметров: ${tuning.knobs.length})`)
  }

  const report = renderReport({
    cli,
    input: input.source,
    capsSource: caps.source,
    heroesSource,
    data,
    records: built.records,
    predictions,
    problems: built.problems,
    championNotes: built.championNotes,
    sens,
    tuning,
    fixture,
    fixtureRms: fixtureStatRms(fixture),
    baselineRms,
  })
  const outPath = join(ROOT, cli.out)
  writeFileSync(outPath, report, 'utf8')
  console.log(`\nОтчёт: ${outPath}`)
}

await main()
