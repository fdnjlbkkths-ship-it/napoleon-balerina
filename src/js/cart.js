import { getFillingExtra, getPriceWithFilling } from './fillings.js';

const CART_KEY = 'napoleon-balerina-cart';

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: cart }));
}

function lineKey(productId, filling = '') {
  return `${productId}::${filling || ''}`;
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
