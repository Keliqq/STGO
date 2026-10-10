import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Backpack, Database, Sparkles, Users } from 'lucide-react'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { useDataStatus, useGameData } from '#/ui/dataSync.ts'
import { Page } from '#/ui/layout.tsx'

export const Route = createFileRoute('/')({ component: Home })

const STEPS = [
  { to: '/heroes', icon: Users, title: '1. Герои', text: 'Импортируйте экспорт TitansDB — уровни, классы, экипировку и навыки.' },
  { to: '/inventory', icon: Backpack, title: '2. Инвентарь', text: 'Необязательно: перечислите свои предметы, камни и духов, чтобы подбирать только из них.' },
  { to: '/optimize', icon: Sparkles, title: '3. Подбор', text: 'Выберите отряд и квест (или группу локаций) — симуляция найдёт лучший набор.' },
  { to: '/data', icon: Database, title: 'Данные', text: 'Откуда берутся данные, когда обновлялись, что не удалось разобрать.' },
] as const

function Home() {
  const data = useGameData()
  const status = useDataStatus()
  return (
    <Page
      title="Подбор экипировки для героев Shop Titans"
      description="Приложение подберёт экипировку, стихии и духов под конкретный квест или «универсальный» набор для группы локаций. Всё считается в вашем браузере; данные берутся из публичной таблицы сообщества."
    >
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/optimize" className="no-underline">
            Перейти к подбору экипировки <ArrowRight />
          </Link>
        </Button>
        {data ? (
          <p className="text-sm text-muted-foreground">
            Загружено: {data.items.length} предметов, {data.heroClasses.length} классов, {data.skills.length} навыков,{' '}
            {data.quests.length} квестов.{' '}
            {status.checking ? <Badge variant="secondary">Проверяю обновления…</Badge> : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Загружаю данные…</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="group text-inherit no-underline">
            <Card className="h-full gap-3 transition-colors group-hover:border-primary/50 group-hover:bg-accent/40">
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  )
}
