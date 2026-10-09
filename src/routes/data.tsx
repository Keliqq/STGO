import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BREAKPOINTS_SOURCE } from '#/data/breakpoints.ts'
import { classIconId, elementIconId, skillIconId, typeIconId } from '#/data/images.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { type Settings, loadSettings, refreshNow, saveSettings, useDataStatus, useGameData } from '#/ui/dataSync.ts'

export const Route = createFileRoute('/data')({ component: DataPage })

const SOURCE_LABEL = { cache: 'кэш браузера', snapshot: 'встроенный снапшот', fresh: 'свежие из таблицы' } as const

function fmt(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('ru-RU') : '—'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function TtlSetting() {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])
  if (!settings) return null
  return (
    <label className="flex items-center gap-2 text-sm">
      Проверять обновления, если данные старше
      <input
        type="number"
        min={1}
        max={24 * 30}
        value={settings.ttlHours}
        onChange={(e) => {
          const next = { ttlHours: Math.max(1, Number(e.target.value) || 24) }
          setSettings(next)
          void saveSettings(next)
        }}
        className="w-20 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600 dark:bg-neutral-800"
      />
      ч
    </label>
  )
}

function DataPage() {
  const status = useDataStatus()
  const data = useGameData()
  const bp = status.breakpoints
  const caps = data ? questsWithCaps(data) : null
  const unparsed = data ? data.skills.flatMap((s) => s.unparsed.map((u) => ({ skill: s.id, clause: u }))) : []
  const ignoredCount = data ? data.skills.reduce((n, s) => n + s.ignored.length, 0) : 0

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Данные</h1>

      <Section title="Состояние">
        <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Источник</dt>
          <dd>{status.source ? SOURCE_LABEL[status.source] : 'загрузка…'}</dd>
          <dt className="text-neutral-500">Дата данных</dt>
          <dd>{fmt(status.dataDate)}</dd>
          <dt className="text-neutral-500">Последняя проверка</dt>
          <dd>{status.checking ? 'идёт сейчас…' : fmt(status.lastCheckAt)}</dd>
          {status.lastUpdate ? (
            <>
              <dt className="text-neutral-500">Обновление</dt>
              <dd>{status.lastUpdate.message}</dd>
            </>
          ) : null}
        </dl>
        {status.error ? <p className="mb-3 rounded bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{status.error}</p> : null}
        {status.warnings.map((w) => (
          <p key={w} className="mb-2 rounded bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {w}
          </p>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={status.checking}
            onClick={refreshNow}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Обновить данные сейчас
          </button>
          <TtlSetting />
        </div>
      </Section>

      <Section title="Пороги защиты квестов">
        <p className="mb-2 text-sm">
          Источник:{' '}
          <a href={BREAKPOINTS_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
            {BREAKPOINTS_SOURCE.title}
          </a>{' '}
          ({BREAKPOINTS_SOURCE.author}, лицензия{' '}
          <a href={BREAKPOINTS_SOURCE.licenseUrl} target="_blank" rel="noreferrer" className="underline">
            {BREAKPOINTS_SOURCE.license}
          </a>
          ). Загружаются в ваш браузер и хранятся только в нём.
        </p>
        {!bp ? (
          <p className="text-sm">Загрузка…</p>
        ) : bp.mode === 'noCaps' ? (
          <p className="rounded bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {bp.error} Оптимизатор работает в режиме «без порогов»: учитывает только урон и HP.
          </p>
        ) : (
          <p className="text-sm">
            Загружены {fmt(bp.fetchedAt)} ({bp.source === 'cache' ? 'из кэша' : 'только что'}); порогами покрыто {caps?.matched ?? 0} из{' '}
            {data?.quests.length ?? 0} квестов (у Lost City of Gold порогов нет нигде).
            {bp.error ? <span className="block text-amber-700">{bp.error} Используются сохранённые.</span> : null}
          </p>
        )}
        {caps?.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-700">
            {w}
          </p>
        ))}
      </Section>

      {data ? (
        <>
          <Section title="Состав">
            <p className="text-sm">
              Предметов: {data.items.length} (с картинкой: {data.items.filter((i) => i.imageId).length}) · камней и духов:{' '}
              {data.enchants.length} · классов: {data.heroClasses.length} · навыков: {data.skills.length} · чемпионов:{' '}
              {data.champions.length} · локаций: {data.questAreas.length} · квестов: {data.quests.length}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.heroClasses.slice(0, 12).map((c) => (
                <GameIcon key={c.name} kind="class" id={classIconId(c.name)} label={c.name} />
              ))}
              {(['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold'] as const).map((e) => (
                <GameIcon key={e} kind="element" id={elementIconId(e)} label={e} />
              ))}
              {['Sword', 'Heavy Armor', 'Ring'].map((t) => (
                <GameIcon key={t} kind="type" id={typeIconId(t)} label={t} />
              ))}
              {data.items.slice(0, 8).map((i) => (
                <GameIcon key={i.name} kind="item" id={i.imageId} label={i.name} />
              ))}
              {data.enchants
                .filter((e) => e.kind === 'spirit')
                .slice(0, 6)
                .map((e) => (
                  <GameIcon key={e.name} kind="spirit" id={e.iconId} label={e.name} />
                ))}
              {data.skills.slice(0, 6).map((s) => (
                <GameIcon key={s.id} kind="skill" id={skillIconId(s.name)} label={s.name} />
              ))}
            </div>
          </Section>

          <Section title={`Непрочитанные строки (${data.rejects.length})`}>
            {data.rejects.length === 0 ? (
              <p className="text-sm">Все строки разобраны.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="pr-3">Лист</th>
                    <th className="pr-3">Строка</th>
                    <th className="pr-3">Ключ</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejects.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-200 dark:border-neutral-700">
                      <td className="pr-3">{r.sheet}</td>
                      <td className="pr-3">{r.row ?? '—'}</td>
                      <td className="pr-3">{r.key ?? '—'}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title={`Несостыковки между листами (${data.warnings.length})`}>
            <ul className="list-disc pl-5 text-sm">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Section>

          <Section title={`Нераспознанные эффекты навыков (${unparsed.length})`}>
            <p className="mb-2 text-sm text-neutral-500">
              Ещё {ignoredCount} клауз распознаны как небоевые или особые механики (время отдыха, лут, «выжить после смертельного удара»…) —
              их движок пока не учитывает.
            </p>
            <ul className="list-disc pl-5 text-sm">
              {unparsed.map((u) => (
                <li key={u.skill + u.clause}>
                  <b>{u.skill}</b>: {u.clause}
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}
    </main>
  )
}
