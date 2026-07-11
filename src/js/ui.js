import {
  getCart,
  getCartCount,
  getCartTotal,
  updateQuantity,
  removeFromCart,
  clearCart,
  formatPrice,
} from './cart.js';
import { getShopInfo } from './data.js';
import { animateCartBadge } from './animations.js';
import { buildOrderMessagePlain } from './order-message.js';
import { getMessengerList, MESSENGER_ICONS } from './messengers.js';

let cartModal;
let cartOverlay;
let cartView = 'items'; // 'items' | 'checkout'

export function initCart() {
  cartModal = document.getElementById('cart-modal');
  cartOverlay = document.getElementById('cart-overlay');
  const cartBtn = document.getElementById('cart-btn');
  const closeBtn = document.getElementById('cart-close');
  const checkoutBtn = document.getElementById('cart-checkout');

  if (cartBtn) cartBtn.addEventListener('click', openCart);
  if (closeBtn) closeBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (checkoutBtn) checkoutBtn.addEventListener('click', showCheckoutView);

  document.getElementById('cart-back')?.addEventListener('click', showItemsView);

  window.addEventListener('cart-updated', () => {
    if (cartView === 'items') renderCart();
    else renderCheckoutView();
  });

  updateCartBadge();
}

function openCart() {
  cartView = 'items';
  renderCart();
  updateCartUI();
  cartModal?.classList.add('active');
  cartOverlay?.classList.add('active');
  document.body.classList.add('no-scroll');
}

function closeCart() {
  cartView = 'items';
  cartModal?.classList.remove('active');
  cartOverlay?.classList.remove('active');
  document.body.classList.remove('no-scroll');
}

function updateCartUI() {
  const title = document.getElementById('cart-title');
  const footer = document.getElementById('cart-footer-items');
  const checkoutPanel = document.getElementById('cart-footer-checkout');

  if (title) {
    title.textContent = cartView === 'checkout' ? 'Оформление заказа' : 'Корзина';
  }
  footer?.classList.toggle('hidden', cartView !== 'items');
  checkoutPanel?.classList.toggle('hidden', cartView !== 'checkout');
}

function showCheckoutView() {
  const cart = getCart();
  if (cart.length === 0) return;
  cartView = 'checkout';
  renderCheckoutView();
  updateCartUI();
}

function showItemsView() {
  cartView = 'items';
  renderCart();
  updateCartUI();
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
    <div class="cart-item" data-id="${item.id}">
      <img class="cart-item__img" src="${item.image}" alt="${item.alt || item.name}" loading="lazy" width="72" height="72">
      <div class="cart-item__info">
        <div class="cart-item__name">${item.name}</div>
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
    const id = Number(el.dataset.id);
    el.querySelector('[data-action="decrease"]')?.addEventListener('click', () => updateQuantity(id, -1));
    el.querySelector('[data-action="increase"]')?.addEventListener('click', () => updateQuantity(id, 1));
    el.querySelector('[data-action="remove"]')?.addEventListener('click', () => removeFromCart(id));
  });

  if (totalEl) totalEl.textContent = formatPrice(getCartTotal(cart));
}

function getCheckoutExtras() {
  return {
    name: document.getElementById('checkout-name')?.value || '',
    phone: document.getElementById('checkout-phone')?.value || '',
    comment: document.getElementById('checkout-comment')?.value || '',
  };
}

function renderCheckoutView() {
  updateCartBadge();

  const body = document.getElementById('cart-body');
  const totalEl = document.getElementById('cart-checkout-total');
  if (!body) return;

  const cart = getCart();
  if (cart.length === 0) {
    showItemsView();
    return;
  }

  const extras = getCheckoutExtras();
  const total = getCartTotal(cart);

  if (totalEl) totalEl.textContent = formatPrice(total);

  body.innerHTML = `
    <div class="cart-checkout">
      <p class="cart-checkout__lead">Проверьте заказ и выберите удобный мессенджер — сообщение сформируется автоматически.</p>

      <div class="cart-checkout__preview">
        <div class="cart-checkout__preview-header">
          <span>Текст сообщения</span>
          <button type="button" class="cart-checkout__copy" id="copy-order-message" aria-label="Скопировать текст заказа">
            Копировать
          </button>
        </div>
        <pre class="cart-checkout__message" id="order-message-preview"></pre>
      </div>

      <div class="cart-checkout__fields">
        <div class="form-group">
          <label for="checkout-name">Ваше имя <span class="optional">(необязательно)</span></label>
          <input type="text" id="checkout-name" placeholder="Как к вам обращаться?" value="${escapeAttr(extras.name)}">
        </div>
        <div class="form-group">
          <label for="checkout-phone">Телефон <span class="optional">(необязательно)</span></label>
          <input type="tel" id="checkout-phone" placeholder="+7 (999) 000-00-00" value="${escapeAttr(extras.phone)}">
        </div>
        <div class="form-group">
          <label for="checkout-comment">Комментарий <span class="optional">(необязательно)</span></label>
          <textarea id="checkout-comment" placeholder="Время доставки, пожелания..." rows="2">${escapeHtml(extras.comment)}</textarea>
        </div>
      </div>

      <div class="cart-checkout__messengers">
        <p class="cart-checkout__messengers-title">Отправить заказ через:</p>
        <div class="messenger-buttons" id="messenger-buttons"></div>
      </div>
    </div>`;

  updateCheckoutPreview();

  ['checkout-name', 'checkout-phone', 'checkout-comment'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateCheckoutPreview);
  });

  document.getElementById('copy-order-message')?.addEventListener('click', () => {
    const text = buildOrderMessagePlain(getCart(), getCheckoutExtras());
    navigator.clipboard?.writeText(text).then(() => {
      const btn = document.getElementById('copy-order-message');
      if (btn) {
        btn.textContent = 'Скопировано ✓';
        setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
      }
    });
  });
}

function updateCheckoutPreview() {
  const cart = getCart();
  const extras = getCheckoutExtras();
  const message = buildOrderMessagePlain(cart, extras);
  const messengers = getMessengerList(message);

  const preview = document.getElementById('order-message-preview');
  if (preview) preview.textContent = message;

  const container = document.getElementById('messenger-buttons');
  if (!container) return;

  container.innerHTML = messengers
    .map(
      (m) => `
    <a
      href="${m.url}"
      class="messenger-btn messenger-btn--${m.id}"
      data-messenger="${m.id}"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="messenger-btn__icon">${MESSENGER_ICONS[m.id]}</span>
      <span class="messenger-btn__text">
        <span class="messenger-btn__label">${m.label}</span>
        <span class="messenger-btn__hint">${m.hint}</span>
      </span>
      <span class="messenger-btn__arrow" aria-hidden="true">→</span>
    </a>`
    )
    .join('');

  container.querySelectorAll('.messenger-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTimeout(() => {
        clearCart();
        closeCart();
      }, 300);
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
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
