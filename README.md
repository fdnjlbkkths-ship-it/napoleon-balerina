# Наполеон и Балерина — Сайт кондитерской

Адаптивный многостраничный сайт с каталогом из 20 товаров, корзиной, оформлением заказа через мессенджеры и деплоем на GitHub Pages.

## Быстрый старт (локально)

```bash
npm install
npm run dev
```

Сайт откроется на `http://localhost:5173`

## Публикация на GitHub Pages

### 1. Установите Git

Скачайте с [git-scm.com](https://git-scm.com/download/win) и перезапустите терминал.

### 2. Создайте репозиторий на GitHub

1. Откройте [github.com/new](https://github.com/new)
2. Название репозитория: **`napoleon-balerina`** (латиница, без пробелов)
3. Публичный репозиторий → **Create repository**
4. **Не** добавляйте README, .gitignore — они уже есть в проекте

### 3. Загрузите код

В терминале в папке проекта:

```bash
cd C:\Users\89674\sweet-master

git init
git add .
git commit -m "Initial commit: сайт кондитерской Наполеон и Балерина"
git branch -M main
git remote add origin https://github.com/fdnjlbkkths-ship-it/napoleon-balerina.git
git push -u origin main
```

Замените `ВАШ_USERNAME` на ваш логин GitHub.

### 4. Включите GitHub Pages

1. Репозиторий → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions**
3. После push в `main` workflow **Deploy to GitHub Pages** соберёт и опубликует сайт

### 5. Адрес сайта

```
https://fdnjlbkkths-ship-it.github.io/napoleon-balerina/
```

Сборка занимает 1–3 минуты. Статус — вкладка **Actions** в репозитории.

---

## Структура проекта

```
napoleon-balerina/
├── index.html              # Главная
├── menu.html               # Меню
├── about.html              # О нас
├── contacts.html           # Контакты
├── order-bot/              # Cloudflare Worker + Telegram-бот заказов
├── .github/workflows/      # Автодеплой на Pages
└── src/
    ├── data/products.json  # Товары, контакты, мессенджеры
    ├── scss/
    └── js/
```

## Редактирование контента

Файл **`src/data/products.json`**:

| Раздел | Содержимое |
|--------|------------|
| `products` | Товары, цены, фото |
| `shop.messengers` | WhatsApp, Telegram (`PiterSPB109`), MAX; `telegram.botOrderUrl` — URL Worker бота |
| `shop` | Название, телефон, адрес |

## Мессенджеры для заказа

- **WhatsApp** — номер в `shop.messengers.whatsapp.phone` (открывает чат с текстом заказа)
- **Telegram** — если настроен бот заказов, кнопка шлёт заказ в Telegram-список; иначе deep link на `@PiterSPB109`
- **MAX** — копирует текст и открывает чат

### Telegram-бот списка заказов

Сайт на GitHub Pages не может держать токен бота. Заказы принимает Cloudflare Worker в папке [`order-bot/`](order-bot/).

Краткая схема:

1. Создайте бота у [@BotFather](https://t.me/BotFather), узнайте свой `chat_id`
2. Задеплойте Worker — инструкция: [`order-bot/README.md`](order-bot/README.md)
3. В корне сайта скопируйте [`.env.example`](.env.example) → `.env` и укажите `VITE_ORDER_API_URL`
4. Пересоберите сайт (`npm run build` или push в `main`)

Для GitHub Actions добавьте секреты репозитория `VITE_ORDER_API_URL` (и при необходимости `VITE_ORDER_SECRET`) и пробросьте их в шаг сборки как `env`.

Команды бота: `/orders`, `/done`, `/help`. Статусы заказа — кнопками под сообщением.

## Технологии

HTML5 · SCSS · JavaScript · Vite · GSAP · GitHub Pages · Cloudflare Workers (бот)

## Лицензия

MIT
