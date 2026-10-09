# Shop Titans Gear Optimizer

Браузерное приложение для подбора экипировки, стихий и духов героям Shop Titans: под конкретный квест или «универсальный» набор для группы локаций. Всё считается в браузере, сервера нет. Сборка — статичные файлы в `dist/` (GitHub Pages).

## Команды

```bash
npm install
npm run dev              # dev-сервер (снапшот данных создаётся из фикстур, если его нет)
npm test                 # Vitest
npm run lint && npm run typecheck
npm run build            # карта картинок (если старше 7 дн.) → снапшот из живой таблицы → vite build
npm run build-snapshot   # src/data/snapshot.json (флаги: --offline — из fixtures/sheets)
npm run build-image-map  # src/data/imageMap.json (имя → id картинки)
npm run dump-sheets      # обновить fixtures/sheets
```

## Данные

- Игровые данные — публичная [таблица сообщества](https://docs.google.com/spreadsheets/d/1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c). Приложение читает её прямо из браузера, кэширует в IndexedDB и раз в сутки (настраивается) проверяет обновления. Устройство листов описано в `docs/SCHEMA.md`, допущения — в `docs/ASSUMPTIONS.md`.
- Пороги защиты квестов — [STC Hub — Main Quests](https://stcentral-hub.github.io/posts/main-quests/) (лицензия CC BY-NC-ND 4.0). В репозиторий и бандл не входят: загружаются в браузер пользователя и хранятся только в нём.

## Права на изображения

Все изображения из игры (предметы, духи, стихии, типы, навыки, классы) принадлежат **Kabam**. Приложение не хранит их копий: картинки загружаются напрямую с playshoptitans.com и stcentral-hub.github.io (fankit) по ссылкам. В репозитории лежит только соответствие «название → внутренний id» (`src/data/imageMap.json`).

Неофициальный фанатский инструмент, не связан с Kabam.
