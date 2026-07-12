import { getShopInfo } from './data.js';
import { getOrderApiUrl } from './order-api.js';

/**
 * Официальные бренд-иконки WhatsApp / Telegram / MAX.
 */
export const MESSENGER_ICONS = {
  whatsapp: `<svg class="messenger-icon" viewBox="0 0 175.216 175.552" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="waBrandGrad" x1="85.915" x2="86.535" y1="32.567" y2="137.092" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#57d163"/><stop offset="1" stop-color="#23b33a"/></linearGradient></defs><path fill="#fff" d="m12.966 161.238 10.439-38.114a73.42 73.42 0 0 1-9.821-36.772c.017-40.556 33.021-73.55 73.578-73.55 19.681.01 38.154 7.669 52.047 21.572s21.537 32.383 21.53 52.037c-.018 40.553-33.027 73.553-73.578 73.553h-.032c-12.313-.005-24.412-3.094-35.159-8.954z"/><path fill="url(#waBrandGrad)" d="M87.184 25.227c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.313-6.179 22.558 23.146-6.069 2.235 1.324c9.387 5.571 20.15 8.517 31.126 8.523h.023c33.707 0 61.14-27.426 61.153-61.135a60.75 60.75 0 0 0-17.895-43.251 60.75 60.75 0 0 0-43.235-17.928z"/><path fill="#fff" fill-rule="evenodd" d="M68.772 55.603c-1.378-3.061-2.828-3.123-4.137-3.176l-3.524-.043c-1.226 0-3.218.46-4.902 2.3s-6.435 6.287-6.435 15.332 6.588 17.785 7.506 19.013 12.718 20.381 31.405 27.75c15.529 6.124 18.689 4.906 22.061 4.6s10.877-4.447 12.408-8.74 1.532-7.971 1.073-8.74-1.685-1.226-3.525-2.146-10.877-5.367-12.562-5.981-2.91-.919-4.137.921-4.746 5.979-5.819 7.206-2.144 1.381-3.984.462-7.76-2.861-14.784-9.124c-5.465-4.873-9.154-10.891-10.228-12.73s-.114-2.835.808-3.751c.825-.824 1.838-2.147 2.759-3.22s1.224-1.84 1.836-3.065.307-2.301-.153-3.22-4.032-10.011-5.666-13.647"/></svg>`,

  telegram: `<svg class="messenger-icon" viewBox="0 0 240 240" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tgBrandGrad" x1="120" y1="240" x2="120" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1d93d2"/><stop offset="1" stop-color="#38b0e3"/></linearGradient></defs><circle cx="120" cy="120" r="120" fill="url(#tgBrandGrad)"/><path fill="#c8daea" d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6z"/><path fill="#a9c6d8" d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"/><path fill="#fff" d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043A8.13 8.13 0 0 1 146.1 172.5c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-1.907-.518z"/></svg>`,

  max: `<svg class="messenger-icon" viewBox="0 0 1000 1000" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="maxBrandGrad" x1="118" y1="761" x2="1000" y2="500" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00BFFF"/><stop offset="0.55" stop-color="#471AFF"/><stop offset="1" stop-color="#9500FF"/></linearGradient></defs><rect width="1000" height="1000" rx="250" fill="url(#maxBrandGrad)"/><path fill="#fff" fill-rule="evenodd" d="M508.211 878.328c-75.007 0-109.864-10.95-170.453-54.75-38.325 49.275-159.686 87.783-164.979 21.9 0-49.456-10.95-91.248-23.36-136.873-14.782-56.21-31.572-118.807-31.572-209.508 0-216.626 177.754-379.597 388.357-379.597 210.785 0 375.947 171.001 375.947 381.604.707 207.346-166.595 376.118-373.94 377.224m3.103-571.585c-102.564-5.292-182.499 65.7-200.201 177.024-14.6 92.162 11.315 204.398 33.397 210.238 10.585 2.555 37.23-18.98 53.837-35.587a189.8 189.8 0 0 0 92.71 33.032c106.273 5.112 197.08-75.794 204.215-181.95 4.154-106.382-77.67-196.486-183.958-202.574Z"/></svg>`,
};

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

function normalizeUsername(username) {
  return username.replace(/^@/, '');
}

/**
 * Deep link в личный чат магазина в Telegram (с опциональным текстом заказа).
 * @param {string} [message]
 * @returns {string}
 */
export function getTelegramChatUrl(message = '') {
  const shop = getShopInfo();
  const tgUser = shop.messengers?.telegram?.username
    ? normalizeUsername(shop.messengers.telegram.username)
    : '';
  if (!tgUser) return '';
  if (message) {
    return `https://t.me/${tgUser}?text=${encodeURIComponent(message)}`;
  }
  return `https://t.me/${tgUser}`;
}

/**
 * @param {string} message — текст заказа для deep-link
 * @param {{ forCheckout?: boolean }} [options]
 *   forCheckout: true — Telegram через бота (если настроен API), иначе личный чат
 */
export function getMessengerLinks(message, options = {}) {
  const { forCheckout = false } = options;
  const shop = getShopInfo();
  const messengers = shop.messengers || {};
  const encoded = encodeURIComponent(message);
  const links = {};

  if (messengers.whatsapp?.phone) {
    const phone = normalizePhone(messengers.whatsapp.phone);
    links.whatsapp = {
      id: 'whatsapp',
      label: messengers.whatsapp.label || 'WhatsApp',
      url: `https://wa.me/${phone}?text=${encoded}`,
      hint: 'Откроется чат с нами',
    };
  }

  const tgUser = messengers.telegram?.username
    ? normalizeUsername(messengers.telegram.username)
    : '';
  const orderApiUrl = getOrderApiUrl();
  const tgChatUrl = getTelegramChatUrl(forCheckout ? message : '');

  if (forCheckout && orderApiUrl) {
    links.telegram = {
      id: 'telegram',
      label: messengers.telegram?.label || 'Telegram',
      // Личный чат с текстом — для подтверждения клиентом; заказ уже уходит боту через API
      url: tgChatUrl || '#',
      viaBot: true,
      orderApiUrl,
      chatUrl: tgChatUrl,
      hint: tgUser ? `@${tgUser}` : 'Заказ уйдёт боту в Telegram',
    };
  } else if (tgUser) {
    links.telegram = {
      id: 'telegram',
      label: messengers.telegram.label || 'Telegram',
      url: forCheckout ? tgChatUrl : `https://t.me/${tgUser}`,
      hint: `@${tgUser}`,
    };
  }

  if (messengers.max) {
    const max = messengers.max;
    const chatUrl =
      max.chatUrl ||
      (max.username
        ? `https://max.ru/${normalizeUsername(max.username)}`
        : max.webUrl || 'https://web.max.ru/');

    links.max = {
      id: 'max',
      label: max.label || 'MAX',
      url: chatUrl,
      hint: 'Откроется чат в MAX',
      copyMessage: true,
    };
  }

  return links;
}

export function getMessengerList(message, options = {}) {
  const links = getMessengerLinks(message, options);
  return ['whatsapp', 'telegram', 'max']
    .filter((id) => links[id])
    .map((id) => links[id]);
}
