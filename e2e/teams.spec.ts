import { expect, test } from '@playwright/test'
import { importHeroesViaFile, section, selectByLabel, shot, watchErrors } from './helpers.ts'

/**
 * «Команды»: сохранённая команда (герои + чемпион с аурой и фамильяром), проверка состава
 * под локацию, прогон с сравнением и переход в подбор экипировки с этим составом.
 *
 * Тесты делят одно хранилище браузера, поэтому идут в одном файле и не перезагружают страницу
 * между шагами, где это важно.
 */
test('команда: состав, проверка размера, чемпион с аурой, прогон и сравнение', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)

  // Пункт меню ведёт на страницу команд.
  await page.getByRole('link', { name: 'Команды' }).click()
  await expect(page.getByRole('heading', { name: 'Команды', exact: true })).toBeVisible()
  await expect(section(page, 'Сохранённые команды').getByText('Команд пока нет.')).toBeVisible()

  await section(page, 'Сохранённые команды').getByRole('button', { name: 'Новая команда' }).click()
  const editor = section(page, 'Редактор команды')
  await expect(editor).toBeVisible()
  await editor.getByLabel('Имя команды').fill('Тестовая тройка')

  // Целевая локация: Meteor Zone (4 бойца в отряде), босс, Extreme.
  await editor.getByLabel('Целевая локация').selectOption('Meteor Zone')
  await editor.getByLabel('Сложность').selectOption('Extreme')
  await editor.getByLabel('Тип').selectOption('boss')

  // Три героя — пустой отряд: проверка состава ругается.
  await expect(editor.getByText('В команде нет ни одного героя и нет чемпиона.')).toBeVisible()
  for (const h of ['Антуан', 'Беовульф', 'Эбигейл']) await page.getByLabel(new RegExp(`^${h} `)).check()

  // Чемпион занимает место в отряде: 3 героя + чемпион = 4 — ровно размер локации.
  await selectByLabel(editor.getByLabel('Чемпион'), /Argon/)
  await editor.getByLabel('Ранг').first().fill('5')
  await expect(editor.getByText('Состав проходит проверку.')).toBeVisible()

  // Четвёртый герой уже не влезает: ошибка размера отряда.
  await page.getByLabel(/^Нина /).check()
  await expect(editor.getByText(/в отряд помещается 4 бойцов, а в команде 5/)).toBeVisible()
  await page.getByLabel(/^Нина /).uncheck()
  await expect(editor.getByText('Состав проходит проверку.')).toBeVisible()

  // Экипировка чемпиона: аурасонг + фамильяр + дух; подпись показывает эффекты, как их считает бой.
  await editor.getByLabel('Аура', { exact: true }).selectOption('Aura of Inspiration')
  await editor.getByLabel('Качество ауры').selectOption('Legendary')
  await editor.getByLabel('Фамильяр', { exact: true }).selectOption('Mushgoon')
  await editor.getByLabel('Дух в фамильяре').selectOption('Wolf Spirit')
  await expect(editor.getByText(/Экипировка даёт чемпиону: \+\d+ ATK, \+\d+ DEF, \+\d+ HP/)).toBeVisible()
  await expect(editor.getByText(/Aura of Inspiration: Grants \+12% bonus Attack and Defense, as well as \+12% HP to the party/)).toBeVisible()
  await expect(editor.getByText(/Wolf Ferocity: \+5% Attack/)).toBeVisible()
  await shot(page, 'teams-editor.png')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Команда «Тестовая тройка» сохранена.')).toBeVisible()
  // Команда сохранена и видна в списке с составом.
  const card = section(page, 'Сохранённые команды').locator('div.rounded-lg').filter({ hasText: 'Тестовая тройка' })
  await expect(card.getByText('Антуан + Беовульф + Эбигейл + Argon')).toBeVisible()
  await expect(card.getByText('4 с чемпионом')).toBeVisible()

  // Вторая команда — для сравнения (2 героя без чемпиона).
  await section(page, 'Сохранённые команды').getByRole('button', { name: 'Новая команда' }).click()
  const editor2 = section(page, 'Редактор команды')
  await editor2.getByLabel('Имя команды').fill('Дуэт')
  await editor2.getByLabel('Целевая локация').selectOption('Meteor Zone')
  await editor2.getByLabel('Сложность').selectOption('Extreme')
  await editor2.getByLabel('Тип').selectOption('boss')
  for (const h of ['Мармадюк', 'Джорен']) await page.getByLabel(new RegExp(`^${h} `)).check()
  await editor2.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Команда «Дуэт» сохранена.')).toBeVisible()

  // Прогон двух команд на одном квесте: таблица сравнения и доля одиночных ударов.
  const runSection = section(page, 'Прогон и сравнение')
  await expect(runSection.getByText('Квест: Meteor Zone · босс · Extreme')).toBeVisible()
  await runSection.getByRole('button', { name: 'Прогнать выбранные' }).click()
  await expect(runSection.getByRole('cell', { name: /\d+\.\d%/ }).first()).toBeVisible({ timeout: 120_000 })
  await expect(runSection.getByText(/доля одиночных ударов \d+%/).first()).toBeVisible()
  // У босса Meteor Zone на Extreme барьер Тьмы 400 — строка есть у каждой команды.
  await expect(runSection.getByText(/Тьма: \d+ из 400/)).toHaveCount(2, { timeout: 120_000 })
  // Скриншот именно с результатами прогона (в предыдущем снимке прогон ещё не запускался).
  await shot(page, 'teams-compare.png')

  // Отметка «прошёл / погибли» привязывается к команде.
  await runSection.getByLabel('погиб: Беовульф').first().check()
  await runSection.getByRole('button', { name: 'прошёл', exact: true }).first().click()
  await expect(page.getByText(/Отметка сохранена: «Тестовая тройка» прошёл/)).toBeVisible()
  await expect(card.getByText(/Отметка: прошёл/)).toBeVisible()
  await shot(page, 'teams-marks.png')

  // «Подобрать экипировку» уводит в оптимизатор с этим составом и чемпионом.
  await card.getByRole('button', { name: 'Подобрать экипировку' }).click()
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  const team = section(page, 'Отряд')
  await expect(team.getByLabel('Чемпион', { exact: true })).toHaveValue('Argon')
  await expect(team.getByLabel('Ранг', { exact: true })).toHaveValue('5')
  await expect(team.getByLabel('Аура чемпиона')).toHaveValue('Aura of Inspiration')
  await expect(team.getByLabel('Фамильяр', { exact: true })).toHaveValue('Mushgoon')
  await expect(team.getByLabel('Дух в фамильяре')).toHaveValue('Wolf Spirit')
  await expect(team.getByLabel(/^Антуан /)).toBeChecked()
  await expect(team.getByLabel(/^Эбигейл /)).toBeChecked()
  await shot(page, 'teams-to-optimize.png')
  expect(errors).toEqual([])
})

test('команда без героев проверку не проходит, а состав сохраняется между визитами', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/teams')
  await expect(page.getByRole('heading', { name: 'Команды', exact: true })).toBeVisible()

  await section(page, 'Сохранённые команды').getByRole('button', { name: 'Новая команда' }).click()
  const editor = section(page, 'Редактор команды')
  await editor.getByLabel('Имя команды').fill('Соло')
  await editor.getByLabel('Целевая локация').selectOption('Howling Woods')
  await editor.getByLabel('Сложность').selectOption('Hard')
  await editor.getByLabel('Тип').selectOption('boss')
  await page.getByLabel(/^Денам /).check()
  // Соло разрешено: нижней границы у проверки нет (ST-Central: бывают и соло, и дуэт).
  await expect(editor.getByText('Состав проходит проверку.')).toBeVisible()
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Команда «Соло» сохранена.')).toBeVisible()

  await page.reload()
  const card = section(page, 'Сохранённые команды').locator('div.rounded-lg').filter({ hasText: 'Соло' })
  await expect(card.getByText('1 без чемпиона')).toBeVisible()
  await expect(card.getByText('Howling Woods · босс · Hard')).toBeVisible()
  expect(errors).toEqual([])
})
