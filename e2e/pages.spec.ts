import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import { expectClean, shot, watchErrors } from './helpers.ts'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const DIST = join(ROOT, 'dist')
const PORT = 4199
const BASE_PATH = '/st-app'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

function staticServer(): Server {
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
      let p = decodeURIComponent(url.pathname)
      if (p !== BASE_PATH && !p.startsWith(`${BASE_PATH}/`)) {
        res.writeHead(404)
        res.end('вне пути репозитория')
        return
      }
      p = p.slice(BASE_PATH.length)
      if (p === '' || p === '/') p = '/index.html'
      const rel = normalize(p).replace(/^([/\\]|\.\.)+/, '')
      try {
        const body = await readFile(join(DIST, rel))
        res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' })
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end('404')
      }
    })()
  })
}

test('собранный dist из подпапки /st-app/ (имитация GitHub Pages): данные, пороги, иконки, PWA', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = watchErrors(page)
  const server = staticServer()
  await new Promise<void>((r) => server.listen(PORT, r))
  try {
    await page.goto(`http://localhost:${PORT}${BASE_PATH}/`)
    await expect(page.getByText(/Загружено: \d+ предметов/)).toBeVisible()

    // PWA: манифест отдаётся, service worker регистрируется (prod-сборка).
    const manifest = await page.request.get(`http://localhost:${PORT}${BASE_PATH}/manifest.webmanifest`)
    expect(manifest.status()).toBe(200)
    await page.evaluate(() => navigator.serviceWorker.ready)

    // Данные из Google + пороги stcentral-hub.
    await page.goto(`http://localhost:${PORT}${BASE_PATH}/#/data`)
    await expect(page.getByRole('heading', { name: 'Данные' })).toBeVisible()
    await page.getByRole('button', { name: 'Обновить данные сейчас' }).click()
    await expect(page.getByText('свежие из таблицы')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/покрыто \d+ из \d+ квестов/i)).toBeVisible({ timeout: 120_000 })

    // Иконки грузятся (на странице «Данные» есть примеры иконок).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(3000)
    const icons = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')]
      return { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length }
    })
    expect(icons.total).toBeGreaterThan(10)
    expect(icons.broken, `битые иконки: ${icons.broken}/${icons.total}`).toBe(0)
    await shot(page, 'pages-subpath.png')
    expectClean(errors)
  } finally {
    await new Promise<void>((r, rej) => server.close((e) => (e ? rej(e) : r())))
  }
})
