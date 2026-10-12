// Разовая проверка кодировки файлов репозитория: ищем двойное кодирование (UTF-8 прочитан как CP1251
// и записан обратно в UTF-8) и BOM. Запуск: npx tsx scripts/check-encoding.ts [файлы…]
// Без аргументов проверяет все .ts/.tsx/.md в src, docs, e2e и scripts (кроме себя).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Маркеры двойного кодирования — пары «кириллическая заглавная + необычная строчная», которых не бывает
 * в русских словах (например РЎ = «С» от исходной «С»). Записаны escape-последовательностями, чтобы сам файл
 * проверки не выглядел повреждённым.
 */
const MARKERS: readonly string[] = [
  '\u0420\u040e', // РЎ
  '\u0420\u0405', // РЅ
  '\u0420\u0406', // РІ
  '\u0420\u0408', // Р€
  '\u0421\u201a', // С‚
  '\u0421\u0453', // Сѓ
]
const SELF = 'check-encoding.ts'
const EXT = /\.(ts|tsx|md)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(name)) out.push(p)
  }
  return out
}

const files = (process.argv.slice(2).length > 0 ? process.argv.slice(2) : [...walk('src'), ...walk('docs'), ...walk('e2e'), ...walk('scripts')]).filter((f) => !f.endsWith(SELF))
let bad = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const hits = MARKERS.filter((m) => text.includes(m))
  if (hits.length > 0) {
    bad++
    console.log(`BAD  ${file}  двойное кодирование (маркеров: ${hits.length})`)
  } else if (text.charCodeAt(0) === 0xfeff) {
    // BOM сам по себе не портит текст (в репозитории есть такие файлы с давних сессий) — только сообщаем.
    console.log(`bom  ${file}`)
  }
}
console.log(bad === 0 ? `ok: ${files.length} файлов, двойного кодирования нет` : `повреждено файлов: ${bad}`)
process.exit(bad === 0 ? 0 : 1)
