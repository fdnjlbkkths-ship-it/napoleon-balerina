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

export function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      alt: product.alt,
      quantity,
    });
  }

  saveCart(cart);
}

export function updateQuantity(id, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);

  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    removeFromCart(id);
    return;
  }

  saveCart(cart);
}

export function removeFromCart(id) {
  const cart = getCart().filter((item) => item.id !== id);
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
