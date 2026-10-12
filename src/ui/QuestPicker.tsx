/**
 * Выбор квеста: локация → сложность → тип (общий для «Команд» и «Ростера»).
 * `noneValue` задаёт значение пункта «не выбрана»: в «Командах» у цели команды это пустая строка,
 * а у прогона — отдельный маркер, потому что пустая строка там означает «взять локацию команды».
 */
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import type { Quest } from '#/data/types.ts'
import { Field } from '#/ui/layout.tsx'

/** Сложности, которые показываем в списке всегда (у Lost City of Gold вместо них уровни 1–13). */
const QUEST_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Extreme'] as const

export function QuestPicker({
  quests,
  areas,
  quest,
  label = 'Целевая локация',
  onChange,
  noneValue,
}: {
  quests: Quest[]
  areas: string[]
  quest: Quest | null
  label?: string
  onChange: (q: Quest | null) => void
  noneValue?: string
}) {
  const pick = (diff: string, variant: Quest['variant']): Quest | null =>
    quests.find((q) => q.area === quest?.area && q.difficulty === diff && q.variant === variant) ?? null
  const diffs = [...new Set([...QUEST_DIFFICULTIES, ...quests.map((q) => q.difficulty)])]
  /** Тип в списке: у квеста с мини-боссом (`miniboss`) выбран «босс» — мини-босс задаётся отдельно. */
  const variantValue: 'normal' | 'boss' = quest && quest.variant !== 'normal' ? 'boss' : 'normal'
  return (
    <>
      <Field label={label}>
        <NativeSelect
          className="w-48"
          value={quest?.area ?? noneValue ?? ''}
          onChange={(e) => {
            const area = e.target.value
            if (!area || area === noneValue) return onChange(null)
            const inArea = quests.filter((q) => q.area === area)
            onChange(inArea.find((q) => q.difficulty === quest?.difficulty && q.variant === quest?.variant) ?? inArea[0] ?? null)
          }}
        >
          <NativeSelectOption value={noneValue ?? ''}>— не выбрана —</NativeSelectOption>
          {areas.map((a) => (
            <NativeSelectOption key={a} value={a}>
              {a}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Сложность">
        <NativeSelect className="w-28" value={quest?.difficulty ?? ''} disabled={!quest} onChange={(e) => onChange(pick(e.target.value, quest?.variant ?? 'boss'))}>
          {diffs.map((d) => (
            <NativeSelectOption key={d} value={d}>
              {d}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Тип">
        <NativeSelect
          className="w-28"
          value={variantValue}
          disabled={!quest}
          onChange={(e) => onChange(pick(quest?.difficulty ?? 'Hard', e.target.value as 'normal' | 'boss'))}
        >
          <NativeSelectOption value="normal">обычный</NativeSelectOption>
          <NativeSelectOption value="boss">босс</NativeSelectOption>
        </NativeSelect>
      </Field>
    </>
  )
}
