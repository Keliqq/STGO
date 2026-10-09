import { useState } from 'react'
import { EMPTY_INVENTORY, mergeInventory, parseInventoryCsv, saveInventory, type Inventory } from '#/data/inventory.ts'
import type { GameData } from '#/data/types.ts'

const inputCls = 'rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800'
const btnCls = 'rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

/** Ручной ввод и импорт CSV в инвентарь (общий для страниц «Инвентарь» и «Подбор»). */
export function InventoryEditor({ data, inventory, onChange }: { data: GameData; inventory: Inventory; onChange: (inv: Inventory) => void }) {
  const [text, setText] = useState('')
  const [report, setReport] = useState<string | null>(null)

  async function applyText(t: string): Promise<void> {
    if (!t.trim()) return
    const r = parseInventoryCsv(t, data)
    const next = mergeInventory(inventory, r.inventory)
    await saveInventory(next)
    onChange(next)
    const parts = [`добавлено: предметов ${r.inventory.items.length}, камней ${r.inventory.stones.length}, духов ${r.inventory.spirits.length}`]
    if (r.unknown.length) parts.push(`не найдено в таблице: ${r.unknown.join(', ')}`)
    if (r.errors.length) parts.push(...r.errors)
    setReport(parts.join('; '))
    setText('')
  }

  return (
    <div className="text-sm">
      <p className="mb-2 text-neutral-600 dark:text-neutral-300">
        Сейчас в инвентаре: {inventory.items.length} предметов, {inventory.stones.length} камней, {inventory.spirits.length} духов.
        Формат строк: <code>type,name,quality</code> (type = item / stone / spirit).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={`item,${'Название меча'},Epic\nstone,Tide Element\nspirit,Bear Spirit`}
        className={`${inputCls} mb-2 w-full font-mono`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnCls} onClick={() => void applyText(text)}>
          Добавить из текста/CSV
        </button>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            void f.text().then(applyText)
          }}
        />
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            void saveInventory(EMPTY_INVENTORY).then(() => {
              onChange(EMPTY_INVENTORY)
              setReport('Инвентарь очищен.')
            })
          }}
        >
          Очистить
        </button>
      </div>
      {report ? <p className="mt-2 rounded bg-neutral-100 p-2 dark:bg-neutral-800">{report}</p> : null}
    </div>
  )
}
