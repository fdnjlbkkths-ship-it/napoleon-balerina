import { getCategories, getProducts, getCategoryName, searchProducts, getReviews } from './data.js';
import { addToCart, formatPrice } from './cart.js';
import { animateElements } from './animations.js';

export function initMenuPage() {
  const grid = document.getElementById('products-grid');
  const filtersContainer = document.getElementById('category-filters');
  const searchInput = document.getElementById('product-search');

  if (!grid || !filtersContainer) return;

  let activeCategory = 'all';
  let searchQuery = '';

  const urlParams = new URLSearchParams(window.location.search);
  const urlCategory = urlParams.get('category');
  if (urlCategory) activeCategory = urlCategory;

  renderFilters();
  renderProducts();

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderProducts();
    });
  }

  function renderFilters() {
    const categories = getCategories();
    filtersContainer.innerHTML = `
      <button class="filter-btn ${activeCategory === 'all' ? 'active' : ''}" data-category="all">Все</button>
      ${categories
        .map(
          (cat) => `
        <button class="filter-btn ${activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
          ${cat.icon} ${cat.name}
        </button>`
        )
        .join('')}`;

    filtersContainer.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category;
        filtersContainer.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts();
      });
    });
  }

  function renderProducts() {
    let products =
      activeCategory === 'all' ? getProducts() : getProducts(activeCategory);

    if (searchQuery) {
      const searched = searchProducts(searchQuery);
      products = products.filter((p) => searched.some((s) => s.id === p.id));
    }

    if (products.length === 0) {
      grid.innerHTML = '<p class="no-results">Ничего не найдено. Попробуйте другой запрос.</p>';
      return;
    }

    grid.innerHTML = products.map((product) => createProductCard(product)).join('');
    bindAddToCartButtons(grid);
    animateElements('#products-grid [data-animate]');
  }
}

export function renderProductCards(container, products) {
  if (!container) return;
  container.innerHTML = products.map((p) => createProductCard(p)).join('');
  bindAddToCartButtons(container);
}

function createProductCard(product) {
  return `
    <article class="product-card" data-animate data-id="${product.id}">
      <div class="product-card__image-wrap">
        <img
          class="product-card__img"
          src="${product.image}"
          alt="${product.alt}"
          loading="lazy"
          width="400"
          height="300"
        >
      </div>
      <div class="product-card__body">
        <div class="product-card__category">${getCategoryName(product.category)}</div>
        <h3 class="product-card__name">${product.name}</h3>
        <p class="product-card__desc">${product.description}</p>
        <div class="product-card__footer">
          <span class="product-card__price">${formatPrice(product.price)}</span>
          <button class="btn btn--primary btn--small add-to-cart-btn" data-id="${product.id}">
            В корзину
          </button>
        </div>
      </div>
    </article>`;
}

function bindAddToCartButtons(container) {
  container.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const products = getProducts();
      const product = products.find((p) => p.id === id);
      if (product) {
        addToCart(product);
        btn.textContent = 'Добавлено ✓';
        setTimeout(() => {
          btn.textContent = 'В корзину';
        }, 1500);
      }
    });
  });
}

export function renderCategories(container) {
  if (!container) return;
  const categories = getCategories();

  container.innerHTML = categories
    .map(
      (cat) => `
    <a href="menu.html?category=${cat.id}" class="category-card" data-animate>
      <img class="category-card__img" src="${cat.image}" alt="Категория ${cat.name}" loading="lazy" width="300" height="400">
      <div class="category-card__overlay">
        <span class="category-card__icon">${cat.icon}</span>
        <span class="category-card__name">${cat.name}</span>
      </div>
    </a>`
    )
    .join('');
}

export function renderReviews(container) {
  if (!container) return;
  const reviews = getReviews();
  container.innerHTML = reviews
      .map(
        (r) => `
      <div class="review-card" data-animate>
        <div class="stars review-card__stars">${'★'.repeat(r.rating)}</div>
        <p class="review-card__text">«${r.text}»</p>
        <p class="review-card__author">— ${r.name}</p>
      </div>`
      )
      .join('');
}
