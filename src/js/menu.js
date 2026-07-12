import {
  getCategories,
  getSubcategories,
  getProducts,
  getProductCategoryLabel,
  searchProducts,
} from './data.js';
import { addToCart, formatPrice, getCartLineKey, getCartLineQuantity, updateQuantity } from './cart.js';
import { openCartModal } from './ui.js';
import { animateElements } from './animations.js';
import { closeAllDropdowns } from './navigation.js';
import { canHoverFine } from './pointer.js';
import { escapeHtml } from './sanitize.js';
import {
  getPriceWithFilling,
  getSelectedFilling,
  initFillingDropdowns,
  renderFillingDropdown,
} from './fillings.js';
import { formatSizeDisplay } from './format-size.js';

function menuUrl(category, subcategory) {
  const base = `menu.html?category=${category}`;
  return subcategory ? `${base}&subcategory=${subcategory}` : base;
}

function getPopularityScore(product) {
  if (typeof product.popularity === 'number') return product.popularity;

  let score = 0;
  if (product.priceOld && product.priceOld > product.price) {
    score += Math.round(((product.priceOld - product.price) / product.priceOld) * 100);
  }
  if (Array.isArray(product.fillings) && product.fillings.length > 1) score += 25;
  if (Array.isArray(product.images)) score += Math.min(30, product.images.length * 8);
  score += Math.max(0, 40 - Number(product.id || 0));
  return score;
}

function buildMaxPriceOptions(products) {
  const prices = products.map((p) => Number(p.price) || 0).filter((n) => n > 0);
  if (!prices.length) return [1500, 2000, 3000, 5000];

  const max = Math.max(...prices);
  const steps = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000];
  const options = steps.filter((n) => n < max);
  const roundedMax = Math.ceil(max / 500) * 500;
  if (!options.includes(roundedMax) && roundedMax > 0) options.push(roundedMax);
  return options;
}

export function initMenuPage() {
  const grid = document.getElementById('products-grid');
  const filtersContainer = document.getElementById('category-filters');
  const searchInput = document.getElementById('product-search');
  const sortRoot = document.getElementById('product-sort');
  const maxPriceRoot = document.getElementById('product-max-price');

  if (!grid || !filtersContainer) return;

  let activeCategory = 'all';
  let activeSubcategory = 'all';
  let searchQuery = '';
  let sortMode = 'popular';
  let maxPrice = 0;

  const SORT_OPTIONS = [
    { value: 'popular', label: 'По популярности' },
    { value: 'price-asc', label: 'Цена: сначала дешевле' },
    { value: 'price-desc', label: 'Цена: сначала дороже' },
  ];

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('category')) activeCategory = urlParams.get('category');
  if (urlParams.get('subcategory')) activeSubcategory = urlParams.get('subcategory');
  if (urlParams.get('sort') && SORT_OPTIONS.some((o) => o.value === urlParams.get('sort'))) {
    sortMode = urlParams.get('sort');
  }
  if (urlParams.get('maxPrice')) maxPrice = Number(urlParams.get('maxPrice')) || 0;

  const maxPriceOptions = [
    { value: '', label: 'Любая' },
    ...buildMaxPriceOptions(getProducts('all')).map((n) => ({
      value: String(n),
      label: `до ${formatPrice(n)}`,
    })),
  ];
  if (maxPrice && !maxPriceOptions.some((o) => o.value === String(maxPrice))) {
    maxPrice = 0;
  }

  renderToolbarDropdown(sortRoot, {
    label: 'Сортировка',
    options: SORT_OPTIONS,
    value: sortMode,
    onChange: (value) => {
      sortMode = value || 'popular';
      renderProducts();
    },
  });

  renderToolbarDropdown(maxPriceRoot, {
    label: 'До цены',
    options: maxPriceOptions,
    value: maxPrice ? String(maxPrice) : '',
    onChange: (value) => {
      maxPrice = Number(value) || 0;
      renderProducts();
    },
  });

  initToolbarDropdowns(document.querySelector('.products__toolbar'));
  bindProductCardActions(grid);
  renderFilters();
  renderProducts();
  bindFilterInteractions();

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderProducts();
    });
  }

  function syncCategoryUrl() {
    const url = new URL(window.location.href);
    if (activeCategory && activeCategory !== 'all') {
      url.searchParams.set('category', activeCategory);
    } else {
      url.searchParams.delete('category');
    }
    if (activeSubcategory && activeSubcategory !== 'all') {
      url.searchParams.set('subcategory', activeSubcategory);
    } else {
      url.searchParams.delete('subcategory');
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  }

  function bindFilterInteractions() {
    initFilterDropdowns(filtersContainer, {
      onToggleClose: (catId) => {
        // Повторное нажатие закрыло шторку — снимаем выбранную категорию
        if (activeCategory !== catId) return;
        activeCategory = 'all';
        activeSubcategory = 'all';
        syncCategoryUrl();
        renderFilters();
        renderProducts();
        bindFilterInteractions();
      },
    });
  }

  function renderFilters() {
    const categories = getCategories();
    filtersContainer.innerHTML = `
      <button class="filter-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all">Все</button>
      ${categories
        .map((cat) => {
          const subs = getSubcategories(cat.id);
          if (!subs.length) {
            return `<button class="filter-btn ${activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.icon} ${cat.name}</button>`;
          }
          return `
          <div class="filter-dropdown" data-filter-category="${cat.id}">
            <button type="button" class="filter-btn filter-btn--has-menu ${activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
              ${cat.icon} ${cat.name} <span aria-hidden="true">▾</span>
            </button>
            <ul class="filter-dropdown__menu">
              <li><a href="${menuUrl(cat.id)}" class="${activeCategory === cat.id && activeSubcategory === 'all' ? 'active' : ''}">Все — ${cat.name}</a></li>
              ${subs
                .map(
                  (sub) => `
                <li><a href="${menuUrl(cat.id, sub.id)}" class="${activeSubcategory === sub.id ? 'active' : ''}">
                  ${sub.icon ? sub.icon + ' ' : ''}${sub.name}
                </a></li>`
                )
                .join('')}
            </ul>
          </div>`;
        })
        .join('')}`;
  }

  function renderProducts() {
    let products =
      activeCategory === 'all'
        ? getProducts('all')
        : getProducts(activeCategory, activeSubcategory);

    if (searchQuery) {
      const searched = searchProducts(searchQuery);
      products = products.filter((p) => searched.some((s) => s.id === p.id));
    }

    if (maxPrice > 0) {
      products = products.filter((p) => Number(p.price) <= maxPrice);
    }

    products = [...products].sort((a, b) => {
      if (sortMode === 'price-asc') return (a.price || 0) - (b.price || 0);
      if (sortMode === 'price-desc') return (b.price || 0) - (a.price || 0);
      return getPopularityScore(b) - getPopularityScore(a);
    });

    if (products.length === 0) {
      const emptyHint =
        activeCategory === 'holidays'
          ? 'Праздничные торты скоро появятся в меню. Напишите нам — сделаем на заказ.'
          : 'Ничего не найдено. Попробуйте другой запрос или поднимите лимит цены.';
      grid.innerHTML = `<p class="no-results">${emptyHint}</p>`;
      return;
    }

    grid.innerHTML = products.map((product) => createProductCard(product)).join('');
    animateElements('#products-grid [data-animate]');
  }
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function renderToolbarDropdown(root, { label, options, value, onChange }) {
  if (!root) return;

  const current = options.find((o) => o.value === value) || options[0];
  root.dataset.value = current?.value ?? '';
  root.innerHTML = `
    <button type="button" class="toolbar-dropdown__trigger" aria-expanded="false" aria-haspopup="listbox" aria-label="${escapeAttr(label)}">
      <span class="toolbar-dropdown__value" data-toolbar-value>${escapeAttr(current?.label || '')}</span>
      <span class="toolbar-dropdown__arrow" aria-hidden="true">▾</span>
    </button>
    <ul class="toolbar-dropdown__menu" role="listbox">
      ${options
        .map(
          (opt) => `
        <li>
          <button type="button" class="toolbar-dropdown__option${opt.value === current?.value ? ' is-active' : ''}"
            role="option" data-value="${escapeAttr(opt.value)}" aria-selected="${opt.value === current?.value}">
            ${escapeAttr(opt.label)}
          </button>
        </li>`
        )
        .join('')}
    </ul>`;

  root._onToolbarChange = onChange;
}

function initToolbarDropdowns(container) {
  if (!container) return;

  container.querySelectorAll('[data-toolbar-dropdown]').forEach((dropdown) => {
    if (dropdown.dataset.bound) return;
    dropdown.dataset.bound = '1';

    let closeTimer;
    const trigger = dropdown.querySelector('.toolbar-dropdown__trigger');
    const valueEl = dropdown.querySelector('[data-toolbar-value]');

    const open = () => {
      clearTimeout(closeTimer);
      closeAllDropdowns();
      dropdown.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      dropdown.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdown.classList.contains('open')) close();
      else open();
    });

    if (canHoverFine()) {
      dropdown.addEventListener('mouseenter', open);
      dropdown.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(close, 120);
      });
    }

    dropdown.querySelectorAll('.toolbar-dropdown__option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = opt.dataset.value ?? '';
        dropdown.dataset.value = next;
        dropdown.querySelectorAll('.toolbar-dropdown__option').forEach((o) => {
          o.classList.toggle('is-active', o === opt);
          o.setAttribute('aria-selected', o === opt ? 'true' : 'false');
        });
        if (valueEl) valueEl.textContent = opt.textContent.trim();
        close();
        dropdown._onToolbarChange?.(next);
      });
    });
  });
}

function initFilterDropdowns(container, { onToggleClose } = {}) {
  container.querySelectorAll('.filter-dropdown').forEach((dropdown) => {
    if (dropdown.dataset.bound) return;
    dropdown.dataset.bound = '1';

    let timer;
    const trigger = dropdown.querySelector('.filter-btn');
    const catId = dropdown.dataset.filterCategory || trigger?.dataset.category || '';

    const open = () => {
      clearTimeout(timer);
      closeAllDropdowns();
      dropdown.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      dropdown.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    trigger?.setAttribute('aria-haspopup', 'true');
    trigger?.setAttribute('aria-expanded', 'false');

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropdown.classList.contains('open')) {
        close();
        trigger.blur();
        onToggleClose?.(catId);
      } else {
        open();
      }
    });

    if (canHoverFine()) {
      dropdown.addEventListener('mouseenter', open);
      dropdown.addEventListener('mouseleave', () => {
        timer = setTimeout(close, 120);
      });
    }
  });

  container.querySelectorAll('.filter-btn[data-category]').forEach((btn) => {
    if (btn.closest('.filter-dropdown')) return;
    btn.addEventListener('click', () => {
      window.location.href = btn.dataset.category === 'all' ? 'menu.html' : menuUrl(btn.dataset.category);
    });
  });
}

export function renderProductCards(container, products) {
  if (!container) return;
  container.innerHTML = products.map((p) => createProductCard(p)).join('');
  bindProductCardActions(container);
}

function renderProductCardActions(productId, filling, fillings) {
  const resolvedFilling = filling || fillings[0] || '';
  const qty = getCartLineQuantity(productId, resolvedFilling);

  if (qty > 0) {
    const lineKey = getCartLineKey(productId, resolvedFilling);
    return `
      <div class="product-card__qty-row">
        <div class="qty-control product-card__qty" data-line-key="${escapeAttr(lineKey)}">
          <button type="button" class="qty-control__btn" data-card-qty-minus aria-label="Уменьшить количество">−</button>
          <span class="product-card__qty-value" data-card-qty>${qty}</span>
          <button type="button" class="qty-control__btn" data-card-qty-plus aria-label="Увеличить количество">+</button>
        </div>
        <button type="button" class="product-card__cart-link" data-open-cart aria-label="Открыть корзину">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
      </div>`;
  }

  return `<button type="button" class="btn btn--primary btn--small add-to-cart-btn" data-id="${productId}">В корзину</button>`;
}

function syncProductCardCartUI(card) {
  if (!card) return;
  const productId = Number(card.dataset.id);
  const product = getProducts().find((p) => p.id === productId);
  if (!product) return;

  const fillings = Array.isArray(product.fillings) ? product.fillings : [];
  const filling = getSelectedFilling(card, productId, fillings);
  const slot = card.querySelector('[data-card-actions]');
  if (!slot) return;

  slot.innerHTML = renderProductCardActions(productId, filling, fillings);
}

export function syncAllProductCardCartUI(root = document) {
  root.querySelectorAll('.product-card').forEach(syncProductCardCartUI);
}

export function initProductCardCartSync() {
  window.addEventListener('cart-updated', () => {
    syncAllProductCardCartUI();
  });
}

function createProductCard(product) {
  const cover = product.image || product.images?.[0] || '';
  const fillings = Array.isArray(product.fillings) ? product.fillings : [];
  const initialFilling = fillings[0] || '';
  const initialPrice = getPriceWithFilling(product.price, initialFilling);

  const specsHtml = [
    product.weight
      ? `<p class="product-card__spec"><span class="product-card__meta-label">Вес</span><span class="product-card__spec-value">${escapeAttr(product.weight)}</span></p>`
      : '',
    product.size
      ? `<p class="product-card__spec"><span class="product-card__meta-label">Размер</span><span class="product-card__spec-value">${escapeAttr(formatSizeDisplay(product.size))}</span></p>`
      : '',
    product.prepTime
      ? `<p class="product-card__spec"><span class="product-card__meta-label">Изготовление</span><span class="product-card__spec-value">${escapeAttr(product.prepTime)}</span></p>`
      : '',
    product.shelfLife
      ? `<p class="product-card__spec"><span class="product-card__meta-label">Хранение</span><span class="product-card__spec-value">${escapeAttr(product.shelfLife)}</span></p>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <article class="product-card" data-animate data-id="${product.id}" data-base-price="${product.price}">
      <a href="product.html?id=${product.id}" class="product-card__link">
        <div class="product-card__image-wrap">
          <img class="product-card__img" src="${cover}" alt="${escapeAttr(product.alt || product.name)}" loading="lazy" width="400" height="400">
        </div>
        <div class="product-card__body">
          <div class="product-card__category">${escapeHtml(getProductCategoryLabel(product))}</div>
          <h3 class="product-card__name">${escapeAttr(product.name)}</h3>
          <p class="product-card__price" data-price>${formatPrice(initialPrice)}</p>
          ${specsHtml}
        </div>
      </a>
      <div class="product-card__footer">
        ${renderFillingDropdown(product.id, fillings, initialFilling)}
        <div class="product-card__actions" data-card-actions data-product-id="${product.id}">
          ${renderProductCardActions(product.id, initialFilling, fillings)}
        </div>
      </div>
    </article>`;
}

const productCardActionRoots = new WeakSet();

function bindProductCardActions(container) {
  if (!container || productCardActionRoots.has(container)) return;
  productCardActionRoots.add(container);

  initFillingDropdowns(container, {
    onChange: (dropdown, filling) => {
      const card = dropdown.closest('.product-card');
      if (!card) return;
      const base = Number(card.dataset.basePrice) || 0;
      const priceEl = card.querySelector('[data-price]');
      if (priceEl) priceEl.textContent = formatPrice(getPriceWithFilling(base, filling));
      syncProductCardCartUI(card);
    },
  });

  container.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.add-to-cart-btn');
    if (addBtn && container.contains(addBtn)) {
      const id = Number(addBtn.dataset.id);
      const product = getProducts().find((p) => p.id === id);
      if (!product) return;

      const fillings = Array.isArray(product.fillings) ? product.fillings : [];
      const card = addBtn.closest('.product-card');
      const filling = getSelectedFilling(card, id, fillings);

      if (fillings.length > 1 && !filling) {
        card?.querySelector('.filling-dropdown__trigger')?.click();
        return;
      }

      addToCart(product, 1, { filling });
      return;
    }

    const minusBtn = e.target.closest('[data-card-qty-minus]');
    if (minusBtn && container.contains(minusBtn)) {
      const key = minusBtn.closest('[data-line-key]')?.dataset.lineKey;
      if (key) updateQuantity(key, -1);
      return;
    }

    const plusBtn = e.target.closest('[data-card-qty-plus]');
    if (plusBtn && container.contains(plusBtn)) {
      const row = plusBtn.closest('[data-line-key]');
      const key = row?.dataset.lineKey;
      const card = plusBtn.closest('.product-card');
      const productId = Number(card?.dataset.id);
      const product = getProducts().find((p) => p.id === productId);
      if (!product) return;

      const fillings = Array.isArray(product.fillings) ? product.fillings : [];
      const filling = getSelectedFilling(card, productId, fillings);

      if (key && getCartLineQuantity(productId, filling) > 0) {
        updateQuantity(key, 1);
      } else {
        addToCart(product, 1, { filling });
      }
      return;
    }

    const cartLink = e.target.closest('[data-open-cart]');
    if (cartLink && container.contains(cartLink)) {
      e.preventDefault();
      openCartModal();
    }
  });
}

export function renderCategories(container) {
  if (!container) return;
  const categories = getCategories();

  container.innerHTML = categories
    .map(
      (cat) => `
    <div class="category-card-wrap" data-animate>
      <a href="${menuUrl(cat.id)}" class="category-card">
        <img class="category-card__img" src="${cat.image}" alt="Категория ${cat.name}" loading="lazy" width="300" height="400">
        <div class="category-card__overlay">
          <span class="category-card__name">${cat.name}</span>
        </div>
      </a>
    </div>`
    )
    .join('');
}
