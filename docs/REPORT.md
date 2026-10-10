# Отчёт: финальная проверка оптимизатора

Сгенерировано: 2026-10-10 командой `node scripts/final-report.ts`.

Отряд: Антуан (Knight 26), Беовульф (Ranger 25), Эбигейл (Sorcerer 26) + чемпион Argon ранг 5.
Данные — фикстуры листов (fixtures/sheets), пороги защиты — из фикстур (без stcentral-hub).

Каждая локация посчитана в трёх пулах (см. «Пулы» ниже). Sanity-вывод по «Cinderlake Volcano Extreme 0 % → 100 %»:
это достигается только на пуле all до T20 с качеством Legendary (раздел с пометкой «эталонный верх»);
для героев 25–26 уровней (макс. тир 9 по HERO LEVELS) T20-набор недостижим — см. разделы «достижимый пул» и «ограничения по умолчанию».

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **100.0%** (до подбора — 0.0%), симуляций: 521, время: 10.8 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 100.0%, раундов 9.8, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. | +13616 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Titan Plate Armor (Legendary) +Apotheosis Element +Titan Spirit | +0.0 п.п. | +3993 DEF, +176 HP и др. · минус: -10 угрозы |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Titan Gauntlets (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +247 HP, +2% CRIT и др. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Teddy Bear Head (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +7070 DEF, +2% CRIT и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +6542 DEF, +2% CRIT и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. | +5632 DEF, +20 стихии и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. | +13150 ATK, +20 стихии и др. · минус: -198 DEF |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +1372 DEF, +5% CRIT и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +741 DEF и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. | +2547 DEF, +376 HP и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elemental Conflux (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. | +986 HP, +5% CRIT и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.0 п.п. | +12116 ATK, +922 HP и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Eclipsed Wand (Legendary) +Oblivion Element +Titan Spirit | +0.9 п.п. | +440 HP, +18043 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. | +1080 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +4.9 п.п. | +1035 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. | +1379 DEF, +3% CRIT и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +0.9 п.п. | +40559 ATK, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +0.9 п.п. | +41246 ATK, +3% CRIT и др. · минус: -177 DEF |

Веса статов (метрика: damagePct):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.4 п.п. мин. HP выжившего
- Беовульф: Главное для героя: уклонение: +1% EVA ≈ +0.6 п.п. мин. HP выжившего
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +5.1% урона, +0.4 п.п. мин. HP
- Доли атак босса: Антуан 53%, Беовульф 37%, Эбигейл 10%

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Life Drain (слот 1): 0.4 п.п. — вклад 0.4 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Deadly Criticals (слот 3): 0.4 п.п. — вклад 0.4 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **7.3%** (до подбора — 0.0%), симуляций: 524, время: 12.2 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 7.3%, раундов 24.1, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Kodiak Kleaver (Legendary) +Opulent Element +Behemoth Spirit | +1.2 п.п. | +4350 ATK, +114 HP · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Milesian Mail (Legendary) +Opulent Element +Krampus Spirit | +1.1 п.п. | +2% CRIT, +1606 DEF и др. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Lost Warrior's Gauntlets (Legendary) +Opulent Element +Krampus Spirit | +1.1 п.п. | +2% CRIT, +1262 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Emperor Wyrmguard (Legendary) +Opulent Element +Krampus Spirit | -0.5 п.п. | +2041 DEF, +2% CRIT и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Jolly Ranger (Legendary) +Opulent Element +Christmas Spirit | +3.4 п.п. | +1582 ATK, +371 HP · минус: -198 DEF |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Santa's Guard Plate (Legendary) +Opulent Element +Christmas Spirit | +1.4 п.п. | +602 DEF, +350 ATK и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Santa's Guard Gauntlets (Legendary) +Opulent Element +Christmas Spirit | +2.5 п.п. | +252 HP, +263 DEF · минус: -213 ATK |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Titan Helm (Legendary) +Opulent Element +Titan Spirit | +1.5 п.п. | +640 DEF, +424 ATK и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Midnight Oil (Legendary) +Opulent Element +Bahamut Spirit | +3.2 п.п. | +471 HP, +627 ATK · минус: -168 DEF |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Bunbun Band (Legendary) +Opulent Element +Bahamut Spirit | +6.0 п.п. | +355 HP, +5% EVA и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +7.0 п.п. | +3% CRIT, +4695 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Blood Monarch Outfit (Legendary) +Nightmare Element +Leviathan Spirit | +5.8 п.п. | +534 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Prickly Ice Cream (Legendary) +Opulent Element +Leviathan Spirit | +6.0 п.п. | +7% EVA, +188 HP и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Giant's Boots (Legendary) +Opulent Element +Titan Spirit | +5.8 п.п. | +677 DEF, +130 HP и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. | +9608 ATK, +190 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. | +10241 ATK, +190 HP и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp):
- Антуан: Главное для героя: уклонение: +1% EVA ≈ -1.2% урона
- Беовульф: Главное для героя: HP: +5% HP ≈ +0.8 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +1.4 п.п. win rate
- Доли атак босса: Антуан 53%, Беовульф 37%, Эбигейл 10%

### Локация: Lost City of Gold · босс · 13 — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 522, время: 6.9 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.0, барьер пробит

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +212 ATK и др. · минус: -38 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +196 ATK и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +271 ATK и др. · минус: -51 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -53 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +288 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -53 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -47 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +37 DEF · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Fizzy Guzzle Bottle (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +32 HP и др. · минус: -1% EVA |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | The Backscratcher (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +12 HP и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Blood Monarch Outfit (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +210 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +83 HP · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +116 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +90 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +53 HP, +77 DEF и др. |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 8, урон ÷ 2.8):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.8 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +1.6 п.п. win rate
- Эбигейл: Главное для героя: HP: +5% HP ≈ +2.4 п.п. win rate
- Доли атак босса: Антуан 58%, Беовульф 33%, Эбигейл 10%

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 527, время: 12.4 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 12.0, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Blossomblade (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. | +12971 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Xenotype Exoskel (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +6354 DEF, +20 стихии и др. · минус: -40 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +9% CRIT, +20 стихии и др. · минус: -36 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Cursed King's Helm (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +7954 DEF, +20 стихии и др. · минус: -63 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Rock Stompers (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +177 HP, +11074 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Wall of Pain (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +7990 DEF, +20 стихии и др. · минус: -61 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Oni Rōnin Armor (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. | +1424 DEF, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +741 DEF и др. · минус: -53 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +2873 DEF, +7% CRIT и др. · минус: -59 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Troublin Bento (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. | +3001 ATK, +1361 DEF и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Briar Kiss (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. | +4144 ATK, +5% CRIT и др. · минус: -112 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Aperture Catalyst (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. | +5% CRIT, +19366 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Republic Garments (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. | +645 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Eversweet Cornucopia (Legendary) +Oblivion Element +Titan Spirit | +0.0 п.п. | +708 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Desperado Spurs (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. | +1064 DEF, +3% CRIT и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. | +40844 ATK, +20 стихии и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. | +41517 ATK, +20 стихии и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 4, урон ÷ 2.0):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.8 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +2.8 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.8 п.п. win rate
- Доли атак босса: Антуан 56%, Беовульф 34%, Эбигейл 10%
- Барьер Dark 400: у отряда 210, не хватает 190

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Life Drain (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Double Cast (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Deadly Criticals (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 526, время: 7.7 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.9, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Cold Iron Axe (Legendary) +Opulent Element +Behemoth Spirit | +0.0 п.п. | +1699 ATK, +77 HP · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +1465 DEF и др. · минус: -37 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +1291 DEF и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +1861 DEF, +2% CRIT и др. · минус: -54 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +1910 DEF, +2% CRIT и др. · минус: -56 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +1683 DEF и др. · минус: -53 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +929 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +699 DEF и др. · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +655 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Healing Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +6 HP · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +4761 ATK, +3% CRIT и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Aang's Robe (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +323 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +157 HP, +3% CRIT · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +124 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +8045 ATK, +144 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +10424 ATK, +158 HP и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 16, урон ÷ 4.0):
- Антуан: Главное для героя: уклонение: +1% EVA ≈ +1.0 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +2.2 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +3.0 п.п. win rate
- Доли атак босса: Антуан 56%, Беовульф 34%, Эбигейл 10%
- Барьер Dark 400: у отряда 90, не хватает 310

### Локация: Meteor Zone · босс · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 523, время: 6.3 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.5, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Pickaxe of Greed (Superior) +Sacred Element +Behemoth Spirit | +0.0 п.п. | +1343 ATK, +70 HP · минус: -434 DEF |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +240 ATK и др. · минус: -37 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +222 ATK и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -53 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -56 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -52 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -157 DEF |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +38 DEF · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Wiccan Broomstick (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT · минус: -624 ATK |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +127 DEF и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Strawberry Mochi (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +97 HP, +3% CRIT · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +116 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +89 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +52 HP, +77 DEF и др. |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 32, урон ÷ 5.7):
- Антуан: Главное для героя: HP: +5% HP ≈ +3.2 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +4.8 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +5.0 п.п. win rate
- Доли атак босса: Антуан 56%, Беовульф 34%, Эбигейл 10%
- Барьер Dark 400: у отряда 90, не хватает 310

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **77.8%** (до подбора — 0.0%), симуляций: 527, время: 22.7 с
- Meteor Zone · обычный · Extreme: win rate 77.8%, раундов 39.2, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Axe of Sept (Legendary) +Apotheosis Element +Titan Spirit | +5.4 п.п. | +13956 ATK, +7% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Armor of Invincibility (Legendary) +Apotheosis Element +Kraken Spirit | +3.9 п.п. | +5509 DEF, +403 HP и др. · минус: -10 угрозы |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Titan Gauntlets (Legendary) +Apotheosis Element +Titan Spirit | +11.5 п.п. | +639 HP, +4906 DEF и др. · минус: -10 угрозы |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Legendary) +Apotheosis Element +Titan Spirit | +3.0 п.п. | +20 стихии, +2288 DEF и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Titan Boots (Legendary) +Apotheosis Element +Titan Spirit | +9.4 п.п. | +559 HP, +5216 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Titan Shield (Legendary) +Apotheosis Element +Titan Spirit | +9.1 п.п. | +520 HP, +4288 DEF и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Water Gun (Legendary) +Tornado Element +Titan Spirit | +16.9 п.п. | +9918 ATK, +775 HP и др. · минус: -198 DEF |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | -1.7 п.п. | +1372 DEF, +5% CRIT и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | -1.6 п.п. | +7% CRIT, +741 DEF и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +2.1 п.п. | +2547 DEF, +399 HP и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elemental Conflux (Legendary) +Tornado Element +Kraken Spirit | +16.3 п.п. | +1046 HP, +5% CRIT и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +23.4 п.п. | +7345 ATK, +1001 HP и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Eclipsed Wand (Legendary) +Oblivion Element +Titan Spirit | +51.2 п.п. | +440 HP, +18043 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +23.5 п.п. | +1080 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +61.6 п.п. | +1035 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +24.4 п.п. | +1379 DEF, +3% CRIT и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +77.5 п.п. | +40559 ATK, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +77.6 п.п. | +41246 ATK, +3% CRIT и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp):
- Антуан: Главное для героя: уклонение: +1% EVA ≈ +0.8 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +5.2 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +5.6 п.п. win rate
- Доли атак босса: Антуан 45%, Беовульф 45%, Эбигейл 11%
- Барьер Dark 320: у отряда 210, не хватает 110

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 524, время: 8.1 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 7.6, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +332 ATK и др. · минус: -33 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +1997 DEF и др. · минус: -52 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2050 DEF, +2% CRIT и др. · минус: -54 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +395 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +929 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +699 DEF и др. · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +655 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Healing Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +6 HP · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +4752 ATK, +3% CRIT и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Waterproof Lilyrobe (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +278 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +157 HP, +3% CRIT · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +124 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Scroll of Fortune (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +6823 ATK, +131 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +10415 ATK, +158 HP и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 8, урон ÷ 2.8):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.6 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +5.2 п.п. win rate
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +7.6 п.п. win rate
- Доли атак босса: Антуан 57%, Беовульф 33%, Эбигейл 10%
- Барьер Dark 320: у отряда 90, не хватает 230

### Локация: Meteor Zone · обычный · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 521, время: 6.1 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 7.0, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +196 ATK и др. · минус: -33 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +271 ATK и др. · минус: -52 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -54 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +288 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -157 DEF |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +38 DEF · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Owl Perch (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT · минус: -1023 ATK |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +127 DEF и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +84 HP · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +116 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +90 HP, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +52 HP, +77 DEF и др. |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 16, урон ÷ 4.0):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.4 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +7.2 п.п. win rate
- Эбигейл: Главное для героя: шанс крита: +1% CRIT ≈ +6.8 п.п. win rate
- Доли атак босса: Антуан 57%, Беовульф 33%, Эбигейл 10%
- Барьер Dark 320: у отряда 90, не хватает 230

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **100.0%** (до подбора — 0.0%), симуляций: 524, время: 11.7 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 100.0%, раундов 13.7, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. | +13683 ATK, +4% CRIT и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Xenotype Exoskel (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +5415 DEF, +2% CRIT и др. · минус: -42 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Mighty Mint Mitts (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +4071 DEF и др. · минус: -38 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Teddy Bear Head (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +7070 DEF, +185 HP и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +6542 DEF, +173 HP и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. | +5632 DEF, +20 стихии и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. | +13447 ATK, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +5% CRIT, +1373 DEF и др. · минус: -62 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Xenotype Forelimbs (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. | +2408 DEF, +293 HP и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +2873 DEF и др. · минус: -62 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Pot of Paella (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. | +3625 ATK, +1079 DEF и др. · минус: -111 HP |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.2 п.п. | +832 HP, +12436 ATK и др. · минус: -112 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +0.1 п.п. | +10% CRIT, +14030 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. | +1080 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +7.1 п.п. | +919 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. | +1379 DEF, +3% CRIT и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.3 п.п. | +40530 ATK, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.4 п.п. | +41217 ATK, +3% CRIT и др. · минус: -177 DEF |

Веса статов (метрика: damagePct):
- Антуан: Главное для героя: атака: +5% ATK ≈ +0.1% урона, +0.1 п.п. мин. HP
- Беовульф: Главное для героя: HP: +5% HP ≈ +1.5 п.п. мин. HP выжившего
- Эбигейл: Главное для героя: атака: +5% ATK ≈ +4.4% урона
- Доли атак босса: Антуан 55%, Беовульф 35%, Эбигейл 10%
- Барьер Water 180: у отряда 0, не хватает 180

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.
- Impervious (слот 2): 0.4 п.п. — вклад 0.4 п.п. — перекинуть: суперкубик: слоты 1–2, стоимость 2 базов.
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть: мегакубик: слоты 1–2–3, стоимость 4 базов.
- Life Drain (слот 1): 0.4 п.п. — вклад 0.4 п.п. — перекинуть: базовый кубик: слоты 1, стоимость 1 базов.

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 525, время: 10.3 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 11.0, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +405 ATK и др. · минус: -38 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +332 ATK и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +1907 DEF и др. · минус: -51 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +1957 DEF, +2% CRIT и др. · минус: -53 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +395 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +929 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +699 DEF и др. · минус: -47 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. | +655 DEF, +264 ATK · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Magic Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +32 HP · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +4752 ATK, +3% CRIT и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +443 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +157 HP, +3% CRIT · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +124 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Scroll of Fortune (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +6823 ATK, +131 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. | +10415 ATK, +158 HP и др. · минус: -177 DEF |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 4, урон ÷ 2.0):
- Антуан: Главное для героя: HP: +5% HP ≈ +1.0 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +3.6 п.п. win rate
- Эбигейл: Главное для героя: HP: +5% HP ≈ +2.8 п.п. win rate
- Доли атак босса: Антуан 58%, Беовульф 33%, Эбигейл 10%
- Барьер Water 180: у отряда 0, не хватает 180

### Локация: Cinderlake Volcano · босс · Extreme — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 522, время: 8.1 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 10.1, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +212 ATK и др. · минус: -38 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +196 ATK и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +271 ATK и др. · минус: -51 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -53 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +288 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -53 HP |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +37 DEF · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elegant Tea Set (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +24 DEF и др. · минус: -1% EVA |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | The Backscratcher (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +13 HP и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +127 DEF и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Taiyaki (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +64 HP · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +116 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +90 HP, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +52 HP, +77 DEF и др. |

Веса статов (метрика: winRatePp, на ослабленном зонде: HP ÷ 8, урон ÷ 2.8):
- Антуан: Главное для героя: HP: +5% HP ≈ +0.8 п.п. win rate
- Беовульф: Главное для героя: HP: +5% HP ≈ +1.6 п.п. win rate
- Эбигейл: Главное для героя: HP: +5% HP ≈ +2.0 п.п. win rate
- Доли атак босса: Антуан 58%, Беовульф 33%, Эбигейл 10%
- Барьер Water 180: у отряда 0, не хватает 180

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **50.0%** (до подбора — 0.0%), симуляций: 440, время: 34.9 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 25.4, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 29.2, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 100.0%, раундов 9.7, барьер пробит
- Lost City of Gold · босс · 12: win rate 100.0%, раундов 8.3, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Dire Kakivak (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. | +9518 ATK, +194 HP и др. · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | BIT.Runner Armor (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +217 HP, +5614 DEF и др. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Dragonfang Fists (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +148 HP и др. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Platinum Helm (Legendary) +Platinum Element +Krampus Spirit | +0.0 п.п. | +5150 DEF, +2% CRIT и др. · минус: -83 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Fimbulwinter Boots (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. | +5822 DEF, +2% CRIT и др. · минус: -86 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. | +5632 DEF, +20 стихии и др. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. | +12411 ATK, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +1372 DEF, +5% CRIT и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +7% CRIT, +741 DEF и др. · минус: -1% EVA |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. | +2872 DEF, +7% CRIT и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Nectar Pitcher (Legendary) +Tornado Element +Titan Spirit | +0.0 п.п. | +587 HP, +20 стихии и др. · минус: -1% EVA |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.2 п.п. | +11479 ATK, +906 HP и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +0.2 п.п. | +10% CRIT, +13734 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Gothita Frock Coat (Legendary) +Oblivion Element +Titan Spirit | +0.2 п.п. | +1445 DEF, +351 HP и др. · минус: -1387 ATK |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +3.0 п.п. | +1031 HP, +20 стихии и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Desperado Spurs (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. | +1064 DEF, +3% CRIT и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.2 п.п. | +39753 ATK, +3% CRIT и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.2 п.п. | +40426 ATK, +3% CRIT и др. · минус: -177 DEF |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **10.8%** (до подбора — 0.0%), симуляций: 442, время: 32.6 с
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 21.9, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 24.7, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 6.6%, раундов 23.7, барьер пробит
- Lost City of Gold · босс · 12: win rate 36.8%, раундов 26.5, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Kodiak Kleaver (Legendary) +Opulent Element +Behemoth Spirit | +1.3 п.п. | +4403 ATK, +106 HP · минус: -10 угрозы |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.2 п.п. | +2% CRIT, +1487 DEF и др. · минус: -37 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Lost Warrior's Gauntlets (Legendary) +Opulent Element +Krampus Spirit | +1.3 п.п. | +2% CRIT, +1106 DEF и др. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Gobble Lord Helm (Legendary) +Opulent Element +Krampus Spirit | +0.3 п.п. | +2157 DEF, +2% CRIT и др. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | CM-73 Jetboots (Legendary) +Opulent Element +Krampus Spirit | +0.3 п.п. | +2% CRIT, +1454 DEF и др. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Bunbun Buckler (Legendary) +Krampus Spirit | +0.6 п.п. | +5% EVA, +2% CRIT и др. · минус: -15 стихии |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Jolly Ranger (Legendary) +Opulent Element +Christmas Spirit | +2.6 п.п. | +1582 ATK, +371 HP · минус: -198 DEF |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Santa's Guard Plate (Legendary) +Opulent Element +Christmas Spirit | +0.8 п.п. | +602 DEF, +350 ATK и др. · минус: -1% EVA |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Santa's Guard Gauntlets (Legendary) +Opulent Element +Christmas Spirit | +1.7 п.п. | +252 HP, +263 DEF · минус: -213 ATK |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Titan Helm (Legendary) +Opulent Element +Titan Spirit | +1.1 п.п. | +640 DEF, +424 ATK и др. · минус: -1% EVA |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Midnight Oil (Legendary) +Opulent Element +Bahamut Spirit | +2.4 п.п. | +471 HP, +627 ATK · минус: -168 DEF |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Bunbun Band (Legendary) +Opulent Element +Bahamut Spirit | +4.8 п.п. | +355 HP, +5% EVA и др. · минус: -113 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Ashland Invoker (Legendary) +Nightmare Element +Leviathan Spirit | +8.2 п.п. | +3% CRIT, +4471 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Waterproof Lilyrobe (Legendary) +Opulent Element +Leviathan Spirit | +4.5 п.п. | +278 DEF, +3% CRIT и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Prickly Ice Cream (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. | +7% EVA, +189 HP и др. · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Giant's Boots (Legendary) +Opulent Element +Titan Spirit | +6.3 п.п. | +677 DEF, +131 HP и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +10.1 п.п. | +9606 ATK, +190 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +10.2 п.п. | +10239 ATK, +190 HP и др. · минус: -177 DEF |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — ограничения по умолчанию: до T8 на героя (макс. надетый у него + 1; Антуан T8, Беовульф T8, Эбигейл T8), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 439, время: 18.1 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.5, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 7.4, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.0, барьер пробит
- Lost City of Gold · босс · 12: win rate 0.0%, раундов 8.1, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача | Почему (какой стат) |
|---|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +212 ATK и др. · минус: -38 HP |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +196 ATK и др. · минус: -34 HP |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +271 ATK и др. · минус: -51 HP |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +15 угрозы и др. · минус: -53 HP |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. | +2% CRIT, +288 ATK и др. · минус: -50 HP |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -157 DEF |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -48 HP |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK, +38 DEF · минус: -53 HP |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. | +264 ATK · минус: -167 DEF |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Owl Wing Wand (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +223 ATK и др. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +127 DEF и др. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +83 HP · минус: -179 DEF |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +116 DEF и др. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. | +3% CRIT, +89 HP и др. · минус: -199 DEF |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. | +52 HP, +77 DEF и др. |

