import { getProductById, getProductCategoryLabel } from './data.js';
import { addToCart, formatPrice } from './cart.js';
import { getProductImages, initCarousel, renderCarousel } from './carousel.js';
import {
  escapeHtml,
  getFillingExtra,
  getPriceWithFilling,
  getSelectedFilling,
  initFillingDropdowns,
  renderFillingDropdown,
} from './fillings.js';
import { getProductCompositionLines } from './composition.js';
import { formatSizeDisplay } from './format-size.js';

/** Убирает из текста то, что уже показано отдельными блоками (вес/размер/срок/выбор начинки). */
function cleanProductDescription(text, { hasSpecs, hasFillingChoice }) {
  let out = String(text || '');

  if (hasSpecs) {
    out = out.replace(/^(Размер|Вес|Срок(?: изготовления)?|Изготовление|Хранение)\s*:.*$/gim, '');
  }

  if (hasFillingChoice) {
    out = out.replace(/\n*Начинки на выбор\s*:?\s*\n(?:\s*[•\-*–—].*\n?)*/gi, '\n');
    out = out.replace(/\n*Начинки\s*:\s*.+$/gim, '');
  }

  // Состав выносится в отдельный блок
  out = out.replace(/\n*Состав\s*:[\s\S]*$/i, '');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Отделяет описание от состава. */
function splitDescriptionAndComposition(fullText, product) {
  let narrative = fullText;

  if (/Состав\s*:/i.test(fullText)) {
    const parts = fullText.split(/\n*Состав\s*:\s*\n?/i);
    narrative = (parts[0] || '').trim();
  }

  return {
    narrative: narrative.trim(),
    compositionLines: getProductCompositionLines(product),
  };
}

function renderCompositionBlock(lines) {
  if (!lines.length) return '';

  const needsCurtain = lines.length > 4;
  const list = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');

  return `
    <div class="product-page__composition${needsCurtain ? ' is-collapsible' : ''}" data-composition>
      <p class="product-page__block-label">Состав</p>
      <div class="product-page__composition-panel${needsCurtain ? ' is-collapsed' : ''}" data-composition-panel>
        <ul class="product-page__composition-list">${list}</ul>
      </div>
      ${
        needsCurtain
          ? `<button type="button" class="product-page__composition-toggle" data-composition-toggle aria-expanded="false">
          Показать полностью
        </button>`
          : ''
      }
    </div>`;
}

export function initProductPage() {
  const root = document.getElementById('product-page');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id'));
  const product = getProductById(id);

  if (!product) {
    root.innerHTML = `
      <div class="product-page__empty">
        <h1>Товар не найден</h1>
        <p>Возможно, позиция снята с меню или ссылка устарела.</p>
        <a href="menu.html" class="btn btn--primary">Вернуться в меню</a>
      </div>`;
    return;
  }

  document.title = `${product.name} — Наполеон и Балерина`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', product.description);

  const images = getProductImages(product);
  const fillings = Array.isArray(product.fillings) ? product.fillings : [];
  const hasFillingChoice = fillings.length > 1;
  const initialFilling = fillings[0] || '';
  const initialPrice = getPriceWithFilling(product.price, initialFilling);

  const specs = [
    product.weight
      ? `<div class="product-page__spec"><span class="product-page__spec-label">Вес</span><span class="product-page__spec-value">${escapeHtml(product.weight)}</span></div>`
      : '',
    product.size
      ? `<div class="product-page__spec"><span class="product-page__spec-label">Размер</span><span class="product-page__spec-value">${escapeHtml(formatSizeDisplay(product.size))}</span></div>`
      : '',
    product.prepTime
      ? `<div class="product-page__spec"><span class="product-page__spec-label">Изготовление</span><span class="product-page__spec-value">${escapeHtml(product.prepTime)}</span></div>`
      : '',
    product.shelfLife
      ? `<div class="product-page__spec"><span class="product-page__spec-label">Хранение</span><span class="product-page__spec-value">${escapeHtml(product.shelfLife)}</span></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const fullText = cleanProductDescription(product.fullDescription || product.description, {
    hasSpecs: Boolean(specs),
    hasFillingChoice,
  });
  const { narrative, compositionLines } = splitDescriptionAndComposition(fullText, product);

  const fillingsHtml = fillings.length
    ? `<div class="product-page__fillings">${renderFillingDropdown(product.id, fillings, initialFilling)}</div>`
    : '';

  root.innerHTML = `
    <div class="product-page__grid">
      <div class="product-page__gallery">
        ${renderCarousel(images, product.alt || product.name)}
      </div>
      <div class="product-page__info">
        <nav class="product-page__breadcrumb" aria-label="Навигация">
          <a href="menu.html">Меню</a>
          <span>/</span>
          <a href="menu.html?category=${product.category}">${escapeHtml(getProductCategoryLabel(product).split(' · ')[0])}</a>
          ${
            product.subcategory
              ? `<span>/</span><a href="menu.html?category=${product.category}&subcategory=${product.subcategory}">${escapeHtml(getProductCategoryLabel(product).split(' · ')[1] || '')}</a>`
              : ''
          }
        </nav>
        <p class="product-page__category">${escapeHtml(getProductCategoryLabel(product))}</p>
        <h1 class="product-page__title">${escapeHtml(product.name)}</h1>
        <div class="product-page__price-row">
          <span class="product-page__price" data-product-price>${formatPrice(initialPrice)}</span>
          ${
            product.priceOld && product.priceOld > product.price
              ? `<span class="product-page__price-old">${formatPrice(product.priceOld)}</span>`
              : ''
          }
        </div>
        <span class="product-page__extra" data-product-extra hidden></span>
        ${fillingsHtml}
        ${
          narrative
            ? `<div class="product-page__block">
          <p class="product-page__block-label">Описание</p>
          <div class="product-page__desc">${escapeHtml(narrative).replace(/\n/g, '<br>')}</div>
        </div>`
            : ''
        }
        ${renderCompositionBlock(compositionLines)}
        ${specs ? `<div class="product-page__specs">${specs}</div>` : ''}
        <div class="product-page__actions">
          <div class="qty-control">
            <button type="button" class="qty-control__btn" data-qty-minus aria-label="Меньше">−</button>
            <input type="number" class="qty-control__input" id="product-qty" value="1" min="1" max="99" aria-label="Количество">
            <button type="button" class="qty-control__btn" data-qty-plus aria-label="Больше">+</button>
          </div>
          <button type="button" class="btn btn--primary" id="product-add-cart">Добавить в корзину</button>
        </div>
        <a href="menu.html?category=${product.category}" class="product-page__back">← Назад к каталогу</a>
      </div>
    </div>`;

  initCarousel(root.querySelector('[data-carousel]'));
  initCompositionToggle(root);

  const priceEl = root.querySelector('[data-product-price]');
  const extraEl = root.querySelector('[data-product-extra]');

  const syncPrice = (filling) => {
    const extra = getFillingExtra(filling);
    if (priceEl) priceEl.textContent = formatPrice(getPriceWithFilling(product.price, filling));
    if (extraEl) {
      if (extra) {
        extraEl.hidden = false;
        extraEl.textContent = `Начинка «${filling}»: +${extra} ₽`;
      } else {
        extraEl.hidden = true;
        extraEl.textContent = '';
      }
    }
  };

  syncPrice(initialFilling);

  initFillingDropdowns(root, {
    onChange: (_dropdown, filling) => syncPrice(filling),
  });

  const qtyInput = document.getElementById('product-qty');
  root.querySelector('[data-qty-minus]')?.addEventListener('click', () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  root.querySelector('[data-qty-plus]')?.addEventListener('click', () => {
    qtyInput.value = Math.min(99, Number(qtyInput.value) + 1);
  });

  document.getElementById('product-add-cart')?.addEventListener('click', () => {
    const qty = Math.max(1, Number(qtyInput.value) || 1);
    const filling = getSelectedFilling(root, product.id, fillings);
    if (fillings.length && !filling) {
      root.querySelector('.filling-dropdown__trigger')?.click();
      return;
    }
    addToCart(product, qty, { filling });
    const btn = document.getElementById('product-add-cart');
    if (btn) {
      btn.textContent = 'Добавлено ✓';
      setTimeout(() => {
        btn.textContent = 'Добавить в корзину';
      }, 1500);
    }
  });
}

function initCompositionToggle(root) {
  const wrap = root.querySelector('[data-composition]');
  const panel = root.querySelector('[data-composition-panel]');
  const btn = root.querySelector('[data-composition-toggle]');
  if (!wrap || !panel || !btn) return;

  btn.addEventListener('click', () => {
    const open = wrap.classList.toggle('is-open');
    panel.classList.toggle('is-collapsed', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Свернуть' : 'Показать полностью';
  });
}
