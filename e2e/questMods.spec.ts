import { expect, test } from '@playwright/test'
import { expectClean, section, shot, watchErrors } from './helpers.ts'

/**
 * Модификаторы квестов (A17/A53/A71/A77): мини-босс, флаг Flash-задания и Гробница Титанов.
 * Проверяем поведение формы «Подбора»: выбор влияет на квест (бейджи), этаж Гробницы вводится,
 * сохраняется (IndexedDB) и переживает перезагрузку.
 */
test('«Подбор» → мини-босс и Flash-задание меняют квест', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  const goal = section(page, 'Цель')
  // Сначала выбираем локацию: без квеста модификаторов не к чему применять.
  await goal.getByRole('group', { name: 'Локация' }).getByRole('button', { name: 'Howling Woods' }).click()
  await expect(goal.getByLabel('Сложность')).toBeVisible({ timeout: 60_000 })

  // Мини-босс: список из пяти вариантов с числами (stcalc, A17/A77).
  const mini = goal.getByLabel('Мини-босс')
  await expect(mini).toBeVisible({ timeout: 60_000 })
  await expect(mini.locator('option')).toHaveCount(6) // «без мини-босса» + 5
  await expect(mini.locator('option', { hasText: 'Agile' })).toHaveCount(1)
  await expect(mini.locator('option', { hasText: 'уклонение врага +40' })).toHaveCount(1)

  await mini.selectOption('agile')
  await expect(mini).toHaveValue('agile')
  await expect(goal.getByText('мини-босс: Agile').first()).toBeVisible()

  // Flash-задание: флаг квеста (A53). Бейдж живёт внутри подсказки (Radix), поэтому ищем по тексту.
  const flash = goal.getByLabel('Flash-задание')
  await flash.check()
  await expect(flash).toBeChecked()
  await expect(goal.getByText('Flash', { exact: true }).first()).toBeVisible()

  // Справка по модификаторам — раскрываемый блок с числами.
  await goal.getByText('Справка: модификаторы квестов').click()
  await expect(goal.getByText('Мини-боссы (A17/A77)')).toBeVisible()
  await expect(goal.getByText('Модификаторы Гробницы Титанов (A70/A71/A77)')).toBeVisible()
  await shot(page, 'optimize-quest-mods')
  expectClean(errors)
})

test('«Подбор» → этаж Гробницы Титанов: ввод, пороги, сохранение и перезагрузка', async ({ page }) => {
  test.setTimeout(180_000)
  const errors = watchErrors(page)
  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  const goal = section(page, 'Цель')
  await expect(goal.getByRole('button', { name: 'Гробница Титанов' })).toBeVisible({ timeout: 60_000 })
  await goal.getByRole('button', { name: 'Гробница Титанов' }).click()
  await goal.getByText('Гробница Титанов — этажи и модификаторы').click()

  // Новый этаж: заполняем HP, ATK и Defense cap с экрана игры.
  await goal.getByRole('button', { name: 'Новый этаж' }).click()
  await goal.getByLabel('HP врага').fill('5000000')
  await goal.getByLabel('ATK врага').fill('250')
  await goal.getByLabel('Defense cap').fill('90000')
  await expect(goal.getByText('15000 · 30000 · 90000')).toBeVisible()

  // Модификатор этажа: отмечаем «Immortal» (HP врага +100%) и «Armored» (точное имя — есть ещё «Armored & Plated»).
  await goal.getByRole('checkbox', { name: 'Immortal', exact: true }).check()
  await goal.getByRole('checkbox', { name: 'Armored', exact: true }).check()
  await goal.getByRole('button', { name: 'Сохранить этаж' }).click()
  await expect(goal.getByText(/Этаж 1 сохранён/)).toBeVisible()

  // Сохранённый набор этажей переживает перезагрузку (IndexedDB).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  const after = section(page, 'Цель')
  await after.getByRole('button', { name: 'Гробница Титанов' }).click()
  await expect(after.getByText(/Сохранено этажей: 1/)).toBeVisible({ timeout: 60_000 })
  await expect(after.getByLabel('Defense cap')).toHaveValue('90000')
  await shot(page, 'optimize-tomb-floor')
  expectClean(errors)
})
