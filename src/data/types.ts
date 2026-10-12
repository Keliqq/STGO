/**
 * Модель игровых данных (GameData) — то, во что превращаются листы таблицы.
 * Схемы zod — единственный источник правды: типы выводятся из них (z.infer),
 * ими же валидируются отдельные сущности при сборке и кэш при чтении из IndexedDB.
 * Описание исходных листов — docs/SCHEMA.md.
 */
import { z } from 'zod'

/** Версия формата GameData. Поднять при несовместимом изменении — старый кэш будет отброшен. */
export const GAME_DATA_VERSION = 1

export const ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold'] as const
export const ElementSchema = z.enum(ELEMENTS)
export type Element = z.infer<typeof ElementSchema>

export const QUALITIES = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary'] as const
export const QualitySchema = z.enum(QUALITIES)
export type Quality = z.infer<typeof QualitySchema>

export const CLASS_GROUPS = ['Fighter', 'Rogue', 'Spellcaster'] as const
export const ClassGroupSchema = z.enum(CLASS_GROUPS)
export type ClassGroup = z.infer<typeof ClassGroupSchema>

/** Тип предмета — строка из BLUEPRINTS.Type (`Sword`, `Heavy Armor`, …). Список не фиксируем: игра добавляет типы. */
export const ItemTypeSchema = z.string().min(1)
export type ItemType = z.infer<typeof ItemTypeSchema>

/** Не экипировка: камни стихий/духи и расходники для улучшений. */
export const NON_EQUIPMENT_TYPES: readonly ItemType[] = ['Enchantment', 'Runestone', 'Moonstone']

const int = z.number().int()
const nonNeg = z.number().nonnegative()

/** Боевые статы. EVA и CRIT — доли (0.05 = 5%), см. ASSUMPTIONS A4. */
export const StatsSchema = z.object({
  atk: nonNeg,
  def: nonNeg,
  hp: nonNeg,
  eva: nonNeg,
  crit: nonNeg,
  manaShield: nonNeg,
})
export type Stats = z.infer<typeof StatsSchema>

// ───────────────────────────── Навыки ─────────────────────────────

export const EFFECT_STATS = [
  'atk', 'def', 'hp', 'eva', 'crit', 'critDmg', 'manaShield', 'threat', 'xp',
  /** Бонус к статам экипировки («+40% bonus stats from EQ», «+50% stats with Ring», «bonus from all items with Staff»). */
  'itemStats',
] as const
export const EffectStatSchema = z.enum(EFFECT_STATS)
export type EffectStat = z.infer<typeof EffectStatSchema>

export const EffectConditionSchema = z.discriminatedUnion('kind', [
  /** Только для предметов перечисленных типов («with Sword, Axe»). */
  z.object({ kind: z.literal('itemType'), types: z.array(ItemTypeSchema).min(1) }),
  /** За каждого героя группы в отряде («for each Rogue»). */
  z.object({ kind: z.literal('perPartyMember'), group: ClassGroupSchema }),
  z.object({ kind: z.literal('firstRound') }),
  z.object({ kind: z.literal('rounds'), rounds: int.positive() }),
  z.object({ kind: z.literal('selfHpBelow'), pct: nonNeg }),
  z.object({ kind: z.literal('enemyHpBelow'), pct: nonNeg }),
  z.object({ kind: z.literal('vsBoss') }),
  z.object({ kind: z.literal('untilDamaged') }),
  /** Только для предметов со встроенной стихией. */
  z.object({ kind: z.literal('innateElementItem') }),
  /** Только для предмета, в который вставлен дух. */
  z.object({ kind: z.literal('enchantedItem') }),
  /** Только для предметов Lost City of Gold. */
  z.object({ kind: z.literal('lcogItem') }),
])
export type EffectCondition = z.infer<typeof EffectConditionSchema>

/**
 * Один эффект навыка. `value` — число как в тексте: для mode='pct' 120 означает +120%.
 * Для eva/crit «+25%» — это +25 п.п. к шансу (как трактовать — решает движок, ASSUMPTION A16).
 */
export const SkillEffectSchema = z.object({
  stat: EffectStatSchema,
  mode: z.enum(['pct', 'flat']),
  value: z.number(),
  scope: z.enum(['self', 'party']),
  condition: EffectConditionSchema.optional(),
})
export type SkillEffect = z.infer<typeof SkillEffectSchema>

/** `Other` — строки с Type `---` (сейчас одна: `Quiver Bow Bonus`, бонус типа предмета). */
export const SKILL_TYPES = ['Leader', 'Hero', 'Innate', 'Enchantment', 'Aurasong', 'Artifact', 'Other'] as const
export const SkillTypeSchema = z.enum(SKILL_TYPES)
export type SkillType = z.infer<typeof SkillTypeSchema>

export const SkillSchema = z.object({
  /** Уникальный ключ: имя, у повторов — `Имя #2` (дубли есть у артефактов). */
  id: z.string().min(1),
  name: z.string().min(1),
  type: SkillTypeSchema,
  tier: int.positive().nullable(),
  rarity: z.enum(['Common', 'Rare', 'Epic']).nullable(),
  /** Безымянная колонка 4 (A12) — величина стихии героя, с которой открывается эта ступень. */
  upgradeCost: int.nullable(),
  text: z.string(),
  effects: z.array(SkillEffectSchema),
  /** Клаузы, которые распознаны как небоевые (время отдыха, XP-бонусы лута и т. п.) — движок их игнорирует. */
  ignored: z.array(z.string()),
  /** Клаузы, которые парсер не понял. Показываются в разделе «Данные». */
  unparsed: z.array(z.string()),
  /** Как в таблице: имена классов, групп («All Fighters») и чемпионов. */
  classesRaw: z.array(z.string()),
  /** Развёрнутый список классов героев (группы раскрыты). */
  classes: z.array(z.string()),
  /** Чемпионы из `Classes` (для Leader-навыков). */
  champions: z.array(z.string()),
  requiresPromotion: z.boolean(),
  /** Первый навык линейки (Cleave → Searing Cleave → … : у всех `line = 'Cleave'`). */
  line: z.string(),
})
export type Skill = z.infer<typeof SkillSchema>

// ───────────────────────────── Предметы ─────────────────────────────

export const UpgradeSchema = z.object({ text: z.string(), need: int.nullable() })
export type Upgrade = z.infer<typeof UpgradeSchema>

export const ItemSchema = z.object({
  name: z.string().min(1),
  type: ItemTypeSchema,
  tier: int.min(1).max(30),
  isEquipment: z.boolean(),
  unlock: z.string().nullable(),
  /** Статы по качествам. Normal — из таблицы, остальные — множителями (ASSUMPTION A7, src/engine/constants.ts). */
  stats: z.record(QualitySchema, StatsSchema),
  /** Стихии сродства; `'All'` — любая; `[]` — нет. */
  elementAffinity: z.union([z.literal('All'), z.array(ElementSchema)]),
  /** Навык духа, к которому сродство (= Skill.name без «+»). */
  spiritAffinity: z.string().nullable(),
  /** Встроенный камень стихии (Enchant.name). */
  builtInElement: z.string().nullable(),
  /** Встроенный дух (сейчас только `Mundra's Spirit`). */
  builtInSpirit: z.string().nullable(),
  /** Навык артефакта (Skill.id) — для предметов из артефактных сундуков. */
  artifactSkill: z.string().nullable(),
  /** Боевые апгрейды: звёздная ковка и трансцендентность (текст как в таблице). */
  starforged: z.array(UpgradeSchema),
  transcendence: z.array(UpgradeSchema),
  /** Внутренний id игры для картинки (`/assets/items/<id>.png`), null — не найден. */
  imageId: z.string().nullable(),
})
export type Item = z.infer<typeof ItemSchema>

export const EnchantSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['element', 'spirit']),
  /** Для камня стихии — стихия и её величина. */
  element: ElementSchema.nullable(),
  elementValue: int.nonnegative().nullable(),
  tier: int.nullable(),
  /** Собственные статы (строка BLUEPRINTS с тем же именем), Normal. */
  stats: StatsSchema.nullable(),
  /** Для духа — навык и его «+»-версия (Skill.id). */
  skill: z.string().nullable(),
  skillPlus: z.string().nullable(),
  /** Ключ иконки (spirit: `turtle` для Ram Spirit; element: `fire`). */
  iconId: z.string().nullable(),
  /** id картинки предмета-чертежа. */
  imageId: z.string().nullable(),
})
export type Enchant = z.infer<typeof EnchantSchema>

// ───────────────────────────── Герои ─────────────────────────────

export const HeroBaseStatsSchema = z.object({
  hp: nonNeg,
  atk: nonNeg,
  def: nonNeg,
  eva: nonNeg,
  crit: nonNeg,
  /** Множитель крита: 2 = ×2. */
  critDmg: nonNeg,
  threat: nonNeg,
})
export type HeroBaseStats = z.infer<typeof HeroBaseStatsSchema>

export const HeroClassSchema = z.object({
  name: z.string().min(1),
  group: ClassGroupSchema,
  /** Для промоушена — базовый класс. */
  baseClass: z.string().nullable(),
  /** Для базового класса — его промоушен. */
  promotion: z.string().nullable(),
  element: z.union([ElementSchema, z.literal('Any')]),
  prerequisite: z.string().nullable(),
  goldHireCost: int.nullable(),
  gemHireCost: int.nullable(),
  /** Статы 1-го уровня, уже с врождённым навыком 1-й ступени (примечание на листе). */
  base: HeroBaseStatsSchema,
  /** Часть EVA/CRIT от врождённого навыка — то, что в скобках `20% (+20%)`. */
  innateBonus: z.object({ eva: nonNeg, crit: nonNeg }),
  /** 6 слотов → допустимые типы предметов. */
  slots: z.array(z.array(ItemTypeSchema).min(1)).length(6),
  /** Уровни открытия слотов навыков. */
  skillSlotLevels: z.array(int.positive()),
  /** Врождённый навык по ступеням (Skill.id), без ступени, требующей промоушена. */
  innateSkills: z.array(z.string()),
  /** Ступень врождённого навыка, открываемая Душой Титана (`Requires Class Promotion = Yes`). */
  innateTitanSkill: z.string().nullable(),
  iconPath: z.string().nullable(),
})
export type HeroClass = z.infer<typeof HeroClassSchema>

export const HeroLevelSchema = z.object({ level: int.positive(), xp: int.nonnegative().nullable(), maxItemTier: int.positive() })
export type HeroLevel = z.infer<typeof HeroLevelSchema>

// ───────────────────────────── Чемпионы ─────────────────────────────

export const ChampionRankSchema = z.object({
  rank: int.positive(),
  coins: int.nullable(),
  /** Прибавка статов на этом ранге (A14: накопительно или итог — не подтверждено). */
  reward: z.object({ hp: int, atk: int, def: int }).nullable(),
  /** `Leader Skill Upgraded: X` → Skill.id. */
  leaderSkill: z.string().nullable(),
})

export const ChampionSchema = z.object({
  name: z.string().min(1),
  guest: z.boolean(),
  element: ElementSchema,
  group: ClassGroupSchema,
  prerequisite: z.string().nullable(),
  unlockCost: z.string().nullable(),
  base: HeroBaseStatsSchema,
  ranks: z.array(ChampionRankSchema),
  /** Строка `11 (+X)`: прибавка за каждый ранг Power Up. */
  powerUp: z.object({ coinsFormula: z.string(), reward: z.object({ hp: int, atk: int, def: int }) }).nullable(),
  /** Лидерские навыки по порядку (Skill.id). */
  leaderSkills: z.array(z.string()),
})
export type Champion = z.infer<typeof ChampionSchema>

export const ElementBreakpointSchema = z.object({ rank: int.positive(), value: int.nonnegative().nullable() })
export type ElementBreakpoint = z.infer<typeof ElementBreakpointSchema>

// ───────────────────────────── Квесты ─────────────────────────────

export const DefCapsSchema = z.object({ p50: nonNeg, p70: nonNeg, p75: nonNeg })
export type DefCaps = z.infer<typeof DefCapsSchema>

export const QuestAreaSchema = z.object({
  /** Как в заголовке блока QUESTS, но в обычном регистре: `Howling Woods`. */
  name: z.string().min(1),
  partySize: int.positive(),
  goldUnlockCost: int.nullable(),
  gemUnlockCost: int.nullable(),
  requiredMerchantLevel: int.nullable(),
  chest: z.string().nullable(),
})
export type QuestArea = z.infer<typeof QuestAreaSchema>

export const QuestSchema = z.object({
  /** `Howling Woods|normal|Easy`. */
  id: z.string().min(1),
  area: z.string().min(1),
  variant: z.enum(['normal', 'boss']),
  /** `Easy`/`Medium`/`Hard`/`Extreme`; у Lost City of Gold — `1`…`13`. */
  difficulty: z.string().min(1),
  minPower: int.nullable(),
  heroXp: int.nullable(),
  monsterHp: int.positive(),
  monsterDmg: int.nonnegative(),
  monsterAoe: int.nonnegative(),
  /**
   * Шанс AoE-атаки монстра именно в этом квесте (доля, 0.25 = 25%). В таблице поля нет:
   * в GameData почти всегда null — движок берёт `AOE_CHANCE` (A31/A70). Заполняется, только если
   * для квеста известно своё значение (stcalc: 236 пар «квест × сложность» из 244 — 25%, особые — 50% и 0%).
   */
  aoeChance: nonNeg.nullish(),
  /** Шанс крита монстра в этом квесте (доля, 0.1 = 10%); null — `ENEMY_CRIT_CHANCE` (в Башне 15%, A70). */
  enemyCritChance: nonNeg.nullish(),
  barrier: z.object({ elements: z.array(ElementSchema).min(1), hp: int.positive() }).nullable(),
  /**
   * Пороги защиты 50/70/75%. В таблице их нет; в GameData всегда null —
   * подставляются в рантайме из stcentral-hub (src/data/breakpoints.ts), см. A10.
   */
  defCaps: DefCapsSchema.nullable(),
  /** Мини-боссов нет ни в таблице, ни на stcentral-hub (A17) — поле зарезервировано. */
  miniBosses: z.array(z.object({ name: z.string(), hp: int, dmg: int })),
})
export type Quest = z.infer<typeof QuestSchema>

export const QuestLevelRewardSchema = z.object({ area: z.string(), level: int.positive(), reward: z.string() })
export type QuestLevelReward = z.infer<typeof QuestLevelRewardSchema>

export const AccountSlotSchema = z.object({
  kind: z.enum(['hero', 'crafting', 'quest', 'trade', 'pet']),
  n: int.positive(),
  requirement: z.string().nullable(),
  goldCost: int.nullable(),
  gemCost: int.nullable(),
})
export type AccountSlot = z.infer<typeof AccountSlotSchema>

// ───────────────────────────── Итог ─────────────────────────────

export const RejectSchema = z.object({
  sheet: z.string(),
  /** Номер строки в листе, с 1 (как в Google Sheets). */
  row: z.number().int().nullable(),
  key: z.string().nullable(),
  reason: z.string(),
})
export type Reject = z.infer<typeof RejectSchema>

export const GameDataSchema = z.object({
  version: z.literal(GAME_DATA_VERSION),
  /** Когда листы были прочитаны (ISO). */
  fetchedAt: z.string(),
  items: z.array(ItemSchema),
  enchants: z.array(EnchantSchema),
  heroClasses: z.array(HeroClassSchema),
  heroLevels: z.array(HeroLevelSchema),
  skills: z.array(SkillSchema),
  champions: z.array(ChampionSchema),
  championElementBreakpoints: z.array(ElementBreakpointSchema),
  questAreas: z.array(QuestAreaSchema),
  quests: z.array(QuestSchema),
  questLevels: z.array(QuestLevelRewardSchema),
  accountSlots: z.array(AccountSlotSchema),
  /** Строки, которые не удалось разобрать. Не теряются молча — показываются в UI. */
  rejects: z.array(RejectSchema),
  /** Нестрашные несоответствия между листами (неизвестный класс в SKILLS и т. п.). */
  warnings: z.array(z.string()),
})
export type GameData = z.infer<typeof GameDataSchema>

// ───────────────────────────── Герои пользователя ─────────────────────────────

/** Слот экипировки героя. Имена — ключи GameData (Item.name, Enchant.name). */
export const HeroSlotSchema = z.object({
  item: z.string().nullable(),
  quality: QualitySchema,
  /** Камень стихии (Enchant.name, kind='element'). */
  element: z.string().nullable(),
  /** Дух (Enchant.name, kind='spirit'). */
  spirit: z.string().nullable(),
})
export type HeroSlot = z.infer<typeof HeroSlotSchema>

export const HERO_INSTANCE_VERSION = 2

/** Герой пользователя: хранится в IndexedDB, экспортируется в JSON. */
export const HeroInstanceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** HeroClass.name — базовый класс или промоушен. */
  className: z.string().min(1),
  level: int.min(1).max(99),
  titanSoul: z.boolean(),
  slots: z.array(HeroSlotSchema).length(6),
  /** Навыки конкретной ступени (Skill.id). */
  skills: z.array(z.string()),
  /** Семена силы (плоская прибавка к базе). */
  seeds: z.object({ atk: int.nonnegative(), def: int.nonnegative(), hp: int.nonnegative() }),
  /**
   * Эталон из экспорта TitansDB: снаряжение и показанные игрой статы на момент экспорта.
   * Нужен для сверки расчёта и для калибровки базы героя (A8): пока уровень не изменился,
   * база берётся из эталона, а не из усреднённой модели роста. У созданного вручную героя его нет.
   */
  reference: z
    .object({
      level: int.min(1),
      slots: z.array(HeroSlotSchema).length(6),
      skills: z.array(z.string()),
      stats: z.object({
        hp: nonNeg, atk: nonNeg, def: nonNeg, threat: nonNeg,
        /** Доли: 0.05 = 5%. */
        crit: nonNeg, critDmg: nonNeg, eva: nonNeg,
        element: nonNeg,
      }),
      /**
       * Итоговые модификаторы, посчитанные игрой (колонки 13/18/19 экспорта TitansDB, см. SCHEMA):
       * шанс пережить смертельный удар и Σ ATK%/DEF% в процентах. Служат для сверки модели навыков (A27).
       */
      pct: z.object({ survive: nonNeg, atk: nonNeg, def: nonNeg }).optional(),
    })
    .nullable(),
  /**
   * Черновик — «копия для экспериментов» (требование владельца): дубликат героя, который можно
   * свободно править и сравнивать с оригиналом. В подбор черновики попадают наравне с героями.
   * Поле появилось в сессии 25; у файлов и записей прошлых версий его нет. Отсутствие = «не черновик»
   * (`heroStore.ts → normalizeHero` приводит поле к явному false при сохранении и чтении).
   */
  draft: z.boolean().optional(),
  /** Для черновика — id героя, с которого сделана копия (для сравнения «до/после»). */
  originId: z.string().nullish(),
})
export type HeroInstance = z.infer<typeof HeroInstanceSchema>

/** Сырые листы: имя → строки → ячейки. */
export type RawSheets = Record<string, string[][]>
