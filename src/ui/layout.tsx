import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from 'cn'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'

/** Страница: заголовок h1, подзаголовок и содержимое. */
export function Page({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </main>
  )
}

/** Секция-карточка с заголовком h2 (e2e ищут секции по `section` + заголовку). */
export function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section data-slot="card" className={cn('mb-6 flex flex-col gap-4 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', className)}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction className="flex flex-wrap gap-2">{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </section>
  )
}

const TONE = {
  info: { icon: Info, cls: 'border-info/30 bg-info/10 text-info' },
  success: { icon: CheckCircle2, cls: 'border-success/30 bg-success/10 text-success' },
  warning: { icon: AlertTriangle, cls: 'border-warning/40 bg-warning/10 text-warning' },
  error: { icon: XCircle, cls: 'border-destructive/40 bg-destructive/10 text-destructive' },
  neutral: { icon: Info, cls: 'bg-muted text-foreground' },
} as const

/** Цветная плашка-сообщение поверх shadcn Alert. */
export function Notice({ tone = 'neutral', className, children }: { tone?: keyof typeof TONE; className?: string; children: ReactNode }) {
  const { icon: Icon, cls } = TONE[tone]
  return (
    <Alert className={cn('mb-3', cls, className)}>
      <Icon />
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  )
}

/** Подпись + поле в одну строку; label оборачивает поле, поэтому getByLabel находит его по подписи. */
export function Field({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
