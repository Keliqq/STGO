/**
 * Блок «Веса статов» на странице «Герои»: по выбранному квесту показывает, что герою даёт
 * прибавка стата (симуляция в воркере, общий seed) и одну фразу «Главное для героя».
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { questsWithCaps } from '#/data/sync.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import { SEED_STAT_PER_SEED } from '#/engine/constants.ts'
import { questLabel } from '#/engine/optimizer.ts'
import { seedAdviceFromWeights, type SeedAdvice, type StatWeightsResult } from '#/engine/statWeights.ts'
import { createEngine, type Engine } from '#/worker/client.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Notice } from '#/ui/layout.tsx'
import { StatWeightsView } from '#/ui/optimize/StatWeightsView.tsx'

export function HeroWeightsPanel({ hero, data }: { hero: HeroInstance; data: GameData }) {
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    engineRef.current = createEngine()
    return () => engineRef.current?.dispose()
  }, [])

  const quests = useMemo(() => questsWithCaps(data).quests, [data])
  const [questId, setQuestId] = useState('')
  const [state, setState] = useState<{ weights: StatWeightsResult; seeds: (SeedAdvice & { heroIndex: number })[] } | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function compute(): Promise<void> {
    const engine = engineRef.current
    const quest = quests.find((q) => q.id === questId)
    if (!engine || !quest) {
      setError('Выберите квест.')
      return
    }
    setError(null)
    setRunning(true)
    try {
      const { weights } = await engine.statWeights(data, [hero], null, quest)
      setState({ weights, seeds: weights.heroes.map((h) => ({ ...seedAdviceFromWeights(weights, SEED_STAT_PER_SEED, h.index), heroIndex: h.index })) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-muted-foreground">Веса статов на квесте:</span>
        <NativeSelect className="max-w-md" value={questId} onChange={(e) => setQuestId(e.target.value)}>
          <NativeSelectOption value="">— выберите квест —</NativeSelectOption>
          {quests.map((q) => (
            <NativeSelectOption key={q.id} value={q.id}>
              {questLabel(q)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Tip text="Симуляция покажет, какой стат сейчас нужнее герою на выбранном квесте. Нужно выбрать квест.">
          <span>
            <Button size="sm" variant="outline" disabled={running || !questId} onClick={() => void compute()}>
              {running ? <Loader2 className="animate-spin" /> : <Sparkles />} Считать веса
            </Button>
          </span>
        </Tip>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {state ? (
        <StatWeightsView
          weights={state.weights}
          team={[{ name: hero.name, def: 0 }]}
          seeds={state.seeds}
          compact
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Веса считаются симуляцией (Монте-Карло) на текущей экипировке героя: сколько даёт +1% крита, +5% ATK, +10 стихии и т. д.
        </p>
      )}
    </div>
  )
}
