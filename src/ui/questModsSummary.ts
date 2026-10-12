/**
 * Расшифровка того, что модификаторы квеста сделали с боем (A17/A53/A71/A77) — строкой для интерфейса.
 * Живёт отдельно от компонента бейджей: иначе вместе с ним экспортировалась бы и функция,
 * и это ломает быстрый рефреш React (правило `react-refresh/only-export-components`).
 */
import type { Quest } from '#/data/types.ts'

/** Список изменений боя: «ATK героев −10%», «уклонение врага 40%», «шанс AoE 75%»… */
export function questModsSummary(quest: Quest): string[] {
  const out: string[] = []
  const b = quest.battle
  if (b) {
    if (b.heroAtkPct) out.push(`ATK героев ${b.heroAtkPct > 0 ? '+' : ''}${b.heroAtkPct}%`)
    if (b.heroHpPct) out.push(`HP героев ${b.heroHpPct > 0 ? '+' : ''}${b.heroHpPct}%`)
    if (b.heroEvaPct) out.push(`уклонение героев ${b.heroEvaPct > 0 ? '+' : ''}${b.heroEvaPct} п.п.`)
    if (b.heroCritChancePct) out.push(`шанс крита героев ${b.heroCritChancePct > 0 ? '+' : ''}${b.heroCritChancePct} п.п.`)
    if (b.heroCritDmgPct) out.push(`урон крита героев ${b.heroCritDmgPct > 0 ? '+' : ''}${b.heroCritDmgPct}`)
    for (const g of b.groupMods ?? []) {
      const parts: string[] = []
      if (g.heroAtkPct) parts.push(`ATK ${g.heroAtkPct > 0 ? '+' : ''}${g.heroAtkPct}%`)
      if (g.heroHpPct) parts.push(`HP ${g.heroHpPct > 0 ? '+' : ''}${g.heroHpPct}%`)
      if (g.heroCritChancePct) parts.push(`крит ${g.heroCritChancePct > 0 ? '+' : ''}${g.heroCritChancePct} п.п.`)
      if (g.heroCritDmgPct) parts.push(`урон крита ${g.heroCritDmgPct > 0 ? '+' : ''}${g.heroCritDmgPct}`)
      if (g.heroEvaPct) parts.push(`уклонение ${g.heroEvaPct > 0 ? '+' : ''}${g.heroEvaPct} п.п.`)
      if (parts.length > 0) out.push(`${g.group}: ${parts.join(', ')}`)
    }
    if (b.enemyEvaPp) out.push(`уклонение врага ${b.enemyEvaPp}%`)
    if (b.targetGroup && b.targetMult) out.push(`бьёт ${b.targetGroup} в ${b.targetMult} раза чаще`)
    if (b.firstAtkPct) out.push(`первая атака врага +${b.firstAtkPct}% ATK`)
    if (b.firstAtkCritPp) out.push(`первая атака врага +${b.firstAtkCritPp} п.п. крита`)
    if (b.aoeChanceMult && b.aoeChanceMult !== 1) out.push(`шанс AoE ×${b.aoeChanceMult}`)
    if (b.aoeDmgPct) out.push(`урон AoE ${b.aoeDmgPct > 0 ? '+' : ''}${b.aoeDmgPct}%`)
  }
  if (quest.enemyCritChance != null) out.push(`крит врага ${Math.round(quest.enemyCritChance * 100)}%`)
  if (quest.aoeChance != null) out.push(`шанс AoE ${Math.round(quest.aoeChance * 100)}%`)
  return out
}
