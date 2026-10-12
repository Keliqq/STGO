import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { cn } from 'cn'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip.tsx'

/** Значок «?» с всплывающей подсказкой — для заголовков и мест, где нет подписи, к которой можно привязать Tip. */
export function Hint({ children, label = 'Подсказка', side, className }: { children: ReactNode; label?: string; side?: 'top' | 'right' | 'bottom' | 'left'; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn('inline-flex shrink-0 cursor-help items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground', className)}
        >
          <CircleHelp className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

/** Подсказка поверх существующего элемента (кнопка, ячейка, подпись): `<Tip text="…"><Button/></Tip>`. */
export function Tip({ text, children, side, className }: { text: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className={cn('max-w-xs', className)}>
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

/** Подпись с пунктирным подчёркиванием: показывает, что у неё есть подсказка. Не меняет доступное имя поля. */
export function HintLabel({ hint, children, className }: { hint: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Tip text={hint}>
      <span className={cn('cursor-help underline decoration-dotted underline-offset-4', className)}>{children}</span>
    </Tip>
  )
}
