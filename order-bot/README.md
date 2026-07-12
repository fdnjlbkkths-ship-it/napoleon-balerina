# Telegram-бот заказов

Принимает заказы с сайта и ведёт список в Telegram с кнопками статусов.

Бот **не читает** личные чаты с клиентами — сайт сам отправляет заказ на этот Worker.

## 1. Создайте бота (BotFather)

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/newbot` → имя, например `Napoleon Orders`
3. Username, например `napoleon_balerina_orders_bot`
4. Сохраните **токен** (`123456:ABC...`)

## 2. Узнайте свой chat_id

1. Напишите боту `/start`
2. Откройте в браузере (подставьте токен):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

3. Найдите `"chat":{"id": 123456789` — это `ADMIN_CHAT_ID`

Или напишите [@userinfobot](https://t.me/userinfobot) — он покажет ваш id.

Для группы «Заказы»: добавьте бота в группу, напишите любое сообщение, снова `getUpdates` — возьмите отрицательный `chat.id` группы.

## 3. Деплой Cloudflare Worker

Нужны аккаунт [Cloudflare](https://dash.cloudflare.com/) и Node.js.

```bash
cd order-bot
npm install
npx wrangler login
```

Создайте KV:

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create ORDERS --preview
```

Вставьте оба `id` в [`wrangler.toml`](wrangler.toml).

Секреты:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
```

Опционально:

```bash
npx wrangler secret put ORDER_SECRET
npx wrangler secret put ALLOWED_ORIGINS
```

`ALLOWED_ORIGINS` пример:

```
http://localhost:5173,http://localhost:5174,https://fdnjlbkkths-ship-it.github.io
```

Деплой:

```bash
npm run deploy
```

Скопируйте URL вида `https://napoleon-order-bot.<subdomain>.workers.dev`.

## 4. Webhook Telegram

Подставьте токен и URL Worker:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://napoleon-order-bot.<subdomain>.workers.dev/telegram
```

Проверка: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## 5. Подключите сайт

В корне проекта создайте `.env` (не коммитьте):

```env
VITE_ORDER_API_URL=https://napoleon-order-bot.<subdomain>.workers.dev/order
VITE_ORDER_SECRET=ваш_секрет_если_задали
```

Либо пропишите URL в `src/data/products.json`:

```json
"telegram": {
  "username": "PiterSPB109",
  "label": "Telegram",
  "botOrderUrl": "https://napoleon-order-bot.<subdomain>.workers.dev/order"
}
```

Пересоберите и задеплойте сайт (`npm run build` / push в `main`).

## Как пользоваться

После `/start` внизу экрана постоянное меню:

| Кнопка | Действие |
|--------|----------|
| 📋 Активные | Новые и в работе |
| ✅ Завершённые | Готовые и отменённые |
| ℹ️ Справка | Краткая помощь |
| 🏠 Меню | Вернуться к подсказке |

В углу чата меню **«/»** со всеми командами:

| Команда | Действие |
|---------|----------|
| `/start` | Меню и кнопки |
| `/orders` | Активные заказы |
| `/done` | Завершённые |
| `/help` | Справка |
| `/menu` | Главное меню |

В списке заказов — кнопки открыть карточку. Под карточкой: статусы + переход к спискам.

После деплоя меню «/» ставится само (при первом сообщении боту) или вручную:

```
curl -X POST https://napoleon-order-bot.<subdomain>.workers.dev/setup
```

## Anti-bot (заказ с сайта)

Невидимая Google reCAPTCHA **v3** + при подозрении challenge **v2** (картинки).

Секреты Worker:

```bash
npx wrangler secret put RECAPTCHA_V3_SECRET
npx wrangler secret put RECAPTCHA_V2_SECRET
```

На сайте в `.env`:

```
VITE_RECAPTCHA_V3_SITE_KEY=...
VITE_RECAPTCHA_V2_SITE_KEY=...
```

Домены в консоли Google: `localhost`, `fdnjlbkkths-ship-it.github.io`.

## API

`POST /order`

```json
{
  "items": [{ "id": 1, "name": "Торт", "price": 890, "quantity": 1 }],
  "total": 890,
  "name": "Анна",
  "phone": "+7 (999) 000-00-00",
  "address": "ул. …",
  "deliveryDate": "2026-07-12",
  "deliveryTime": "15:00",
  "comment": "",
  "shopName": "Наполеон и Балерина"
}
```

Заголовок (если задан секрет): `X-Order-Secret: …`
