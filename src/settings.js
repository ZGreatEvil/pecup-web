// Shop-wide settings a superadmin can change from the admin panel without a
// redeploy (see the `settings` table in schema.sql).
const db = require('./db');

const DEFAULTS = {
  stamps_per_reward: '10',
  // Operational settings a shop actually needs day to day: closing for a
  // holiday, a minimum order, a delivery fee, and a cut-off after which
  // same-day delivery isn't offered any more.
  shop_open: '1',
  shop_notice: '',
  // The shop's own WhatsApp number, in 62xxxxxxxxx form. Used for the
  // "contact admin" links (password resets, order questions).
  shop_whatsapp: '',
  min_order: '0',
  delivery_fee: '0',
  free_delivery_over: '0', // 0 = never free
  same_day_cutoff: '', // 'HH:MM' in WIB; empty = same-day always allowed
};

// Everything the storefront needs to know about how the shop is operating
// right now, normalised and clamped so a bad value in the table can't take
// checkout down.
async function shopConfig() {
  const all = await getAll();
  const num = (key) => {
    const n = Number(all[key]);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const cutoff = /^\d{2}:\d{2}$/.test(all.same_day_cutoff || '') ? all.same_day_cutoff : '';
  return {
    open: all.shop_open !== '0',
    notice: all.shop_notice || '',
    whatsapp: all.shop_whatsapp || '',
    minOrder: num('min_order'),
    deliveryFee: num('delivery_fee'),
    freeDeliveryOver: num('free_delivery_over'),
    sameDayCutoff: cutoff,
  };
}

// What this particular order pays to have it delivered.
function deliveryFeeFor(config, subtotal) {
  if (!config.deliveryFee) return 0;
  if (config.freeDeliveryOver > 0 && subtotal >= config.freeDeliveryOver) return 0;
  return config.deliveryFee;
}

// Cached per warm serverless instance so the loyalty card doesn't cost an
// extra round-trip on every page. Short TTL so a change propagates quickly
// across instances without needing any invalidation plumbing.
const CACHE_TTL_MS = 30 * 1000;
let cache = null;
let cachedAt = 0;

async function getAll({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  const rows = await db.query('select key, value from settings');
  const values = { ...DEFAULTS };
  for (const row of rows) values[row.key] = row.value;
  cache = values;
  cachedAt = Date.now();
  return values;
}

async function stampsPerReward() {
  const values = await getAll();
  const n = Number(values.stamps_per_reward);
  // Guard the whole app against a nonsense value in the table — a 0 here
  // would make every loyalty calculation divide by zero.
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : 10;
}

async function setValue(key, value) {
  await db.query(
    `insert into settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, String(value)]
  );
  cache = null;
}

module.exports = { getAll, stampsPerReward, setValue, shopConfig, deliveryFeeFor };
