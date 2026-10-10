/**
 * Выбранные пользователем ограничения подбора (макс. тир, качество, тир камней, духи).
 * null в поле — «по умолчанию» (считается от отряда, см. engine/constraints.ts).
 * Хранится в IndexedDB; нечитаемая запись — молча берём значения по умолчанию.
 */
import { z } from 'zod'
import type { ConstraintOverrides } from '../engine/constraints.ts'
import { NO_OVERRIDES } from '../engine/constraints.ts'
import { idbStore, KEYS, type KeyValueStore } from './storage.ts'
import { QualitySchema } from './types.ts'

const OptimizeSettingsSchema = z.object({
  version: z.literal(1),
  overrides: z.object({
    maxItemTier: z.number().int().min(1).nullable(),
    maxQuality: QualitySchema.nullable(),
    maxStoneTier: z.number().int().min(0).nullable(),
    spirits: z.array(z.string()).nullable(),
  }),
})

export async function loadConstraintOverrides(store: KeyValueStore = idbStore): Promise<ConstraintOverrides> {
  const raw = await store.get<unknown>(KEYS.optimizeSettings).catch(() => undefined)
  const parsed = OptimizeSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data.overrides : NO_OVERRIDES
}

export async function saveConstraintOverrides(overrides: ConstraintOverrides, store: KeyValueStore = idbStore): Promise<void> {
  await store.set(KEYS.optimizeSettings, { version: 1, overrides })
}
