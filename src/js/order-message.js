import { getCartTotal, formatPrice, formatCartItemName } from './cart.js';
import { getShopInfo } from './data.js';
import { SBP_PAYMENT } from './sbp-payment.js';

function formatDeliveryDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

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
    lines.push(`${index + 1}. ${formatCartItemName(item)} × ${item.quantity} — ${sum}`);
  });

  lines.push('');
  lines.push('─────────────────');
  lines.push(`💰 *Итого: ${formatPrice(total)}*`);
  lines.push(`💳 ${extras.paymentStatus || SBP_PAYMENT.paymentLine}`);
  lines.push('');

  if (extras.name?.trim()) lines.push(`👤 Имя: ${extras.name.trim()}`);
  if (extras.phone?.trim()) lines.push(`📞 Телефон: ${extras.phone.trim()}`);
  if (extras.email?.trim()) lines.push(`✉️ Email: ${extras.email.trim()}`);
  if (extras.address?.trim()) lines.push(`📍 Адрес: ${extras.address.trim()}`);
  if (extras.deliveryDate?.trim()) {
    lines.push(`📅 Дата доставки: ${formatDeliveryDate(extras.deliveryDate.trim())}`);
  }
  if (extras.deliveryTime?.trim()) {
    lines.push(`🕒 Время доставки: ${extras.deliveryTime.trim()}`);
  }
  if (extras.comment?.trim()) lines.push(`💬 Комментарий: ${extras.comment.trim()}`);

  if (
    extras.name ||
    extras.phone ||
    extras.email ||
    extras.address ||
    extras.deliveryDate ||
    extras.deliveryTime ||
    extras.comment
  ) {
    lines.push('');
  }

  lines.push('Жду подтверждение заказа. Спасибо! 💝');

  return lines.join('\n');
}

export function buildOrderMessagePlain(cart, extras = {}) {
  return buildOrderMessage(cart, extras).replace(/\*/g, '');
}
