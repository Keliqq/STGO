/**
 * Редактор одного слота экипировки: предмет, качество, камень стихии, дух.
 *
 * Список предметов показывает ТОЛЬКО то, что герой может надеть (требование владельца):
 *   · тип разрешён этому слоту класса (HEROES, Equipment Slot 1–6; у промоушена свои слоты);
 *   · тир ≤ Max Item Tier уровня героя (HERO LEVELS) — рядом с уровнем подпись «носит до T{N}»;
 *   · не больше одного артефактного предмета на героя;
 *   · предметы, привязанные к классу/навыку, — только своему классу.
 * Запрещённое не исчезает молча: оно в конце списка, с причиной (и подсвечено, если уже надето).
 * Камень и дух — любые (A65): сродство предмета не разрешение, а бонус, поэтому варианты помечаются
 * «✦ сродство», а камень другой стихии — оговоркой «не даёт стихию этому герою» (A21).
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Search, X } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select.tsx'
import { elementIconId, itemIconId, spiritIconId, typeIconId } from '#/data/images.ts'
import { QUALITIES, type GameData, type HeroInstance, type HeroSlot, type Item } from '#/data/types.ts'
import {
  editorClass,
  heroHasArtifact,
  heroMaxItemTier,
  itemOptions,
  qualityMultiplier,
  slotEnchantChoices,
  spiritAffinityOnItem,
  spiritSkillOf,
  stoneAffinityOnItem,
  stoneCountsForHeroElement,
  tierOverflowSlots,
} from '#/engine/heroEditor.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { HintLabel, Tip } from '#/ui/Hint.tsx'
import { ElementIcon } from './heroStatTable.tsx'

export interface SlotEditorProps {
  data: GameData
  hero: HeroInstance
  slot: number
  onChange: (slot: HeroSlot) => void
  /** Сколько предметов показывать в списке (остальные — под поиском). */
  limit?: number
}

/** Краткая строка статов предмета для списка: «ATK 120 · DEF 40». */
function itemStatsLine(item: Item, quality: HeroSlot['quality']): string {
  // В GameData статы посчитаны для каждого качества сразу (Item.stats[quality], A7) — множитель не нужен.
  const st = item.stats[quality] ?? item.stats.Normal
  const parts: string[] = []
  if (st.atk > 0) parts.push(`ATK ${Math.round(st.atk)}`)
  if (st.def > 0) parts.push(`DEF ${Math.round(st.def)}`)
  if (st.hp > 0) parts.push(`HP ${Math.round(st.hp)}`)
  return parts.join(' · ')
}

/** Один слот: предмет (поиск + список), качество, камень, дух. */
export function SlotEditor({ data, hero, slot, onChange, limit = 40 }: SlotEditorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** Связь поля поиска со списком (aria-controls) — список отдельный элемент, а не обёртка поля. */
  const listId = `slot-items-${slot}`
  const current = hero.slots[slot]
  const item = current.item ? (data.items.find((i) => i.name === current.item) ?? null) : null
  const maxTier = heroMaxItemTier(data, hero.level)
  const options = useMemo(() => (open ? itemOptions(data, hero, slot, query) : []), [data, hero, slot, query, open])
  const { stones, spirits } = useMemo(() => slotEnchantChoices(data, hero, slot), [data, hero, slot])
  const shown = options.slice(0, limit)
  const hidden = options.length - shown.length
  const overflow = tierOverflowSlots(data, hero).includes(slot)
  const artifacts = useMemo(() => data.items.filter((i) => i.artifactSkill).map((i) => i.name), [data])
  const artifactElsewhere = heroHasArtifact(data, hero, slot)
  const cls = editorClass(data, hero)
  const stone = current.element ? (data.enchants.find((e) => e.name === current.element) ?? null) : null
  const spirit = current.spirit ? (data.enchants.find((e) => e.name === current.spirit) ?? null) : null
  const slotTypes = cls?.slots[slot] ?? []

  /**
   * Выбор предмета: камень и дух остаются — вставить их можно в любой предмет (A65). Снятие предмета
   * очищает слот целиком: зачаровывать нечего.
   */
  const pick = (next: Item | null): void => {
    onChange(next ? { ...current, item: next.name } : { ...current, item: null, element: null, spirit: null })
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={cn('rounded-md border p-2', overflow ? 'border-warning bg-warning/5' : 'bg-muted/20')}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Слот {slot + 1}</span>
        <span className="text-muted-foreground">{slotTypes.join(' / ')}</span>
        {overflow ? (
          <span className="inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="size-3.5" /> не наденет на этом уровне (T{data.items.find((i) => i.name === current.item)?.tier}
            {maxTier != null ? ` > T${maxTier}` : ''})
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <GameIcon kind="item" id={item ? itemIconId(item.name) : null} label={item?.name ?? 'пусто'} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium">{item?.name ?? '— пусто —'}</span>
            {item ? <Badge variant="secondary">T{item.tier}</Badge> : null}
            {item?.artifactSkill ? <Badge variant="secondary">артефакт</Badge> : null}
            {item ? (
              <span className="text-xs text-muted-foreground">
                {itemStatsLine(item, current.quality)}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <button type="button" className="underline decoration-dotted" onClick={() => setOpen((v) => !v)}>
              {open ? 'Скрыть список' : 'Выбрать предмет'}
            </button>
            {item ? (
              <button type="button" className="underline decoration-dotted" onClick={() => pick(null)}>
                Снять
              </button>
            ) : null}
            {artifactElsewhere && artifacts.length > 0 ? <span className="text-warning">на герое уже есть артефакт — второй нельзя</span> : null}
          </div>
        </div>

        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">
            <HintLabel hint="Качество предмета умножает его ATK/DEF/HP (A7): Superior ×1,25, Flawless ×1,5, Epic ×2, Legendary ×3.">Качество</HintLabel>
          </span>
          <NativeSelect value={current.quality} onChange={(e) => onChange({ ...current, quality: e.target.value as HeroSlot['quality'] })}>
            {QUALITIES.map((q) => (
              <NativeSelectOption key={q} value={q}>
                {q} ×{qualityMultiplier(q)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {open ? (
        <div className="mt-2 rounded-md border bg-card p-2">
          <div className="mb-2 flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени"
              className="h-8"
              aria-label={`Поиск предмета в слоте ${slot + 1}`}
              aria-controls={listId}
            />
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Закрыть список">
              <X />
            </Button>
          </div>
          <p className="mb-1 text-xs text-muted-foreground">
            Сверху — максимальный доступный тир{maxTier != null ? ` (до T${maxTier} на ${hero.level} ур.)` : ''}, ниже — то, что надеть нельзя, с причиной.
          </p>
          <ul id={listId} className="max-h-64 overflow-y-auto text-sm" role="listbox" aria-label={`Предметы слота ${slot + 1}`}>
            {shown.map(({ item: opt, code, reason }) => (
              <li key={opt.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.name === current.item}
                  disabled={code != null}
                  onClick={() => pick(opt)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left',
                    code ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted',
                    opt.name === current.item && 'bg-primary/10',
                  )}
                >
                  <GameIcon kind="item" id={itemIconId(opt.name)} label={opt.name} size={24} />
                  <GameIcon kind="type" id={typeIconId(opt.type)} label={opt.type} size={20} />
                  <span className="min-w-0 flex-1 truncate">{opt.name}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    T{opt.tier} · {itemStatsLine(opt, current.quality)}
                  </span>
                  {reason ? <span className="text-xs whitespace-nowrap text-warning">{reason}</span> : null}
                </button>
              </li>
            ))}
            {options.length === 0 ? <li className="px-1.5 py-1 text-muted-foreground">Ничего не найдено.</li> : null}
          </ul>
          {hidden > 0 ? <p className="mt-1 text-xs text-muted-foreground">Показаны первые {shown.length} из {options.length} — уточните поиск.</p> : null}
        </div>
      ) : null}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">
            <HintLabel hint="Вставить можно любой камень стихии (A65): он даёт ATK/DEF/HP и величину стихии против барьера. Сродство предмета («✦ сродство») усиливает камень ×1,5 (A6), а камень чужой стихии стихии герою не даёт (A21).">
              Камень
            </HintLabel>
          </span>
          <NativeSelect
            value={current.element ?? ''}
            disabled={!item}
            onChange={(e) => onChange({ ...current, element: e.target.value || null })}
          >
            <NativeSelectOption value="">{!item ? '— сначала предмет —' : '— без камня —'}</NativeSelectOption>
            {stones.map(({ enchant: s, affinity, note }) => (
              <NativeSelectOption key={s.name} value={s.name}>
                {s.name} (+{s.elementValue}
                {s.element ? ` ${s.element}` : ''}){affinity ? ' ✦ сродство' : ''}
                {note ? ` — ${note}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {current.element ? <GameIcon kind="element" id={stone?.iconId ?? elementIconId('Any')} label={current.element} size={16} /> : null}
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">
            <HintLabel hint="Вставить можно любой дух (A65): он даёт свои статы и навык. Если у предмета есть сродство духа («✦ сродство», Spirit Affinity), навык даётся в «+»-версии (A5).">
              Дух
            </HintLabel>
          </span>
          <NativeSelect
            value={current.spirit ?? ''}
            disabled={!item}
            onChange={(e) => onChange({ ...current, spirit: e.target.value || null })}
          >
            <NativeSelectOption value="">{!item ? '— сначала предмет —' : '— без духа —'}</NativeSelectOption>
            {spirits.map(({ enchant: s, affinity }) => {
              const skillName = spiritSkillOf(data, s)?.name
              return (
                <NativeSelectOption key={s.name} value={s.name}>
                  {s.name}
                  {skillName ? ` — ${skillName}` : ''}
                  {affinity ? ' ✦ сродство' : ''}
                </NativeSelectOption>
              )
            })}
          </NativeSelect>
          {current.spirit ? <GameIcon kind="spirit" id={spiritIconId(current.spirit)} label={current.spirit} size={16} /> : null}
        </label>
      </div>
      {item ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {item.elementAffinity === 'All' ? (
            <span className="inline-flex items-center gap-1">сродство: любая стихия <ElementIcon element="Any" size={14} /></span>
          ) : item.elementAffinity.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              сродство:
              {item.elementAffinity.map((el) => (
                <ElementIcon key={el} element={el} size={14} />
              ))}
            </span>
          ) : (
            <span>сродства стихии нет</span>
          )}
          {item.spiritAffinity ? <span>сродство духа: {item.spiritAffinity}</span> : <span>сродства духа нет</span>}
          {item.builtInElement ? <span>встроенный камень: {item.builtInElement}</span> : null}
        </p>
      ) : null}
      {item && (stone || spirit) ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          {stone && current.element ? (
            <span className={stoneAffinityOnItem(stone, item) ? 'text-success' : 'text-muted-foreground'}>
              {stoneAffinityOnItem(stone, item) ? 'камень: ✦ сродство — бонус ×1,5 (A6)' : 'камень: без сродства к предмету — бонус не включается (A6)'}
              {stoneCountsForHeroElement(stone, cls) ? '' : ' · не даёт стихию этому герою (A21)'}
            </span>
          ) : null}
          {spirit ? (
            <span className={spiritAffinityOnItem(data, spirit, item) ? 'text-success' : 'text-muted-foreground'}>
              {spiritAffinityOnItem(data, spirit, item) ? 'дух: ✦ сродство — навык в «+»-версии (A5)' : 'дух: без сродства к предмету — обычная версия навыка (A5)'}
            </span>
          ) : null}
        </p>
      ) : null}
      {overflow ? (
        <p className="mt-1 text-xs text-warning">
          <Tip text="При понижении уровня предмет не снимается автоматически: он остаётся в наборе, но игра его не наденет. Поменяйте предмет на доступный по тиру.">
            <span>подсвечено: тир выше потолка уровня — выберите предмет до T{maxTier ?? '—'}</span>
          </Tip>
        </p>
      ) : null}
    </div>
  )
}
