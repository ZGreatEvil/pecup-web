// Stateless cart: serverless functions don't share memory between
// invocations, so the cart itself lives in a plain (unsigned — it holds
// nothing sensitive, just product ids and quantities) JSON cookie instead of
// a server-side session.
//
// Each entry is keyed by a composite key so that the same base product with
// different fruit-mix compositions (e.g. "Mangga+Semangka" vs
// "Mangga+Nanas+Melon") lands in separate cart lines instead of merging.
const { getProductsByIds } = require('./queries');

const COOKIE_NAME = 'pecup_cart';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function normalizeFruits(fruits) {
  if (!Array.isArray(fruits)) return [];
  const ids = fruits.map((f) => Number(f)).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function makeKey(productId, fruits) {
  const id = Number(productId);
  const f = normalizeFruits(fruits);
  return f.length ? `${id}:${f.join(',')}` : String(id);
}

function parseCart(cookieValue) {
  if (!cookieValue) return {};
  try {
    const obj = JSON.parse(cookieValue);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      // Backward compatible with the old { [productId]: qty } cookie shape.
      if (typeof value === 'number') {
        const id = Number(key);
        if (Number.isFinite(id) && Number.isFinite(value) && value > 0) {
          cleaned[String(id)] = { productId: id, qty: value };
        }
        continue;
      }
      if (!value || typeof value !== 'object') continue;
      const productId = Number(value.productId);
      const qty = Number(value.qty);
      if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty <= 0) continue;
      const fruits = normalizeFruits(value.fruits);
      const canonicalKey = makeKey(productId, fruits);
      cleaned[canonicalKey] = fruits.length ? { productId, qty, fruits } : { productId, qty };
    }
    return cleaned;
  } catch {
    return {};
  }
}

function serializeCart(cart) {
  return JSON.stringify(cart);
}

// Wholesale ("grosir"): once a single cart line reaches the product's
// wholesale_min_qty, every unit on that line drops to wholesale_price. This
// mirrors the same rule inside create_order (schema.sql) — the database is
// the authority at checkout, this is just what the shopper is shown.
function unitPriceFor(product, qty) {
  const minQty = Number(product.wholesale_min_qty) || 0;
  const wholesalePrice = product.wholesale_price === null || product.wholesale_price === undefined
    ? null
    : Number(product.wholesale_price);
  const basePrice = Number(product.price) || 0;

  if (wholesalePrice !== null && minQty > 0 && qty >= minQty && wholesalePrice < basePrice) {
    return { unitPrice: wholesalePrice, isWholesale: true };
  }
  return { unitPrice: basePrice, isWholesale: false };
}

function cartProductIds(cart) {
  const ids = [];
  for (const entry of Object.values(cart)) {
    if (!entry || entry.qty <= 0) continue;
    ids.push(Number(entry.productId));
    for (const fruitId of entry.fruits || []) ids.push(Number(fruitId));
  }
  return ids;
}

// `products` lets a caller that already batch-loaded the rows (see the
// set-qty route) pass them in, so rendering the cart costs no extra queries.
async function buildCartItems(cart, { products } = {}) {
  const byId = products || (await getProductsByIds(cartProductIds(cart)));
  const items = [];
  for (const [key, entry] of Object.entries(cart)) {
    if (!entry || entry.qty <= 0) continue;
    const product = byId.get(Number(entry.productId));
    if (!product) continue;
    // Taken off sale means off sale. The storefront stops offering a product
    // the moment it's switched off, but a cart cookie written before that (or
    // edited by hand) still carries the id — and without this the line would
    // price and check out normally. Dropped the same silent way an
    // out-of-stock line is, just below.
    if (!product.active) continue;
    // Math.max(stock, 0) || entry.qty would wrongly fall through to the
    // full requested qty when stock is exactly 0 (0 is falsy) — clamp
    // explicitly instead, and drop the line if nothing is available.
    // A product marked unlimited never runs out, so there is nothing to clamp
    // against — its `stock` number is not consulted at all.
    const cappedQty = product.unlimited_stock
      ? entry.qty
      : Math.min(entry.qty, Math.max(Number(product.stock) || 0, 0));
    if (cappedQty <= 0) continue;
    const pricing = unitPriceFor(product, cappedQty);
    const subtotal = pricing.unitPrice * cappedQty;

    const fruits = (entry.fruits || [])
      .map((id) => byId.get(Number(id)))
      .filter(Boolean)
      .map((f) => ({ id: f.id, name: f.name }));

    items.push({
      key,
      product,
      qty: cappedQty,
      subtotal,
      fruits,
      unitPrice: pricing.unitPrice,
      isWholesale: pricing.isWholesale,
      savings: pricing.isWholesale ? (Number(product.price) - pricing.unitPrice) * cappedQty : 0,
    });
  }
  const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  return { items, subtotal };
}

function cartCount(cart) {
  return Object.values(cart).reduce((sum, entry) => sum + Number(entry.qty || 0), 0);
}

function addToCart(cart, productId, qty, fruits) {
  const key = makeKey(productId, fruits);
  const normalizedFruits = normalizeFruits(fruits);
  const current = Number((cart[key] && cart[key].qty) || 0);
  cart[key] = {
    productId: Number(productId),
    qty: current + Number(qty),
    ...(normalizedFruits.length ? { fruits: normalizedFruits } : {}),
  };
  return cart;
}

function setCartQty(cart, key, qty) {
  if (!cart[key]) return cart;
  if (qty <= 0) delete cart[key];
  else cart[key] = { ...cart[key], qty };
  return cart;
}

function removeFromCart(cart, key) {
  delete cart[key];
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
  cartProductIds,
  unitPriceFor,
  cartCount,
  addToCart,
  setCartQty,
  removeFromCart,
  clearCart,
  makeKey,
  normalizeFruits,
};
