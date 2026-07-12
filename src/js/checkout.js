import {
  getCart,
  getCartTotal,
  clearCart,
  formatPrice,
  formatCartItemName,
  consumeCartExpiredFlag,
} from './cart.js';
import { getShopInfo } from './data.js';
import { buildOrderMessagePlain } from './order-message.js';
import { getMessengerLinks, MESSENGER_ICONS } from './messengers.js';
import { submitOrderToBot, OrderChallengeRequiredError, getOrderApiUrl } from './order-api.js';
import { initPhoneMask, getPhoneValue, isPhoneComplete } from './phone-mask.js';
import { isValidEmail, normalizeEmail } from './email-otp.js';
import { initAddressAutocomplete, getAddressValue } from './address-autocomplete.js';
import { initDeliveryPickers, renderDeliveryPickersHtml } from './datetime-picker.js';
import { SBP_PAYMENT, isSbpLinkConfigured } from './sbp-payment.js';
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
  { id: 2, label: 'Получение' },
  { id: 3, label: 'Оплата' },
  { id: 4, label: 'Готово' },
];

const CONFIRM_ICONS = {
  sbp: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#5C4033"/><path fill="#F5E6D3" d="M21.8 9.5 12 21.2h7.2l-1 9.3L28 18.8h-7.2l1-9.3z"/></svg>`,
  phone: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#E8D5C4"/><path fill="#5C4033" d="M14.2 11.8c.4-1 1.4-1.6 2.5-1.5l3 .3c.9.1 1.6.8 1.8 1.7l.7 3.1c.2.8-.1 1.6-.7 2.1l-1.5 1.2a14.6 14.6 0 0 0 6.2 6.2l1.2-1.5c.5-.6 1.3-.9 2.1-.7l3.1.7c.9.2 1.6.9 1.7 1.8l.3 3c.1 1.1-.5 2.1-1.5 2.5-2 .8-8.4 1-13.7-4.3S13.4 13.8 14.2 11.8z"/></svg>`,
  telegram: MESSENGER_ICONS.telegram,
  max: MESSENGER_ICONS.max,
};

let step = 1;
let orderResult = null; // { orderId, total, items }
let deliveryPickersApi = null;

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
  const mode =
    document.querySelector('input[name="fulfillment"]:checked')?.value ||
    draft.mode ||
    'pickup';
  let address = '';
  if (mode === 'delivery') {
    address = addressEl ? getAddressValue(addressEl) : draft.address || '';
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
    paymentMethod:
      document.querySelector('input[name="payment"]:checked')?.value ||
      draft.paymentMethod ||
      'sbp',
    paymentStatus: SBP_PAYMENT.paymentLine,
    confirmChannel:
      document.querySelector('input[name="confirm-channel"]:checked')?.value ||
      draft.confirmChannel ||
      'phone',
  };
}

function persistVisibleFields() {
  const draft = loadDraft();
  const mode =
    document.querySelector('input[name="fulfillment"]:checked')?.value || draft.mode || 'pickup';
  const addressEl = document.getElementById('checkout-address');
  const street = addressEl?.querySelector('[data-address-street]')?.value?.trim() || '';
  const house = addressEl?.querySelector('[data-address-house]')?.value?.trim() || '';
  const address = mode === 'delivery' && addressEl ? getAddressValue(addressEl) : '';

  saveDraft({
    name: (document.getElementById('checkout-name')?.value || draft.name || '').trim(),
    lastName: (document.getElementById('checkout-lastname')?.value || draft.lastName || '').trim(),
    phone: document.getElementById('checkout-phone')
      ? getPhoneValue(document.getElementById('checkout-phone'))
      : draft.phone || '',
    email: document.getElementById('checkout-email')?.value?.trim() || draft.email || '',
    address,
    addressStreet: mode === 'delivery' ? street : draft.addressStreet || '',
    addressHouse: mode === 'delivery' ? house : draft.addressHouse || '',
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
    paymentMethod:
      document.querySelector('input[name="payment"]:checked')?.value ||
      draft.paymentMethod ||
      'sbp',
    confirmChannel:
      document.querySelector('input[name="confirm-channel"]:checked')?.value ||
      draft.confirmChannel ||
      'phone',
  });
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
    const address = getAddressValue(document.getElementById('checkout-address'));
    if (!address || address.length < 8) {
      window.alert('Для доставки укажите улицу и дом.');
      return false;
    }
  }
  return true;
}

function renderProgress() {
  const el = document.getElementById('checkout-progress');
  if (!el) return;
  el.innerHTML = STEPS.map((s) => {
    const state = s.id < step ? 'is-done' : s.id === step ? 'is-current' : '';
    return `
      <li class="checkout-progress__item ${state}">
        <span class="checkout-progress__num">${s.id}</span>
        <span class="checkout-progress__label">${s.label}</span>
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
            <small>По Чебоксарам — укажите улицу и дом</small>
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
            <div class="address-field__row">
              <span class="address-field__label">Город</span>
              <input type="text" data-address-city value="Чебоксары" readonly class="address-field__city">
            </div>
            <div class="address-field__row autocomplete-wrap">
              <span class="address-field__label">Улица</span>
              <input type="text" data-address-street placeholder="Начните вводить улицу..." autocomplete="off" value="${escapeAttr(draft.addressStreet || '')}">
              <ul class="autocomplete" data-address-suggestions></ul>
            </div>
            <div class="address-field__row">
              <span class="address-field__label">Дом</span>
              <input type="text" data-address-house placeholder="д. 10, кв. 5" value="${escapeAttr(draft.addressHouse || '')}">
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
    const sbpReady = isSbpLinkConfigured();
    panel.innerHTML = `
      <h1 class="checkout-panel__title">Оплата</h1>
      <p class="checkout-panel__lead">Выберите способ оплаты и как нам подтвердить заказ. После оформления — оплата по СБП.</p>

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
        sbpReady
          ? `<p class="checkout-choice__hint">${escapeHtml(SBP_PAYMENT.qrNote)}</p>`
          : '<p class="checkout-pay-card__setup">Ссылка СБП пока не настроена — после заказа кнопка оплаты появится, когда подставите URL в sbp-payment.js.</p>'
      }

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
            <small>Подтвердим заказ в Telegram</small>
          </span>
        </label>
        <label class="checkout-choice__option">
          <input type="radio" name="confirm-channel" value="max" ${channel === 'max' ? 'checked' : ''}>
          <span class="checkout-choice__icon" aria-hidden="true">${CONFIRM_ICONS.max}</span>
          <span class="checkout-choice__body">
            <strong>Мессенджер Max</strong>
            <small>Свяжемся с вами в MAX</small>
          </span>
        </label>
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
    const shop = getShopInfo();
    const phone = shop.phone || '';
    const waPhone = shop.messengers?.whatsapp?.phone || phone;
    const waDigits = String(waPhone).replace(/\D/g, '');
    const waUrl = waDigits ? `https://wa.me/${waDigits}` : '#';
    const total = orderResult?.total ?? 0;
    const orderId = orderResult?.orderId || '';
    const sbpReady = isSbpLinkConfigured();

    panel.innerHTML = `
      <h1 class="checkout-panel__title">Заказ оформлен</h1>
      <p class="checkout-panel__lead">Спасибо! Мы получили заказ и скоро свяжемся с вами.</p>
      ${
        orderId
          ? `<p class="checkout-success__id">Номер заказа: <strong>${escapeHtml(orderId)}</strong></p>`
          : ''
      }
      <div class="checkout-pay-card">
        <div class="checkout-pay-card__row"><span>Сумма</span><strong>${escapeHtml(formatPrice(total))}</strong></div>
        <div class="checkout-pay-card__row"><span>Оплата</span><strong>ожидает (СБП)</strong></div>
      </div>
      <a class="btn btn--primary btn--full" href="${escapeAttr(SBP_PAYMENT.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(SBP_PAYMENT.buttonLabel)}</a>
      <p class="field-hint">${escapeHtml(SBP_PAYMENT.confirmHint)}</p>
      ${
        sbpReady
          ? ''
          : '<p class="checkout-pay-card__setup">Подставьте реальную ссылку СБП в src/js/sbp-payment.js → поле link.</p>'
      }
      <div class="checkout-success__contacts">
        ${phone ? `<a href="tel:${escapeAttr(phone.replace(/\s/g, ''))}">${escapeHtml(phone)}</a>` : ''}
        ${waDigits ? `<a href="${escapeAttr(waUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
      </div>
      <div class="checkout-actions">
        <a class="btn btn--ghost" href="menu.html">В меню</a>
        <a class="btn btn--primary" href="index.html">На главную</a>
      </div>`;
  }

  panel.querySelector('[data-checkout-next]')?.addEventListener('click', onNext);
  panel.querySelector('[data-checkout-back]')?.addEventListener('click', onBack);
}

function bindConfirmChoices() {
  document.querySelectorAll('input[name="confirm-channel"], input[name="payment"]').forEach((el) => {
    el.addEventListener('change', () => persistVisibleFields());
  });
}

async function onSubmitOrder(e) {
  const btn = e?.currentTarget;
  persistVisibleFields();
  const extras = readFormExtras();
  if (!extras.confirmChannel) {
    window.alert('Выберите способ подтверждения заказа.');
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
      finishOrder({ orderId: data?.orderId || '', total });
      return;
    }

    // Fallback without order API: open preferred messenger with order text
    const message = buildOrderMessagePlain(cartSnapshot, extras);
    const links = getMessengerLinks(message, { forCheckout: true });
    const channel = extras.confirmChannel;

    if (channel === 'telegram' && links.telegram && !links.telegram.viaBot) {
      window.open(links.telegram.url, '_blank', 'noopener,noreferrer');
    } else if (channel === 'max' && links.max) {
      try {
        await navigator.clipboard.writeText(message);
      } catch {
        /* ignore */
      }
      window.open(links.max.url, '_blank', 'noopener,noreferrer');
    } else if (channel === 'phone') {
      const shop = getShopInfo();
      if (shop.phone) {
        window.location.href = `tel:${String(shop.phone).replace(/\D/g, '')}`;
      }
    } else {
      window.alert(
        'API заказов не настроен. Напишите нам в Telegram или MAX и отправьте текст заказа вручную.'
      );
      return;
    }

    finishOrder({ orderId: '', total });
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

function finishOrder({ orderId, total }) {
  const items = getCart().map((item) => ({ ...item }));
  orderResult = { orderId, total, items };
  clearCart();
  clearDraft();
  endCheckoutSession();
  step = 4;
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
  summary?.classList.toggle('is-success', step === 4);
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
    if (step === 4) return;
    if (!getCart().length) {
      redirectEmptyCart('empty');
      return;
    }
    renderSummary();
  });
}
