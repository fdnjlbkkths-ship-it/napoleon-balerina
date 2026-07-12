import {
  getCart,
  getCartTotal,
  clearCart,
  formatPrice,
  formatCartItemName,
  consumeCartExpiredFlag,
} from './cart.js';
import { getShopInfo } from './data.js';
import { MESSENGER_ICONS, getTelegramChatUrl, getMessengerLinks } from './messengers.js';
import { submitOrderToBot, OrderChallengeRequiredError, getOrderApiUrl } from './order-api.js';
import { initPhoneMask, getPhoneValue, isPhoneComplete } from './phone-mask.js';
import { isValidEmail, normalizeEmail } from './email-otp.js';
import { initAddressAutocomplete, getAddressValue } from './address-autocomplete.js';
import { initDeliveryPickers, renderDeliveryPickersHtml } from './datetime-picker.js';
import { SBP_PAYMENT, isSbpEnabled, isSbpLinkConfigured, getPaymentStatusLine } from './sbp-payment.js';
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

const DRAFT_KEY = 'napoleon-balerina-checkout-draft';
const STEPS = [
  { id: 1, label: 'Контакты' },
  { id: 2, label: 'Доставка' },
  { id: 3, label: 'Оплата' },
  { id: 4, label: 'Заказ оформлен' },
];

const CONFIRM_ICONS = {
  sbp: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#5C4033"/><path fill="#F5E6D3" d="M21.8 9.5 12 21.2h7.2l-1 9.3L28 18.8h-7.2l1-9.3z"/></svg>`,
  phone: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#E8D5C4"/><path fill="#5C4033" transform="translate(20 20) scale(1.15) translate(-12 -12)" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
  telegram: MESSENGER_ICONS.telegram,
  max: MESSENGER_ICONS.max,
};

let step = 1;
let orderResult = null; // { orderId, total, items, confirmChannel, extras }
let deliveryPickersApi = null;

function getProgressStepLabel(stepId) {
  if (stepId === 3 && !isSbpEnabled()) return 'Подтверждение';
  return STEPS.find((s) => s.id === stepId)?.label || '';
}

function formatOrderNumberDisplay(id) {
  const raw = String(id || '').trim();
  if (!raw) return '—';
  if (/^\d{8}$/.test(raw)) {
    return `№ ${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  if (/^NB-/i.test(raw)) {
    return `№ ${raw.replace(/^NB-/i, '').replace(/-/g, '·')}`;
  }
  return `№ ${raw}`;
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

function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDraft(partial) {
  const next = { ...loadDraft(), ...partial };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

function redirectEmptyCart(reason = 'empty') {
  if (reason === 'expired') {
    sessionStorage.setItem('napoleon-balerina-cart-expired', '1');
  }
  window.location.replace(`menu.html?cart=${reason}`);
}

function readFormExtras() {
  const draft = loadDraft();
  const phoneEl = document.getElementById('checkout-phone');
  const addressEl = document.getElementById('checkout-address');
  const emailRaw = (document.getElementById('checkout-email')?.value || draft.email || '').trim();
  const email = normalizeEmail(emailRaw);
  const date =
    document.getElementById('checkout-date')?.value ||
    deliveryPickersApi?.getValues?.().date ||
    draft.deliveryDate ||
    '';
  const time =
    document.getElementById('checkout-time')?.value ||
    deliveryPickersApi?.getValues?.().time ||
    draft.deliveryTime ||
    '';
  const fulfillmentRadio = document.querySelector('input[name="fulfillment"]:checked');
  const mode = fulfillmentRadio?.value || draft.mode || 'pickup';
  let address = draft.address || '';
  if (mode === 'delivery') {
    if (addressEl) {
      address = getAddressValue(addressEl);
    }
  } else {
    address = '';
  }

  return {
    name: (document.getElementById('checkout-name')?.value || draft.name || '').trim(),
    lastName: (document.getElementById('checkout-lastname')?.value || draft.lastName || '').trim(),
    phone: phoneEl ? getPhoneValue(phoneEl) : draft.phone || '',
    email: isValidEmail(email) ? email : '',
    emailToken: '',
    mode,
    address,
    deliveryDate: date,
    deliveryTime: time,
    comment: (document.getElementById('checkout-comment')?.value || draft.comment || '').trim(),
    paymentMethod: isSbpEnabled()
      ? document.querySelector('input[name="payment"]:checked')?.value ||
        draft.paymentMethod ||
        'sbp'
      : 'manager',
    paymentStatus: getPaymentStatusLine(),
    confirmChannel:
      document.querySelector('input[name="confirm-channel"]:checked')?.value ||
      draft.confirmChannel ||
      'phone',
    telegramUsername: (
      document.getElementById('checkout-telegram')?.value ||
      draft.telegramUsername ||
      ''
    ).trim(),
  };
}

function persistVisibleFields() {
  const draft = loadDraft();
  const fulfillmentRadio = document.querySelector('input[name="fulfillment"]:checked');
  const mode = fulfillmentRadio?.value || draft.mode || 'pickup';
  const addressEl = document.getElementById('checkout-address');
  const streetInput = addressEl?.querySelector('[data-address-street]');
  const houseInput = addressEl?.querySelector('[data-address-house]');
  const entranceInput = addressEl?.querySelector('[data-address-entrance]');
  const apartmentInput = addressEl?.querySelector('[data-address-apartment]');
  const street = streetInput?.value?.trim() || draft.addressStreet || '';
  const house = houseInput?.value?.trim() || draft.addressHouse || '';
  const entrance = entranceInput?.value?.trim() || draft.addressEntrance || '';
  const apartment = apartmentInput?.value?.trim() || draft.addressApartment || '';

  let address = draft.address || '';
  if (mode === 'delivery' && addressEl) {
    address = getAddressValue(addressEl);
  } else if (mode !== 'delivery') {
    address = '';
  }

  saveDraft({
    name: (document.getElementById('checkout-name')?.value || draft.name || '').trim(),
    lastName: (document.getElementById('checkout-lastname')?.value || draft.lastName || '').trim(),
    phone: document.getElementById('checkout-phone')
      ? getPhoneValue(document.getElementById('checkout-phone'))
      : draft.phone || '',
    email: document.getElementById('checkout-email')?.value?.trim() || draft.email || '',
    address,
    addressStreet: mode === 'delivery' ? street : '',
    addressHouse: mode === 'delivery' ? house : '',
    addressEntrance: mode === 'delivery' ? entrance : '',
    addressApartment: mode === 'delivery' ? apartment : '',
    deliveryDate:
      document.getElementById('checkout-date')?.value ||
      deliveryPickersApi?.getValues?.().date ||
      draft.deliveryDate ||
      '',
    deliveryTime:
      document.getElementById('checkout-time')?.value ||
      deliveryPickersApi?.getValues?.().time ||
      draft.deliveryTime ||
      '',
    comment: (document.getElementById('checkout-comment')?.value || draft.comment || '').trim(),
    mode,
    paymentMethod: isSbpEnabled() ? draft.paymentMethod || 'sbp' : 'manager',
    confirmChannel:
      document.querySelector('input[name="confirm-channel"]:checked')?.value ||
      draft.confirmChannel ||
      'phone',
    telegramUsername: (
      document.getElementById('checkout-telegram')?.value ||
      draft.telegramUsername ||
      ''
    ).trim(),
  });
}

function formatOrderDateTime(date = new Date()) {
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

function getConfirmChannelLabel(channel) {
  if (channel === 'telegram') return 'Telegram';
  if (channel === 'max') return 'Мессенджер Max';
  return 'Звонок по телефону';
}

function formatMessengerHandle(value, prefixAt = false) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!prefixAt) return raw;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

function getConfirmContactDetail(channel, extras = {}) {
  if (channel === 'telegram') {
    return formatMessengerHandle(extras.telegramUsername, true) || '—';
  }
  return extras.phone || '—';
}

const SUCCESS_ICONS = {
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
  box: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9 1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  delivery: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
  pickup: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
};

function renderSuccessTimeline(extras = {}) {
  const isDelivery = extras.mode === 'delivery';

  const prepTitle = isDelivery ? 'Подготовка к отправке' : 'Подготовка заказа';
  const prepText = isDelivery
    ? 'Ваш заказ будет собран и подготовлен к доставке'
    : 'Ваш заказ будет собран и подготовлен к выдаче';

  const finalTitle = isDelivery ? 'Доставка курьером' : 'Самовывоз';
  const finalText = isDelivery
    ? 'Заказ будет доставлен по указанному адресу'
    : 'Заберите заказ в кондитерской в выбранное время';

  return `
    <div class="checkout-success__next">
      <h2 class="checkout-success__next-title">Что дальше?</h2>
      <ol class="checkout-success__timeline">
      <li class="checkout-success__step">
        <span class="checkout-success__step-icon">${SUCCESS_ICONS.phone}</span>
        <span class="checkout-success__step-body">
          <strong>Менеджер свяжется с вами</strong>
          <small>Менеджер свяжется с вами для подтверждения заказа</small>
        </span>
      </li>
      <li class="checkout-success__step">
        <span class="checkout-success__step-icon">${SUCCESS_ICONS.box}</span>
        <span class="checkout-success__step-body">
          <strong>${escapeHtml(prepTitle)}</strong>
          <small>${escapeHtml(prepText)}</small>
        </span>
      </li>
      <li class="checkout-success__step">
        <span class="checkout-success__step-icon">${isDelivery ? SUCCESS_ICONS.delivery : SUCCESS_ICONS.pickup}</span>
        <span class="checkout-success__step-body">
          <strong>${escapeHtml(finalTitle)}</strong>
          <small>${escapeHtml(finalText)}</small>
        </span>
      </li>
    </ol>
    </div>`;
}

function renderSuccessFooter() {
  const shop = getShopInfo();
  const phone = shop.phone?.trim() || '';
  const telHref = phone ? `tel:${phone.replace(/\D/g, '')}` : '';
  const links = getMessengerLinks('');
  const tgUrl = links.telegram?.url || getTelegramChatUrl();
  const maxUrl = links.max?.url || '';

  const phoneLink = phone
    ? `<a class="checkout-success__contact checkout-success__contact--phone" href="${escapeAttr(telHref)}">
        <span class="checkout-success__contact-icon" aria-hidden="true">${SUCCESS_ICONS.phone}</span>
        <span class="checkout-success__contact-label">${escapeHtml(phone)}</span>
      </a>`
    : '';

  const tgLink = tgUrl
    ? `<a class="checkout-success__contact checkout-success__contact--telegram" href="${escapeAttr(tgUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram" title="Telegram">
        <span class="checkout-success__contact-icon" aria-hidden="true">${MESSENGER_ICONS.telegram}</span>
      </a>`
    : '';

  const maxLink = maxUrl
    ? `<a class="checkout-success__contact checkout-success__contact--max" href="${escapeAttr(maxUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Написать в MAX" title="MAX">
        <span class="checkout-success__contact-icon" aria-hidden="true">${MESSENGER_ICONS.max}</span>
      </a>`
    : '';

  const contacts = [phoneLink, tgLink, maxLink].filter(Boolean).join('');
  if (!contacts) {
    return `<div class="checkout-success__footer">
      <a class="btn btn--primary checkout-success__shop-btn" href="menu.html">Продолжить покупки</a>
    </div>`;
  }

  return `<div class="checkout-success__footer">
    <a class="btn btn--primary checkout-success__shop-btn" href="menu.html">Продолжить покупки</a>
    <div class="checkout-success__contacts" aria-label="Связаться с нами">${contacts}</div>
  </div>`;
}

function setFieldError(groupSel, inputSel, errorSel, message, show) {
  const group = document.querySelector(groupSel);
  const input = document.querySelector(inputSel);
  const error = document.querySelector(errorSel);
  group?.classList.toggle('is-invalid', show);
  input?.classList.toggle('is-invalid', show);
  if (show) input?.setAttribute('aria-invalid', 'true');
  else input?.removeAttribute('aria-invalid');
  if (error) {
    error.hidden = !show;
    if (message) error.textContent = message;
  }
  if (show) {
    (group || input)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input?.focus({ preventScroll: true }), 280);
  }
}

function validateStep1() {
  const name = document.getElementById('checkout-name')?.value?.trim() || '';
  const lastName = document.getElementById('checkout-lastname')?.value?.trim() || '';
  const phoneOk = isPhoneComplete(document.getElementById('checkout-phone'));
  const emailRaw = document.getElementById('checkout-email')?.value?.trim() || '';
  let ok = true;

  if (!name) {
    const nameInput = document.getElementById('checkout-name');
    nameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => nameInput?.focus({ preventScroll: true }), 280);
    ok = false;
  }

  if (!lastName) {
    const lastNameInput = document.getElementById('checkout-lastname');
    if (ok) {
      lastNameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => lastNameInput?.focus({ preventScroll: true }), 280);
    }
    ok = false;
  }

  if (!phoneOk) {
    setFieldError(
      '[data-checkout-phone-group]',
      '#checkout-phone',
      '#checkout-phone-error',
      'Укажите полный номер телефона',
      true
    );
    ok = false;
  } else {
    setFieldError('[data-checkout-phone-group]', '#checkout-phone', '#checkout-phone-error', '', false);
  }

  if (emailRaw && !isValidEmail(emailRaw)) {
    setFieldError(
      '[data-checkout-email-group]',
      '#checkout-email',
      '#checkout-email-error',
      'Укажите корректный email или оставьте поле пустым',
      true
    );
    ok = false;
  } else {
    setFieldError('[data-checkout-email-group]', '#checkout-email', '#checkout-email-error', '', false);
  }

  return ok;
}

function validateStep2() {
  const mode = document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup';
  const date = document.getElementById('checkout-date')?.value;
  const time = document.getElementById('checkout-time')?.value;
  if (!date || !time) {
    window.alert('Выберите дату и время получения заказа.');
    return false;
  }
  if (mode === 'delivery') {
    const addressEl = document.getElementById('checkout-address');
    const street = addressEl?.querySelector('[data-address-street]')?.value?.trim() || '';
    const house = addressEl?.querySelector('[data-address-house]')?.value?.trim() || '';
    if (!street || !house) {
      window.alert('Для доставки укажите улицу и номер дома.');
      return false;
    }
    const address = getAddressValue(addressEl);
    if (!address || address.length < 8) {
      window.alert('Для доставки укажите полный адрес.');
      return false;
    }
  }
  return true;
}

function renderProgress() {
  const el = document.getElementById('checkout-progress');
  if (!el) return;
  el.innerHTML = STEPS.map((s) => {
    const classes = ['checkout-progress__item'];
    // Completed stages light green; on success (step 4) mark all as done.
    if (s.id < step || step === 4) classes.push('is-done', 'is-complete');
    if (s.id === step) classes.push('is-current');
    return `
      <li class="${classes.join(' ')}">
        <span class="checkout-progress__num">${s.id}</span>
        <span class="checkout-progress__label">${escapeHtml(getProgressStepLabel(s.id))}</span>
      </li>`;
  }).join('');
}

function renderSummary() {
  const list = document.getElementById('checkout-summary-list');
  const totalEl = document.getElementById('checkout-summary-total');
  const cart = step === 4 && orderResult?.items ? orderResult.items : getCart();
  if (!list) return;

  list.innerHTML = cart
    .map(
      (item) => `
    <li class="checkout-summary__item">
      <img src="${escapeAttr(item.image)}" alt="" width="56" height="56" loading="lazy">
      <div>
        <div class="checkout-summary__name">${escapeHtml(formatCartItemName(item))}</div>
        <div class="checkout-summary__meta">${item.quantity} × ${escapeHtml(formatPrice(item.price))}</div>
      </div>
      <strong>${escapeHtml(formatPrice(item.price * item.quantity))}</strong>
    </li>`
    )
    .join('');

  if (totalEl) {
    totalEl.textContent = formatPrice(
      step === 4 && orderResult ? orderResult.total : getCartTotal(cart)
    );
  }
}

function renderStepPanel() {
  const panel = document.getElementById('checkout-panel');
  if (!panel) return;
  const draft = loadDraft();
  const shop = getShopInfo();

  if (step === 1) {
    panel.innerHTML = `
      <h1 class="checkout-panel__title">Контакты</h1>
      <p class="checkout-panel__lead">Как с вами связаться по заказу. Email необязателен — код подтверждения не нужен.</p>
      <div class="checkout-fields checkout-fields--contacts">
        <div class="form-group" data-checkout-name-group>
          <label for="checkout-name">Имя <span class="required-mark" aria-hidden="true">*</span></label>
          <input type="text" id="checkout-name" autocomplete="given-name" placeholder="Анна" value="${escapeAttr(draft.name || '')}" required>
        </div>
        <div class="form-group" data-checkout-lastname-group>
          <label for="checkout-lastname">Фамилия <span class="required-mark" aria-hidden="true">*</span></label>
          <input type="text" id="checkout-lastname" autocomplete="family-name" placeholder="Иванова" value="${escapeAttr(draft.lastName || '')}" required>
        </div>
        <div class="form-group" data-checkout-phone-group>
          <label for="checkout-phone">Телефон <span class="required-mark" aria-hidden="true">*</span></label>
          <input type="tel" id="checkout-phone" inputmode="numeric" autocomplete="tel" placeholder="+7 (9XX) XXX-XX-XX" value="${escapeAttr(draft.phone || '+7 (9')}" required>
          <span class="field-hint">Обязательно. Формат +7 (9XX) XXX-XX-XX</span>
          <span class="field-error" id="checkout-phone-error" hidden>Укажите полный номер телефона</span>
        </div>
        <div class="form-group" data-checkout-email-group>
          <label for="checkout-email">Email <span class="optional">(необязательно)</span></label>
          <input type="email" id="checkout-email" autocomplete="email" placeholder="anna@mail.ru" value="${escapeAttr(draft.email || '')}">
          <span class="field-hint">Если укажете — сможем прислать детали заказа</span>
          <span class="field-error" id="checkout-email-error" hidden></span>
        </div>
      </div>
      <div class="checkout-actions">
        <a class="btn btn--ghost" href="menu.html">← В меню</a>
        <button type="button" class="btn btn--primary" data-checkout-next>Далее</button>
      </div>`;
    const phoneInput = document.getElementById('checkout-phone');
    initPhoneMask(phoneInput);
    const clearValidPhoneError = () => {
      if (isPhoneComplete(phoneInput)) {
        setFieldError('[data-checkout-phone-group]', '#checkout-phone', '#checkout-phone-error', '', false);
      }
    };
    clearValidPhoneError();
    phoneInput?.addEventListener('input', clearValidPhoneError);
    phoneInput?.addEventListener('change', clearValidPhoneError);
    phoneInput?.addEventListener('blur', clearValidPhoneError);
  } else if (step === 2) {
    const mode = draft.mode || 'pickup';
    panel.innerHTML = `
      <h1 class="checkout-panel__title">Получение</h1>
      <p class="checkout-panel__lead">Самовывоз по адресу ${escapeHtml(shop.address || 'Лесная улица, 7')} или доставка по Чебоксарам. Учитываем ~12 часов на приготовление.</p>
      <div class="checkout-fulfillment" role="radiogroup" aria-label="Способ получения">
        <label class="checkout-fulfillment__option">
          <input type="radio" name="fulfillment" value="pickup" ${mode === 'pickup' ? 'checked' : ''}>
          <span>
            <strong>Самовывоз</strong>
            <small>${escapeHtml(shop.address || 'Лесная улица, 7')}</small>
          </span>
        </label>
        <label class="checkout-fulfillment__option">
          <input type="radio" name="fulfillment" value="delivery" ${mode === 'delivery' ? 'checked' : ''}>
          <span>
            <strong>Доставка</strong>
            <small>По Чебоксарам — укажите адрес доставки</small>
          </span>
        </label>
      </div>
      <div
        class="checkout-delivery-address${mode === 'delivery' ? ' is-visible' : ''}"
        data-delivery-address
        aria-hidden="${mode === 'delivery' ? 'false' : 'true'}"
      >
        <div class="form-group">
          <label>Адрес доставки</label>
          <div id="checkout-address" class="address-field">
            <div class="address-field__row address-field__row--city">
              <span class="address-field__label">Город</span>
              <input type="text" data-address-city value="Чебоксары" readonly class="address-field__city">
            </div>
            <div class="address-field__inline">
              <div class="address-field__cell address-field__cell--street autocomplete-wrap">
                <span class="address-field__label">Улица</span>
                <input type="text" data-address-street placeholder="Начните вводить улицу..." autocomplete="off" value="${escapeAttr(draft.addressStreet || '')}">
                <ul class="autocomplete" data-address-suggestions></ul>
              </div>
              <div class="address-field__cell address-field__cell--short">
                <span class="address-field__label">Дом</span>
                <input type="text" data-address-house inputmode="numeric" maxlength="4" placeholder="10" value="${escapeAttr(draft.addressHouse || '')}">
              </div>
              <div class="address-field__cell address-field__cell--short">
                <span class="address-field__label">Подъезд</span>
                <input type="text" data-address-entrance inputmode="numeric" maxlength="3" placeholder="1" value="${escapeAttr(draft.addressEntrance || '')}">
              </div>
              <div class="address-field__cell address-field__cell--short">
                <span class="address-field__label">Кв.</span>
                <input type="text" data-address-apartment inputmode="numeric" maxlength="4" placeholder="25" value="${escapeAttr(draft.addressApartment || '')}">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Дата и время</label>
        ${renderDeliveryPickersHtml({
          dateLabel: 'Дата получения',
          timeLabel: 'Время получения',
        })}
      </div>
      <div class="form-group">
        <label for="checkout-comment">Комментарий <span class="optional">(необязательно)</span></label>
        <textarea id="checkout-comment" rows="2" placeholder="Пожелания к заказу...">${escapeHtml(draft.comment || '')}</textarea>
      </div>
      <div class="checkout-actions">
        <button type="button" class="btn btn--ghost" data-checkout-back>← Назад</button>
        <button type="button" class="btn btn--primary" data-checkout-next>Далее</button>
      </div>`;

    deliveryPickersApi = initDeliveryPickers(document.getElementById('delivery-pickers'));
    initAddressAutocomplete(document.getElementById('checkout-address'));

    const syncMode = () => {
      const m = document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup';
      const box = document.querySelector('[data-delivery-address]');
      if (box) {
        const isDelivery = m === 'delivery';
        box.classList.toggle('is-visible', isDelivery);
        box.setAttribute('aria-hidden', isDelivery ? 'false' : 'true');
      }
      saveDraft({ mode: m });
    };
    document.querySelectorAll('input[name="fulfillment"]').forEach((el) => {
      el.addEventListener('change', syncMode);
    });
    syncMode();
  } else if (step === 3) {
    const channel = draft.confirmChannel || 'phone';
    const sbpBlock = isSbpEnabled()
      ? `
      <p class="checkout-panel__sub">Способ оплаты</p>
      <div class="checkout-choice" role="radiogroup" aria-label="Способ оплаты">
        <label class="checkout-choice__option">
          <input type="radio" name="payment" value="sbp" checked>
          <span class="checkout-choice__icon" aria-hidden="true">${CONFIRM_ICONS.sbp}</span>
          <span class="checkout-choice__body">
            <strong>Оплата по СБП</strong>
            <small>Перевод через Систему быстрых платежей после оформления. Сумма: ${escapeHtml(formatPrice(getCartTotal()))}. Чек сформируется в «Мой налог».</small>
          </span>
        </label>
      </div>
      ${
        isSbpLinkConfigured()
          ? `<p class="checkout-choice__hint">${escapeHtml(SBP_PAYMENT.qrNote)}</p>`
          : '<p class="checkout-pay-card__setup">Ссылка СБП пока не настроена — после заказа кнопка оплаты появится, когда подставите URL в sbp-payment.js.</p>'
      }`
      : '';

    panel.innerHTML = `
      <h1 class="checkout-panel__title">${isSbpEnabled() ? 'Оплата' : 'Подтверждение'}</h1>
      <p class="checkout-panel__lead">${
        isSbpEnabled()
          ? 'Выберите способ оплаты и как нам подтвердить заказ. После оформления — оплата по СБП.'
          : 'Выберите, как нам с вами связаться для подтверждения заказа. Оплату согласуем с менеджером.'
      }</p>

      ${sbpBlock}

      <p class="checkout-panel__sub">Подтверждение заказа</p>
      <div class="checkout-choice" role="radiogroup" aria-label="Подтверждение заказа">
        <label class="checkout-choice__option">
          <input type="radio" name="confirm-channel" value="phone" ${channel === 'phone' ? 'checked' : ''}>
          <span class="checkout-choice__icon" aria-hidden="true">${CONFIRM_ICONS.phone}</span>
          <span class="checkout-choice__body">
            <strong>Звонок по телефону</strong>
            <small>Мы перезвоним на номер, указанный в контактах</small>
          </span>
        </label>
        <label class="checkout-choice__option">
          <input type="radio" name="confirm-channel" value="telegram" ${channel === 'telegram' ? 'checked' : ''}>
          <span class="checkout-choice__icon" aria-hidden="true">${CONFIRM_ICONS.telegram}</span>
          <span class="checkout-choice__body">
            <strong>Telegram</strong>
            <small>Наш менеджер свяжется с вами в Telegram</small>
          </span>
        </label>
        <label class="checkout-choice__option">
          <input type="radio" name="confirm-channel" value="max" ${channel === 'max' ? 'checked' : ''}>
          <span class="checkout-choice__icon" aria-hidden="true">${CONFIRM_ICONS.max}</span>
          <span class="checkout-choice__body">
            <strong>Мессенджер Max</strong>
            <small>Свяжемся с вами в MAX по номеру телефона из контактов</small>
          </span>
        </label>
      </div>

      <div class="checkout-confirm-contact" data-confirm-contact="telegram" hidden>
        <div class="form-group">
          <label for="checkout-telegram">Ваш Telegram</label>
          <input type="text" id="checkout-telegram" autocomplete="off" placeholder="@username" value="${escapeAttr(draft.telegramUsername || '')}" required>
          <span class="field-hint">Укажите username, чтобы менеджер мог написать вам в Telegram</span>
        </div>
      </div>

      <p class="checkout-consent">
        Нажимая на кнопку «Оформить заказ», я принимаю условия
        <a href="#">публичной оферты</a>, подтверждаю ознакомление с
        <a href="privacy.html">политикой конфиденциальности</a>
        и даю согласие на обработку персональных данных.
      </p>

      <div class="cart-checkout__challenge" id="order-challenge" hidden>
        <p class="cart-checkout__challenge-text">
          Подтвердите, что вы человек — затем снова нажмите «Оформить заказ».
        </p>
        <div id="recaptcha-v2-container" class="cart-checkout__recaptcha"></div>
      </div>
      <div class="antibot-hp" aria-hidden="true">
        <label for="checkout-website">Сайт</label>
        <input type="text" id="checkout-website" name="website" data-antibot-honeypot tabindex="-1" autocomplete="off">
      </div>

      <div class="checkout-actions">
        <button type="button" class="btn btn--ghost" data-checkout-back>← Назад</button>
        <button type="button" class="btn btn--primary" data-checkout-submit>Оформить заказ</button>
      </div>`;

    bindConfirmChoices();
    panel.querySelector('[data-checkout-submit]')?.addEventListener('click', onSubmitOrder);
  } else {
    const total = orderResult?.total ?? 0;
    const orderId = orderResult?.orderId || '';
    const extras = orderResult?.extras || {};
    const channel = orderResult?.confirmChannel || extras.confirmChannel || 'phone';
    const channelLabel = getConfirmChannelLabel(channel);
    const contactDetail = getConfirmContactDetail(channel, extras);
    const orderedAt = formatOrderDateTime();

    panel.innerHTML = `
      <div class="checkout-success">
        <div class="checkout-success__hero">
          <div class="checkout-success__check" aria-hidden="true">${SUCCESS_ICONS.check}</div>
          <h1 class="checkout-success__title">Ваш заказ успешно оформлен!</h1>
          <p class="checkout-success__lead">
            Спасибо за покупку! Мы получили ваш заказ и в ближайшее время с вами свяжется наш менеджер.
          </p>
        </div>

        <dl class="checkout-success__meta">
          <div class="checkout-success__meta-row">
            <dt>Номер заказа:</dt>
            <dd><span class="checkout-success__order-id">${escapeHtml(formatOrderNumberDisplay(orderId))}</span></dd>
          </div>
          <div class="checkout-success__meta-row">
            <dt>Дата оформления:</dt>
            <dd>${escapeHtml(orderedAt)}</dd>
          </div>
          <div class="checkout-success__meta-row">
            <dt>Сумма заказа:</dt>
            <dd>${escapeHtml(formatPrice(total))}</dd>
          </div>
          <div class="checkout-success__meta-row">
            <dt>Подтверждение заказа:</dt>
            <dd>
              <span class="checkout-success__channel">${escapeHtml(channelLabel)}</span>
              <span class="checkout-success__contact">${escapeHtml(contactDetail)}</span>
            </dd>
          </div>
        </dl>

        ${renderSuccessTimeline({ ...extras, confirmChannel: channel })}

        ${
          isSbpLinkConfigured()
            ? `<div class="checkout-success__pay">
                <a class="btn btn--primary btn--full" href="${escapeAttr(SBP_PAYMENT.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(SBP_PAYMENT.buttonLabel)}</a>
                <p class="field-hint">${escapeHtml(SBP_PAYMENT.confirmHint)}</p>
              </div>`
            : ''
        }

        <div class="checkout-success__actions">
          ${renderSuccessFooter()}
        </div>
      </div>`;
  }

  panel.querySelector('[data-checkout-next]')?.addEventListener('click', onNext);
  panel.querySelector('[data-checkout-back]')?.addEventListener('click', onBack);
}

function bindConfirmChoices() {
  const syncContactFields = () => {
    const channel =
      document.querySelector('input[name="confirm-channel"]:checked')?.value || 'phone';
    document.querySelectorAll('[data-confirm-contact]').forEach((box) => {
      const show = box.getAttribute('data-confirm-contact') === channel;
      box.hidden = !show;
      box.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
  };

  document.querySelectorAll('input[name="confirm-channel"], input[name="payment"]').forEach((el) => {
    el.addEventListener('change', () => {
      persistVisibleFields();
      syncContactFields();
    });
  });

  document.getElementById('checkout-telegram')?.addEventListener('input', persistVisibleFields);

  syncContactFields();
}

async function onSubmitOrder(e) {
  const btn = e?.currentTarget;
  persistVisibleFields();
  const extras = readFormExtras();
  if (!extras.confirmChannel) {
    window.alert('Выберите способ подтверждения заказа.');
    return;
  }
  if (extras.confirmChannel === 'telegram' && !extras.telegramUsername?.trim()) {
    window.alert('Укажите ваш Telegram username.');
    document.getElementById('checkout-telegram')?.focus();
    return;
  }
  if (extras.mode === 'delivery' && !extras.address?.trim()) {
    window.alert('Для доставки укажите адрес на шаге «Доставка».');
    return;
  }

  const apiUrl = getOrderApiUrl();
  const cartSnapshot = getCart();
  const total = getCartTotal(cartSnapshot);

  btn?.classList.add('is-loading');
  btn?.setAttribute('disabled', 'true');

  try {
    if (apiUrl) {
      const data = await submitBotOrderWithAntiBot(apiUrl, extras);
      const result = {
        orderId: data?.orderId || '',
        total,
        items: cartSnapshot.map((item) => ({ ...item })),
        confirmChannel: extras.confirmChannel,
        extras,
      };
      finishOrder(result);
      return;
    }

    window.alert('Сервис оформления заказов временно недоступен. Попробуйте ещё раз позже.');
  } catch (err) {
    console.error(err);
    if (err instanceof OrderChallengeRequiredError) {
      await showOrderChallenge();
      window.alert('Пройдите проверку ниже и снова нажмите «Оформить заказ».');
    } else {
      window.alert(
        err?.message ||
          'Не удалось отправить заказ. Проверьте интернет и попробуйте ещё раз.'
      );
    }
  } finally {
    btn?.classList.remove('is-loading');
    btn?.removeAttribute('disabled');
  }
}

async function submitBotOrderWithAntiBot(apiUrl, extras) {
  const signals = getAntiBotSignals();
  let recaptchaV3Token = '';
  if (isRecaptchaConfigured()) {
    try {
      recaptchaV3Token = await getRecaptchaV3Token('order');
    } catch (err) {
      console.warn('reCAPTCHA v3', err);
    }
  }

  return submitOrderToBot(apiUrl, getCart(), {
    ...extras,
    website: signals.honeypot,
    startedAt: signals.startedAt,
    hasGestures: signals.hasGestures,
    gestureScore: signals.gestureScore,
    recaptchaV3Token,
    recaptchaV2Token: getRecaptchaV2Response(),
  });
}

async function showOrderChallenge() {
  const wrap = document.getElementById('order-challenge');
  const box = document.getElementById('recaptcha-v2-container');
  if (!wrap || !box) return;
  wrap.hidden = false;
  if (!isRecaptchaV2Configured()) {
    wrap.querySelector('.cart-checkout__challenge-text').textContent =
      'Подождите несколько секунд, подвигайте мышью и попробуйте снова.';
    return;
  }
  await mountRecaptchaV2(box);
}

function finishOrder({ orderId, total, items, confirmChannel, extras }) {
  orderResult = {
    orderId: orderId || '',
    total,
    items: (items || getCart()).map((item) => ({ ...item })),
    confirmChannel: confirmChannel || extras?.confirmChannel || 'phone',
    extras: extras || {},
  };
  step = 4;
  clearCart();
  clearDraft();
  endCheckoutSession();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onNext() {
  persistVisibleFields();
  if (step === 1) {
    if (!validateStep1()) return;
    step = 2;
  } else if (step === 2) {
    if (!validateStep2()) return;
    step = 3;
    if (isRecaptchaConfigured()) ensureRecaptchaV3().catch(() => {});
  }
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onBack() {
  persistVisibleFields();
  if (step > 1 && step < 4) {
    step -= 1;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderAll() {
  renderProgress();
  renderSummary();
  renderStepPanel();
  const summary = document.getElementById('checkout-summary');
  const layout = document.querySelector('.checkout__layout');
  const panel = document.getElementById('checkout-panel');
  summary?.classList.toggle('is-success', step === 4);
  layout?.classList.toggle('checkout__layout--success', step === 4);
  panel?.classList.toggle('checkout-panel--success', step === 4);
}

export function initCheckoutPage() {
  const root = document.getElementById('checkout-root');
  if (!root) return;

  if (consumeCartExpiredFlag()) {
    redirectEmptyCart('expired');
    return;
  }

  const cart = getCart();
  if (!cart.length && step !== 4) {
    redirectEmptyCart('empty');
    return;
  }

  beginCheckoutSession();
  if (isRecaptchaConfigured()) ensureRecaptchaV3().catch(() => {});

  step = 1;
  orderResult = null;
  renderAll();

  window.addEventListener('cart-updated', () => {
    if (step === 4 || orderResult) return;
    if (!getCart().length) {
      redirectEmptyCart('empty');
      return;
    }
    renderSummary();
  });
}
