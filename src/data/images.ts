/**
 * URL картинок. Изображения принадлежат Kabam и грузятся напрямую с их сайта (и с fankit stcentral-hub);
 * в репозиторий не копируются. Id берутся из src/data/imageMap.json (scripts/build-image-map.ts).
 */
import imageMapJson from './imageMap.json' with { type: 'json' }
import type { ImageMap } from './imageMapTypes.ts'
import type { Element } from './types.ts'

export const imageMap = imageMapJson as ImageMap

export const PST_ASSETS = 'https://playshoptitans.com/assets'
export const FANKIT_HOST = 'https://stcentral-hub.github.io'

export type IconKind = 'item' | 'spirit' | 'element' | 'type' | 'skill' | 'class'

/**
 * id по видам:
 *  item    — uid предмета (`shortsword`);
 *  spirit  — ключ духа (`turtle`);
 *  element — `fire` … `gold` или `all`;
 *  type    — код типа (`armorheavy`);
 *  skill, class — путь в fankit (`/fankit/Skills/Hero/icon_global_skill_p_cleave.png`).
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
