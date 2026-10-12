/**
 * Панель Гробницы Титанов: пользователь вводит этаж (HP, ATK, урон AoE, Defense cap → пороги
 * `defCapsFromCap`, барьер и его HP), отмечает модификаторы этажа и сохраняет набор этажей
 * в браузере (IndexedDB), экспортирует/импортирует его JSON-файлом.
 *
 * Числа по умолчанию — stcalc.com (A70/A71/A77): HP 9 000 000, ATK 300, AoE 150, cap 153 600,
 * крит врага 15%, барьер 350. Смысл каждого модификатора — `engine/constants.ts → TOMB_MODIFIERS`.
 */
import { useMemo, useRef, useState } from 'react'
import { Download, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { mergeTombFloors, tombFloorsFromJson, tombFloorsToJson } from '#/data/tombFloors.ts'
import { ELEMENTS } from '#/data/types.ts'
import { TOMB_DEFAULT_STATS, TOMB_MODIFIERS } from '#/engine/constants.ts'
import { tombFloorLabel, type TombFloor } from '#/engine/questMods.ts'
import { Tip } from '#/ui/Hint.tsx'
import { Field, Notice } from '#/ui/layout.tsx'

/** Порядок модификаторов в списке: как в таблице stcalc. */
const MOD_ORDER = Object.keys(TOMB_MODIFIERS)

function NumberField({ label, hint, value, min = 0, onChange }: { label: string; hint: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        aria-label={label}
        className="w-32"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.round(Number(e.target.value) || 0)))}
      />
    </Field>
  )
}

export function TombFloorPanel({
  floors,
  selectedDepth,
  onSelect,
  onSaved,
}: {
  floors: TombFloor[]
  /** Выбранный этаж (null — этаж ещё не выбран). */
  selectedDepth: number | null
  onSelect: (floor: TombFloor | null) => void
  /** Сохранить набор этажей (в IndexedDB — родитель). */
  onSaved: (floors: TombFloor[]) => void
}) {
  const selected = floors.find((f) => f.depth === selectedDepth) ?? null
  const [draft, setDraft] = useState<TombFloor | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /** Текущее редактируемое значение: правки пользователя важнее выбранного этажа. */
  const floor = useMemo(() => {
    if (draft && selectedDepth !== null && draft.depth === selectedDepth) return draft
    return selected ?? draft
  }, [draft, selected, selectedDepth])

  const patch = (p: Partial<TombFloor>): void => {
    if (!floor) return
    setDraft({ ...floor, ...p })
  }

  function newFloor(depth: number): void {
    const f: TombFloor = {
      id: `Tomb of Titans|tomb|${depth}`,
      depth,
      monsterHp: TOMB_DEFAULT_STATS.monsterHp,
      monsterDmg: TOMB_DEFAULT_STATS.monsterDmg,
      monsterAoe: TOMB_DEFAULT_STATS.monsterAoe,
      defenseCap: TOMB_DEFAULT_STATS.defenseCap,
      barrier: null,
      mods: [],
      difficulty: 'Extreme',
    }
    setDraft(f)
    onSelect(f)
    setNote(`Новый этаж ${depth}: заполните HP, ATK и Defense cap с экрана игры и сохраните.`)
  }

  function exportJson(): void {
    const blob = new Blob([tombFloorsToJson(floors)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tomb-floors.json'
    a.click()
    URL.revokeObjectURL(url)
    setNote(`Выгружено этажей: ${floors.length}.`)
  }

  async function importJson(file: File): Promise<void> {
    const parsed = tombFloorsFromJson(await file.text())
    if ('error' in parsed) {
      setNote(`Не удалось прочитать файл — ${parsed.error}`)
      return
    }
    const merged = mergeTombFloors(floors, parsed.floors)
    onSaved(merged)
    setNote(`Загружено этажей: ${parsed.floors.length} (всего ${merged.length}).`)
  }

  const toggleMod = (key: string, on: boolean): void => {
    if (!floor) return
    patch({ mods: on ? [...new Set([...floor.mods, key])] : floor.mods.filter((k) => k !== key) })
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <Field label="Этаж" hint="Этаж Гробницы Титанов: у каждого этажа свои HP, ATK и Defense cap с экрана игры.">
          <NativeSelect
            aria-label="Этаж Гробницы"
            className="w-48"
            value={selectedDepth ?? ''}
            onChange={(e) => {
              const depth = Number(e.target.value)
              setDraft(null)
              onSelect(floors.find((f) => f.depth === depth) ?? null)
            }}
          >
            <NativeSelectOption value="">— выберите этаж —</NativeSelectOption>
            {floors.map((f) => (
              <NativeSelectOption key={f.id} value={f.depth}>
                {tombFloorLabel(f)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="button" variant="outline" size="sm" onClick={() => newFloor((floors.at(-1)?.depth ?? 0) + 1)}>
          <Plus /> Новый этаж
        </Button>
        <Tip text="Выгрузить все сохранённые этажи в JSON-файл (например, чтобы перенести их на другой компьютер).">
          <Button type="button" variant="outline" size="sm" disabled={floors.length === 0} onClick={exportJson}>
            <Download /> Экспорт JSON
          </Button>
        </Tip>
        <Tip text="Загрузить этажи из JSON-файла: этажи с теми же номерами заменяются загруженными.">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Импорт JSON
          </Button>
        </Tip>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Файл с этажами Гробницы"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importJson(file)
            e.target.value = ''
          }}
        />
      </div>

      {floor ? (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <NumberField label="Этаж (номер)" value={floor.depth} min={1} hint="Номер этажа. Этажи с одинаковым номером заменяют друг друга." onChange={(v) => patch({ depth: v })} />
            <NumberField label="HP врага" value={floor.monsterHp} min={1} hint="HP монстра этажа с экрана игры." onChange={(v) => patch({ monsterHp: v })} />
            <NumberField label="ATK врага" value={floor.monsterDmg} hint="Урон обычной атаки монстра (Monster DMG)." onChange={(v) => patch({ monsterDmg: v })} />
            <NumberField label="Урон AoE" value={floor.monsterAoe} hint="Урон AoE-атаки монстра (Monster AOE DMG); шанс AoE — 25%." onChange={(v) => patch({ monsterAoe: v })} />
            <Field label="Defense cap" hint="Один cap с экрана игры: пороги 50/70/75% считаются как cap/6, cap/3, cap (A71). У Гробницы по умолчанию 153 600.">
              <Input type="number" min={1} aria-label="Defense cap" className="w-32" value={floor.defenseCap} onChange={(e) => patch({ defenseCap: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
            </Field>
            <Field label="Барьер" hint="Стихия барьера этажа. Пусто — барьера нет.">
              <NativeSelect aria-label="Стихия барьера" className="w-32" value={floor.barrier?.element ?? ''} onChange={(e) => patch({ barrier: e.target.value ? { element: e.target.value, hp: floor.barrier?.hp ?? 350 } : null })}>
                <NativeSelectOption value="">— без барьера —</NativeSelectOption>
                {ELEMENTS.map((el) => (
                  <NativeSelectOption key={el} value={el}>
                    {el}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <NumberField label="HP барьера" value={floor.barrier?.hp ?? 0} hint="Barrier HP этажа; 0 — барьера нет." onChange={(v) => patch({ barrier: v > 0 ? { element: floor.barrier?.element ?? 'Fire', hp: v } : null })} />
            <Field label="Сложность" hint="У Гробницы в датасете одно значение статов на все сложности; сюда влияет только штраф Extreme (EVA −20 п.п.).">
              <NativeSelect aria-label="Сложность этажа" className="w-28" value={floor.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>
                {['Easy', 'Medium', 'Hard', 'Extreme'].map((d) => (
                  <NativeSelectOption key={d} value={d}>
                    {d}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <p className="mt-3 mb-1 text-sm text-muted-foreground">Модификаторы этажа (проклятия Гробницы, A71/A77):</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {MOD_ORDER.map((key) => {
              const def = TOMB_MODIFIERS[key]
              const on = floor.mods.includes(key)
              return (
                <Tip key={key} text={`${def.label}: ${def.desc}. Источник — stcalc.com (A71/A77).`}>
                  <label className="flex max-w-72 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox aria-label={def.label} checked={on} onCheckedChange={(v) => toggleMod(key, v === true)} />
                    <span>
                      {def.label}
                      <span className="text-muted-foreground"> — {def.desc}</span>
                    </span>
                  </label>
                </Tip>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const merged = mergeTombFloors(floors, [floor])
                onSaved(merged)
                setDraft(null)
                setNote(`Этаж ${floor.depth} сохранён: ${tombFloorLabel(floor)}.`)
              }}
            >
              Сохранить этаж
            </Button>
            <span className="text-xs text-muted-foreground">
              Пороги защиты: {Math.round(floor.defenseCap / 6)} · {Math.round(floor.defenseCap / 3)} · {floor.defenseCap}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Выберите сохранённый этаж или создайте новый — и укажите статы с экрана игры.</p>
      )}

      {note ? (
        <div className="mt-3">
          <Notice tone="success">{note}</Notice>
        </div>
      ) : null}
      {floors.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Сохранено этажей: {floors.length} ({floors.map((f) => f.depth).join(', ')})
          {floor ? (
            <Tip text="Удалить этот этаж из сохранённых.">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = floors.filter((f) => f.depth !== floor.depth)
                  onSaved(next)
                  setDraft(null)
                  onSelect(null)
                  setNote(`Этаж ${floor.depth} удалён.`)
                }}
              >
                <Trash2 /> Удалить этаж {floor.depth}
              </Button>
            </Tip>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
