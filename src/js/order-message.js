import { getCartTotal, formatPrice } from './cart.js';
import { getShopInfo } from './data.js';

/**
 * Формирует текст заказа для отправки в мессенджер
 */
export function buildOrderMessage(cart, extras = {}) {
  const shop = getShopInfo();
  const total = getCartTotal(cart);
  const lines = [];

  lines.push(`🍰 *ЗАКАЗ — ${shop.name}*`);
  lines.push('');
  lines.push('📋 *Ваш заказ:*');
  lines.push('');

  cart.forEach((item, index) => {
    const sum = formatPrice(item.price * item.quantity);
    lines.push(`${index + 1}. ${item.name} × ${item.quantity} — ${sum}`);
  });

  lines.push('');
  lines.push('─────────────────');
  lines.push(`💰 *Итого: ${formatPrice(total)}*`);
  lines.push('');

  if (extras.name?.trim()) {
    lines.push(`👤 Имя: ${extras.name.trim()}`);
  }
  if (extras.phone?.trim()) {
    lines.push(`📞 Телефон: ${extras.phone.trim()}`);
  }
  if (extras.comment?.trim()) {
    lines.push(`💬 Комментарий: ${extras.comment.trim()}`);
  }

  if (extras.name?.trim() || extras.phone?.trim() || extras.comment?.trim()) {
    lines.push('');
  }

  lines.push(`📍 ${shop.address}`);
  lines.push(`🕐 ${shop.hours}`);
  lines.push('');
  lines.push('Жду подтверждение заказа. Спасибо! 💝');

  return lines.join('\n');
}

/**
 * Версия без markdown-звёздочек (для WhatsApp / MAX)
 */
export function buildOrderMessagePlain(cart, extras = {}) {
  return buildOrderMessage(cart, extras).replace(/\*/g, '');
}
