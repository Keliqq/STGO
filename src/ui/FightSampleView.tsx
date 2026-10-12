/**
 * «Пример боя»: сворачиваемый лог одного прогона (по раундам, цвет по стороне) + «Сводка по бойцам».
 * Общий блок для подробного разбора «Подбора» и прогона «Команд»: страницы передают готовых бойцов,
 * а тяжёлый Монте-Карло считает воркер (`Engine.traceFight`).
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import type { Quest } from '#/data/types.ts'
import {
  traceFight,
  type Fighter,
  type FightTraceResult,
  type PowerBoosterId,
  type TraceEvent,
  type TraceSide,
} from '#/engine/combat.ts'
import { DEFAULT_SIM_RUNS } from '#/engine/constants.ts'
import { QUEST_VARIANT_RU } from '#/engine/teamRunner.ts'
import type { Engine } from '#/worker/client.ts'
import { FighterSummaryTable, type FighterSummaryRow } from '#/ui/FighterSummaryTable.tsx'

interface FightSampleViewProps {
  /** Воркер движка; null — считаем синхронно здесь (как запасной вариант без воркера). */
  engine: Engine | null
  /** Бойцы в порядке отряда (герои, затем чемпион). */
  fighters: Fighter[]
  quest: Quest | null
  /** Seed и число прогонов — те же, что у прогона команды, иначе сводка разойдётся с таблицей. */
  seed?: number
  runs?: number
  powerBooster?: PowerBoosterId
  /** Заголовок блока (по умолчанию «Пример боя»). */
  title?: string
  /** Раскрыть блок сразу. */
  defaultOpen?: boolean
}

/** Цвет строки лога по стороне боя. */
const SIDE_CLS: Record<TraceSide, string> = {
  heroes: 'text-emerald-600 dark:text-emerald-400',
  enemy: 'text-destructive',
  neutral: 'text-muted-foreground',
}

/** Заголовок группы событий: «До боя» (раунд 0) или «Раунд N». */
const roundTitle = (round: number): string => (round <= 0 ? 'До боя' : `Раунд ${round}`)

/** Сгруппировать события по раундам (порядок — как в бою). */
function groupByRound(events: TraceEvent[]): [number, TraceEvent[]][] {
  const map = new Map<number, TraceEvent[]>()
  for (const e of events) {
    const list = map.get(e.round)
    if (list) list.push(e)
    else map.set(e.round, [e])
  }
  return [...map.entries()]
}

export function FightSampleView({
  engine,
  fighters,
  quest,
  seed = 1,
  runs = DEFAULT_SIM_RUNS,
  powerBooster,
  title = 'Пример боя',
  defaultOpen = false,
}: FightSampleViewProps) {
  /** Результат вместе с ключом запроса: ключ не совпал — данные устарели (показываем «считаю»). */
  const [loaded, setLoaded] = useState<{ key: string; result: FightTraceResult | null; error: string | null } | null>(null)

  const requestKey = `${quest?.id ?? ''}|${fighters.map((f) => f.name).join(',')}|${seed}|${runs}|${powerBooster ?? 'none'}`
  const fresh = loaded?.key === requestKey ? loaded : null
  const loading = loaded?.key !== requestKey && quest !== null && fighters.length > 0

  useEffect(() => {
    if (!quest || fighters.length === 0) return
    let alive = true
    const opts = { runs, seed, powerBooster }
    // Воркер — основной путь; синхронный вызов (десятки мс на 2000 прогонов) — только если его нет.
    const promise: Promise<FightTraceResult> = engine
      ? engine.traceFight(fighters, quest, opts)
      : Promise.resolve(traceFight(fighters, quest, opts))
    promise
      .then((result) => {
        if (alive) setLoaded({ key: requestKey, result, error: null })
      })
      .catch((e: unknown) => {
        if (alive) setLoaded({ key: requestKey, result: null, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      alive = false
    }
  }, [engine, fighters, quest, seed, runs, powerBooster, requestKey])

  const result = fresh?.result ?? null
  const error = fresh?.error ?? null
  const rounds = useMemo(() => (result ? groupByRound(result.trace.events) : []), [result])
  const rows: FighterSummaryRow[] = useMemo(
    () =>
      result
        ? result.metrics.perFighter.map((per, i) => ({
            name: per.name,
            isChampion: fighters[i]?.isChampion,
            def: fighters[i]?.def ?? 0,
            hp: fighters[i]?.hp ?? 0,
            per,
          }))
        : [],
    [result, fighters],
  )

  if (!quest || fighters.length === 0) return null

  return (
    <div className="mt-3">
      <details data-slot="fight-sample" className="rounded-lg border bg-muted/20 p-3" open={defaultOpen}>
        <summary className="cursor-pointer text-sm font-semibold">
          {title}{' '}
          <span className="font-normal text-muted-foreground">
            · {quest.area} ({QUEST_VARIANT_RU[quest.variant]}, {quest.difficulty}) · лог одного боя из прогона и сводка по бойцам
          </span>
        </summary>
        <div className="mt-3">
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Считаю пример боя…
            </p>
          ) : error ? (
            <p className="text-xs text-destructive">Не удалось получить пример боя: {error}</p>
          ) : result ? (
            <>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={result.trace.win ? 'secondary' : 'destructive'}>{result.trace.win ? 'победа' : 'поражение'}</Badge>
                <span>
                  seed {result.trace.seed} · {result.trace.rounds} раунд(ов) · урон отряда {Math.round(result.trace.damageDealt)} · событий {result.trace.events.length} ·
                  прогонов {result.metrics.runs} (в логе — первый)
                </span>
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {rounds.map(([round, events]) => (
                  <div key={round}>
                    <h5 className="text-xs font-semibold text-muted-foreground">{roundTitle(round)}</h5>
                    <ul className="mt-0.5 space-y-0.5">
                      {events.map((e, i) => (
                        <li key={`${round}-${i}`} className={cn('text-xs', SIDE_CLS[e.side], e.kind === 'result' && 'font-semibold')}>
                          {e.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Цвет: <span className={SIDE_CLS.heroes}>отряд</span> · <span className={SIDE_CLS.enemy}>монстр</span> · <span className={SIDE_CLS.neutral}>барьер и итог</span>.
              </p>
              <FighterSummaryTable rows={rows} caps={quest.defCaps} />
            </>
          ) : null}
        </div>
      </details>
    </div>
  )
}
