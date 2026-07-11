/**
 * Scrapes Flowwow product pages via Playwright.
 * Usage: node scripts/scrape-flowwow.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const urls = JSON.parse(fs.readFileSync(path.join(__dirname, 'flowwow-urls.json'), 'utf8'));
const outDir = path.join(root, 'public', 'images', 'products', 'flowwow');
const catalogPath = path.join(__dirname, 'flowwow-catalog.json');

fs.mkdirSync(outDir, { recursive: true });

function slugFromUrl(url) {
  return url.replace(/\/$/, '').split('/').pop() || 'product';
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function extractProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Expand "Показать ещё"
  for (const label of ['Показать еще', 'Показать ещё', 'Show more']) {
    const btn = page.getByText(label, { exact: false }).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 1500 });
        await page.waitForTimeout(400);
      } catch {
        /* ignore */
      }
    }
  }

  const data = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const h1 = document.querySelector('h1')?.innerText?.trim() || '';

    const priceMatch = text.match(/Купить\s*([\d\s\u00a0]+)\s*₽/i) || text.match(/([\d\s\u00a0]+)\s*₽\s*([\d\s\u00a0]+)\s*₽/);
    let price = null;
    let priceOld = null;
    const prices = [...text.matchAll(/([\d\s\u00a0]+)\s*₽/g)]
      .map((m) => Number(String(m[1]).replace(/\s|\u00a0/g, '')))
      .filter((n) => n > 50 && n < 200000);
    if (prices.length) {
      price = prices[0];
      if (prices[1] && prices[1] > price) priceOld = prices[1];
    }

    const weight =
      (text.match(/Вес товара\s*\n?\s*([^\n]+)/i) || [])[1]?.trim() ||
      (text.match(/(\d+\s*гр\.?)/i) || [])[1] ||
      null;

    const sizeParts = [];
    const w = text.match(/Ширина\s*[-–—]?\s*([^\n]+)/i);
    const h = text.match(/Высота\s*[-–—]?\s*([^\n]+)/i);
    if (w) sizeParts.push(`Ширина - ${w[1].trim()}`);
    if (h) sizeParts.push(`Высота - ${h[1].trim()}`);

    let composition = null;
    const comp = text.match(/Состав\s*\n([\s\S]*?)(?:\nРазмер|\nВес товара|\nИзготовитель|\nСтрана)/i);
    if (comp) composition = comp[1].replace(/\s+/g, ' ').trim();

    let prepTime = null;
    const prep =
      text.match(/Срок изготовления[^\n]*\n?\s*([^\n]+)/i) ||
      text.match(/Время изготовления[^\n]*\n?\s*([^\n]+)/i) ||
      text.match(/Готовность[^\n]*\n?\s*([^\n]+)/i) ||
      text.match(/изготовлен[^\n]{0,40}/i);
    if (prep) prepTime = (prep[1] || prep[0]).trim();

    // Description: prefer "Внимание!" block; avoid header chrome
    let description = '';
    const attn = text.match(/Внимание![\s\S]{40,6000}?(?=\nОценки|\nДругие товары|\nРекомендуем|\nСостав\b|$)/);
    if (attn) {
      description = attn[0].replace(/\n?Показать ещё?\s*$/i, '').trim();
    } else {
      const paras = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(
          (p) =>
            p.length > 80 &&
            !/Магазины в|Доставка от 30|Корпоративным|Flowwow|Найти товары|Как можно скорее/i.test(p) &&
            !/^Состав/i.test(p)
        );
      description = (paras[0] || '').replace(/\n?Показать ещё?\s*$/i, '').trim();
    }

    if (composition) {
      composition = composition.replace(/\s*Скрыть\s*$/i, '').trim();
    }

    const fillings = [];
    const radios = [...document.querySelectorAll('input[type="radio"]')];
    for (const r of radios) {
      const label =
        document.querySelector(`label[for="${r.id}"]`)?.innerText?.trim() ||
        r.closest('label')?.innerText?.trim() ||
        r.parentElement?.innerText?.trim() ||
        r.value;
      if (label && label.length < 80) fillings.push(label.replace(/\s+/g, ' ').trim());
    }
    // Also look under Начинка heading
    const nach = text.match(/Начинка\s*\n([\s\S]*?)(?:\nСостав|\nРазмер|\nВес)/i);
    if (nach && !fillings.length) {
      nach[1]
        .split(/\n/)
        .map((s) => s.trim())
        .filter((s) => s && s.length < 60)
        .forEach((s) => fillings.push(s));
    }

    const imageUrls = [
      ...new Set(
        [...document.querySelectorAll('img')]
          .map((img) => img.src || img.getAttribute('data-src') || '')
          .filter((s) => /flowwow-images\.com\/data\/flowers\/(1000x1000|524x524)/.test(s))
          .map((s) => s.replace(/\/(150x150|524x524)\//, '/1000x1000/'))
      ),
    ].slice(0, 6);

    return {
      name: h1,
      price,
      priceOld,
      weight,
      size: sizeParts.join('; ') || null,
      description,
      composition,
      prepTime,
      fillings: [...new Set(fillings)],
      imageUrls,
    };
  });

  return { url, slug: slugFromUrl(url), ...data };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ru-RU',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const products = [];
  let id = 1;

  for (const url of urls) {
    const kind = url.includes('/jewelry/')
      ? 'jewelry'
      : url.includes('/cosmetics')
        ? 'cosmetics'
        : 'bakery';
    console.log(`[${id}/${urls.length}]`, url);
    try {
      const p = await extractProduct(page, url);
      const localImages = [];
      for (let i = 0; i < Math.min(p.imageUrls.length, 3); i++) {
        const ext = path.extname(new URL(p.imageUrls[i]).pathname) || '.jpg';
        const file = `${p.slug}-${i + 1}${ext}`;
        const dest = path.join(outDir, file);
        try {
          await download(p.imageUrls[i], dest);
          localImages.push(`images/products/flowwow/${file}`);
        } catch (e) {
          console.warn('img fail', e.message);
        }
      }
      products.push({
        id: id++,
        slug: p.slug,
        name: p.name,
        price: p.price,
        priceOld: p.priceOld,
        weight: p.weight,
        size: p.size,
        description: p.description,
        composition: p.composition,
        prepTime: p.prepTime,
        fillings: p.fillings,
        images: localImages,
        imageUrls: p.imageUrls,
        url: p.url,
        kind,
      });
      fs.writeFileSync(catalogPath, JSON.stringify({ scrapedAt: new Date().toISOString(), products }, null, 2), 'utf8');
    } catch (e) {
      console.error('FAIL', url, e.message);
      products.push({ id: id++, slug: slugFromUrl(url), url, error: e.message, kind });
    }
  }

  await browser.close();
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({ scrapedAt: new Date().toISOString(), source: 'https://flowwow.com/shop/napoleon-i-balerina/', products }, null, 2),
    'utf8'
  );
  console.log('Done', products.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
