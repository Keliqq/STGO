# Отчёт: финальная проверка оптимизатора

Сгенерировано: 2026-10-12 командой `node scripts/final-report.ts`.

Отряд: Антуан (Knight 26), Беовульф (Ranger 25), Эбигейл (Sorcerer 26) + чемпион Argon ранг 5.
Данные — фикстуры листов (fixtures/sheets), пороги защиты — из фикстур (без stcentral-hub).

Каждая локация посчитана в трёх пулах (см. «Пулы» ниже). Sanity-вывод по «Cinderlake Volcano Extreme 0 % → 100 %»:
это достигается только на пуле all до T20 с качеством Legendary (раздел с пометкой «эталонный верх»);
для героев 25–26 уровней (макс. тир 9 по HERO LEVELS) T20-набор недостижим — см. разделы «достижимый пул» и «ограничения по умолчанию».

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **89.0%** (до подбора — 0.0%), симуляций: 527, время: 20.7 с
- Lost City of Gold · босс · 13: win rate 89.0%, раундов 28.1, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +8.0 п.п. | +17113 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Legendary) +Apotheosis Element +Christmas Spirit | +4.2 п.п. | +20 стихии, +148 HP и др. · минус: -10 угрозы |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Dragonfang Fists (Legendary) +Apotheosis Element +Bahamut Spirit | +7.0 п.п. | +360 HP, +3285 DEF и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Mundra's Skull (Legendary) +Apotheosis Element +Kraken Spirit | +3.2 п.п. | +6522 DEF, +217 HP и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Kraken Spirit | +3.2 п.п. | +6532 DEF, +20 стихии и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Argon's Shield (Legendary) +Apotheosis Element +Kraken Spirit | +3.2 п.п. | +6222 DEF, +219 HP и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Titan Shotkeeper (Legendary) +Tornado Element +Titan Spirit | +16.3 п.п. | +6228 ATK, +757 HP и др. · минус: -1% EVA |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | BIT.Runner Armor (Legendary) +Tornado Element +Kraken Spirit | +2.7 п.п. | +2683 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Xenotype Forelimbs (Legendary) +Tornado Element +Kraken Spirit | +2.1 п.п. | +2408 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +2.7 п.п. | +2548 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Mixture of Resentment (Legendary) +Tornado Element +Kraken Spirit | +14.4 п.п. | +1036 HP, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Bahamut Spirit | +20.2 п.п. | +7345 ATK, +929 HP и др. · минус: -112 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +62.5 п.п. | +10% CRIT, +12803 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Gothita Frock Coat (Legendary) +Oblivion Element +Titan Spirit | +14.4 п.п. | +1445 DEF, +376 HP и др. · минус: -1430 ATK |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +54.1 п.п. | +1176 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Voidwalkers (Legendary) +Abyssal Element +Bahamut Spirit | +16.6 п.п. | +1469 DEF, +5% CRIT и др. · минус: -1430 ATK |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Titan Spirit | +77.9 п.п. | +35938 ATK, +20 стихии и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +70.0 п.п. | +39900 ATK, +20 стихии и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp):
- Антуан: Главное для героя: угроза: +10 угрозы ≈ +1.6 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +3.2 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +5.2 п.п. win rate
- Доли атак босса: Антуан 45%, Беовульф 45%, Эбигейл 11%

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 7.6 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.0, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Amber Citadel (Legendary) +Kraken Spirit | +0.0 п.п. | +286 ATK · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +286 ATK · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Berserker Helmet (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Berserker Stompers (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +286 ATK · минус: -15 стихии |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Hive Guard Plate (Legendary) +Tempest Element +Bahamut Spirit | +0.0 п.п. | +643 ATK, +441 DEF и др. · минус: -1% EVA |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 16, урон ÷ 4.0):
- Антуан: Главное для героя: угроза: +10 угрозы ≈ +0.6 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +2.8 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.2 п.п. win rate
- Доли атак босса: Антуан 52%, Беовульф 38%, Эбигейл 10%

### Локация: Lost City of Gold · босс · 13 — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 7.0 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.6, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Breastplate (Superior) +Kraken Spirit | +0.0 п.п. | +307 ATK · минус: -1883 DEF |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Warlord Helmet (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +307 ATK, +354 DEF · минус: -3 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | CM-73 Jetboots (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +307 ATK, +302 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Superior) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +307 ATK · минус: -130 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Hive Guard Plate (Superior) +Tempest Element +Bahamut Spirit | +0.0 п.п. | +552 ATK, +167 DEF и др. · минус: -1% EVA |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 16, урон ÷ 4.0):
- Антуан: Главное для героя: HP: +5% HP ≈ +9.2 п.п. win rate
- Беовульф: Главное для героя: угроза: +10 угрозы ≈ +2.0 п.п. win rate
- Эбигейл: Главное для героя: шанс крита: +1% CRIT ≈ +5.2 п.п. win rate
- Доли атак босса: Антуан 49%, Беовульф 41%, Эбигейл 10%

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 9.9 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.3, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Lost Warrior's Plate (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +5% CRIT, +307 ATK и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Heaume of the Mightiest (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +9523 DEF, +7% CRIT и др. · минус: -64 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Rock Stompers (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +10485 DEF, +175 HP и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +307 ATK и др. · минус: -63 HP |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 128, урон ÷ 11.2):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.6% урона, +0.15 п.п. мин. HP
- Беовульф: Главное для героя: уклонение: +1% EVA ≈ +0.86 п.п. мин. HP выжившего
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.2% урона, +0.80 п.п. мин. HP
- Доли атак босса: Антуан 49%, Беовульф 41%, Эбигейл 10%
- Барьер Dark 400: у отряда 90, не хватает 310

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.
- Life Drain (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Double Cast (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Deadly Criticals (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 7.0 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.1, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Amber Citadel (Legendary) +Kraken Spirit | +0.0 п.п. | +1461 DEF, +327 ATK · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK и др. · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Crown of Tyranny (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +781 DEF и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Topaz Greaves (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +861 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK и др. · минус: -15 стихии |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 128, урон ÷ 11.2):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.6% урона, +0.46 п.п. мин. HP
- Беовульф: Главное для героя: HP: +5% HP ≈ +1.33 п.п. мин. HP выжившего
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.1% урона, +1.17 п.п. мин. HP
- Доли атак босса: Антуан 47%, Беовульф 43%, Эбигейл 11%
- Барьер Dark 400: у отряда 90, не хватает 310

### Локация: Meteor Zone · босс · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 6.1 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.1, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Breastplate (Superior) +Kraken Spirit | +0.0 п.п. | +327 ATK · минус: -1979 DEF |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Hands of the Avatar (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +31 HP и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Warlord Helmet (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +336 DEF · минус: -4 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | CM-73 Jetboots (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +287 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Superior) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK · минус: -138 HP |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 128, урон ÷ 11.2):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.6% урона, +0.01 п.п. мин. HP
- Беовульф: Главное для героя: HP: +5% HP ≈ +1.08 п.п. мин. HP выжившего
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.5% урона, +0.52 п.п. мин. HP
- Доли атак босса: Антуан 47%, Беовульф 43%, Эбигейл 11%
- Барьер Dark 400: у отряда 90, не хватает 310

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 10.1 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 6.9, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Heaume of the Mightiest (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +8940 DEF, +7% CRIT и др. · минус: -56 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Stone Jaguar Greaves (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +7512 DEF, +5% CRIT и др. · минус: -59 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +20 стихии и др. · минус: -55 HP |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 64, урон ÷ 8.0):
- Антуан: Главное для героя: уклонение: +1% EVA ≈ +0.2 п.п. win rate
- Беовульф: Главное для героя: угроза: +10 угрозы ≈ +0.6 п.п. win rate
- Эбигейл: Главное для героя: HP: +5% HP ≈ +0.8 п.п. win rate
- Доли атак босса: Антуан 50%, Беовульф 39%, Эбигейл 10%
- Барьер Light 320: у отряда 150, не хватает 170

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.
- Life Drain (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: можно применить к слоту 1, стоимость 1 базов.
- Double Cast (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: можно применить к слоту 1 или 2, стоимость 2 базов.
- Deadly Criticals (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: можно применить к слоту 1 или 2 или 3, стоимость 4 базов.

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 6.8 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 6.0, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Amber Citadel (Legendary) +Kraken Spirit | +0.0 п.п. | +327 ATK · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Berserker Helmet (Legendary) +Kraken Spirit | +0.0 п.п. | +327 ATK · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Berserker Stompers (Legendary) +Kraken Spirit | +0.0 п.п. | +327 ATK · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK · минус: -15 стихии |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Lucky Strike (Legendary) +Opulent Element +Bahamut Spirit | +0.0 п.п. | +5% CRIT, +3430 ATK и др. |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 32, урон ÷ 5.7):
- Антуан: Главное для героя: HP: +5% HP ≈ +0.6 п.п. win rate
- Беовульф: Главное для героя: уклонение: +1% EVA ≈ +0.2 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +1.6 п.п. win rate
- Доли атак босса: Антуан 47%, Беовульф 43%, Эбигейл 11%
- Барьер Dark 320: у отряда 90, не хватает 230

### Локация: Meteor Zone · обычный · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 6.9 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 6.4, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Breastplate (Superior) +Kraken Spirit | +0.0 п.п. | +327 ATK · минус: -1916 DEF |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Hands of the Avatar (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +31 HP и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Warlord Helmet (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +337 DEF · минус: -3 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Topaz Greaves (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +327 ATK, +90 DEF · минус: -9 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Superior) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +327 ATK · минус: -134 HP |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Mundra's Scepter (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +5% CRIT, +8 HP и др. |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 32, урон ÷ 5.7):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.3% урона
- Беовульф: Главное для героя: угроза: +10 угрозы ≈ +0.5% урона
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +0.6 п.п. win rate
- Доли атак босса: Антуан 47%, Беовульф 43%, Эбигейл 11%
- Барьер Dark 320: у отряда 90, не хватает 230

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **32.3%** (до подбора — 0.0%), симуляций: 527, время: 29.2 с
- Cinderlake Volcano · босс · Extreme: win rate 32.3%, раундов 39.7, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +13.8 п.п. | +15952 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Legendary) +Apotheosis Element +Christmas Spirit | +8.6 п.п. | +20 стихии, +134 HP и др. · минус: -10 угрозы |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Dragonfang Fists (Legendary) +Apotheosis Element +Bahamut Spirit | +12.6 п.п. | +374 HP, +3466 DEF и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Mundra's Skull (Legendary) +Apotheosis Element +Kraken Spirit | +6.5 п.п. | +6522 DEF, +244 HP и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Santa's Guard Boots (Legendary) +Apotheosis Element +Christmas Spirit | +5.2 п.п. | +2910 DEF, +20 стихии и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Argon's Shield (Legendary) +Apotheosis Element +Kraken Spirit | +6.5 п.п. | +6222 DEF, +246 HP и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Water Gun (Legendary) +Tornado Element +Bahamut Spirit | +20.8 п.п. | +9265 ATK, +641 HP и др. · минус: -1% EVA |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | BIT.Runner Armor (Legendary) +Tornado Element +Kraken Spirit | +8.2 п.п. | +2683 DEF, +303 HP и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Xenotype Forelimbs (Legendary) +Tornado Element +Kraken Spirit | +7.2 п.п. | +2408 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +9.1 п.п. | +2548 DEF, +360 HP и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Platinum Steak Dinner (Legendary) +Platinum Element +Bahamut Spirit | +6.0 п.п. | +2574 DEF, +3859 ATK и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Bahamut Spirit | +25.7 п.п. | +8422 ATK, +857 HP и др. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +32.0 п.п. | +10% CRIT, +12708 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Lethal Petal Robe (Legendary) +Oblivion Element +Bahamut Spirit | +7.5 п.п. | +2090 DEF, +20 стихии и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +30.8 п.п. | +993 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Voidwalkers (Legendary) +Abyssal Element +Bahamut Spirit | +21.1 п.п. | +1469 DEF, +5% CRIT и др. · минус: -1526 ATK |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +32.1 п.п. | +39157 ATK, +20 стихии и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +32.1 п.п. | +39804 ATK, +20 стихии и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp):
- Антуан: Главное для героя: HP: +5% HP ≈ +3.6 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +3.6 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +10.8 п.п. win rate
- Доли атак босса: Антуан 45%, Беовульф 45%, Эбигейл 11%
- Барьер Water 180: у отряда 0, не хватает 180

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 8.6 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 8.6, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Amber Citadel (Legendary) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +5 угрозы · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Krampus Spirit | +0.0 п.п. | +9% CRIT, +5 угрозы · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Berserker Helmet (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Berserker Stompers (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Krampus Spirit | +0.0 п.п. | +9% CRIT, +15 угрозы · минус: -15 стихии |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 64, урон ÷ 8.0):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.4% урона
- Беовульф: Главное для героя: атака: +5% ATK ≈ +0.5% урона
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.9% урона, +0.19 п.п. мин. HP
- Доли атак босса: Антуан 58%, Беовульф 33%, Эбигейл 10%
- Барьер Water 180: у отряда 0, не хватает 180

### Локация: Cinderlake Volcano · босс · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 528, время: 7.7 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 8.6, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Breastplate (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +5 угрозы · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Demi Gauntlets (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +5 угрозы · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Brinewater Helm (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Cindersole (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Superior) +Krampus Spirit | +0.0 п.п. | +9% CRIT, +15 угрозы · минус: -15 стихии |

Веса статов (метрика: damagePct, на ослабленном зонде: HP ÷ 64, урон ÷ 8.0):
- Антуан: Главное для героя: угроза: +10 угрозы ≈ +0.4% урона, +1.82 п.п. мин. HP
- Беовульф: Главное для героя: атака: +5% ATK ≈ +0.4% урона
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +5.1% урона
- Доли атак босса: Антуан 58%, Беовульф 33%, Эбигейл 10%
- Барьер Water 180: у отряда 0, не хватает 180

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **45.7%** (до подбора — 0.0%), симуляций: 440, время: 88.5 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 28.3, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 32.4, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 83.2%, раундов 27.8, барьер пробит
- Lost City of Gold · босс · 12: win rate 99.8%, раундов 23.1, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +2.5 п.п. | +17113 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Legendary) +Apotheosis Element +Christmas Spirit | +1.3 п.п. | +20 стихии, +146 HP и др. · минус: -10 угрозы |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Dragonfang Fists (Legendary) +Apotheosis Element +Bahamut Spirit | +2.3 п.п. | +359 HP, +3285 DEF и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Argon's Helm (Legendary) +Apotheosis Element +Kraken Spirit | +0.9 п.п. | +6526 DEF, +195 HP и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Kraken Spirit | +0.9 п.п. | +6532 DEF, +20 стихии и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Argon's Shield (Legendary) +Apotheosis Element +Kraken Spirit | +0.9 п.п. | +6222 DEF, +219 HP и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Ironclad Grapple (Legendary) +Tornado Element +Bahamut Spirit | +3.0 п.п. | +6870 ATK, +4% EVA и др. · минус: -198 DEF |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Teddy Bear Body (Legendary) +Tornado Element +Kraken Spirit | +0.8 п.п. | +2589 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Chitinous Claws (Legendary) +Tornado Element +Kraken Spirit | +0.6 п.п. | +2014 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +0.8 п.п. | +2547 DEF, +353 HP и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elemental Conflux (Legendary) +Tornado Element +Kraken Spirit | +4.7 п.п. | +5% CRIT, +926 HP и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Bahamut Spirit | +6.7 п.п. | +7345 ATK, +849 HP и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +18.0 п.п. | +10% CRIT, +12803 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Blood Monarch Outfit (Legendary) +Oblivion Element +Titan Spirit | +3.5 п.п. | +650 DEF, +302 HP и др. · минус: -1430 ATK |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +20.4 п.п. | +1169 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Voidwalkers (Legendary) +Abyssal Element +Bahamut Spirit | +4.2 п.п. | +1469 DEF, +5% CRIT и др. · минус: -1430 ATK |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Titan Spirit | +26.9 п.п. | +35938 ATK, +20 стихии и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +21.1 п.п. | +39900 ATK, +20 стихии и др. · минус: -177 DEF |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 497, время: 37.3 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 5.7, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 6.0, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.1, барьер пробит
- Lost City of Gold · босс · 12: win rate 0.0%, раундов 8.4, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Amber Citadel (Legendary) +Kraken Spirit | +0.0 п.п. | +286 ATK · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +286 ATK · минус: -15 стихии |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Berserker Helmet (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Berserker Stompers (Legendary) +Krampus Spirit | +0.0 п.п. | +15 угрозы, +2% CRIT · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Legendary) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +286 ATK · минус: -15 стихии |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 497, время: 32.9 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 5.8, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 6.3, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.5, барьер пробит
- Lost City of Gold · босс · 12: win rate 0.0%, раундов 8.6, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Breastplate (Superior) +Kraken Spirit | +0.0 п.п. | +286 ATK · минус: -15 стихии |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Republic Gauntlets (Superior) +Sacred Element +Kraken Spirit | +0.0 п.п. | +286 ATK, +12 HP · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Brinewater Helm (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -15 стихии |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Cindersole (Superior) +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы · минус: -15 стихии |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Goreboar Targe (Superior) +Kraken Spirit | +0.0 п.п. | +7% CRIT, +286 ATK и др. · минус: -15 стихии |

