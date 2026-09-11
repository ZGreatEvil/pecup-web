// Shop-wide settings a superadmin can change from the admin panel without a
// redeploy (see the `settings` table in schema.sql).
const db = require('./db');

const DEFAULTS = {
  stamps_per_reward: '10',
};

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

module.exports = { getAll, stampsPerReward, setValue };
