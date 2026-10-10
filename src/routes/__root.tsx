import { useState } from 'react'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Swords, X } from 'lucide-react'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import { Button } from '#/components/ui/button.tsx'
import { useDataStatus } from '#/ui/dataSync.ts'

export const Route = createRootRoute({
  component: RootComponent,
})

const NAV = [
  { to: '/', label: 'Главная', exact: true },
  { to: '/heroes', label: 'Герои' },
  { to: '/optimize', label: 'Подбор' },
  { to: '/roll', label: 'Как роллить' },
  { to: '/data', label: 'Данные' },
] as const

function UpdateBanner() {
  const status = useDataStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const update = status.lastUpdate
  if (!update || dismissed === update.at) return null
  return (
    <div className="border-b border-success/30 bg-success/10 text-success">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span>{update.message}</span>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(update.at)}>
          <X /> Закрыть
        </Button>
      </div>
    </div>
  )
}

function RootComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 text-sm font-medium">
          <Link to="/" className="mr-3 flex shrink-0 items-center gap-2 font-bold text-foreground no-underline" aria-label="Shop Titans: подбор экипировки">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Swords className="size-4" />
            </span>
            <span className="hidden md:inline">Shop Titans: подбор экипировки</span>
          </Link>
          <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: 'exact' in n }}
                className="shrink-0 rounded-md px-3 py-1.5 text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground"
                activeProps={{ className: 'bg-accent !text-accent-foreground', 'aria-current': 'page' }}
              >
                {n.label}
              </Link>
            ))}
          </div>
          <ThemeToggle />
        </nav>
      </header>
      <UpdateBanner />
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
          Изображения и игровые данные принадлежат Kabam; картинки загружаются напрямую с playshoptitans.com и
          stcentral-hub.github.io. Неофициальный фанатский инструмент.
        </p>
      </footer>
    </div>
  )
}
