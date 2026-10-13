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
import { loadHeroes, saveHeroes } from '#/data/heroStore.ts'
import { loadConstraintOverrides, saveConstraintOverrides } from '#/data/optimizeSettings.ts'
import { addRealityCheck, loadRealityChecks, type RealityCheck } from '#/data/realityChecks.ts'
import { idbStore } from '#/data/storage.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { loadTombFloors, saveTombFloors } from '#/data/tombFloors.ts'
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
import type { ChampionBuild, PowerBoosterId } from '#/engine/combat.ts'
import { draftCopy } from '#/engine/heroEditor.ts'
import { ENGINE_MODEL_VERSION, MINI_BOSSES, MINI_BOSS_ORDER, SEED_STAT_PER_SEED, TOMB_MODIFIERS } from '#/engine/constants.ts'
import { applyQuestMods, miniBossDesc, tombQuest, type TombFloor } from '#/engine/questMods.ts'
import type { SkillAdviceResult } from '#/engine/skills.ts'
import { seedAdviceFromWeights, type SeedAdvice } from '#/engine/statWeights.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Tip } from '#/ui/Hint.tsx'
import { Field, Notice, Page, Section } from '#/ui/layout.tsx'
import { PowerBoosterPicker } from '#/ui/PowerBoosterPicker.tsx'
import { powerBoosterFrom } from '#/ui/powerBooster.ts'
import { QuestModsBadges } from '#/ui/QuestModsBadges.tsx'
import { FlashQuestToggle, MiniBossPicker } from '#/ui/QuestModsPicker.tsx'
import { questModsSummary } from '#/ui/questModsSummary.ts'
import { TombFloorPanel } from '#/ui/TombFloorPanel.tsx'
import { RealityChecksView } from '#/ui/optimize/RealityChecksView.tsx'
import { ResultView } from '#/ui/optimize/ResultView.tsx'
import { SimpleResultView } from '#/ui/optimize/SimpleResultView.tsx'
import { SkillAdviceView } from '#/ui/optimize/SkillAdviceView.tsx'
import { UpgradeView, type UpgradeRow } from '#/ui/optimize/UpgradeView.tsx'
import { DraftBadge } from '#/ui/heroes/heroStatTable.tsx'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export interface OptimizeSearch {
  heroes?: string
  champion?: string
  rank?: string
  aura?: string
  auraQuality?: string
  familiar?: string
  familiarQuality?: string
  spirit?: string
  quest?: string
  /** Усилитель силы квеста (A74), переданный со страницы «Команды». */
  booster?: string
}

export const Route = createFileRoute('/optimize')({
  // Переход со страницы «Команды»: состав команды и её чемпион приходят в ссылке.
  validateSearch: (search: Record<string, unknown>): OptimizeSearch => ({
    heroes: str(search.heroes),
    champion: str(search.champion),
    rank: str(search.rank),
    aura: str(search.aura),
    auraQuality: str(search.auraQuality),
    familiar: str(search.familiar),
    familiarQuality: str(search.familiarQuality),
    spirit: str(search.spirit),
    quest: str(search.quest),
    booster: str(search.booster),
  }),
  component: OptimizePage,
})

/** Из ссылки принимаем только известные усилители, иначе — «без усилителя». */
const boosterFromSearch = (v: string | undefined): PowerBoosterId => powerBoosterFrom(v)

/** Максимум героев в отряде: `Maximum Party Size` локации может быть 5 (A67), но не больше 5 в правилах игры. */
const MAX_HEROES = 5

const DIFFS = ['Easy', 'Medium', 'Hard', 'Extreme'] as const

/** Контекст, с которым был запущен подбор: результат показывается по нему, а не по текущему состоянию формы. */
interface RunContext {
  team: HeroInstance[]
  teamLabel: string
  quest: Quest | null
  objectiveLabel: string
  /** Экипировка чемпиона и усилитель силы того запуска — те же условия в «Примере боя». */
  championBuild: ChampionBuild | null
  booster: PowerBoosterId
  /** Воркер, в котором считался подбор: в нём же считается «Пример боя». */
  engine: Engine | null
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
  const search = Route.useSearch()
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const [heroes, setHeroes] = useState<HeroInstance[]>([])
  const [checks, setChecks] = useState<RealityCheck[]>([])
  const [overrides, setOverrides] = useState<ConstraintOverrides>(NO_OVERRIDES)
  /** Экипировка чемпиона, изменённая пользователем в форме (null — берётся из ссылки, если она есть). */
  const [champGearEdit, setChampGearEdit] = useState<{ aura: string; auraQuality: Quality; familiar: string; familiarQuality: Quality; spirit: string } | null>(null)

  /**
   * Переход со страницы «Команды»: состав, чемпион, его экипировка и целевой квест приходят в ссылке
   * и берутся как начальные значения. Ничего не «докладывается» эффектом: состав — это id героев
   * (сопоставление с загруженными героями делает `selectedTeam`), а квест — id, из которого
   * сложность и тип выводятся, когда данные загрузились.
   */
  const [selHeroes, setSelHeroes] = useState<string[]>(() => (search.heroes ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_HEROES))
  const [champ, setChamp] = useState(() => search.champion ?? '')
  const [champRank, setChampRank] = useState(() => Math.max(1, Math.min(20, Number(search.rank) || 1)))
  const [mode, setMode] = useState<'quest' | 'universal'>('quest')
  const [questId, setQuestId] = useState(() => search.quest ?? '')
  /** Сложность и тип, выбранные пользователем до того, как найден квест (иначе — из самого квеста). */
  const [questPending, setQuestPending] = useState<{ diff: string; variant: 'normal' | 'boss' } | null>(null)
  const [uniDiff, setUniDiff] = useState<string>('Hard')
  const [uniVariant, setUniVariant] = useState<'normal' | 'boss'>('boss')
  const [uniAreas, setUniAreas] = useState<string[]>([])
  const [robust, setRobust] = useState(false)
  const [titanSoul, setTitanSoul] = useState<'as-is' | 'on' | 'off'>('as-is')
  /** Усилитель силы квеста на весь отряд (A74): выбор в форме квеста, влияет на все симуляции. */
  const [booster, setBooster] = useState<PowerBoosterId>(() => boosterFromSearch(search.booster))
  const [levelOverride, setLevelOverride] = useState('')
  /**
   * Модификаторы квеста (A17/A53/A71/A77): мини-босс, флаг Flash-задания и этаж Гробницы Титанов.
   * К квесту их применяет `applyQuestMods`, поэтому дальше по коду везде идёт уже готовый квест.
   */
  const [miniBoss, setMiniBoss] = useState('')
  const [flash, setFlash] = useState(false)
  const [tombDepth, setTombDepth] = useState<number | null>(null)
  const [tombFloors, setTombFloors] = useState<TombFloor[]>([])

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
  /** Герои, в черновик которых уже применён результат подбора (кнопка «Применить» меняет подпись). */
  const [applied, setApplied] = useState<Set<string>>(() => new Set())
  const [applyNote, setApplyNote] = useState<string | null>(null)

  useEffect(() => {
    void loadHeroes().then((r) => setHeroes(r.heroes))
    void loadRealityChecks().then((r) => setChecks(r.checks))
    void loadConstraintOverrides().then(setOverrides)
    void loadTombFloors(idbStore).then(setTombFloors)
  }, [])

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const questAreas = useMemo(() => [...new Set(quests.map((q) => q.area))], [quests])
  const selectedQuest = useMemo(() => quests.find((q) => q.id === questId) ?? null, [quests, questId])
  /** Выбранный этаж Гробницы (null — этаж не выбран). */
  const tombFloor = useMemo(() => tombFloors.find((f) => f.depth === tombDepth) ?? null, [tombFloors, tombDepth])
  /**
   * Квест, с которым реально считаем: базовый из таблицы + выбранные модификаторы (мини-босс, Flash)
   * либо синтетический квест Гробницы Титанов. Именно он уходит в оптимизатор и в «Пример боя»,
   * поэтому бейджи, пороги и штрафы везде совпадают с симуляцией.
   */
  const effectiveQuest = useMemo((): Quest | null => {
    if (tombFloor) return tombQuest(tombFloor).quest
    if (!selectedQuest) return null
    if (!miniBoss && !flash) return selectedQuest
    const mods = miniBoss ? [`miniboss:${miniBoss}`] : []
    return applyQuestMods({ ...selectedQuest, isFlash: flash }, mods).quest
  }, [tombFloor, selectedQuest, miniBoss, flash])
  /** Сложность и тип текущего квеста: из самого квеста, иначе — из выбора пользователя (пока квеста нет). */
  const questDiff = selectedQuest?.difficulty ?? questPending?.diff ?? 'Hard'
  const questVariant = selectedQuest?.variant ?? questPending?.variant ?? 'boss'
  const pickQuestParams = (diff: string, variant: 'normal' | 'boss') => {
    const area = selectedQuest?.area
    const q = area ? quests.find((x) => x.area === area && x.difficulty === diff && x.variant === variant) : undefined
    if (q) {
      setQuestId(q.id)
      setQuestPending(null)
      return
    }
    setQuestPending({ diff, variant })
    setQuestId('')
  }
  const pickQuestArea = (area: string) => {
    const inArea = quests.filter((q) => q.area === area)
    const q = inArea.find((x) => x.difficulty === questDiff && x.variant === questVariant) ?? inArea[0]
    if (!q) return
    setQuestId(q.id)
    setQuestPending(null)
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

  /**
   * Экипировка чемпиона из ссылки, проверенная по текущим данным (чего нет в данных — то пусто).
   * Значение пользователя (`champGearEdit`) важнее: формула один раз, дальше выбор живёт в состоянии.
   */
  const champGearFromLink = useMemo(() => {
    if (!data || !champ || search.champion !== champ) return null
    return {
      aura: data.items.some((i) => i.name === search.aura) ? (search.aura ?? '') : '',
      auraQuality: (search.auraQuality as Quality) || 'Normal',
      familiar: data.items.some((i) => i.name === search.familiar) ? (search.familiar ?? '') : '',
      familiarQuality: (search.familiarQuality as Quality) || 'Normal',
      spirit: data.enchants.some((e) => e.name === search.spirit) ? (search.spirit ?? '') : '',
    }
  }, [data, champ, search])
  const champGear = champGearEdit ?? champGearFromLink
  /** Изменить экипировку чемпиона в форме (дальше значение важнее ссылки). */
  const setChampGear = (patch: Partial<{ aura: string; auraQuality: Quality; familiar: string; familiarQuality: Quality; spirit: string }>): void =>
    setChampGearEdit({
      aura: patch.aura ?? '',
      auraQuality: patch.auraQuality ?? 'Normal',
      familiar: patch.familiar ?? '',
      familiarQuality: patch.familiarQuality ?? 'Normal',
      spirit: patch.spirit ?? '',
    })

  /** Выбранные ограничения сразу сохраняются (IndexedDB) и подхватываются при следующем визите. */
  function updateOverrides(patch: Partial<ConstraintOverrides>): void {
    const next = { ...overrides, ...patch }
    setOverrides(next)
    void saveConstraintOverrides(next)
  }

  function buildInput(): OptimizerInput | string {
    if (!data || !cons) return 'Данные ещё не загружены.'
    if (selectedTeam.length === 0) return 'Выберите хотя бы одного героя.'
    if (selectedTeam.length > MAX_HEROES) return `Не больше ${MAX_HEROES} героев.`
    const level = levelOverride === '' ? null : Math.max(1, Number(levelOverride) || 1)
    const hs = level ? selectedTeam.map((h) => ({ ...h, level })) : selectedTeam
    let qs: { quest: Quest; weight: number }[]
    if (mode === 'quest') {
      // В режиме «квест» считаем с модификаторами: мини-босс, Flash, этаж Гробницы (см. `effectiveQuest`).
      const q = effectiveQuest ?? quests.find((x) => x.id === questId)
      if (!q) return tombDepth !== null ? 'Выберите этаж Гробницы Титанов.' : 'Выберите квест.'
      qs = [{ quest: q, weight: 1 }]
    } else {
      const areas = uniAreas.length > 0 ? uniAreas : uniAreaList
      qs = quests
        .filter((q) => q.difficulty === uniDiff && q.variant === uniVariant && areas.includes(q.area))
        .map((q) => ({ quest: q, weight: 1 }))
      if (qs.length === 0) return 'Под фильтр не попал ни один квест.'
    }
    const rank = Math.max(1, champRank)
    return {
      heroes: hs,
      champion: champ ? { name: champ, rank } : null,
      // Экипировка чемпиона (A67) — та же, что в прогоне команды: иначе подбор считал бы другого чемпиона.
      championBuild: champ
        ? {
            champion: champ,
            rank,
            aura: champGear?.aura ? { item: champGear.aura, quality: champGear.auraQuality } : null,
            familiar: champGear?.familiar ? { item: champGear.familiar, quality: champGear.familiarQuality } : null,
            spirit: champGear?.spirit || null,
          }
        : null,
      mode,
      quests: qs,
      robust,
      constraints: cons,
      titanSoul,
      powerBooster: booster,
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
      championBuild: input.championBuild ?? null,
      booster: input.powerBooster ?? 'none',
      engine: engineRef.current,
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
        setAdvice(await engineRef.current.skillAdvice(data, cfgHeroes, input.champion ?? null, input.quests, { powerBooster: booster }))
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

  /**
   * «Применить подбор»: записать рекомендованную экипировку в героя.
   * Герой-черновик правится на месте (он и создан для опытов). Обычный герой не перезаписывается:
   * его текущий набор — эталон для сравнения, поэтому создаётся черновик с этими же статами и
   * в него записывается результат. Пользователь видит в «Героях» таблицу «черновик ↔ оригинал».
   */
  async function applyBuild(heroIndex: number): Promise<string> {
    if (!result) return 'Результата подбора ещё нет.'
    const cfg = result.res.configs[heroIndex]
    const hero = result.ctx.team[heroIndex]
    if (!cfg || !hero) return 'Не удалось сопоставить героя с результатом подбора.'
    const { heroes: stored } = await loadHeroes()
    const target = stored.find((h) => h.id === hero.id)
    if (!target) return `Герой «${hero.name}» не найден в сохранённых — импортируйте или создайте его заново.`
    const applied = applyHeroConfig(target.draft ? target : draftCopy(target), cfg)
    const next = target.draft ? stored.map((h) => (h.id === target.id ? applied : h)) : [...stored, applied]
    await saveHeroes(next)
    setApplied((cur) => new Set(cur).add(hero.id))
    return target.draft
      ? `Набор записан в черновик «${applied.name}» — статы сравните с оригиналом на странице «Герои».`
      : `Создан черновик «${applied.name}» с рекомендованным набором: оригинал «${target.name}» не изменён, сравнение — на странице «Герои».`
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
      <Section title="Отряд" description={`До ${MAX_HEROES} героев и чемпион. Размер отряда ограничивает локация: 3/4/5 (Maximum Party Size).`}>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map((h) => {
            const on = selHeroes.includes(h.id)
            return (
              <div key={h.id} className={cn('rounded-md border px-3 py-2 transition-colors', on && 'border-primary/60 bg-primary/5')}>
                <CheckItem checked={on} onChange={(v) => setSelHeroes((cur) => toggle(cur, h.id, v))}>
                  {h.name} {h.draft ? <DraftBadge /> : null}{' '}
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
            <NativeSelect aria-label="Чемпион" value={champ} onChange={(e) => setChamp(e.target.value)}>
              <NativeSelectOption value="">— без чемпиона —</NativeSelectOption>
              {data.champions.map((c) => (
                <NativeSelectOption key={c.name} value={c.name}>
                  {c.name} ({c.element})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ранг" hint="Ранг чемпиона от 1 до 20. Без выбранного чемпиона поле неактивно.">
            <Input
              type="number"
              min={1}
              max={20}
              aria-label="Ранг"
              className="w-20"
              value={champRank}
              onChange={(e) => setChampRank(Number(e.target.value))}
              disabled={!champ}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Tip text="Аурасонг даёт чемпиону DEF/HP, а его навык — бонус ВСЕМУ отряду (A67).">
              <span className="text-muted-foreground">Аура чемпиона</span>
            </Tip>
            <NativeSelect
              className="w-48"
              aria-label="Аура чемпиона"
              disabled={!champ}
              value={champGear?.aura ?? ''}
              onChange={(e) => setChampGear({ ...champGear, aura: e.target.value })}
            >
              <NativeSelectOption value="">— без ауры —</NativeSelectOption>
              {data.items
                .filter((i) => i.type === 'Aurasong')
                .map((i) => (
                  <NativeSelectOption key={i.name} value={i.name}>
                    {i.name} (T{i.tier})
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Tip text="Качество меняет только DEF/HP предмета — силу ауры оно не меняет (A67).">
              <span className="text-muted-foreground">Качество ауры</span>
            </Tip>
            <NativeSelect
              className="w-32"
              aria-label="Качество ауры"
              disabled={!champ || !champGear?.aura}
              value={champGear?.auraQuality ?? 'Normal'}
              onChange={(e) => setChampGear({ ...champGear, auraQuality: e.target.value as Quality })}
            >
              {QUALITIES.map((q) => (
                <NativeSelectOption key={q} value={q}>
                  {q}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Tip text="Фамильяр добавляет чемпиону ATK/DEF/HP; в него вставляется дух (A67).">
              <span className="text-muted-foreground">Фамильяр</span>
            </Tip>
            <NativeSelect className="w-48" aria-label="Фамильяр" disabled={!champ} value={champGear?.familiar ?? ''} onChange={(e) => setChampGear({ ...champGear, familiar: e.target.value })}>
              <NativeSelectOption value="">— без фамильяра —</NativeSelectOption>
              {data.items
                .filter((i) => i.type === 'Familiar')
                .map((i) => (
                  <NativeSelectOption key={i.name} value={i.name}>
                    {i.name} (T{i.tier})
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Качество фамильяра</span>
            <NativeSelect
              className="w-32"
              aria-label="Качество фамильяра"
              disabled={!champ || !champGear?.familiar}
              value={champGear?.familiarQuality ?? 'Normal'}
              onChange={(e) => setChampGear({ ...champGear, familiarQuality: e.target.value as Quality })}
            >
              {QUALITIES.map((q) => (
                <NativeSelectOption key={q} value={q}>
                  {q}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Tip text="Навык духа действует на носителя (чемпиона); «+»-версия включается сродством фамильяра (A5, A67).">
              <span className="text-muted-foreground">Дух в фамильяре</span>
            </Tip>
            <NativeSelect className="w-48" aria-label="Дух в фамильяре" disabled={!champ} value={champGear?.spirit ?? ''} onChange={(e) => setChampGear({ ...champGear, spirit: e.target.value })}>
              <NativeSelectOption value="">— без духа —</NativeSelectOption>
              {spirits.map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {s}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <Field label="Уровень героев (пусто = как у героя)" hint="Посчитать так, будто все герои этого уровня — например, чтобы узнать, как отряд справится после прокачки. Пусто — берётся уровень из импорта.">
            <Input type="number" min={1} max={99} className="w-20" value={levelOverride} onChange={(e) => setLevelOverride(e.target.value)} />
          </Field>
          <Field label="Душа Титана" hint="Бонус Души Титана: промоушен-класс, его статы, слоты и навыки (A47). «Как у героя» — по данным импорта; «есть/нет» принудительно для всех. По умолчанию от него же зависит, предлагать ли дух Титан (A41, допущение: правила «Титан только с Душой» в данных нет).">
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
                    variant={a === selectedQuest?.area && !tombFloor ? 'default' : 'outline'}
                    aria-pressed={a === selectedQuest?.area && !tombFloor}
                    onClick={() => {
                      setTombDepth(null)
                      pickQuestArea(a)
                    }}
                  >
                    <AreaLabel area={a} />
                  </Button>
                ))}
                <Tip text="Гробница Титанов — особый квест: статы (HP, ATK, Defense cap, барьер) и модификаторы этажа вводит пользователь, набор этажей хранится в браузере (A71/A77).">
                  <Button
                    type="button"
                    size="sm"
                    variant={tombFloor ? 'default' : 'outline'}
                    aria-pressed={tombFloor !== null}
                    onClick={() => {
                      setTombDepth((cur) => cur ?? tombFloors[0]?.depth ?? null)
                      setQuestId('')
                    }}
                  >
                    Гробница Титанов
                  </Button>
                </Tip>
              </div>
            </div>
            <details className="rounded-md border p-3" open={tombFloor !== null}>
              <summary className="cursor-pointer text-sm">Гробница Титанов — этажи и модификаторы</summary>
              <div className="mt-3">
                <TombFloorPanel
                  floors={tombFloors}
                  selectedDepth={tombDepth}
                  onSelect={(f) => setTombDepth(f?.depth ?? null)}
                  onSaved={(next) => {
                    setTombFloors(next)
                    void saveTombFloors(next, idbStore)
                  }}
                />
              </div>
            </details>
            {!tombFloor ? (
              <>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Field label="Сложность" hint="Сложность квеста определяет HP и урон босса и пороги защиты.">
                    <NativeSelect value={selectedQuest?.difficulty ?? questDiff} onChange={(e) => pickQuestParams(e.target.value, questVariant === 'normal' ? 'normal' : 'boss')}>
                      {[...new Set([...DIFFS, ...quests.map((q) => q.difficulty)])].map((d) => (
                        <NativeSelectOption key={d}>{d}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Тип" hint="Обычный квест или битва с боссом локации (у босса свои HP, урон и барьер).">
                    <NativeSelect
                      aria-label="Тип квеста"
                      value={selectedQuest && selectedQuest.variant !== 'normal' ? 'boss' : 'normal'}
                      onChange={(e) => pickQuestParams(questDiff, e.target.value as 'normal' | 'boss')}
                    >
                      <NativeSelectOption value="normal">обычный</NativeSelectOption>
                      <NativeSelectOption value="boss">босс</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <MiniBossPicker value={miniBoss} onChange={setMiniBoss} />
                  <FlashQuestToggle value={flash} onChange={setFlash} />
                  <PowerBoosterPicker value={booster} onChange={setBooster} />
                </div>
                {effectiveQuest ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {difficultyIconId(effectiveQuest.difficulty) && (
                      <GameIcon kind="difficulty" id={difficultyIconId(effectiveQuest.difficulty)} label={effectiveQuest.difficulty} size={20} />
                    )}
                    {questLabel(effectiveQuest)}
                    {effectiveQuest.barrier ? ` · барьер ${effectiveQuest.barrier.elements.join('/')} ${effectiveQuest.barrier.hp}` : ''}
                    <QuestModsBadges quest={effectiveQuest} />
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Для такого сочетания сложности и типа в этой локации квеста нет.</p>
                )}
              </>
            ) : null}
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">Справка: модификаторы квестов</summary>
              <div className="mt-3 space-y-4 text-sm">
                <div>
                  <p className="mb-1 font-semibold">Мини-боссы (A17/A77)</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {MINI_BOSS_ORDER.map((key) => (
                      <li key={key}>
                        <span className="text-foreground">{MINI_BOSSES[key].label}</span> — {miniBossDesc(key)}
                        {MINI_BOSSES[key].lootOnly ? ' (в модели боя не отражается)' : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Источник: stcalc.com (таблица мини-боссов калькулятора). Мини-босс считается боссом, поэтому «Bonuses are doubled against bosses» на нём работает.
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-semibold">Flash-задания и Nullysium (A53/A77)</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    <li>Лидерские навыки Bjorn («Above bonuses are doubled during Flash Quests») в Flash-задании удваиваются.</li>
                    <li>Nullysium: герои теряют 30 п.п. уклонения и 30 п.п. шанса крита (все сложности).</li>
                    <li>Flash-задание на Extreme: герои теряют 20 п.п. уклонения.</li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-semibold">Модификаторы Гробницы Титанов (A70/A71/A77)</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {Object.values(TOMB_MODIFIERS).map((def) => (
                      <li key={def.key}>
                        <span className="text-foreground">{def.label}</span> — {def.desc}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    «−N» на крит у героев — пункты к шансу крита, «−N» на урон крита — пункты к множителю урона крита (как в калькуляторе stcalc; A77). Крит врага в Гробнице — 15%,
                    героям −20 п.п. крита; шанс AoE — 25%. Модификаторы вроде «Ambusher» (враг не промахивается первые раунды), «Nullifier» (герои стихии не участвуют) и «Steamroller»
                    (+10% ATK врага за раунд) в модели боя не поддержаны — не выбирайте их, если нужен точный результат (A77).
                  </p>
                </div>
                {effectiveQuest && questModsSummary(effectiveQuest).length > 0 ? (
                  <div>
                    <p className="mb-1 font-semibold">Что даёт выбранное сейчас</p>
                    <p className="text-muted-foreground">{questModsSummary(effectiveQuest).join('; ')}.</p>
                  </div>
                ) : null}
              </div>
            </details>
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
          <Field label="Max тир" hint="Потолок тира предметов для всех героев. Пусто — по каждому герою «макс. надетый у него + 1», но не выше Max Item Tier его уровня: выше этого тира герой предмет не наденет.">
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
          По умолчанию: тир ≤ {defaults.maxItemTier} — НА КАЖДОГО ГЕРОЯ «макс. надетый у него + 1», но не выше Max Item Tier его уровня
          {tierNote.length > 0 ? ` (${tierNote.join(', ')})` : ''}, качество ≤ {defaults.maxQuality}, камни ≤ T{defaults.maxStoneTier} (или макс. надетого),
          духи — все обычные
          {defaults.spirits?.length === spirits.length ? '' : ', без Титана (по умолчанию не предлагается — допущение A41; кнопка «все» включает)'}. Своё значение в поле «Max тир» (или «Max тир камней») — потолок для каждого героя, но не выше Max Item Tier его уровня.
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
          <SimpleResultView
            data={data}
            team={result.ctx.team}
            res={result.res}
            upgrades={upgrades}
            applied={applied}
            onApply={(hi) => void applyBuild(hi).then(setApplyNote)}
          />
          {applyNote ? <Notice tone="success">{applyNote}</Notice> : null}
          <details className="group mb-6 rounded-xl border bg-card p-4 shadow-sm">
            <summary className="cursor-pointer text-lg font-semibold">
              Подробный разбор
              <span className="ml-2 text-sm font-normal text-muted-foreground">цифры по локациям, веса статов, апгрейды, навыки — для тех, кому нужны детали</span>
            </summary>
            <div className="mt-4">
              <ResultView
                data={data}
                team={result.ctx.team}
                result={result}
                objectiveLabel={result.ctx.objectiveLabel}
                seeds={seeds}
                quest={result.ctx.quest}
                championBuild={result.ctx.championBuild}
                engine={result.ctx.engine}
                powerBooster={result.ctx.booster}
              />
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

