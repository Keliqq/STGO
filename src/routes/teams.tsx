/**
 * Страница «Команды»: сохранённые составы отряда (герои + чемпион с аурой, фамильяром и духом)
 * под конкретную локацию, их прогон по квестам и сравнение бок о бок.
 *
 * Разделы:
 *   · «Команды» — список сохранённых команд: состав, размер, проверка под локацию, отметки «прошёл»;
 *   · «Редактор команды» — состав (герои, чемпион с экипировкой), целевая локация и сложность;
 *   · «Прогон и сравнение» — 2–3 команды на одном квесте: win rate, смертность, раунды, барьер, угроза;
 *   · «Подобрать экипировку» — уводит в существующий оптимизатор с составом команды и её чемпионом.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Play, Plus, Save, Sparkles, Trash2, Users, X } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { loadHeroes } from '#/data/heroStore.ts'
import { addRealityCheck, loadRealityChecks, type RealityCheck } from '#/data/realityChecks.ts'
import { questsWithCaps } from '#/data/sync.ts'
import {
  areaPartySize,
  championBuild,
  championGearChoices,
  championGearSummary,
  fitMemberToHero,
  loadTeams,
  memberFromHero,
  newTeam,
  partySizeOf,
  removeTeam,
  targetQuest,
  teamLabel,
  teamsWithHero,
  upsertTeam,
  validateParty,
  type Team,
  type TeamChampion,
} from '#/data/teams.ts'
import { QUALITIES, type GameData, type HeroInstance, type Quality, type Quest } from '#/data/types.ts'
import { ENGINE_MODEL_VERSION } from '#/engine/constants.ts'
import { questLabel } from '#/engine/optimizer.ts'
import { partyHints, type PartyHint } from '#/engine/teamRules.ts'
import { ELEMENT_RU, TEAM_SIM_RUNS, runTeamSync, type TeamRunMember, type TeamRunResult } from '#/engine/teamRunner.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { DraftBadge } from '#/ui/heroes/heroStatTable.tsx'
import { Tip } from '#/ui/Hint.tsx'
import { QuestPicker } from '#/ui/QuestPicker.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'

export const Route = createFileRoute('/teams')({ component: TeamsPage })

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
/** Значение «квест не выбран» в списках прогона: пустая строка означала бы «взять цель команды». */
const QUEST_NONE = '-'

/** Результат проверки чемпиона симуляцией: текущий против предложенного (win rate на одном квесте). */
type VerifyState = { pending: true } | { error: string } | { currentName: string; current: number; champion: string; rank: number; suggested: number }

/** Чекбокс с подписью (label оборачивает — e2e находят его по подписи). */
function CheckItem({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{children}</span>
    </label>
  )
}

/** Бойцы команды для движка: герои снимками, чемпион — своей экипировкой. */
function runMembersOf(team: Team): TeamRunMember[] {
  return [
    ...team.members.map((m) => ({ hero: { ...m.hero, reference: null }, build: null })),
    ...(team.champion ? [{ hero: null, build: { ...team.champion } }] : []),
  ]
}

function TeamsPage() {
  const data = useGameData()
  const navigate = useNavigate()
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [checks, setChecks] = useState<RealityCheck[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [questId, setQuestId] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [runs, setRuns] = useState<Record<string, TeamRunResult>>({})
  const [dead, setDead] = useState<Record<string, string[]>>({})
  /** «Проверить симуляцией» по подсказкам: ключ — «код подсказки:чемпион». */
  const [verify, setVerify] = useState<Record<string, VerifyState>>({})
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void loadHeroes().then((r) => setHeroes(r.heroes))
    void loadTeams().then((r) => {
      setTeams(r.teams)
      setLoadError(r.error)
      if (r.teams.length > 0) {
        setEditingId((cur) => cur ?? r.teams[0].id)
        setSelected((cur) => (cur.length > 0 ? cur : r.teams.slice(0, Math.min(2, r.teams.length)).map((t) => t.id)))
      }
    })
    void loadRealityChecks().then((r) => setChecks(r.checks))
  }, [])

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const areas = useMemo(() => [...new Set(quests.map((q) => q.area))], [quests])
  const gear = useMemo(() => (data ? championGearChoices(data) : { auras: [], familiars: [], spirits: [] }), [data])

  const editing = teams.find((t) => t.id === editingId) ?? null
  const editingQuest = data && editing ? targetQuest(editing, data) : null
  /**
   * Квест, на котором сравниваем: выбранный вручную либо цель первой выбранной команды.
   * `QUEST_NONE` («не выбрана» в списке) гасит фолбэк — иначе выбор «не выбрана» тут же
   * подменялся бы целью команды и квест нельзя было бы снять.
   */
  const runQuest = useMemo(() => {
    if (questId === QUEST_NONE) return null
    if (questId) return quests.find((q) => q.id === questId) ?? null
    if (!data) return null
    for (const id of selected) {
      const t = teams.find((x) => x.id === id)
      const q = t ? targetQuest(t, data) : null
      if (q) return q
    }
    return null
  }, [questId, quests, selected, teams, data])

  async function persist(next: Team): Promise<void> {
    const updated = { ...next, updatedAt: new Date().toISOString() }
    setTeams(await upsertTeam(updated))
  }

  function patchEditing(patch: Partial<Team>): void {
    if (!editing) return
    const next = { ...editing, ...patch }
    setTeams((cur) => cur.map((t) => (t.id === next.id ? next : t)))
  }

  async function saveEditing(): Promise<void> {
    if (!editing) return
    await persist(editing)
    setNote(`Команда «${editing.name}» сохранена.`)
  }

  function addTeam(): void {
    const t = { ...newTeam(crypto.randomUUID()), name: `Команда ${teams.length + 1}` }
    setTeams((cur) => [...cur, t])
    setEditingId(t.id)
    setSelected((cur) => (cur.length < 3 ? [...cur, t.id] : cur))
  }

  async function deleteTeam(id: string): Promise<void> {
    const next = await removeTeam(id)
    setTeams(next)
    setSelected((cur) => cur.filter((x) => x !== id))
    if (editingId === id) setEditingId(next[0]?.id ?? null)
  }

  /** Обновить снимки участников текущими данными героев (команда перестаёт отставать от «Героев»). */
  function refreshMembers(): void {
    if (!editing) return
    const byId = new Map(heroes.map((h) => [h.id, h]))
    const members = editing.members.map((m) => {
      const h = m.heroId ? byId.get(m.heroId) : undefined
      return h ? fitMemberToHero(m, h) : m
    })
    patchEditing({ members })
    setNote('Состав обновлён по текущим героям.')
  }

  async function run(): Promise<void> {
    if (!data || !runQuest || selected.length === 0) return
    setRunning(true)
    setError(null)
    setRuns({})
    setProgress({ done: 0, total: selected.length * TEAM_SIM_RUNS })
    try {
      const out: Record<string, TeamRunResult> = {}
      for (let i = 0; i < selected.length; i++) {
        const team = teams.find((t) => t.id === selected[i])
        if (!team) continue
        const engine = engineRef.current
        // Тяжёлый Монте-Карло — в воркере; синхронный вариант только как запасной (воркера нет вовсе).
        out[team.id] = engine
          ? await engine.runTeam(runMembersOf(team), [runQuest], data, { runs: TEAM_SIM_RUNS })
          : runTeamSync(runMembersOf(team), [runQuest], data)
        setRuns({ ...out })
        setProgress({ done: (i + 1) * TEAM_SIM_RUNS, total: selected.length * TEAM_SIM_RUNS })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  /** Отметка «прошёл / погибли» из «Данных», привязанная к команде. */
  async function mark(team: Team, passed: boolean, deadHeroes: string[]): Promise<void> {
    if (!runQuest) return
    const next = await addRealityCheck({
      id: crypto.randomUUID(),
      questId: runQuest.id,
      questLabel: questLabel(runQuest),
      teamLabel: teamLabel(team),
      passed,
      simWinRate: runs[team.id]?.winRate ?? 0,
      createdAt: new Date().toISOString(),
      modelVersion: ENGINE_MODEL_VERSION,
      deadHeroes,
    })
    setChecks(next)
    setNote(`Отметка сохранена: «${team.name}» ${passed ? 'прошёл' : 'не прошёл'} (${questLabel(runQuest)}).`)
  }

  /** «Подобрать экипировку»: уводим в оптимизатор с составом команды и её чемпионом (A67). */
  function optimizeTeam(team: Team): void {
    if (!runQuest) return
    const c = team.champion
    void navigate({
      to: '/optimize',
      search: {
        heroes: team.members.map((m) => m.hero.id).join(','),
        champion: c?.champion ?? '',
        rank: c ? String(c.rank) : '',
        aura: c?.aura?.item ?? '',
        auraQuality: c?.aura?.quality ?? '',
        familiar: c?.familiar?.item ?? '',
        familiarQuality: c?.familiar?.quality ?? '',
        spirit: c?.spirit ?? '',
        quest: runQuest.id,
      },
    })
  }

  /**
   * «Проверить симуляцией» подсказки: прогон того же состава с текущим чемпионом и с предложенным.
   * Ранг и экипировка — как у текущего чемпиона, чтобы сравнение было честным (A67: аура и фамильяр —
   * просто предметы поддержки, их может носить любой чемпион). Подсказка остаётся подсказкой: решает прогон.
   */
  async function verifyChampion(hint: PartyHint, championName: string): Promise<void> {
    if (!data || !editing || !editingQuest) return
    const key = `${hint.code}:${championName}`
    setVerify((cur) => ({ ...cur, [key]: { pending: true } }))
    try {
      const current = editing.champion
      const rank = current?.rank ?? 1
      const gear = { aura: current?.aura ?? null, familiar: current?.familiar ?? null, spirit: current?.spirit ?? null }
      const members = runMembersOf(editing).filter((m) => m.hero !== null)
      const withChampion = (name: string): TeamRunMember[] => [...members, { hero: null, build: championBuild(name, rank, gear) }]
      const engine = engineRef.current
      const runOne = async (list: TeamRunMember[]): Promise<number> =>
        engine
          ? (await engine.runTeam(list, [editingQuest as Quest], data, { runs: TEAM_SIM_RUNS })).winRate
          : runTeamSync(list, [editingQuest as Quest], data, { runs: TEAM_SIM_RUNS }).winRate
      const currentMembers = current ? withChampion(current.champion) : [...members]
      const [curRate, suggestedRate] = [await runOne(currentMembers), await runOne(withChampion(championName))]
      setVerify((s) => ({
        ...s,
        [key]: { currentName: current?.champion ?? 'без чемпиона', current: curRate, champion: championName, rank, suggested: suggestedRate },
      }))
    } catch (e) {
      setVerify((s) => ({ ...s, [key]: { error: e instanceof Error ? e.message : String(e) } }))
    }
  }

  if (!data) {
    return (
      <Page title="Команды">
        <p className="text-sm text-muted-foreground">Загружаю данные…</p>
      </Page>
    )
  }

  const progressPct = progress ? Math.min(100, (progress.done / Math.max(1, progress.total)) * 100) : 0

  return (
    <Page
      title="Команды"
      description="Сохранённые отряды под конкретную локацию: герои и чемпион с аурой, фамильяром и духом. Каждую команду можно прогнать и сравнить с другой на одном квесте."
    >
      {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {note ? <Notice tone="success">{note}</Notice> : null}

      <Section
        title="Сохранённые команды"
        description="Размер отряда — «Maximum Party Size» локации (3/4/5); чемпион в отряде может быть только один."
        action={
          <Button size="sm" onClick={addTeam}>
            <Plus /> Новая команда
          </Button>
        }
      >
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Команд пока нет. Создайте команду, отметьте в ней героев и чемпиона и выберите локацию — размер проверится по данным.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {teams.map((t) => {
              const q = targetQuest(t, data)
              const max = areaPartySize(data, q?.area)
              const issues = validateParty(t, q, max)
              const run = runs[t.id]
              const markHere = checks.find((c) => c.teamLabel === teamLabel(t) && c.questId === runQuest?.id)
              const shared = [...new Set(t.members.flatMap((m) => (m.heroId ? teamsWithHero(teams, m.heroId, t.id).map((o) => o.name) : [])))]
              return (
                <div key={t.id} className={cn('rounded-lg border p-3', editingId === t.id && 'border-primary/60 bg-primary/5')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckItem
                      checked={selected.includes(t.id)}
                      onChange={(v) => setSelected((cur) => (v ? [...cur, t.id].slice(-3) : cur.filter((x) => x !== t.id)))}
                    >
                      <span className="font-medium">{t.name}</span>
                    </CheckItem>
                    <Badge variant="secondary">
                      {partySizeOf(t)} {t.champion ? 'с чемпионом' : 'без чемпиона'}
                    </Badge>
                    {q ? <Badge variant="outline">{questLabel(q)}</Badge> : <Badge variant="outline">локация не выбрана</Badge>}
                    {issues.length === 0 ? <Badge variant="secondary">состав в порядке</Badge> : <Badge variant="destructive">состав не проходит</Badge>}
                  </div>
                  <p className="mt-2 text-sm">{teamLabel(t) || 'пусто'}</p>
                  {t.champion?.aura || t.champion?.familiar ? (
                    <p className="text-xs text-muted-foreground">
                      {t.champion.aura ? `аура: ${t.champion.aura.item} (${t.champion.aura.quality})` : 'без ауры'}
                      {t.champion.familiar ? ` · фамильяр: ${t.champion.familiar.item} (${t.champion.familiar.quality})` : ''}
                      {t.champion.spirit ? ` · дух: ${t.champion.spirit}` : ''}
                    </p>
                  ) : null}
                  {shared.length > 0 ? <p className="text-xs text-muted-foreground">Герои уже есть в командах: {shared.join(', ')}</p> : null}
                  {issues.map((i) => (
                    <p key={i.code} className="text-xs text-destructive">
                      {i.message}
                    </p>
                  ))}
                  {run ? (
                    <p className="mt-1 text-sm">
                      Прогон: win rate <strong>{pct(run.winRate)}</strong>, раундов {run.avgRounds.toFixed(1)},{' '}
                      {run.quests[0].barrierBroken ? 'барьер пробит' : 'барьер не пробит'}
                    </p>
                  ) : null}
                  {markHere ? <p className="text-xs text-muted-foreground">Отметка: {markHere.passed ? 'прошёл' : 'не прошёл'}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant={editingId === t.id ? 'default' : 'outline'} onClick={() => setEditingId(t.id)}>
                      Изменить
                    </Button>
                    <Tip text="Запустить существующий подбор экипировки для этого состава и чемпиона (откроется страница «Подбор»).">
                      <span>
                        <Button size="sm" variant="outline" disabled={!q} onClick={() => optimizeTeam(t)}>
                          <Sparkles /> Подобрать экипировку
                        </Button>
                      </span>
                    </Tip>
                    <Button size="sm" variant="outline" onClick={() => void deleteTeam(t.id)}>
                      <Trash2 /> Удалить
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {editing ? (
        <Section
          title="Редактор команды"
          description="Изменения применяются к команде по кнопке «Сохранить»."
          action={
            <>
              <Button size="sm" onClick={() => void saveEditing()}>
                <Save /> Сохранить
              </Button>
              <Button size="sm" variant="outline" onClick={refreshMembers}>
                Обновить из героев
              </Button>
            </>
          }
        >
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <Field label="Имя команды">
              <Input value={editing.name} onChange={(e) => patchEditing({ name: e.target.value })} className="w-56" />
            </Field>
            <TargetPicker
              quests={quests}
              areas={areas}
              quest={editingQuest}
              onChange={(q) => patchEditing({ target: q ? { questId: q.id, label: questLabel(q) } : null })}
            />
          </div>

          <h3 className="mb-2 text-sm font-semibold">Герои ({editing.members.length})</h3>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {heroes.map((h) => {
              const on = editing.members.some((m) => m.heroId === h.id || m.hero.id === h.id)
              return (
                <div key={h.id} className={cn('rounded-md border px-3 py-2', on && 'border-primary/60 bg-primary/5')}>
                  <CheckItem
                    checked={on}
                    onChange={(v) =>
                      patchEditing({
                        members: v
                          ? [...editing.members, memberFromHero(h)]
                          : editing.members.filter((m) => m.heroId !== h.id && m.hero.id !== h.id),
                      })
                    }
                  >
                    {h.name} {h.draft ? <DraftBadge /> : null}{' '}
                    <span className="text-muted-foreground">
                      ({h.className} {h.level})
                    </span>
                  </CheckItem>
                </div>
              )
            })}
            {heroes.length === 0 ? <p className="text-sm text-muted-foreground">Героев нет — импортируйте их на странице «Герои» или создайте вручную.</p> : null}
          </div>

          <h3 className="mb-2 text-sm font-semibold">Чемпион</h3>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Field label="Чемпион" hint="В отряде может быть только один чемпион. Его аура усиливает весь отряд.">
              <NativeSelect
                value={editing.champion?.champion ?? ''}
                onChange={(e) => {
                  const name = e.target.value
                  patchEditing({ champion: name ? championBuild(name, editing.champion?.rank ?? 1, editing.champion ?? {}) : null })
                }}
              >
                <NativeSelectOption value="">— без чемпиона —</NativeSelectOption>
                {data.champions.map((c) => (
                  <NativeSelectOption key={c.name} value={c.name}>
                    {c.name} ({c.element})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Ранг">
              <Input
                type="number"
                min={1}
                max={20}
                className="w-20"
                disabled={!editing.champion}
                value={editing.champion?.rank ?? 1}
                onChange={(e) => editing.champion && patchEditing({ champion: { ...editing.champion, rank: Math.max(1, Number(e.target.value) || 1) } })}
              />
            </Field>
            <ChampionGearSelect
              label="Аура"
              qualityLabel="Качество ауры"
              value={editing.champion?.aura ?? null}
              options={gear.auras}
              disabled={!editing.champion}
              onChange={(v) => editing.champion && patchEditing({ champion: { ...editing.champion, aura: v } })}
            />
            <ChampionGearSelect
              label="Фамильяр"
              qualityLabel="Качество фамильяра"
              value={editing.champion?.familiar ?? null}
              options={gear.familiars}
              disabled={!editing.champion}
              onChange={(v) => editing.champion && patchEditing({ champion: { ...editing.champion, familiar: v } })}
            />
            <Field label="Дух в фамильяре" hint="Навык духа действует на носителя; «+»-версия включается сродством фамильяра (A5).">
              <NativeSelect
                className="w-48"
                aria-label="Дух в фамильяре"
                disabled={!editing.champion}
                value={editing.champion?.spirit ?? ''}
                onChange={(e) => editing.champion && patchEditing({ champion: { ...editing.champion, spirit: e.target.value || null } })}
              >
                <NativeSelectOption value="">— без духа —</NativeSelectOption>
                {gear.spirits.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {s}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {editing.champion ? <GearSummary gear={editing.champion} data={data} /> : null}

          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Проверка состава</h3>
              <PartyCheck team={editing} quest={editingQuest} max={areaPartySize(data, editingQuest?.area)} />
            </div>
            <PartyHintsView
              team={editing}
              quest={editingQuest}
              data={data}
              max={areaPartySize(data, editingQuest?.area)}
              state={verify}
              onVerify={(hint, champion) => void verifyChampion(hint, champion)}
            />
          </div>
        </Section>
      ) : null}

      <Section
        title="Прогон и сравнение"
        description="Отметьте 2–3 команды и выберите квест: симуляция покажет win rate, вероятность гибели каждого, средние раунды, барьер и доли ударов босса."
      >
        <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <TargetPicker
            quests={quests}
            areas={areas}
            quest={runQuest}
            label="Квест для прогона"
            noneValue={QUEST_NONE}
            onChange={(q) => setQuestId(q?.id ?? QUEST_NONE)}
          />
          <Field label="Прогонов на квест">
            <span className="text-sm">{TEAM_SIM_RUNS}</span>
          </Field>
          <Tip text="Один и тот же seed для всех команд: разница между командами — не шум симуляции.">
            <span>
              <Button disabled={running || selected.length === 0 || !runQuest} onClick={() => void run()}>
                {running ? <Loader2 className="animate-spin" /> : <Play />} Прогнать выбранные
              </Button>
            </span>
          </Tip>
          {running ? (
            <Button variant="outline" onClick={() => engineRef.current?.cancel()}>
              <X /> Отменить
            </Button>
          ) : null}
        </div>
        {progress ? (
          <div className="mb-3 flex items-center gap-3">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              прогонов {progress.done}/{progress.total}
            </span>
          </div>
        ) : null}
        {selected.length === 0 ? <p className="text-sm text-muted-foreground">Отметьте команды галочками в списке выше.</p> : null}
        {selected.length > 0 && !runQuest ? <Notice tone="warning">Выберите квест для прогона: у выбранных команд не задана локация.</Notice> : null}
        {selected.length > 0 && runQuest ? (
          <ComparisonTable
            teams={teams.filter((t) => selected.includes(t.id))}
            quest={runQuest}
            runs={runs}
            dead={dead}
            setDead={setDead}
            onMark={mark}
          />
        ) : null}
      </Section>
    </Page>
  )
}

/** Выбор целевой локации: область → сложность → тип (общий компонент — src/ui/QuestPicker.tsx). */
function TargetPicker(props: Parameters<typeof QuestPicker>[0]) {
  return <QuestPicker {...props} />
}
/**
 * Выбор предмета экипировки чемпиона (или «нет») вместе с качеством.
 * Поле оборачивает `<select>` в `<label>` — доступное имя равно видимой подписи, без текста опций
 * (иначе поиск по подписи захватывает соседнее поле «Качество»), поэтому обёртка сделана вручную.
 */
function ChampionGearSelect({
  label,
  qualityLabel,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  qualityLabel: string
  value: { item: string; quality: Quality } | null
  options: string[]
  disabled: boolean
  onChange: (v: { item: string; quality: Quality } | null) => void
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <NativeSelect
          className="w-48"
          aria-label={label}
          disabled={disabled}
          value={value?.item ?? ''}
          onChange={(e) => onChange(e.target.value ? { item: e.target.value, quality: value?.quality ?? 'Normal' } : null)}
        >
          <NativeSelectOption value="">— нет —</NativeSelectOption>
          {options.map((o) => (
            <NativeSelectOption key={o} value={o}>
              {o}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Tip text="Качество меняет только DEF/HP предмета — силу ауры оно не меняет (A67).">
          <span className="text-muted-foreground">{qualityLabel}</span>
        </Tip>
        <NativeSelect
          className="w-32"
          aria-label={qualityLabel}
          disabled={disabled || !value}
          value={value?.quality ?? 'Normal'}
          onChange={(e) => value && onChange({ item: value.item, quality: e.target.value as Quality })}
        >
          {QUALITIES.map((q) => (
            <NativeSelectOption key={q} value={q}>
              {q}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
    </>
  )
}

/** Что даёт экипировка чемпиона: статы, эффекты ауры и навык духа. */
function GearSummary({ gear, data }: { gear: TeamChampion; data: GameData }) {
  const s = championGearSummary(gear, data)
  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
      {s.stats ? <p>Экипировка даёт чемпиону: {s.stats}</p> : <p>Экипировка не выбрана.</p>}
      {s.effects.map((e) => (
        <p key={e} className="text-muted-foreground">
          {e}
        </p>
      ))}
      {s.notes.map((n) => (
        <p key={n} className="text-destructive">
          {n}
        </p>
      ))}
    </div>
  )
}

/** Проверка состава команды под выбранную локацию. */
function PartyCheck({ team, quest, max }: { team: Team; quest: Quest | null; max: number | null }) {
  const issues = validateParty(team, quest, max)
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">
        Локация: {quest ? questLabel(quest) : 'не выбрана'}
        {max != null ? ` · в отряд помещается ${max}` : ''} · в команде {partySizeOf(team)}
        {team.champion ? ' (с чемпионом)' : ''}
      </p>
      {issues.length === 0 ? (
        <p className="text-success">Состав проходит проверку.</p>
      ) : (
        issues.map((i) => (
          <p key={i.code} className="text-destructive">
            {i.message}
          </p>
        ))
      )}
    </div>
  )
}

/**
 * Подсказки по составу: правила 1–4 ST-Central (галочка/предупреждение) и пары «чемпион ↔ герой»
 * по признакам героя. У каждой — источник, у советов — кнопка «проверить симуляцией»: подсказка
 * не приговор, решение принимает прогон (требование владельца, сессия 28).
 */
function PartyHintsView({
  team,
  quest,
  data,
  max,
  state,
  onVerify,
}: {
  team: Team
  quest: Quest | null
  data: GameData
  max: number | null
  state: Record<string, VerifyState>
  onVerify: (hint: PartyHint, champion: string) => void
}) {
  const hints = useMemo(() => partyHints(runMembersOf(team), quest, data, { maxPartySize: max }), [team, quest, data, max])
  const tone = (level: PartyHint['level']): string =>
    level === 'warn' ? 'border-destructive/40 bg-destructive/5' : level === 'ok' ? 'border-success/30 bg-success/5' : 'border-border bg-muted/30'
  const label = (level: PartyHint['level']): string => (level === 'warn' ? 'предупреждение' : level === 'ok' ? 'по правилу' : 'совет')
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Подсказки по составу (ST-Central)</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Правила: два героя на стихию барьера, один чемпион, один «красный» (Fighter), остальные — синие/зелёные. Советы по чемпиону — не
        приговор: рядом кнопка «проверить симуляцией», она прогоняет этот состав с текущим чемпионом и с предложенным.
      </p>
      <div className="space-y-2">
        {hints.map((h) => (
          <div key={h.code} className={cn('rounded-md border p-2 text-sm', tone(h.level))}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={h.level === 'warn' ? 'destructive' : 'secondary'}>{label(h.level)}</Badge>
              <span className="font-medium">{h.title}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{h.message}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <a href={h.source} target="_blank" rel="noreferrer" className="underline">
                источник
              </a>
              {(h.verifyChampions ?? []).map((c) => {
                const key = `${h.code}:${c}`
                const v = state[key]
                return (
                  <span key={c} className="flex items-center gap-2">
                    <Tip text="Прогон этого состава с предложенным чемпионом и с текущим — на том же квесте, ранге и экипировке.">
                      <span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!quest || team.members.length === 0 || (v !== undefined && 'pending' in v)}
                          onClick={() => onVerify(h, c)}
                        >
                          {v !== undefined && 'pending' in v ? <Loader2 className="animate-spin" /> : null} проверить симуляцией: {c}
                        </Button>
                      </span>
                    </Tip>
                    {v && 'error' in v ? <span className="text-destructive">{v.error}</span> : null}
                    {v && 'suggested' in v ? (
                      <span>
                        {v.currentName}: <strong>{pct(v.current)}</strong> → {v.champion} (ранг {v.rank}): <strong>{pct(v.suggested)}</strong>
                      </span>
                    ) : null}
                  </span>
                )
              })}
              {!quest ? <span className="text-muted-foreground">выберите локацию, чтобы проверить прогоном</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Сравнение 2–3 команд на одном квесте: win rate, смертность, раунды, барьер и угроза. */
function ComparisonTable({
  teams,
  quest,
  runs,
  dead,
  setDead,
  onMark,
}: {
  teams: Team[]
  quest: Quest
  /** Результаты прогонов по id команды; пусто — команда ещё не прогонялась (таблица показывает «—»). */
  runs: Record<string, TeamRunResult>
  dead: Record<string, string[]>
  setDead: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  onMark: (t: Team, passed: boolean, deadHeroes: string[]) => Promise<void>
}) {
  /** Строки таблицы участников — по первой команде (в остальных тот же порядок: герои, затем чемпион). */
  const rows = [...teams[0].members.map((m) => m.hero.name), ...(teams[0].champion ? [teams[0].champion.champion] : [])]
  const dash = <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Квест: {questLabel(quest)}</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Команда</TableHead>
              <TableHead>Win rate</TableHead>
              <TableHead>Раундов</TableHead>
              <TableHead>Барьер</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => {
              const r = runs[t.id]
              const q = r?.quests[0]
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{teamLabel(t)}</span>
                  </TableCell>
                  <TableCell className="font-medium">{r ? pct(r.winRate) : dash}</TableCell>
                  <TableCell>{r ? r.avgRounds.toFixed(1) : dash}</TableCell>
                  <TableCell className={cn(q?.barrier && !q.barrierBroken && 'text-destructive')}>
                    {!q
                      ? dash
                      : q.barrier
                        ? `${q.barrier.elements.map((e) => ELEMENT_RU[e] ?? e).join('/')}: ${q.barrier.have} из ${q.barrier.need}${q.barrierBroken ? ' — пробит' : ' — не пробит'}`
                        : 'нет барьера'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Участник</TableHead>
              {teams.map((t) => (
                <TableHead key={t.id}>{t.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((name, i) => (
              <TableRow key={`${name}-${i}`}>
                <TableCell>{name}</TableCell>
                {teams.map((t) => {
                  const m = runs[t.id]?.members[i]
                  return (
                    <TableCell key={t.id}>
                      {m ? (
                        <>
                          гибель {pct(m.deathRate)} · доля одиночных ударов {(m.attackShare * 100).toFixed(0)}%
                          {m.element > 0 ? ` · стихия ${m.element}` : ''}
                        </>
                      ) : (
                        dash
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3">
        {teams.map((t) => {
          const names = [...t.members.map((m) => m.hero.name), ...(t.champion ? [t.champion.champion] : [])]
          const deadList = dead[t.id] ?? []
          return (
            <div key={t.id} className="rounded-md border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Users className="size-4 text-muted-foreground" />
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">{runs[t.id] ? `win rate ${pct(runs[t.id].winRate)}` : 'ещё не прогонялась'}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {names.map((n) => (
                  <CheckItem
                    key={n}
                    checked={deadList.includes(n)}
                    onChange={(v) => setDead((cur) => ({ ...cur, [t.id]: v ? [...deadList, n] : deadList.filter((x) => x !== n) }))}
                  >
                    погиб: {n}
                  </CheckItem>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Tip text="Отметка привязывается к команде и попадает в «Данные» → точность модели.">
                  <span>
                    <Button size="sm" variant="outline" onClick={() => void onMark(t, true, deadList)}>
                      прошёл
                    </Button>
                  </span>
                </Tip>
                <Button size="sm" variant="outline" onClick={() => void onMark(t, false, deadList)}>
                  не прошёл
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
