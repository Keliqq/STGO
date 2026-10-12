/**
 * Модификаторы квеста в форме: мини-босс (Agile/Dire/Huge/Legendary/Wealthy) и флаг Flash-задания
 * (у Flash-версии Nullysium — свои штрафы EVA/крита героям). Числа и смысл — `engine/constants.ts`
 * и `engine/questMods.ts` (источник — stcalc.com, A17/A53/A71/A77).
 *
 * Компонент только выбирает; к квесту модификаторы применяет `applyQuestMods` (в форме — `useMemo`).
 */
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { MINI_BOSSES, MINI_BOSS_ORDER } from '#/engine/constants.ts'
import { miniBossDesc } from '#/engine/questMods.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Field } from '#/ui/layout.tsx'

export function MiniBossPicker({ value, onChange, disabled }: { value: string; onChange: (key: string) => void; disabled?: boolean }) {
  return (
    <Field
      label="Мини-босс"
      hint="Мини-боссы появляются в квестах случайно: Agile уклоняется, Dire критует, Huge бьёт AoE, Legendary усиливает всё, Wealthy даёт только добычу. Числа — stcalc.com (A17/A77). Мини-босс считается боссом: «Bonuses are doubled against bosses» работает и на нём."
    >
      <NativeSelect aria-label="Мини-босс" className="w-48" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <NativeSelectOption value="">— без мини-босса —</NativeSelectOption>
        {MINI_BOSS_ORDER.map((key) => (
          <NativeSelectOption key={key} value={key}>
            {MINI_BOSSES[key].label} — {miniBossDesc(key)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

export function FlashQuestToggle({ value, onChange, disabled }: { value: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox aria-label="Flash-задание" checked={value} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <Tip text="Flash-задание: бонусы Bjorn удваиваются, а у Nullysium герои теряют 30 п.п. EVA и 30 п.п. крита (Flash на Extreme — 20 п.п. EVA). Источник — stcalc.com (A53/A77).">
        <span>Flash-задание</span>
      </Tip>
    </label>
  )
}
