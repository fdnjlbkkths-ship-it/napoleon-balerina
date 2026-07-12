import {
  getCart,
  getCartCount,
  getCartTotal,
  updateQuantity,
  removeFromCart,
  formatPrice,
} from './cart.js';
import { getShopInfo } from './data.js';
import { animateCartBadge } from './animations.js';
import { lockBodyScroll, unlockBodyScroll } from './pointer.js';
import { closeAllDropdowns } from './navigation.js';

let cartModal;
let cartOverlay;

export function openCartModal() {
  openCart();
}

export function initCart() {
  cartModal = document.getElementById('cart-modal');
  cartOverlay = document.getElementById('cart-overlay');
  const cartBtn = document.getElementById('cart-btn');
  const closeBtn = document.getElementById('cart-close');
  const checkoutBtn = document.getElementById('cart-checkout');

  if (cartBtn) cartBtn.addEventListener('click', openCart);
  if (closeBtn) closeBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      const cart = getCart();
      if (!cart.length) return;
      closeCart();
      window.location.href = 'checkout.html';
    });
  }

  window.addEventListener('cart-updated', () => {
    if (cartModal?.classList.contains('active')) renderCart();
    updateCartBadge();
  });

  updateCartBadge();
}

function openCart() {
  renderCart();
  closeAllDropdowns();
  cartModal?.classList.add('active');
  cartOverlay?.classList.add('active');
  lockBodyScroll();
}

function closeCart() {
  cartModal?.classList.remove('active');
  cartOverlay?.classList.remove('active');
  unlockBodyScroll();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  const count = getCartCount();
  badge.textContent = count;
  badge.dataset.count = count;
  if (count > 0) animateCartBadge(badge);
}

function renderCart() {
  updateCartBadge();

  const body = document.getElementById('cart-body');
  const totalEl = document.getElementById('cart-total-price');
  const checkoutBtn = document.getElementById('cart-checkout');
  if (!body) return;

  const cart = getCart();

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="cart-modal__empty">
        <span>🧁</span>
        <p>Корзина пуста</p>
        <p>Добавьте что-нибудь вкусное из нашего меню</p>
      </div>`;
    if (totalEl) totalEl.textContent = formatPrice(0);
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  if (checkoutBtn) checkoutBtn.disabled = false;

  body.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item" data-key="${item.key || item.id}">
      <img class="cart-item__img" src="${item.image}" alt="${item.alt || item.name}" loading="lazy" width="72" height="72">
      <div class="cart-item__info">
        <div class="cart-item__name">${item.name}</div>
        ${
          item.filling
            ? `<div class="cart-item__meta">Начинка: ${item.filling}${
                item.fillingExtra ? ` (+${item.fillingExtra} ₽)` : ''
              }</div>`
            : ''
        }
        <div class="cart-item__price">${formatPrice(item.price)}</div>
        <div class="cart-item__controls">
          <button class="cart-item__qty-btn" data-action="decrease" aria-label="Уменьшить количество">−</button>
          <span class="cart-item__qty">${item.quantity}</span>
          <button class="cart-item__qty-btn" data-action="increase" aria-label="Увеличить количество">+</button>
          <button class="cart-item__remove" data-action="remove">Удалить</button>
        </div>
      </div>
    </div>`
    )
    .join('');

  body.querySelectorAll('.cart-item').forEach((el) => {
    const key = el.dataset.key;
    el.querySelector('[data-action="decrease"]')?.addEventListener('click', () => updateQuantity(key, -1));
    el.querySelector('[data-action="increase"]')?.addEventListener('click', () => updateQuantity(key, 1));
    el.querySelector('[data-action="remove"]')?.addEventListener('click', () => removeFromCart(key));
  });

  if (totalEl) totalEl.textContent = formatPrice(getCartTotal(cart));
}

export function initContactForm(formId = 'contact-form') {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = form.querySelector('.form-message') || createMessageEl(form);
    const formData = new FormData(form);
    const shop = getShopInfo();

    const subject = encodeURIComponent(`Обратная связь: ${formData.get('name')}`);
    const body = encodeURIComponent(
      `Имя: ${formData.get('name')}\nEmail: ${formData.get('email')}\nТелефон: ${formData.get('phone') || '—'}\n\nСообщение:\n${formData.get('message')}`
    );

    window.location.href = `mailto:${shop.email}?subject=${subject}&body=${body}`;

    msgEl.className = 'form-message form-message--success';
    msgEl.textContent = 'Спасибо! Откроется почтовый клиент для отправки сообщения.';
    form.reset();
  });
}

function createMessageEl(form) {
  const el = document.createElement('div');
  el.className = 'form-message';
  form.appendChild(el);
  return el;
}
