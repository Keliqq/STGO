/**
 * Бейджи модификаторов квеста: мини-босс, Flash-задание, метка Гробницы Титанов и (по наведению)
 * расшифровка — что именно модификатор сделал с боем. Данные берутся из самого квеста
 * (`Quest.mods`, `Quest.battle`) — то есть ровно то, с чем считалась симуляция.
 */
import { Badge } from '#/components/ui/badge.tsx'
import type { Quest } from '#/data/types.ts'
import { MINI_BOSSES } from '#/engine/constants.ts'
import { miniBossDesc, questModifierByKey } from '#/engine/questMods.ts'
import { QUEST_VARIANT_RU } from '#/engine/teamRunner.ts'
import { Tip } from '#/ui/Hint.tsx'
import { questModsSummary } from '#/ui/questModsSummary.ts'

/**
 * Бейджи у квеста: мини-босс, Flash/Nullysium и модификаторы Гробницы. Каждому — подсказка
 * с расшифровкой; если модификаторов нет, список пустой и ничего не рисуется.
 */
export function QuestModsBadges({ quest, className }: { quest: Quest; className?: string }) {
  const mods = quest.mods ?? []
  const miniKey = mods.find((k) => k.startsWith('miniboss:') || MINI_BOSSES[k])
  const mini = miniKey ? MINI_BOSSES[miniKey.replace('miniboss:', '')] : undefined
  const tombMods = mods.filter((k) => questModifierByKey(k) && !k.startsWith('miniboss:') && !MINI_BOSSES[k])
  const summary = questModsSummary(quest)
  if (!mini && tombMods.length === 0 && !quest.isFlash && !quest.isTomb) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {mini ? (
        <Tip text={`Мини-босс ${mini.label}: ${miniBossDesc(mini.key)}. Мини-босс считается боссом (A17/A77).`}>
          <Badge variant="secondary">мини-босс: {mini.label}</Badge>
        </Tip>
      ) : null}
      {quest.isFlash ? (
        <Tip text={`Flash-задание: бонусы «doubled during Flash Quests» удваиваются${quest.isNullysium ? '; Nullysium дополнительно даёт героям −30 п.п. EVA и −30 п.п. крита' : ''} (A53/A77).`}>
          <Badge variant="secondary">{quest.isNullysium ? 'Nullysium' : 'Flash'}</Badge>
        </Tip>
      ) : null}
      {quest.isTomb ? (
        <Tip text="Гробница Титанов: статы этажа вводит пользователь, крит врага 15%, героям −20 п.п. крита, пороги защиты — из введённого cap (A70/A71).">
          <Badge variant="outline">Гробница{quest.tombDepth ? `: этаж ${quest.tombDepth}` : ''}</Badge>
        </Tip>
      ) : null}
      {tombMods.map((key) => {
        const def = questModifierByKey(key)
        return (
          <Tip key={key} text={`${def?.label ?? key}: ${def?.desc ?? 'модификатор Гробницы Титанов'} (A71/A77).`}>
            <Badge variant="outline">{def?.label ?? key}</Badge>
          </Tip>
        )
      })}
      {summary.length > 0 ? (
        <Tip text={`Что меняет бой: ${summary.join('; ')}.`}>
          <span className="cursor-help text-xs text-muted-foreground">что это даёт?</span>
        </Tip>
      ) : null}
      <span className="sr-only">{QUEST_VARIANT_RU[quest.variant]}</span>
    </span>
  )
}
