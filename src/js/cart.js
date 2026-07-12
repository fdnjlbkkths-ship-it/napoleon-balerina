import { getFillingExtra, getPriceWithFilling } from './fillings.js';

const CART_KEY = 'napoleon-balerina-cart';
/** Корзина живёт ~30 минут с последнего изменения */
export const CART_TTL_MS = 30 * 60 * 1000;
const CART_EXPIRED_FLAG = 'napoleon-balerina-cart-expired';

export function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY));
    if (!raw) return [];

    // Legacy: plain array
    if (Array.isArray(raw)) {
      saveCart(raw);
      return raw;
    }

    const items = Array.isArray(raw.items) ? raw.items : [];
    const updatedAt = Number(raw.updatedAt) || 0;
    if (!items.length) return [];

    if (Date.now() - updatedAt > CART_TTL_MS) {
      localStorage.removeItem(CART_KEY);
      sessionStorage.setItem(CART_EXPIRED_FLAG, '1');
      window.dispatchEvent(new CustomEvent('cart-updated', { detail: [] }));
      return [];
    }

    return items;
  } catch {
    return [];
  }
}

/** True if cart was cleared due to 30‑min expiry (consumes the flag). */
export function consumeCartExpiredFlag() {
  const flag = sessionStorage.getItem(CART_EXPIRED_FLAG);
  if (!flag) return false;
  sessionStorage.removeItem(CART_EXPIRED_FLAG);
  return true;
}

export function getCartMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY));
    if (!raw || Array.isArray(raw)) {
      return { updatedAt: Date.now(), expiresAt: Date.now() + CART_TTL_MS };
    }
    const updatedAt = Number(raw.updatedAt) || Date.now();
    return { updatedAt, expiresAt: updatedAt + CART_TTL_MS };
  } catch {
    return { updatedAt: Date.now(), expiresAt: Date.now() + CART_TTL_MS };
  }
}

function saveCart(cart) {
  localStorage.setItem(
    CART_KEY,
    JSON.stringify({
      items: cart,
      updatedAt: Date.now(),
    })
  );
  sessionStorage.removeItem(CART_EXPIRED_FLAG);
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: cart }));
}

function lineKey(productId, filling = '') {
  return `${productId}::${filling || ''}`;
}

export function getCartLineKey(productId, filling = '') {
  return lineKey(productId, filling);
}

export function getCartLineQuantity(productId, filling = '') {
  const cart = getCart();
  const key = lineKey(productId, filling);
  const item = cart.find(
    (i) => i.key === key || (!i.key && !filling && i.id === productId)
  );
  return item?.quantity || 0;
}

/**
 * @param {object} product
 * @param {number} quantity
 * @param {{ filling?: string }} [options]
 */
export function addToCart(product, quantity = 1, options = {}) {
  const cart = getCart();
  const filling = options.filling || '';
  const key = lineKey(product.id, filling);
  const fillingExtra = getFillingExtra(filling);
  const price = getPriceWithFilling(product.price, filling);
  const existing = cart.find((item) => item.key === key || (!item.key && !filling && item.id === product.id));

  if (existing) {
    existing.quantity += quantity;
    if (!existing.key) existing.key = key;
    if (filling) existing.filling = filling;
    existing.fillingExtra = fillingExtra;
    existing.price = price;
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      filling,
      fillingExtra,
      price,
      image: product.image || product.images?.[0] || '',
      alt: product.alt,
      quantity,
    });
  }

  saveCart(cart);
}

function findCartItem(cart, idOrKey) {
  const key = String(idOrKey);
  return (
    cart.find((i) => i.key && i.key === key) ||
    cart.find((i) => !i.key && (i.id === idOrKey || String(i.id) === key))
  );
}

export function updateQuantity(idOrKey, delta) {
  const cart = getCart();
  const item = findCartItem(cart, idOrKey);

  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    removeFromCart(item.key || item.id);
    return;
  }

  saveCart(cart);
}

export function removeFromCart(idOrKey) {
  const key = String(idOrKey);
  const cart = getCart().filter((item) => {
    if (item.key) return item.key !== key;
    return item.id !== idOrKey && String(item.id) !== key;
  });
  saveCart(cart);
}

export function clearCart() {
  saveCart([]);
}

export function getCartTotal(cart = getCart()) {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getCartCount(cart = getCart()) {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatCartItemName(item) {
  if (!item.filling) return item.name;
  const extra = item.fillingExtra || getFillingExtra(item.filling);
  return extra
    ? `${item.name} (${item.filling}, +${extra} ₽)`
    : `${item.name} (${item.filling})`;
}
