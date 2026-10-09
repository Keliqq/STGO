import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { exportAppStateJson, importAppStateJson } from '#/data/appState.ts'
import { loadHeroes } from '#/data/heroStore.ts'
import { EMPTY_INVENTORY, loadInventory, type Inventory } from '#/data/inventory.ts'
import { loadRealityChecks } from '#/data/realityChecks.ts'
import { itemIconId, spiritIconId, elementIconId } from '#/data/images.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { InventoryEditor } from '#/ui/InventoryEditor.tsx'

export const Route = createFileRoute('/inventory')({ component: InventoryPage })

const btnCls = 'rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function InventoryPage() {
  const data = useGameData()
  const [inventory, setInventory] = useState<Inventory>(EMPTY_INVENTORY)
  const [counts, setCounts] = useState<{ heroes: number; checks: number }>({ heroes: 0, checks: 0 })
  const [report, setReport] = useState<string | null>(null)

  useEffect(() => {
    void loadInventory().then((r) => setInventory(r.inventory))
    void loadHeroes().then((r) => setCounts((c) => ({ ...c, heroes: r.heroes.length })))
    void loadRealityChecks().then((r) => setCounts((c) => ({ ...c, checks: r.checks.length })))
  }, [])

  const itemByName = useMemo(() => new Map((data?.items ?? []).map((i) => [i.name, i])), [data])
  const stoneByName = useMemo(() => new Map((data?.enchants ?? []).map((e) => [e.name, e])), [data])

  async function exportAll(): Promise<void> {
    downloadJson(await exportAppStateJson(), 'st-app-state.json')
  }

  async function importAll(text: string): Promise<void> {
    const r = await importAppStateJson(text)
    if ('error' in r) {
      setReport(r.error)
      return
    }
    setReport(
      `Импортировано: героев добавлено ${r.heroesAdded}, обновлено ${r.heroesUpdated}; ` +
        `всего — героев ${r.counts.heroes}, предметов ${r.counts.inventoryItems}, камней ${r.counts.inventoryStones}, ` +
        `духов ${r.counts.inventorySpirits}, отметок ${r.counts.realityChecks}.`,
    )
    const inv = await loadInventory()
    setInventory(inv.inventory)
    const h = await loadHeroes()
    setCounts((c) => ({ ...c, heroes: h.heroes.length }))
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Инвентарь</h1>
      {!data ? (
        <p className="text-sm">Загружаю данные…</p>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <h2 className="mb-3 text-lg font-semibold">Предметы, камни и духи</h2>
            <InventoryEditor data={data} inventory={inventory} onChange={setInventory} />
            {inventory.items.length + inventory.stones.length + inventory.spirits.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Предметы ({inventory.items.length})</h3>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {inventory.items.map((it) => (
                      <li key={it.name} className="flex items-center gap-2">
                        <GameIcon kind="item" id={itemIconId(it.name)} label={it.name} size={22} />
                        <span>{it.name}</span> <span className="text-neutral-500">{it.quality}</span>
                        {itemByName.get(it.name) ? null : <span className="text-xs text-red-600">нет в таблице</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Камни стихии ({inventory.stones.length})</h3>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {inventory.stones.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <GameIcon kind="element" id={elementIconId(stoneByName.get(s)?.element ?? 'Any')} label={s} size={18} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Духи ({inventory.spirits.length})</h3>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {inventory.spirits.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <GameIcon kind="spirit" id={spiritIconId(s)} label={s} size={22} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
            <h2 className="mb-3 text-lg font-semibold">Резервная копия всего состояния</h2>
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
              В файл попадают герои ({counts.heroes}), инвентарь и отметки «проходит/не проходит» ({counts.checks}).
              Импорт объединяет с текущими данными: герои обновляются по имени и классу, инвентарь пополняется.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={btnCls} onClick={() => void exportAll()}>
                Экспорт JSON
              </button>
              <input
                type="file"
                accept=".json,application/json"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  void f.text().then(importAll)
                }}
              />
            </div>
            {report ? <p className="mt-3 rounded bg-neutral-100 p-2 text-sm dark:bg-neutral-800">{report}</p> : null}
          </section>
        </>
      )}
    </main>
  )
}
