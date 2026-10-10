import { expect, test } from '@playwright/test'
import { importHeroesViaFile, pickHero, runOptimize, section, selectByLabel, shot, watchErrors } from './helpers.ts'

test('подбор для одного героя под квест + советы по навыкам + отметка', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  await pickHero(page, 'Антуан')
  await selectByLabel(
    section(page, 'Цель').locator('select').first(),
    /Lost City of Gold · босс · 13/,
  )
  await shot(page, 'optimize-form.png')
  await runOptimize(page)
  await expect(section(page, 'Результат').getByText(/Цель: \d+(\.\d)?%/)).toBeVisible()
  await expect(section(page, 'Результат').getByText('Lost City of Gold · босс · 13')).toBeVisible()
  await shot(page, 'optimize-result.png')

  await expect(page.getByRole('heading', { name: 'Навыки: вклад и перекидка' })).toBeVisible()
  await shot(page, 'optimize-skills.png')

  // «Стоит ли улучшать?»: прирост при +1 тире и +1 качестве считается после основного подбора.
  const upgrade = section(page, 'Стоит ли улучшать?')
  await expect(upgrade.getByText(/\+1 тир \(до T\d+\)/)).toBeVisible()
  await expect(upgrade.getByText(/\+1 качество \(до Flawless\)/)).toBeVisible()
  await expect(upgrade.getByText('считаю…')).toHaveCount(0, { timeout: 120_000 })
  await expect(upgrade.getByText(/\d+\.\d% \(\+\d+\.\d п\.п\.\)/)).toHaveCount(2)
  await upgrade.scrollIntoViewIfNeeded()
  await shot(page, 'optimize-upgrade.png')

  await section(page, 'Проверка на реальности').getByRole('button', { name: 'проходит', exact: true }).click()
  await expect(section(page, 'Проверка на реальности').getByText(/· проходит ·/)).toBeVisible()
  expect(errors).toEqual([])
})

test('ограничения по умолчанию от надетого; выбранные значения запоминаются', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  await pickHero(page, 'Антуан')
  const lim = section(page, 'Ограничения')
  const tier = lim.locator('input[type=number]').first()
  const quality = page.getByLabel('Max качество')
  await expect(tier).toHaveValue('')
  expect(Number(await tier.getAttribute('placeholder'))).toBeGreaterThan(1)
  await expect(quality.locator('option:checked')).toHaveText('по умолчанию (Superior)')
  await expect(page.getByLabel('Max тир камней')).toHaveAttribute('placeholder', /^(9|1\d)$/)
  await expect(lim.getByText(/качество ≤ Superior/)).toBeVisible()
  await expect(lim.getByText(/Духи: \d+ из \d+ \(по умолчанию\)/)).toBeVisible()

  await tier.fill('12')
  await quality.selectOption('Epic')
  await page.reload()
  await expect(section(page, 'Ограничения').locator('input[type=number]').first()).toHaveValue('12')
  await expect(page.getByLabel('Max качество')).toHaveValue('Epic')

  await section(page, 'Ограничения').getByRole('button', { name: 'По умолчанию' }).click()
  await expect(section(page, 'Ограничения').locator('input[type=number]').first()).toHaveValue('')
  await page.reload()
  await expect(page.getByLabel('Max качество')).toHaveValue('')
  expect(errors).toEqual([])
})

test('подбор для группы в универсальном режиме', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  for (const h of ['Антуан', 'Беовульф', 'Эбигейл']) await pickHero(page, h)
  await selectByLabel(page.getByLabel('Чемпион'), /Argon/)
  await page.getByLabel('Ранг').fill('5')
  await page.getByText('Универсальный (все локации фильтра)').click()
  await page.getByLabel('Сложность').selectOption('Easy')
  await page.getByLabel('Тип').selectOption('normal')
  await runOptimize(page)
  await expect(section(page, 'Результат').getByText(/Цель: \d+(\.\d)?%/)).toBeVisible()
  await shot(page, 'optimize-universal.png')
  expect(errors).toEqual([])
})

test('отмена посреди расчёта; тяжёлый расчёт не подвешивает интерфейс (Worker)', async ({ page }) => {
  const errors = watchErrors(page)
  await importHeroesViaFile(page)
  await page.goto('/#/optimize')
  for (const h of ['Антуан', 'Беовульф', 'Эбигейл']) await pickHero(page, h)
  await selectByLabel(page.getByLabel('Чемпион'), /Argon/)
  await page.getByLabel('Ранг').fill('5')
  await selectByLabel(section(page, 'Цель').locator('select').first(), /Meteor Zone · босс · Extreme/)
  await page.getByRole('button', { name: 'Подобрать' }).click()
  await expect(page.getByText(/симуляций \d+\//)).toBeVisible({ timeout: 60_000 })

  // Пока воркер считает, основной поток отвечает: кадры анимации идут с малой задержкой.
  for (let i = 0; i < 5; i++) {
    const latency = await page.evaluate(
      () => new Promise<number>((res) => { const t0 = performance.now(); requestAnimationFrame(() => res(performance.now() - t0)) }),
    )
    expect(latency, 'задержка кадра анимации во время расчёта').toBeLessThan(200)
  }
  await shot(page, 'optimize-running.png')

  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(section(page, 'Результат').getByText('отменено, результат частичный')).toBeVisible({ timeout: 60_000 })
  expect(errors).toEqual([])
})
