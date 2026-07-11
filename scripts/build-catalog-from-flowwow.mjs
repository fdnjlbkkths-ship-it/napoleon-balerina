/**
 * Converts scripts/flowwow-catalog.json → src/data/products.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'flowwow-catalog.json'), 'utf8'));

function isFlowwowChrome(s) {
  return /Магазины в \d+\+ городах|Доставка от 30 минут|Корпоративным клиентам|Найти товары и магазины/i.test(
    s || ''
  );
}

function cleanText(s) {
  if (!s) return '';
  let t = String(s)
    .replace(/\n?Показать еще\s*/gi, '')
    .replace(/\n?Показать ещё\s*/gi, '')
    .replace(/\s*Скрыть\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Scraped body text often starts with site chrome — drop it
  if (isFlowwowChrome(t)) {
    const markers = [
      /Внимание![\s\S]*/i,
      /Состав[:\s]+([\s\S]+)/i,
      /✨[\s\S]*/,
      /⚜️[\s\S]*/,
    ];
    for (const re of markers) {
      const m = t.match(re);
      if (m && (m[1] || m[0]).length > 40) {
        t = (m[1] || m[0]).trim();
        break;
      }
    }
    if (isFlowwowChrome(t)) return '';
  }

  return t.replace(/\s*Скрыть\s*$/gi, '').trim();
}

function cleanComposition(s) {
  if (!s) return '';
  return String(s)
    .replace(/\s*Скрыть\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFillings(list) {
  const junk = /купить|руб|₽|доставк|вес|состав|размер|начинк/i;
  return [...new Set((list || []).map((f) => String(f).replace(/\s+/g, ' ').trim()))]
    .filter((f) => f && f.length >= 2 && f.length < 60 && !junk.test(f));
}

function shortName(name) {
  if (!name) return '';
  let n = String(name).replace(/\s+/g, ' ').trim();
  n = n.replace(/\s*-\s*/g, ' — ');

  const recipients =
    'Маме|маме|Бабушке|бабушке|Жене|жене|Девушке|девушке|Женщине|женщине|Подруге|подруге|Парню|парню|Мужу|мужу|Папе|папе|Отцу|отцу|Сыну|сыну|Дочке|дочке|Дочери|дочери|Коллеге|коллеге|Учителю|учителю|Любимой|любимой|мужчине|Мужчине|ребенку|ребёнку|защитнику|моряку|подводнику|рыбаку';

  const cutters = [
    new RegExp(`(?:[,-]?\\s+)(?:${recipients})(?:\\s*[,.]|\\s+|$).*`, 'i'),
    /(?:[,-]?\s+)(?:на\s+)?8\s*марта.*/i,
    /(?:[,-]?\s+)День\s+[Рр]ождения.*/i,
    /(?:[,-]?\s+)Праздник(?:\s|,|$).*/i,
    /(?:[,-]?\s+)Подарок(?:\s|,|$).*/i,
    /(?:[,-]?\s+)для\s+(?:девушки|мамы|подруги|бабушки|жены|компании).*/i,
    /(?:[,-]?\s+)до\s+\d+\s*₽.*/i,
    /(?:[,-]?\s+)Участвует в конкурсе.*/i,
    /(?:[,-]?\s+)Детский торт.*/i,
    /(?:[,-]?\s+)Цветы(?:\s|,|$).*/i,
    /(?:[,-]?\s+)Фиалки(?:\s|,|$).*/i,
    /(?:[,-]?\s+)ягоды(?:\s|,|$).*/i,
    /(?:[,-]?\s+)На\s+23\s+февраля.*/i,
    /(?:[,-]?\s+)на\s+23\s+февраля.*/i,
    /(?:,\s*)(?:праздник|день рождения).*/i,
  ];

  let prev = '';
  while (prev !== n) {
    prev = n;
    for (const re of cutters) {
      const m = n.match(re);
      if (m && m.index != null && m.index >= 12) n = n.slice(0, m.index).trim();
    }
    n = n.replace(/[,\s—\-]+$/g, '').trim();
  }

  n = n.replace(/Пирожное\s*—\s*/g, 'Пирожное — ');
  n = n.replace(/\s{2,}/g, ' ').trim();
  return n || String(name).trim();
}

function classify(p) {
  const n = (p.name || '').toLowerCase();
  const slug = (p.slug || '').toLowerCase();

  if (p.kind === 'jewelry') {
    return { category: 'jewelry', subcategory: null };
  }
  if (p.kind === 'cosmetics') {
    return { category: 'cosmetics', subcategory: null };
  }

  if (/бенто|bento/.test(n) || /bento/.test(slug)) {
    return { category: 'cakes', subcategory: 'cakes-bento' };
  }
  if (/торт|прага|наполеон|балерина|свадебн/.test(n) && !/пирожн/.test(n)) {
    return { category: 'cakes', subcategory: 'cakes-classic' };
  }
  if (/рулет|меренг/.test(n)) {
    return { category: 'rolls', subcategory: null };
  }
  if (/набор|конфет|шоколад|помада|фиалк/.test(n) && /набор|конфет|помада/.test(n)) {
    return { category: 'gifts', subcategory: null };
  }
  if (/павлова|картошка|пари|пирожн|ящик фиалок/.test(n) || /pirozh|pavlova|kartoshka|fialok|pari-brest/.test(slug)) {
    return { category: 'pastries', subcategory: /павлова|pavlova/.test(n + slug)
      ? 'pastries-pavlova'
      : /картошка|kartoshka/.test(n + slug)
        ? 'pastries-kartoshka'
        : null };
  }
  if (/набор/.test(n)) {
    return { category: 'gifts', subcategory: null };
  }
  return { category: 'cakes', subcategory: 'cakes-classic' };
}

const products = catalog.products
  .filter((p) => p.name && !p.error && p.price)
  .map((p) => {
    const { category, subcategory } = classify(p);
    const composition = cleanComposition(p.composition);
    let description = cleanText(p.description);
    if (!description && composition) {
      description = `Состав: ${composition}`;
    }
    if (!description) description = p.name;
    const fillings = cleanFillings(p.fillings);

    const images = p.images?.length
      ? p.images
      : p.imageUrls?.length
        ? p.imageUrls
        : [];

    const cardDesc =
      description.startsWith('Состав:')
        ? description.slice(0, 180) + (description.length > 180 ? '…' : '')
        : description.slice(0, 220) + (description.length > 220 ? '…' : '');

    return {
      id: p.id,
      slug: p.slug,
      name: shortName(p.name),
      category,
      subcategory,
      price: p.price,
      priceOld: p.priceOld || null,
      weight: p.weight || null,
      size: p.size || null,
      prepTime: p.prepTime || null,
      description: cardDesc,
      fullDescription: [
        description.startsWith('Состав:') ? '' : description,
        composition ? `Состав:\n${composition}` : '',
        p.size ? `Размер: ${p.size}` : '',
        p.weight ? `Вес: ${p.weight}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      composition: composition || null,
      fillings,
      image: images[0] || '',
      images,
      alt: p.name,
      sourceUrl: p.url,
    };
  });

const cover = (cat) => products.find((p) => p.category === cat)?.image || products[0]?.image || '';

const data = {
  categories: [
    {
      id: 'cakes',
      name: 'Торты',
      icon: '🎂',
      image: cover('cakes'),
      subcategories: [
        { id: 'cakes-classic', name: 'Торты' },
        { id: 'cakes-bento', name: 'Бенто-торты' },
      ],
    },
    {
      id: 'pastries',
      name: 'Пирожные',
      icon: '🧁',
      image: cover('pastries'),
      subcategories: [
        { id: 'pastries-pavlova', name: 'Анна Павлова' },
        { id: 'pastries-kartoshka', name: 'Картошка' },
      ],
    },
    {
      id: 'rolls',
      name: 'Меренговые рулеты',
      icon: '🍥',
      image: cover('rolls'),
      subcategories: [],
    },
    {
      id: 'gifts',
      name: 'Подарочные наборы',
      icon: '🎁',
      image: cover('gifts'),
      subcategories: [],
    },
    {
      id: 'jewelry',
      name: 'Украшения',
      icon: '💎',
      image: cover('jewelry'),
      subcategories: [],
    },
    {
      id: 'cosmetics',
      name: 'Мыло ручной работы',
      icon: '🫧',
      image: cover('cosmetics'),
      subcategories: [],
    },
    {
      id: 'holidays',
      name: 'Праздники',
      icon: '🎉',
      image: cover('cakes'),
      subcategories: [
        { id: 'feb23', name: '23 февраля', icon: '🎖️' },
        { id: 'mar8', name: '8 марта', icon: '💐' },
        { id: 'sep1', name: '1 сентября', icon: '📚' },
        { id: 'birthday', name: 'День рождения', icon: '🎈' },
        { id: 'newyear', name: 'Новый год', icon: '🎄' },
        { id: 'valentine', name: '14 февраля', icon: '❤️' },
        { id: 'wedding', name: 'Свадьба', icon: '💍' },
        { id: 'graduation', name: 'Выпускной', icon: '🎓' },
        { id: 'easter', name: 'Пасха', icon: '🐣' },
        { id: 'anniversary', name: 'Юбилей', icon: '🥂' },
        { id: 'teacher', name: 'День учителя', icon: '📖' },
        { id: 'corporate', name: 'Корпоратив', icon: '🏢' },
      ],
    },
  ],
  products,
  reviews: [
    {
      id: 1,
      name: 'Анна Петрова',
      text: 'Невероятно нежные торты! Заказывали на день рождения — все гости были в восторге.',
      rating: 5,
    },
    {
      id: 2,
      name: 'Дмитрий Соколов',
      text: 'Лучшие бенто-торты в городе — красивые и очень вкусные!',
      rating: 5,
    },
    {
      id: 3,
      name: 'Елена Морозова',
      text: 'Картошка как у бабушки — нежная и ароматная. Обязательно вернёмся!',
      rating: 5,
    },
  ],
  shop: {
    name: 'Наполеон и Балерина',
    tagline: 'Сладкие шедевры вашего стола',
    phone: '+7 (8352) 12-34-56',
    email: 'hello@napoleon-balerina.ru',
    address: 'г. Чебоксары, ул. Константина Иванова, д. 12',
    city: 'Чебоксары',
    hours: 'Пн–Вс: 9:00 – 21:00',
    orderEmail: 'orders@napoleon-balerina.ru',
    messengers: {
      whatsapp: { phone: '+74951234567', label: 'WhatsApp' },
      telegram: {
        username: 'PiterSPB109',
        label: 'Telegram',
        botOrderUrl: 'https://napoleon-order-bot.napoleonorders.workers.dev/order',
      },
      max: {
        label: 'MAX',
        chatUrl:
          'https://max.ru/u/f9LHodD0cOIaLEYgT7W9BIY9NzJmvm1sjMH97DTyVWvNaTByRbza5cufXlA',
        webUrl: 'https://web.max.ru/',
      },
    },
  },
};

const out = path.join(__dirname, '..', 'src', 'data', 'products.json');
fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf8');
console.log('Wrote', products.length, 'products to', out);
console.log(
  'by category',
  Object.fromEntries(
    data.categories.map((c) => [c.id, products.filter((p) => p.category === c.id).length])
  )
);
