import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { exportAppStateJson, importAppStateJson } from '#/data/appState.ts'
import { BREAKPOINTS_SOURCE } from '#/data/breakpoints.ts'
import { loadHeroes } from '#/data/heroStore.ts'
import { classIconId, elementIconId, skillIconId, typeIconId } from '#/data/images.ts'
import { loadRealityChecks } from '#/data/realityChecks.ts'
import { loadTeams } from '#/data/teams.ts'
import { questsWithCaps, setUserQuestCap } from '#/data/sync.ts'
import type { GameData, Quest } from '#/data/types.ts'
import { defCapsFromCap } from '#/engine/formulas.ts'
import { QUEST_VARIANT_RU } from '#/engine/teamRunner.ts'
import { downloadText } from '#/lib/download.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { type Settings, loadSettings, refreshNow, saveSettings, useDataStatus, useGameData } from '#/ui/dataSync.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'
import { CheckSuggestionsView } from '#/ui/CheckSuggestionsView.tsx'
import { ModelAccuracyView } from '#/ui/ModelAccuracyView.tsx'

export const Route = createFileRoute('/data')({ component: DataPage })

const SOURCE_LABEL = { cache: 'кэш браузера', snapshot: 'встроенный снапшот', fresh: 'свежие из таблицы' } as const

function fmt(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('ru-RU') : '—'
}

function TtlSetting() {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])
  if (!settings) return null
  return (
    <Field label="Проверять обновления, если данные старше" hint="При запуске приложение берёт данные из кэша; если кэш старше этого срока, в фоне перечитывает таблицу.">
      <Input
        type="number"
        min={1}
        max={24 * 30}
        value={settings.ttlHours}
        onChange={(e) => {
          const next = { ttlHours: Math.max(1, Number(e.target.value) || 24) }
          setSettings(next)
          void saveSettings(next)
        }}
        className="w-20"
      />
      ч
    </Field>
  )
}

async function loadCounts(): Promise<{ heroes: number; checks: number; teams: number }> {
  const [h, c, t] = await Promise.all([loadHeroes(), loadRealityChecks(), loadTeams()])
  return { heroes: h.heroes.length, checks: c.checks.length, teams: t.teams.length }
}

/** Резервная копия: герои, команды и отметки «проходит/не проходит» одним JSON-файлом. */
function BackupSection() {
  const [counts, setCounts] = useState<{ heroes: number; checks: number; teams: number }>({ heroes: 0, checks: 0, teams: 0 })
  const [report, setReport] = useState<string | null>(null)

  useEffect(() => {
    void loadCounts().then(setCounts)
  }, [])

  async function importAll(text: string): Promise<void> {
    const r = await importAppStateJson(text)
    if ('error' in r) {
      setReport(r.error)
      return
    }
    setReport(
      `Импортировано: героев добавлено ${r.heroesAdded}, обновлено ${r.heroesUpdated}; ` +
        `всего — героев ${r.counts.heroes}, команд ${r.counts.teams}, отметок ${r.counts.realityChecks}.`,
    )
    setCounts(await loadCounts())
  }

  return (
    <Section
      title="Резервная копия"
      description={
        <>
          В файл попадают герои ({counts.heroes}), команды ({counts.teams}) и отметки «проходит/не проходит» ({counts.checks}).
          Импорт объединяет с текущими данными: герои обновляются по имени и классу, команды — по id, отметки добавляются.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Tip text="Скачать всех героев и отметки реальности одним файлом — для переноса или резервной копии.">
          <Button onClick={() => void exportAppStateJson().then((json) => downloadText('st-app-state.json', json))}>
            <Download /> Экспорт JSON
          </Button>
        </Tip>
        <span className="text-sm text-muted-foreground">Импорт:</span>
        <Input
          type="file"
          accept=".json,application/json"
          className="w-auto max-w-full"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            void f.text().then(importAll)
          }}
        />
      </div>
      {report ? <Notice className="mt-3">{report}</Notice> : null}
    </Section>
  )
}

/** «X · 2X · 6X» из stcentral-hub и игры: один cap → пороги 50 / 70 / 75% (A71). */
function capsLabel(cap: number): string {
  const c = defCapsFromCap(cap)
  return `${Math.round(c.p50)} · ${Math.round(c.p70)} · ${Math.round(c.p75)}`
}

/**
 * Поле «Defense cap с экрана игры» для квеста, которому порогов не нашлось (A10/A71):
 * в игре видно одно число — порог 75%, остальные кратны ему (cap/6 и cap/3).
 * Запись — по Enter или уходу из поля; пустое поле убирает значение.
 */
function QuestCapField({ quest, value }: { quest: Quest; value: number | undefined }) {
  // Пока пользователь не трогал поле, показываем значение из хранилища (оно приходит асинхронно при старте).
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? (value == null ? '' : String(value))
  const commit = (): void => {
    if (text === null) return
    const trimmed = text.trim()
    if (trimmed === '') {
      void setUserQuestCap(quest.id, null)
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n <= 0) return
    void setUserQuestCap(quest.id, n)
  }
  return (
    <Input
      type="number"
      min={1}
      className="w-28"
      placeholder="0"
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

/**
 * Пороги защиты квестов, которых нет ни в таблице, ни на stcentral-hub (Lost City of Gold и всё,
 * что не совпало по локации/сложности). Пользователь вводит cap с экрана игры; он хранится в
 * IndexedDB браузера и подставляется в `defCaps` (`data/questCaps.ts`, A71).
 */
function UserQuestCapsSection({ data }: { data: GameData }) {
  const status = useDataStatus()
  const caps = questsWithCaps(data)
  // Список — по порогам ХАБА, а не по итоговым: введённый квест не должен исчезать из таблицы (иначе
  // значение не увидеть и не поправить). Пороги самого хаба вводить не нужно.
  const missing = caps.noHubCaps
  const areas = [...new Set(missing.map((q) => q.area))]
  const entered = Object.keys(status.userQuestCaps).length
  if (missing.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Пороги есть у всех квестов — вводить cap вручную нечего.
      </p>
    )
  }
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm">
        У {missing.length} квестов порогов нет. Впишите <b>Defense cap с экрана игры</b> (это порог 75%): 50% и 70% игра
        выводит из него — cap/6 и cap/3, тот же формат, что «X · 2X · 6X» у stcentral-hub. Введено вручную: {entered}.
        Значения хранятся только в вашем браузере (IndexedDB).
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Локация</TableHead>
            <TableHead>Сложность</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Defense cap с экрана игры</TableHead>
            <TableHead>Пороги 50 · 70 · 75%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {areas.flatMap((area) =>
            missing
              .filter((q) => q.area === area)
              .map((q) => {
                const cap = status.userQuestCaps[q.id]
                return (
                  <TableRow key={q.id}>
                    <TableCell>{q.area}</TableCell>
                    <TableCell>{q.difficulty}</TableCell>
                    <TableCell>{QUEST_VARIANT_RU[q.variant]}</TableCell>
                    <TableCell>
                      <QuestCapField quest={q} value={cap} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cap ? capsLabel(cap) : '— без порогов —'}</TableCell>
                  </TableRow>
                )
              }),
          )}
        </TableBody>
      </Table>
    </div>
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
    <Page title="Данные" description="Источник игровых данных, их свежесть, резервная копия ваших данных и то, что не удалось разобрать.">
      <Section title="Состояние">
        <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Источник</dt>
          <dd className="font-medium">{status.source ? SOURCE_LABEL[status.source] : 'загрузка…'}</dd>
          <dt className="text-muted-foreground">Дата данных</dt>
          <dd>{fmt(status.dataDate)}</dd>
          <dt className="text-muted-foreground">Последняя проверка</dt>
          <dd>{status.checking ? 'идёт сейчас…' : fmt(status.lastCheckAt)}</dd>
          {status.lastUpdate ? (
            <>
              <dt className="text-muted-foreground">Обновление</dt>
              <dd>{status.lastUpdate.message}</dd>
            </>
          ) : null}
        </dl>
        {status.error ? <Notice tone="error">{status.error}</Notice> : null}
        {status.warnings.map((w) => (
          <Notice key={w} tone="warning">
            {w}
          </Notice>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <Tip text="Перечитать Google-таблицу сразу, не дожидаясь срока устаревания кэша.">
            <span>
              <Button disabled={status.checking} onClick={refreshNow}>
                <RefreshCw className={status.checking ? 'animate-spin' : undefined} /> Обновить данные сейчас
              </Button>
            </span>
          </Tip>
          <TtlSetting />
        </div>
      </Section>

      <BackupSection />

      <ModelAccuracyView />

      {data ? <CheckSuggestionsView data={data} /> : null}

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
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : bp.mode === 'noCaps' ? (
          <Notice tone="warning">{bp.error} Оптимизатор работает в режиме «без порогов»: учитывает только урон и HP.</Notice>
        ) : (
          <p className="text-sm">
            Загружены {fmt(bp.fetchedAt)} ({bp.source === 'cache' ? 'из кэша' : 'только что'}); порогами покрыто {caps?.matched ?? 0} из{' '}
            {data?.quests.length ?? 0} квестов (у Lost City of Gold порогов нет нигде).
            {bp.error ? <span className="block text-warning">{bp.error} Используются сохранённые.</span> : null}
          </p>
        )}
        {caps?.warnings.map((w) => (
          <p key={w} className="text-xs text-warning">
            {w}
          </p>
        ))}
        {data ? <UserQuestCapsSection data={data} /> : null}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Лист</TableHead>
                    <TableHead>Строка</TableHead>
                    <TableHead>Ключ</TableHead>
                    <TableHead>Причина</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rejects.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.sheet}</TableCell>
                      <TableCell>{r.row ?? '—'}</TableCell>
                      <TableCell>{r.key ?? '—'}</TableCell>
                      <TableCell className="whitespace-normal">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title={`Несостыковки между листами (${data.warnings.length})`}>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Section>

          <Section
            title={`Нераспознанные эффекты навыков (${unparsed.length})`}
            description={`Ещё ${ignoredCount} клауз распознаны как небоевые или особые механики (время отдыха, лут, «выжить после смертельного удара»…) — их движок пока не учитывает.`}
          >
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {unparsed.map((u) => (
                <li key={u.skill + u.clause}>
                  <b>{u.skill}</b>: {u.clause}
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}
    </Page>
  )
}
