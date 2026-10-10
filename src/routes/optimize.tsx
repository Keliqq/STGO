import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Sparkles, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { Progress } from '#/components/ui/progress.tsx'
import { RadioGroup, RadioGroupItem } from '#/components/ui/radio-group.tsx'
import { loadHeroes } from '#/data/heroStore.ts'
import { EMPTY_INVENTORY, loadInventory, type Inventory } from '#/data/inventory.ts'
import { addRealityCheck, loadRealityChecks, type RealityCheck } from '#/data/realityChecks.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { QUALITIES, type HeroInstance, type Quality, type Quest } from '#/data/types.ts'
import { applyHeroConfig, questLabel, type OptimizerInput, type OptimizerResult } from '#/engine/optimizer.ts'
import type { SkillAdviceResult } from '#/engine/skills.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { InventoryEditor } from '#/ui/InventoryEditor.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'
import { RealityChecksView } from '#/ui/optimize/RealityChecksView.tsx'
import { ResultView } from '#/ui/optimize/ResultView.tsx'
import { SkillAdviceView } from '#/ui/optimize/SkillAdviceView.tsx'

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

function RadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <RadioGroupItem value={value} />
      <span>{children}</span>
    </label>
  )
}

const toggle = (list: string[], v: string, on: boolean): string[] => (on ? [...list, v] : list.filter((x) => x !== v))

function OptimizePage() {
  const data = useGameData()
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [inventory, setInventory] = useState<Inventory>(EMPTY_INVENTORY)
  const [checks, setChecks] = useState<RealityCheck[]>([])
  useEffect(() => {
    void loadHeroes().then((r) => setHeroes(r.heroes))
    void loadInventory().then((r) => setInventory(r.inventory))
    void loadRealityChecks().then((r) => setChecks(r.checks))
  }, [])

  const [selHeroes, setSelHeroes] = useState<string[]>([])
  const [champ, setChamp] = useState('')
  const [champRank, setChampRank] = useState(1)
  const [mode, setMode] = useState<'quest' | 'universal'>('quest')
  const [questId, setQuestId] = useState('')
  const [uniDiff, setUniDiff] = useState<string>('Hard')
  const [uniVariant, setUniVariant] = useState<'normal' | 'boss'>('boss')
  const [uniAreas, setUniAreas] = useState<string[]>([])
  const [robust, setRobust] = useState(false)
  const [pool, setPool] = useState<'owned' | 'all'>('all')
  const [maxTier, setMaxTier] = useState(20)
  const [maxQuality, setMaxQuality] = useState<Quality>('Legendary')
  const [maxStoneTier, setMaxStoneTier] = useState('')
  const [spiritsAll, setSpiritsAll] = useState(true)
  const [spiritsSel, setSpiritsSel] = useState<string[]>([])
  const [titanSoul, setTitanSoul] = useState<'as-is' | 'on' | 'off'>('as-is')
  const [levelOverride, setLevelOverride] = useState('')

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ res: OptimizerResult; fromCache: boolean; ctx: RunContext } | null>(null)
  const [advice, setAdvice] = useState<SkillAdviceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const spirits = useMemo(() => (data ? data.enchants.filter((e) => e.kind === 'spirit').map((e) => e.name) : []), [data])
  const uniAreaList = useMemo(
    () => [...new Set(quests.filter((q) => q.difficulty === uniDiff && q.variant === uniVariant).map((q) => q.area))],
    [quests, uniDiff, uniVariant],
  )
  const selectedTeam = heroes.filter((h) => selHeroes.includes(h.id))

  function buildInput(): OptimizerInput | string {
    if (!data) return 'Данные ещё не загружены.'
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
      pool: pool === 'owned' ? { kind: 'owned', items: inventory.items, stones: inventory.stones, spirits: inventory.spirits } : { kind: 'all' },
      constraints: {
        maxItemTier: maxTier,
        maxQuality,
        maxStoneTier: maxStoneTier === '' ? null : Math.max(0, Number(maxStoneTier) || 0),
        spirits: spiritsAll ? null : spiritsSel,
      },
      titanSoul,
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
    setRunning(true)
    setProgress({ done: 0, total: 1 })
    try {
      const { result: res, fromCache } = await engineRef.current.optimize(data, input, (done, total) => setProgress({ done, total }))
      setResult({ res, fromCache, ctx })
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
  }

  async function markReality(passed: boolean): Promise<void> {
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
    })
    setChecks(next)
  }

  if (!data) {
    return (
      <Page title="Подбор экипировки">
        <p className="text-sm text-muted-foreground">Загружаю данные…</p>
      </Page>
    )
  }

  const progressPct = progress ? Math.min(100, (progress.done / progress.total) * 100) : 0

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
          <Field label="Чемпион">
            <NativeSelect value={champ} onChange={(e) => setChamp(e.target.value)}>
              <NativeSelectOption value="">— без чемпиона —</NativeSelectOption>
              {data.champions.map((c) => (
                <NativeSelectOption key={c.name} value={c.name}>
                  {c.name} ({c.element})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ранг">
            <Input type="number" min={1} max={20} className="w-20" value={champRank} onChange={(e) => setChampRank(Number(e.target.value))} disabled={!champ} />
          </Field>
          <Field label="Уровень героев (пусто = как у героя)">
            <Input type="number" min={1} max={99} className="w-20" value={levelOverride} onChange={(e) => setLevelOverride(e.target.value)} />
          </Field>
          <Field label="Душа Титана">
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
          <RadioItem value="quest">Квест</RadioItem>
          <RadioItem value="universal">Универсальный (все локации фильтра)</RadioItem>
        </RadioGroup>
        {mode === 'quest' ? (
          <NativeSelect className="w-full max-w-xl" value={questId} onChange={(e) => setQuestId(e.target.value)}>
            <NativeSelectOption value="">— выберите квест —</NativeSelectOption>
            {quests.map((q) => (
              <NativeSelectOption key={q.id} value={q.id}>
                {questLabel(q)}
                {q.barrier ? ` · барьер ${q.barrier.elements.join('/')} ${q.barrier.hp}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Field label="Сложность">
                <NativeSelect value={uniDiff} onChange={(e) => setUniDiff(e.target.value)}>
                  {[...new Set([...DIFFS, ...quests.map((q) => q.difficulty)])].map((d) => (
                    <NativeSelectOption key={d}>{d}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Тип">
                <NativeSelect value={uniVariant} onChange={(e) => setUniVariant(e.target.value as 'normal' | 'boss')}>
                  <NativeSelectOption value="normal">обычные</NativeSelectOption>
                  <NativeSelectOption value="boss">боссы</NativeSelectOption>
                </NativeSelect>
              </Field>
              <CheckItem checked={robust} onChange={setRobust}>
                robust — максимизировать худшую локацию
              </CheckItem>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Локации (пусто = все):</p>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3">
                {uniAreaList.map((a) => (
                  <CheckItem key={a} checked={uniAreas.includes(a)} onChange={(v) => setUniAreas((cur) => toggle(cur, a, v))}>
                    {a}
                  </CheckItem>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Пул и ограничения">
        <RadioGroup value={pool} onValueChange={(v) => setPool(v as 'owned' | 'all')} className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
          <RadioItem value="all">любые предметы</RadioItem>
          <RadioItem value="owned">только мой инвентарь</RadioItem>
        </RadioGroup>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Field label="Max тир">
            <Input type="number" min={1} max={30} className="w-20" value={maxTier} onChange={(e) => setMaxTier(Number(e.target.value))} />
          </Field>
          <Field label="Max качество">
            <NativeSelect value={maxQuality} onChange={(e) => setMaxQuality(e.target.value as Quality)}>
              {QUALITIES.map((q) => (
                <NativeSelectOption key={q}>{q}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Max тир камней (пусто = все)">
            <Input type="number" min={0} className="w-20" value={maxStoneTier} onChange={(e) => setMaxStoneTier(e.target.value)} />
          </Field>
          <CheckItem checked={spiritsAll} onChange={setSpiritsAll}>
            все духи
          </CheckItem>
        </div>
        {!spiritsAll ? (
          <div className="mt-3 flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3">
            {spirits.map((s) => (
              <CheckItem key={s} checked={spiritsSel.includes(s)} onChange={(v) => setSpiritsSel((cur) => toggle(cur, s, v))}>
                {s}
              </CheckItem>
            ))}
          </div>
        ) : null}
        {pool === 'owned' ? (
          <details className="mt-4 rounded-md border p-3" open={inventory.items.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">Инвентарь (ручной ввод или CSV)</summary>
            <div className="mt-3">
              <InventoryEditor data={data} inventory={inventory} onChange={setInventory} />
            </div>
          </details>
        ) : null}
      </Section>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={running} onClick={() => void run()}>
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? 'Идёт подбор…' : 'Подобрать'}
        </Button>
        {running ? (
          <Button variant="outline" onClick={() => engineRef.current?.cancel()}>
            <X /> Отменить
          </Button>
        ) : null}
        {progress && progress.total > 1 ? (
          <div className="flex min-w-40 flex-1 items-center gap-3">
            <Progress value={progressPct} className="flex-1" />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              симуляций {progress.done}/{progress.total}
            </span>
          </div>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <>
          <ResultView data={data} team={result.ctx.team} result={result} objectiveLabel={result.ctx.objectiveLabel} />
          {advice && advice.advice.length > 0 ? <SkillAdviceView team={result.ctx.team} advice={advice} /> : null}
          <RealityChecksView
            checks={checks}
            onChecksChange={setChecks}
            target={
              result.ctx.quest
                ? { questLabel: questLabel(result.ctx.quest), teamLabel: result.ctx.teamLabel, simWinRate: result.res.winRate }
                : null
            }
            onMark={(passed) => void markReality(passed)}
          />
        </>
      ) : null}
    </Page>
  )
}
