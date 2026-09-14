// Shop-wide settings a superadmin can change from the admin panel without a
// redeploy (see the `settings` table in schema.sql).
const db = require('./db');

// 'HH:MM' right now in Jakarta. Fixed +7 offset — Indonesia has no DST, so
// this is exact rather than an approximation.
function nowWIB(at = new Date()) {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

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
  // PPN (Indonesian VAT). Off until someone ticks the box in Pengaturan Toko:
  // a shop that isn't registered as a PKP must not charge it, so this ships
  // switched off and changes nothing until it's turned on. The rate is a
  // stored value rather than a constant because it has moved before (10 → 11).
  tax_enabled: '0',
  tax_percent: '11',
  same_day_cutoff: '', // 'HH:MM' in WIB; empty = same-day always allowed
  // Opening hours in WIB. Outside them the shop is closed automatically, the
  // same as flipping the switch off. Empty = no hour limit.
  open_time: '',
  close_time: '',
  // Data retention (see src/retention.js). Orders are never deleted; these
  // only govern payment-proof files and the activity log. 0 = keep forever.
  retention_proof_days: '90',
  retention_log_months: '12',
  last_prune_at: '',
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
  const time = (key) => (/^\d{2}:\d{2}$/.test(all[key] || '') ? all[key] : '');
  const cutoff = time('same_day_cutoff');
  const openTime = time('open_time');
  const closeTime = time('close_time');

  // "Open" is the switch AND the clock. Both are checked here, once, so every
  // surface (banner, cart, checkout, the order insert) agrees.
  const switchedOn = all.shop_open !== '0';
  const nowHM = nowWIB();
  let withinHours = true;
  if (openTime && closeTime) {
    // A window that ends before it starts runs past midnight (e.g. 18:00-02:00).
    withinHours = closeTime > openTime
      ? nowHM >= openTime && nowHM < closeTime
      : nowHM >= openTime || nowHM < closeTime;
  } else if (openTime) withinHours = nowHM >= openTime;
  else if (closeTime) withinHours = nowHM < closeTime;

  return {
    open: switchedOn && withinHours,
    switchedOn,
    withinHours,
    openTime,
    closeTime,
    hoursLabel: openTime && closeTime ? `${openTime}-${closeTime} WIB` : '',
    notice: all.shop_notice || '',
    whatsapp: all.shop_whatsapp || '',
    minOrder: num('min_order'),
    deliveryFee: num('delivery_fee'),
    freeDeliveryOver: num('free_delivery_over'),
    sameDayCutoff: cutoff,
    // taxEnabled is the tick itself; taxPercent is the rate it would charge.
    // Everything that prices an order uses taxRateFor() below instead, which
    // is 0 whenever the box is off — so one place decides, not each caller.
    taxEnabled: all.tax_enabled === '1',
    taxPercent: Math.min(100, num('tax_percent')),
  };
}

/** The percentage actually charged right now — 0 unless the box is ticked. */
function taxRateFor(config) {
  if (!config || !config.taxEnabled) return 0;
  const percent = Number(config.taxPercent) || 0;
  return percent > 0 && percent <= 100 ? Math.round(percent) : 0;
}

// PPN on an already-discounted amount. Rounded down, the same direction every
// other discount in this shop rounds, so the preview and create_order (integer
// division in Postgres) can never disagree by a rupiah.
function taxOn(base, percent) {
  const rate = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (!rate) return 0;
  return Math.floor((Math.max(0, Math.round(Number(base) || 0)) * rate) / 100);
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

module.exports = { getAll, stampsPerReward, setValue, shopConfig, deliveryFeeFor, taxRateFor, taxOn, nowWIB };
