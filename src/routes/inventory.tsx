import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { exportAppStateJson, importAppStateJson } from '#/data/appState.ts'
import { loadHeroes } from '#/data/heroStore.ts'
import { EMPTY_INVENTORY, loadInventory, type Inventory } from '#/data/inventory.ts'
import { loadRealityChecks } from '#/data/realityChecks.ts'
import { itemIconId, spiritIconId, elementIconId } from '#/data/images.ts'
import { downloadText } from '#/lib/download.ts'
import { useGameData } from '#/ui/dataSync.ts'
import { GameIcon } from '#/ui/GameIcon.tsx'
import { InventoryEditor } from '#/ui/InventoryEditor.tsx'
import { Notice, Page, Section } from '#/ui/layout.tsx'

export const Route = createFileRoute('/inventory')({ component: InventoryPage })

function InventoryList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border">
      <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{title}</h3>
      <ul className="max-h-64 space-y-1 overflow-y-auto p-2 text-sm">{children}</ul>
    </div>
  )
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
    downloadText('st-app-state.json', await exportAppStateJson())
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

  const total = inventory.items.length + inventory.stones.length + inventory.spirits.length

  return (
    <Page title="Инвентарь" description="Предметы, камни и духи, из которых можно подбирать в режиме «только мой инвентарь».">
      {!data ? (
        <p className="text-sm text-muted-foreground">Загружаю данные…</p>
      ) : (
        <>
          <Section title="Предметы, камни и духи">
            <InventoryEditor data={data} inventory={inventory} onChange={setInventory} />
            {total > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <InventoryList title={`Предметы (${inventory.items.length})`}>
                  {inventory.items.map((it) => (
                    <li key={it.name} className="flex items-center gap-2">
                      <GameIcon kind="item" id={itemIconId(it.name)} label={it.name} size={22} />
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="text-muted-foreground">{it.quality}</span>
                      {itemByName.get(it.name) ? null : <Badge variant="destructive">нет в таблице</Badge>}
                    </li>
                  ))}
                </InventoryList>
                <InventoryList title={`Камни стихии (${inventory.stones.length})`}>
                  {inventory.stones.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <GameIcon kind="element" id={elementIconId(stoneByName.get(s)?.element ?? 'Any')} label={s} size={18} />
                      {s}
                    </li>
                  ))}
                </InventoryList>
                <InventoryList title={`Духи (${inventory.spirits.length})`}>
                  {inventory.spirits.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <GameIcon kind="spirit" id={spiritIconId(s)} label={s} size={22} />
                      {s}
                    </li>
                  ))}
                </InventoryList>
              </div>
            ) : null}
          </Section>

          <Section
            title="Резервная копия всего состояния"
            description={
              <>
                В файл попадают герои ({counts.heroes}), инвентарь и отметки «проходит/не проходит» ({counts.checks}). Импорт
                объединяет с текущими данными: герои обновляются по имени и классу, инвентарь пополняется.
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void exportAll()}>
                <Download /> Экспорт JSON
              </Button>
              <span className="text-sm text-muted-foreground">Импорт:</span>
              <Input
                type="file"
                accept=".json,application/json"
                className="w-auto max-w-full"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  void f.text().then(importAll)
                }}
              />
            </div>
            {report ? <Notice className="mt-3">{report}</Notice> : null}
          </Section>
        </>
      )}
    </Page>
  )
}
