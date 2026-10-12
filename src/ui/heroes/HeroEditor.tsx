/**
 * Форма создания и правки героя («Новый герой» и «Изменить» на странице «Герои»).
 *
 * Имя, класс (базовый/промоушен), уровень, Душа Титана, семена ATK/DEF/HP, до 4 навыков и 6 слотов
 * (предмет, качество, камень, дух). Справа — живые статы: их считает `calcStats` на каждое изменение,
 * без симуляции боя (требование владельца, п. 2).
 *
 * Про уровень: рядом с полем — «носит до T{N}» (HERO LEVELS → Max Item Tier). При понижении уровня
 * предметы выше потолка не удаляются, а подсвечиваются в слотах; база статов при смене уровня теряет
 * эталон экспорта (A8) — об этом прямо сказано в форме: HP приблизительно ±9%.
 */
import { useMemo, useState } from 'react'
import { Save, X } from 'lucide-react'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { classIconId, skillIconId } from '#/data/images.ts'
import type { GameData, HeroInstance, HeroSlot, Skill } from '#/data/types.ts'
import {
  baseAccuracyNote,
  classChoices,
  editorClass,
  heroMaxItemTier,
  heroSkillChoices,
  heroSkillOptions,
  skillBlockedForSlot,
  tierOverflowSlots,
  validateHero,
} from '#/engine/heroEditor.ts'
import { SEED_STAT_PER_SEED } from '#/engine/constants.ts'
import { calcStats } from '#/engine/stats.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { HintLabel, Tip } from '#/ui/Hint.tsx'
import { Field, Notice, Section } from '#/ui/layout.tsx'
import { SlotEditor } from './SlotEditor.tsx'
import { ElementIcon, HeroStatTable } from './heroStatTable.tsx'
import { ELEMENT_RU } from './heroView.ts'

export interface HeroEditorProps {
  data: GameData
  /** Редактируемый герой (копия — сохраняется по кнопке). */
  hero: HeroInstance
  /** true — создаётся новый герой (кнопка «Создать»), false — правка существующего. */
  creating?: boolean
  onSave: (hero: HeroInstance) => void
  onCancel: () => void
}

/** Навык в форме: слот, выбор линейки и ступень (ступень по стихии считает движок, A22). */
function SkillPicker({ data, hero, slot, onPick, onClear }: { data: GameData; hero: HeroInstance; slot: number; onPick: (id: string) => void; onClear: () => void }) {
  const currentId = hero.skills[slot]
  const current: Skill | undefined = currentId ? data.skills.find((s) => s.id === currentId) : undefined
  const options = useMemo(() => heroSkillOptions(data, hero), [data, hero])
  const chosen = currentId ? options.find((o) => o.skill.id === currentId) : undefined
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-semibold">Навык {slot + 1}</span>
        {current ? <Badge variant="secondary">{current.rarity ?? '—'} T{current.tier ?? '?'}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <GameIcon kind="skill" id={current ? skillIconId(current.name) : null} label={current?.name ?? 'пусто'} size={24} />
        <NativeSelect
          className="min-w-64 flex-1"
          value={currentId ?? ''}
          onChange={(e) => (e.target.value ? onPick(e.target.value) : onClear())}
          aria-label={`Навык ${slot + 1}`}
        >
          <NativeSelectOption value="">— пусто —</NativeSelectOption>
          {options.map(({ skill, reason }) => (
            <NativeSelectOption key={skill.id} value={skill.id} disabled={reason != null && skill.id !== currentId}>
              {skill.name}
              {skill.tier ? ` (T${skill.tier})` : ''}
              {reason ? ` — нельзя: ${reason}` : ''}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {current ? (
          <Button variant="ghost" size="sm" onClick={onClear} aria-label={`Убрать навык ${slot + 1}`}>
            <X />
          </Button>
        ) : null}
      </div>
      {chosen?.reason ? <p className="mt-1 text-xs text-warning">{chosen.reason}</p> : null}
      {current ? <p className="mt-1 text-xs text-muted-foreground">{current.text}</p> : null}
    </div>
  )
}

export function HeroEditor({ data, hero, creating = false, onSave, onCancel }: HeroEditorProps) {
  const [draft, setDraft] = useState<HeroInstance>(() => structuredClone(hero))
  const [error, setError] = useState<string | null>(null)
  const cls = editorClass(data, draft)
  const maxTier = heroMaxItemTier(data, draft.level)
  const overflow = tierOverflowSlots(data, draft)
  const validation = useMemo(() => validateHero(data, draft), [data, draft])
  const accuracy = baseAccuracyNote(draft)

  /**
   * Живые статы. Ошибка расчёта (неизвестный класс) не должна ронять форму — показываем её текстом.
   */
  const stats = useMemo(() => {
    try {
      return { value: calcStats(draft, data), error: null as string | null }
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [draft, data])
  /** База без эталона — «что было бы по модели роста»: показывается рядом, если эталон есть. */
  const modelStats = useMemo(() => {
    if (!draft.reference) return null
    try {
      return calcStats(draft, data, { useReference: false })
    } catch {
      return null
    }
  }, [draft, data])

  const patch = (p: Partial<HeroInstance>): void => setDraft((cur) => ({ ...cur, ...p }))
  const setSlot = (i: number, slot: HeroSlot): void =>
    setDraft((cur) => ({ ...cur, slots: cur.slots.map((s, j) => (j === i ? slot : s)) }))
  const setSkill = (i: number, id: string | null): void =>
    setDraft((cur) => {
      const skills = [...cur.skills]
      if (id == null) skills.splice(i, 1)
      else if (i < skills.length) skills[i] = id
      else skills.push(id)
      return { ...cur, skills }
    })

  const save = (): void => {
    if (!draft.name.trim()) {
      setError('Укажите имя героя.')
      return
    }
    if (!cls) {
      setError(`Класс «${draft.className}» не найден в игровых данных.`)
      return
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  return (
    <Section
      title={creating ? 'Новый герой' : `Изменить героя: ${hero.name || 'без имени'}`}
      description="Списки предметов, камней, духов и навыков показывают только то, что герой может использовать. Статы пересчитываются сразу."
      action={
        <>
          <Button onClick={save} disabled={!cls}>
            <Save /> {creating ? 'Создать' : 'Сохранить'}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X /> Отмена
          </Button>
        </>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!cls ? <Notice tone="warning">Класс «{draft.className}» не найден в игровых данных — выберите класс из списка.</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <Field label="Имя" className="flex-col items-start gap-1">
              <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Имя героя" aria-label="Имя героя" />
            </Field>
            <Field label="Класс" className="flex-col items-start gap-1" hint="Базовый класс или промоушен. Слоты экипировки и доступные навыки берутся из класса.">
              <NativeSelect
                value={draft.className}
                onChange={(e) => patch({ className: e.target.value })}
                aria-label="Класс героя"
                className="min-w-56"
              >
                {classChoices(data).map((c) => (
                  <NativeSelectOption key={c.name} value={c.name}>
                    {c.baseClass ? `${c.baseClass} → ${c.name}` : c.name} ({c.group})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Уровень" className="flex-col items-start gap-1" hint={`Потолок тира предметов по уровню — HERO LEVELS: на ${draft.level} ур. это T${maxTier ?? '—'}.`}>
              <Input
                type="number"
                min={1}
                max={99}
                className="w-24"
                value={draft.level}
                aria-label="Уровень героя"
                onChange={(e) => patch({ level: Math.max(1, Math.min(99, Math.round(Number(e.target.value)) || 1)) })}
              />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={draft.titanSoul}
                onChange={(e) => patch({ titanSoul: e.target.checked })}
                aria-label="Душа Титана"
              />
              <span className="text-muted-foreground">
                <HintLabel hint="Душа Титана включает бонусы промоушена: статы, слоты и 4-ю ступень навыка (A47).">Душа Титана</HintLabel>
              </span>
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            {cls ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {ELEMENT_RU[cls.element]}
                <ElementIcon element={cls.element} size={16} />
                <span>·</span>
                <span>
                  <b>носит до T{maxTier ?? '—'}</b> на {draft.level} ур.
                </span>
                {maxTier != null && overflow.length > 0 ? (
                  <span className="text-warning">
                    · предметы в слотах {overflow.map((i) => i + 1).join(', ')} выше потолка — «не наденет на этом уровне»
                  </span>
                ) : null}
                {draft.titanSoul && cls.promotion ? <span>· с Душой Титана действует промоушен {cls.promotion}</span> : null}
              </span>
            ) : null}
          </p>
          {accuracy ? <Notice tone="warning">{accuracy}</Notice> : null}

          <fieldset className="rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">
              <HintLabel hint={`Семена силы дают плоскую прибавку к базе: +${SEED_STAT_PER_SEED.atk} ATK, +${SEED_STAT_PER_SEED.hp} HP, +${SEED_STAT_PER_SEED.def} DEF за семя (A55).`}>
                Семена силы
              </HintLabel>
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(['atk', 'def', 'hp'] as const).map((k) => (
                <Field key={k} label={k.toUpperCase()} className="gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={80}
                    className="w-20"
                    value={draft.seeds[k]}
                    aria-label={`Семена ${k.toUpperCase()}`}
                    onChange={(e) => patch({ seeds: { ...draft.seeds, [k]: Math.max(0, Math.round(Number(e.target.value)) || 0) } })}
                  />
                </Field>
              ))}
              <span className="self-end pb-1 text-xs text-muted-foreground">
                выходит +{draft.seeds.atk * SEED_STAT_PER_SEED.atk} ATK / +{draft.seeds.def * SEED_STAT_PER_SEED.def} DEF / +{draft.seeds.hp * SEED_STAT_PER_SEED.hp} HP
              </span>
            </div>
          </fieldset>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              <HintLabel hint="До четырёх навыков из пула класса. Ступень навыка движок считает по стихии героя (A12, A22), а блокировки A40 (одна линейка, один обычный и один эпический навык на оружие) показаны причиной в списке.">
                Навыки
              </HintLabel>
            </h3>
            {[0, 1, 2, 3].map((i) => (
              <SkillPicker
                key={i}
                data={data}
                hero={draft}
                slot={i}
                onPick={(id) => {
                  const blocked = skillBlockedForSlot(data, { ...draft, skills: draft.skills.map((s, j) => (j === i ? '' : s)).filter(Boolean) }, id, i + 1)
                  if (blocked) setError(`Навык ${i + 1}: ${blocked}`)
                  else {
                    setError(null)
                    setSkill(i, id)
                  }
                }}
                onClear={() => setSkill(i, null)}
              />
            ))}
            <p className="text-xs text-muted-foreground">
              Доступно классу: {heroSkillChoices(data, draft).length} навыков
              {draft.titanSoul ? ' (включая ступени промоушена)' : ' (ступени промоушена требует Душа Титана)'}.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              <HintLabel hint="Шесть слотов класса. Камень и дух в слоте — только те, что допустимы для надетого предмета (сродство стихии и духа из BLUEPRINTS).">
                Экипировка
              </HintLabel>
            </h3>
            {draft.slots.map((_, i) => (
              <SlotEditor key={i} data={data} hero={draft} slot={i} onChange={(s) => setSlot(i, s)} />
            ))}
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Статы героя (живой расчёт)</h3>
            {stats.value ? (
              <HeroStatTable label="С этим набором" stats={stats.value} other={draft.reference ? (modelStats ?? undefined) : undefined} otherLabel="Модель без эталона" />
            ) : (
              <Notice tone="error">{stats.error}</Notice>
            )}
            {stats.value ? (
              <p className="mt-2 text-xs text-muted-foreground">
                База: {stats.value.breakdown.baseSource === 'reference' ? 'из эталона экспорта (уровень не менялся, A8)' : 'модель роста по уровню (≈±3% ATK/DEF, ≈±9% HP)'}
                {stats.value.breakdown.skills.length > 0 ? ` · навыков действует: ${stats.value.breakdown.skills.length}` : ''}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border bg-card p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">Ступени навыков</h3>
            {stats.value && stats.value.breakdown.skills.length > 0 ? (
              <ul className="space-y-1">
                {stats.value.breakdown.skills.map((s, i) => (
                  <li key={`${s.id}-${i}`} className="flex items-start gap-1.5">
                    <GameIcon kind="skill" id={skillIconId(s.name)} label={s.name} size={16} />
                    <span>
                      <b>{s.name}</b>
                      {s.tier ? ` — ступень ${s.tier}` : ''}
                      <span className="block text-muted-foreground">{s.type === 'Innate' ? 'врождённый классу' : s.type === 'Enchantment' ? 'от духа' : s.type === 'Artifact' ? 'от артефакта' : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Навыков нет. Ступени зависят от стихии героя: {stats.value?.element ?? 0} при пороге ступени из SKILLS (A12).</p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-3 text-xs">
            <h3 className="mb-2 text-sm font-semibold">Проверка набора</h3>
            {validation.ok ? (
              <p className="text-success">Всё на месте: типы слотов, тир по уровню, камни и духи, один артефакт.</p>
            ) : (
              <ul className="list-disc space-y-0.5 pl-4 text-warning">
                {validation.general.map((g) => (
                  <li key={g}>{g}</li>
                ))}
                {validation.slots.map((s, i) => (s ? <li key={`s${i}`}>слот {i + 1}: {s}</li> : null))}
              </ul>
            )}
          </div>

          <Tip text="Статы считает тот же движок, что и подбор (src/engine/stats.ts) — множители качества, сродство, навыки и семена учтены.">
            <p className="text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Класс: <GameIcon kind="class" id={classIconId(draft.className)} label={draft.className} size={16} /> {draft.className}
              </span>
            </p>
          </Tip>
        </aside>
      </div>
    </Section>
  )
}
