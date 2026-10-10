import { expect, test } from '@playwright/test'
import { expectClean, shot, watchErrors } from './helpers.ts'

test('переключение темы: авто → светлая → тёмная, persist после перезагрузки', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /Тема: авто/ })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/)
  await page.getByRole('button', { name: /Тема: светлая/ }).click()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  await shot(page, 'home-dark.png')

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark')
  expectClean(errors)
})
