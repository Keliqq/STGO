import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { deathsKnown, loadRealityChecks, modelAccuracy, type RealityCheck } from '#/data/realityChecks.ts'
import { ENGINE_MODEL_VERSION } from '#/engine/constants.ts'
import { Notice, Section } from '#/ui/layout.tsx'
import { pct } from '#/ui/optimize/format.ts'

/**
 * Блок «Точность модели» на «Данных»: по накопленным отметкам «проходит / не проходит в игре»
 * показываем N боёв, долю совпадений с предсказанием и дату калибровки.
 * Подробный разбор (Brier score, разрезы ошибок, чувствительность к допущениям) — `npm run calibrate`.
 */
export function ModelAccuracyView() {
  const [checks, setChecks] = useState<RealityCheck[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadRealityChecks().then((r) => {
      setChecks(r.checks)
      setError(r.error)
    })
  }, [])

  if (!checks) {
    return (
      <Section title="Точность модели">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </Section>
    )
  }

  const acc = modelAccuracy(checks, ENGINE_MODEL_VERSION)
  return (
    <Section
      title="Точность модели"
      description={
        <>
          Отметки «проходит / не проходит в игре» со страницы «Подбор». Совпадение считается при пороге win rate 50 %: «проходит» ↔
          win rate ≥ 50 %. Отметки хранятся только в вашем браузере и попадают в резервную копию.
        </>
      }
    >
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {acc.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Отметок пока нет. Проведите бой в игре, отметьте его на «Подборе» — и здесь появится точность симуляции.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Отмечено боёв</dt>
            <dd className="font-medium">{acc.total}</dd>
            <dt className="text-muted-foreground">Совпало с предсказанием</dt>
            <dd className="font-medium">
              {acc.matched} из {acc.total} ({pct(acc.agreement)})
            </dd>
            <dt className="text-muted-foreground">Погибшие отмечены</dt>
            <dd>
              в {checks.filter(deathsKnown).length} из {acc.total}
            </dd>
            <dt className="text-muted-foreground">Дата калибровки</dt>
            <dd>{acc.calibratedAt ? new Date(acc.calibratedAt).toLocaleString('ru-RU') : '—'}</dd>
          </dl>
          {acc.stale > 0 ? (
            <Notice className="mt-3" tone="warning">
              Отметок, сделанных до текущей версии модели боя (v{ENGINE_MODEL_VERSION}): {acc.stale}. Формулы с тех пор менялись — их
              стоит перепроверить в игре, чтобы точность считалась по одной модели.
            </Notice>
          ) : null}
          <ul className="mt-3 divide-y rounded-lg border text-sm">
            {checks.map((c) => {
              const ok = c.passed === c.simWinRate >= 0.5
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  {ok ? (
                    <Check className="size-4 text-success" aria-label="совпало" />
                  ) : (
                    <X className="size-4 text-destructive" aria-label="не совпало" />
                  )}
                  <span className="flex-1">
                    {c.questLabel} · {c.teamLabel} · {c.passed ? 'проходит' : 'не проходит'} · симуляция {pct(c.simWinRate)}
                  </span>
                  <span className="text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('ru-RU') : '—'}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Полный разбор (Brier score, ошибки по классам, квестам, сложности, экстриму и барьеру, чувствительность к допущениям):{' '}
            <code>npm run calibrate</code>.
          </p>
        </>
      )}
    </Section>
  )
}
