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
| `shop.messengers` | WhatsApp, Telegram (`PiterSPB109`), MAX |
| `shop` | Название, телефон, адрес |

## Мессенджеры для заказа

- **WhatsApp** — номер в `shop.messengers.whatsapp.phone`
- **Telegram** — `@PiterSPB109`
- **MAX** — username в `shop.messengers.max`

## Технологии

HTML5 · SCSS · JavaScript · Vite · GSAP · GitHub Pages

## Лицензия

MIT
