/**
 * Shortens SEO product titles and reorders gallery:
 * 1) cake well visible  2) macro  3) with box
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'src', 'data', 'products.json');
const publicDir = path.join(root, 'public');

/** Reload original long names from flowwow catalog when available */
function loadOriginalNames() {
  const catalogPath = path.join(__dirname, 'flowwow-catalog.json');
  if (!fs.existsSync(catalogPath)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const map = new Map();
  for (const p of catalog.products || []) {
    if (p.slug && p.name) map.set(p.slug, p.name);
  }
  return map;
}

export function shortName(name) {
  if (!name) return '';
  let n = String(name).replace(/\s+/g, ' ').trim();

  n = n.replace(/\s+-\s+/g, ' — '); // only spaced hyphens, keep Колье-чокер / Пари-Брест

  const recipients =
    'Маме|маме|Бабушке|бабушке|Жене|жене|Девушке|девушке|Женщине|женщине|Подруге|подруге|Парню|парню|Мужу|мужу|Папе|папе|Отцу|отцу|Сыну|сыну|Дочке|дочке|Дочери|дочери|Коллеге|коллеге|Учителю|учителю|Любимой|любимой|мужчине|Мужчине|ребенку|ребёнку|подруге|защитнику|моряку|подводнику|рыбаку';

  const cutters = [
    // space or comma then recipient list
    new RegExp(`(?:[,-]?\\s+)(?:${recipients})(?:\\s*[,.]|\\s+|$).*`, 'i'),
    /(?:[,-]?\s+)(?:на\s+)?8\s*марта\b.*/i,
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
    /(?:[,-]?\s+)торг? на 8 марта.*/i,
    /(?:[,-]?\s+)подарок на 8 марта.*/i,
    /(?:[,-]?\s+)На\s+23\s+февраля.*/i,
    /(?:[,-]?\s+)на\s+23\s+февраля.*/i,
    /(?:[,-]?\s+)Анна Павлова,\s*8 марта.*/i,
    /(?:,\s*)(?:праздник|день рождения).*/i,
  ];

  // Keep cutting until stable
  let prev = '';
  while (prev !== n) {
    prev = n;
    for (const re of cutters) {
      const m = n.match(re);
      if (m && m.index != null && m.index >= 12) {
        n = n.slice(0, m.index).trim();
      }
    }
    n = n.replace(/[,\s—\-]+$/g, '').trim();
  }

  // Specific cleanups
  n = n.replace(/Пирожное\s*—\s*/g, 'Пирожное — ');
  n = n.replace(/«\s+/g, '«').replace(/\s+»/g, '»');
  n = n.replace(/\s{2,}/g, ' ').trim();

  // Drop trailing "праздник" alone after comma already handled
  n = n.replace(/,\s*праздник$/i, '').trim();

  return n || String(name).trim();
}

async function scoreImage(absPath) {
  const { data, info } = await sharp(absPath)
    .resize(64, 64, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let kraft = 0;
  let whitePack = 0;
  let cream = 0;
  let berry = 0;
  let edgeish = 0;
  const w = info.width;
  const h = info.height;
  const n = w * h;

  const at = (x, y) => {
    const i = (y * w + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      if (r > 140 && r < 210 && g > 100 && g < 175 && b < 130 && r - b > 35) kraft++;
      if (r > 220 && g > 220 && b > 220) whitePack++;
      if (r > 200 && g > 185 && b > 165 && max - min < 55) cream++;
      if (r > 110 && g < 90 && b < 95) berry++;

      if (x > 0) {
        const [r0, g0, b0] = at(x - 1, y);
        if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 70) edgeish++;
      }
    }
  }

  let centerFood = 0;
  let centerN = 0;
  for (let y = 16; y < 48; y++) {
    for (let x = 16; x < 48; x++) {
      const [r, g, b] = at(x, y);
      centerN++;
      if ((r > 200 && g > 185 && b > 165) || (r > 110 && g < 95 && b < 100) || (r > 140 && g > 90 && b < 90)) {
        centerFood++;
      }
    }
  }

  return {
    kraft: kraft / n,
    whitePack: whitePack / n,
    cream: cream / n,
    berry: berry / n,
    edgeish: edgeish / n,
    centerFood: centerFood / centerN,
  };
}

function classifyTriple(scored) {
  const withScores = scored.map((s) => ({
    ...s,
    boxScore: s.stats.kraft * 2.6 + s.stats.whitePack * 0.5 + (s.stats.edgeish > 0.12 ? 0.12 : 0),
    cakeScore: s.stats.cream * 1.4 + s.stats.berry * 1.6 + s.stats.centerFood * 1.1 - s.stats.kraft * 2.2,
    macroScore: s.stats.centerFood * 1.9 + s.stats.cream * 0.7 + s.stats.berry * 1.0 - s.stats.kraft * 2.6,
  }));

  const byBox = [...withScores].sort((a, b) => b.boxScore - a.boxScore);
  const box = byBox[0];
  const rest = withScores.filter((s) => s.path !== box.path);

  let hero;
  let macro;
  if (rest.length >= 2) {
    const a = rest[0];
    const b = rest[1];
    const aHero = a.cakeScore - a.macroScore * 0.35;
    const bHero = b.cakeScore - b.macroScore * 0.35;
    if (bHero > aHero) {
      hero = b;
      macro = a;
    } else {
      hero = a;
      macro = b;
    }
  } else if (rest.length === 1) {
    hero = rest[0];
    macro = rest[0];
  } else {
    hero = box;
    macro = box;
  }

  const ordered = [];
  const pushUnique = (item) => {
    if (item && !ordered.find((o) => o.path === item.path)) ordered.push(item);
  };
  pushUnique(hero);
  pushUnique(macro);
  pushUnique(box);
  for (const s of withScores) pushUnique(s);
  return ordered.map((o) => o.rel);
}

async function reorderImages(relImages) {
  if (!relImages?.length) return relImages || [];
  if (relImages.length === 1) return relImages;

  const scored = [];
  for (const rel of relImages) {
    const abs = path.join(publicDir, rel.replace(/^\//, ''));
    if (!fs.existsSync(abs)) {
      scored.push({
        path: abs,
        rel,
        stats: { kraft: 0, whitePack: 0, cream: 0, berry: 0, edgeish: 0, centerFood: 0 },
      });
      continue;
    }
    try {
      const stats = await scoreImage(abs);
      scored.push({ path: abs, rel, stats });
    } catch {
      scored.push({
        path: abs,
        rel,
        stats: { kraft: 0, whitePack: 0, cream: 0, berry: 0, edgeish: 0, centerFood: 0 },
      });
    }
  }

  if (scored.length < 2) return relImages;
  return classifyTriple(scored);
}

async function main() {
  const originals = loadOriginalNames();
  const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  const samples = [];

  for (const p of data.products) {
    const sourceName = originals.get(p.slug) || p.name;
    const before = sourceName;
    p.name = shortName(sourceName);
    p.alt = p.name;

    const imgs = Array.isArray(p.images) && p.images.length ? [...p.images] : p.image ? [p.image] : [];
    // Sort by trailing -N so classification always sees the same three files
    const normalized = [...imgs].sort((a, b) => {
      const na = Number((a.match(/-(\d+)\.jpg$/i) || [])[1] || 0);
      const nb = Number((b.match(/-(\d+)\.jpg$/i) || [])[1] || 0);
      return na - nb;
    });
    const ordered = await reorderImages(normalized);
    p.images = ordered;
    p.image = ordered[0] || p.image || '';

    samples.push({ id: p.id, before, after: p.name, images: ordered.map((i) => path.basename(i)) });
  }

  fs.writeFileSync(productsPath, JSON.stringify(data, null, 2), 'utf8');

  console.log('Updated', data.products.length, 'products\n');
  samples.forEach((s) => {
    console.log(`#${s.id} ${s.after}`);
    if (s.before !== s.after) console.log(`   was: ${s.before}`);
    console.log(`   imgs: ${s.images.join(' → ')}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
