import { expect, test } from '@playwright/test'
import { expectClean, shot, watchErrors } from './helpers.ts'

test.use({ viewport: { width: 390, height: 844 } })

const ROUTES: { hash: string; title: string; name: string }[] = [
  { hash: '/', title: 'Подбор экипировки для героев Shop Titans', name: 'mobile-home' },
  { hash: '/#/heroes', title: 'Герои', name: 'mobile-heroes' },
  { hash: '/#/optimize', title: 'Подбор экипировки', name: 'mobile-optimize' },
  { hash: '/#/inventory', title: 'Инвентарь', name: 'mobile-inventory' },
  { hash: '/#/data', title: 'Данные', name: 'mobile-data' },
]

test('ширина 390 px: все экраны без горизонтального скролла', async ({ page }) => {
  const errors = watchErrors(page)
  for (const r of ROUTES) {
    await page.goto(r.hash)
    await expect(page.getByRole('heading', { level: 1, name: r.title })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `горизонтальный скролл на ${r.hash}`).toBeLessThanOrEqual(2)
    await shot(page, `${r.name}.png`)
  }
  expectClean(errors)
})
