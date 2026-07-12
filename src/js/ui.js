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
import { submitOrderToBot, OrderChallengeRequiredError } from './order-api.js';
import { initPhoneMask, getPhoneValue } from './phone-mask.js';
import { initAddressAutocomplete, getAddressValue } from './address-autocomplete.js';
import { initDeliveryPickers, renderDeliveryPickersHtml } from './datetime-picker.js';
import { lockBodyScroll, unlockBodyScroll } from './pointer.js';
import { closeAllDropdowns } from './navigation.js';
import {
  beginCheckoutSession,
  endCheckoutSession,
  getAntiBotSignals,
  getRecaptchaV3Token,
  mountRecaptchaV2,
  getRecaptchaV2Response,
  isRecaptchaConfigured,
  isRecaptchaV2Configured,
  ensureRecaptchaV3,
} from './recaptcha.js';

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
  closeAllDropdowns();
  cartModal?.classList.add('active');
  cartOverlay?.classList.add('active');
  lockBodyScroll();
}

function closeCart() {
  endCheckoutSession();
  cartView = 'items';
  cartModal?.classList.remove('active');
  cartOverlay?.classList.remove('active');
  unlockBodyScroll();
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
  beginCheckoutSession();
  if (isRecaptchaConfigured()) {
    ensureRecaptchaV3().catch(() => {});
  }
  renderCheckoutView();
  updateCartUI();
}

function showItemsView() {
  endCheckoutSession();
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

function getCheckoutExtras() {
  const phoneEl = document.getElementById('checkout-phone');
  const addressEl = document.getElementById('checkout-address');
  return {
    name: document.getElementById('checkout-name')?.value || '',
    phone: phoneEl ? getPhoneValue(phoneEl) : '',
    address: getAddressValue(addressEl),
    deliveryDate: document.getElementById('checkout-date')?.value || '',
    deliveryTime: document.getElementById('checkout-time')?.value || '',
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
      <p class="cart-checkout__lead">Проверьте заказ и выберите мессенджер — сообщение сформируется автоматически.</p>

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
          <label for="checkout-name">Ваше имя</label>
          <input type="text" id="checkout-name" placeholder="Как к вам обращаться?" value="${escapeAttr(extras.name)}">
        </div>
        <div class="form-group">
          <label for="checkout-phone">Телефон</label>
          <input type="tel" id="checkout-phone" inputmode="numeric" autocomplete="tel" placeholder="+7 (9XX) XXX-XX-XX" value="${escapeAttr(extras.phone || '+7 (9')}">
          <span class="field-hint">Формат уже с +7 (9 — просто допишите номер</span>
        </div>
        <div class="form-group">
          <label>Адрес доставки</label>
          <div id="checkout-address" class="address-field">
            <div class="address-field__row">
              <span class="address-field__label">Город</span>
              <input type="text" data-address-city value="Чебоксары" readonly class="address-field__city">
            </div>
            <div class="address-field__row autocomplete-wrap">
              <span class="address-field__label">Улица</span>
              <input type="text" data-address-street placeholder="Начните вводить улицу..." autocomplete="off">
              <ul class="autocomplete" data-address-suggestions></ul>
            </div>
            <div class="address-field__row">
              <span class="address-field__label">Дом</span>
              <input type="text" data-address-house placeholder="д. 10, кв. 5">
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Дата и время доставки</label>
          ${renderDeliveryPickersHtml()}
        </div>
        <div class="form-group">
          <label for="checkout-comment">Комментарий <span class="optional">(необязательно)</span></label>
          <textarea id="checkout-comment" placeholder="Пожелания к заказу..." rows="2">${escapeHtml(extras.comment)}</textarea>
        </div>
      </div>

      <div class="cart-checkout__messengers">
        <p class="cart-checkout__messengers-title">Оформить заказ через</p>
        <div class="messenger-buttons" id="messenger-buttons"></div>
        <div class="cart-checkout__challenge" id="order-challenge" hidden>
          <p class="cart-checkout__challenge-text">
            Обнаружена подозрительная активность. Подтвердите, что вы человек — затем снова нажмите Telegram.
          </p>
          <div id="recaptcha-v2-container" class="cart-checkout__recaptcha"></div>
        </div>
        <!-- honeypot: leave empty -->
        <div class="antibot-hp" aria-hidden="true">
          <label for="checkout-website">Сайт</label>
          <input
            type="text"
            id="checkout-website"
            name="website"
            data-antibot-honeypot
            tabindex="-1"
            autocomplete="off"
          >
        </div>
      </div>
    </div>`;

  initPhoneMask(document.getElementById('checkout-phone'));
  initAddressAutocomplete(document.getElementById('checkout-address'));
  initDeliveryPickers(document.getElementById('delivery-pickers'), {
    onChange: updateCheckoutPreview,
  });

  updateCheckoutPreview();

  document.getElementById('checkout-name')?.addEventListener('input', updateCheckoutPreview);
  document.getElementById('checkout-phone')?.addEventListener('input', updateCheckoutPreview);
  document.getElementById('checkout-comment')?.addEventListener('input', updateCheckoutPreview);
  document.getElementById('checkout-address')?.addEventListener('address-change', updateCheckoutPreview);

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
  const messengers = getMessengerList(message, { forCheckout: true });

  const preview = document.getElementById('order-message-preview');
  if (preview) preview.textContent = message;

  const container = document.getElementById('messenger-buttons');
  if (!container) return;

  container.innerHTML = messengers
    .map(
      (m) => `
    <a
      href="${m.viaBot ? '#' : m.url}"
      class="messenger-btn messenger-btn--${m.id}"
      data-messenger="${m.id}"
      ${m.viaBot ? '' : 'target="_blank" rel="noopener noreferrer"'}
      aria-label="${m.label}"
      title="${
        m.viaBot
          ? 'Отправить заказ в Telegram'
          : m.id === 'max'
            ? 'Текст скопируется — вставьте в чат'
            : m.label
      }"
    >
      <span class="messenger-btn__icon">${MESSENGER_ICONS[m.id]}</span>
    </a>`
    )
    .join('');

  container.querySelectorAll('.messenger-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = btn.dataset.messenger;
      const messenger = messengers.find((m) => m.id === id);
      if (!messenger) return;

      if (messenger.viaBot) {
        e.preventDefault();
        btn.classList.add('is-loading');
        try {
          await submitBotOrderWithAntiBot(messenger.orderApiUrl);
          clearCart();
          closeCart();
          window.alert('Заказ отправлен в Telegram. Мы скоро свяжемся с вами!');
        } catch (err) {
          console.error(err);
          if (err instanceof OrderChallengeRequiredError) {
            await showOrderChallenge();
            window.alert(
              'Пройдите проверку ниже и снова нажмите кнопку Telegram.'
            );
          } else {
            window.alert(
              'Не удалось отправить заказ. Проверьте интернет или оформите через WhatsApp / MAX.'
            );
          }
        } finally {
          btn.classList.remove('is-loading');
        }
        return;
      }

      if (messenger.copyMessage) {
        e.preventDefault();
        const text = buildOrderMessagePlain(getCart(), getCheckoutExtras());
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* ignore */
        }
        window.open(messenger.url, '_blank', 'noopener,noreferrer');
      }

      setTimeout(() => {
        clearCart();
        closeCart();
      }, 400);
    });
  });
}

async function submitBotOrderWithAntiBot(apiUrl) {
  const signals = getAntiBotSignals();
  let recaptchaV3Token = '';
  if (isRecaptchaConfigured()) {
    try {
      recaptchaV3Token = await getRecaptchaV3Token('order');
    } catch (err) {
      console.warn('reCAPTCHA v3', err);
    }
  }

  const v2Token = getRecaptchaV2Response();

  return submitOrderToBot(apiUrl, getCart(), {
    ...getCheckoutExtras(),
    website: signals.honeypot,
    startedAt: signals.startedAt,
    hasGestures: signals.hasGestures,
    gestureScore: signals.gestureScore,
    recaptchaV3Token,
    recaptchaV2Token: v2Token,
  });
}

async function showOrderChallenge() {
  const wrap = document.getElementById('order-challenge');
  const box = document.getElementById('recaptcha-v2-container');
  if (!wrap || !box) return;

  wrap.hidden = false;

  if (!isRecaptchaV2Configured()) {
    wrap.querySelector('.cart-checkout__challenge-text').textContent =
      'Не удалось подтвердить заказ автоматически. Подождите несколько секунд, подвигайте мышью или коснитесь экрана и попробуйте снова. Либо оформите через WhatsApp / MAX.';
    return;
  }

  await mountRecaptchaV2(box);
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
