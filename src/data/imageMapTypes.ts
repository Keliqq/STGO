/**
 * Соответствие «имя из таблицы → внутренний id игры» для картинок и связей, которых нет в таблице.
 * Генерируется scripts/build-image-map.ts в src/data/imageMap.json. Сами картинки в репозиторий не копируются.
 */
export interface ImageMap {
  generatedAt: string | null
  /** BLUEPRINTS.Name → uid (`Squire Sword` → `shortsword`) → https://playshoptitans.com/assets/items/<uid>.png */
  items: Record<string, string>
  /** Дух (ENCHANTMENTS.Name) → ключ иконки (`Ram Spirit` → `turtle`). */
  spirits: Record<string, string>
  /** Навык духа (SKILLS.Name без «+») → тот же ключ. */
  spiritSkills: Record<string, string>
  /** Предмет-артефакт → имя навыка артефакта (из `skill_a_<uid>_name` на playshoptitans.com). */
  artifacts: Record<string, string>
  /** BLUEPRINTS.Type → код иконки типа (`Heavy Armor` → `armorheavy`). */
  types: Record<string, string>
  /** Навык (SKILLS.Name) → путь в fankit stcentral-hub. */
  skills: Record<string, string>
  /** Класс героя → путь в fankit stcentral-hub. */
  classes: Record<string, string>
}

export const EMPTY_IMAGE_MAP: ImageMap = {
  generatedAt: null,
  items: {},
  spirits: {},
  spiritSkills: {},
  artifacts: {},
  types: {},
  skills: {},
  classes: {},
}
