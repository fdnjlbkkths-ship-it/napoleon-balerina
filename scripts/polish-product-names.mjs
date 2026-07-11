/**
 * Final display-name polish + force box photo last where known.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productsPath = path.join(__dirname, '..', 'src', 'data', 'products.json');
const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

const NAME_OVERRIDES = {
  3: 'Пирожные Анна Павлова — Фуэте от 4 шт.',
  4: 'Пирожные Анна Павлова — сердце Балерины от 4 шт.',
  8: 'Бенто торт Шварцвальд с малиновым венком',
  13: 'Торт «Прага»',
  15: 'Мини набор пирожных-картошка',
  17: 'Подарочный набор шоколадных конфет «Любимая помада балерины»',
  18: 'Пирожные «Прага»',
  19: 'Пирожное-картошка «Моей ЧеLOVEчке»',
  20: 'Набор пирожных-картошка для любимых людей',
  24: 'Бенто торт «Банан-Карамель»',
  25: 'Бенто торт «Молочная (карамельная) девочка» с вишней конфи',
  26: 'Бенто торт «Молочная (карамельная) девочка» с малиной конфи',
  28: 'Торт «Цветы»',
  29: 'Торт «Цветы для мамы»',
  30: 'Торт-подарок с ягодами',
  31: 'Торт «Прага» морской',
  32: 'Торт «Наполеон»',
  34: 'Колье-чокер с подвеской «Пчела в хрустале»',
  35: 'Колье-чокер с подвеской «Каприз Балерины» (авантюрин)',
  37: 'Колье-чокер с подвеской «Каприз Балерины» (агат)',
  38: 'Колье-чокер «Ты — совершенство»',
  41: 'Эклеры «Пари-Брест» 4 шт.',
  42: 'Эклеры «Пари-Брест» 6 шт.',
  44: 'Торт свадебный',
};

/** Known box photo index (1-based file suffix) when auto-order failed */
const BOX_SUFFIX = {
  7: 1, // lyubimoe-serdechko box is -1
};

function polish(name) {
  let n = String(name || '').replace(/\s+/g, ' ').trim();
  n = n.replace(/,\s*8\s*марта$/i, '');
  n = n.replace(/,\s*на\s+8\s*марта$/i, '');
  n = n.replace(/\s+8\s*марта$/i, '');
  n = n.replace(/,\s*На\s+8\s*марта$/i, '');
  n = n.replace(/\s+На\s+8\s*марта$/i, '');
  n = n.replace(/Колье\s*—\s*чокер/g, 'Колье-чокер');
  n = n.replace(/Пари\s*—\s*Брест/g, 'Пари-Брест');
  n = n.replace(/пирожных\s*—\s*картошка/gi, 'пирожных-картошка');
  n = n.replace(/[,\s]+$/g, '').trim();
  return n;
}

function moveBoxLast(images, boxSuffix) {
  if (!images?.length || !boxSuffix) return images;
  const box = images.find((img) => img.endsWith(`-${boxSuffix}.jpg`));
  if (!box) return images;
  const rest = images.filter((img) => img !== box);
  return [...rest, box];
}

for (const p of data.products) {
  if (NAME_OVERRIDES[p.id]) p.name = NAME_OVERRIDES[p.id];
  else p.name = polish(p.name);
  p.alt = p.name;

  if (BOX_SUFFIX[p.id]) {
    p.images = moveBoxLast(p.images, BOX_SUFFIX[p.id]);
    p.image = p.images[0] || p.image;
  }
}

fs.writeFileSync(productsPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Polished names. Sample:');
data.products
  .filter((p) => [7, 25, 26, 28, 30, 33, 34].includes(p.id))
  .forEach((p) => console.log(p.id, p.name, '→', p.images.map((i) => i.split('/').pop()).join(' > ')));
