import { Check, Trash2, X } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { agreement, checkMatches, removeRealityCheck, type RealityCheck } from '#/data/realityChecks.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Section } from '#/ui/layout.tsx'
import { pct } from './format.ts'

interface RealityChecksViewProps {
  checks: RealityCheck[]
  onChecksChange: (checks: RealityCheck[]) => void
  /** null — отметки недоступны (не режим «Квест»). */
  target: { questLabel: string; teamLabel: string; simWinRate: number } | null
  onMark: (passed: boolean) => void
}

/** Секция «Проверка на реальности»: отметки «проходит / не проходит» и их совпадение с симуляцией. */
export function RealityChecksView({ checks, onChecksChange, target, onMark }: RealityChecksViewProps) {
  const aggr = agreement(checks)
  return (
    <Section title="Проверка на реальности">
      {!target ? (
        <p className="mb-3 text-sm text-muted-foreground">Отметки доступны в режиме «Квест» — выберите один квест.</p>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span>
            Отряд <b>{target.teamLabel}</b> на «{target.questLabel}» в игре:
          </span>
          <Tip text="Вы проверили этот набор в игре, и бой выигран. Отметка идёт в статистику точности модели.">
            <Button className="bg-success text-white hover:bg-success/90" onClick={() => onMark(true)}>
              проходит
            </Button>
          </Tip>
          <Tip text="Вы проверили этот набор в игре, и бой проигран. Отметка идёт в статистику точности модели.">
            <Button variant="destructive" onClick={() => onMark(false)}>
              не проходит
            </Button>
          </Tip>
          <span className="text-muted-foreground">предсказание симуляции: {pct(target.simWinRate)}</span>
        </div>
      )}
      <p className="mb-2 text-sm text-muted-foreground">
        Совпадений предсказаний с отметками: {aggr.matched} из {aggr.total} (считаем «проходит» ↔ win rate ≥ 50%).
      </p>
      <ul className="divide-y rounded-lg border text-sm">
        {checks.map((c) => {
          const ok = checkMatches(c)
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              {ok ? <Check className="size-4 text-success" aria-label="совпало" /> : <X className="size-4 text-destructive" aria-label="не совпало" />}
              <span className="flex-1">
                {c.questLabel} · {c.teamLabel} · {c.passed ? 'проходит' : 'не проходит'} · симуляция {pct(c.simWinRate)}
              </span>
              <Tip text="Удалить эту отметку из статистики точности.">
                <Button variant="ghost" size="xs" onClick={() => void removeRealityCheck(c.id).then(onChecksChange)}>
                  <Trash2 /> удалить
                </Button>
              </Tip>
            </li>
          )
        })}
        {checks.length === 0 ? <li className="px-3 py-2 text-muted-foreground">Отметок пока нет.</li> : null}
      </ul>
    </Section>
  )
}
