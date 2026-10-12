# Схема данных Google-таблицы

Источник: https://docs.google.com/spreadsheets/d/1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c
Снимок изучен 2026-10-09 (фикстуры: `fixtures/sheets/*.csv`, обновить: `npm run dump-sheets`; сводка по колонкам: `npm run inspect-sheet -- <ЛИСТ> [строка_заголовка]`).

## Общие соглашения

| Явление | Как выглядит | Как парсить |
|---|---|---|
| «Нет значения» | `---` (иногда пустая ячейка: хвост таблицы, `Mana Shield`, последний ряд LCOG) | `---` и `''` → `null` |
| Числа | Разделитель тысяч — запятая: `"1,250"`, `"10,000,000"` | убрать `,` → `Number` |
| Проценты | В HEROES/CHAMPIONS — строка `30%`, `20% (+20%)`; в BLUEPRINTS EVA/CRIT — дробь `0.05` | см. A4 в ASSUMPTIONS |
| Множитель крита | `2x`, `3x`, `5x` | `parseFloat` |
| Время | `10 mins`, `1 hour, 30 mins`, `1 day` | пока не нужно движку |
| Диапазоны | `2-3 Elven Wood`, `4-7 Items` | `min-max name` |
| Уровень | `Lv. 4`, `Merchant Lv. 10`, `Loop 1, Lv. 40` | regex |
| Заголовки-иконки | В таблице над некоторыми колонками стоят картинки → в CSV заголовок пустой | колонки адресуются по индексу (см. ниже) |
| Блочная разметка | QUESTS, QUEST LEVELS, HEROES, CHAMPIONS, SLOTS — не таблицы, а «карточки»: блоки с подписями в ячейках | парсер ищет якорные подписи (`Prerequisite`, `Difficulty`, …), а не номера строк |

Ключи между листами — **точные строки имён** (регистр важен; в QUESTS заголовки локаций КАПСОМ, в QUEST COMPONENTS — обычным регистром). Встречаются опечатки в данных (`webbed Wing`, `Bronze fang`, `Deterioriated Book`) → сравнивать без учёта регистра.

```
BLUEPRINTS.Type ─────────────► HEROES (слоты экипировки класса)
BLUEPRINTS.Name (Element/Spirit) ◄──► ENCHANTMENTS.Name
BLUEPRINTS.Spirit Affinity ──► SKILLS.Name (Type=Enchantment, без «+»)
ENCHANTMENTS(Spirit).Name ──► SKILLS.Name: первое слово ("Ram Spirit" → "Ram Robustness"/"Ram Robustness+")
BLUEPRINTS.Built-In Element ─► ENCHANTMENTS.Name
BLUEPRINTS.Component ────────► QUEST COMPONENTS.Name | BLUEPRINTS.Name (предмет как ингредиент) | ENCHANTMENTS.Name
QUESTS.Component 1-3 ────────► QUEST COMPONENTS.Name
QUEST COMPONENTS.Quest Area ─► QUESTS (заголовок блока, без учёта регистра)
SKILLS.Classes ──────────────► HEROES (имя класса / группа «All Fighters», «All Promoted Rogues», …) | CHAMPIONS (имя)
HERO LEVELS.Max Item Tier ───► BLUEPRINTS.Tier | редактор героя: «носит до T{N}», подбор: потолок тира на героя (`formulas.ts → maxItemTierFor`, A66)
BLUEPRINTS.Name (Type = Aurasong) ◄──► SKILLS (Type = Aurasong, то же Name) | экипировка чемпиона: предмет и его навык ауры названы одинаково (A67)
QUESTS.Maximum Party Size ──► команды | размер отряда локации 3/4/5 — проверка состава (`data/teams.ts → validateParty`, A67)
```

---

## BLUEPRINTS — все чертежи (предметы, камни стихий, духи)

1626 строк × 97 колонок, строка 0 — заголовок, одна строка = один предмет. Ключ — `Name` (уникален).

| # | Колонка | Смысл | Тип | Пример |
|---|---|---|---|---|
| 0 | Name | Имя предмета (ключ) | string | `Squire Sword` |
| 1 | Type | Тип предмета (41 значение, см. ниже) | enum | `Sword` |
| 2 | Unlock Prerequisite | Как открыть: воркер/пак/сундук | string \| null | `Frozen Chest` |
| 3 | Research Scrolls | Цена исследования | int \| null | `6` |
| 4 | Antique Tokens | Цена в антикварных токенах | int \| null | `75` |
| 5 | Tier | Тир 1–16 | int | `4` |
| 6 | Value | Цена продажи | int | `2,050` |
| 7–8 | Crafting Time (seconds / formatted) | Время крафта | int / `hh:mm:ss` | `360` |
| 9–15 | Value/Time, Merchant XP, …/Time, Worker XP, Fusion XP, Favor, Airship Power | Экономика | number | |
| 17–22 | Required Worker / Worker Level ×3 | Нужные воркеры | string/int \| null | `Blacksmith`,`1` |
| 24–35 | *(иконки)* | Ресурсы на крафт: 24 Iron, 25 Wood, 26 Leather, 27 Herbs, 28 Steel, 29 Ironwood, 30 Fabric, 31 Oils, 32 Ether, 33 Jewels, 34 Essence, 35 Stardust (A2) | int \| null | |
| 37–39 | Component, Component Quality, Amount Needed | Ингредиент 1 | string, `Normal/Superior/Flawless` \| null, int | `Iron Pine Cone`, —, `2` |
| 40–42 | то же | Ингредиент 2 | | |
| **44** | **ATK** | Базовая атака (Normal-качество) | int \| null | `16` |
| **45** | **DEF** | Базовая защита | int \| null | `19` |
| **46** | **HP** | Базовое здоровье | int \| null | `5` |
| **47** | **EVA** | Уклонение, **дробь** | float \| null | `0.05` (=5%) |
| **48** | **CRIT** | Шанс крита, **дробь** | float \| null | `0.05` |
| **49** | **Mana Shield** | Мана-щит | int \| null (бывает `''`) | `25` |
| **51** | **Elemental Affinity** | Стихии, к которым у предмета сродство: одна, несколько через `, ` или `All` | list<Element> \| `All` \| null | `Earth, Dark` |
| **52** | **Spirit Affinity** | Навык духа, к которому сродство (= `SKILLS.Name` без `+`) | string \| null | `Bear Vitality` |
| **53** | **Built-In Element** | Встроенный камень стихии (`ENCHANTMENTS.Name`) | string \| null | `Nature Element` |
| **54** | **Built-In Spirit** | Встроенный дух (сейчас только `Mundra's Spirit`, его нет в ENCHANTMENTS) | string \| null | |
| 56–65 | Crafting Upgrade 1–5 / Crafts Needed | Мастерство крафта (текст бонуса) | string / int | `Quality Chance x2` |
| 67–76 | Starforged Milestone 1–5 / Crafts Needed | Звёздная ковка; встречаются боевые: `+25% Base ATK, DEF and HP`, `DEF +20` | string / int | |
| 78–83 | Ascension Upgrade 1–3 / Shards Needed | Возвышение (экономика) | string / int | |
| **84–89** | **Transcendence Upgrade 1–3 / Seals Needed** | Трансцендентность — **боевые**: `ATK +2`, `DEF +1`, `CRIT +2%`, `+10% Base ATK, DEF and HP` | string / int | |
| 91–94 | Discount/Surcharge/Suggest/Speed Up Energy | Энергия | int | |
| 96 | Is Antique starting on (UTC) | Дата антиквара | `Month D, YYYY` \| null | `April 8, 2020` |

**Типы предметов (`Type`), шт.:**
- оружие: Sword 53, Axe 50, Dagger 53, Mace 53, Spear 52, Bow 48, Staff 55, Wand 32, Crossbow 28, Gun 38, Instrument 25, Dual Wield 18, Catalyst 17, Scythe 12;
- броня: Heavy Armor 50, Light Armor 48, Clothes 50; голова: Helmet 53, Rogue Hat 52, Magician Hat 50, Mask 12; руки: Gauntlets 48, Gloves 48; ноги: Heavy Footwear 48, Light Footwear 54;
- расходники: Herbal Medicine 49, Potion 55, Spell 56, Meal 43, Dessert 26;
- аксессуары и прочее: Shield 52, Quiver 16, Cloak 30, Idol 19, Ring 51, Amulet 56, Familiar 18, Aurasong 21;
- не экипировка: Enchantment 77 (камни стихий и духи), Runestone 5, Moonstone 5.
- `Dual Wield`, `Familiar`, `Aurasong` **не встречаются ни в одном слоте классов** в HEROES: это экипировка
  чемпиона и предметы поддержки. Аурасонг (21 предмет, T3–T16, статы — DEF и немного HP/ATK) связан с навыком
  `Type = Aurasong` **по совпадению имени** (у этих предметов `Spirit Affinity` пусто); фамильяр (18 предметов,
  ATK/DEF/HP/EVA/CRIT) — носитель духа, сродство которого даёт «+»-версию навыка (A5). Модель — A67,
  `combat.ts → ChampionBuild/championEquipment`, страница «Команды».

### Статы по тирам
Статы задаются **поштучно** для каждого предмета (колонки 44–49), формулы «тир → стат» нет. Диапазоны базовых значений (качество Normal):

| Группа | T1 | T4 | T8 | T12 | T14 | T15 | T16 |
|---|---|---|---|---|---|---|---|
| Оружие ATK | 14–56 | 84–219 | 320–460 | 690–1010 | 1090–1600 | 1260–1860 | 1330–1960 |
| Броня (тело) DEF | 7–8 | 48–64 | 165–190 | 355–479 | 545–680 | 630–793 | 665–775 |
| Голова DEF | 7–32 | 39–56 | 150–237 | 320–429 | 510–813 | 590–833 | 211–963 |
| Руки DEF | 7 | 42–68 | 140–175 | 300–409 | 475–560 | 550–650 | 580–743 |
| Ноги DEF | 7–30 | 47–54 | 160–202 | 345–499 | 545–680 | 630–793 | 665–775 |
| Расходники ATK | 8–84 | 22–240 | 40–630 | 122–1240 | 207–1890 | 240–2205 | 254–2496 |

У большинства предметов есть второстепенные статы (у оружия — немного DEF/HP, у брони — ATK/HP). EVA встречается у лёгких типов (Dagger, Bow, Light Armor, Clothes, Gloves, Light Footwear, Cloak, Amulet, …), CRIT — у многих типов, Mana Shield — у 18 предметов.
`HERO LEVELS.Max Item Tier` ограничивает тир, который может носить герой.

### Множители качества
**В таблице отсутствуют.** Качество упоминается только для ингредиентов (`Component Quality`: Normal/Superior/Flawless). Значения Normal/Superior/Flawless/Epic/Legendary — см. ASSUMPTIONS A7 и PROGRESS.

---

## ENCHANTMENTS — камни стихий и духи

74 строки × 9 колонок, строка 0 — заголовок. Ключ — `Name`.

| # | Колонка | Смысл | Тип | Пример |
|---|---|---|---|---|
| 0 | Name | Имя камня/духа | string | `Ember Element`, `Ram Spirit` |
| 1 | Type | `Element` (33) \| `Spirit` (40) | enum | |
| 2–8 | *(иконки)* | Величина стихии по стихиям: 2 Fire, 3 Water, 4 Air, 5 Earth, 6 Light, 7 Dark, 8 Gold (A3). У камня заполнена ровно одна колонка | int \| null | `5` |

У строк `Spirit` колонки 2–8 пустые (в первой строке духов в колонке 2 — примечание «смотрите лист Skills»).

**Камни стихий** — 6 стихий × 5 ступеней + Gold × 3:

| Стихия | 5 | 10 | 15 | 25 | 35 |
|---|---|---|---|---|---|
| Fire | Ember (T4) | Flame (T7) | Blaze (T9) | Inferno (T12) | Blistering |
| Water | Bubble | Tide | Flood | Torrent | Maelstrom |
| Air | Breeze | Gale | Tempest | Hurricane | Tornado |
| Earth | Nature | Wild | Primal | Primeval | Gaia |
| Light | Light | Holy | Sacred | Divine | Apotheosis |
| Dark | Corrupted | Unholy | Nightmare | Abyssal | Oblivion |
| Gold | Luxurious (5) | — | Opulent (15) | — | Platinum (35) |

**Что даёт камень стихии:**
1. величину стихии (колонки 2–8) — она идёт против стихийного барьера квеста;
2. собственные ATK/DEF/HP — берутся из строки **BLUEPRINTS** с тем же именем (`Ember Element`: T4, ATK 16, DEF 11, HP 3).
Сродство предмета (`Elemental Affinity`) усиливает эффект — правило в таблице не описано (A6), но подтверждено официальными заметками 9.0.0: несовпадающий камень «can still be enchanted like before», просто без бонуса. То же у духов (`Spirit Affinity` — «slightly stronger Spirit skill effect», A5): сродство не ограничивает выбор, а включает бонус (A65).

**Что даёт дух:**
1. собственные ATK/DEF/HP из BLUEPRINTS (`Ram Spirit`: T4, 19/12/4; `Titan Spirit`: T14, 164/109/33);
2. навык из SKILLS (`Type = Enchantment`). Связь — по первому слову: `Ram Spirit` → `Ram Robustness` (+5% Defense) / `Ram Robustness+` (+10% Defense). Версия `+` — предположительно при совпадении со `Spirit Affinity` предмета (A5).
Проверено: у всех 40 духов найдены пары навыков, и все значения `Spirit Affinity` в BLUEPRINTS есть в SKILLS.

---

## HEROES — классы героев

159 строк × 24 колонки. **Блочная разметка**: три колонки карточек — Fighter (c0=1), Rogue (c0=9), Spellcaster (c0=17), ширина карточки 7 колонок + разделитель. Строки 0–1 — заголовки групп и примечание «статы указаны с учётом врождённого навыка».

Карточка класса (смещения от якоря — строки, где в `c0+2` стоит `Prerequisite`):

| Строка | c0 | c0+1 | c0+2 | c0+3 | c0+4 | c0+5 | c0+6 |
|---|---|---|---|---|---|---|---|
| +0 | **ИМЯ** (у промоушена: `"MERCENARY\n(Soldier Class Promotion)"`) | | `Prerequisite` | `Merchant Lv. 10` / `Titan Soul` / `---` | `HP` | `30` | `ELEMENT` |
| +1 | | | `Critical Hit Chance` | `5%` / `20% (+20%)` | `ATK` | `10` | |
| +2 | `Gold Hire Cost` | `10,000` / `FREE` / `---` | `Critical Hit Damage` | `2x` | `DEF` | `15` | **стихия**: `Earth` … / `Any` |
| +3 | `Gem Hire Cost` | `50` | `Threat Rating` | `90` | `EVA` | `0%` / `30% (+20%)` | |
| +4 | `Equipment Slot 1` | … | … | … | … | `Equipment Slot 6` | `Skill Slot Unlock` |
| +5…+N | тип для слота 1 | слот 2 | слот 3 | слот 4 | слот 5 | слот 6 | `Lv. 4` |

Строки +5…: **каждая колонка — список допустимых типов предметов для слота** (по одному типу на строку, `---` = больше нет). Последняя колонка — уровни открытия слотов навыков. Карточка заканчивается пустой строкой. Отсюда же берутся базовые статы класса: HP/ATK/DEF/EVA/Crit/CritDmg/Threat и стихия героя.

42 класса (21 базовый + 21 промоушен; в сессии 1 здесь ошибочно было 46). Связь «базовый → промоушен» — из подписи `(X Class Promotion)`.

### Какие типы носит каждый класс (слоты 1–6)

| Класс (→ промоушен) | Слот 1 | Слот 2 | Слот 3 | Слот 4 | Слот 5 | Слот 6 |
|---|---|---|---|---|---|---|
| Soldier | Sword/Mace/Dagger/Scythe | Heavy Armor | Gauntlets | Heavy Footwear | Potion/Meal | Shield |
| → Mercenary | +Spear | = | = | = | = | = |
| Barbarian | Sword/Axe/Spear/Mace/Scythe | Helmet/Mask | Gauntlets | Heavy Footwear | Potion/Dessert/Idol | Herbal Medicine/Meal/Cloak |
| → Chieftain | = | = | = | = | = | +Shield |
| Knight | Spear/Axe | Heavy Armor | Gauntlets | Helmet | Heavy Footwear | Shield |
| → Lord | +Sword/Mace | = | = | = | = | = |
| Ranger = Warden | Bow/Crossbow/Gun | Heavy Armor | Gauntlets | Helmet | Potion/Meal | Ring/Cloak/Quiver |
| Samurai = Daimyo | Sword/Bow/Spear | Heavy Armor | Gauntlets | Helmet | Heavy Footwear | Potion/Meal/Quiver |
| Berserker | Mace/Axe/Gun/Instrument/Scythe | Heavy Armor | Gauntlets | Heavy Footwear | Shield/Cloak/Quiver/Idol | Herbal Medicine/Potion/Dessert |
| → Jarl | = | = | +Helmet | = | = | = |
| Dark Knight = Death Knight | Sword/Axe/Mace/Crossbow/Catalyst | Heavy Armor | Gauntlets/Helmet/Mask | Heavy Footwear | Spell/Amulet/Idol | Shield/Cloak/Quiver/Idol |
| Thief | Dagger/Bow/Crossbow | Light Armor | Rogue Hat/Mask | Gloves | Amulet/Cloak/Quiver | Ring |
| → Trickster | +Instrument | = | = | +Light Footwear | = | = |
| Monk = Grandmaster | Clothes | Amulet/Cloak | Amulet/Dessert | Amulet/Idol | Ring | Ring |
| Musketeer | Crossbow/Sword/Gun | Light Armor | Gloves | Heavy Footwear | Potion/Meal | Amulet/Quiver |
| → Conquistador | = | = | = | +Light Footwear | = | = |
| Wanderer = Pathfinder | Dagger/Axe/Gun | Light Armor | Rogue Hat | Light Footwear | Herbal Medicine/Meal/Cloak/Quiver | Amulet/Dessert/Idol |
| Ninja = Sensei | Dagger/Sword/Bow/Scythe | Light Armor | Rogue Hat/Mask | Gloves | Light Footwear | Ring/Meal/Quiver |
| Dancer = Acrobat | Dagger/Bow/Crossbow/Wand/Instrument/Catalyst | Light Armor | Rogue Hat/Mask | Gloves | Light Footwear | Ring/Amulet/Quiver/Idol |
| Velite = Praetorian | Shield | Light Armor | Rogue Hat/Mask | Gloves | Light Footwear | Meal/Dessert/Ring/Amulet/Idol |
| Mage = Archmage | Staff/Crossbow/Wand/Instrument/Catalyst | Clothes | Magician Hat/Mask | Light Footwear | Spell | Ring/Cloak/Quiver/Idol |
| Cleric | Mace/Spear/Wand/Scythe | Clothes | Magician Hat/Mask | Light Footwear | Spell | Shield/Cloak/Idol |
| → Bishop | = | = | = | = | = | +Ring |
| Druid | Staff/Bow/Wand/Instrument/Catalyst | Clothes | Herbal Medicine/Meal | Herbal Medicine/Meal | Amulet/Idol | Spell/Quiver |
| → Arch Druid | = | = | = | = | +Ring | = |
| Sorcerer = Warlock | Staff/Dagger/Wand/Catalyst/Scythe | Clothes | Gloves/Dessert | Light Footwear | Spell | Spell |
| Spellblade = Spellknight | Sword/Axe/Staff/Bow/Instrument | Heavy Armor/Light Armor/Clothes | Magician Hat/Helmet/Gauntlets/Gloves/Mask | Heavy Footwear/Light Footwear | Amulet/Ring/Potion/Spell | Amulet/Ring/Herbal Medicine/Shield/Quiver/Idol |
| Geomancer = Astramancer | Staff/Mace/Wand/Catalyst | Clothes | Magician Hat/Mask | Gloves | Spell | Herbal Medicine/Dessert/Shield |
| Chronomancer = Fateweaver | Staff/Sword/Wand/Instrument/Catalyst | Clothes | Magician Hat/Mask | Light Footwear | Spell | Ring/Amulet/Meal/Idol |

(`=` — как у базового класса, `+X` — промоушен добавляет тип.) Таблица собрана из фикстуры автоматически. Движок будет читать данные из листа, а не из этой таблицы.

Базовые статы (примеры): Soldier HP 30 / ATK 10 / DEF 15 / EVA 0% / Crit 5% ×2 / Threat 90 / Earth; Thief 22/10/10/30%/20%×2/40/Air; Mage 20/24/10/0%/5%×2/10/Fire; Ninja `EVA 30% (+20%)`, `Crit 20% (+20%)` — в скобках бонус врождённого навыка; Spellblade — стихия `Any`.

## HERO LEVELS

51 строка × 3 колонки, строка 0 — заголовок: `Hero Level` (1–50) → `XP Needed` (int, `---` у уровня 1) → `Max Item Tier` (1–16). **Прироста статов по уровням здесь нет.**

---

## SKILLS — навыки (героев, лидеров, врождённые, духов, аурасонги, артефакты)

621 строка × 8 колонок, строка 0 — заголовок. `Name` почти уникален (617 из 621: дубли у артефактов, например `Midas' Tragedy`).

| # | Колонка | Смысл | Тип | Пример |
|---|---|---|---|---|
| 0 | Name | Имя навыка | string | `Cleave` |
| 1 | Type | `Leader` (навык чемпиона), `Hero` (обычный), `Innate` (врождённый навык класса), `Enchantment` (дух), `Aurasong`, `Artifact` | enum | `Hero` |
| 2 | Tier | Ступень 1–5 внутри линейки | int \| null | `2` |
| 3 | Rarity | `Common`/`Rare`/`Epic` (у Hero) | enum \| null | `Common` |
| 4 | *(без заголовка)* | Порог стихии героя, с которого открывается ступень (10–170; A12) | int \| null | `15` |
| 5 | Skill Effect(s) | Эффекты, свободный текст | string | `+45% Attack, +15 Health` |
| 6 | Classes | Кому доступен: имена классов и групп через `, ` | list | `All Fighters, Spellblade, Spellknight` |
| 7 | Requires Class Promotion | `Yes` \| null | bool | |

Линейка навыка — подряд идущие строки с ростом `Tier` (Cleave → Searing Cleave → Scorching Cyclone → Infernal Tempest). Явного ID линейки нет.

**Группы в `Classes`:** `All Classes`, `All Promoted Classes`, `All Fighters`, `All Promoted Fighters`, `All Rogues`, `All Promoted Rogues`, `All Spellcasters`, `All Promoted Spellcasters` + конкретные классы (`Spellblade`, `Velite`, …) и чемпионы (`Argon`, …, а также `Aang`, `Sokka` — их нет в CHAMPIONS).

### Формат эффектов
Клаузы через `, ` (иногда через `. `). 184 различных шаблона, если заменить числа на `N`. Самые частые:

| Шаблон | Кол-во | Смысл для движка |
|---|---|---|
| `±N% Attack` / `Defense` / `Health` / `Mana Shield` / `Evasion` / `Critical Hit Chance` / `Critical Hit Damage` | 194/85/60/60/81/51/60 | % к стату героя |
| `+N Health`, `+N Attack`, `+N Defense`, `+N Threat` | 29/…/…/15 | плоская прибавка |
| `+N% Attack with <ItemType>` (`…, Crossbow, Instrument`) | ~70 | бонус к ATK предметов типа; перечисление типов продолжается после запятой — **запятая не всегда разделяет клаузы** |
| `+N% Defense with Heavy Armor, Helmet, …` / `+N% stats with Ring` / `+N% bonus from all items [with Staff]` | 7/7/21 | бонус к статам предметов |
| `±N% … for the party`, `… to the party` | Leader/Aurasong | бафф всей группы |
| `+N% … for each Fighter/Spellcaster/Rogue` | 4 | зависит от состава группы |
| `+N% Critical Hit Chance for N rounds`, `on the first round`, `when enemy's HP is below 50%`, `Bonuses are doubled against bosses` | — | условные/временные |
| `Heal N HP each turn`, `N% chance to survive one fatal blow`, `drain N% HP from all allies` | — | механики боя |
| `Can use any element, but only counts as N% against Elemental Barriers`, `+N% party Element bonus VS Elemental Barriers` | 7/2 | влияют на барьер |
| `±N% Break Chance`, `Resting Time`, `XP`, `faster quest time`, `more components`, `reduced Energy cost to surcharge` | — | не боевые, движок игнорирует |
| `Critical Hit Chance is set to 20% and cannot change`, `Evasion is set to 0%`, `Equipped weapons grant no bonuses` | — | переопределения (артефакты) |

Значит, нужен парсер эффектов с явным whitelist шаблонов; нераспознанные клаузы надо логировать.

---

## CHAMPIONS — чемпионы

221 строка × 10 колонок. Строка 0 — примечание («X — текущий ранг Power Up»). Блоки по вертикали (c0=1), якорь — `Prerequisite` в c0+2:

| Строка | c0 | c0+1 | c0+2 | c0+3 | c0+4 | c0+5 |
|---|---|---|---|---|---|---|
| +0 | **ИМЯ** (`REINHOLD (Guest Champion)`) | | `Prerequisite` | `Merchant Lv. 1` | `HP` | `30` |
| +1 | `Element` | `Light` | `Critical Hit Chance` | `5%` | `ATK` | `50` |
| +2 | `Unlock Cost` | `FREE` / `25 Coins` | `Critical Hit Damage` | `2x` | `DEF` | `30` |
| +3 | `Class Type` | `Fighter` | `Threat Rating` | `90` | `EVA` | `0%` |
| +4 | `Rank` | `Coins Needed` | `Rank Reward` | | | |
| +5… | `1`…`11`, `11 (+X)` | `5` / `" 50 + (10 * X)"` | `+7 Health, +31 Attack, +43 Defense` или `Leader Skill Upgraded: Aura of Resolve` | | | |

Справа от блока ARGON (колонки 8–9) находится общая таблица **Element Breakpoints**: `Rank → Element Value` (1→—, 5→15, 6→30, 8→45, 9→60, 10→80, 12→90, 14→100, 16→110, 20→125). По тексту она общая для всех чемпионов (A13).
13 чемпионов: Argon, Lilu, Sia, Yami, Rudo, Polonia, Donovan, Hemma, Ashley, Bjorn, Malady; гостевые Reinhold (Gold, 4 ранга), Tamas (4 ранга). Лидерские навыки — SKILLS `Type=Leader`, `Classes=<имя>`. Бонусы рангов **накопительные или нет — не указано** (A14).

**Слотов экипировки у чемпиона в листе нет** (в CHAMPIONS только ранги, монеты и лидерские навыки). Модель
«Команд» даёт ему два предмета поддержки из BLUEPRINTS — аурасонг (`Aurasong`) и фамильяр (`Familiar`) плюс дух
в фамильяре; список духов для фамильяра — обычный (сродство включает «+»-версию, A5). Обоснование и что не
проверено — A67.

---

## QUESTS — локации, сложности, боссы, барьеры

198 строк × 17 колонок. **Блоки по вертикали**, по одному на локацию, между блоками пустая строка.

| Строка блока | Содержимое |
|---|---|
| заголовок | `[1]` ИМЯ ЛОКАЦИИ; `[5]`=`Maximum Party Size`, `[7]`=3/4/5; `[8]`=`Gold Unlock Cost`, `[10]`; `[11]`=`Required Merchant Level`, `[13]` |
| +1 | `[5]`=`Chest & Key`, `[7]`=`Wooden`; `[8]`=`Gem Unlock Cost`, `[10]` |
| +2 | заголовки колонок (якорь `[1]=Difficulty`) |
| +3… | строки сложностей |

Колонки строки сложности:

| # | Колонка | Смысл | Тип | Пример |
|---|---|---|---|---|
| 1 | Difficulty | `Easy`/`Medium`/`Hard`/`Extreme`; у Lost City of Gold — уровни `1`…`13` | enum \| int | `Hard` |
| 2 | Type | `---` = обычный квест, `Boss` = босс локации | enum | `Boss` |
| 3 | Minimum Power | Рекомендованная сила отряда | int \| null | `750` |
| 4 | Hero XP | Опыт | int | |
| 5–7 | Quest/Rest/Heal Time | Время | duration | `1 hour, 30 mins` |
| 8–10 | Component 1–3 | Дроп компонентов `min-max Name` | range | `12-18 Elven Wood` |
| 11 | Item Drop Quantity | `4-7 Items` | range | |
| **12** | **Monster Health** | HP монстра/босса | int | `10,000` |
| **13** | **Monster Base DMG** | Базовый урон по цели | int | `20` |
| **14** | **Monster AOE DMG** | Урон по площади | int | `13` |
| **15** | **Barrier Type** | Стихии барьера: одна (боссы) или три (обычные) через `, ` | list<Element> \| null | `Air, Earth, Light` |
| **16** | **Barrier Health** | Величина барьера | int \| null | `15` |

Локации (размер отряда, уровень открытия): Howling Woods (3, —), Aurora Caves (3, 10), Whispering Bog (3, 20), Barren Wastes (3, 30), Sun God's Tomb (4, 35), Chronos Ruins (4, 40), Haunted Castle (4, 50), Sunken Temple (4, 55), Bleakspire Peak (4, 58), Cinderlake Volcano (4, 60), Void Dimension (4, 62), Elysium (4, 64), Ancient Jungle (4, 66), Meteor Zone (4, 68), Lost City of Gold (5, 25; 13 уровней × обычный/босс, без барьеров).
Барьер есть на всех Extreme (обычный — три стихии, босс — одна). Начиная с Cinderlake Volcano у **боссов** барьер есть на всех сложностях (Easy…Extreme, 165→400). Совпадает с данными stcentral-hub. У последней строки LCOG барьер записан как `''`, а не `---`.

**Порогов защиты в листе нет.** Есть на https://stcentral-hub.github.io/posts/main-quests/ (статичный HTML, CORS `*`, лицензия CC BY-NC-ND 4.0): на каждую сложность три пары `50% <DEF>`, `70% <DEF>`, `75% <DEF>`. Для Howling Woods Easy: 100 / 200 / 600 (пороги снижения урона). Обычно 70% = 2×(50%), 75% = 6×(50%). Там 28 квестов (14 локаций × обычный/босс), Lost City of Gold нет. Имена саб-локаций (Elvenwood Glade…) и боссов (Troublin Chief…) тоже есть только там. См. A10.

## QUEST COMPONENTS

67 строк × 5 колонок, строка 0 — заголовок: `Name` (ключ) → `Type` (`---` | `Artifact` | `Timewarped`) → `Tier` (int) → `Value` (int) → `Quest Area` (одна или несколько локаций через `, `, обычный регистр). Движку подбора экипировки не нужен.

## QUEST LEVELS

28 строк × 42 колонки: 14 локаций по горизонтали (`[1+3k]`=Level, `[2+3k]`=Reward), уровни 1–25. Награды текстом: `+25% Elven Wood`, `Boss Unlocked`, `Medium Difficulty Unlocked`, `Hard Difficulty Unlocked`, `-10% Quest Time`… Пригодится только для фильтра «какие сложности открыты». Extreme здесь не упоминается.

## SLOTS

44 строки × 25 колонок. **Это не слоты экипировки**, а покупаемые слоты аккаунта: HERO SLOTS (41: № → `Lv. N`/`Loop 1, Lv. N` → Gold → Gems), CRAFTING, QUEST, TRADE, PET SLOTS — 5 блоков по горизонтали. Для оптимизатора нужен максимум «сколько героев можно иметь», не более. Слоты экипировки героев (6 штук) описаны в HEROES.

---

## Внешние id (не из таблицы) — `src/data/imageMap.json`

Собирает `scripts/build-image-map.ts`. Колонки с внутренним id предмета в BLUEPRINTS **нет**. Источник — страницы `playshoptitans.com/blueprints/<категория>/<код типа>` (Next.js, данные в `__NEXT_DATA__`): `items[].uid`, `items[].skill` (`i_<ключ духа>` / `a_<артефакт>`), словарь `texts` (`<uid>_name`, `skill_i_<ключ>_name`, `skill_a_<uid>_name`, `item_type_<код>`). Обход — BFS по ссылкам категорий, 48 страниц. Иконки классов и навыков — по дереву репозитория STCentral-Hub/stcentral-hub.github.io (GitHub API).

| Вид | URL | Пример id |
|---|---|---|
| item | `https://playshoptitans.com/assets/items/<uid>.png` | `shortsword` (Squire Sword) |
| spirit | `…/assets/enchantments/spirits/icon_global_enchant_spirit_<ключ>.png` | `turtle` (Ram Spirit) |
| element | `…/assets/enchantments/elementAffinities/icon_global_element_<стихия>.png` | `fire`, `gold`, `all` |
| type | `…/assets/ui/types/icon_global_item_<код>.png` | `armorheavy` (Heavy Armor), `scrolls` (Spell) |
| skill, class | `https://stcentral-hub.github.io/fankit/…` | `/fankit/Skills/Hero/icon_global_skill_p_cleave.png` |

Покрытие на 2026-10-09: предметы 1549/1549, духи 40/40, типы 40/40, классы 42/42, артефакты 13, навыки 463/621.

---

## Экспорт TitansDB (`.txt`) — герои пользователя

Разбор — `src/data/titansdb.ts`, пример — `fixtures/heroes.txt` (18 героев). Одна строка — один герой, поля через TAB:

| # | Поле | Пример |
|---|---|---|
| 0 | Имя героя | `Антуан` |
| 1 | Подпись группы (задаёт пользователь) | `Red/Fighter type`, `Berserker/Jarl` |
| 2–3 | ? (3/2/1; `None`) | |
| 4, 5, 6 | HP, ATK, DEF — как на карточке героя | `527`, `1366`, `5393` |
| 7 | Угроза | `120` |
| 8 | Шанс крита, % | `5` |
| 9 | Множитель крита | `2`, `4.6` |
| 10 | Уклонение, % | `20`, `48.99` |
| 11 | Стихия героя (величина) | `90` |
| 12 | Стихия героя (имя) | `Light` |
| 13 | Шанс пережить смертельный удар, % (из навыка; у Денама 100 = «Crusader») | `100` |
| 14–17 | ? (в фикстуре нули; **кандидаты в колонки семян силы** — A55) | |
| 18 | **Σ ATK% модификаторов**, посчитанный игрой (float с шумом: 224.942 ≈ 225) | `224.942017` |
| 19 | **Σ DEF% модификаторов**, посчитанный игрой | `39.99939` |
| предпоследнее | Артефактный предмет или `None` | `Amulet of Midas` |
| последнее | Блок через `\|` — ищется динамически: первое поле, где больше 30 частей | |

Блок через `|` (смещения):

| # | Смысл | Пример |
|---|---|---|
| 0 | Душа Титана | `No` |
| 1 | Тип | `Red Type` |
| 2 | Класс (как в HEROES; в фикстуре только базовые) | `Knight` |
| 3–8 | Типы слотов 1–6 (`Cape` = `Cloak`) | `Spear` |
| 9–14 | Предметы `Имя (СТАТ/СТАТ) - T7` | `Twicicle Javelin (ATK/DEF) - T7` |
| 15–20 | Качество | `Superior` |
| 21–26 | Камень `величина / Tier N` или пусто | `15 / Tier 9` |
| 27–32 | Дух `Имя (описание обычной версии навыка)` | `Lion Spirit (+5%ATK +1%EVA)` |
| 33–36 | Навыки `Имя (описание)`; описание — **высшей** ступени, может отсутствовать; имя бывает старым (`Mana Shield` = `Magic Shield`) или id иконки (`S_scythemaster`) | `Thick Skin (+120% DEF & +30% HP)` |
| 37 | Уровень | `26` |
| 38–40 | ? (нули — **кандидаты в колонки семян силы**, как и 14–17; A55) | |
| 41–46 | Стихия камня в слоте 1–6 | `Light` |
| 47–52 | Флаги `No` (вероятно, связи) | |
| 53 | ? (`1`/`0`) | |

### Команды (не из таблицы) — `src/data/teams.ts`

Пользовательская сущность страницы «Команды» (IndexedDB-ключ `teams`, версия записи 1; входит в резервную
копию — `appState.ts` версии 3): имя, участники (**снимок** героя — экипировка, навыки, уровень, Душа — плюс
ссылка `heroId`), чемпион с рангом, аурасонгом, фамильяром и духом, целевая локация (id квеста) и заметка.
Снимок нужен, чтобы команда оставалась воспроизводимой после переодевания героя; ссылка — для «Обновить из
героев». Проверка состава — `validateParty` (размер локации, один чемпион), описание правил — A67.

Сопоставление с GameData: имена без учёта регистра, пробелов и вида апострофа; камень — по стихии и величине (тир сверяется); навык — имя линейки/ступени → id иконки fankit → описание. Ступень навыка не берётся из экспорта: её считает движок по стихии героя (ASSUMPTIONS A12, A22). Колонки 13/18/19 (шанс выжить, Σ ATK%, Σ DEF%) — это итоговые модификаторы, которые посчитала игра; движок сверяет с ними свои Σ ATK%/DEF% (A28) — это точная проверка модели навыков. Колонки 14–17 и 38–40 — кандидаты в семена силы, но **в фикстуре они нулевые у всех 18 героев**, поэтому сейчас не разбираются: прибавка за семя — параметр `SEED_STAT_PER_SEED` (A55). Хранение — `HeroInstance` (`src/data/types.ts`), IndexedDB-ключ `heroes`, файл экспорта `st-app/heroes` (JSON).

С сессии 25 героя можно создать и править вручную (форма «Новый герой» / «Изменить»): экспорт нужен
только для того, чтобы получить эталон базы (A8). Поля черновика (`draft`, `originId`) и версия записи 2
описаны в ASSUMPTIONS A65; правила «что герою можно надеть» — `src/engine/heroEditor.ts`. С сессии 26
`Max Item Tier` уровня ограничивает и подбор (A66), а камень/дух вставляются в любой предмет — сродство
включает только бонус (A5, A6, A65).
