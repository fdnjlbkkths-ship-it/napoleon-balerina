import { getCartTotal } from './cart.js';
import { getShopInfo } from './data.js';

/**
 * Отправка заказа на Cloudflare Worker → Telegram-бот.
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
    address: extras.address || '',
    deliveryDate: extras.deliveryDate || '',
    deliveryTime: extras.deliveryTime || '',
    comment: extras.comment || '',
    shopName: shop.name || '',
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

  if (!res.ok) {
    const msg = data?.error || `Ошибка ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export function getOrderApiUrl() {
  const fromEnv = import.meta.env.VITE_ORDER_API_URL;
  if (fromEnv) return String(fromEnv).trim();

  const shop = getShopInfo();
  return shop.messengers?.telegram?.botOrderUrl?.trim() || '';
}
