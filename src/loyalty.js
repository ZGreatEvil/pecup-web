// Loyalty: stamps, free cups, and membership tiers.
//
// Each stamp is its own row (see the `stamps` table in schema.sql) rather
// than a number derived from completed orders. That's what makes per-stamp
// dates, expiry, and "reset to zero when a free cup is claimed" possible —
// none of which a derived count can express.
const db = require('./db');
const settings = require('./settings');
const { formatShortDateID } = require('./utils');

// Jakarta is UTC+7 year-round (no daylight saving), so a fixed offset is
// exact here — not an approximation.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

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
    db.query(
      'select rewards_claimed, birthday, weekly_cup_at, birthday_cup_year from customers where id = $1',
      [customerId]
    ),
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
    weeklyCupAt: (customerRows[0] || {}).weekly_cup_at || null,
    birthdayCupYear: Number((customerRows[0] || {}).birthday_cup_year) || null,
  };
}

// Monday 00:00 WIB of the week containing `at`, as a real instant. The shop
// runs on Jakarta time, so "once a week" has to mean a Jakarta week — not
// whatever week the server happens to be in.
function weekStartWIB(at = new Date()) {
  const wib = new Date(at.getTime() + WIB_OFFSET_MS);
  const dayFromMonday = (wib.getUTCDay() + 6) % 7;
  const monday = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - dayFromMonday);
  return new Date(monday - WIB_OFFSET_MS);
}

function todayKeyWIB(at = new Date()) {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' from whatever the driver hands back for a date column — a
// Date object on some paths, a plain string on others.
function dateKeyOf(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate()
    ).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

// Which tier perks this customer can still spend. Advisory only: create_order
// re-checks both under the customer row lock before actually waiving a cup,
// so a perk shown here can never be granted twice.
function perkAvailability(status, dateKey = '') {
  const tier = (status && status.tier) || {};
  if (!status || !status.tiersEnabled) return { weekly: false, birthday: false };

  const weekly =
    Boolean(tier.weeklyFreeCup) &&
    (!status.weeklyCupAt || new Date(status.weeklyCupAt) < weekStartWIB());

  const on = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : todayKeyWIB();
  // A `date` column arrives as a Date object, whose default string form is
  // "Sat Sep 12 2026 …" — slicing that for the month/day silently never
  // matches, so the preview would hide a cup create_order then grants.
  const bday = dateKeyOf(status.birthday);
  const birthday =
    Boolean(tier.birthdayFreeCup) &&
    Boolean(bday) &&
    bday.slice(5, 10) === on.slice(5, 10) &&
    Number(status.birthdayCupYear) !== Number(on.slice(0, 4));

  return { weekly, birthday };
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

// Bulk version of expireStale: settles every lapsed card among the given
// customers in one statement. Same rule as the single-customer path — the
// clock starts at the oldest active stamp and the whole batch lapses N
// months later.
async function expireStaleMany(customerIds, months) {
  if (!customerIds.length) return;
  await db.query(
    `with due as (
       select customer_id, min(earned_at) as oldest
       from stamps
       where status = 'active' and customer_id = any($1::bigint[])
       group by customer_id
       having min(earned_at) + ($2 || ' months')::interval < now()
     )
     update stamps s set status = 'expired', settled_at = now()
     from due
     where s.customer_id = due.customer_id
       and s.status = 'active'
       and s.earned_at < due.oldest + ($2 || ' months')::interval`,
    [customerIds, String(months)]
  );
}

// Loyalty state for many customers at once — three queries total rather than
// statusFor()'s handful per customer, which is what makes a searchable list
// of every customer viable.
async function statusForMany(customerRows) {
  const all = await settings.getAll();
  const perReward = await settings.stampsPerReward();
  const months = Math.min(Math.max(Number(all.stamp_expiry_months) || 2, 1), 60);
  const tierConfig = await getTierConfig();
  const ids = customerRows.map((c) => Number(c.id));

  await expireStaleMany(ids, months);

  const stampRows = ids.length
    ? await db.query(
        `select customer_id, status, count(*)::int as n, min(earned_at) as oldest
         from stamps where customer_id = any($1::bigint[])
         group by customer_id, status`,
        [ids]
      )
    : [];

  const byCustomer = new Map();
  for (const row of stampRows) {
    const id = Number(row.customer_id);
    if (!byCustomer.has(id)) byCustomer.set(id, {});
    byCustomer.get(id)[row.status] = row;
  }

  return customerRows.map((c) => {
    const buckets = byCustomer.get(Number(c.id)) || {};
    const active = buckets.active || { n: 0, oldest: null };
    const stamps = Number(active.n) || 0;
    const claims = Number(c.rewards_claimed) || 0;
    const { current, next } = tierFor(tierConfig.tiers, claims);
    const expiresAt = expiryFor(active.oldest, months);

    return {
      id: Number(c.id),
      name: c.name,
      whatsapp: c.whatsapp,
      birthday: c.birthday || null,
      created_at: c.created_at,
      stamps,
      perReward,
      expiryMonths: months,
      expiresAt,
      expiresLabel: expiresAt ? formatShortDateID(expiresAt) : null,
      cardComplete: stamps >= perReward,
      toNextReward: Math.max(0, perReward - stamps),
      claims,
      expiredCount: Number((buckets.expired || {}).n) || 0,
      redeemedCount: Number((buckets.redeemed || {}).n) || 0,
      tiersEnabled: tierConfig.enabled,
      tier: current,
      nextTier: next,
      tierStyle: tierStyle(current.name),
    };
  });
}

// Customers (optionally filtered by a search term) with their live loyalty
// state — powers the admin's searchable Pelanggan page. `search` matches on
// name or WhatsApp number; digits typed as 08xx also match the stored 628xx
// form, since that's how people actually know their own number.
// Sorting and tier filtering happen after the loyalty state is resolved,
// because tier and stamp count are derived values, not columns.
const CUSTOMER_SORTS = {
  baru: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  lama: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  nama: (a, b) => String(a.name).localeCompare(String(b.name), 'id'),
  'nama-desc': (a, b) => String(b.name).localeCompare(String(a.name), 'id'),
  stempel: (a, b) => b.stamps - a.stamps || String(a.name).localeCompare(String(b.name), 'id'),
  'stempel-asc': (a, b) => a.stamps - b.stamps || String(a.name).localeCompare(String(b.name), 'id'),
  klaim: (a, b) => b.claims - a.claims || String(a.name).localeCompare(String(b.name), 'id'),
  tier: (a, b) => b.tier.minClaims - a.tier.minClaims || b.claims - a.claims,
  'tier-asc': (a, b) => a.tier.minClaims - b.tier.minClaims || a.claims - b.claims,
};

async function listCustomersWithLoyalty({ search = '', limit = 100, sort = 'baru', tier = '', only = '' } = {}) {
  const term = String(search || '').trim();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const columns = 'id, name, whatsapp, birthday, rewards_claimed, created_at';
  let rows;
  if (term) {
    const digits = term.replace(/\D/g, '');
    // 0812… and 62812… are the same number, so match on the number with any
    // leading zero stripped too. Guarded on digits being non-empty — a
    // letters-only search must not turn into `whatsapp like '%%'`, which
    // would quietly match every customer.
    const clauses = ['name ilike $1'];
    const params = [`%${term}%`];
    if (digits) {
      params.push(`%${digits}%`);
      clauses.push(`whatsapp like $${params.length}`);
      params.push(`%${digits.replace(/^0/, '')}%`);
      clauses.push(`whatsapp like $${params.length}`);
    }
    params.push(safeLimit);
    rows = await db.query(
      `select ${columns} from customers where ${clauses.join(' or ')}
       order by created_at desc limit $${params.length}`,
      params
    );
  } else {
    rows = await db.query(`select ${columns} from customers order by created_at desc limit $1`, [safeLimit]);
  }

  let out = await statusForMany(rows);

  if (tier) out = out.filter((c) => c.tier.name === tier);
  // Quick views an admin actually wants: who can claim right now, whose card
  // is about to lapse, and who has never claimed anything.
  if (only === 'penuh') out = out.filter((c) => c.cardComplete);
  else if (only === 'hangus-dekat') {
    const soon = Date.now() + 14 * 24 * 60 * 60 * 1000;
    out = out.filter((c) => c.stamps > 0 && c.expiresAt && new Date(c.expiresAt).getTime() <= soon);
  } else if (only === 'belum-klaim') out = out.filter((c) => c.claims === 0);

  out.sort(CUSTOMER_SORTS[sort] || CUSTOMER_SORTS.baru);
  return out;
}

async function countCustomers() {
  const rows = await db.query('select count(*)::int as n from customers');
  return Number(rows[0].n) || 0;
}

// Headline numbers for the Program Stempel page. "Cards complete" is counted
// in SQL against the current threshold rather than by walking every customer.
async function programStats() {
  const perReward = await settings.stampsPerReward();
  const [customers, claims, active, complete] = await Promise.all([
    db.query('select count(*)::int as n from customers'),
    db.query('select coalesce(sum(rewards_claimed), 0)::int as n from customers'),
    db.query("select count(*)::int as n from stamps where status = 'active'"),
    db.query(
      `select count(*)::int as n from (
         select customer_id from stamps where status = 'active'
         group by customer_id having count(*) >= $1
       ) full_cards`,
      [perReward]
    ),
  ]);
  return {
    customers: Number(customers[0].n) || 0,
    totalClaims: Number(claims[0].n) || 0,
    activeStamps: Number(active[0].n) || 0,
    cardsComplete: Number(complete[0].n) || 0,
    perReward,
  };
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
  perkAvailability,
  weekStartWIB,
  countCustomers,
  programStats,
  grantForOrder,
  revokeForOrder,
  claimReward,
  setStampCount,
  setClaims,
  listStamps,
  listCustomersWithLoyalty,
};
