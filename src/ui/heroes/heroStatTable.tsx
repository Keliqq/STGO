/**
 * Небольшие части интерфейса страницы «Герои»: иконка стихии, метка черновика и таблица статов.
 * Чистые вычисления и типы — в `heroView.ts`, чтобы этот файл экспортировал только компоненты
 * (иначе React Fast Refresh теряет состояние формы при правках — правило `react-refresh/only-export-components`).
 */
import { elementIconId } from '#/data/images.ts'
import type { Element } from '#/data/types.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { ELEMENT_RU, STAT_ROWS, deltaText, type ComparableStats } from './heroView.ts'

/** Иконка стихии героя (по классу) или камня. */
export function ElementIcon({ element, size = 16 }: { element: Element | 'Any' | null; size?: number }) {
  if (!element) return null
  return <GameIcon kind="element" id={elementIconId(element)} label={ELEMENT_RU[element] ?? element} size={size} />
}

/** Пометка черновика. */
export function DraftBadge() {
  return <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">черновик</span>
}

export interface HeroStatTableProps {
  label?: string
  stats: ComparableStats
  /** Вторая колонка: эталон экспорта или оригинал черновика. */
  other?: ComparableStats | null
  otherLabel?: string
  /** Показывать столбец «Разница» (сравнение черновика с оригиналом). */
  showDelta?: boolean
}

/** Таблица статов: одна колонка или сравнение двух. */
export function HeroStatTable({ label = 'Расчёт', stats, other, otherLabel = 'Было', showDelta = false }: HeroStatTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>{label}</TableHead>
          {other ? <TableHead>{otherLabel}</TableHead> : null}
          {other && showDelta ? <TableHead>Разница</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {STAT_ROWS.map((row) => {
          const a = row.value(stats)
          const b = other ? row.value(other) : null
          return (
            <TableRow key={row.key}>
              <TableCell className="text-muted-foreground">{row.label}</TableCell>
              <TableCell className="font-semibold">{a}</TableCell>
              {b != null ? <TableCell>{b}</TableCell> : null}
              {b != null && showDelta ? <TableCell className="text-muted-foreground">{deltaText(a, b)}</TableCell> : null}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
