/**
 * Выпадающий выбор с иконками из игры: замена <select> там, где важно видеть картинку
 * (класс героя, навык, камень, дух). Поиск по имени, группы, недоступные варианты — с причиной.
 *
 * Доступность: кнопка-триггер несёт `aria-label`, список — `role="listbox"`, варианты — `role="option"`;
 * стрелки ↑/↓ двигают выделение, Enter выбирает, Esc закрывает (Radix Popover).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from 'cn'
import { Input } from '#/components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover.tsx'

export interface PickerOption {
  value: string
  label: string
  icon?: ReactNode
  /** Вторая строка под именем (тир, статы, навык духа). */
  detail?: ReactNode
  /** Метка справа (например, «✦ сродство»). */
  badge?: ReactNode
  /** Группа (заголовок в списке). Порядок групп — порядок первого появления. */
  group?: string
  /** Причина, по которой вариант выбрать нельзя; null/undefined — можно. */
  disabledReason?: string | null
  /** Доп. текст для поиска (английское имя навыка духа и т. п.). */
  keywords?: string
}

export interface IconPickerProps {
  value: string | null
  options: PickerOption[]
  onChange: (value: string | null) => void
  ariaLabel: string
  placeholder?: string
  /** Подпись пункта «очистить»; не задана — очистить нельзя. */
  clearLabel?: string
  disabled?: boolean
  /** Иконка-заглушка в кнопке, когда ничего не выбрано. */
  emptyIcon?: ReactNode
  className?: string
  /** Ширина выпадающего списка (класс Tailwind). */
  contentClassName?: string
  /** Поле поиска показывается, если вариантов больше этого числа. */
  searchThreshold?: number
}

export function IconPicker({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = '— не выбрано —',
  clearLabel,
  disabled = false,
  emptyIcon = null,
  className,
  contentClassName,
  searchThreshold = 8,
}: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const current = value != null ? options.find((o) => o.value === value) : undefined

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.keywords ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q))
  }, [options, query])
  const selectable = filtered.filter((o) => !o.disabledReason || o.value === value)

  const choose = (v: string | null): void => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = selectable.length
      if (n === 0) return
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
      setActive(next)
      listRef.current?.querySelector(`[data-value="${CSS.escape(selectable[next].value)}"]`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && selectable[active]) {
      e.preventDefault()
      choose(selectable[active].value)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setActive(Math.max(0, selectable.findIndex((x) => x.value === value)))
        else setQuery('')
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          className={cn(
            'flex h-auto min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2 py-1 text-left text-sm shadow-xs transition-colors outline-none',
            'hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            className,
          )}
        >
          {current?.icon ?? emptyIcon}
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', !current && 'text-muted-foreground')}>{current?.label ?? placeholder}</span>
            {current?.detail ? <span className="block truncate text-xs text-muted-foreground">{current.detail}</span> : null}
          </span>
          {current?.badge}
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-1.5', contentClassName)} onKeyDown={onKeyDown}>
        {options.length > searchThreshold ? (
          <div className="mb-1.5 flex items-center gap-1.5 px-1">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              placeholder="Поиск…"
              className="h-8"
              aria-label={`Поиск: ${ariaLabel}`}
            />
          </div>
        ) : null}
        <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-80 overflow-y-auto">
          {clearLabel && value != null ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => choose(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden /> {clearLabel}
              </button>
            </li>
          ) : null}
          {filtered.map((o, i) => {
            const header = o.group && o.group !== filtered[i - 1]?.group ? o.group : null
            const blocked = !!o.disabledReason && o.value !== value
            const isActive = selectable[active]?.value === o.value
            return (
              <li key={o.value}>
                {header ? <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{header}</div> : null}
                <button
                  type="button"
                  role="option"
                  data-value={o.value}
                  aria-selected={o.value === value}
                  disabled={blocked}
                  title={o.disabledReason ?? undefined}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => {
                    const i = selectable.indexOf(o)
                    if (i >= 0) setActive(i)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                    blocked ? 'cursor-not-allowed opacity-50' : isActive ? 'bg-muted' : 'hover:bg-muted',
                    o.value === value && 'bg-primary/10',
                  )}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.detail ? <span className="block truncate text-xs text-muted-foreground">{o.detail}</span> : null}
                    {blocked ? <span className="block truncate text-xs text-warning">нельзя: {o.disabledReason}</span> : null}
                  </span>
                  {o.badge}
                  {o.value === value ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted-foreground">Ничего не найдено.</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
