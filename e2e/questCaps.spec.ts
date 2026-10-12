import { expect, test } from '@playwright/test'
import { expectClean, section, watchErrors } from './helpers.ts'

/**
 * «Defense cap с экрана игры» (A71): у Lost City of Gold порогов нет ни в таблице, ни на stcentral-hub,
 * поэтому пользователь вписывает число с экрана игры на странице «Данные». Пороги 50/70/75% считаются
 * из него (cap/6 · cap/3 · cap), значение живёт в IndexedDB и переживает перезагрузку.
 */
test('«Данные» → Defense cap с экрана игры: пороги считаются и сохраняются', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  const caps = section(page, 'Пороги защиты квестов')
  await expect(caps.getByText('Defense cap с экрана игры').first()).toBeVisible({ timeout: 60_000 })

  // Ряд Lost City of Gold — у этих квестов порогов хаба не бывает даже после его загрузки.
  const row = caps.getByRole('row').filter({ hasText: 'Lost City of Gold' }).first()
  const input = row.getByRole('spinbutton')
  await input.fill('159600')
  await input.press('Enter')
  await expect(row.getByText('26600 · 53200 · 159600')).toBeVisible()

  // Значение хранится в браузере: после перезагрузки поле снова заполнено.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
  const afterReload = section(page, 'Пороги защиты квестов').getByRole('row').filter({ hasText: 'Lost City of Gold' }).first()
  await expect(afterReload.getByRole('spinbutton')).toHaveValue('159600', { timeout: 60_000 })
  expectClean(errors)
})

/** Усилитель силы (A74) — выбор в форме квеста на «Подборе»; проверяем сам контрол и подписи. */
test('«Подбор» → в форме квеста есть выбор усилителя силы с числами', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  const booster = section(page, 'Цель').getByLabel('Усилитель силы')
  await expect(booster).toBeVisible({ timeout: 60_000 })
  await booster.selectOption('mega')
  await expect(booster).toHaveValue('mega')
  await expect(booster.locator('option', { hasText: 'Mega' })).toHaveCount(1)
  await expect(booster.locator('option', { hasText: '+50% урона крита' })).toHaveCount(1)
  expectClean(errors)
})
