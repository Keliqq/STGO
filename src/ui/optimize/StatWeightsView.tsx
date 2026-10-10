/**
 * Веса статов в UI: столбики «что даёт +1% крита / +5% ATK / …» и одна фраза «Главное для героя».
 * Считаются движком (src/engine/statWeights.ts) симуляцией на том же наборе, что и результат подбора.
 */
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { Notice } from '#/ui/layout.tsx'
import {
  STAT_WEIGHT_STATS,
  statShortLabel,
  threatWarning,
  type HeroStatWeights,
  type SeedAdvice,
  type StatWeightsResult,
} from '#/engine/statWeights.ts'

const pct1 = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const pp2 = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)} п.п.`

/** Строка таблицы весов одного героя. */
function HeroWeights({ hero }: { hero: HeroStatWeights }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{hero.name}</h3>
        {hero.best ? <Badge variant="secondary">{statShortLabel(hero.best)} — главный</Badge> : null}
      </div>
      <p className={cn('mb-2 text-sm', hero.meaningful ? 'text-foreground' : 'text-muted-foreground')}>{hero.headline}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Прибавка</TableHead>
            <TableHead title="Прирост win rate в процентных пунктах">Win rate</TableHead>
            <TableHead title="Прирост урона за раунд">Урон</TableHead>
            <TableHead title="Прирост минимального % HP выжившего">Мин. HP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hero.weights.map((w) => (
            <TableRow key={w.stat} className={w.stat === hero.best ? 'font-medium' : undefined}>
              <TableCell className="whitespace-nowrap">{w.stepLabel}</TableCell>
              <TableCell className={cn(w.winRatePp > 0 ? 'text-success' : w.winRatePp < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {pp2(w.winRatePp)}
              </TableCell>
              <TableCell className={cn(w.damagePct > 0 ? 'text-success' : w.damagePct < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {pct1(w.damagePct)}
              </TableCell>
              <TableCell className={cn(w.minSurvivorHpPp > 0 ? 'text-success' : w.minSurvivorHpPp < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {pp2(w.minSurvivorHpPp)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Столбик «насколько стат важен для отряда» — максимум = 100 %. */
function TeamBars({ weights }: { weights: StatWeightsResult }) {
  const values = STAT_WEIGHT_STATS.map((st) => ({
    stat: st,
    value: weights.team[st],
    label: statShortLabel(st, weights.barrier?.bestElement ?? null),
  }))
  const max = Math.max(0, ...values.map((v) => Math.abs(v.value)))
  const metric =
    weights.metric === 'winRatePp' ? 'прирост win rate, п.п.' : weights.metric === 'minSurvivorHpPp' ? 'прирост мин. % HP, п.п.' : 'прирост урона за раунд, %'
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Суммарно по отряду ({metric}): сильнее всего —{' '}
        <b>{values.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).label}</b>
      </p>
      <ul className="space-y-1">
        {values.map((v) => (
          <li key={v.stat} className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 text-muted-foreground">{v.label}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
              <span
                className={cn('block h-full', v.value >= 0 ? 'bg-primary' : 'bg-destructive')}
                style={{ width: `${max > 0 ? Math.min(100, (Math.abs(v.value) / max) * 100) : 0}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums">
              {weights.metric === 'damagePct' ? pct1(v.value) : pp2(v.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Доли атак босса: кто принимает удары. */
function ThreatBars({ weights }: { weights: StatWeightsResult }) {
  const top = weights.topThreatIndex
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Кто принимает удары (доля атак босса по угрозе и AoE):</p>
      <ul className="space-y-1">
        {weights.threat.map((t) => (
          <li key={t.index} className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 truncate">{t.name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
              <span className={cn('block h-full', t.index === top ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, t.share * 100)}%` }} />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums tabular-nums">{(t.share * 100).toFixed(0)}%</span>
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">угроза {t.threat}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Вклад в стихийный барьер квеста: стихия группы, кто сколько вносит и чего не хватает. */
function BarrierBlock({ weights }: { weights: StatWeightsResult }) {
  const b = weights.barrier
  if (!b) return null
  return (
    <div>
      <p className="mb-2 text-sm">
        Барьер квеста: <b>{b.bestElement}</b> {b.hp} — у отряда <b>{b.have}</b>{' '}
        {b.broken ? <Badge variant="secondary">пробит</Badge> : <Badge variant="destructive">не хватает {b.missing}</Badge>}
      </p>
      <ul className="space-y-1 text-sm">
        {b.contributions.map((c) => (
          <li key={c.index} className="flex items-center gap-2">
            <span className="w-36 shrink-0 truncate">{c.name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
              <span className="block h-full bg-primary" style={{ width: `${b.hp > 0 ? Math.min(100, (c.value / b.hp) * 100) : 0}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">{Math.round(c.value)}</span>
          </li>
        ))}
      </ul>
      {!b.broken ? (
        <Notice tone="warning" className="mt-2">
          Урон отряда снижен: барьер не пробит. Не хватает{' '}
          <b>
            {b.missing} {b.bestElement}
          </b>{' '}
          — добавьте камни этой стихии (или духи Ox/Chimera +5) в слоты, лучше всем героям.
        </Notice>
      ) : null}
    </div>
  )
}

/** Общий блок «Веса статов»: фраза по каждому герою, столбики отряда, угроза и барьер. */
export function StatWeightsView({
  weights,
  team,
  seeds,
  compact = false,
}: {
  weights: StatWeightsResult
  /** Герои отряда — нужны, чтобы найти танка (по DEF) для подсказки по угрозе. */
  team?: { name: string; def: number }[]
  /** Совет по семенам (из воркера; может отсутствовать). */
  seeds?: (SeedAdvice & { heroIndex: number })[]
  /** compact — без пояснения о метрике (когда блок встроен в другую секцию). */
  compact?: boolean
}) {
  const metricNote =
    weights.metric === 'winRatePp'
      ? 'Веса — прирост win rate (п.п.) от прибавки: цель на этом квесте не насыщена.'
      : weights.metric === 'minSurvivorHpPp'
        ? 'Веса — прирост минимального % HP выжившего.'
        : 'Win rate уже 100 % — веса показывают прирост урона за раунд (и мин. % HP для защитных статов).'
  const probeNote = weights.probe
    ? `Квест не различает наборы (при таком наборе win rate ${(weights.realWinRate * 100).toFixed(0)} %), поэтому веса посчитаны на ослабленном квесте: HP монстра ÷ ${weights.probe.hpFactor.toFixed(0)}, урон ÷ ${weights.probe.dmgFactor.toFixed(1)}.`
    : null
  const tankIndex = team && team.length > 1 ? team.reduce((best, h, i) => (h.def > team[best].def ? i : best), 0) : null
  const warn = threatWarning(weights, tankIndex)
  return (
    <div className="space-y-4">
      {!compact ? <p className="text-sm text-muted-foreground">{metricNote}</p> : null}
      {probeNote ? <Notice tone="info">{probeNote}</Notice> : null}
      {warn ? <Notice tone="warning">{warn}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamBars weights={weights} />
        <ThreatBars weights={weights} />
      </div>
      <BarrierBlock weights={weights} />
      {seeds && seeds.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium">Семена силы</p>
          <p className="text-xs text-muted-foreground">
            Ценность семени — параметр (ASSUMPTION A55): таблицы прибавки за семя в данных нет. Значения — прибавка за одно семя к базе героя.
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {seeds.map((s) => (
              <li key={s.heroIndex}>{s.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {weights.heroes.map((h) => (
          <HeroWeights key={h.index} hero={h} />
        ))}
      </div>
    </div>
  )
}
