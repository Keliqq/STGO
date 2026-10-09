import { useState } from 'react'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { useDataStatus } from '#/ui/dataSync.ts'

export const Route = createRootRoute({
  component: RootComponent,
})

function UpdateBanner() {
  const status = useDataStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const update = status.lastUpdate
  if (!update || dismissed === update.at) return null
  return (
    <div className="flex items-center justify-between gap-3 bg-emerald-100 px-4 py-2 text-sm text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
      <span>{update.message}</span>
      <button type="button" className="underline" onClick={() => setDismissed(update.at)}>
        Закрыть
      </button>
    </div>
  )
}

function RootComponent() {
  return (
    <>
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 text-sm font-semibold">
          <Link to="/" className="text-base">
            Shop Titans: подбор экипировки
          </Link>
          <Link to="/" activeProps={{ className: 'underline' }} activeOptions={{ exact: true }}>
            Главная
          </Link>
          <Link to="/heroes" activeProps={{ className: 'underline' }}>
            Герои
          </Link>
          <Link to="/data" activeProps={{ className: 'underline' }}>
            Данные
          </Link>
        </nav>
      </header>
      <UpdateBanner />
      <Outlet />
      <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-500">
        Изображения и игровые данные принадлежат Kabam; картинки загружаются напрямую с playshoptitans.com и
        stcentral-hub.github.io. Неофициальный фанатский инструмент.
      </footer>
    </>
  )
}
