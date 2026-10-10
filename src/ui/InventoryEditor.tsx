import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { EMPTY_INVENTORY, mergeInventory, parseInventoryCsv, saveInventory, type Inventory } from '#/data/inventory.ts'
import type { GameData } from '#/data/types.ts'
import { Notice } from '#/ui/layout.tsx'

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
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Сейчас в инвентаре: {inventory.items.length} предметов, {inventory.stones.length} камней, {inventory.spirits.length} духов.
        Формат строк: <code>type,name,quality</code> (type = item / stone / spirit).
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'item,Название меча,Epic\nstone,Tide Element\nspirit,Bear Spirit'}
        className="font-mono"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void applyText(text)}>
          <Plus /> Добавить из текста/CSV
        </Button>
        <Input
          type="file"
          accept=".csv,text/csv"
          className="w-auto max-w-full"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            void f.text().then(applyText)
          }}
        />
        <Button
          variant="ghost"
          onClick={() => {
            void saveInventory(EMPTY_INVENTORY).then(() => {
              onChange(EMPTY_INVENTORY)
              setReport('Инвентарь очищен.')
            })
          }}
        >
          <Trash2 /> Очистить
        </Button>
      </div>
      {report ? <Notice>{report}</Notice> : null}
    </div>
  )
}
