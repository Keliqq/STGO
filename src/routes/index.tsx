import { Link, createFileRoute } from '@tanstack/react-router'
import { useDataStatus, useGameData } from '#/ui/dataSync.ts'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const data = useGameData()
  const status = useDataStatus()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-3 text-3xl font-bold">Подбор экипировки для героев Shop Titans</h1>
      <p className="mb-6 max-w-3xl text-neutral-600 dark:text-neutral-300">
        Приложение подберёт экипировку, стихии и духов под конкретный квест или «универсальный» набор для группы локаций.
        Всё считается в вашем браузере; данные берутся из публичной таблицы сообщества.
      </p>
      {data ? (
        <p className="text-sm">
          Загружено: {data.items.length} предметов, {data.heroClasses.length} классов, {data.skills.length} навыков,{' '}
          {data.quests.length} квестов.{' '}
          {status.checking ? 'Проверяю обновления…' : null}{' '}
          <Link to="/data" className="underline">
            Подробнее о данных
          </Link>
        </p>
      ) : (
        <p className="text-sm">Загружаю данные…</p>
      )}
      <p className="mt-6 text-sm text-neutral-500">Оптимизатор появится в следующих версиях.</p>
    </main>
  )
}
