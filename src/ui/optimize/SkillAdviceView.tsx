import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { Badge } from '#/components/ui/badge.tsx'
import { Checkbox } from '#/components/ui/checkbox.tsx'
import { skillIconId } from '#/data/images.ts'
import type { GameData, HeroInstance } from '#/data/types.ts'
import {
  PERFECT_DICE_PER_TOWER,
  PERFECT_DICE_PER_TOWER_NO_PREMIUM,
  SKILL_ROLL_STOCK_BASIC_DICE,
  SKILL_ROLL_STOCK_IDEAL_DICE,
} from '#/engine/constants.ts'
import { CUBE_LABELS, heroRollPlans, type RollStep, type SkillAdviceResult } from '#/engine/skills.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { Tip } from '#/ui/Hint.tsx'
import { Notice, Section } from '#/ui/layout.tsx'

/** Цвет шага плана: перекидка — предупреждение, найм/прокачка — инфо, «оставить» — успех. */
const STEP_CLASS: Record<RollStep['kind'], string> = {
  hire: 'text-info',
  level: 'text-info',
  reroll: 'text-warning',
  keep: 'text-success',
  roland: 'text-success',
}

/** Секция «Навыки: вклад и перекидка» + пошаговый план ролла по герою (A60). */
export function SkillAdviceView({ data, team, advice }: { data: GameData | null; team: HeroInstance[]; advice: SkillAdviceResult }) {
  /** Флажок «Роланд использован» на героя: пересчитывает только план (без симуляций). */
  const [rolandUsedIds, setRolandUsedIds] = useState<string[]>([])
  const rolandUsed = useMemo(
    () => team.map((h, i) => (rolandUsedIds.includes(h.id) ? i : -1)).filter((i) => i >= 0),
    [team, rolandUsedIds],
  )
  const plans = useMemo(
    () => (data ? heroRollPlans(data, team, advice.advice, { rolandUsed }) : advice.plans),
    [data, team, advice, rolandUsed],
  )
  const toggleRoland = (id: string, on: boolean): void => setRolandUsedIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)))

  return (
    <Section
      title="Навыки: вклад, план ролла и перекидка"
      description={
        <>
          Вклад = win rate с навыком минус win rate без него (на подобранном наборе). Кубик применяется к одному выбранному слоту:
          базовый — слот 1, супер — 1 или 2, мега — 1–3, идеальный — любому из 1–4; младшие слоты при этом не трогаются, поэтому
          советуем минимальный кубик, которым нужный слот можно перекинуть. Роланд — любой навык в любой слот, один раз на героя
          (тратить последним). План — по гайду Develion (<Link to="/roll">памятка «Как роллить»</Link>): идеальные кубики дают по{' '}
          {PERFECT_DICE_PER_TOWER} за Башню Титана ({PERFECT_DICE_PER_TOWER_NO_PREMIUM} без према), перед роллом гайд советует накопить{' '}
          {SKILL_ROLL_STOCK_IDEAL_DICE}+ идеальных и {SKILL_ROLL_STOCK_BASIC_DICE}+ базовых.
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {team.map((h, hi) => {
          const rows = advice.advice.filter((a) => a.heroIndex === hi)
          const plan = plans.find((p) => p.heroIndex === hi)
          if (rows.length === 0 && !plan) return null
          return (
            <div key={h.id} className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{h.name}</h3>
              {plan && plan.steps.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-1 text-sm font-medium">
                    План ролла · <span className="text-muted-foreground">итого {plan.basicCubes} базовых кубиков (идеальный = 8)</span>
                  </p>
                  <ol className="space-y-2 text-sm">
                    {plan.steps.map((st, i) => (
                      <li key={`${st.kind}-${st.slot ?? i}`}>
                        <span className={cn('font-medium', STEP_CLASS[st.kind])}>
                          {i + 1}. {st.title}
                        </span>
                        {st.cube ? (
                          <Tip text="Кубик, которым перекидывается слот: чем выше кубик, тем больше слотов он может затронуть, но тем он дороже.">
                            <Badge className="ml-2 border-warning/40 bg-warning/15 text-warning">{CUBE_LABELS[st.cube]}</Badge>
                          </Tip>
                        ) : null}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {st.basicCubes > 0 ? `${st.basicCubes} баз.` : 'бесплатно'}
                        </span>
                        <span className="block text-xs text-muted-foreground">{st.detail}</span>
                        {st.rollsNote ? (
                          <span className="block text-xs text-muted-foreground">Число бросков не оцениваем: {st.rollsNote}.</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <ul className="space-y-2 text-sm">
                {rows.map((a) => {
                  // Один слот — одно действие: если план перекидывает слот, не показываем «оставить» (A60).
                  const slotAction = plan?.slotActions.find((x) => x.slot === a.skillIndex + 1)
                  const rerolled = slotAction ? slotAction.action === 'reroll' : a.action === 'reroll'
                  const stepCube =
                    slotAction?.step !== undefined
                      ? plan?.steps.find((s) => s.slot === slotAction.slot && s.kind === slotAction.step)?.cube
                      : undefined
                  const shownCube = stepCube ?? a.cube
                  const badgeText =
                    slotAction?.step === 'hire'
                      ? 'перекинуть наймом'
                      : slotAction?.step === 'roland'
                        ? 'перекинуть Роландом'
                        : shownCube
                          ? `перекинуть: ${CUBE_LABELS[shownCube]}`
                          : 'перекинуть по плану'
                  return (
                    <li key={a.skillIndex} className="flex flex-wrap items-center gap-2">
                      <GameIcon kind="skill" id={skillIconId(a.skillName)} label={a.skillName} size={28} />
                      <span>
                        {a.skillName} <span className="text-muted-foreground">(слот {a.skillIndex + 1})</span>
                      </span>
                      <Tip text="Вклад навыка: win rate с ним минус win rate без него на подобранном наборе, в процентных пунктах.">
                        <span className={cn('cursor-help font-medium', a.contribution > 0 ? 'text-success' : 'text-muted-foreground')}>
                          {(a.contribution * 100).toFixed(1)} п.п.
                        </span>
                      </Tip>
                      {rerolled ? (
                        <Badge className="border-warning/40 bg-warning/15 text-warning">{badgeText}</Badge>
                      ) : (
                        <Badge className="border-success/40 bg-success/15 text-success">оставить</Badge>
                      )}
                      <span className="w-full text-xs text-muted-foreground">{a.reasons.join('; ')}</span>
                    </li>
                  )
                })}
              </ul>
              <Tip text="Роланд может поставить любой навык в любой слот, но только один раз на героя. Если уже потрачен — план пересчитается без него.">
                <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={rolandUsedIds.includes(h.id)} onCheckedChange={(v) => toggleRoland(h.id, v === true)} />
                  <span>Роланд на этом герое уже использован</span>
                </label>
              </Tip>
              {plan && plan.reasons.length > 0 ? (
                <Notice tone="info" className="mt-2">
                  {plan.reasons.join(' ')}
                </Notice>
              ) : null}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
