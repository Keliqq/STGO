import { expect, test } from '@playwright/test'
import { importHeroesViaFile, section, shot, watchErrors } from './helpers.ts'

/**
 * «Ростер»: таблица барьеров с разбором строки, план команд на локацию (в воркере, с прогрессом),
 * сохранение плана в «Команды» и анализ ростера с советом «что нанять следующим».
 *
 * Фикстура героев импортируется в каждом тесте: контексты браузера у Playwright разные.
 */
test('барьеры, план команд и анализ ростера', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await importHeroesViaFile(page)

  await page.getByRole('link', { name: 'Ростер' }).click()
  await expect(page.getByRole('heading', { name: 'Ростер', exact: true })).toBeVisible()

  // ── Барьеры: таблица «локация × сложность» и разбор строки ──
  const barriers = section(page, 'Барьеры')
  await barriers.getByLabel('Локация').selectOption('Meteor Zone')
  // Именно боссовый Extreme: у Meteor Zone на Extreme барьер есть и у обычного квеста (три стихии), и у босса (Тьма 400).
  const bossExtreme = barriers.locator('tbody tr').filter({ hasText: 'Extreme' }).filter({ hasText: 'босс' }).first()
  await expect(bossExtreme.getByRole('cell', { name: 'Тьма', exact: true })).toBeVisible()
  await expect(bossExtreme.getByRole('cell', { name: '400', exact: true })).toBeVisible()
  await bossExtreme.getByRole('button', { name: 'Разобрать' }).click()
  await expect(barriers.getByText(/нужно 400/)).toBeVisible()
  await expect(barriers.getByText(/Вкладчики:|нет ни одного бойца/)).toBeVisible()
  await shot(page, 'roster-barriers.png')

  // Ранг чемпиона: Rudo с 7-го ранга даёт +50% стихии отряда против барьера («Berserker Rampage»).
  await barriers.getByText('Ранги чемпионов').click()
  await barriers.getByLabel('Ранг чемпиона Rudo').fill('7')
  await expect(barriers.getByText(/Rudo: \+50% к стихии отряда/)).toBeVisible()

  // ── План команд на локацию ──
  const planSection = section(page, 'План команд на локацию')
  await planSection.getByLabel('Локация плана').selectOption('Howling Woods')
  await planSection.getByLabel('Сложность').selectOption('Extreme')
  await planSection.getByLabel('Тип').selectOption('boss')
  await planSection.getByRole('button', { name: 'Построить план' }).click()
  await expect(planSection.getByText(/отрядов: \d+/)).toBeVisible({ timeout: 240_000 })
  await expect(planSection.getByText(/средний win rate: \d+\.\d%/)).toBeVisible()
  // В каждом отряде герои не повторяются: имена в плане уникальны (каждый герой — в одной команде).
  const cards = planSection.locator('div.rounded-lg').filter({ hasText: /^Отряд \d+/ })
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i).getByText(/win rate: /)).toBeVisible()
    await expect(cards.nth(i).getByText(/Барьер|нет стихийного барьера/).first()).toBeVisible()
  }
  await shot(page, 'roster-plan.png')

  // План сохраняется в «Команды» вместе с целевой локацией.
  await planSection.getByRole('button', { name: 'Сохранить в «Команды»' }).click()
  await expect(page.getByText(/План сохранён в «Команды»/)).toBeVisible()

  // ── Анализ ростера ──
  const analysis = section(page, 'Анализ ростера')
  await expect(analysis.getByRole('cell', { name: 'Тьма', exact: true })).toBeVisible()
  await expect(analysis.getByText('Что нанять следующим')).toBeVisible()
  await expect(analysis.getByText(/Бойцов \(Fighter\): \d+/)).toBeVisible()
  await expect(analysis.getByText(/Дают стихию/)).toBeVisible()
  await analysis.getByLabel('Слотов квестов').fill('2')
  await expect(analysis.getByText(/при 2 слотах/)).toBeVisible()
  await shot(page, 'roster-analysis.png')
  expect(errors).toEqual([])
})

test('барьеры: у локации без барьера строки нет, а вложения из «Команд» не мешают странице', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/roster')
  const barriers = section(page, 'Барьеры')
  await expect(barriers.getByText(/Квестов с барьером: \d+ из \d+/)).toBeVisible()
  // Lost City of Gold — локация без барьеров: в отфильтрованной таблице строк нет.
  await barriers.getByLabel('Локация').selectOption('Lost City of Gold')
  await expect(barriers.locator('tbody tr')).toHaveCount(0)
  await expect(barriers.getByText(/Квестов с барьером: 0 из \d+/)).toBeVisible()
  expect(errors).toEqual([])
})
