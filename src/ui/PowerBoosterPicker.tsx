/**
 * Выбор усилителя силы (Power Booster) в форме квеста — действует на весь отряд.
 * Числа — stcalc.com (A74); складываются как % боя (PCT_STACKING = pooled, A62), поэтому усилитель
 * суммируется с % карточки героя и аурами чемпиона, а не умножается поверх них.
 */
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import type { PowerBoosterId } from '#/engine/combat.ts'
import { Field } from '#/ui/layout.tsx'
import { POWER_BOOSTER_HINT, POWER_BOOSTER_IDS, POWER_BOOSTER_LABELS } from '#/ui/powerBooster.ts'

export function PowerBoosterPicker({
  value,
  onChange,
  hint = POWER_BOOSTER_HINT,
}: {
  value: PowerBoosterId
  onChange: (v: PowerBoosterId) => void
  hint?: string
}) {
  return (
    <Field label="Усилитель силы" hint={hint}>
      <NativeSelect className="w-64" value={value} onChange={(e) => onChange(e.target.value as PowerBoosterId)}>
        {POWER_BOOSTER_IDS.map((id) => (
          <NativeSelectOption key={id} value={id}>
            {POWER_BOOSTER_LABELS[id]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
