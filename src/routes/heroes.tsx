import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Trash2, Upload } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { exportHeroesJson, loadHeroes, mergeHeroes, parseHeroesJson, saveHeroes, upsertByName } from '#/data/heroStore.ts'
import { classIconId, itemIconId, skillIconId, spiritIconId, elementIconId } from '#/data/images.ts'
import { importTitansDb, type ImportIssue } from '#/data/titansdb.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { calcStats, MAIN_STATS } from '#/engine/stats.ts'
import { downloadText } from '#/lib/download.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { useGameData } from '#/ui/dataSync.ts'
import { Notice, Page, Section } from '#/ui/layout.tsx'

export const Route = createFileRoute('/heroes')({ component: HeroesPage })

const STAT_LABEL = { atk: 'ATK', def: 'DEF', hp: 'HP' } as const

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
}

function ImportReport({ issues, summary }: { issues: ImportIssue[]; summary: string }) {
  return (
    <Notice tone={issues.some((i) => i.level === 'error') ? 'warning' : 'success'} className="mt-4">
      <p className="font-semibold">{summary}</p>
      {issues.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {issues.map((i, n) => (
            <li key={n} className={i.level === 'error' ? 'text-destructive' : 'text-warning'}>
              строка {i.line}
              {i.hero ? `, ${i.hero}` : ''}: {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>Всё сопоставлено с данными таблицы.</p>
      )}
    </Notice>
  )
}

function HeroCard({ hero, data, onDelete }: { hero: HeroInstance; data: GameData; onDelete: () => void }) {
  const stats = calcStats(hero, data)
  const model = calcStats(hero, data, { useReference: false })
  const ref = hero.reference?.stats
  return (
    <article className="flex">
      <Card className="flex-1 gap-4">
        <CardHeader className="flex items-center gap-3">
          <GameIcon kind="class" id={classIconId(hero.className)} label={hero.className} size={44} />
          <div className="min-w-0 flex-1">
            <CardTitle>
              <h3 className="text-lg font-semibold">{hero.name}</h3>
            </CardTitle>
            <CardDescription>
              {hero.className}, уровень {hero.level}
              {hero.titanSoul ? ', Душа Титана' : ''} · стихия {stats.element}
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 /> Удалить
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {hero.slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 p-1.5 text-xs">
                <GameIcon kind="item" id={s.item ? itemIconId(s.item) : null} label={s.item ?? 'пусто'} size={32} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.item ?? '—'}</div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {s.item ? s.quality : ''}
                    {s.element ? (
                      <GameIcon kind="element" id={data.enchants.find((e) => e.name === s.element)?.iconId ?? elementIconId('Any')} label={s.element} size={14} />
                    ) : null}
                    {s.spirit ? <GameIcon kind="spirit" id={spiritIconId(s.spirit)} label={s.spirit} size={14} /> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stats.breakdown.skills
              .filter((s) => s.type === 'Hero' || s.type === 'Innate' || s.type === 'Artifact')
              .map((s, i) => (
                <Badge key={i} variant="secondary" className="gap-1.5 py-1" title={s.text}>
                  <GameIcon kind="skill" id={skillIconId(s.name)} label={s.name} size={16} />
                  {s.name}
                  {s.tier ? ` (${s.tier})` : ''}
                </Badge>
              ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Расчёт</TableHead>
                {ref ? <TableHead>Экспорт</TableHead> : null}
                {ref ? <TableHead title="Расчёт с базой из модели роста по уровню, без эталона экспорта">Модель без эталона</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MAIN_STATS.map((st) => (
                <TableRow key={st}>
                  <TableCell className="text-muted-foreground">{STAT_LABEL[st]}</TableCell>
                  <TableCell className="font-semibold">{stats[st]}</TableCell>
                  {ref ? <TableCell>{ref[st]}</TableCell> : null}
                  {ref ? (
                    <TableCell className="text-muted-foreground">
                      {model[st]} ({pct(model[st] / ref[st] - 1)})
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-muted-foreground">Крит</TableCell>
                <TableCell>
                  {(stats.crit * 100).toFixed(0)}% ×{stats.critDmg.toFixed(1)}
                </TableCell>
                {ref ? (
                  <TableCell>
                    {(ref.crit * 100).toFixed(0)}% ×{ref.critDmg}
                  </TableCell>
                ) : null}
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Уклонение</TableCell>
                <TableCell>{(stats.eva * 100).toFixed(0)}%</TableCell>
                {ref ? <TableCell>{(ref.eva * 100).toFixed(0)}%</TableCell> : null}
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">Угроза</TableCell>
                <TableCell>{stats.threat}</TableCell>
                {ref ? <TableCell>{ref.threat}</TableCell> : null}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          База: {stats.breakdown.baseSource === 'reference' ? 'из экспорта (уровень не менялся)' : 'модель роста по уровню (≈±3% ATK/DEF, ≈±10% HP)'}
        </CardFooter>
      </Card>
    </article>
  )
}

function HeroesPage() {
  const data = useGameData()
  const [heroes, setHeroes] = useState<HeroInstance[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ issues: ImportIssue[]; summary: string } | null>(null)
  const [paste, setPaste] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void loadHeroes().then((r) => {
      setHeroes(r.heroes)
      setError(r.error)
    })
  }, [])

  const update = (next: HeroInstance[]) => {
    setHeroes(next)
    void saveHeroes(next).catch((e: unknown) => setError(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`))
  }

  // Импорт мог начаться раньше, чем герои прочитались из IndexedDB: тогда дочитываем,
  // иначе слияние с пустым списком перезаписало бы сохранённых героев.
  const currentHeroes = async (): Promise<HeroInstance[]> => heroes ?? (await loadHeroes()).heroes

  const importText = async (text: string) => {
    if (!data) {
      setReport({ issues: [], summary: 'Игровые данные ещё загружаются — повторите импорт через пару секунд.' })
      return
    }
    const r = importTitansDb(text, data)
    const merged = upsertByName(await currentHeroes(), r.heroes)
    update(merged.heroes)
    setReport({ issues: r.issues, summary: `Импорт: добавлено ${merged.added}, обновлено ${merged.updated}, замечаний ${r.issues.length}.` })
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    if (file.name.toLowerCase().endsWith('.json')) {
      const r = parseHeroesJson(text)
      if ('error' in r) setReport({ issues: [], summary: r.error })
      else {
        update(mergeHeroes(await currentHeroes(), r.heroes))
        setReport({ issues: [], summary: `Загружено героев из JSON: ${r.heroes.length}.` })
      }
    } else await importText(text)
  }

  return (
    <Page title="Герои" description="Импортируйте экспорт TitansDB. Герои хранятся только в этом браузере.">
      <Section title="Импорт из TitansDB">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void importFile(file)
          }}
          className={cn('space-y-3 rounded-lg border-2 border-dashed p-4 transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-border')}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Upload className="size-5 text-muted-foreground" />
            <span>Перетащите сюда файл экспорта (.txt) или файл героев (.json), выберите его</span>
            <Input
              type="file"
              accept=".txt,.tsv,.json,text/plain,application/json"
              onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])}
              className="w-auto max-w-full"
            />
            <span>или вставьте текст:</span>
          </div>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder="Строки экспорта TitansDB, поля через TAB"
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <Button disabled={!data || !paste.trim()} onClick={() => void importText(paste)}>
              Импортировать текст
            </Button>
            {!data ? <span className="text-sm text-muted-foreground">Загрузка игровых данных…</span> : null}
          </div>
        </div>
        {report ? <ImportReport {...report} /> : null}
      </Section>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-xl font-semibold">Мои герои ({heroes?.length ?? '…'})</h2>
          <Button variant="outline" size="sm" disabled={!heroes?.length} onClick={() => heroes && downloadText('st-heroes.json', exportHeroesJson(heroes))}>
            <Download /> Экспорт JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!heroes?.length}
            onClick={() => {
              if (window.confirm('Удалить всех героев из этого браузера?')) update([])
            }}
          >
            <Trash2 /> Очистить
          </Button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {heroes && heroes.length === 0 ? <p className="text-sm text-muted-foreground">Пока нет героев — импортируйте экспорт TitansDB.</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {data && heroes
            ? heroes.map((h) => <HeroCard key={h.id} hero={h} data={data} onDelete={() => update(heroes.filter((x) => x.id !== h.id))} />)
            : null}
        </div>
      </section>
    </Page>
  )
}
