import { createFileRoute, Link } from '@tanstack/react-router'
import { Badge } from '#/components/ui/badge.tsx'
import {
  ARGONS_FINEST_TALENT_POINTS,
  CUBE_BASIC_COST,
  CUBE_SLOTS,
  PERFECT_DICE_PER_TOWER,
  PERFECT_DICE_PER_TOWER_NO_PREMIUM,
  SKILL_ROLL_FULL_LEVEL,
  SKILL_ROLL_HIRE_LEVEL,
  SKILL_ROLL_STOCK_BASIC_DICE,
  SKILL_ROLL_STOCK_IDEAL_DICE,
} from '#/engine/constants.ts'
import { CUBE_LABELS } from '#/engine/skills.ts'
import { Notice, Page, Section } from '#/ui/layout.tsx'

export const Route = createFileRoute('/roll')({ component: RollPage })

/** Источник памятки — гайд Develion. Ссылка нужна и как атрибуция, и как первоисточник деталей. */
const GUIDE_URL = 'https://docs.google.com/document/d/1DrP0VBxnDPSLwsLe_Y8T3BkrGmN_f6QiBGrHW1qs3E8'

const ORDER: { title: string; text: string }[] = [
  {
    title: 'Талант «Лучшие товарищи Аргона» — 3-я ступень',
    text: `Стоит ${ARGONS_FINEST_TALENT_POINTS} очков дерева талантов. После него новые герои приходят сразу ${SKILL_ROLL_HIRE_LEVEL}-го уровня, а на этом уровне уже открыт 2-й слот навыка.`,
  },
  {
    title: 'Найм и увольнение — до нужного навыка во 2-м слоте',
    text: 'Нанимаем и увольняем, пока во 2-м слоте не окажется нужный навык. Это бесплатно — кубики на 2-й слот не тратим. Нужен именно 2-й слот: его нельзя «докупить» дешёвым кубиком.',
  },
  {
    title: `Прокачка до ${SKILL_ROLL_FULL_LEVEL}-го уровня`,
    text: `На ${SKILL_ROLL_FULL_LEVEL}-м уровне открываются 3-й и 4-й слоты. Если классу они недоступны без пробуждения — сначала Душа Титана. Заодно смотрим, что выпало в 3-й и 4-й слоты: если там уже нужные навыки, их не трогаем.`,
  },
  {
    title: '4-й слот — идеальный кубик',
    text: 'Единственный кубик, которым можно перекинуть 4-й слот. Остальные слоты он не задевает — 2-й навык, выбранный наймом, остаётся на месте.',
  },
  {
    title: '1-й слот — базовый кубик',
    text: 'Базовый кубик дешёвый: если 4-й слот уже закрыт, добиваем 1-й. Если нужные навыки выпали в 3-м и 4-м при прокачке — работаем только с 1-м слотом и остатком.',
  },
  {
    title: 'Остаток — Роланд',
    text: 'Роланд даёт выбрать любой навык в любой слот, но только один раз на героя, поэтому он идёт последним — на тот слот, который кубиками закрыть дороже всего (обычно 3-й).',
  },
]

const CUBES: { cube: 1 | 2 | 3 | 4; hint: string }[] = [
  { cube: 1, hint: 'слот 1' },
  { cube: 2, hint: 'слот 2 — им же рероллят 1-й' },
  { cube: 3, hint: 'слот 3' },
  { cube: 4, hint: 'слот 4 — и вообще любой слот' },
]

/** Памятка «Как роллить» — пересказ своими словами раздела гайда Develion (A60). */
function RollPage() {
  return (
    <Page
      title="Как роллить героев"
      description={
        <>
          Короткая памятка: в каком порядке тратить кубики навыков и Роланда, чтобы собрать герою нужные навыки. Ниже — пересказ
          своими словами по гайду Develion «Гайд по героям и защитникам Shop Titans 2.0», раздел «Как “роллить” героев» (
          <a href={GUIDE_URL} target="_blank" rel="noreferrer">
            источник
          </a>
          ). Пошаговый план под своих героев показывает страница <Link to="/optimize">«Подбор»</Link> — в разделе «Навыки».
        </>
      }
    >
      <Section title="Порядок действий" description="Каждый следующий шаг дешевле или точнее предыдущего — поэтому порядок важен.">
        <ol className="space-y-3">
          {ORDER.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <Badge className="mt-0.5 h-fit shrink-0 border-info/40 bg-info/15 text-info">{i + 1}</Badge>
              <span className="text-sm">
                <span className="font-medium">{s.title}.</span> <span className="text-muted-foreground">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Кубики: что каким можно перекинуть"
        description="Кубик применяется к одному выбранному слоту из списка — младшие слоты он не трогает, их содержимое остаётся прежним."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Кубик</th>
                <th className="py-2 pr-4 font-medium">Какой слот можно перекинуть</th>
                <th className="py-2 pr-4 font-medium">Стоимость в базовых</th>
                <th className="py-2 font-medium">Где взять</th>
              </tr>
            </thead>
            <tbody>
              {CUBES.map(({ cube, hint }) => (
                <tr key={cube} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{CUBE_LABELS[cube]}</td>
                  <td className="py-2 pr-4">
                    {CUBE_SLOTS[cube].join(', ')} <span className="text-muted-foreground">({hint})</span>
                  </td>
                  <td className="py-2 pr-4">{CUBE_BASIC_COST[cube]}</td>
                  <td className="py-2 text-muted-foreground">
                    {cube === 1 ? 'синтез' : cube === 4 ? `Башня Титана: ${PERFECT_DICE_PER_TOWER} за башню (${PERFECT_DICE_PER_TOWER_NO_PREMIUM} без према)` : 'синтез из младших'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice tone="warning" className="mt-3">
          Синтез кубиков выше базового невыгоден: ресурсов уходит столько, что дешевле накопить базовые. Перед роллом гайд советует
          иметь {SKILL_ROLL_STOCK_IDEAL_DICE}+ идеальных и {SKILL_ROLL_STOCK_BASIC_DICE}+ базовых кубиков — за длинную сессию шанс
          выбить нужный навык выше, а неудача переносится легче, чем при подходах по десять кубиков.
        </Notice>
      </Section>

      <Section title="Что блокирует навыки" description="Заблокированный навык не выпадет вообще — пул ролла сужается, и это надо учитывать заранее.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Одна иконка (одна линейка).</span> Слабая и сильная версии одного навыка блокируют друг
            друга. Если слабая версия нужного навыка стоит в 1-м или 3-м слоте, сильная не выпадет в 4-й слот — слабую надо сроллить
            на что-то другое заранее (идеальный кубик подходит к любому слоту, если жалко отдельный кубик).
          </li>
          <li>
            <span className="text-foreground">Золотые навыки на оружие.</span> Их можно иметь только один на героя.
          </li>
          <li>
            <span className="text-foreground">Обычный навык на оружие — тоже один.</span> Но обычный и эпический вместе разрешены, они
            друг друга не блокируют.
          </li>
        </ul>
      </Section>

      <Section title="Частые ошибки" description="Мелочи, которые съедают идеальные кубики.">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Герой с двумя нужными навыками в 1-м и 2-м слотах.</span> Выглядит как удача, а на деле
            сужает пул для 4-го слота: нужные навыки из этого пула выпадают, поэтому идеальных кубиков уходит больше.
          </li>
          <li>
            <span className="text-foreground">Роллить 3-й слот кубиками.</span> Он самый дорогой (мегакубик), поэтому его логичнее
            закрывать Роландом — но только после того, как 1-й, 2-й и 4-й слоты уже готовы.
          </li>
          <li>
            <span className="text-foreground">Тратить Роланда раньше времени.</span> Он один раз на героя: если использовать его до
            того, как стали известны 3-й и 4-й навыки, выбор будет менее удачным.
          </li>
        </ul>
      </Section>

      <Notice tone="info">
        Памятка — не копия источника: формулировки свои, числа сверены с гайдом (уровни {SKILL_ROLL_HIRE_LEVEL} и {SKILL_ROLL_FULL_LEVEL},
        талант за {ARGONS_FINEST_TALENT_POINTS} очков, {PERFECT_DICE_PER_TOWER}/{PERFECT_DICE_PER_TOWER_NO_PREMIUM} идеальных кубиков за
        Башню Титана, запасы {SKILL_ROLL_STOCK_IDEAL_DICE}+ и {SKILL_ROLL_STOCK_BASIC_DICE}+). Точная механика пулов и вероятность
        конкретного навыка в таблице данных отсутствуют — движок оценивает их по числу доступных навыков (см. ASSUMPTIONS A60).
      </Notice>
    </Page>
  )
}
