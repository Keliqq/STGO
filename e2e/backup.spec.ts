import { expect, test } from '@playwright/test'
import { importHeroesViaFile, section, shot, watchErrors } from './helpers.ts'

test('«Данные» → резервная копия: экспорт → очистка героев → импорт', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/data')
  const backup = section(page, 'Резервная копия')
  await expect(backup.getByText(/герои \(18\)/)).toBeVisible()

  const stateFile = test.info().outputPath('st-app-state.json')
  const [download] = await Promise.all([page.waitForEvent('download'), backup.getByRole('button', { name: 'Экспорт JSON' }).click()])
  await download.saveAs(stateFile)
  const json = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(stateFile, 'utf8'))) as Record<string, unknown>
  expect(json).not.toHaveProperty('inventory')

  await page.goto('/#/heroes')
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Очистить' }).click()
  await expect(page.getByText('Пока нет героев')).toBeVisible()

  await page.goto('/#/data')
  await page.setInputFiles('input[type="file"][accept*=".json"]', stateFile)
  await expect(page.getByText(/Импортировано: героев добавлено 18/)).toBeVisible()
  await shot(page, 'data-backup.png')
  await page.goto('/#/heroes')
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('страницы «Инвентарь» больше нет', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Инвентарь' })).toHaveCount(0)
})
