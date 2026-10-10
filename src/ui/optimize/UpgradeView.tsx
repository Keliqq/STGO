import { Loader2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge.tsx'
import type { HeroInstance } from '#/data/types.ts'
import { WHATIF_WORTH_MIN_DELTA } from '#/engine/constants.ts'
import type { UpgradeKind, UpgradeOutcome } from '#/engine/constraints.ts'
import { Section } from '#/ui/layout.tsx'
import { pct, signedPp } from './format.ts'

export interface UpgradeRow {
  kind: UpgradeKind
  label: string
  state: 'pending' | 'done' | 'cancelled'
  outcome?: UpgradeOutcome
}

const TITLE: Record<UpgradeKind, string> = { tier: '+1 тир', quality: '+1 качество' }

/** «Стоит ли тратиться»: прирост цели при подъёме макс. тира и макс. качества на ступень. */
export function UpgradeView({ team, rows, objectiveLabel }: { team: HeroInstance[]; rows: UpgradeRow[]; objectiveLabel: string }) {
  return (
    <Section
      title="Стоит ли улучшать?"
      description={`Подбор повторён с ограничением на ступень выше, начиная с найденного набора (${objectiveLabel}).`}
    >
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Тир и качество уже на максимуме.</p> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.kind} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b>
                {TITLE[r.kind]} ({r.label})
              </b>
              {r.state === 'pending' ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> считаю…
                </span>
              ) : r.state === 'cancelled' ? (
                <span className="text-muted-foreground">отменено</span>
              ) : r.outcome ? (
                <>
                  <span>
                    {pct(r.outcome.objective)}{' '}
                    <span className={r.outcome.delta >= WHATIF_WORTH_MIN_DELTA ? 'font-semibold text-success' : 'text-muted-foreground'}>
                      ({signedPp(r.outcome.delta)})
                    </span>
                  </span>
                  {r.outcome.delta >= WHATIF_WORTH_MIN_DELTA ? (
                    <Badge variant="secondary">стоит</Badge>
                  ) : (
                    <Badge variant="outline">в пределах шума — можно не тратиться</Badge>
                  )}
                  {r.outcome.cancelled ? <span className="text-muted-foreground">(частично)</span> : null}
                </>
              ) : null}
            </div>
            {r.outcome && r.outcome.delta > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {r.outcome.changes.flatMap((list, hi) =>
                  list.map((e) => (
                    <li key={`${hi}-${e.slot}`}>
                      {team.length > 1 ? `${team[hi]?.name ?? `Герой ${hi + 1}`}: ` : ''}
                      {e.from} → <span className="text-foreground">{e.to}</span> ({signedPp(e.winRateDelta)})
                    </li>
                  )),
                )}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}
