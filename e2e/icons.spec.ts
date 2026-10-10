import { expect, test } from '@playwright/test'
import { expectClean, importHeroesViaFile, shot, watchErrors } from './helpers.ts'

test('иконки предметов/духов/стихий/навыков грузятся с CDN', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Состав' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(4000)
  const stats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')]
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    }
  })
  expect(stats.total).toBeGreaterThan(20)
  expect(stats.broken, `сломанные иконки: ${stats.broken} из ${stats.total}`).toBe(0)
  expect(stats.loaded, `загружено ${stats.loaded} из ${stats.total}`).toBe(stats.total)

  await importHeroesViaFile(page)
  await page.waitForTimeout(3000)
  const heroStats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('article img')]
    return { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length }
  })
  expect(heroStats.total).toBeGreaterThan(50)
  expect(heroStats.broken, `сломанные иконки на «Героях»: ${heroStats.broken}/${heroStats.total}`).toBe(0)
  await shot(page, 'heroes-icons.png')
  expectClean(errors)
})
