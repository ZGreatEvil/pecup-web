// Loyalty: stamps, free cups, and membership tiers.
//
// Each stamp is its own row (see the `stamps` table in schema.sql) rather
// than a number derived from completed orders. That's what makes per-stamp
// dates, expiry, and "reset to zero when a free cup is claimed" possible —
// none of which a derived count can express.
const db = require('./db');
const settings = require('./settings');
const { formatShortDateID } = require('./utils');

// Defaults used until a superadmin saves their own tiers. Thresholds are on
// free cups *claimed*, so the ladder only moves when a reward is actually
// taken. Every field here is editable from the admin panel.
const DEFAULT_TIERS = [
  { name: 'Bronze', minClaims: 0, discountPercent: 0, weeklyFreeCup: false, birthdayFreeCup: false },
  { name: 'Silver', minClaims: 2, discountPercent: 3, weeklyFreeCup: false, birthdayFreeCup: false },
  { name: 'Gold', minClaims: 5, discountPercent: 5, weeklyFreeCup: false, birthdayFreeCup: true },
  { name: 'Platinum', minClaims: 10, discountPercent: 8, weeklyFreeCup: true, birthdayFreeCup: true },
];

const TIER_COLORS = {
  Bronze: { color: '#8a5a2b', bg: 'oklch(93% 0.04 65)' },
  Silver: { color: '#5a6472', bg: 'oklch(93% 0.01 250)' },
  Gold: { color: '#8a6d1f', bg: 'oklch(94% 0.07 90)' },
  Platinum: { color: '#3f5f7a', bg: 'oklch(93% 0.04 235)' },
};

function tierStyle(name) {
  return TIER_COLORS[name] || { color: 'var(--text-muted)', bg: 'var(--surface-2)' };
}

function normalizeTier(raw, index) {
  return {
    name: String(raw.name || `Tier ${index + 1}`).slice(0, 30),
    minClaims: Math.max(0, Math.round(Number(raw.minClaims) || 0)),
    discountPercent: Math.min(100, Math.max(0, Math.round(Number(raw.discountPercent) || 0))),
    weeklyFreeCup: Boolean(raw.weeklyFreeCup),
    birthdayFreeCup: Boolean(raw.birthdayFreeCup),
  };
}

async function getTierConfig() {
  const all = await settings.getAll();
  let tiers;
  try {
    const parsed = JSON.parse(all.tiers || '[]');
    tiers = Array.isArray(parsed) && parsed.length ? parsed.map(normalizeTier) : DEFAULT_TIERS;
  } catch {
    tiers = DEFAULT_TIERS;
  }
  // Ascending by threshold so "highest tier reached" is just the last match.
  tiers.sort((a, b) => a.minClaims - b.minClaims);
  return { enabled: all.tiers_enabled !== '0', tiers };
}

async function saveTierConfig({ enabled, tiers }) {
  await settings.setValue('tiers_enabled', enabled ? '1' : '0');
  await settings.setValue('tiers', JSON.stringify((tiers || []).map(normalizeTier)));
}

function tierFor(tiers, claims) {
  let current = tiers[0] || DEFAULT_TIERS[0];
  let next = null;
  for (const tier of tiers) {
    if (claims >= tier.minClaims) current = tier;
    else {
      next = next || tier;
    }
  }
  return { current, next };
}

// Stamps expire as a batch: the clock starts at the oldest active stamp and
// the whole card lapses N months later. Returns the batch's expiry instant,
// or null when there's nothing active.
function expiryFor(oldestEarnedAt, months) {
  if (!oldestEarnedAt) return null;
  const start = new Date(oldestEarnedAt);
  const expires = new Date(start);
  expires.setMonth(expires.getMonth() + months);
  return expires;
}

// Marks a lapsed batch expired. Done lazily on read so there's no cron job to
// run — the first page view after the deadline settles it.
async function expireStale(customerId, months) {
  const rows = await db.query(
    "select min(earned_at) as oldest from stamps where customer_id = $1 and status = 'active'",
    [customerId]
  );
  const oldest = rows[0] && rows[0].oldest;
  if (!oldest) return 0;
  const expires = expiryFor(oldest, months);
  if (!expires || Date.now() < expires.getTime()) return 0;

  const expired = await db.query(
    `update stamps set status = 'expired', settled_at = now()
     where customer_id = $1 and status = 'active' and earned_at < $2 returning id`,
    [customerId, expires.toISOString()]
  );
  return expired.length;
}

async function statusFor(customerId) {
  const all = await settings.getAll();
  const perReward = await settings.stampsPerReward();
  const months = Math.min(Math.max(Number(all.stamp_expiry_months) || 2, 1), 60);

  await expireStale(customerId, months);

  const [stampRows, customerRows, tierConfig] = await Promise.all([
    db.query(
      `select status, min(earned_at) as oldest, max(earned_at) as newest, count(*)::int as n
       from stamps where customer_id = $1 group by status`,
      [customerId]
    ),
    db.query('select rewards_claimed, birthday from customers where id = $1', [customerId]),
    getTierConfig(),
  ]);

  const byStatus = {};
  for (const row of stampRows) byStatus[row.status] = row;
  const active = byStatus.active || { n: 0, oldest: null };
  const stamps = Number(active.n) || 0;
  const claims = Number((customerRows[0] || {}).rewards_claimed) || 0;

  const { current, next } = tierFor(tierConfig.tiers, claims);
  const expiresAt = expiryFor(active.oldest, months);

  return {
    stamps,
    perReward,
    expiryMonths: months,
    expiresAt,
    expiresLabel: expiresAt ? formatShortDateID(expiresAt) : null,
    // Stamps reset to zero on claim, so a card is either complete or not —
    // there's no "banked rewards" count any more.
    cardComplete: stamps >= perReward,
    toNextReward: Math.max(0, perReward - stamps),
    claims,
    expiredCount: Number((byStatus.expired || {}).n) || 0,
    tiersEnabled: tierConfig.enabled,
    tier: current,
    nextTier: next,
    tierStyle: tierStyle(current.name),
    birthday: (customerRows[0] || {}).birthday || null,
  };
}

// Called when an order reaches 'selesai'. The unique index on order_id makes
// this idempotent, so re-completing an order can't mint a second stamp.
async function grantForOrder(customerId, orderId) {
  if (!customerId || !orderId) return false;
  const rows = await db.query(
    `insert into stamps (customer_id, order_id) values ($1, $2)
     on conflict (order_id) do nothing returning id`,
    [customerId, orderId]
  );
  return rows.length > 0;
}

// Called when an order moves back out of 'selesai'. An already-spent stamp is
// left alone — the free cup was handed over, so taking it back isn't right.
async function revokeForOrder(orderId) {
  if (!orderId) return false;
  const rows = await db.query(
    "delete from stamps where order_id = $1 and status = 'active' returning id",
    [orderId]
  );
  return rows.length > 0;
}

// Spends a full card: every active stamp is marked redeemed (so the count
// goes back to zero) and the claim counter — which drives the tier — ticks up.
async function claimReward(customerId, { note } = {}) {
  const status = await statusFor(customerId);
  if (!status.cardComplete) return { ok: false, error: 'Kartu stempel belum penuh.' };

  await db.query(
    `update stamps set status = 'redeemed', settled_at = now(), note = $2
     where customer_id = $1 and status = 'active'`,
    [customerId, note || null]
  );
  await db.query('update customers set rewards_claimed = rewards_claimed + 1 where id = $1', [customerId]);
  return { ok: true };
}

// Superadmin sets the stamp count outright: trims the newest stamps or adds
// manual ones, so the resulting active count matches exactly.
async function setStampCount(customerId, target, { by } = {}) {
  const safeTarget = Math.max(0, Math.round(Number(target) || 0));
  const rows = await db.query(
    "select id from stamps where customer_id = $1 and status = 'active' order by earned_at asc, id asc",
    [customerId]
  );
  const current = rows.length;

  if (safeTarget < current) {
    const removing = rows.slice(safeTarget).map((r) => r.id);
    await db.query('delete from stamps where id = any($1::bigint[])', [removing]);
  } else if (safeTarget > current) {
    for (let i = 0; i < safeTarget - current; i += 1) {
      await db.query('insert into stamps (customer_id, note) values ($1, $2)', [
        customerId,
        by ? `Ditambahkan manual oleh ${by}` : 'Ditambahkan manual',
      ]);
    }
  }
  return statusFor(customerId);
}

async function setClaims(customerId, claims) {
  const safe = Math.max(0, Math.round(Number(claims) || 0));
  await db.query('update customers set rewards_claimed = $1 where id = $2', [safe, customerId]);
  return statusFor(customerId);
}

// Everyone who has an account, with their live loyalty state — powers the
// superadmin's Pelanggan & Stempel page.
async function listCustomersWithLoyalty() {
  const rows = await db.query('select id from customers order by created_at desc');
  const out = [];
  for (const row of rows) {
    const id = Number(row.id);
    const [customer, status] = await Promise.all([
      db.query('select id, name, whatsapp, birthday, created_at from customers where id = $1', [id]),
      statusFor(id),
    ]);
    const c = customer[0];
    out.push({
      id,
      name: c.name,
      whatsapp: c.whatsapp,
      birthday: c.birthday,
      created_at: c.created_at,
      ...status,
    });
  }
  return out;
}

// The stamp history shown on the customer's own profile.
async function listStamps(customerId, limit = 60) {
  return db.query(
    'select id, order_id, earned_at, status, settled_at, note from stamps where customer_id = $1 order by earned_at desc limit $2',
    [customerId, limit]
  );
}

module.exports = {
  DEFAULT_TIERS,
  getTierConfig,
  saveTierConfig,
  tierStyle,
  statusFor,
  grantForOrder,
  revokeForOrder,
  claimReward,
  setStampCount,
  setClaims,
  listStamps,
  listCustomersWithLoyalty,
};
