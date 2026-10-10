import { expect, test } from '@playwright/test'
import { importHeroesViaFile, pickHero, runOptimize, section, selectByLabel, shot, watchErrors } from './helpers.ts'

const CSV = 'item,Twicicle Javelin,Normal\nitem,Warlord Plate,Normal\nstone,Sacred Element\nspirit,Mammoth Spirit'

test('инвентарь: CSV-строки и CSV-файл, запуск «только мой инвентарь»', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/inventory')
  await expect(page.getByRole('heading', { name: 'Инвентарь' })).toBeVisible()
  await expect(page.getByText('Загружаю данные…')).toHaveCount(0)

  await page.getByPlaceholder(/Название меча/).fill(CSV)
  await page.getByRole('button', { name: 'Добавить из текста/CSV' }).click()
  await expect(page.getByText(/добавлено: предметов 2, камней 1, духов 1/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Предметы (2)' })).toBeVisible()

  const csvFile = test.info().outputPath('inv.csv')
  await import('node:fs').then((fs) => fs.writeFileSync(csvFile, 'item,Neku Shield,Normal\n'))
  await page.setInputFiles('input[type="file"][accept*=".csv"]', csvFile)
  await expect(page.getByText(/добавлено: предметов 1/)).toBeVisible()
  await shot(page, 'inventory.png')

  // «Только мои вещи»: подбор из маленького инвентаря.
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  await pickHero(page, 'Антуан')
  await selectByLabel(section(page, 'Цель').locator('select').first(), /Easy/)
  await page.getByLabel('только мой инвентарь').check()
  await runOptimize(page)
  await expect(section(page, 'Результат').getByText(/Цель: \d+(\.\d)?%/)).toBeVisible()
  await shot(page, 'optimize-owned.png')
  expect(errors).toEqual([])
})

test('экспорт состояния → очистка → импорт', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/inventory')
  await page.getByPlaceholder(/Название меча/).fill(CSV)
  await page.getByRole('button', { name: 'Добавить из текста/CSV' }).click()
  await expect(page.getByText(/добавлено: предметов 2/)).toBeVisible()

  const stateFile = test.info().outputPath('st-app-state.json')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Экспорт JSON' }).click(),
  ])
  await download.saveAs(stateFile)

  await page.getByRole('button', { name: 'Очистить' }).click()
  await expect(page.getByText('Инвентарь очищен.')).toBeVisible()
  await page.goto('/#/heroes')
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Очистить' }).click()
  await expect(page.getByText('Пока нет героев')).toBeVisible()

  await page.goto('/#/inventory')
  await page.setInputFiles('input[type="file"][accept*=".json"]', stateFile)
  await expect(page.getByText(/Импортировано: героев добавлено 18/)).toBeVisible()
  await page.goto('/#/heroes')
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
  await page.goto('/#/inventory')
  await expect(page.getByRole('heading', { name: 'Предметы (2)' })).toBeVisible()
  expect(errors).toEqual([])
})
