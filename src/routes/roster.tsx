/**
 * Страница «Ростер»: стихийные барьеры, план команд на локацию и анализ ростера (требования владельца,
 * сессия 28).
 *
 * Разделы:
 *   · «Барьеры» — таблица локация × сложность: стихии барьера и требуемая величина (QUESTS →
 *     Barrier Type/Health), вклад героев и чемпионов ростера (Spellblade — 50%, Rudo — +50% стихии
 *     отряда), готовые барьерные пары и сколько таких отрядов можно собрать; если стихии не хватает —
 *     чего именно не хватает и чем добрать;
 *   · «План команд на локацию» — выбор локации и сложности → максимум отрядов из ростера (каждый герой
 *     и чемпион ровно в одной команде): жадный сбор по правилам 1–4, затем улучшение обменами по
 *     симуляции. Считается в Web Worker с прогрессом и отменой;
 *   · «Анализ ростера» — героев и архетипов на стихию, бойцы против слотов квестов, синие против зелёных
 *     и совет «что нанять следующим».
 *
 * Источники правил — ST-Central «Team Building, Not Guesswork» и «Foster Your Roster» (ссылки в подсказках
 * и в constants.ts → RULES_*).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Play, Save, X } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table.tsx'
import { loadHeroes } from '#/data/heroStore.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { championBuild, loadTeams, memberFromHero, newTeam, upsertTeam, type Team } from '#/data/teams.ts'
import type { GameData, HeroInstance, Quest } from '#/data/types.ts'
import { areaIconId, classIconId, difficultyIconId } from '#/data/images.ts'
import { ChampionIcon, GameIcon } from '#/ui/GameIcon.tsx'
import { ElementIcon } from '#/ui/heroes/heroStatTable.tsx'
import { ELEMENT_RU, barrierReports, contributionTo, maxElementStone, rosterContributions, type BarrierElementReport, type BarrierReport } from '#/engine/barriers.ts'
import { PLAN_WIN_THRESHOLD, RULES_DEVELION_URL, RULES_ROSTER_URL, RULES_TEAM_URL } from '#/engine/constants.ts'
import { questLabel } from '#/engine/optimizer.ts'
import type { PowerBoosterId } from '#/engine/combat.ts'
import { rosterReport, type RosterReport } from '#/engine/roster.ts'
import { QUEST_VARIANT_RU } from '#/engine/teamRunner.ts'
import { planTeams, type PlanObjective, type PlannedTeam, type TeamPlanResult } from '#/engine/teamPlan.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { Tip } from '#/ui/Hint.tsx'
import { QuestPicker } from '#/ui/QuestPicker.tsx'
import { PowerBoosterPicker } from '#/ui/PowerBoosterPicker.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'

export const Route = createFileRoute('/roster')({ component: RosterPage })

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const elementRu = (el: string): string => ELEMENT_RU[el] ?? el

function RosterPage() {
  const data = useGameData()
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [savedTeams, setSavedTeams] = useState<Team[]>([])
  /** Правки рангов чемпионов пользователем; базовые значения выводятся из данных и сохранённых команд. */
  const [rankOverrides, setRankOverrides] = useState<Record<string, number>>({})
  const [questSlots, setQuestSlots] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [selectedBarrier, setSelectedBarrier] = useState<string | null>(null)
  const [planQuestId, setPlanQuestId] = useState('')
  /** Усилитель силы квеста на весь отряд (A74) — для плана команд. */
  const [booster, setBooster] = useState<PowerBoosterId>('none')
  const [objective, setObjective] = useState<PlanObjective>('sum')
  const [threshold, setThreshold] = useState(String(Math.round(PLAN_WIN_THRESHOLD * 100)))
  const [plan, setPlan] = useState<TeamPlanResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void loadHeroes().then((r) => setHeroes(r.heroes))
    void loadTeams().then((r) => setSavedTeams(r.teams))
  }, [])

  // Ранги чемпионов: по умолчанию 1, но если чемпион уже стоит в сохранённой команде — берём его ранг оттуда.
  // Это производное значение, а не состояние: эффект с setState давал бы лишний каскад перерисовок.
  const ranks = useMemo(() => {
    const base: Record<string, number> = {}
    if (!data) return base
    for (const c of data.champions) base[c.name] = 1
    for (const t of savedTeams) {
      if (t.champion) base[t.champion.champion] = Math.max(base[t.champion.champion] ?? 1, t.champion.rank)
    }
    return { ...base, ...rankOverrides }
  }, [data, savedTeams, rankOverrides])

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const areas = useMemo(() => [...new Set(quests.map((q) => q.area))], [quests])
  const contributions = useMemo(() => (data ? rosterContributions(data, heroes, ranks) : []), [data, heroes, ranks])
  const reports = useMemo(() => (data ? barrierReports(data, quests, contributions) : []), [data, quests, contributions])
  const visibleReports = useMemo(() => (areaFilter ? reports.filter((r) => r.quest.area === areaFilter) : reports), [reports, areaFilter])
  const detail = reports.find((r) => r.quest.id === selectedBarrier) ?? null
  const roster = useMemo(
    () => (data ? rosterReport(data, heroes, { questSlots: questSlots.trim() === '' ? undefined : Math.max(0, Number(questSlots) || 0) }) : null),
    [data, heroes, questSlots],
  )
  const planQuest = quests.find((q) => q.id === planQuestId) ?? null

  /** Чемпионы, которых считаем доступными: ранг ≥ 1 (ранг 0 — «чемпиона нет»). */
  const champions = useMemo(() => Object.entries(ranks).filter(([, r]) => r >= 1).map(([name, rank]) => ({ name, rank })), [ranks])

  async function buildPlan(): Promise<void> {
    if (!data || !planQuest || heroes.length === 0) return
    setRunning(true)
    setError(null)
    setPlan(null)
    setProgress({ done: 0, total: 0 })
    try {
      const input = {
        quest: planQuest,
        heroes,
        champions,
        objective,
        threshold: Math.max(0, Math.min(1, (Number(threshold) || 50) / 100)),
        powerBooster: booster,
      }
      const engine = engineRef.current
      // Тяжёлый перебор симуляций — в воркере; синхронный вызов только как запасной (воркера нет вовсе).
      setPlan(engine ? await engine.planTeams(data, input, (done, total) => setProgress({ done, total })) : planTeams({ ...input, data }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  /** Сохранить план в «Команды»: по команде на отряд, с целевой локацией и чемпионом. */
  async function savePlan(): Promise<void> {
    if (!plan || !planQuest) return
    let next = savedTeams
    for (const [i, t] of plan.teams.entries()) {
      next = await upsertTeam({
        ...newTeam(crypto.randomUUID()),
        name: `План ${i + 1}: ${planQuest.area} · ${planQuest.difficulty}`,
        members: t.members.map(memberFromHero),
        champion: t.champion ? championBuild(t.champion.name, t.champion.rank) : null,
        target: { questId: planQuest.id, label: questLabel(planQuest) },
        note: `Собран планом команд (${plan.objective === 'sum' ? 'сумма win rate' : `win rate ≥ ${Math.round(plan.threshold * 100)}%`}).`,
      })
    }
    setSavedTeams(next)
    setNote(`План сохранён в «Команды»: ${plan.teams.length} команд(ы). Экипировку чемпиона добавьте там же.`)
  }

  if (!data) {
    return (
      <Page title="Ростер">
        <p className="text-sm text-muted-foreground">Загружаю данные…</p>
      </Page>
    )
  }

  const progressPct = progress && progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0

  return (
    <Page
      title="Ростер"
      description="Стихийные барьеры локаций, план команд на локацию и анализ ростера. Правила — ST-Central («Team Building, Not Guesswork», «Foster Your Roster») и гайд Develion; у каждой подсказки указан источник."
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {note ? <Notice tone="success">{note}</Notice> : null}

      <Section
        title="Барьеры"
        description="Строка на каждую локацию и сложность с барьером: стихии и требуемая величина из листа QUESTS, что даёт ростер (герои своей стихией, Spellblade — 50% любой, чемпионы — стихией по рангу) и сколько барьерных пар можно собрать."
      >
        <ChampionRanks data={data} ranks={ranks} onChange={(name, rank) => setRankOverrides((cur) => ({ ...cur, [name]: rank }))} />
        <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <Field label="Локация">
            <NativeSelect className="w-52" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <NativeSelectOption value="">все локации</NativeSelectOption>
              {areas.map((a) => (
                <NativeSelectOption key={a} value={a}>
                  {a}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <span className="text-xs text-muted-foreground">
            Квестов с барьером: {visibleReports.length} из {reports.length}. Источник правила пар:{' '}
            <a href={RULES_TEAM_URL} target="_blank" rel="noreferrer" className="underline">
              ST-Central «Team Building, Not Guesswork»
            </a>
            .
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Локация</TableHead>
                <TableHead>Сложность</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Стихия барьера</TableHead>
                <TableHead>Нужно</TableHead>
                <TableHead>Лучшая пара</TableHead>
                <TableHead>Пар хватает</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleReports.map((r) => {
                const best = bestElement(r)
                const ok = best ? best.bestPair >= best.need : false
                return (
                  <TableRow key={r.quest.id} className={cn(selectedBarrier === r.quest.id && 'bg-primary/5')}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <GameIcon kind="area" id={areaIconId(r.quest.area)} label={r.quest.area} size={20} decorative />
                        {r.quest.area}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <GameIcon kind="difficulty" id={difficultyIconId(r.quest.difficulty)} label={r.quest.difficulty} size={18} decorative />
                        {r.quest.difficulty}
                      </span>
                    </TableCell>
                    <TableCell>{QUEST_VARIANT_RU[r.quest.variant]}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.elements.map((e, k) => (
                          <span key={e.element} className="inline-flex items-center gap-1">
                            {k > 0 ? ' / ' : ''}
                            <ElementIcon element={e.element} size={16} decorative />
                            {elementRu(e.element)}
                          </span>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>{best?.need ?? '—'}</TableCell>
                    <TableCell className={cn(!ok && 'text-destructive')}>
                      {best ? `${elementRu(best.element)}: ${best.bestPair}` : '—'}
                      {best && best.bestPair * (r.bonus ? 1 + r.bonus.pct / 100 : 1) >= best.need && !ok ? ' (с бонусом чемпиона)' : ''}
                    </TableCell>
                    <TableCell>
                      {best ? `${best.disjointPairs}${r.bonus ? ` (${best.disjointPairsWithBonus} с ${r.bonus.champion})` : ''}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedBarrier(selectedBarrier === r.quest.id ? null : r.quest.id)}>
                        {selectedBarrier === r.quest.id ? 'Свернуть' : 'Разобрать'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {detail ? (
          <BarrierDetail
            report={detail}
            data={data}
            onPlan={() => {
              setPlanQuestId(detail.quest.id)
              setNote(`Квест для плана: ${questLabel(detail.quest)}.`)
            }}
          />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Нажмите «Разобрать» у строки — покажу вкладчиков стихии, готовые пары и чего не хватает.</p>
        )}
      </Section>

      <Section
        title="План команд на локацию"
        description="Максимум отрядов из ростера: каждый герой и чемпион — ровно в одной команде. Сначала жадный сбор по правилам 1–4 (барьер и чемпионы-добытчики в первую очередь), затем улучшение обменами героев по симуляции."
      >
        <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <QuestPicker
            quests={quests}
            areas={areas}
            quest={planQuest}
            label="Локация плана"
            onChange={(q) => setPlanQuestId(q?.id ?? '')}
          />
          <PowerBoosterPicker value={booster} onChange={setBooster} />
          <Field label="Цель улучшения">
            <NativeSelect className="w-56" value={objective} onChange={(e) => setObjective(e.target.value as PlanObjective)}>
              <NativeSelectOption value="sum">сумма win rate команд</NativeSelectOption>
              <NativeSelectOption value="threshold">число команд с win rate ≥ порога</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label="Порог win rate, %">
            <Input className="w-20" type="number" min={0} max={100} disabled={objective !== 'threshold'} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <Tip text="Считается в фоновом потоке (Web Worker): прогресс и отмена — рядом. Экипировку чемпиона план не задаёт.">
            <span>
              <Button disabled={running || !planQuest || heroes.length === 0} onClick={() => void buildPlan()}>
                {running ? <Loader2 className="animate-spin" /> : <Play />} Построить план
              </Button>
            </span>
          </Tip>
          {running ? (
            <Button variant="outline" onClick={() => engineRef.current?.cancel()}>
              <X /> Отменить
            </Button>
          ) : null}
        </div>
        {heroes.length === 0 ? <Notice tone="warning">Героев нет — импортируйте их на странице «Герои» или создайте вручную.</Notice> : null}
        {progress && running ? (
          <div className="mb-3 flex items-center gap-3">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              симуляций {progress.done}/{progress.total || '…'}
            </span>
          </div>
        ) : null}
        {plan ? <PlanView plan={plan} quest={planQuest} data={data} onSave={() => void savePlan()} /> : null}
      </Section>

      <Section
        title="Анализ ростера"
        description="Правила «Foster Your Roster»: 3+ героя на стихию (Spellblade не считается), 2+ архетипа на стихию, бойцов столько же, сколько слотов квестов, синих и зелёных примерно поровну."
      >
        {roster ? <RosterView report={roster} questSlots={questSlots} onQuestSlots={setQuestSlots} /> : null}
      </Section>
    </Page>
  )
}

/** Лучшая стихия барьера строки: та, где пара даёт больше всего (её и показываем в таблице). */
function bestElement(report: BarrierReport): BarrierElementReport | null {
  return [...report.elements].sort((a, b) => b.bestPair - a.bestPair)[0] ?? null
}

/** Ранги чемпионов: стихия чемпиона растёт с рангом (Element Breakpoints, A13). Ранг 0 — чемпиона нет. */
function ChampionRanks({ data, ranks, onChange }: { data: GameData; ranks: Record<string, number>; onChange: (name: string, rank: number) => void }) {
  return (
    <details className="mb-3 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Ранги чемпионов (от них зависит вклад в стихию барьера)</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Стихия чемпиона появляется с 5-го ранга и растёт по таблице Element Breakpoints (A13). Ранг 0 — чемпиона в ростере нет. По умолчанию берётся
        ранг из сохранённых команд.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {data.champions.map((c) => (
          <label key={c.name} className="flex items-center gap-2 text-sm">
            <ChampionIcon data={data} name={c.name} size={26} decorative />
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {c.name} <ElementIcon element={c.element} size={14} decorative /> ({elementRu(c.element)})
            </span>
            <Input
              className="w-16"
              type="number"
              min={0}
              max={20}
              aria-label={`Ранг чемпиона ${c.name}`}
              value={ranks[c.name] ?? 1}
              onChange={(e) => onChange(c.name, Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
            />
          </label>
        ))}
      </div>
    </details>
  )
}

/** Разбор одной строки таблицы барьеров: вкладчики стихии, готовые пары и чего не хватает. */
function BarrierDetail({ report, data, onPlan }: { report: BarrierReport; data: GameData; onPlan: () => void }) {
  return (
    <div className="mt-4 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{questLabel(report.quest)}</span>
        <Badge variant="secondary">отряд до {report.partySize}</Badge>
        {report.bonus ? (
          <Badge variant="outline">
            {report.bonus.champion}: +{report.bonus.pct}% к стихии отряда
          </Badge>
        ) : null}
        <Button size="sm" variant="outline" onClick={onPlan}>
          Построить план на этот квест
        </Button>
      </div>
      {report.elements.map((el) => (
        <div key={el.element} className="mb-3">
          <p>
            <ElementIcon element={el.element} size={16} decorative /> <strong>{elementRu(el.element)}</strong>: нужно {el.need}, лучшая пара даёт {el.bestPair}
            {el.missing > 0 ? <span className="text-destructive"> — не хватает {el.missing}</span> : <span className="text-success"> — хватает</span>}
            {' · '}
            пар хватает: {el.disjointPairs}
            {report.bonus ? ` (${el.disjointPairsWithBonus} с ${report.bonus.champion})` : ''}
            {' · '}
            отряд из {report.partySize} даёт {el.bestParty}
          </p>
          {el.contributors.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Вкладчики: {el.contributors.slice(0, 8).map((c) => `${c.name}${c.kind === 'champion' ? ' (чемпион)' : ''} ${Math.round(contributionTo(c, el.element))}${c.element === null ? ' (50%, любая стихия)' : ''}`).join(' · ')}
              {el.contributors.length > 8 ? ` · и ещё ${el.contributors.length - 8}` : ''}
            </p>
          ) : (
            <p className="text-xs text-destructive">В ростере нет ни одного бойца этой стихии.</p>
          )}
          {el.pairs.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Готовые пары: {el.pairs.slice(0, 6).map((p) => `${p.a} + ${p.b} = ${p.value}${p.reaches ? '' : ' (только с бонусом чемпиона)'}`).join(' · ')}
              {el.pairsTotal > 6 ? ` · всего пар: ${el.pairsTotal}` : ''}
            </p>
          ) : null}
          {el.advice.length > 0 ? <p className="text-xs text-destructive">{el.advice.join(' ')}</p> : null}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Механика: непробитый барьер снижает урон отряда на 80% (A9); «Any»-класс (Spellblade) засчитывается на 50%; бонус чемпиона умножает стихию
        всего отряда. Крупнейший камень стихии в данных:{' '}
        {report.elements
          .map((el) => {
            const s = maxElementStone(data, el.element)
            return s ? `${elementRu(el.element)} — «${s.name}»${s.tier ? ` (T${s.tier})` : ''} (+${s.value})` : null
          })
          .filter(Boolean)
          .join(', ')}
        .
      </p>
    </div>
  )
}

/** План: сводка, отряды (состав, чемпион, win rate, барьер, подсказки) и кнопка сохранения в «Команды». */
function PlanView({ plan, quest, data, onSave }: { plan: TeamPlanResult; quest: Quest | null; data: GameData; onSave: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">отрядов: {plan.teams.length}</Badge>
        <Badge variant="secondary">по {plan.partySize} бойца</Badge>
        <Badge variant="outline">средний win rate: {pct(plan.sumWinRate)}</Badge>
        <Badge variant="outline">
          команд с win rate ≥ {Math.round(plan.threshold * 100)}%: {plan.teamsAbove}
        </Badge>
        <Badge variant="outline">симуляций: {plan.sims}</Badge>
        {plan.undersized ? <Badge variant="destructive">есть неполные отряды</Badge> : null}
        {plan.cancelled ? <Badge variant="destructive">расчёт отменён</Badge> : null}
        <Button size="sm" variant="outline" disabled={plan.teams.length === 0 || !quest} onClick={onSave}>
          <Save /> Сохранить в «Команды»
        </Button>
      </div>
      {plan.notes.length > 0 ? (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {plan.teams.map((t, i) => (
          <PlanTeamCard key={`${i}-${t.members.map((m) => m.id).join(',')}`} team={t} index={i} data={data} />
        ))}
      </div>
      {plan.leftover.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Вне плана остались: {plan.leftover.map((h) => h.name).join(', ')} — мест в отрядах не хватило.
        </p>
      ) : null}
      {plan.unusedChampions.length > 0 ? <p className="text-sm text-muted-foreground">Чемпионы без отряда: {plan.unusedChampions.join(', ')}.</p> : null}
    </div>
  )
}

function PlanTeamCard({ team, index, data }: { team: PlannedTeam; index: number; data: GameData }) {
  const warns = team.hints.filter((h) => h.level === 'warn')
  const advice = team.hints.filter((h) => h.level === 'info' && (h.verifyChampions?.length ?? 0) > 0)
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Отряд {index + 1}</span>
        <Badge variant="secondary">{team.members.length + (team.champion ? 1 : 0)} бойца</Badge>
        {team.champion ? (
          <Badge variant="outline" className="gap-1">
            <ChampionIcon data={data} name={team.champion.name} size={16} decorative />
            {team.champion.name} (ранг {team.champion.rank})
          </Badge>
        ) : (
          <Badge variant="outline">без чемпиона</Badge>
        )}
        <Badge variant={team.winRate !== null && team.winRate >= 0.5 ? 'secondary' : 'destructive'}>
          win rate: {team.winRate === null ? '—' : pct(team.winRate)}
        </Badge>
        {team.avgRounds !== null ? <span className="text-xs text-muted-foreground">раундов {team.avgRounds.toFixed(1)}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {team.members.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-2 pl-0.5 text-xs">
            <GameIcon kind="class" id={classIconId(m.className)} label={m.className} size={22} decorative />
            {m.name} ({m.className} {m.level})
          </span>
        ))}
      </div>
      {team.barrier ? (
        <p className={cn('text-xs', team.barrier.broken ? 'text-muted-foreground' : 'text-destructive')}>
          Барьер {team.barrier.elements.map(elementRu).join('/')}: {team.barrier.have} из {team.barrier.need}
          {team.barrier.broken ? ' — пробит' : ' — не пробит'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">У квеста нет стихийного барьера.</p>
      )}
      {warns.map((h) => (
        <p key={h.code} className="text-xs text-destructive">
          {h.title}: {h.message}{' '}
          <a href={h.source} target="_blank" rel="noreferrer" className="underline">
            источник
          </a>
        </p>
      ))}
      {advice.map((h) => (
        <p key={h.code} className="text-xs text-muted-foreground">
          {h.title}: {h.verifyChampions?.join('/')} — {h.message}{' '}
          <a href={h.source} target="_blank" rel="noreferrer" className="underline">
            источник
          </a>
        </p>
      ))}
      {team.notes.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
          {team.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Анализ ростера: таблица по стихиям, факты и советы «что нанять следующим». */
function RosterView({ report, questSlots, onQuestSlots }: { report: RosterReport; questSlots: string; onQuestSlots: (v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Стихия</TableHead>
              <TableHead>Героев</TableHead>
              <TableHead>Дают стихию (с камнями)</TableHead>
              <TableHead>Архетипы</TableHead>
              <TableHead>Не хватает</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.elements.map((row) => (
              <TableRow key={row.element}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <ElementIcon element={row.element} size={16} decorative />
                    {row.element === 'Any' ? 'Any (Spellblade)' : elementRu(row.element)}
                  </span>
                </TableCell>
                <TableCell className={cn(row.missingHeroes > 0 && 'text-warning')}>{row.heroes}</TableCell>
                <TableCell>{row.element === 'Any' ? '—' : row.withElement}</TableCell>
                <TableCell>{row.archetypes.join(', ') || '—'}</TableCell>
                <TableCell className="text-xs">
                  {row.element === 'Any' ? 'за стихию не считается' : `${row.missingHeroes > 0 ? `героев ${row.missingHeroes}` : ''}${row.missingHeroes > 0 && row.missingArchetypes.length > 0 ? ', ' : ''}${row.missingArchetypes.length > 0 ? `архетип: ${row.missingArchetypes.join('/')}` : ''}` || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
        <span>
          Бойцов (Fighter): <strong>{report.fighters}</strong> · разбойников: <strong>{report.rogues}</strong> · заклинателей: <strong>{report.spellcasters}</strong>
        </span>
        <Field label="Слотов квестов" hint="Сколько походов вы ведёте одновременно: бойцов нужно столько же. По умолчанию — сколько отрядов набирается из ростера.">
          <Input
            className="w-20"
            type="number"
            min={0}
            max={report.maxQuestSlots}
            placeholder={String(report.questSlots)}
            value={questSlots}
            onChange={(e) => onQuestSlots(e.target.value)}
          />
        </Field>
        <span className="text-xs text-muted-foreground">
          В игре максимум {report.maxQuestSlots} слотов квестов; из ростера набирается {report.parties} отряд(а) по {report.partySize} бойца.
        </span>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Что нанять следующим</h3>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {report.advice.map((a) => (
            <li key={a.message} className={cn(a.level === 'warn' && 'text-destructive', a.level === 'ok' && 'text-muted-foreground')}>
              {a.message}{' '}
              <a href={a.source} target="_blank" rel="noreferrer" className="text-xs underline">
                источник
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Совет по классам — гайд Develion:{' '}
          <a href={RULES_DEVELION_URL} target="_blank" rel="noreferrer" className="underline">
            «Гайд по героям и защитникам Shop Titans 2.0»
          </a>
          ; правила ростера —{' '}
          <a href={RULES_ROSTER_URL} target="_blank" rel="noreferrer" className="underline">
            ST-Central «Foster Your Roster»
          </a>
          .
        </p>
      </div>
    </div>
  )
}
