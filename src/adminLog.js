// Audit trail of admin actions — who did what, when (see the admin_logs
// table in schema.sql). Logging failures are swallowed on purpose: an
// audit-log write should never be the reason an actual admin action fails.
const db = require('./db');

// The username is stored alongside the id on purpose. Deleting an admin
// account sets admin_id to null (see the foreign key in schema.sql) and leaves
// every entry standing — an audit trail that disappears with the account it
// accuses is no audit trail at all.
async function logAdminAction(admin, action, detail) {
  const adminId = admin.adminId || admin.id;
  try {
    await db.query(
      'insert into admin_logs (admin_id, admin_username, action, detail) values ($1, $2, $3, $4)',
      [adminId, admin.username, action, detail || null]
    );
  } catch (err) {
    // 23503 = the account was deleted between this request signing in and the
    // action finishing. Record it anyway, unlinked — the same state a row ends
    // up in after a deletion. Losing the entry would be the worse outcome.
    if (err && (err.code === '23503' || /foreign key/i.test(err.message || ''))) {
      try {
        await db.query(
          'insert into admin_logs (admin_id, admin_username, action, detail) values (null, $1, $2, $3)',
          [admin.username, action, detail || null]
        );
        return;
      } catch (retryErr) {
        console.error('Gagal mencatat log admin:', retryErr.message);
        return;
      }
    }
    console.error('Gagal mencatat log admin:', err.message);
  }
}

// Turns a before/after pair into a plain list of what actually changed, so a
// log line says "harga 18.000 → 20.000, stok 25 → 30" instead of just naming
// the product and leaving the reader to guess. Fields that didn't move are
// left out entirely — the point is to make the change readable at a glance.
//
// Each field is { key, label, format? } or { get, label, format? }.
function describeChanges(before, after, fields) {
  const parts = [];
  const show = (v) => {
    if (v === null || v === undefined || v === '') return '(kosong)';
    return String(v);
  };
  for (const field of fields) {
    const rawFrom = field.get ? field.get(before) : before[field.key];
    const rawTo = field.get ? field.get(after) : after[field.key];
    const from = field.format ? field.format(rawFrom) : rawFrom;
    const to = field.format ? field.format(rawTo) : rawTo;
    if (show(from) === show(to)) continue;
    parts.push(`${field.label} ${show(from)} → ${show(to)}`);
  }
  return parts;
}

/** describeChanges, joined for a log detail — or a plain note when nothing moved. */
function changeSummary(before, after, fields, { nothing = 'tidak ada perubahan' } = {}) {
  const parts = describeChanges(before, after, fields);
  return parts.length ? parts.join(', ') : nothing;
}

// Paged + filtered view for the Log Aktivitas page. Date bounds are WIB
// calendar days ('YYYY-MM-DD' from the date pickers), converted to an
// instant range so they line up with what the timestamps display as.
// One filter builder for both the paged table and the CSV export, so a
// download can never contain a different set of rows than the screen it was
// started from.
function logFilterSql({ username = '', action = '', from = '', to = '' } = {}) {
  const where = [];
  const params = [];

  if (username) {
    params.push(username);
    where.push(`admin_username = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`action = $${params.length}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    params.push(`${from} 00:00:00+07`);
    where.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    params.push(`${to} 23:59:59.999+07`);
    where.push(`created_at <= $${params.length}::timestamptz`);
  }
  return { whereSql: where.length ? `where ${where.join(' and ')}` : '', params };
}

async function queryAdminLogs({
  page = 1,
  perPage = 25,
  sort = 'desc',
  username = '',
  action = '',
  from = '',
  to = '',
} = {}) {
  const { whereSql, params } = logFilterSql({ username, action, from, to });
  const direction = sort === 'asc' ? 'asc' : 'desc';
  const safePerPage = Math.min(Math.max(Number(perPage) || 25, 5), 100);

  const countRows = await db.query(`select count(*)::int as total from admin_logs ${whereSql}`, params);
  const total = Number(countRows[0].total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const offset = (safePage - 1) * safePerPage;

  const rows = await db.query(
    `select * from admin_logs ${whereSql} order by created_at ${direction}, id ${direction}
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, safePerPage, offset]
  );

  return { logs: rows, total, totalPages, page: safePage, perPage: safePerPage, sort: direction };
}

// Powers the filter dropdowns, so they only ever offer values that exist.
async function listLogFilters() {
  const [admins, actions] = await Promise.all([
    db.query('select distinct admin_username from admin_logs order by admin_username'),
    db.query('select distinct action from admin_logs order by action'),
  ]);
  return {
    admins: admins.map((r) => r.admin_username),
    actions: actions.map((r) => r.action),
  };
}

// Every matching row, for the CSV export — not just the page on screen.
// Capped so a runaway export can't exhaust the function's memory.
async function queryAllAdminLogs({ sort = 'desc', username = '', action = '', from = '', to = '', limit = 20000 } = {}) {
  const { whereSql, params } = logFilterSql({ username, action, from, to });
  const direction = sort === 'asc' ? 'asc' : 'desc';
  return db.query(
    `select * from admin_logs ${whereSql} order by created_at ${direction}, id ${direction} limit $${params.length + 1}`,
    [...params, Math.min(Math.max(Number(limit) || 20000, 1), 50000)]
  );
}

module.exports = {
  logAdminAction,
  describeChanges,
  changeSummary,
  queryAdminLogs,
  queryAllAdminLogs,
  listLogFilters,
};
