import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectClean, importHeroesViaFile, pickHero, pickQuest, runOptimize, shot, watchErrors, waitForData } from './helpers.ts'

/**
 * Создание героя вручную и правка экипировки: статы считаются сразу, а список предметов слота
 * показывает только то, что герой может надеть (тир по уровню — HERO LEVELS → Max Item Tier).
 *
 * Последовательно: тесты делят одно хранилище браузера (IndexedDB), параллельный запуск мешал бы им.
 */
test.describe.configure({ mode: 'serial' })

/** Класс выбирается списком с иконками (IconPicker): кнопка → вариант в выпадающем списке. */
async function pickClass(page: Page, form: Locator, name: string): Promise<void> {
  await form.getByRole('button', { name: 'Класс героя' }).click()
  await page.getByRole('listbox', { name: 'Класс героя' }).getByRole('option', { name: new RegExp(`^${name} `) }).click()
  await expect(form.getByRole('button', { name: 'Класс героя' })).toContainText(name)
}
test('создать героя вручную → увидеть статы', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/heroes')
  await waitForData(page)

  await page.getByRole('button', { name: 'Новый герой' }).click()
  const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Новый герой' }) })
  await expect(form).toBeVisible()

  await form.getByLabel('Имя героя').fill('Тестовый герой')
  await pickClass(page, form, 'Soldier')
  await form.getByLabel('Уровень героя').fill('10')

  // Потолок тира по уровню — из HERO LEVELS, показан рядом с уровнем.
  await expect(form.getByText(/носит до T\d+/)).toBeVisible()
  const capText = await form.getByText(/носит до T\d+/).innerText()
  const cap = Number(capText.match(/T(\d+)/)![1])

  // Слот 1 класса Soldier — мечи: в списке есть предмет не выше потолка, а всё, что выше, — с причиной.
  await form.getByRole('button', { name: 'Выбрать предмет' }).first().click()
  const list = page.getByRole('listbox', { name: 'Предметы слота 1' })
  await expect(list).toBeVisible()
  await expect(list.locator('button[role="option"]:not([disabled])').first()).toBeVisible()
  await expect(list.getByText(`T${cap}`, { exact: false }).first()).toBeVisible()
  await page.getByLabel('Поиск предмета в слоте 1').fill('Squire')
  await expect(list.locator('button[role="option"]:not([disabled])').first()).toBeVisible()

  // Берём доступный меч и смотрим на ATK до/после.
  const atkRow = form.locator('tr').filter({ hasText: /^ATK/ }).first()
  const atkBefore = Number(await atkRow.locator('td').nth(1).innerText())
  await list.locator('button[role="option"]:not([disabled])').first().click()
  const atkAfter = Number(await atkRow.locator('td').nth(1).innerText())
  expect(atkAfter, 'ATK вырос от надетого меча').toBeGreaterThan(atkBefore)
  await expect(form.getByText(/Всё на месте: типы слотов, тир по уровню, один артефакт/)).toBeVisible()
  await shot(page, 'heroes-editor-form.png')

  await form.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByRole('heading', { name: /Мои герои \(1\)/ })).toBeVisible()
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Тестовый герой' }) })
  await expect(card).toBeVisible()
  await expect(card.getByText('Soldier', { exact: false }).first()).toBeVisible()
  await expect(card.getByText(/База: модель роста по уровню/)).toBeVisible()
  await shot(page, 'heroes-editor.png')

  // Перезагрузка — герой сохранён в IndexedDB.
  await page.reload()
  await expect(page.getByRole('heading', { name: /Мои герои \(1\)/ })).toBeVisible()
  await expect(page.locator('article').filter({ has: page.getByRole('heading', { name: 'Тестовый герой' }) })).toBeVisible()
  expectClean(errors)
})

test('понижение уровня: предмет выше потолка подсвечен, но не снят', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/heroes')
  await waitForData(page)

  await page.getByRole('button', { name: 'Новый герой' }).click()
  const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Новый герой' }) })
  await form.getByLabel('Имя героя').fill('Понижаемый')
  await pickClass(page, form, 'Soldier')
  await form.getByLabel('Уровень героя').fill('40')
  await form.getByRole('button', { name: 'Создать' }).click()

  // Одеваем лучший меч, доступный на 40 ур., и понижаем уровень до 1.
  await page.locator('article').filter({ hasText: 'Понижаемый' }).getByRole('button', { name: 'Изменить' }).click()
  const edit = page.locator('section').filter({ has: page.getByRole('heading', { name: /Изменить героя/ }) })
  await edit.getByRole('button', { name: 'Выбрать предмет' }).first().click()
  const list = page.getByRole('listbox', { name: 'Предметы слота 1' })
  await list.locator('button[role="option"]:not([disabled])').first().click()
  await edit.getByLabel('Уровень героя').fill('1')
  await expect(edit.getByText(/не наденет на этом уровне/).first()).toBeVisible()
  await expect(edit.getByText(/подсвечено: тир выше потолка уровня/)).toBeVisible()
  await expect(edit.getByText(/предметы в слотах 1 выше потолка/)).toBeVisible()
  expectClean(errors)
})

test('копия для экспериментов: черновик сравнивается с оригиналом', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/heroes')
  await waitForData(page)

  await page.getByRole('button', { name: 'Новый герой' }).click()
  const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Новый герой' }) })
  await form.getByLabel('Имя героя').fill('Оригинал')
  await pickClass(page, form, 'Soldier')
  await form.getByLabel('Уровень героя').fill('20')
  await form.getByRole('button', { name: 'Создать' }).click()

  const original = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Оригинал' }) })
  await original.getByRole('button', { name: 'Копия для экспериментов' }).click()
  await expect(page.getByRole('heading', { name: /Мои герои \(2,/ })).toBeVisible()

  // В черновике меняем уровень — карточка показывает сравнение с оригиналом и разницу.
  const draft = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Оригинал (черновик)' }) })
  await expect(draft.getByText('черновик', { exact: true })).toBeVisible()
  await draft.getByRole('button', { name: 'Изменить' }).click()
  const edit = page.locator('section').filter({ has: page.getByRole('heading', { name: /Изменить героя: Оригинал \(черновик\)/ }) })
  await edit.getByLabel('Уровень героя').fill('30')
  await edit.getByRole('button', { name: 'Сохранить' }).click()

  await expect(draft.getByText(/Сравнение с оригиналом/)).toBeVisible()
  const table = draft.locator('table')
  await expect(table.locator('th', { hasText: 'Черновик' })).toBeVisible()
  await expect(table.locator('th', { hasText: 'Оригинал' })).toBeVisible()
  await expect(table.locator('th', { hasText: 'Разница' })).toBeVisible()
  await expect(draft.getByText(/эталон с \d+ ур. больше не подходит/)).toHaveCount(0) // эталона у созданного героя нет
  await shot(page, 'heroes-draft-compare.png')
  expectClean(errors)
})

test('применить подбор: набор записывается в черновик героя', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  await importHeroesViaFile(page)

  await page.goto('/#/optimize')
  await expect(page.getByRole('heading', { name: 'Подбор экипировки' })).toBeVisible()
  await pickHero(page, 'Антуан')
  await pickQuest(page, 'Howling Woods', 'Easy', 'normal')
  await runOptimize(page)

  // Простой экран «Что делать» — там же кнопка применения набора.
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Что делать' }) })
  const apply = section.getByRole('button', { name: 'Применить подбор' })
  await expect(apply).toBeVisible()
  await apply.click()
  await expect(page.getByText(/Создан черновик/)).toBeVisible()

  await page.goto('/#/heroes')
  await expect(page.getByRole('heading', { name: /Мои герои \(19, черновиков 1\)/ })).toBeVisible()
  const draft = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Антуан (черновик)' }) })
  await expect(draft).toBeVisible()
  // Черновик скопирован с эталоном оригинала, поэтому база — из экспорта, а статы сравниваются с оригиналом.
  await expect(draft.getByText(/Сравнение с оригиналом «Антуан»/)).toBeVisible()
  await expect(draft.getByText(/База: из экспорта/)).toBeVisible()
  await shot(page, 'heroes-applied-build.png')

  // В «Подборе» черновик помечен меткой рядом с именем (A65), а не только суффиксом в имени.
  await page.goto('/#/optimize')
  const team = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Отряд', exact: true }) })
  const draftOption = team.locator('label').filter({ hasText: 'Антуан (черновик)' })
  await expect(draftOption).toBeVisible()
  await expect(draftOption.getByText('черновик', { exact: true })).toBeVisible()
  expectClean(errors)
})
