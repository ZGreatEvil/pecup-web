// Stateless cart: serverless functions don't share memory between
// invocations, so the cart itself lives in a plain (unsigned — it holds
// nothing sensitive, just product ids and quantities) JSON cookie instead of
// a server-side session.
const { getProduct } = require('./queries');

const COOKIE_NAME = 'pecup_cart';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function parseCart(cookieValue) {
  if (!cookieValue) return {};
  try {
    const obj = JSON.parse(cookieValue);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const cleaned = {};
    for (const [key, qty] of Object.entries(obj)) {
      const id = Number(key);
      const n = Number(qty);
      if (Number.isFinite(id) && Number.isFinite(n) && n > 0) cleaned[String(id)] = n;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function serializeCart(cart) {
  return JSON.stringify(cart);
}

async function buildCartItems(cart) {
  const items = [];
  for (const [productId, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    const product = await getProduct(Number(productId));
    if (!product) continue;
    const cappedQty = Math.min(qty, Math.max(product.stock, 0) || qty);
    const subtotal = product.price * cappedQty;
    items.push({ product, qty: cappedQty, subtotal });
  }
  const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  return { items, subtotal };
}

function cartCount(cart) {
  return Object.values(cart).reduce((sum, qty) => sum + Number(qty), 0);
}

function addToCart(cart, productId, qty) {
  const key = String(productId);
  const current = Number(cart[key] || 0);
  cart[key] = current + Number(qty);
  return cart;
}

function setCartQty(cart, productId, qty) {
  const key = String(productId);
  if (qty <= 0) delete cart[key];
  else cart[key] = qty;
  return cart;
}

function removeFromCart(cart, productId) {
  delete cart[String(productId)];
  return cart;
}

function clearCart() {
  return {};
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  parseCart,
  serializeCart,
  buildCartItems,
  cartCount,
  addToCart,
  setCartQty,
  removeFromCart,
  clearCart,
};
