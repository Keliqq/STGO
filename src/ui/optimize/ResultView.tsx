import { useMemo } from 'react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { elementIconId, spiritIconId } from '#/data/images.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { modelWarning } from '#/engine/classModel.ts'
import type { OptimizerResult } from '#/engine/optimizer.ts'
import { effectiveClass } from '#/engine/stats.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Notice, Section } from '#/ui/layout.tsx'
import { pct, signedPp } from './format.ts'

interface ResultViewProps {
  data: GameData
  team: HeroInstance[]
  result: { res: OptimizerResult; fromCache: boolean }
  /** Пояснение к цели: win rate / средневзвешенный / худшая локация. */
  objectiveLabel: string
}

/** Пометка о точности: класс героя смоделирован не полностью (src/engine/classModel.ts). */
function ModelNote({ hero, data }: { hero?: HeroInstance; data: GameData }) {
  if (!hero) return null
  const note = modelWarning(data, effectiveClass(hero, data)?.name ?? hero.className)
  if (!note) return null
  return <p className={cn('mb-2 text-xs', note.level === 'partial' ? 'text-warning' : 'text-muted-foreground')}>{note.text}</p>
}

/** Секция «Результат»: цель, таблица по локациям и подобранные наборы героев. */
export function ResultView({ data, team, result: { res, fromCache }, objectiveLabel }: ResultViewProps) {
  const itemByName = useMemo(() => new Map(data.items.map((i) => [i.name, i])), [data])
  const enchantByName = useMemo(() => new Map(data.enchants.map((e) => [e.name, e])), [data])

  return (
    <Section title="Результат">
      <p className="mb-3 text-sm">
        Цель: <b className="text-lg text-primary">{pct(res.objective)}</b> ({objectiveLabel}) · симуляций: {res.simsUsed}
        {fromCache ? ' · из кэша' : ''}
        {res.cancelled ? ' · отменено, результат частичный' : ''}
      </p>
      {res.tieBreakUsed ? (
        <Notice tone="info">
          У нескольких вариантов одинаковый win rate ({pct(res.objective)}) — выбор сделан по тай-брейку: меньше средних раундов →
          больше минимальный % HP выжившего → выше урон за раунд.
        </Notice>
      ) : null}
      {res.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}

      <Table className="mb-4">
        <TableHeader>
          <TableRow>
            <TableHead>Локация</TableHead>
            <TableHead>Win rate</TableHead>
            <TableHead>Раундов</TableHead>
            <TableHead>Барьер</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {res.perQuest.map((pq) => (
            <TableRow key={pq.questId} className={res.worstQuest?.questId === pq.questId ? 'font-semibold text-destructive' : undefined}>
              <TableCell>{pq.label}</TableCell>
              <TableCell>{pct(pq.winRate)}</TableCell>
              <TableCell>{pq.avgRounds.toFixed(1)}</TableCell>
              <TableCell>{pq.barrierBroken ? <Badge variant="secondary">пробит</Badge> : <Badge variant="destructive">не пробит</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {res.worstQuest ? (
        <p className="mb-4 text-sm">
          Худшая локация: <b>{res.worstQuest.label}</b> — {pct(res.worstQuest.winRate)}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {res.configs.map((cfg, hi) => (
          <div key={team[hi]?.id ?? hi} className="rounded-lg border p-3">
            <h3 className="mb-2 font-semibold">{team[hi]?.name ?? `Герой ${hi + 1}`}</h3>
            <ModelNote hero={team[hi]} data={data} />
            <ul className="space-y-1.5 text-sm">
              {cfg.map((sc, si) => {
                const item = sc.item ? itemByName.get(sc.item) : null
                const expl = res.explanations[hi]?.find((e) => e.slot === si)
                return (
                  <li key={si} className="flex items-center gap-2">
                    <GameIcon kind="item" id={item?.imageId} label={sc.item ?? 'пусто'} size={28} />
                    {sc.item ? (
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                        {sc.item} <span className="text-muted-foreground">({sc.quality})</span>
                        {sc.element ? (
                          <span className="inline-flex items-center gap-1">
                            <GameIcon kind="element" id={enchantByName.get(sc.element)?.iconId ?? elementIconId('Any')} label={sc.element} size={14} />
                            {sc.element}
                          </span>
                        ) : null}
                        {sc.spirit ? (
                          <span className="inline-flex items-center gap-1">
                            <GameIcon kind="spirit" id={spiritIconId(sc.spirit)} label={sc.spirit} size={14} />
                            {sc.spirit}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="flex-1 text-muted-foreground">пусто</span>
                    )}
                    {expl ? (
                      <span className={cn('shrink-0 text-xs font-medium', expl.winRateDelta >= 0 ? 'text-success' : 'text-destructive')} title={`было: ${expl.from}`}>
                        {signedPp(expl.winRateDelta)}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}
