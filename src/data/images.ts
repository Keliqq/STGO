/**
 * URL картинок. Изображения принадлежат Kabam и грузятся напрямую с их сайта (и с fankit stcentral-hub);
 * в репозиторий не копируются. Id берутся из src/data/imageMap.json (scripts/build-image-map.ts).
 */
import imageMapJson from './imageMap.json' with { type: 'json' }
import type { ImageMap } from './imageMapTypes.ts'
import type { Element, GameData } from './types.ts'

export const imageMap = imageMapJson as ImageMap

export const PST_ASSETS = 'https://playshoptitans.com/assets'
export const FANKIT_HOST = 'https://stcentral-hub.github.io'

export type IconKind = 'item' | 'spirit' | 'element' | 'type' | 'skill' | 'class' | 'area' | 'difficulty'

/**
 * id по видам:
 *  item    — uid предмета (`shortsword`);
 *  spirit  — ключ духа (`turtle`);
 *  element — `fire` … `gold` или `all`;
 *  type    — код типа (`armorheavy`);
 *  skill, class — путь в fankit (`/fankit/Skills/Hero/icon_global_skill_p_cleave.png`);
 *  area — имя файла из `fankit/Quest Areas/Quests` без префикса (`forest`), difficulty — `easy` … `extreme`.
 */
export function iconUrl(kind: IconKind, id: string): string {
  switch (kind) {
    case 'item':
      return `${PST_ASSETS}/items/${encodeURIComponent(id)}.png`
    case 'spirit':
      return `${PST_ASSETS}/enchantments/spirits/icon_global_enchant_spirit_${encodeURIComponent(id)}.png`
    case 'element':
      return `${PST_ASSETS}/enchantments/elementAffinities/icon_global_element_${encodeURIComponent(id)}.png`
    case 'type':
      return `${PST_ASSETS}/ui/types/icon_global_item_${encodeURIComponent(id)}.png`
    case 'area':
      return `${FANKIT_HOST}/fankit/Quest%20Areas/Quests/icon_global_questarea_${encodeURIComponent(id)}_small.png`
    case 'difficulty':
      return `${FANKIT_HOST}/fankit/Quest%20Difficulties/icon_difficulty_${encodeURIComponent(id)}.png`
    case 'skill':
    case 'class':
      return FANKIT_HOST + encodeURI(id)
  }
}

// Поиск id по именам из таблицы — для удобства UI

export const itemIconId = (name: string): string | null => imageMap.items[name] ?? null
export const spiritIconId = (enchantName: string): string | null => imageMap.spirits[enchantName] ?? null
export const typeIconId = (type: string): string | null => imageMap.types[type] ?? null
export const skillIconId = (skillName: string): string | null => imageMap.skills[skillName.replace(/ #\d+$/, '')] ?? null
export const classIconId = (className: string): string | null => imageMap.classes[className] ?? null
export const elementIconId = (el: Element | 'All' | 'Any'): string => (el === 'Any' ? 'all' : el.toLowerCase())

/** QUESTS.Area → файл иконки области в fankit (`Quest Areas/Quests`). Ручное соответствие: в таблице иконок областей нет. */
const AREA_ICON_IDS: Record<string, string> = {
  'Howling Woods': 'forest',
  'Aurora Caves': 'grotto',
  'Whispering Bog': 'swamp',
  'Barren Wastes': 'desert',
  "Sun God's Tomb": 'pyramid',
  'Chronos Ruins': 'ruins',
  'Haunted Castle': 'castle',
  'Sunken Temple': 'temple',
  'Bleakspire Peak': 'peak',
  'Cinderlake Volcano': 'volcano',
  'Void Dimension': 'rift',
  Elysium: 'elysium',
  'Ancient Jungle': 'jurassic',
  'Meteor Zone': 'space',
  'Lost City of Gold': 'goldcity',
}
export const areaIconId = (area: string): string | null => AREA_ICON_IDS[area] ?? null
export const difficultyIconId = (difficulty: string): string | null => {
  const id = difficulty.toLowerCase()
  return ['easy', 'medium', 'hard', 'extreme'].includes(id) ? id : null
}

/**
 * Портрет чемпиона: отдельных картинок чемпионов в fankit нет, но иконки их лидерских навыков
 * (`icon_global_skill_hero_<id>leader<N>`) — это и есть портрет. Берём первую ступень лидерского навыка.
 */
export function championIconId(data: Pick<GameData, 'champions' | 'skills'>, championName: string): string | null {
  const champion = data.champions.find((c) => c.name === championName)
  for (const id of champion?.leaderSkills ?? []) {
    const skill = data.skills.find((s) => s.id === id)
    const icon = skill ? skillIconId(skill.name) : null
    if (icon) return icon
  }
  return null
}
