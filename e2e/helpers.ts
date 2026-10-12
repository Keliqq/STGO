import { expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')
export const FIXTURE_HEROES: string = readFileSync(path.join(ROOT, 'fixtures', 'heroes.txt'), 'utf8')
const SCREENS = path.join(ROOT, 'docs', 'screens')

/** Скриншот всего экрана в docs/screens/. */
export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENS, { recursive: true })
  const file = name.endsWith('.png') ? name : `${name}.png`
  await page.screenshot({ path: path.join(SCREENS, file), fullPage: true })
}

/**
 * Собирает ошибки консоли и необработанные исключения страницы.
 * Сетевые «Failed to load resource» не считаем ошибкой приложения (в офлайн-тестах они ожидаются).
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/Failed to load resource|net::ERR|ERR_/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  return errors
}

export function expectClean(errors: string[]): void {
  expect(errors, `Ошибки в консоли:\n${errors.join('\n')}`).toEqual([])
}

/** Блокирует все внешние запросы (кроме localhost) — имитация офлайна. */
export async function blockExternal(page: Page): Promise<void> {
  await page.route('**', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost:4173') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    return route.abort()
  })
}

/** Ждёт, пока страница «Герои» получит игровые данные (без них импорт невозможен). */
export async function waitForData(page: Page): Promise<void> {
  // Сначала ждём сам маршрут (он грузится лениво), иначе «текста загрузки нет» верно ещё до рендера
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.getByText('Загрузка игровых данных…')).toHaveCount(0)
}

/** Импорт фикстуры героев через выбор файла; ждёт 18 карточек. */
export async function importHeroesViaFile(page: Page): Promise<void> {
  await page.goto('/#/heroes')
  await expect(page.getByRole('heading', { name: 'Герои', exact: true })).toBeVisible()
  await waitForData(page)
  await page.setInputFiles('input[type="file"][accept*=".txt"]', 'fixtures/heroes.txt')
  await expect(page.getByRole('heading', { name: /Мои герои \(18\)/ })).toBeVisible()
}

/** Клик по чекбоксу героя в секции «Отряд» на странице «Подбор». */
export async function pickHero(page: Page, name: string): Promise<void> {
  await page.getByLabel(new RegExp(`^${name} `)).check()
}

/** Секция по заголовку h2. */
export function section(page: Page, title: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

/** Выбор опции <select> по тексту, подходящему под regex. */
export async function selectByLabel(locator: import('@playwright/test').Locator, re: RegExp): Promise<void> {
  const value = await locator.evaluate((el, src) => {
    const r = new RegExp(src)
    const opt = [...el.options].find((o) => r.test(o.textContent ?? ''))
    return opt ? opt.value : null
  }, re.source)
  if (value === null) throw new Error(`Опция, подходящая под ${re}, не найдена`)
  await locator.selectOption({ value })
}

/** Запускает подбор и ждёт секцию «Результат». */
export async function runOptimize(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Подобрать' }).click()
  await expect(section(page, 'Результат')).toBeVisible({ timeout: 180_000 })
}

/** Выбор квеста в режиме «Квест»: кнопка локации с иконкой, затем сложность и тип. */
export async function pickQuest(page: Page, area: string, difficulty: string, variant: 'normal' | 'boss'): Promise<void> {
  const target = section(page, 'Цель')
  await target.getByRole('group', { name: 'Локация' }).getByRole('button', { name: area }).click()
  await target.getByLabel('Сложность').selectOption(difficulty)
  await target.getByLabel('Тип').selectOption(variant)
}
