import { expect, test } from '@playwright/test'
import { expectClean, shot, watchErrors } from './helpers.ts'

test('первый запуск без кэша: снапшот сразу, «Обновить сейчас» тянет данные из Google', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByText(/Загружено: \d+ предметов/)).toBeVisible()
  await shot(page, 'home.png')

  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  await expect(page.getByText('встроенный снапшот')).toBeVisible()
  await page.getByRole('button', { name: 'Обновить данные сейчас' }).click()
  await expect(page.getByText('свежие из таблицы')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/покрыто \d+ из \d+ квестов/i)).toBeVisible({ timeout: 60_000 })
  await shot(page, 'data.png')
  expectClean(errors)
})

test('офлайн-запуск: снапшот без сети, после онлайн-визита — оболочка из SW, данные из кэша', async ({ page, context }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByText(/Загружено: \d+ предметов/)).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForTimeout(2000)
  // Прогрев: посещаем все страницы, чтобы их чанки попали в кэш SW (как у реального пользователя).
  for (const h of ['/#/heroes', '/#/optimize', '/#/inventory', '/#/data']) {
    await page.goto(h)
    await page.waitForTimeout(400)
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()

  // Полностью без сети: приложение открывается, данные — из встроенного снапшота.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  await expect(page.getByText('встроенный снапшот')).toBeVisible()
  await shot(page, 'offline-snapshot.png')

  // Онлайн: принудительное обновление кладёт данные в IndexedDB.
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Обновить данные сейчас' }).click()
  await expect(page.getByText('свежие из таблицы')).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2000)

  // Снова без сети: оболочка — из service worker, данные — из IndexedDB.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  await expect(page.getByText(/Предметов: \d+/)).toBeVisible()
  await expect(page.getByText('кэш браузера')).toBeVisible()
  await shot(page, 'offline-sw.png')
  expectClean(errors)
})
