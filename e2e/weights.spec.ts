import { expect, test } from '@playwright/test'
import { importHeroesViaFile, pickHero, runOptimize, section, selectByLabel, shot, watchErrors } from './helpers.ts'

/**
 * Веса статов и «почему» по слотам: пользователь должен видеть, ПОЧЕМУ программа выбрала эти вещи.
 * Проверяется на странице «Подбор» (секция «Результат») и на карточке героя (страница «Герои»).
 */
test('«почему» по слотам и веса статов в результате подбора', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  await pickHero(page, 'Антуан')
  await selectByLabel(section(page, 'Цель').locator('select').first(), /Lost City of Gold · босс · 13/)
  await runOptimize(page)
  const res = section(page, 'Результат')

  // Веса статов: фраза «Главное для героя», столбики отряда, строки с шагами прибавок.
  await expect(res.getByRole('heading', { name: 'Почему именно эти статы: веса статов' })).toBeVisible({ timeout: 180_000 })
  await expect(res.getByText(/Главное для героя: /).first()).toBeVisible()
  await expect(res.getByText('Прибавка').first()).toBeVisible()
  await expect(res.getByText('+5% ATK').first()).toBeVisible()
  await expect(res.getByText('+1% CRIT').first()).toBeVisible()
  await expect(res.getByText('+10 угрозы').first()).toBeVisible()
  await expect(res.getByText(/Суммарно по отряду/)).toBeVisible()
  await expect(res.getByText(/Кто принимает удары/)).toBeVisible()
  // У каждого рекомендованного слота есть строка «почему: …».
  await expect(res.getByText(/^почему: /).first()).toBeVisible()
  await res.scrollIntoViewIfNeeded()
  await shot(page, 'optimize-weights.png')
  expect(errors).toEqual([])
})

test('веса статов на карточке героя считаются по выбранному квесту', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  const card = page.locator('article').filter({ hasText: 'Антуан' }).first()
  await card.getByText('Веса статов на квесте:').scrollIntoViewIfNeeded()
  await selectByLabel(card.locator('select').last(), /Lost City of Gold · босс · 13/)
  await card.getByRole('button', { name: 'Считать веса' }).click()
  await expect(card.getByText(/Главное для героя: /)).toBeVisible({ timeout: 120_000 })
  await expect(card.getByText('+5% ATK').first()).toBeVisible()
  await expect(card.getByText(/Суммарно по отряду/)).toBeVisible()
  await shot(page, 'heroes-weights.png')
  expect(errors).toEqual([])
})
