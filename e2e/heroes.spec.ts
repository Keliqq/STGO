import { expect, test } from '@playwright/test'
import { FIXTURE_HEROES, expectClean, importHeroesViaFile, shot, waitForData, watchErrors } from './helpers.ts'

test('импорт героев: файлом, перетаскиванием и вставкой; persist после перезагрузки', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await expect(page.getByText(/Импорт: добавлено 18, обновлено 0/)).toBeVisible()
  await shot(page, 'heroes-imported.png')

  // Перезагрузка — герои из IndexedDB.
  await page.reload()
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()

  // Повторный импорт тем же файлом — обновление без дублей.
  await waitForData(page)
  await page.setInputFiles('input[type="file"][accept*=".txt"]', 'fixtures/heroes.txt')
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
  await expect(page.getByText(/Импорт: добавлено 0, обновлено 18/)).toBeVisible()
})

test('импорт перетаскиванием файла', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/heroes')
  await waitForData(page)
  await page.evaluate(async (text) => {
    const file = new File([text], 'heroes.txt', { type: 'text/plain' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const zone = document.querySelector('div.border-dashed')
    if (!zone) throw new Error('зона drag&drop не найдена')
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, FIXTURE_HEROES)
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
  expectClean(errors)
})

test('импорт вставкой текста', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/heroes')
  await waitForData(page)
  await page.getByPlaceholder('Строки экспорта TitansDB, поля через TAB').fill(FIXTURE_HEROES)
  await page.getByRole('button', { name: 'Импортировать текст' }).click()
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
  expectClean(errors)
})
