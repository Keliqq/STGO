import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { skillIconId } from '#/data/images.ts'
import type { HeroInstance } from '#/data/types.ts'
import { CUBE_LABELS, type SkillAdviceResult } from '#/engine/skills.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Section } from '#/ui/layout.tsx'

/** Секция «Навыки: вклад и перекидка». */
export function SkillAdviceView({ team, advice }: { team: HeroInstance[]; advice: SkillAdviceResult }) {
  return (
    <Section
      title="Навыки: вклад и перекидка"
      description={
        <>
          Вклад = win rate с навыком минус win rate без него (на подобранном наборе). Слабые навыки (<i>перекинуть</i>) советуем
          перекинуть минимальным подходящим кубиком; Роланд — только когда навык уже выше тира идеального кубика.
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {team.map((h, hi) => {
          const rows = advice.advice.filter((a) => a.heroIndex === hi)
          if (rows.length === 0) return null
          return (
            <div key={h.id} className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{h.name}</h3>
              <ul className="space-y-2 text-sm">
                {rows.map((a) => (
                  <li key={a.skillIndex} className="flex flex-wrap items-center gap-2">
                    <GameIcon kind="skill" id={skillIconId(a.skillName)} label={a.skillName} size={28} />
                    <span>
                      {a.skillName} <span className="text-muted-foreground">(слот {a.skillIndex + 1})</span>
                    </span>
                    <span className={cn('font-medium', a.contribution > 0 ? 'text-success' : 'text-muted-foreground')}>
                      {(a.contribution * 100).toFixed(1)} п.п.
                    </span>
                    {a.action === 'reroll' ? (
                      <Badge className="border-warning/40 bg-warning/15 text-warning">перекинуть: {a.cube ? CUBE_LABELS[a.cube] : ''}</Badge>
                    ) : (
                      <Badge className="border-success/40 bg-success/15 text-success">оставить</Badge>
                    )}
                    <span className="w-full text-xs text-muted-foreground">{a.reasons.join('; ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
