import { expect, test } from '@playwright/test'
import { expectClean, section, shot, watchErrors } from './helpers.ts'

/** Страница-памятка «Как роллить»: порядок шагов, таблица кубиков, ссылка на источник. */
test('памятка «Как роллить»: шаги, кубики, источник и ссылка на план в «Подборе»', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/roll')
  await expect(page.getByRole('heading', { name: 'Как роллить героев' })).toBeVisible()

  const order = section(page, 'Порядок действий')
  await expect(order.getByText(/Лучшие товарищи Аргона/)).toBeVisible()
  await expect(order.getByText(/нанимаем и увольняем/i)).toBeVisible()
  await expect(order.getByText(/Прокачка до 35-го уровня/)).toBeVisible()
  await expect(order.getByText(/4-й слот — идеальный кубик/)).toBeVisible()
  await expect(order.getByText(/1-й слот — базовый кубик/)).toBeVisible()
  await expect(order.getByText(/Остаток — Роланд/)).toBeVisible()

  // Кубик применяется к одному слоту: у идеального перечислены все четыре, стоимость — 8 базовых.
  const cubes = section(page, 'Кубики: что каким можно перекинуть')
  const perfect = cubes.locator('tr', { hasText: 'идеальный кубик' })
  await expect(perfect).toContainText('1, 2, 3, 4')
  await expect(perfect).toContainText('8')
  await expect(cubes.getByText(/младшие слоты он не трогает/)).toBeVisible()

  expect(await page.getByRole('link', { name: 'источник' }).getAttribute('href')).toContain('docs.google.com/document/d/1DrP0VBxnDPSLwsLe_Y8T3BkrGmN_f6QiBGrHW1qs3E8')
  await shot(page, 'roll.png')
  await page.getByRole('link', { name: '«Подбор»' }).click()
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  expectClean(errors)
})
