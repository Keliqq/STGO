import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group.tsx'
import { areaIconId, difficultyIconId } from '#/data/images.ts'
import { loadHeroes } from '#/data/heroStore.ts'
import { loadConstraintOverrides, saveConstraintOverrides } from '#/data/optimizeSettings.ts'
import { addRealityCheck, loadRealityChecks, type RealityCheck } from '#/data/realityChecks.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { QUALITIES, type HeroInstance, type Quality, type Quest } from '#/data/types.ts'
import {
  defaultConstraints,
  NO_OVERRIDES,
  perHeroTierNote,
  resolveConstraints,
  upgradeOutcome,
  upgradeScenarios,
  type ConstraintOverrides,
} from '#/engine/constraints.ts'
import { applyHeroConfig, questLabel, type OptimizerInput, type OptimizerResult } from '#/engine/optimizer.ts'
import { ENGINE_MODEL_VERSION, SEED_STAT_PER_SEED } from '#/engine/constants.ts'
import type { SkillAdviceResult } from '#/engine/skills.ts'
import { seedAdviceFromWeights, type SeedAdvice } from '#/engine/statWeights.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Tip } from '#/ui/Hint.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'
import { RealityChecksView } from '#/ui/optimize/RealityChecksView.tsx'
import { ResultView } from '#/ui/optimize/ResultView.tsx'
import { SimpleResultView } from '#/ui/optimize/SimpleResultView.tsx'
import { SkillAdviceView } from '#/ui/optimize/SkillAdviceView.tsx'
import { UpgradeView, type UpgradeRow } from '#/ui/optimize/UpgradeView.tsx'

export const Route = createFileRoute('/optimize')({ component: OptimizePage })

const DIFFS = ['Easy', 'Medium', 'Hard', 'Extreme'] as const

/** Контекст, с которым был запущен подбор: результат показывается по нему, а не по текущему состоянию формы. */
interface RunContext {
  team: HeroInstance[]
  teamLabel: string
  quest: Quest | null
  objectiveLabel: string
}

/** Чекбокс с подписью (label оборачивает — e2e находят его через getByLabel). */
function CheckItem({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{children}</span>
    </label>
  )
}

/** Название области с иконкой из игры. */
function AreaLabel({ area, size = 24 }: { area: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <GameIcon kind="area" id={areaIconId(area)} label={area} size={size} />
      {area}
    </span>
  )
}

function RadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <RadioGroupItem value={value} />
      <span>{children}</span>
    </label>
  )
}

const toggle = (list: string[], v: string, on: boolean): string[] => (on ? [...list, v] : list.filter((x) => x !== v))

/** Число с режимом «по умолчанию»: пустое поле = значение по умолчанию (оно же в placeholder). */
function OverrideNumber({ value, auto, min, onChange }: { value: number | null; auto: number; min: number; onChange: (v: number | null) => void }) {
  return (
    <Input
      type="number"
      min={min}
      className="w-20"
      placeholder={String(auto)}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(min, Math.round(Number(e.target.value)) || min))}
    />
  )
}

function OptimizePage() {
  const data = useGameData()
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [checks, setChecks] = useState<RealityCheck[]>([])
  const [overrides, setOverrides] = useState<ConstraintOverrides>(NO_OVERRIDES)
  useEffect(() => {
    void loadHeroes().then((r) => setHeroes(r.heroes))
    void loadRealityChecks().then((r) => setChecks(r.checks))
    void loadConstraintOverrides().then(setOverrides)
  }, [])

  const [selHeroes, setSelHeroes] = useState<string[]>([])
  const [champ, setChamp] = useState('')
  const [champRank, setChampRank] = useState(1)
  const [mode, setMode] = useState<'quest' | 'universal'>('quest')
  const [questId, setQuestId] = useState('')
  const [questDiff, setQuestDiff] = useState<string>('Hard')
  const [questVariant, setQuestVariant] = useState<'normal' | 'boss'>('boss')
  const [uniDiff, setUniDiff] = useState<string>('Hard')
  const [uniVariant, setUniVariant] = useState<'normal' | 'boss'>('boss')
  const [uniAreas, setUniAreas] = useState<string[]>([])
  const [robust, setRobust] = useState(false)
  const [titanSoul, setTitanSoul] = useState<'as-is' | 'on' | 'off'>('as-is')
  const [levelOverride, setLevelOverride] = useState('')

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ res: OptimizerResult; fromCache: boolean; ctx: RunContext } | null>(null)
  const [advice, setAdvice] = useState<SkillAdviceResult | null>(null)
  /** Совет по семенам — из весов статов (см. ResultView), отдельной симуляции не требует. */
  const [seeds, setSeeds] = useState<(SeedAdvice & { heroIndex: number })[] | undefined>(undefined)
  const [upgrades, setUpgrades] = useState<UpgradeRow[] | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const cancelRequested = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const questAreas = useMemo(() => [...new Set(quests.map((q) => q.area))], [quests])
  const selectedQuest = useMemo(() => quests.find((q) => q.id === questId) ?? null, [quests, questId])
  const pickQuestParams = (diff: string, variant: 'normal' | 'boss') => {
    setQuestDiff(diff)
    setQuestVariant(variant)
    const area = selectedQuest?.area
    setQuestId(quests.find((q) => q.area === area && q.difficulty === diff && q.variant === variant)?.id ?? '')
  }
  const pickQuestArea = (area: string) => {
    const inArea = quests.filter((q) => q.area === area)
    const q = inArea.find((x) => x.difficulty === questDiff && x.variant === questVariant) ?? inArea[0]
    if (!q) return
    setQuestId(q.id)
    setQuestDiff(q.difficulty)
    setQuestVariant(q.variant)
  }
  const spirits = useMemo(() => (data ? data.enchants.filter((e) => e.kind === 'spirit').map((e) => e.name) : []), [data])
  const uniAreaList = useMemo(
    () => [...new Set(quests.filter((q) => q.difficulty === uniDiff && q.variant === uniVariant).map((q) => q.area))],
    [quests, uniDiff, uniVariant],
  )
  const selectedTeam = useMemo(() => heroes.filter((h) => selHeroes.includes(h.id)), [heroes, selHeroes])
  const defaults = useMemo(() => (data ? defaultConstraints(data, selectedTeam, titanSoul) : null), [data, selectedTeam, titanSoul])
  const cons = defaults ? resolveConstraints(defaults, overrides) : null
  const tierNote = useMemo(() => (cons ? perHeroTierNote(selectedTeam, cons) : []), [cons, selectedTeam])
  const hasOverrides = Object.values(overrides).some((v) => v !== null)

  /** Выбранные ограничения сразу сохраняются (IndexedDB) и подхватываются при следующем визите. */
  function updateOverrides(patch: Partial<ConstraintOverrides>): void {
    const next = { ...overrides, ...patch }
    setOverrides(next)
    void saveConstraintOverrides(next)
  }

  function buildInput(): OptimizerInput | string {
    if (!data || !cons) return 'Данные ещё не загружены.'
    if (selectedTeam.length === 0) return 'Выберите хотя бы одного героя.'
    if (selectedTeam.length > 3) return 'Не больше трёх героев.'
    const level = levelOverride === '' ? null : Math.max(1, Number(levelOverride) || 1)
    const hs = level ? selectedTeam.map((h) => ({ ...h, level })) : selectedTeam
    let qs: { quest: Quest; weight: number }[]
    if (mode === 'quest') {
      const q = quests.find((x) => x.id === questId)
      if (!q) return 'Выберите квест.'
      qs = [{ quest: q, weight: 1 }]
    } else {
      const areas = uniAreas.length > 0 ? uniAreas : uniAreaList
      qs = quests
        .filter((q) => q.difficulty === uniDiff && q.variant === uniVariant && areas.includes(q.area))
        .map((q) => ({ quest: q, weight: 1 }))
      if (qs.length === 0) return 'Под фильтр не попал ни один квест.'
    }
    return {
      heroes: hs,
      champion: champ ? { name: champ, rank: Math.max(1, champRank) } : null,
      mode,
      quests: qs,
      robust,
      constraints: cons,
      titanSoul,
      // Веса статов («почему именно эти вещи») — в режиме «квест»: в универсальном отдача видна в таблице локаций.
      withStatWeights: mode === 'quest',
    }
  }

  async function run(): Promise<void> {
    if (!data || !engineRef.current) return
    const input = buildInput()
    if (typeof input === 'string') {
      setError(input)
      return
    }
    const ctx: RunContext = {
      team: selectedTeam,
      teamLabel: [...selectedTeam.map((h) => h.name), champ].filter(Boolean).join(' + '),
      quest: input.mode === 'quest' ? input.quests[0].quest : null,
      objectiveLabel: input.mode === 'universal' ? (input.robust ? 'худшая локация' : 'средневзвешенный win rate') : 'win rate',
    }
    setError(null)
    setResult(null)
    setAdvice(null)
    setSeeds(undefined)
    setUpgrades(null)
    setRunning(true)
    setProgress({ done: 0, total: 1 })
    cancelRequested.current = false
    let main: OptimizerResult | null = null
    try {
      const { result: res, fromCache } = await engineRef.current.optimize(data, input, (done, total) => setProgress({ done, total }))
      setResult({ res, fromCache, ctx })
      main = res
      // Совет по семенам — из весов статов результата (они уже посчитаны оптимизатором).
      setSeeds(res.statWeights ? res.statWeights.heroes.map((h) => ({ ...seedAdviceFromWeights(res.statWeights!, SEED_STAT_PER_SEED, h.index), heroIndex: h.index })) : undefined)
      try {
        const cfgHeroes = input.heroes.map((h, i) => applyHeroConfig(h, res.configs[i]))
        setAdvice(await engineRef.current.skillAdvice(data, cfgHeroes, input.champion ?? null, input.quests))
      } catch {
        setAdvice(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
    if (main && !main.cancelled) await runUpgrades(input, main)
  }

  /** Сценарии «+1 тир» и «+1 качество» — после основного подбора, по очереди в том же воркере. */
  async function runUpgrades(input: OptimizerInput, base: OptimizerResult): Promise<void> {
    const engine = engineRef.current
    if (!data || !engine) return
    const scenarios = upgradeScenarios(data, input, base)
    setUpgrades(scenarios.map((sc) => ({ kind: sc.kind, label: sc.label, state: 'pending' })))
    const patch = (i: number, row: Partial<UpgradeRow>): void => setUpgrades((cur) => cur?.map((r, j) => (j === i ? { ...r, ...row } : r)) ?? cur)
    setUpgrading(true)
    try {
      for (let i = 0; i < scenarios.length; i++) {
        if (cancelRequested.current) {
          patch(i, { state: 'cancelled' })
          continue
        }
        setProgress({ done: 0, total: 1 })
        const { result: alt } = await engine.optimize(data, scenarios[i].input, (done, total) => setProgress({ done, total }))
        patch(i, alt.cancelled && cancelRequested.current ? { state: 'cancelled' } : { state: 'done', outcome: upgradeOutcome(base, alt) })
      }
    } catch {
      setUpgrades((cur) => cur?.map((r) => (r.state === 'pending' ? { ...r, state: 'cancelled' } : r)) ?? cur)
    } finally {
      setUpgrading(false)
      setProgress(null)
    }
  }

  function cancel(): void {
    cancelRequested.current = true
    engineRef.current?.cancel()
  }

  async function markReality(passed: boolean, deadHeroes: string[]): Promise<void> {
    const quest = result?.ctx.quest
    if (!result || !quest) return
    const next = await addRealityCheck({
      id: crypto.randomUUID(),
      questId: quest.id,
      questLabel: questLabel(quest),
      teamLabel: result.ctx.teamLabel,
      passed,
      simWinRate: result.res.winRate,
      createdAt: new Date().toISOString(),
      // Версия модели боя: по ней «Данные» показывают, какие отметки сделаны до правки формул.
      modelVersion: ENGINE_MODEL_VERSION,
      // Кто погиб — второй (после исхода) сигнал, который игра показывает после боя.
      deadHeroes,
    })
    setChecks(next)
  }

  if (!data || !defaults || !cons) {
    return (
      <Page title="Подбор экипировки">
        <p className="text-sm text-muted-foreground">Загружаю данные…</p>
      </Page>
    )
  }

  const progressPct = progress ? Math.min(100, (progress.done / progress.total) * 100) : 0
  const busy = running || upgrading

  return (
    <Page title="Подбор экипировки" description="Выберите отряд, цель и ограничения — симуляция боя в фоне подберёт предметы, стихии и духов.">
      <Section title="Отряд" description="До трёх героев и чемпион.">
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map((h) => {
            const on = selHeroes.includes(h.id)
            return (
              <div key={h.id} className={cn('rounded-md border px-3 py-2 transition-colors', on && 'border-primary/60 bg-primary/5')}>
                <CheckItem checked={on} onChange={(v) => setSelHeroes((cur) => toggle(cur, h.id, v))}>
                  {h.name}{' '}
                  <span className="text-muted-foreground">
                    ({h.className} {h.level})
                  </span>
                </CheckItem>
              </div>
            )
          })}
          {heroes.length === 0 ? <p className="text-sm text-muted-foreground">Героев нет — импортируйте их на странице «Герои».</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Field label="Чемпион" hint="Чемпион даёт отряду бонус своей стихии и ранговые способности. Ранг ниже — слабее бонус.">
            <NativeSelect value={champ} onChange={(e) => setChamp(e.target.value)}>
              <NativeSelectOption value="">— без чемпиона —</NativeSelectOption>
              {data.champions.map((c) => (
                <NativeSelectOption key={c.name} value={c.name}>
                  {c.name} ({c.element})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ранг" hint="Ранг чемпиона от 1 до 20. Без выбранного чемпиона поле неактивно.">
            <Input type="number" min={1} max={20} className="w-20" value={champRank} onChange={(e) => setChampRank(Number(e.target.value))} disabled={!champ} />
          </Field>
          <Field label="Уровень героев (пусто = как у героя)" hint="Посчитать так, будто все герои этого уровня — например, чтобы узнать, как отряд справится после прокачки. Пусто — берётся уровень из импорта.">
            <Input type="number" min={1} max={99} className="w-20" value={levelOverride} onChange={(e) => setLevelOverride(e.target.value)} />
          </Field>
          <Field label="Душа Титана" hint="Бонус Души Титана и доступ к духу Титан. «Как у героя» — по данным импорта; «есть/нет» принудительно для всех героев.">
            <NativeSelect value={titanSoul} onChange={(e) => setTitanSoul(e.target.value as 'as-is' | 'on' | 'off')}>
              <NativeSelectOption value="as-is">как у героя</NativeSelectOption>
              <NativeSelectOption value="on">есть</NativeSelectOption>
              <NativeSelectOption value="off">нет</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
      </Section>

      <Section title="Цель">
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'quest' | 'universal')} className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <Tip text="Лучший набор под одну конкретную локацию, сложность и тип квеста." side="bottom">
            <span>
              <RadioItem value="quest">Квест</RadioItem>
            </span>
          </Tip>
          <Tip text="Один набор, лучший в среднем по выбранным локациям. Подходит, когда нет возможности переодевать героев под каждый квест." side="bottom">
            <span>
              <RadioItem value="universal">Универсальный (все локации фильтра)</RadioItem>
            </span>
          </Tip>
        </RadioGroup>
        {mode === 'quest' ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Локация:</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Локация">
                {questAreas.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={a === selectedQuest?.area ? 'default' : 'outline'}
                    aria-pressed={a === selectedQuest?.area}
                    onClick={() => pickQuestArea(a)}
                  >
                    <AreaLabel area={a} />
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Field label="Сложность" hint="Сложность квеста определяет HP и урон босса и пороги защиты.">
                <NativeSelect value={selectedQuest?.difficulty ?? questDiff} onChange={(e) => pickQuestParams(e.target.value, questVariant)}>
                  {[...new Set([...DIFFS, ...quests.map((q) => q.difficulty)])].map((d) => (
                    <NativeSelectOption key={d}>{d}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Тип" hint="Обычный квест или битва с боссом локации (у босса свои HP, урон и барьер).">
                <NativeSelect value={selectedQuest?.variant ?? questVariant} onChange={(e) => pickQuestParams(questDiff, e.target.value as 'normal' | 'boss')}>
                  <NativeSelectOption value="normal">обычный</NativeSelectOption>
                  <NativeSelectOption value="boss">босс</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            {selectedQuest ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {difficultyIconId(selectedQuest.difficulty) && (
                  <GameIcon kind="difficulty" id={difficultyIconId(selectedQuest.difficulty)} label={selectedQuest.difficulty} size={20} />
                )}
                {questLabel(selectedQuest)}
                {selectedQuest.barrier ? ` · барьер ${selectedQuest.barrier.elements.join('/')} ${selectedQuest.barrier.hp}` : ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Для такого сочетания сложности и типа в этой локации квеста нет.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Field label="Сложность" hint="Сложность, для которой берутся все локации фильтра.">
                <NativeSelect value={uniDiff} onChange={(e) => setUniDiff(e.target.value)}>
                  {[...new Set([...DIFFS, ...quests.map((q) => q.difficulty)])].map((d) => (
                    <NativeSelectOption key={d}>{d}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Тип" hint="Обычные квесты или только боссы выбранных локаций.">
                <NativeSelect value={uniVariant} onChange={(e) => setUniVariant(e.target.value as 'normal' | 'boss')}>
                  <NativeSelectOption value="normal">обычные</NativeSelectOption>
                  <NativeSelectOption value="boss">боссы</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Tip text="Вместо среднего win rate по локациям максимизируется худший результат: набор не провалится ни на одной локации, но в среднем может быть слабее." side="bottom">
                <span>
                  <CheckItem checked={robust} onChange={setRobust}>
                    robust — максимизировать худшую локацию
                  </CheckItem>
                </span>
              </Tip>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Локации (пусто = все):</p>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3">
                {uniAreaList.map((a) => (
                  <CheckItem key={a} checked={uniAreas.includes(a)} onChange={(v) => setUniAreas((cur) => toggle(cur, a, v))}>
                    <AreaLabel area={a} />
                  </CheckItem>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Ограничения"
        description="Всё покупается на рынке — ограничения задают, что вам по карману. Пустое поле = значение по умолчанию; выбранное запоминается."
        action={
          hasOverrides ? (
            <Tip text="Сбросить тир, качество, камни и духи к значениям по умолчанию.">
              <Button variant="outline" size="sm" onClick={() => updateOverrides(NO_OVERRIDES)}>
                <RotateCcw /> По умолчанию
              </Button>
            </Tip>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Field label="Max тир" hint="Потолок тира предметов для всех героев. Пусто — по каждому герою «макс. надетый у него + 1».">
            <OverrideNumber value={overrides.maxItemTier} auto={defaults.maxItemTier} min={1} onChange={(v) => updateOverrides({ maxItemTier: v })} />
          </Field>
          <Field label="Max качество" hint="Наивысшее качество предметов, которое оптимизатор может подставить (Common … Legendary и выше).">
            <NativeSelect value={overrides.maxQuality ?? ''} onChange={(e) => updateOverrides({ maxQuality: (e.target.value || null) as Quality | null })}>
              <NativeSelectOption value="">по умолчанию ({defaults.maxQuality})</NativeSelectOption>
              {QUALITIES.map((q) => (
                <NativeSelectOption key={q} value={q}>
                  {q}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Max тир камней" hint="Потолок тира стихийных камней. 0 — камни не используются. Пусто — максимум из надетого.">
            <OverrideNumber value={overrides.maxStoneTier} auto={defaults.maxStoneTier ?? 0} min={0} onChange={(v) => updateOverrides({ maxStoneTier: v })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          По умолчанию: тир ≤ {defaults.maxItemTier} — НА КАЖДОГО ГЕРОЯ «макс. надетый у него + 1»{tierNote.length > 0 ? ` (${tierNote.join(', ')})` : ''},
          качество ≤ {defaults.maxQuality}, камни ≤ T{defaults.maxStoneTier} (или макс. надетого), духи — все обычные
          {defaults.spirits?.length === spirits.length ? '' : ', без Титана (не у всех героев есть Душа)'}. Своё значение в поле «Max тир» — общий потолок для всех.
        </p>
        <details className="mt-3 rounded-md border p-3">
          <summary className="cursor-pointer text-sm">
            Духи: {cons.spirits?.length ?? spirits.length} из {spirits.length} {overrides.spirits ? '(выбраны вручную)' : '(по умолчанию)'}
          </summary>
          <div className="mt-3 mb-2 flex flex-wrap gap-2">
            <Tip text="Разрешить оптимизатору использовать всех духов, включая Титана.">
              <Button variant="outline" size="sm" onClick={() => updateOverrides({ spirits })}>
                все
              </Button>
            </Tip>
            <Tip text="Подбор без духов вообще.">
              <Button variant="outline" size="sm" onClick={() => updateOverrides({ spirits: [] })}>
                ни одного
              </Button>
            </Tip>
            {overrides.spirits ? (
              <Button variant="outline" size="sm" onClick={() => updateOverrides({ spirits: null })}>
                по умолчанию
              </Button>
            ) : null}
          </div>
          <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
            {spirits.map((sp) => (
              <CheckItem
                key={sp}
                checked={cons.spirits?.includes(sp) ?? true}
                onChange={(v) => updateOverrides({ spirits: toggle(cons.spirits ?? spirits, sp, v) })}
              >
                {sp}
              </CheckItem>
            ))}
          </div>
        </details>
      </Section>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Tip text="Запустить симуляцию боёв в фоне: оптимизатор переберёт предметы, стихии и духов для выбранного отряда.">
          <Button size="lg" disabled={busy} onClick={() => void run()}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? 'Идёт подбор…' : 'Подобрать'}
          </Button>
        </Tip>
        {busy ? (
          <Button variant="outline" onClick={cancel}>
            <X /> Отменить
          </Button>
        ) : null}
        {progress && progress.total > 1 ? (
          <div className="flex min-w-40 flex-1 items-center gap-3">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {upgrading ? 'оценка апгрейда · ' : ''}симуляций {progress.done}/{progress.total}
            </span>
          </div>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <>
          <SimpleResultView data={data} team={result.ctx.team} res={result.res} upgrades={upgrades} />
          <details className="group mb-6 rounded-xl border bg-card p-4 shadow-sm">
            <summary className="cursor-pointer text-lg font-semibold">
              Подробный разбор
              <span className="ml-2 text-sm font-normal text-muted-foreground">цифры по локациям, веса статов, апгрейды, навыки — для тех, кому нужны детали</span>
            </summary>
            <div className="mt-4">
              <ResultView data={data} team={result.ctx.team} result={result} objectiveLabel={result.ctx.objectiveLabel} seeds={seeds} />
              {upgrades ? <UpgradeView team={result.ctx.team} rows={upgrades} objectiveLabel={result.ctx.objectiveLabel} /> : null}
              {advice && advice.advice.length > 0 ? <SkillAdviceView data={data} team={result.ctx.team} advice={advice} /> : null}
              <RealityChecksView
                checks={checks}
                onChecksChange={setChecks}
                target={
                  result.ctx.quest
                    ? { questLabel: questLabel(result.ctx.quest), teamLabel: result.ctx.teamLabel, simWinRate: result.res.winRate }
                    : null
                }
                onMark={(passed, dead) => void markReality(passed, dead)}
              />
            </div>
          </details>
        </>
      ) : null}
    </Page>
  )
}
