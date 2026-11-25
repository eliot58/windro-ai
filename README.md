# Windro API

Telegram-бот и HTTP API: принимают заявку на окна (PDF, DOCX, DOC или фото бланка)
и распознают её через Gemini. Бот дальше сам заказывает коммерческое предложение на сервере КП,
HTTP API возвращает распознанные данные на `callback_url`.

## Как это работает

1. Файл приходит в бот или в `POST /api/v1/recognitions`.
2. `DocumentReader` превращает документ в картинки блоков «чертёж + таблица».
3. Gemini через OpenRouter возвращает JSON с изделиями.
4. Правила нормализуют значения, валидатор проверяет схему сервера КП. Найденные ошибки
   уходят обратно модели, после трёх попыток подключается запасная модель.
5. Из бота изделия уходят на сервер КП, а готовый PDF приходит на `/api/v1/proposals/webhook`.
   Из HTTP API изделия уходят на `callback_url`.

Открывания на чертежах документов проверяет локальная модель `recognition/models/opening-classifier.onnx`.
Москитки и дополнительные изделия берутся из текста документа.

## Запуск

Нужны Node.js 22.12+, PostgreSQL и LibreOffice (команда `soffice`, для DOC и DOCX).

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Вебхуку Telegram нужен публичный HTTPS-адрес в `PUBLIC_URL`. Swagger открывается на `/api/v1/docs`.

## HTTP API

Все адреса начинаются с `/api/v1`.

| Метод | Адрес | Назначение |
|---|---|---|
| POST | `/recognitions` | распознать заявку, результат придёт на `callback_url` |
| POST | `/proposals/webhook` | готовый PDF от сервера КП |
| POST | `/telegram/webhook` | обновления Telegram |

`/recognitions` требует заголовок `x-api-key` со значением `API_KEY`.
Вебхук Telegram проверяет свой секрет. Вебхук КП открыт: сервер КП не умеет слать заголовки,
его адрес передаётся в каждом заказе в поле `url`.

`/recognitions` принимает `multipart/form-data` с полями `file` и `callback_url` (`seller_code` можно передать, он не используется).
Ответ `202`: `{ status: "accepted", request_id }`. Результат приходит POST-запросом с JSON на `callback_url`:
`{ request_id, status: "completed", cloud, orderItems, addOrderitems? }` или `{ request_id, status: "error", error_type, message }`.
Ошибки запроса приходят со статусами `400` и `401` в виде `{ code, message }`. Схемы описаны в Swagger.

## Проверки

```bash
npm test
npm run test:e2e
npm run eval:golden
npm run eval:golden -- --limit 5
```

`eval:golden` распознаёт фото бланков и сравнивает результат с эталонами, каждый прогон тратит запросы к OpenRouter.
Эталоны лежат в `test/golden`: в `input/` фото замеров, в `output/` ожидаемый JSON с тем же номером (`input/01.jpg` ↔ `output/01.json`).
Промпты лежат в `src/recognition/prompts`.
