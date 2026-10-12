import { expect, test } from '@playwright/test'
import { expectClean, section, shot, watchErrors } from './helpers.ts'

/** Страница «Справка»: описание всех инструментов, доступна из меню. */
test('справка: разделы по инструментам и переход из меню', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Справка' }).first().click()
  await expect(page.getByRole('heading', { name: 'Справка', exact: true })).toBeVisible()
  for (const title of ['Быстрый старт', 'Результат', 'Веса статов', 'Проверка на реальности', 'Данные и резервная копия']) {
    await expect(section(page, title)).toBeVisible()
  }
  await expect(section(page, 'Веса статов').getByText('Пометка про ослабленный зонд')).toBeVisible()
  await shot(page, 'guide.png')
  await page.getByRole('link', { name: '«Как роллить»' }).click()
  await expect(page.getByRole('heading', { name: 'Как роллить героев' })).toBeVisible()
  expectClean(errors)
})
