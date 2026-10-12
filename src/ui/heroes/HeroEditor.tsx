/**
 * Форма создания и правки героя («Новый герой» и «Изменить» на странице «Герои»).
 *
 * Имя, класс (базовый/промоушен), уровень, Душа Титана, семена ATK/DEF/HP, до 4 навыков и 6 слотов
 * (предмет, качество, камень, дух). Справа — живые статы: их считает `calcStats` на каждое изменение,
 * без симуляции боя (требование владельца, п. 2).
 *
 * Про уровень: рядом с полем — «носит до T{N}» (HERO LEVELS → Max Item Tier). При понижении уровня
 * предметы выше потолка не удаляются, а подсвечиваются в слотах; база статов при смене уровня теряет
 * эталон экспорта (A8) — об этом прямо сказано в форме: HP приблизительно ±7%.
 */
import { useMemo, useState } from 'react'
import { Save, Sparkles, X } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
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
import { IconPicker, type PickerOption } from '#/ui/IconPicker.tsx'
import { Field, Notice, Section } from '#/ui/layout.tsx'
import { NumberStepper } from '#/ui/NumberStepper.tsx'
import { SlotEditor } from './SlotEditor.tsx'
import { ElementIcon, HeroStatTable } from './heroStatTable.tsx'
import { ELEMENT_RU } from './heroView.ts'

/** Цвет подписи семени по стату. */
const SEED_TONE = { atk: 'text-red-600 dark:text-red-400', def: 'text-sky-600 dark:text-sky-400', hp: 'text-emerald-600 dark:text-emerald-400' } as const

export interface HeroEditorProps {
  data: GameData
  /** Редактируемый герой (копия — сохраняется по кнопке). */
  hero: HeroInstance
  /** true — создаётся новый герой (кнопка «Создать»), false — правка существующего. */
  creating?: boolean
  onSave: (hero: HeroInstance) => void
  onCancel: () => void
}

/** Цвет рамки карточки навыка по редкости (Common / Rare / Epic). */
const RARITY_TONE: Record<string, string> = {
  Common: 'border-l-neutral-400',
  Rare: 'border-l-sky-500',
  Epic: 'border-l-violet-500',
}

/** Навык в форме: карточка с иконкой и выбор из пула класса (ступень по стихии считает движок, A22). */
function SkillPicker({ data, hero, slot, onPick, onClear }: { data: GameData; hero: HeroInstance; slot: number; onPick: (id: string) => void; onClear: () => void }) {
  const currentId = hero.skills[slot]
  const current: Skill | undefined = currentId ? data.skills.find((s) => s.id === currentId) : undefined
  const options = useMemo(() => heroSkillOptions(data, hero), [data, hero])
  const chosen = currentId ? options.find((o) => o.skill.id === currentId) : undefined
  const pickerOptions = useMemo<PickerOption[]>(
    () =>
      options.map(({ skill, reason }) => ({
        value: skill.id,
        label: skill.name,
        icon: <GameIcon kind="skill" id={skillIconId(skill.name)} label={skill.name} size={28} decorative />,
        detail: `${skill.rarity ?? '—'}${skill.tier ? ` · T${skill.tier}` : ''}${skill.text ? ` · ${skill.text}` : ''}`,
        group: skill.rarity ?? 'Прочие',
        disabledReason: reason,
      })),
    [options],
  )
  // Следующий пустой слот доступен, только если заполнен предыдущий: навыки идут по порядку.
  const locked = !currentId && slot > hero.skills.length
  return (
    <div className={cn('rounded-lg border border-l-4 bg-card p-2.5', current ? (RARITY_TONE[current.rarity ?? ''] ?? 'border-l-primary') : 'border-l-transparent border-dashed')}>
      <div className="flex items-start gap-3">
        <GameIcon kind="skill" id={current ? skillIconId(current.name) : null} label={current?.name ?? String(slot + 1)} size={44} className="rounded-md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Навык {slot + 1}</span>
            {current ? <Badge variant="secondary">{current.rarity ?? '—'} T{current.tier ?? '?'}</Badge> : null}
          </div>
          <IconPicker
            value={currentId ?? null}
            options={pickerOptions}
            onChange={(id) => (id ? onPick(id) : onClear())}
            ariaLabel={`Навык ${slot + 1}`}
            placeholder={locked ? 'сначала заполните предыдущий' : 'Выбрать навык…'}
            clearLabel="Убрать навык"
            disabled={locked}
            contentClassName="w-[26rem]"
          />
        </div>
        {current ? (
          <Button variant="ghost" size="sm" onClick={onClear} aria-label={`Убрать навык ${slot + 1}`}>
            <X />
          </Button>
        ) : null}
      </div>
      {chosen?.reason ? <p className="mt-1 text-xs text-warning">{chosen.reason}</p> : null}
      {current?.text ? <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{current.text}</p> : null}
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

  const classOptions = useMemo<PickerOption[]>(
    () =>
      classChoices(data).map((c) => ({
        value: c.name,
        label: c.name,
        detail: c.baseClass ? `промоушен ${c.baseClass} → ${c.name}` : 'базовый класс',
        icon: <GameIcon kind="class" id={classIconId(c.name)} label={c.name} size={28} decorative />,
        badge: <ElementIcon element={c.element} size={16} decorative />,
        group: c.group,
        keywords: c.baseClass ?? '',
      })),
    [data],
  )

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
      description="Списки предметов и навыков показывают только то, что герой может использовать; камень и дух можно вставить в любой предмет — сродство даёт бонус. Статы пересчитываются сразу."
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
          {/* Шапка: портрет класса, имя, класс, уровень, Душа Титана */}
          <div className="rounded-lg border bg-gradient-to-br from-primary/10 via-card to-card p-3">
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative shrink-0">
                <GameIcon kind="class" id={classIconId(draft.className)} label={draft.className} size={72} className="rounded-lg bg-muted/40 p-1" />
                {cls ? (
                  <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-card p-0.5 shadow">
                    <ElementIcon element={cls.element} size={22} />
                  </span>
                ) : null}
              </div>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <Field label="Имя" className="flex-col items-stretch gap-1">
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Имя героя" aria-label="Имя героя" />
                </Field>
                <Field label="Класс" className="flex-col items-stretch gap-1" hint="Базовый класс или промоушен. Слоты экипировки и доступные навыки берутся из класса.">
                  <IconPicker
                    value={draft.className}
                    options={classOptions}
                    onChange={(v) => {
                      if (v) patch({ className: v })
                    }}
                    ariaLabel="Класс героя"
                    contentClassName="w-[22rem]"
                  />
                </Field>
                <Field label="Уровень" className="flex-col items-stretch gap-1" hint={`Потолок тира предметов по уровню — HERO LEVELS: на ${draft.level} ур. это T${maxTier ?? '—'}.`}>
                  <div className="flex items-center gap-2">
                    <NumberStepper value={draft.level} min={1} max={99} onChange={(level) => patch({ level })} ariaLabel="Уровень героя" />
                    <input
                      type="range"
                      min={1}
                      max={99}
                      value={draft.level}
                      onChange={(e) => patch({ level: Number(e.target.value) })}
                      className="min-w-0 flex-1 accent-primary"
                      aria-hidden
                      tabIndex={-1}
                    />
                  </div>
                </Field>
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">
                    <HintLabel hint="Душа Титана включает бонусы промоушена: статы, слоты и 4-ю ступень навыка (A47).">Душа Титана</HintLabel>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.titanSoul}
                    aria-label="Душа Титана"
                    onClick={() => patch({ titanSoul: !draft.titanSoul })}
                    className={cn(
                      'inline-flex h-9 w-fit items-center gap-2 rounded-md border px-3 text-sm transition-colors',
                      draft.titanSoul ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Sparkles className="size-4" /> {draft.titanSoul ? 'Есть' : 'Нет'}
                  </button>
                </div>
              </div>
            </div>

            {cls ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <ElementIcon element={cls.element} size={14} /> {ELEMENT_RU[cls.element]}
                </Badge>
                <Badge variant="secondary">{cls.group}</Badge>
                <Badge variant="secondary">
                  <b>носит до T{maxTier ?? '—'}</b>&nbsp;на {draft.level} ур.
                </Badge>
                {draft.titanSoul && cls.promotion ? <Badge variant="secondary">с Душой Титана действует промоушен {cls.promotion}</Badge> : null}
                {maxTier != null && overflow.length > 0 ? (
                  <span className="text-warning">предметы в слотах {overflow.map((i) => i + 1).join(', ')} выше потолка — «не наденет на этом уровне»</span>
                ) : null}
              </div>
            ) : null}
          </div>
          {accuracy ? <Notice tone="warning">{accuracy}</Notice> : null}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              <HintLabel hint="До четырёх навыков из пула класса. Ступень навыка движок считает по стихии героя (A12, A22), а блокировки A40 (одна линейка, один обычный и один эпический навык на оружие) показаны причиной в списке.">
                Навыки
              </HintLabel>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                доступно классу: {heroSkillChoices(data, draft).length}
                {draft.titanSoul ? ' (включая ступени промоушена)' : ' (ступени промоушена требует Душа Титана)'}
              </span>
            </h3>
            <div className="grid gap-2 md:grid-cols-2">
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
            </div>
          </div>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">
              <HintLabel hint={`Семена силы дают плоскую прибавку к базе: +${SEED_STAT_PER_SEED.atk} ATK, +${SEED_STAT_PER_SEED.hp} HP, +${SEED_STAT_PER_SEED.def} DEF за семя (A55).`}>
                Семена силы
              </HintLabel>
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['atk', 'def', 'hp'] as const).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={cn('w-9 text-xs font-bold', SEED_TONE[k])}>{k.toUpperCase()}</span>
                  <NumberStepper
                    value={draft.seeds[k]}
                    min={0}
                    max={80}
                    onChange={(n) => patch({ seeds: { ...draft.seeds, [k]: n } })}
                    ariaLabel={`Семена ${k.toUpperCase()}`}
                  />
                  <span className="text-xs text-muted-foreground">+{draft.seeds[k] * SEED_STAT_PER_SEED[k]}</span>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              <HintLabel hint="Шесть слотов класса. Камень и дух вставляются в любой предмет (A65): сродство предмета (Elemental/Spirit Affinity) не разрешение, а бонус — такие варианты помечены «✦ сродство».">
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
                База: {stats.value.breakdown.baseSource === 'reference' ? 'из эталона экспорта (уровень не менялся, A8)' : 'модель роста по уровню (≈±3% ATK/DEF, ≈±7% HP)'}
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
              <p className="text-success">Всё на месте: типы слотов, тир по уровню, один артефакт. Камень и дух можно вставить в любой предмет (сродство — бонус).</p>
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
