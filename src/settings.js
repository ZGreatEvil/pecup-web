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
  // Which days the shop actually delivers on — a pre-order shop that only
  // makes cups on, say, Wednesday and Saturday sets those here and the
  // storefront offers nothing else. Empty = every day, which is how it ships,
  // so a shop that doesn't need this sees no change at all.
  //   delivery_days          — CSV of weekday numbers, 0=Sunday … 6=Saturday
  //   delivery_closed_dates  — CSV of 'YYYY-MM-DD' that are shut even though
  //                            their weekday is open (holidays, stock-taking)
  //   delivery_open_dates    — CSV of 'YYYY-MM-DD' open even though their
  //                            weekday isn't (a one-off market day)
  //   delivery_horizon_days  — how far ahead the date list runs
  delivery_days: '',
  delivery_closed_dates: '',
  delivery_open_dates: '',
  delivery_horizon_days: '14',
  // How the shopper picks that date. The rules above decide what is OPEN; this
  // only decides how it's presented, and the two are interchangeable at any
  // time without changing which dates are allowed:
  //   'kalender' — the normal date picker (what the shop has always had)
  //   'pilihan'  — a list of the open dates only, so nothing invalid is even
  //                offered. Suits a pre-order shop that cooks on set days.
  delivery_date_mode: 'kalender',
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
    // Which days may be delivered on, and how the shopper is asked to pick.
    // `delivery` is the rule set; `deliveryMode` is only presentation.
    delivery: deliveryRules(all),
    deliveryMode: all.delivery_date_mode === 'pilihan' ? 'pilihan' : 'kalender',
  };
}

// --- which days orders can be delivered on --------------------------------
// All of this works in Jakarta days. The server runs in GMT, so asking
// JavaScript for "today" or "what weekday is this" without shifting first
// would roll over seven hours early and quietly offer the wrong dates.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' for an instant, in Jakarta. */
function dateKeyWIB(at = new Date()) {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day of the week (0=Sunday) for a 'YYYY-MM-DD' key, read as a Jakarta day. */
function weekdayOf(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function csvSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** The delivery-day rules, normalised. `everyDay` is true when nothing limits them. */
function deliveryRules(all) {
  // The empty pieces are dropped BEFORE Number(), not after: Number('') is 0,
  // so an unset value would otherwise parse as "Sunday only" and quietly shut
  // the shop for six days a week.
  const days = new Set(
    String(all.delivery_days || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  );
  const closed = csvSet(all.delivery_closed_dates);
  const open = csvSet(all.delivery_open_dates);
  const horizonRaw = Number(all.delivery_horizon_days);
  const horizon = Number.isFinite(horizonRaw) && horizonRaw >= 1 ? Math.min(60, Math.round(horizonRaw)) : 14;
  return { days, closed, open, horizon, everyDay: days.size === 0 && closed.size === 0 && open.size === 0 };
}

/**
 * Can an order be delivered on this date?
 * An explicitly opened date always can; an explicitly closed one never can;
 * otherwise it follows the weekday rule (and with no weekday rule, every day
 * is open — the shipped default).
 */
function isDeliveryDateOpen(config, dateKey) {
  const rules = config.delivery || deliveryRules({});
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false;
  if (rules.open.has(dateKey)) return true;
  if (rules.closed.has(dateKey)) return false;
  if (rules.days.size === 0) return true;
  return rules.days.has(weekdayOf(dateKey));
}

/**
 * The dates a shopper may actually choose right now: open by the rules above,
 * not in the past, and not today once the same-day cut-off has passed.
 */
function openDeliveryDates(config, { from = dateKeyWIB(), max = 0 } = {}) {
  const rules = config.delivery || deliveryRules({});
  const limit = max > 0 ? max : rules.horizon;
  const todayKey = dateKeyWIB();
  const cutoffPassed =
    Boolean(config.sameDayCutoff) && nowWIB() >= config.sameDayCutoff;

  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i <= limit && out.length < 60; i += 1) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    if (key < todayKey) continue;
    if (key === todayKey && cutoffPassed) continue;
    if (isDeliveryDateOpen(config, key)) out.push(key);
  }
  return out;
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

module.exports = {
  getAll,
  stampsPerReward,
  setValue,
  shopConfig,
  deliveryFeeFor,
  taxRateFor,
  taxOn,
  nowWIB,
  dateKeyWIB,
  weekdayOf,
  deliveryRules,
  isDeliveryDateOpen,
  openDeliveryDates,
};
