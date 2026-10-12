/**
 * Актуальность данных (CLAUDE.md → «Актуальность данных»):
 *  - loadGameData(): IndexedDB → если пусто/несовместимо, встроенный snapshot.json;
 *  - ensureFresh(ttlHours): если данные старше TTL — перечитать все листы, собрать GameData, проверить схему
 *    и только при полном успехе одной записью заменить кэш. Любая ошибка — кэш не трогаем, пишем в статус;
 *  - diff(old, new): что изменилось — для сообщения «Данные обновлены: +N предметов, изменено M»;
 *  - статус для UI: дата данных, источник, ошибки, предупреждения (подписка через subscribeStatus).
 */
import { applyBreakpoints, type BreakpointsData, type BreakpointsStatus, loadBreakpoints } from './breakpoints.ts'
import { buildGameData, REQUIRED_SHEETS } from './build.ts'
import { discoverGids, fetchSheetResolved, type SheetName } from './fetchSheet.ts'
import type { ImageMap } from './imageMapTypes.ts'
import { applyUserQuestCaps, loadQuestCaps, type QuestCaps, saveQuestCaps } from './questCaps.ts'
import { idbStore, type KeyValueStore, KEYS } from './storage.ts'
import { type GameData, GameDataSchema, type Item, type Quest, type RawSheets } from './types.ts'

export type DataSource = 'cache' | 'snapshot' | 'fresh'

/** Что лежит в IndexedDB под KEYS.gameData. */
export interface CachedGameData {
  data: GameData
  savedAt: string
  /** gid, по которым листы реально загрузились (если gid поменялся — запоминаем новый). */
  gids: Partial<Record<SheetName, number>>
}

export interface DataDiff {
  addedItems: string[]
  removedItems: string[]
  changedItems: { name: string; fields: { field: string; before: unknown; after: unknown }[] }[]
  /** Остальные сущности: сколько добавлено/удалено/изменено. */
  other: Record<'enchants' | 'heroClasses' | 'skills' | 'champions' | 'quests', { added: number; removed: number; changed: number }>
}

export interface DataStatus {
  source: DataSource | null
  /** Когда были прочитаны листы, на которых построены текущие данные. */
  dataDate: string | null
  checking: boolean
  lastCheckAt: string | null
  /** Ошибка последней проверки (данные при этом остались прежними). */
  error: string | null
  /** Обходные пути при загрузке (смена gid, gviz) — данные обновлены, но стоит знать. */
  warnings: string[]
  /** Сообщение о последнем обновлении. */
  lastUpdate: { at: string; message: string; diff: DataDiff } | null
  /** Пороги защиты (stcentral-hub): null — ещё не загружались. */
  breakpoints: BreakpointsStatus | null
  /**
   * «Defense cap с экрана игры» по квестам (A71): введённые пользователем значения из IndexedDB.
   * Подставляются в `defCaps` тем квестам, у которых порогов хаба нет.
   */
  userQuestCaps: QuestCaps
}

// ───────────── Статус (observable для useSyncExternalStore) ─────────────

const INITIAL_STATUS: DataStatus = {
  source: null,
  dataDate: null,
  checking: false,
  lastCheckAt: null,
  error: null,
  warnings: [],
  lastUpdate: null,
  breakpoints: null,
  userQuestCaps: {},
}
let status: DataStatus = INITIAL_STATUS
let current: GameData | null = null
let breakpoints: BreakpointsData | null = null
let userCaps: QuestCaps = {}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<DataStatus>): void {
  status = { ...status, ...patch }
  for (const l of listeners) l()
}

export const getStatus = (): DataStatus => status
export const getCurrentData = (): GameData | null => current
export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Только для тестов. */
export function resetSyncState(): void {
  current = null
  breakpoints = null
  userCaps = {}
  status = INITIAL_STATUS
}

// ───────────── Загрузка ─────────────

export interface SyncDeps {
  store?: KeyValueStore
  /** Встроенный снапшот. По умолчанию — динамический импорт snapshot.json (отдельный чанк). */
  loadSnapshot?: () => Promise<unknown>
  /** Карта картинок для свежей сборки. По умолчанию — bundled imageMap.json. */
  loadImageMap?: () => Promise<ImageMap>
  fetchImpl?: typeof fetch
  now?: () => Date
  signal?: AbortSignal
}

const defaultSnapshot = async () => (await import('./snapshot.json')).default
const defaultImageMap = async () => (await import('./imageMap.json')).default as ImageMap

/** Проверка формы: кэш старой версии или битый — не используем. */
function asGameData(value: unknown): GameData | null {
  const res = GameDataSchema.safeParse(value)
  return res.success ? res.data : null
}

/** IndexedDB → снапшот. Кэш несовместимой версии/формы игнорируется (останется до первой успешной проверки). */
export async function loadGameData(deps: SyncDeps = {}): Promise<GameData> {
  const store = deps.store ?? idbStore
  let cached: CachedGameData | undefined
  try {
    cached = await store.get<CachedGameData>(KEYS.gameData)
  } catch (e) {
    setStatus({ warnings: [...status.warnings, `IndexedDB недоступна: ${e instanceof Error ? e.message : String(e)}`] })
  }
  const fromCache = cached ? asGameData(cached.data) : null
  if (fromCache) {
    current = fromCache
    setStatus({ source: 'cache', dataDate: fromCache.fetchedAt })
    return fromCache
  }
  const snapshot = asGameData(await (deps.loadSnapshot ?? defaultSnapshot)())
  if (!snapshot) throw new Error('Встроенный снапшот данных повреждён или устарел (пересоберите приложение).')
  current = snapshot
  setStatus({
    source: 'snapshot',
    dataDate: snapshot.fetchedAt,
    warnings: cached ? [...status.warnings, 'Кэш в браузере несовместим с этой версией приложения — использую встроенные данные.'] : status.warnings,
  })
  return snapshot
}

export interface EnsureFreshResult {
  updated: boolean
  skipped?: 'fresh' | 'busy'
  error?: string
  diff?: DataDiff
}

let inFlight: Promise<EnsureFreshResult> | null = null

/**
 * Перечитать таблицу, если данные старше ttlHours (или force). Возвращает промис, но предполагается вызов «фоном»:
 * UI подписан на статус. Параллельный повторный вызов получает тот же промис.
 */
export function ensureFresh(ttlHours: number, deps: SyncDeps & { force?: boolean } = {}): Promise<EnsureFreshResult> {
  inFlight ??= runEnsureFresh(ttlHours, deps).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runEnsureFresh(ttlHours: number, deps: SyncDeps & { force?: boolean }): Promise<EnsureFreshResult> {
  const store = deps.store ?? idbStore
  const now = deps.now ?? (() => new Date())
  const cached = await store.get<CachedGameData>(KEYS.gameData).catch(() => undefined)
  const old = (cached && asGameData(cached.data)) ?? current
  const age = old ? now().getTime() - Date.parse(old.fetchedAt) : Infinity
  if (!deps.force && age < ttlHours * 3_600_000) return { updated: false, skipped: 'fresh' }

  setStatus({ checking: true })
  try {
    // 1. Все листы. Поиск gid — один на все листы и только если понадобился.
    let discovered: Promise<Map<string, number>> | undefined
    const discover = () => (discovered ??= discoverGids({ fetchImpl: deps.fetchImpl, signal: deps.signal }))
    const results = await Promise.all(
      REQUIRED_SHEETS.map(async (name) => {
        const r = await fetchSheetResolved(name, { gids: cached?.gids, discover, fetchImpl: deps.fetchImpl, signal: deps.signal })
        return [name, r] as const
      }),
    )
    const raw: RawSheets = Object.fromEntries(results.map(([n, r]) => [n, r.rows]))
    const loadWarnings = results.flatMap(([, r]) => (r.warning ? [r.warning] : []))
    const gids = Object.fromEntries(results.filter(([, r]) => r.gid !== null).map(([n, r]) => [n, r.gid])) as CachedGameData['gids']

    // 2. Сборка: SchemaError и прочие ошибки → в catch, кэш не трогаем
    const imageMap = await (deps.loadImageMap ?? defaultImageMap)()
    const fresh = buildGameData(raw, { fetchedAt: now().toISOString(), imageMap })
    // 3. Полная проверка итоговой формы (страховка от ошибок сборки)
    GameDataSchema.parse(fresh)

    // 4. Атомарная замена: одна запись — одна транзакция
    const record: CachedGameData = { data: fresh, savedAt: now().toISOString(), gids }
    await store.set(KEYS.gameData, record)

    const d = old ? diff(old, fresh) : null
    current = fresh
    setStatus({
      source: 'fresh',
      dataDate: fresh.fetchedAt,
      checking: false,
      lastCheckAt: now().toISOString(),
      error: null,
      warnings: loadWarnings,
      lastUpdate: d ? { at: now().toISOString(), message: diffMessage(d), diff: d } : status.lastUpdate,
    })
    return { updated: true, diff: d ?? undefined }
  } catch (e) {
    const error = `Не удалось обновить данные: ${e instanceof Error ? e.message : String(e)}. Работаю на прежних данных.`
    setStatus({ checking: false, lastCheckAt: now().toISOString(), error })
    return { updated: false, error }
  }
}

// ───────────── Diff ─────────────

function itemFields(i: Item): Record<string, unknown> {
  const n = i.stats.Normal
  return {
    type: i.type,
    tier: i.tier,
    atk: n.atk,
    def: n.def,
    hp: n.hp,
    eva: n.eva,
    crit: n.crit,
    manaShield: n.manaShield,
    elementAffinity: i.elementAffinity,
    spiritAffinity: i.spiritAffinity,
    builtInElement: i.builtInElement,
    builtInSpirit: i.builtInSpirit,
    artifactSkill: i.artifactSkill,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function diffBy<T>(a: T[], b: T[], key: (x: T) => string) {
  const before = new Map(a.map((x) => [key(x), x]))
  const after = new Map(b.map((x) => [key(x), x]))
  let added = 0
  let removed = 0
  let changed = 0
  for (const [k, v] of after) {
    const o = before.get(k)
    if (!o) added++
    else if (!same(o, v)) changed++
  }
  for (const k of before.keys()) if (!after.has(k)) removed++
  return { added, removed, changed }
}

export function diff(oldData: GameData, newData: GameData): DataDiff {
  const before = new Map(oldData.items.map((i) => [i.name, i]))
  const after = new Map(newData.items.map((i) => [i.name, i]))
  const changedItems: DataDiff['changedItems'] = []
  for (const [name, item] of after) {
    const o = before.get(name)
    if (!o) continue
    const a = itemFields(o)
    const b = itemFields(item)
    const fields = Object.keys(b)
      .filter((f) => !same(a[f], b[f]))
      .map((f) => ({ field: f, before: a[f], after: b[f] }))
    if (fields.length > 0) changedItems.push({ name, fields })
  }
  return {
    addedItems: [...after.keys()].filter((n) => !before.has(n)),
    removedItems: [...before.keys()].filter((n) => !after.has(n)),
    changedItems,
    other: {
      enchants: diffBy(oldData.enchants, newData.enchants, (x) => x.name),
      heroClasses: diffBy(oldData.heroClasses, newData.heroClasses, (x) => x.name),
      skills: diffBy(oldData.skills, newData.skills, (x) => x.id),
      champions: diffBy(oldData.champions, newData.champions, (x) => x.name),
      quests: diffBy(oldData.quests, newData.quests, (x) => x.id),
    },
  }
}

export function diffMessage(d: DataDiff): string {
  const parts = [`+${d.addedItems.length} предметов`, `изменено ${d.changedItems.length}`]
  if (d.removedItems.length > 0) parts.push(`удалено ${d.removedItems.length}`)
  const otherChanged = Object.values(d.other).reduce((s, x) => s + x.added + x.removed + x.changed, 0)
  if (otherChanged > 0) parts.push(`прочих изменений: ${otherChanged}`)
  return `Данные обновлены: ${parts.join(', ')}`
}

// ───────────── Пороги защиты ─────────────

/** Загрузить пороги (кэш IndexedDB → stcentral-hub). Ошибка не фатальна: режим «без порогов». */
export async function syncBreakpoints(deps: SyncDeps & { force?: boolean; ttlHours?: number } = {}): Promise<BreakpointsStatus> {
  const r = await loadBreakpoints({
    store: deps.store ?? idbStore,
    force: deps.force,
    ttlHours: deps.ttlHours,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
    signal: deps.signal,
  })
  breakpoints = r.data
  setStatus({ breakpoints: r.status })
  return r.status
}

/** Квесты с подставленными порогами (если они загружены). */
export function questsWithCaps(data: GameData): { quests: Quest[]; matched: number; warnings: string[]; userMatched: number; noHubCaps: Quest[] } {
  const base = breakpoints ? applyBreakpoints(data.quests, breakpoints.blocks) : { quests: data.quests, matched: 0, warnings: [] }
  // Пороги хаба важнее: введённый пользователем cap идёт только туда, где порогов не осталось (A71).
  const user = applyUserQuestCaps(base.quests, userCaps)
  // Квесты, которым порогов хаба не досталось, — именно их пользователь может вписать вручную (A71).
  const noHubCaps = base.quests.filter((q) => !q.defCaps)
  return { quests: user.quests, matched: base.matched, warnings: base.warnings, userMatched: user.matched, noHubCaps }
}

// ───────────── «Defense cap с экрана игры» (A71) ─────────────

/** Прочитать введённые пользователем пороги из IndexedDB (при старте приложения). */
export async function syncUserQuestCaps(deps: SyncDeps = {}): Promise<QuestCaps> {
  userCaps = await loadQuestCaps(deps.store ?? idbStore)
  setStatus({ userQuestCaps: userCaps })
  return userCaps
}

/**
 * Записать «Defense cap с экрана игры» для квеста (пустое значение — убрать). Пороги считает
 * `defCapsFromCap` (cap/6, cap/3, cap): на экране игры видно только одно число — порог 75%.
 */
export async function setUserQuestCap(questId: string, cap: number | null, deps: SyncDeps = {}): Promise<void> {
  const next: QuestCaps = { ...userCaps }
  if (cap === null) delete next[questId]
  else next[questId] = Math.max(1, Math.round(cap))
  userCaps = next
  await saveQuestCaps(next, deps.store ?? idbStore)
  setStatus({ userQuestCaps: next })
}
