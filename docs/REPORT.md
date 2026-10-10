# Отчёт: финальная проверка оптимизатора

Сгенерировано: 2026-10-10 командой `node scripts/final-report.ts`.

Отряд: Антуан (Knight 26), Беовульф (Ranger 25), Эбигейл (Sorcerer 26) + чемпион Argon ранг 5.
Данные — фикстуры листов (fixtures/sheets), пороги защиты — из фикстур (без stcentral-hub).

Каждая локация посчитана в трёх пулах (см. «Пулы» ниже). Sanity-вывод по «Cinderlake Volcano Extreme 0 % → 100 %»:
это достигается только на пуле all до T20 с качеством Legendary (раздел с пометкой «эталонный верх»);
для героев 25–26 уровней (макс. тир 9 по HERO LEVELS) T20-набор недостижим — см. разделы «достижимый пул» и «ограничения по умолчанию».

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **100.0%** (до подбора — 0.0%), симуляций: 493, время: 16.6 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 100.0%, раундов 9.8, барьер пробит

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Titan Plate Armor (Legendary) +Apotheosis Element +Titan Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Titan Gauntlets (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Teddy Bear Head (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elemental Conflux (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Eclipsed Wand (Legendary) +Oblivion Element +Titan Spirit | +0.9 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +4.9 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +0.9 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +0.9 п.п. |

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Life Drain (слот 1): 0.4 п.п. — вклад 0.4 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Deadly Criticals (слот 3): 0.4 п.п. — вклад 0.4 п.п. — перекинуть базовый кубик (может выдать навык до T10)

### Локация: Lost City of Gold · босс · 13 — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **7.3%** (до подбора — 0.0%), симуляций: 496, время: 16.5 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 7.3%, раундов 24.1, барьер пробит

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Kodiak Kleaver (Legendary) +Opulent Element +Behemoth Spirit | +1.2 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Milesian Mail (Legendary) +Opulent Element +Krampus Spirit | +1.1 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Lost Warrior's Gauntlets (Legendary) +Opulent Element +Krampus Spirit | +1.1 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Emperor Wyrmguard (Legendary) +Opulent Element +Krampus Spirit | -0.5 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Jolly Ranger (Legendary) +Opulent Element +Christmas Spirit | +3.4 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Santa's Guard Plate (Legendary) +Opulent Element +Christmas Spirit | +1.4 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Santa's Guard Gauntlets (Legendary) +Opulent Element +Christmas Spirit | +2.5 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Titan Helm (Legendary) +Opulent Element +Titan Spirit | +1.5 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Midnight Oil (Legendary) +Opulent Element +Bahamut Spirit | +3.2 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Bunbun Band (Legendary) +Opulent Element +Bahamut Spirit | +6.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +7.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Blood Monarch Outfit (Legendary) +Nightmare Element +Leviathan Spirit | +5.8 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Prickly Ice Cream (Legendary) +Opulent Element +Leviathan Spirit | +6.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Giant's Boots (Legendary) +Opulent Element +Titan Spirit | +5.8 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. |

### Локация: Lost City of Gold · босс · 13 — ограничения по умолчанию: до T8 (макс. надетый + 1), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 494, время: 9.0 с, выбор частично по тай-брейку
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.0, барьер пробит

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Fizzy Guzzle Bottle (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | The Backscratcher (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Blood Monarch Outfit (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. |

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 499, время: 11.0 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 12.0, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Blossomblade (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Xenotype Exoskel (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Gauntlets of Fortune (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Cursed King's Helm (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Rock Stompers (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Wall of Pain (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Oni Rōnin Armor (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Troublin Bento (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Briar Kiss (Legendary) +Tornado Element +Bahamut Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Aperture Catalyst (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Republic Garments (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Eversweet Cornucopia (Legendary) +Oblivion Element +Titan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Desperado Spurs (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Precursor's Ultimatum (Legendary) +Oblivion Element +Bahamut Spirit | +0.0 п.п. |

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Impervious (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Life Drain (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Double Cast (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Deadly Criticals (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)

### Локация: Meteor Zone · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 498, время: 8.1 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.9, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Cold Iron Axe (Legendary) +Opulent Element +Behemoth Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Healing Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Aang's Robe (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |

### Локация: Meteor Zone · босс · Extreme — ограничения по умолчанию: до T8 (макс. надетый + 1), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 495, время: 9.7 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.5, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Pickaxe of Greed (Superior) +Sacred Element +Behemoth Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Wiccan Broomstick (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Strawberry Mochi (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. |

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **77.8%** (до подбора — 0.0%), симуляций: 499, время: 35.8 с
- Meteor Zone · обычный · Extreme: win rate 77.8%, раундов 39.2, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Axe of Sept (Legendary) +Apotheosis Element +Titan Spirit | +5.4 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Armor of Invincibility (Legendary) +Apotheosis Element +Kraken Spirit | +3.9 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Titan Gauntlets (Legendary) +Apotheosis Element +Titan Spirit | +11.5 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Legendary) +Apotheosis Element +Titan Spirit | +3.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Titan Boots (Legendary) +Apotheosis Element +Titan Spirit | +9.4 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Titan Shield (Legendary) +Apotheosis Element +Titan Spirit | +9.1 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Water Gun (Legendary) +Tornado Element +Titan Spirit | +16.9 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | -1.7 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | -1.6 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Mundra's Skull (Legendary) +Tornado Element +Kraken Spirit | +2.1 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elemental Conflux (Legendary) +Tornado Element +Kraken Spirit | +16.3 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +23.4 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Eclipsed Wand (Legendary) +Oblivion Element +Titan Spirit | +51.2 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +23.5 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +61.6 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +24.4 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +77.5 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +77.6 п.п. |

### Локация: Meteor Zone · обычный · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 496, время: 12.8 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 7.6, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Healing Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Waterproof Lilyrobe (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Scroll of Fortune (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |

### Локация: Meteor Zone · обычный · Extreme — ограничения по умолчанию: до T8 (макс. надетый + 1), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 493, время: 9.3 с, выбор частично по тай-брейку
- Meteor Zone · обычный · Extreme: win rate 0.0%, раундов 7.0, барьер НЕ пробит
- ⚠ Барьер квеста «Meteor Zone · обычный · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Owl Perch (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. |

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **100.0%** (до подбора — 0.0%), симуляций: 496, время: 17.6 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 100.0%, раундов 13.7, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Poseidon's Might (Legendary) +Apotheosis Element +Leviathan Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Xenotype Exoskel (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Mighty Mint Mitts (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Teddy Bear Head (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Teddy Bear Feet (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Xenotype Forelimbs (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Pot of Paella (Legendary) +Tornado Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.2 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +0.1 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Ice Queen's Silks (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +7.1 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Hermes Sandals (Legendary) +Oblivion Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.3 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.4 п.п. |

Навыки:
- Warlord (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Thick Skin (слот 2): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Acrobatics (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Fast Healer (слот 1): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Impervious (слот 2): 0.4 п.п. — вклад 0.4 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Smite (слот 3): 0.0 п.п. — вклад 0.0 п.п. — перекинуть базовый кубик (может выдать навык до T10)
- Life Drain (слот 1): 0.4 п.п. — вклад 0.4 п.п. — перекинуть базовый кубик (может выдать навык до T10)

### Локация: Cinderlake Volcano · босс · Extreme — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 497, время: 14.4 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 11.0, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Winter's Touch (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Centurion Helmet (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Bunbun Booties (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Legendary) +Opulent Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Amber Citadel (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Berserker Helmet (Legendary) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Magic Potion (Legendary) +Opulent Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Equinox Rod (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Perennial Sandals (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Scroll of Fortune (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +0.0 п.п. |

### Локация: Cinderlake Volcano · босс · Extreme — ограничения по умолчанию: до T8 (макс. надетый + 1), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 494, время: 8.9 с, выбор частично по тай-брейку
- Cinderlake Volcano · босс · Extreme: win rate 0.0%, раундов 10.1, барьер НЕ пробит
- ⚠ Барьер квеста «Cinderlake Volcano · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Elegant Tea Set (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | The Backscratcher (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Taiyaki (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы до T20, Legendary (эталонный верх, для этих героев недостижим)

- Цель: **50.0%** (до подбора — 0.0%), симуляций: 440, время: 34.2 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 25.4, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 29.2, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 100.0%, раундов 9.7, барьер пробит
- Lost City of Gold · босс · 12: win rate 100.0%, раундов 8.3, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Dire Kakivak (Legendary) +Apotheosis Element +Kraken Spirit | +0.0 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | BIT.Runner Armor (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Dragonfang Fists (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Platinum Helm (Legendary) +Platinum Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Fimbulwinter Boots (Legendary) +Apotheosis Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Dragon Sacred Gem (Legendary) +Apotheosis Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Platinum Crossbow (Legendary) +Platinum Element +Bahamut Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Lost Warrior's Plate (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Gauntlets of Fortune (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Heaume of the Mightiest (Legendary) +Hurricane Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Nectar Pitcher (Legendary) +Tornado Element +Titan Spirit | +0.0 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Ring of Midas (Legendary) +Platinum Element +Titan Spirit | +0.2 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Solaryn Sunslicer (Legendary) +Oblivion Element +Bahamut Spirit | +0.2 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Gothita Frock Coat (Legendary) +Oblivion Element +Titan Spirit | +0.2 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Krampus Cookies (Legendary) +Oblivion Element +Titan Spirit | +3.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Desperado Spurs (Legendary) +Oblivion Element +Leviathan Spirit | +0.1 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.2 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Tome of Souls Lost (Legendary) +Oblivion Element +Leviathan Spirit | +1.2 п.п. |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — пул all: любые предметы и камни до T10 (макс. тир героев 9 + 1), Legendary

- Цель: **10.8%** (до подбора — 0.0%), симуляций: 442, время: 28.4 с
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 21.9, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 24.7, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 6.6%, раундов 23.7, барьер пробит
- Lost City of Gold · босс · 12: win rate 36.8%, раундов 26.5, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 1 | Twicicle Javelin (Normal) +Sacred Element +Mammoth Spirit | Kodiak Kleaver (Legendary) +Opulent Element +Behemoth Spirit | +1.3 п.п. |
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Argon's Armor (Legendary) +Sacred Element +Krampus Spirit | +0.2 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Lost Warrior's Gauntlets (Legendary) +Opulent Element +Krampus Spirit | +1.3 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Gobble Lord Helm (Legendary) +Opulent Element +Krampus Spirit | +0.3 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | CM-73 Jetboots (Legendary) +Opulent Element +Krampus Spirit | +0.3 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Bunbun Buckler (Legendary) +Krampus Spirit | +0.6 п.п. |
| Беовульф | 1 | Hotshot Bowgun (Superior) +Tempest Element +Lion Spirit | Jolly Ranger (Legendary) +Opulent Element +Christmas Spirit | +2.6 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Santa's Guard Plate (Legendary) +Opulent Element +Christmas Spirit | +0.8 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Santa's Guard Gauntlets (Legendary) +Opulent Element +Christmas Spirit | +1.7 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Titan Helm (Legendary) +Opulent Element +Titan Spirit | +1.1 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | Midnight Oil (Legendary) +Opulent Element +Bahamut Spirit | +2.4 п.п. |
| Беовульф | 6 | Twin Coiled Ring (Epic) | Bunbun Band (Legendary) +Opulent Element +Bahamut Spirit | +4.8 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Ashland Invoker (Legendary) +Nightmare Element +Leviathan Spirit | +8.2 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Waterproof Lilyrobe (Legendary) +Opulent Element +Leviathan Spirit | +4.5 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Prickly Ice Cream (Legendary) +Opulent Element +Leviathan Spirit | +7.2 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Giant's Boots (Legendary) +Opulent Element +Titan Spirit | +6.3 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +10.1 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Druidic Grimoire (Legendary) +Opulent Element +Leviathan Spirit | +10.2 п.п. |

### Универсальный режим: Meteor Zone, Ancient Jungle, Lost City of Gold, Lost City of Gold (Hard, боссы) — ограничения по умолчанию: до T8 (макс. надетый + 1), Superior, камни до T9, духи без Титана

- Цель: **0.0%** (до подбора — 0.0%), симуляций: 439, время: 16.0 с, выбор частично по тай-брейку
- Meteor Zone · босс · Extreme: win rate 0.0%, раундов 6.5, барьер НЕ пробит
- Ancient Jungle · босс · Extreme: win rate 0.0%, раундов 7.4, барьер НЕ пробит
- Lost City of Gold · босс · 13: win rate 0.0%, раундов 7.0, барьер пробит
- Lost City of Gold · босс · 12: win rate 0.0%, раундов 8.1, барьер пробит
- Худшая локация: Meteor Zone · босс · Extreme — 0.0%
- ⚠ Барьер квеста «Meteor Zone · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).
- ⚠ Барьер квеста «Ancient Jungle · босс · Extreme» не пробит — урон отряда снижен (стихия не подходит или её мало).

| Герой | Слот | Было | Стало | Отдача |
|---|---|---|---|---|
| Антуан | 2 | Warlord Plate (Normal) +Sacred Element +Mammoth Spirit | Santa's Guard Plate (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 3 | Republic Gauntlets (Normal) +Sacred Element +Mammoth Spirit | Fruity Gauntlets (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 4 | Gladiator Helm (Normal) +Sacred Element +Walrus Spirit | Titan Helm (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 5 | Topaz Greaves (Superior) +Sacred Element +Walrus Spirit | Xenotype Walkers (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Антуан | 6 | Neku Shield (Normal) +Sacred Element +Walrus Spirit | Painted Palette (Superior) +Sacred Element +Krampus Spirit | +0.0 п.п. |
| Беовульф | 2 | Warlord Plate (Normal) +Tempest Element +Lion Spirit | Breastplate (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 3 | Republic Gauntlets (Normal) +Tempest Element +Lion Spirit | Demi Gauntlets (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 4 | Gladiator Helm (Normal) +Tempest Element +Lion Spirit | Brinewater Helm (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Беовульф | 5 | Fizzy Guzzle Bottle (Normal) +Tempest Element +Lion Spirit | XL Healing Potion (Superior) +Tempest Element +Kraken Spirit | +0.0 п.п. |
| Эбигейл | 1 | Owl Wing Wand (Flawless) +Nightmare Element +Bear Spirit | Owl Wing Wand (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 2 | Aang's Robe (Superior) +Nightmare Element +Bear Spirit | Cupid Robes (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 3 | Cat Burglar Claws (Normal) +Nightmare Element +Bear Spirit | Macaron Set (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 4 | Cardboard Clogs (Normal) +Nightmare Element +Bear Spirit | Moonlight Zōri (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 5 | Firework Bundle (Flawless) +Nightmare Element +Bear Spirit | Grimar's Collection (Superior) +Nightmare Element +Leviathan Spirit | +0.0 п.п. |
| Эбигейл | 6 | Firework Bundle (Superior) +Nightmare Element +Bear Spirit | Firework Bundle (Superior) +Nightmare Element +Bahamut Spirit | +0.0 п.п. |

