/**
 * Блок «Что отметить» на «Данных»: квесты, где варианты допущений калибровки (A57: суммирование %,
 * крит по отрицательному EVA, кривая защиты, AoE…) сильнее всего расходятся по win rate для
 * выбранных героев. Отметка «проходит / не проходит» на таком квесте лучше всего различит варианты.
 * Расчёт — `calibration.ts → questsToCheck` в воркере.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { loadHeroes } from '#/data/heroStore.ts'
import { areaIconId } from '#/data/images.ts'
import { loadRealityChecks, teamMembers } from '#/data/realityChecks.ts'
import { questsWithCaps } from '#/data/sync.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import type { QuestCheckSuggestion } from '#/engine/calibration.ts'
import { CHECK_SUGGEST_MIN_SPREAD, CHECK_SUGGEST_TOP } from '#/engine/constants.ts'
import { questLabel } from '#/engine/optimizer.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Tip } from '#/ui/Hint.tsx'
import { Field, Notice, Section } from '#/ui/layout.tsx'
import { pct } from '#/ui/optimize/format.ts'

/** Сколько героев в отряде (как на «Подборе»). */
const MAX_TEAM = 3

export function CheckSuggestionsView({ data }: { data: GameData }) {
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const quests = useMemo(() => questsWithCaps(data).quests, [data])
  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [team, setTeam] = useState<string[]>([])
  const [champ, setChamp] = useState('')
  const [champRank, setChampRank] = useState(1)

  // По умолчанию — отряд последней отметки (то, что пользователь реально водит), иначе первые герои.
  useEffect(() => {
    void Promise.all([loadHeroes(), loadRealityChecks()]).then(([h, c]) => {
      setHeroes(h.heroes)
      const last = [...c.checks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
      const members = last ? teamMembers(last.teamLabel) : []
      const fromCheck = members.filter((m) => h.heroes.some((x) => x.name === m)).slice(0, MAX_TEAM)
      setTeam(fromCheck.length > 0 ? fromCheck : h.heroes.slice(0, MAX_TEAM).map((x) => x.name))
      const champName = members.find((m) => data.champions.some((ch) => ch.name === m))
      if (champName) setChamp(champName)
    })
  }, [data])

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ rows: QuestCheckSuggestion[]; team: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function compute(): Promise<void> {
    const engine = engineRef.current
    const selected = team.map((n) => heroes.find((h) => h.name === n)).filter((h): h is HeroInstance => h !== undefined)
    if (!engine || selected.length === 0) {
      setError('Выберите хотя бы одного героя.')
      return
    }
    setError(null)
    setRunning(true)
    setProgress({ done: 0, total: quests.length })
    try {
      const champion = champ ? { name: champ, rank: Math.max(1, champRank) } : null
      const rows = await engine.questsToCheck(data, quests, selected, champion, (done, total) => setProgress({ done, total }))
      setResult({ rows, team: [...selected.map((h) => h.name), champ].filter(Boolean).join(' + ') })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <Section
      title="Что отметить"
      description={
        <>
          Квесты, где допущения модели (как складываются % ауры, крит по отрицательному уклонению, кривая защиты, AoE и др.) дают для
          ваших героев самый разный шанс победы. Один бой там и отметка «проходит / не проходит» с погибшими на «Подборе» скажут о
          модели больше, чем десяток боёв, где любой вариант обещает 100 %.
        </>
      }
    >
      {heroes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Сначала добавьте героев на странице «Герои».</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">Отряд (до {MAX_TEAM}):</span>
            {heroes.map((h) => {
              const on = team.includes(h.name)
              return (
                <label key={h.id} className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    aria-label={`в отряд для «Что отметить»: ${h.name}`}
                    checked={on}
                    disabled={!on && team.length >= MAX_TEAM}
                    onCheckedChange={(v) => setTeam((cur) => (v === true ? [...cur, h.name] : cur.filter((x) => x !== h.name)))}
                  />
                  <span>{h.name}</span>
                </label>
              )
            })}
          </div>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Чемпион" hint="Чемпион сильно меняет шанс победы — укажите того, с кем пойдёте в бой.">
              <NativeSelect value={champ} onChange={(e) => setChamp(e.target.value)}>
                <NativeSelectOption value="">— без чемпиона —</NativeSelectOption>
                {data.champions.map((c) => (
                  <NativeSelectOption key={c.name} value={c.name}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {champ ? (
              <Field label="Ранг чемпиона">
                <Input type="number" min={1} className="w-20" value={champRank} onChange={(e) => setChampRank(Math.max(1, Math.round(Number(e.target.value)) || 1))} />
              </Field>
            ) : null}
            <Tip text="Прогнать все квесты базовой моделью и каждым вариантом допущений (несколько секунд в фоне) и показать, где они расходятся сильнее всего.">
              <span>
                <Button disabled={running || team.length === 0} onClick={() => void compute()}>
                  {running ? <Loader2 className="animate-spin" /> : <Sparkles />} Найти бои для проверки
                </Button>
              </span>
            </Tip>
          </div>
          {progress ? <Progress className="mb-3" value={Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)} /> : null}
        </>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {result ? (
        result.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Для отряда «{result.team}» все варианты допущений сходятся на всех квестах (разброс меньше {pct(CHECK_SUGGEST_MIN_SPREAD)}) — отметки здесь модель
            не различат.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              Топ-{Math.min(CHECK_SUGGEST_TOP, result.rows.length)} для отряда «{result.team}» (экипировка — как сейчас надета у героев):
            </p>
            <ol className="divide-y rounded-lg border text-sm">
              {result.rows.map((r, i) => (
                <li key={r.quest.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-5 text-muted-foreground">{i + 1}.</span>
                  <GameIcon kind="area" id={areaIconId(r.quest.area)} label={r.quest.area} size={24} />
                  <span className="font-medium">{questLabel(r.quest)}</span>
                  <Tip text="Разброс шанса победы между вариантами модели: чем больше, тем больше скажет один бой.">
                    <span className="text-muted-foreground">разброс {pct(r.spread)}</span>
                  </Tip>
                  <span className="basis-full pl-8 text-muted-foreground">
                    сейчас модель даёт {pct(r.baseWinRate)}; если «{r.variant.label}» — {pct(r.variantWinRate)}.{' '}
                    <b className="text-foreground">
                      Этот бой лучше всего проверит {r.variant.assumption}: {r.variant.label}.
                    </b>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )
      ) : null}
    </Section>
  )
}
