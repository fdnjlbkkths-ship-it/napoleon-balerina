import { getCartTotal } from './cart.js';
import { getShopInfo } from './data.js';

export class OrderChallengeRequiredError extends Error {
  constructor(message = 'Требуется проверка') {
    super(message);
    this.name = 'OrderChallengeRequiredError';
    this.code = 'challenge_required';
  }
}

/**
 * Отправка заказа на Cloudflare Worker → Telegram-бот.
 * @param {string} apiUrl
 * @param {Array} cart
 * @param {object} extras — поля формы + anti-bot
 */
export async function submitOrderToBot(apiUrl, cart, extras = {}) {
  if (!apiUrl) {
    throw new Error('Order API URL is not configured');
  }

  const shop = getShopInfo();
  const payload = {
    items: cart.map((item) => ({
      id: item.id,
      name: item.filling ? `${item.name} (${item.filling})` : item.name,
      price: item.price,
      quantity: item.quantity,
    })),
    total: getCartTotal(cart),
    name: extras.name || '',
    phone: extras.phone || '',
    email: extras.email || '',
    emailToken: extras.emailToken || '',
    fulfillment: extras.mode || 'pickup',
    address: extras.mode === 'delivery' ? extras.address || '' : '',
    deliveryDate: extras.deliveryDate || '',
    deliveryTime: extras.deliveryTime || '',
    comment: extras.comment || '',
    shopName: shop.name || '',
    paymentMethod: extras.paymentMethod || 'sbp',
    paymentStatus: extras.paymentStatus || 'Оплата: ожидает (СБП)',
    // anti-bot
    website: extras.website || '',
    startedAt: extras.startedAt || 0,
    hasGestures: Boolean(extras.hasGestures),
    gestureScore: Number(extras.gestureScore) || 0,
    recaptchaV3Token: extras.recaptchaV3Token || '',
    recaptchaV2Token: extras.recaptchaV2Token || '',
  };

  const headers = { 'Content-Type': 'application/json' };
  const secret = import.meta.env.VITE_ORDER_SECRET;
  if (secret) headers['X-Order-Secret'] = secret;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (data?.error === 'challenge_required' || res.status === 428) {
    throw new OrderChallengeRequiredError(data?.message || 'Требуется проверка');
  }

  if (!res.ok) {
    const msg = data?.error || `Ошибка ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.error = data?.error || '';
    throw err;
  }

  return data;
}

export function getOrderApiUrl() {
  const fromEnv = import.meta.env.VITE_ORDER_API_URL;
  if (fromEnv) return String(fromEnv).trim();

  const shop = getShopInfo();
  return shop.messengers?.telegram?.botOrderUrl?.trim() || '';
}
