import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { exportHeroesJson, loadHeroes, mergeHeroes, parseHeroesJson, saveHeroes, upsertByName } from '#/data/heroStore.ts'
import { classIconId, itemIconId, skillIconId, spiritIconId, elementIconId } from '#/data/images.ts'
import { importTitansDb, type ImportIssue } from '#/data/titansdb.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { calcStats, MAIN_STATS } from '#/engine/stats.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { useGameData } from '#/ui/dataSync.ts'

export const Route = createFileRoute('/heroes')({ component: HeroesPage })

const STAT_LABEL = { atk: 'ATK', def: 'DEF', hp: 'HP' } as const
const btn = 'rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800'

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
}

function ImportReport({ issues, summary }: { issues: ImportIssue[]; summary: string }) {
  return (
    <div className="mt-3 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-700">
      <p className="font-semibold">{summary}</p>
      {issues.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {issues.map((i, n) => (
            <li key={n} className={i.level === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}>
              строка {i.line}
              {i.hero ? `, ${i.hero}` : ''}: {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-neutral-500">Всё сопоставлено с данными таблицы.</p>
      )}
    </div>
  )
}

function HeroCard({ hero, data, onDelete }: { hero: HeroInstance; data: GameData; onDelete: () => void }) {
  const stats = calcStats(hero, data)
  const model = calcStats(hero, data, { useReference: false })
  const ref = hero.reference?.stats
  return (
    <article className="rounded border border-neutral-200 p-4 dark:border-neutral-700">
      <header className="mb-3 flex items-center gap-3">
        <GameIcon kind="class" id={classIconId(hero.className)} label={hero.className} size={40} />
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{hero.name}</h3>
          <p className="text-sm text-neutral-500">
            {hero.className}, уровень {hero.level}
            {hero.titanSoul ? ', Душа Титана' : ''} · стихия {stats.element}
          </p>
        </div>
        <button type="button" className={btn} onClick={onDelete}>
          Удалить
        </button>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {hero.slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <GameIcon kind="item" id={s.item ? itemIconId(s.item) : null} label={s.item ?? 'пусто'} size={32} />
            <div className="min-w-0">
              <div className="truncate font-medium">{s.item ?? '—'}</div>
              <div className="flex items-center gap-1 text-neutral-500">
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

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {stats.breakdown.skills
          .filter((s) => s.type === 'Hero' || s.type === 'Innate' || s.type === 'Artifact')
          .map((s, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-800" title={s.text}>
              <GameIcon kind="skill" id={skillIconId(s.name)} label={s.name} size={16} />
              {s.name}
              {s.tier ? ` (${s.tier})` : ''}
            </span>
          ))}
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr>
            <th className="font-normal" />
            <th className="font-normal">Расчёт</th>
            {ref ? <th className="font-normal">Экспорт</th> : null}
            {ref ? <th className="font-normal" title="Расчёт с базой из модели роста по уровню, без эталона экспорта">Модель без эталона</th> : null}
          </tr>
        </thead>
        <tbody>
          {MAIN_STATS.map((st) => (
            <tr key={st}>
              <td>{STAT_LABEL[st]}</td>
              <td className="font-semibold">{stats[st]}</td>
              {ref ? <td>{ref[st]}</td> : null}
              {ref ? (
                <td className="text-neutral-500">
                  {model[st]} ({pct(model[st] / ref[st] - 1)})
                </td>
              ) : null}
            </tr>
          ))}
          <tr>
            <td>Крит</td>
            <td>
              {(stats.crit * 100).toFixed(0)}% ×{stats.critDmg.toFixed(1)}
            </td>
            {ref ? (
              <td>
                {(ref.crit * 100).toFixed(0)}% ×{ref.critDmg}
              </td>
            ) : null}
          </tr>
          <tr>
            <td>Уклонение</td>
            <td>{(stats.eva * 100).toFixed(0)}%</td>
            {ref ? <td>{(ref.eva * 100).toFixed(0)}%</td> : null}
          </tr>
          <tr>
            <td>Угроза</td>
            <td>{stats.threat}</td>
            {ref ? <td>{ref.threat}</td> : null}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        База: {stats.breakdown.baseSource === 'reference' ? 'из экспорта (уровень не менялся)' : 'модель роста по уровню (≈±3% ATK/DEF, ≈±10% HP)'}
      </p>
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

  const importText = (text: string) => {
    if (!data || !heroes) return
    const r = importTitansDb(text, data)
    const merged = upsertByName(heroes, r.heroes)
    update(merged.heroes)
    setReport({ issues: r.issues, summary: `Импорт: добавлено ${merged.added}, обновлено ${merged.updated}, замечаний ${r.issues.length}.` })
  }

  const importFile = async (file: File) => {
    const text = await file.text()
    if (file.name.toLowerCase().endsWith('.json')) {
      const r = parseHeroesJson(text)
      if ('error' in r) setReport({ issues: [], summary: r.error })
      else {
        update(mergeHeroes(heroes ?? [], r.heroes))
        setReport({ issues: [], summary: `Загружено героев из JSON: ${r.heroes.length}.` })
      }
    } else importText(text)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Герои</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Импорт из TitansDB</h2>
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
          className={`rounded border-2 border-dashed p-4 ${dragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-neutral-300 dark:border-neutral-600'}`}
        >
          <p className="mb-2 text-sm">
            Перетащите сюда файл экспорта (.txt) или файл героев (.json), выберите его{' '}
            <input type="file" accept=".txt,.tsv,.json,text/plain,application/json" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} className="text-sm" />
            или вставьте текст:
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder="Строки экспорта TitansDB, поля через TAB"
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-900"
          />
          <button type="button" className={btn} disabled={!data || !paste.trim()} onClick={() => importText(paste)}>
            Импортировать текст
          </button>
          {!data ? <p className="mt-2 text-sm text-neutral-500">Загрузка игровых данных…</p> : null}
        </div>
        {report ? <ImportReport {...report} /> : null}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="flex-1 text-xl font-semibold">Мои герои ({heroes?.length ?? '…'})</h2>
          <button type="button" className={btn} disabled={!heroes?.length} onClick={() => heroes && download('st-heroes.json', exportHeroesJson(heroes))}>
            Экспорт JSON
          </button>
          <button
            type="button"
            className={btn}
            disabled={!heroes?.length}
            onClick={() => {
              if (window.confirm('Удалить всех героев из этого браузера?')) update([])
            }}
          >
            Очистить
          </button>
        </div>
        {error ? <p className="mb-3 rounded bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
        {heroes && heroes.length === 0 ? <p className="text-sm text-neutral-500">Пока нет героев — импортируйте экспорт TitansDB.</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {data && heroes
            ? heroes.map((h) => <HeroCard key={h.id} hero={h} data={data} onDelete={() => update(heroes.filter((x) => x.id !== h.id))} />)
            : null}
        </div>
      </section>
    </main>
  )
}
