import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { cn } from 'cn'
import { elementIconId, spiritIconId } from '#/data/images.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { VERDICT_LIKELY_MIN, VERDICT_RISKY_MIN, VERDICT_SURE_MIN, WHATIF_WORTH_MIN_DELTA } from '#/engine/constants.ts'
import type { OptimizerResult } from '#/engine/optimizer.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Notice, Section } from '#/ui/layout.tsx'
import { pct } from './format.ts'
import type { UpgradeRow } from './UpgradeView.tsx'

interface SimpleResultViewProps {
  data: GameData
  team: HeroInstance[]
  res: OptimizerResult
  /** Строки «стоит ли улучшать» (если уже посчитаны) — показываем только те, что окупаются. */
  upgrades: UpgradeRow[] | null
}

type Tone = 'success' | 'info' | 'warning' | 'error'

/** Словесный вердикт по win rate (границы — constants.ts, A61). */
function verdict(winRate: number): { text: string; tone: Tone } {
  if (winRate >= VERDICT_SURE_MIN) return { text: 'Почти наверняка победа', tone: 'success' }
  if (winRate >= VERDICT_LIKELY_MIN) return { text: 'Скорее всего победа', tone: 'info' }
  if (winRate >= VERDICT_RISKY_MIN) return { text: 'Рискованно: можно проиграть', tone: 'warning' }
  return { text: 'Скорее всего проигрыш', tone: 'error' }
}

const VERDICT_TEXT_CLASS: Record<Tone, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-destructive',
}

/** Простая сводка результата для обычного игрока: вердикт и список «что надеть». Цифры и разбор — в «Подробном разборе». */
export function SimpleResultView({ data, team, res, upgrades }: SimpleResultViewProps) {
  const itemByName = useMemo(() => new Map(data.items.map((i) => [i.name, i])), [data])
  const enchantByName = useMemo(() => new Map(data.enchants.map((e) => [e.name, e])), [data])

  const v = verdict(res.winRate)
  const before = res.winRate - res.improvement
  const worthUpgrades = (upgrades ?? []).filter((u) => u.state === 'done' && u.outcome && u.outcome.delta >= WHATIF_WORTH_MIN_DELTA)
  const nothingToChange = res.explanations.every((list) => list.length === 0)

  return (
    <Section title="Что делать">
      <p className={cn('text-2xl font-bold', VERDICT_TEXT_CLASS[v.tone])}>{v.text}</p>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Шанс победы с этим набором — <b className="text-foreground">{pct(res.winRate)}</b>
        {res.improvement > 0.0005 ? <> (с тем, что надето сейчас, было {pct(before)})</> : null}
        {res.cancelled ? ' · подбор отменён, результат частичный' : ''}
      </p>
      {res.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}
        </Notice>
      ))}
      {nothingToChange ? (
        <Notice tone="success">Менять ничего не нужно: текущая экипировка уже лучшая из найденных.</Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {res.configs.map((cfg, hi) => {
          const hero = team[hi]
          const changes = res.explanations[hi] ?? []
          return (
            <div key={hero?.id ?? hi} className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{hero?.name ?? `Герой ${hi + 1}`}</h3>
              {changes.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="size-4" /> Ничего менять не нужно
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">Что поменять:</p>
                  <ol className="space-y-2 text-sm">
                    {changes.map((e) => {
                      const sc = cfg[e.slot]
                      const item = sc?.item ? itemByName.get(sc.item) : null
                      return (
                        <li key={e.slot} className="flex items-start gap-2">
                          <GameIcon kind="item" id={item?.imageId} label={sc?.item ?? 'пусто'} size={32} />
                          <div className="min-w-0">
                            {sc?.item ? (
                              <>
                                <p>
                                  Надеть <b>{sc.item}</b> <span className="text-muted-foreground">({sc.quality})</span>
                                </p>
                                {sc.element || sc.spirit ? (
                                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                    {sc.element ? (
                                      <span className="inline-flex items-center gap-1">
                                        <GameIcon kind="element" id={enchantByName.get(sc.element)?.iconId ?? elementIconId('Any')} label={sc.element} size={14} />
                                        стихия: {sc.element}
                                      </span>
                                    ) : null}
                                    {sc.spirit ? (
                                      <span className="inline-flex items-center gap-1">
                                        <GameIcon kind="spirit" id={spiritIconId(sc.spirit)} label={sc.spirit} size={14} />
                                        дух: {sc.spirit}
                                      </span>
                                    ) : null}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p>Снять предмет с этого слота</p>
                            )}
                            <p className="text-xs text-muted-foreground">вместо: {e.from}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  {changes.length < cfg.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">Остальные слоты оставьте как есть.</p>
                  ) : null}
                </>
              )}
            </div>
          )
        })}
      </div>

      {worthUpgrades.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="mb-1 font-semibold">Если хотите ещё сильнее:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {worthUpgrades.map((u) => (
              <li key={u.kind}>
                {u.kind === 'tier' ? 'Прокачайте тир предметов' : 'Улучшите качество предметов'} ({u.label}) — шанс победы вырастет до{' '}
                <b>{pct(u.outcome!.objective)}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  )
}
