/**
 * «Сводка по бойцам» — таблица средних по прогонам показателей (SimMetrics.perFighter) и зоны DEF
 * бойца на кривой защиты квеста (`defAdvice`). Общая для «Подбора» (подробный разбор) и «Команд».
 */
import { AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import type { DefCaps } from '#/data/types.ts'
import type { FighterMetrics } from '#/engine/combat.ts'
import { defAdvice } from '#/engine/defAdvice.ts'
import { Hint, HintLabel, Tip } from '#/ui/Hint.tsx'
import { pct } from '#/ui/optimize/format.ts'

/** Строка сводки: боец, его статы для подсказки по защите и средние показатели боёв. */
export interface FighterSummaryRow {
  name: string
  isChampion?: boolean
  def: number
  hp: number
  per: FighterMetrics
}

/** Цвет доли: чем больше — тем «зеленее» (используется для уклонений и выживаемости). */
const shareCls = (x: number, good: number): string => (x >= good ? 'text-success' : x > 0 ? '' : 'text-muted-foreground')

export function FighterSummaryTable({ rows, caps, className }: { rows: FighterSummaryRow[]; caps: DefCaps | null; className?: string }) {
  if (rows.length === 0) return null
  const partyHp = rows.map((r) => r.hp)
  return (
    <div className={cn('mt-3', className)}>
      <h4 className="mb-2 text-sm font-semibold">Сводка по бойцам</h4>
      <p className="mb-2 text-xs text-muted-foreground">
        Средние по всем прогонам боя. «DEF на кривой» — где защита бойца стоит относительно порогов квеста: до половины p50 урон врага выше 100 %, а
        выше p70 защита почти ничего не даёт.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Боец</TableHead>
              <TableHead>
                <HintLabel hint="Где DEF бойца на кривой урона врага: пороги квеста p50/p70/cap (A30, A71). Наведите на значение — увидите, что делать дальше.">
                  DEF на кривой
                </HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Здоровье бойца в бою. Нужно для правила «не советовать урезать DEF, если HP мало».">HP</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Средний урон одного удара бойца по монстру: уже с критами и с поправкой на непробитый барьер.">Урон за удар</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Доля критов среди ударов бойца.">Криты</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Доля уклонений от атак врага, нацеленных на этого бойца (одиночные и AoE). Extreme-штраф уже учтён.">Уклонения</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Сколько раз за бой мана-щит успевал восстановиться после N раундов без урона (A32).">Щит/бой</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Доля прогонов, где боец выжил.">Выживание</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Средний раунд гибели среди прогонов, где боец погиб (0 — не погибал).">Раунд гибели</HintLabel>
              </TableHead>
              <TableHead>
                <HintLabel hint="Доля раундов, где у бойца ещё действовал врождённый бонус «until damaged» (Ninja; у Sensei возвращается через N раундов, A49/A54). Прочерк — у класса такой механики нет.">
                  Бонус «until damaged»
                </HintLabel>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const advice = defAdvice({ def: row.def, hp: row.hp, partyHp, caps })
              return (
                <TableRow key={`${row.name}-${i}`}>
                  <TableCell className="font-medium">
                    {row.name} {row.isChampion ? <Badge variant="secondary">чемпион</Badge> : null}
                  </TableCell>
                  <TableCell>
                    <Tip
                      text={
                        <>
                          {advice.text}
                          {advice.lowHp ? <b className="mt-1 block">Урезать DEF этому бойцу нельзя: сначала HP.</b> : null}
                        </>
                      }
                    >
                      <span className="inline-flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-4">
                        {Math.round(row.def)} · {advice.short}
                        {advice.lowHp ? <AlertTriangle className="size-3.5 text-warning" aria-label="мало HP" /> : null}
                      </span>
                    </Tip>
                  </TableCell>
                  <TableCell>{Math.round(row.hp)}</TableCell>
                  <TableCell>
                    {Math.round(row.per.damagePerHit)}
                    <span className="text-muted-foreground"> · {row.per.hitsPerFight.toFixed(1)} уд.</span>
                  </TableCell>
                  <TableCell>{pct(row.per.critRate)}</TableCell>
                  <TableCell className={shareCls(row.per.dodgeRate, 0.01)}>{pct(row.per.dodgeRate)}</TableCell>
                  <TableCell>{row.per.shieldRecharges.toFixed(2)}</TableCell>
                  <TableCell className={shareCls(row.per.survivalRate, 0.999)}>{pct(row.per.survivalRate)}</TableCell>
                  <TableCell>{row.per.avgDeathRound > 0 ? row.per.avgDeathRound.toFixed(1) : <span className="text-muted-foreground">не гибнет</span>}</TableCell>
                  <TableCell>
                    {row.per.untilDamagedShare > 0 ? pct(row.per.untilDamagedShare) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Источник кривой и порогов — ST-Central Combat Compendium; «вкладываться примерно до трети cap» — гайд stcalc.com (порог p70). <Hint>Пороги берутся из данных квеста (STC Hub) или из поля «Defense cap с экрана игры» на странице «Данные».</Hint>
      </p>
    </div>
  )
}
