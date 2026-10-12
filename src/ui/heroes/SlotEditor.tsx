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
import { elementIconId, itemIconId, skillIconId, spiritIconId, typeIconId } from '#/data/images.ts'
import { QUALITIES, type Enchant, type GameData, type HeroInstance, type HeroSlot, type Item } from '#/data/types.ts'
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
import { IconPicker, type PickerOption } from '#/ui/IconPicker.tsx'
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

/** Цвета качества — как в игре: серый, зелёный, голубой, фиолетовый, золотой. */
const QUALITY_TONE: Record<HeroSlot['quality'], string> = {
  Normal: 'border-neutral-400/60 text-neutral-600 dark:text-neutral-300 data-[on=true]:bg-neutral-400/25',
  Superior: 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300 data-[on=true]:bg-emerald-500/20',
  Flawless: 'border-sky-500/60 text-sky-700 dark:text-sky-300 data-[on=true]:bg-sky-500/20',
  Epic: 'border-violet-500/60 text-violet-700 dark:text-violet-300 data-[on=true]:bg-violet-500/20',
  Legendary: 'border-amber-500/70 text-amber-700 dark:text-amber-300 data-[on=true]:bg-amber-500/25',
}
const QUALITY_RU: Record<HeroSlot['quality'], string> = { Normal: 'Обычн.', Superior: 'Отличн.', Flawless: 'Безупр.', Epic: 'Эпич.', Legendary: 'Легенд.' }
/** Рамка иконки предмета по качеству. */
const QUALITY_RING: Record<HeroSlot['quality'], string> = {
  Normal: 'ring-neutral-400/50',
  Superior: 'ring-emerald-500/70',
  Flawless: 'ring-sky-500/70',
  Epic: 'ring-violet-500/70',
  Legendary: 'ring-amber-500/80',
}

/** Иконка камня/духа: картинка самого чертежа, если она известна, иначе — значок стихии/духа. */
function EnchantIcon({ enchant, size }: { enchant: Enchant; size: number }) {
  if (enchant.imageId) return <GameIcon kind="item" id={enchant.imageId} label={enchant.name} size={size} />
  if (enchant.kind === 'spirit') return <GameIcon kind="spirit" id={enchant.iconId ?? spiritIconId(enchant.name)} label={enchant.name} size={size} />
  return <GameIcon kind="element" id={enchant.iconId ?? elementIconId(enchant.element ?? 'Any')} label={enchant.name} size={size} />
}

const AFFINITY_BADGE = <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">✦ сродство</span>

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
  const stoneOptions = useMemo<PickerOption[]>(
    () =>
      stones.map(({ enchant: s, affinity, note }) => ({
        value: s.name,
        label: s.name,
        icon: <EnchantIcon enchant={s} size={28} />,
        detail: `+${s.elementValue ?? 0}${s.element ? ` ${s.element}` : ''}${s.tier ? ` · T${s.tier}` : ''}${note ? ` · ${note}` : ''}`,
        badge: affinity ? AFFINITY_BADGE : undefined,
        group: s.element ?? 'Любая стихия',
      })),
    [stones],
  )
  const spiritOptions = useMemo<PickerOption[]>(
    () =>
      spirits.map(({ enchant: s, affinity }) => {
        const skill = spiritSkillOf(data, s)
        return {
          value: s.name,
          label: s.name,
          icon: <EnchantIcon enchant={s} size={28} />,
          detail: skill ? (
            <span className="inline-flex items-center gap-1">
              <GameIcon kind="skill" id={skillIconId(skill.name)} label={skill.name} size={14} /> {skill.name}
            </span>
          ) : undefined,
          badge: affinity ? AFFINITY_BADGE : undefined,
          group: affinity ? 'Со сродством предмета' : 'Остальные духи',
          keywords: skill?.name,
        }
      }),
    [spirits, data],
  )

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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn('shrink-0 rounded-md bg-muted/40 p-1 ring-2 transition hover:brightness-110', item ? QUALITY_RING[current.quality] : 'ring-transparent border border-dashed')}
          aria-label={item ? `Сменить предмет в слоте ${slot + 1}` : `Выбрать предмет в слоте ${slot + 1}`}
        >
          <GameIcon kind="item" id={item ? itemIconId(item.name) : null} label={item?.name ?? '+'} size={44} />
        </button>
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

      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" role="radiogroup" aria-label={`Качество предмета в слоте ${slot + 1}`}>
        <span className="mr-1 text-muted-foreground">
          <HintLabel hint="Качество предмета умножает его ATK/DEF/HP (A7): Superior ×1,25, Flawless ×1,5, Epic ×2, Legendary ×3.">Качество</HintLabel>
        </span>
        {QUALITIES.map((q) => (
          <button
            key={q}
            type="button"
            role="radio"
            aria-checked={current.quality === q}
            data-on={current.quality === q}
            title={`${q} ×${qualityMultiplier(q)}`}
            onClick={() => onChange({ ...current, quality: q })}
            className={cn('rounded-full border px-2 py-0.5 font-medium transition-colors hover:brightness-110', current.quality === q ? '' : 'opacity-60', QUALITY_TONE[q])}
          >
            {QUALITY_RU[q]} ×{qualityMultiplier(q)}
          </button>
        ))}
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
        <div className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            <HintLabel hint="Вставить можно любой камень стихии (A65): он даёт ATK/DEF/HP и величину стихии против барьера. Сродство предмета («✦ сродство») усиливает камень ×1,5 (A6), а камень чужой стихии стихии герою не даёт (A21).">
              Камень
            </HintLabel>
          </span>
          <IconPicker
            value={current.element}
            options={stoneOptions}
            onChange={(v) => onChange({ ...current, element: v })}
            ariaLabel={`Камень в слоте ${slot + 1}`}
            placeholder={!item ? '— сначала предмет —' : '— без камня —'}
            clearLabel="Без камня"
            disabled={!item}
            emptyIcon={<GameIcon kind="element" id={null} label="—" size={28} />}
            contentClassName="w-[24rem]"
          />
        </div>
        <div className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            <HintLabel hint="Вставить можно любой дух (A65): он даёт свои статы и навык. Если у предмета есть сродство духа («✦ сродство», Spirit Affinity), навык даётся в «+»-версии (A5).">
              Дух
            </HintLabel>
          </span>
          <IconPicker
            value={current.spirit}
            options={spiritOptions}
            onChange={(v) => onChange({ ...current, spirit: v })}
            ariaLabel={`Дух в слоте ${slot + 1}`}
            placeholder={!item ? '— сначала предмет —' : '— без духа —'}
            clearLabel="Без духа"
            disabled={!item}
            emptyIcon={<GameIcon kind="spirit" id={null} label="—" size={28} />}
            contentClassName="w-[24rem]"
          />
        </div>
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
