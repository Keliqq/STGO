import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { exportHeroesJson, loadHeroes, mergeHeroes, parseHeroesJson, saveHeroes, upsertByName } from '#/data/heroStore.ts'
import { classIconId, skillIconId } from '#/data/images.ts'
import { importTitansDb, type ImportIssue } from '#/data/titansdb.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { modelWarning } from '#/engine/classModel.ts'
import { draftCopy, emptySlot, newHero } from '#/engine/heroEditor.ts'
import { calcStats, effectiveClass } from '#/engine/stats.ts'
import { downloadText } from '#/lib/download.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { useGameData } from '#/ui/dataSync.ts'
import { HintLabel, Tip } from '#/ui/Hint.tsx'
import { Notice, Page, Section } from '#/ui/layout.tsx'
import { HeroEditor } from '#/ui/heroes/HeroEditor.tsx'
import { DraftBadge, ElementIcon, HeroStatTable } from '#/ui/heroes/heroStatTable.tsx'
import { enchantByName } from '#/ui/heroes/heroView.ts'
import { HeroWeightsPanel } from '#/ui/optimize/HeroWeightsPanel.tsx'

export const Route = createFileRoute('/heroes')({ component: HeroesPage })

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

/** Кнопки карточки героя: изменить, копия для экспериментов, удалить. */
function HeroActions({ onEdit, onCopy, onDelete }: { onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Tip text="Открыть форму правки: имя, класс, уровень, навыки, экипировка, семена. Статы пересчитываются сразу.">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil /> Изменить
        </Button>
      </Tip>
      <Tip text="Дублировать героя с пометкой «черновик»: оригинал остаётся как есть, а копию можно свободно править и сравнивать с ним.">
        <Button variant="outline" size="sm" onClick={onCopy}>
          <Copy /> Копия для экспериментов
        </Button>
      </Tip>
      <Tip text="Удалить героя из этого браузера. Можно импортировать заново.">
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 /> Удалить
        </Button>
      </Tip>
    </div>
  )
}

function HeroCard({
  hero,
  data,
  original,
  onEdit,
  onCopy,
  onDelete,
}: {
  hero: HeroInstance
  data: GameData
  /** Черновик сравнивается с оригиналом (если он ещё есть в списке). */
  original?: HeroInstance
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const stats = calcStats(hero, data)
  const ref = hero.reference?.stats
  // Пометка о точности: класс смоделирован не полностью (см. src/engine/classModel.ts).
  const modelNote = modelWarning(data, effectiveClass(hero, data)?.name ?? hero.className)
  const originalStats = original ? calcStats(original, data) : null
  return (
    <article className="flex">
      <Card className={cn('flex-1 gap-4', hero.draft && 'border-warning/60')}>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <GameIcon kind="class" id={classIconId(hero.className)} label={hero.className} size={44} />
            <div className="min-w-0 flex-1">
              <CardTitle>
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {hero.name}
                  {hero.draft ? <DraftBadge /> : null}
                </h3>
              </CardTitle>
              <CardDescription>
                {hero.className}, уровень {hero.level}
                {hero.titanSoul ? ', Душа Титана' : ''} · стихия {stats.element}
                <ElementIcon element={effectiveClass(hero, data)?.element ?? null} size={14} />
              </CardDescription>
              {modelNote ? (
                <p className={cn('mt-1 text-xs', modelNote.level === 'partial' ? 'text-warning' : 'text-muted-foreground')} title={modelNote.text}>
                  {modelNote.text}
                </p>
              ) : null}
            </div>
          </div>
          <HeroActions onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {hero.slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 p-1.5 text-xs">
                <GameIcon kind="item" id={s.item ? (data.items.find((x) => x.name === s.item)?.imageId ?? null) : null} label={s.item ?? 'пусто'} size={32} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.item ?? '—'}</div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {s.item ? s.quality : ''}
                    {s.element ? <GameIcon kind="element" id={enchantByName(data, s.element)?.iconId ?? 'all'} label={s.element} size={14} /> : null}
                    {s.spirit ? <GameIcon kind="spirit" id={data.enchants.find((e) => e.name === s.spirit)?.iconId ?? null} label={s.spirit} size={14} /> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stats.breakdown.skills
              .filter((s) => s.type === 'Hero' || s.type === 'Innate' || s.type === 'Artifact')
              .map((s, i) => (
                <Tip key={i} text={s.text}>
                  <Badge variant="secondary" className="gap-1.5 py-1 pl-1">
                    <GameIcon kind="skill" id={skillIconId(s.name)} label={s.name} size={20} decorative />
                    {s.name}
                    {s.tier ? ` (${s.tier})` : ''}
                  </Badge>
                </Tip>
              ))}
          </div>

          {originalStats ? (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Сравнение с оригиналом{original ? ` «${original.name}»` : ''}: слева черновик, справа оригинал.
              </p>
              <HeroStatTable label="Черновик" stats={stats} other={originalStats} otherLabel="Оригинал" showDelta />
            </div>
          ) : (
            <HeroStatTable label="Расчёт" stats={stats} other={ref ?? null} otherLabel="Экспорт" />
          )}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          База: {stats.breakdown.baseSource === 'reference' ? 'из экспорта (уровень не менялся)' : 'модель роста по уровню (≈±3% ATK/DEF, ≈±7% HP)'}
          {hero.reference && hero.reference.level !== hero.level ? ` · эталон с ${hero.reference.level} ур. больше не подходит — уровень изменён` : ''}
        </CardFooter>
        <CardContent>
          <HeroWeightsPanel hero={hero} data={data} />
        </CardContent>
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
  /** Открытая форма: «новый герой» или правка конкретного. */
  const [editing, setEditing] = useState<{ hero: HeroInstance; creating: boolean } | null>(null)

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

  /** Создать пустого героя: класс по умолчанию — первый из данных. */
  const startCreating = (): void => {
    if (!data) return
    const first = data.heroClasses.find((c) => c.baseClass == null) ?? data.heroClasses[0]
    if (!first) return
    setEditing({ hero: { ...newHero(first.name), slots: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()] }, creating: true })
  }

  /** Сохранение формы: новую запись — в конец, существующую — на её месте (id сохраняется). */
  const saveEdited = (next: HeroInstance): void => {
    const list = heroes ?? []
    const exists = list.some((h) => h.id === next.id)
    update(exists ? list.map((h) => (h.id === next.id ? next : h)) : [...list, next])
    setEditing(null)
  }

  /** «Копия для экспериментов»: дубликат с пометкой «черновик» и ссылкой на оригинал. */
  const makeDraft = (hero: HeroInstance): void => {
    const list = heroes ?? []
    update([...list, draftCopy(hero)])
  }

  const drafts = heroes?.filter((h) => h.draft).length ?? 0

  return (
    <Page
      title="Герои"
      description="Создавайте героев вручную или импортируйте экспорт TitansDB. Герои и их черновики хранятся только в этом браузере."
    >
      {editing ? (
        <HeroEditor
          data={data!}
          hero={editing.hero}
          creating={editing.creating}
          onSave={saveEdited}
          onCancel={() => setEditing(null)}
        />
      ) : null}

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
          <h2 className="flex-1 text-xl font-semibold">
            Мои герои ({heroes?.length ?? '…'}
            {drafts > 0 ? `, черновиков ${drafts}` : ''})
          </h2>
          <Tip text="Создать героя вручную: класс, уровень, навыки и экипировка. Доступны только те предметы, камни, духи и навыки, которые герой может использовать.">
            <span>
              <Button size="sm" disabled={!data} onClick={startCreating}>
                <Plus /> Новый герой
              </Button>
            </span>
          </Tip>
          <Tip text="Скачать файл со всеми героями (JSON), чтобы перенести их в другой браузер.">
            <span>
              <Button variant="outline" size="sm" disabled={!heroes?.length} onClick={() => heroes && downloadText('st-heroes.json', exportHeroesJson(heroes))}>
                <Download /> Экспорт JSON
              </Button>
            </span>
          </Tip>
          <Tip text="Удалить всех героев из этого браузера (потребуется подтверждение).">
            <span>
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
            </span>
          </Tip>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {heroes && heroes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет героев — создайте нового кнопкой «Новый герой» или импортируйте экспорт TitansDB.
          </p>
        ) : null}
        <p className="mb-3 text-xs text-muted-foreground">
          <HintLabel hint="Черновик — это копия героя для экспериментов: правьте её свободно, оригинал не меняется. Для черновика показывается сравнение статов с оригиналом.">
            Черновик
          </HintLabel>{' '}
          — копия героя для опытов: в подбор идёт наравне с героями, а его статы сравниваются с оригиналом.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {data && heroes
            ? heroes.map((h) => (
                <HeroCard
                  key={h.id}
                  hero={h}
                  data={data}
                  original={h.originId ? heroes.find((x) => x.id === h.originId) : undefined}
                  onEdit={() => setEditing({ hero: h, creating: false })}
                  onCopy={() => makeDraft(h)}
                  onDelete={() => update(heroes.filter((x) => x.id !== h.id))}
                />
              ))
            : null}
        </div>
      </section>
    </Page>
  )
}
