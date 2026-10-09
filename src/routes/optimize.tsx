import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { elementIconId, skillIconId, spiritIconId } from '#/data/images.ts'
import { loadHeroes } from '#/data/heroStore.ts'
import { EMPTY_INVENTORY, loadInventory, type Inventory } from '#/data/inventory.ts'
import { addRealityCheck, agreement, checkMatches, loadRealityChecks, removeRealityCheck, type RealityCheck } from '#/data/realityChecks.ts'
import { questsWithCaps } from '#/data/sync.ts'
import { QUALITIES, type HeroInstance, type Quality, type Quest } from '#/data/types.ts'
import { applyHeroConfig, questLabel, type OptimizerInput, type OptimizerResult } from '#/engine/optimizer.ts'
import { CUBE_LABELS, type SkillAdviceResult } from '#/engine/skills.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { InventoryEditor } from '#/ui/InventoryEditor.tsx'

export const Route = createFileRoute('/optimize')({ component: OptimizePage })

const DIFFS = ['Easy', 'Medium', 'Hard', 'Extreme'] as const
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const inputCls = 'rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800'
const btnCls = 'rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

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
  const [result, setResult] = useState<{ res: OptimizerResult; fromCache: boolean } | null>(null)
  const [advice, setAdvice] = useState<SkillAdviceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const quests = useMemo(() => (data ? questsWithCaps(data).quests : []), [data])
  const spirits = useMemo(() => (data ? data.enchants.filter((e) => e.kind === 'spirit').map((e) => e.name) : []), [data])
  const uniAreaList = useMemo(
    () => (data ? [...new Set(quests.filter((q) => q.difficulty === uniDiff && q.variant === uniVariant).map((q) => q.area))] : []),
    [data, quests, uniDiff, uniVariant],
  )
  const selectedTeam = heroes.filter((h) => selHeroes.includes(h.id))
  const aggr = agreement(checks)

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
    setError(null)
    setResult(null)
    setAdvice(null)
    setRunning(true)
    setProgress({ done: 0, total: 1 })
    try {
      const { result: res, fromCache } = await engineRef.current.optimize(data, input, (done, total) => setProgress({ done, total }))
      setResult({ res, fromCache })
      try {
        const cfgHeroes = input.heroes.map((h, i) => applyHeroConfig(h, res.configs[i]))
        setAdvice(await engineRef.current.skillAdvice(data, cfgHeroes, input.champion ?? null, input.quests))
      } catch {
        setAdvice(null)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const teamLabel = [...selectedTeam.map((h) => h.name), champ].filter(Boolean).join(' + ')
  const activeQuest = mode === 'quest' ? quests.find((q) => q.id === questId) : undefined

  async function markReality(passed: boolean): Promise<void> {
    if (!result || !activeQuest) return
    const next = await addRealityCheck({
      id: crypto.randomUUID(),
      questId: activeQuest.id,
      questLabel: questLabel(activeQuest),
      teamLabel,
      passed,
      simWinRate: result.res.winRate,
      createdAt: new Date().toISOString(),
    })
    setChecks(next)
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-bold">Подбор</h1>
        <p className="text-sm">Загружаю данные…</p>
      </main>
    )
  }

  const itemByName = new Map(data.items.map((i) => [i.name, i]))
  const enchantByName = new Map(data.enchants.map((e) => [e.name, e]))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Подбор экипировки</h1>

      <Section title="Отряд">
        <div className="mb-3 flex flex-wrap gap-3">
          {heroes.map((h) => (
            <label key={h.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selHeroes.includes(h.id)}
                onChange={(e) => setSelHeroes((cur) => (e.target.checked ? [...cur, h.id] : cur.filter((x) => x !== h.id)))}
              />
              {h.name} <span className="text-neutral-500">({h.className} {h.level})</span>
            </label>
          ))}
          {heroes.length === 0 ? <p className="text-sm text-neutral-500">Героев нет — импортируйте их на странице «Герои».</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Чемпион
            <select className={inputCls} value={champ} onChange={(e) => setChamp(e.target.value)}>
              <option value="">— без чемпиона —</option>
              {data.champions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.element})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Ранг
            <input type="number" min={1} max={20} className={`${inputCls} w-16`} value={champRank} onChange={(e) => setChampRank(Number(e.target.value))} disabled={!champ} />
          </label>
          <label className="flex items-center gap-2">
            Уровень героев (пусто = как у героя)
            <input type="number" min={1} max={99} className={`${inputCls} w-20`} value={levelOverride} onChange={(e) => setLevelOverride(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            Душа Титана
            <select className={inputCls} value={titanSoul} onChange={(e) => setTitanSoul(e.target.value as 'as-is' | 'on' | 'off')}>
              <option value="as-is">как у героя</option>
              <option value="on">есть</option>
              <option value="off">нет</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Цель">
        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'quest'} onChange={() => setMode('quest')} /> Квест
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'universal'} onChange={() => setMode('universal')} /> Универсальный (все локации фильтра)
          </label>
        </div>
        {mode === 'quest' ? (
          <select className={`${inputCls} w-full max-w-xl`} value={questId} onChange={(e) => setQuestId(e.target.value)}>
            <option value="">— выберите квест —</option>
            {quests.map((q) => (
              <option key={q.id} value={q.id}>
                {questLabel(q)}
                {q.barrier ? ` · барьер ${q.barrier.elements.join('/')} ${q.barrier.hp}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap items-start gap-4 text-sm">
            <label className="flex items-center gap-2">
              Сложность
              <select className={inputCls} value={uniDiff} onChange={(e) => setUniDiff(e.target.value)}>
                {[...new Set([...DIFFS, ...quests.map((q) => q.difficulty)])].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Тип
              <select className={inputCls} value={uniVariant} onChange={(e) => setUniVariant(e.target.value as 'normal' | 'boss')}>
                <option value="normal">обычные</option>
                <option value="boss">боссы</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={robust} onChange={(e) => setRobust(e.target.checked)} />
              robust — максимизировать худшую локацию
            </label>
            <div className="w-full">
              <span className="text-neutral-500">Локации (пусто = все): </span>
              <div className="mt-1 flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
                {uniAreaList.map((a) => (
                  <label key={a} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={uniAreas.includes(a)}
                      onChange={(e) => setUniAreas((cur) => (e.target.checked ? [...cur, a] : cur.filter((x) => x !== a)))}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Пул и ограничения">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={pool === 'all'} onChange={() => setPool('all')} /> любые предметы
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={pool === 'owned'} onChange={() => setPool('owned')} /> только мой инвентарь
          </label>
          <label className="flex items-center gap-2">
            Max тир
            <input type="number" min={1} max={30} className={`${inputCls} w-16`} value={maxTier} onChange={(e) => setMaxTier(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-2">
            Max качество
            <select className={inputCls} value={maxQuality} onChange={(e) => setMaxQuality(e.target.value as Quality)}>
              {QUALITIES.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Max тир камней (пусто = все)
            <input type="number" min={0} className={`${inputCls} w-16`} value={maxStoneTier} onChange={(e) => setMaxStoneTier(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={spiritsAll} onChange={(e) => setSpiritsAll(e.target.checked)} /> все духи
          </label>
        </div>
        {!spiritsAll ? (
          <div className="mt-2 flex max-h-28 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-sm">
            {spirits.map((s) => (
              <label key={s} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={spiritsSel.includes(s)}
                  onChange={(e) => setSpiritsSel((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
                />
                {s}
              </label>
            ))}
          </div>
        ) : null}
        {pool === 'owned' ? (
          <details className="mt-3" open={inventory.items.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">Инвентарь (ручной ввод или CSV)</summary>
            <div className="mt-2">
              <InventoryEditor data={data} inventory={inventory} onChange={setInventory} />
            </div>
          </details>
        ) : null}
      </Section>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <button type="button" className={btnCls} disabled={running} onClick={() => void run()}>
          {running ? 'Идёт подбор…' : 'Подобрать'}
        </button>
        {running ? (
          <button type="button" className="text-sm underline" onClick={() => engineRef.current?.cancel()}>
            Отменить
          </button>
        ) : null}
        {progress && progress.total > 1 ? (
          <div className="flex min-w-40 flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
              <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} />
            </div>
            <span className="text-xs text-neutral-500">
              симуляций {progress.done}/{progress.total}
            </span>
          </div>
        ) : null}
      </div>
      {error ? <p className="mb-4 rounded bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      {result ? (
        <>
          <Section title="Результат">
            <p className="mb-2 text-sm">
              Цель: <b>{pct(result.res.objective)}</b>
              {mode === 'universal' ? (robust ? ' (худшая локация)' : ' (средзвешенный win rate)') : ' (win rate)'} · симуляций:{' '}
              {result.res.simsUsed}
              {result.fromCache ? ' · из кэша' : ''}
              {result.res.cancelled ? ' · отменено, результат частичный' : ''}
            </p>
            {result.res.tieBreakUsed ? (
              <p className="mb-2 rounded bg-sky-100 p-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                У нескольких вариантов одинаковый win rate ({pct(result.res.objective)}) — выбор сделан по тай-брейку:
                меньше средних раундов → больше минимальный % HP выжившего → выше урон за раунд.
              </p>
            ) : null}
            {result.res.warnings.map((w) => (
              <p key={w} className="mb-2 rounded bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {w}
              </p>
            ))}
            <table className="mb-4 w-full max-w-3xl text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-4">Локация</th>
                  <th className="pr-4">Win rate</th>
                  <th className="pr-4">Раундов</th>
                  <th>Барьер</th>
                </tr>
              </thead>
              <tbody>
                {result.res.perQuest.map((pq) => (
                  <tr key={pq.questId} className={result.res.worstQuest?.questId === pq.questId ? 'font-semibold text-red-700 dark:text-red-300' : ''}>
                    <td className="pr-4">{pq.label}</td>
                    <td className="pr-4">{pct(pq.winRate)}</td>
                    <td className="pr-4">{pq.avgRounds.toFixed(1)}</td>
                    <td>{pq.barrierBroken ? 'пробит' : '⚠ не пробит'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.res.worstQuest ? (
              <p className="mb-4 text-sm">
                Худшая локация: <b>{result.res.worstQuest.label}</b> — {pct(result.res.worstQuest.winRate)}
              </p>
            ) : null}
            {result.res.configs.map((cfg, hi) => (
              <div key={selectedTeam[hi]?.id ?? hi} className="mb-4">
                <h3 className="mb-2 font-semibold">{selectedTeam[hi]?.name ?? `Герой ${hi + 1}`}</h3>
                <ul className="space-y-1 text-sm">
                  {cfg.map((sc, si) => {
                    const item = sc.item ? itemByName.get(sc.item) : null
                    const expl = result.res.explanations[hi]?.find((e) => e.slot === si)
                    return (
                      <li key={si} className="flex items-center gap-2">
                        <GameIcon kind="item" id={item?.imageId} label={sc.item ?? 'пусто'} size={26} />
                        <span>
                          {sc.item ? (
                            <>
                              {sc.item} <span className="text-neutral-500">({sc.quality})</span>
                              {sc.element ? (
                                <>
                                  {' '}
                                  <GameIcon kind="element" id={enchantByName.get(sc.element)?.iconId ?? elementIconId('Any')} label={sc.element} size={14} /> {sc.element}
                                </>
                              ) : null}
                              {sc.spirit ? (
                                <>
                                  {' '}
                                  <GameIcon kind="spirit" id={spiritIconId(sc.spirit)} label={sc.spirit} size={14} /> {sc.spirit}
                                </>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-neutral-400">пусто</span>
                          )}
                        </span>
                        {expl ? (
                          <span className={expl.winRateDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'} title={`было: ${expl.from}`}>
                            {expl.winRateDelta >= 0 ? '+' : ''}
                            {(expl.winRateDelta * 100).toFixed(1)} п.п.
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </Section>

          {advice && advice.advice.length > 0 ? (
            <Section title="Навыки: вклад и перекидка">
              <p className="mb-2 text-sm text-neutral-500">
                Вклад = win rate с навыком минус win rate без него (на подобранном наборе). Слабые навыки
                (<i>перекинуть</i>) советуем перекинуть минимальным подходящим кубиком; Роланд — только когда
                навык уже выше тира идеального кубика.
              </p>
              {selectedTeam.map((h, hi) => {
                const rows = advice.advice.filter((a) => a.heroIndex === hi)
                if (rows.length === 0) return null
                return (
                  <div key={h.id} className="mb-3">
                    <h3 className="mb-1 font-semibold">{h.name}</h3>
                    <ul className="space-y-1 text-sm">
                      {rows.map((a) => (
                        <li key={a.skillIndex} className="flex flex-wrap items-center gap-2">
                          <GameIcon kind="skill" id={skillIconId(a.skillName)} label={a.skillName} size={26} />
                          <span>
                            {a.skillName} <span className="text-neutral-500">(слот {a.skillIndex + 1})</span>
                          </span>
                          <span className={a.contribution > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-500'}>
                            {(a.contribution * 100).toFixed(1)} п.п.
                          </span>
                          {a.action === 'reroll' ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              перекинуть: {a.cube ? CUBE_LABELS[a.cube] : ''}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">оставить</span>
                          )}
                          <span className="w-full text-xs text-neutral-500">{a.reasons.join('; ')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </Section>
          ) : null}

          <Section title="Проверка на реальности">
            {mode !== 'quest' || !activeQuest ? (
              <p className="text-sm text-neutral-500">Отметки доступны в режиме «Квест» — выберите один квест.</p>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                <span>
                  Отряд <b>{teamLabel}</b> на «{activeQuest ? questLabel(activeQuest) : ''}» в игре:
                </span>
                <button type="button" className={btnCls} onClick={() => void markReality(true)}>
                  проходит
                </button>
                <button type="button" className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void markReality(false)}>
                  не проходит
                </button>
                <span className="text-neutral-500">предсказание симуляции: {result ? pct(result.res.winRate) : '—'}</span>
              </div>
            )}
            <p className="mb-2 text-sm text-neutral-500">
              Совпадений предсказаний с отметками: {aggr.matched} из {aggr.total} (считаем «проходит» ↔ win rate ≥ 50%).
            </p>
            <ul className="space-y-1 text-sm">
              {checks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className={checkMatches(c) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>{checkMatches(c) ? '✓' : '✗'}</span>
                  <span>
                    {c.questLabel} · {c.teamLabel} · {c.passed ? 'проходит' : 'не проходит'} · симуляция {pct(c.simWinRate)}
                  </span>
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => {
                      void removeRealityCheck(c.id).then(setChecks)
                    }}
                  >
                    удалить
                  </button>
                </li>
              ))}
              {checks.length === 0 ? <li className="text-neutral-500">Отметок пока нет.</li> : null}
            </ul>
          </Section>
        </>
      ) : null}
    </main>
  )
}
