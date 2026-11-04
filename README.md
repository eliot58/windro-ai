# Windro API

Telegram-бот и HTTP API: принимают заявку на окна (PDF, DOCX, DOC или фото бланка),
распознают её через Gemini и заказывают коммерческое предложение на сервере КП.

## Как это работает

1. Файл приходит в бот или в `POST /api/v1/orders/proposal/document`.
2. `DocumentReader` превращает документ в картинки блоков «чертёж + таблица».
3. Gemini через OpenRouter возвращает JSON с изделиями.
4. Правила нормализуют значения, валидатор проверяет схему сервера КП. Найденные ошибки
   уходят обратно модели, после трёх попыток подключается запасная модель.
5. Изделия уходят на сервер КП, а готовый PDF приходит на `/api/v1/proposals/webhook`.

Локальных ML-моделей нет. Москитки и дополнительные изделия берутся из текста документа.

## Запуск

Нужны Node.js 22.12+, PostgreSQL и LibreOffice (команда `soffice`, для DOC и DOCX).

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Вебхуку Telegram нужен публичный HTTPS-адрес в `PUBLIC_URL`. Swagger открывается на `/docs`
в режиме development.

## HTTP API

Все адреса начинаются с `/api/v1`.

| Метод | Адрес | Назначение |
|---|---|---|
| POST | `/orders/proposal/document` | документ, распознавание и КП |
| POST | `/orders/proposal/photo` | фото бланка, распознавание и КП |
| POST | `/orders/recognize/document` | документ, только распознавание |
| POST | `/orders/recognize/photo` | фото бланка, только распознавание |
| GET | `/orders/:requestId` | статус запроса |
| POST | `/proposals/webhook` | готовый PDF от сервера КП |
| POST | `/telegram/webhook` | обновления Telegram |

Все адреса, кроме `/telegram/webhook`, требуют заголовок `x-api-key` со значением `API_KEY`.
У вебхука Telegram своя проверка секретом.

Запросы `/orders` принимают `multipart/form-data` с полями `file`, `callbackUrl`, `sellerCode`.
Ответ `202` содержит `requestId`, результат приходит POST-запросом на `callbackUrl`.
Ошибки приходят со статусами `400` и `404` в виде `{ code, message }`: `code` для логики клиента, `message` на русском для пользователя. Схемы ответов описаны в Swagger.

## Проверки

```bash
npm test
npm run test:e2e
npm run eval:golden -- <папка с эталонами> --limit 5
```

`eval:golden` сравнивает распознавание с эталонными JSON и тратит запросы к OpenRouter.
Промпты лежат в `src/recognition/prompts`.
