/**
 * Число с кнопками «−» / «+»: удобнее, чем стрелки браузера, особенно на телефоне.
 * Поле ввода остаётся обычным <input type="number"> (`aria-label` — на нём), так что значение можно и вписать.
 */
import { Minus, Plus } from 'lucide-react'
import { cn } from 'cn'
import { Input } from '#/components/ui/input.tsx'

export interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  ariaLabel: string
  className?: string
}

export function NumberStepper({ value, onChange, min, max, step = 1, ariaLabel, className }: NumberStepperProps) {
  const clamp = (v: number): number => Math.max(min, Math.min(max, Math.round(v)))
  const btn = 'flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'
  return (
    <div className={cn('inline-flex items-center overflow-hidden rounded-md border border-input shadow-xs', className)}>
      <button type="button" className={btn} onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label="Уменьшить" tabIndex={-1}>
        <Minus className="size-4" />
      </button>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="h-9 w-14 rounded-none border-0 px-1 text-center shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label="Увеличить" tabIndex={-1}>
        <Plus className="size-4" />
      </button>
    </div>
  )
}
