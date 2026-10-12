import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { agreement, checkMatches, removeRealityCheck, setDeadHeroes, teamMembers, type RealityCheck } from '#/data/realityChecks.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Section } from '#/ui/layout.tsx'
import { pct } from './format.ts'

interface RealityChecksViewProps {
  checks: RealityCheck[]
  onChecksChange: (checks: RealityCheck[]) => void
  /** null — отметки недоступны (не режим «Квест»). */
  target: { questLabel: string; teamLabel: string; simWinRate: number } | null
  /** passed — исход боя, dead — кто из отряда погиб (имена из подписи отряда). */
  onMark: (passed: boolean, dead: string[]) => void
}

/**
 * Чекбоксы «погиб» по участникам отряда. Доступное имя — «погиб: <имя>», а не голое имя:
 * иначе чекбокс совпал бы с выбором героя в «Отряде» (e2e ищут героя по `^<имя> `).
 */
function DeadToggles({ members, dead, onChange, idPrefix }: { members: string[]; dead: string[]; onChange: (dead: string[]) => void; idPrefix: string }) {
  return (
    <>
      {members.map((m) => (
        <label key={`${idPrefix}-${m}`} className="flex cursor-pointer items-center gap-1.5">
          <Checkbox aria-label={`погиб: ${m}`} checked={dead.includes(m)} onCheckedChange={(v) => onChange(v === true ? [...dead, m] : dead.filter((x) => x !== m))} />
          <span>{m}</span>
        </label>
      ))}
    </>
  )
}

/** Секция «Проверка на реальности»: отметки «проходит / не проходит», кто погиб, и совпадение с симуляцией. */
export function RealityChecksView({ checks, onChecksChange, target, onMark }: RealityChecksViewProps) {
  const aggr = agreement(checks)
  const members = target ? teamMembers(target.teamLabel) : []
  const [dead, setDead] = useState<string[]>([])
  const mark = (passed: boolean): void => {
    onMark(passed, dead.filter((d) => members.includes(d)))
    setDead([])
  }
  return (
    <Section title="Проверка на реальности">
      {!target ? (
        <p className="mb-3 text-sm text-muted-foreground">Отметки доступны в режиме «Квест» — выберите один квест.</p>
      ) : (
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Tip text="После боя игра показывает, кто из отряда погиб. Отметьте их до кнопки «проходит / не проходит» — это второй сигнал для калибровки, кроме исхода.">
              <span className="text-muted-foreground">Погибли в бою:</span>
            </Tip>
            <DeadToggles members={members} dead={dead} onChange={setDead} idPrefix="new" />
            {dead.length === 0 ? <span className="text-muted-foreground">(не отмечено — значит, никто)</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Отряд <b>{target.teamLabel}</b> на «{target.questLabel}» в игре:
            </span>
            <Tip text="Вы проверили этот набор в игре, и бой выигран. Отметка идёт в статистику точности модели.">
              <Button className="bg-success text-white hover:bg-success/90" onClick={() => mark(true)}>
                проходит
              </Button>
            </Tip>
            <Tip text="Вы проверили этот набор в игре, и бой проигран. Отметка идёт в статистику точности модели.">
              <Button variant="destructive" onClick={() => mark(false)}>
                не проходит
              </Button>
            </Tip>
            <span className="text-muted-foreground">предсказание симуляции: {pct(target.simWinRate)}</span>
          </div>
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
              <Tip text="Кто погиб в этом бою. У старых отметок — «неизвестно»: отметьте погибших, если помните, — отметка начнёт участвовать в калибровке по смертям.">
                <span className="text-muted-foreground">погибли: {c.deadHeroes === undefined ? 'неизвестно' : c.deadHeroes.length === 0 ? 'никто' : ''}</span>
              </Tip>
              <DeadToggles
                members={teamMembers(c.teamLabel)}
                dead={c.deadHeroes ?? []}
                idPrefix={c.id}
                onChange={(next) => void setDeadHeroes(c.id, next).then(onChecksChange)}
              />
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
