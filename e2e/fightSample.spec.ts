import { expect, test } from '@playwright/test'
import { expectClean, importHeroesViaFile, pickHero, pickQuest, runOptimize, section, selectByLabel, shot, watchErrors } from './helpers.ts'

/**
 * «Пример боя» и «Сводка по бойцам»: лог одного прогона по раундам (цвет по стороне) и таблица
 * средних показателей с подсказкой по защите. Блок есть в подробном разборе «Подбора» и в прогоне
 * «Команд» (сессия 33).
 */

test('прогон команды: «Пример боя» и «Сводка по бойцам» в «Командах»', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  await importHeroesViaFile(page)

  // Команда из трёх героев + чемпион на Meteor Zone (Extreme, босс) — как в teams.spec.ts.
  await page.getByRole('link', { name: 'Команды' }).click()
  await expect(page.getByRole('heading', { name: 'Команды', exact: true })).toBeVisible()
  await section(page, 'Сохранённые команды').getByRole('button', { name: 'Новая команда' }).click()
  const editor = section(page, 'Редактор команды')
  await editor.getByLabel('Имя команды').fill('Тестовая тройка')
  await editor.getByLabel('Целевая локация').selectOption('Meteor Zone')
  await editor.getByLabel('Сложность').selectOption('Extreme')
  await editor.getByLabel('Тип').selectOption('boss')
  for (const h of ['Антуан', 'Беовульф', 'Эбигейл']) await page.getByLabel(new RegExp(`^${h} `)).check()
  await selectByLabel(editor.getByLabel('Чемпион'), /Argon/)
  await editor.getByLabel('Ранг').first().fill('5')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Команда «Тестовая тройка» сохранена.')).toBeVisible()

  // Прогон: пока команда не прогнана, примера боя нет (метрики брать неоткуда).
  const runSection = section(page, 'Прогон и сравнение')
  await expect(runSection.getByText('Пример боя')).toHaveCount(0)
  const runBtn = runSection.getByRole('button', { name: 'Прогнать выбранные' })
  await expect(runBtn).toBeEnabled()
  await runBtn.click()
  await expect(runSection.getByRole('cell', { name: /\d+\.\d%/ }).first()).toBeVisible({ timeout: 120_000 })

  const sample = runSection.locator('details[data-slot="fight-sample"]')
  await expect(sample).toHaveCount(1)
  await sample.locator('summary').click()
  // Лог по раундам: до боя — барьер, затем раунды с ударами обеих сторон.
  await expect(sample.getByText('До боя')).toBeVisible({ timeout: 60_000 })
  await expect(sample.getByText(/Стихийный барьер \(Тьма, 400\): (НЕ )?пробит/)).toBeVisible()
  await expect(sample.getByText('Раунд 1')).toBeVisible()
  await expect(sample.getByText(/бьёт монстра|уклоняется|Монстр бьёт/).first()).toBeVisible()
  await expect(sample.getByText(/Победа за \d+ раунд|Поражение за \d+ раунд/)).toBeVisible()

  // Сводка по бойцам: строка на каждого бойца (3 героя + чемпион) и подсказка по защите.
  await expect(sample.getByRole('heading', { name: 'Сводка по бойцам' })).toBeVisible()
  const summary = sample.locator('table').last()
  await expect(summary.getByRole('row')).toHaveCount(5) // заголовок + 4 бойца
  for (const name of ['Антуан', 'Беовульф', 'Эбигейл', 'Argon']) {
    await expect(summary.getByRole('cell', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  await expect(summary.getByText(/(ниже p50\/2|до p50|до p70|выше p70|порогов нет)/).first()).toBeVisible()
  await expect(summary.getByText(/\d+\.\d%/).first()).toBeVisible()
  await sample.scrollIntoViewIfNeeded()
  await shot(page, 'teams-fight-sample.png')
  expectClean(errors)
})

test('подбор: «Пример боя» и подсказка по защите с порогами из Defense cap', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = watchErrors(page)
  // Lost City of Gold без порогов хаба — вписываем cap с экрана игры в строку того самого квеста
  // (босс, сложность 13), который потом выберем в «Подборе»: иначе порогов у него так и не будет.
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  const caps = section(page, 'Пороги защиты квестов')
  const row = caps
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Lost City of Gold', exact: true }) })
    .filter({ has: page.getByRole('cell', { name: '13', exact: true }) })
    .filter({ has: page.getByRole('cell', { name: 'босс', exact: true }) })
  await expect(row).toHaveCount(1, { timeout: 60_000 })
  await row.getByRole('spinbutton').fill('159600')
  await row.getByRole('spinbutton').press('Enter')
  await expect(row.getByText('26600 · 53200 · 159600')).toBeVisible()

  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  await pickHero(page, 'Антуан')
  await pickQuest(page, 'Lost City of Gold', '13', 'boss')
  await runOptimize(page)

  const result = section(page, 'Результат')
  const sample = result.locator('details[data-slot="fight-sample"]')
  await expect(sample).toHaveCount(1)
  await sample.locator('summary').click()
  await expect(sample.getByText('Раунд 1')).toBeVisible({ timeout: 120_000 })
  await expect(sample.getByRole('heading', { name: 'Сводка по бойцам' })).toBeVisible()
  // Подсказка по защите: у квеста есть пороги из Defense cap (159600 → p50 26600, p70 53200),
  // поэтому зона бойца обязана совпасть с положением его DEF на кривой.
  const defCell = sample.getByRole('cell', { name: /·\s*(ниже p50\/2|до p50|до p70|выше p70)/ }).first()
  await expect(defCell).toBeVisible()
  const shown = (await defCell.innerText()).trim()
  const parsed = shown.match(/^(\d+)\s*·\s*(.+)$/)
  expect(parsed, `ячейка DEF: «${shown}»`).not.toBeNull()
  const def = Number(parsed![1])
  const [p50, p70] = [26600, 53200]
  const expected = def < p50 / 2 ? 'ниже p50/2' : def < p50 ? 'до p50' : def < p70 ? 'до p70' : 'выше p70'
  expect(parsed![2]).toBe(expected)
  await expect(sample.getByText(/порогов нет/)).toHaveCount(0)
  await sample.scrollIntoViewIfNeeded()
  await shot(page, 'optimize-fight-sample.png')
  expectClean(errors)
})
