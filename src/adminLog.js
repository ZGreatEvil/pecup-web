// Audit trail of admin actions — who did what, when (see the admin_logs
// table in schema.sql). Logging failures are swallowed on purpose: an
// audit-log write should never be the reason an actual admin action fails.
const db = require('./db');

async function logAdminAction(admin, action, detail) {
  try {
    await db.query(
      'insert into admin_logs (admin_id, admin_username, action, detail) values ($1, $2, $3, $4)',
      [admin.adminId || admin.id, admin.username, action, detail || null]
    );
  } catch (err) {
    console.error('Gagal mencatat log admin:', err.message);
  }
}

// Paged + filtered view for the Log Aktivitas page. Date bounds are WIB
// calendar days ('YYYY-MM-DD' from the date pickers), converted to an
// instant range so they line up with what the timestamps display as.
async function queryAdminLogs({
  page = 1,
  perPage = 25,
  sort = 'desc',
  username = '',
  action = '',
  from = '',
  to = '',
} = {}) {
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

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
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

module.exports = { logAdminAction, queryAdminLogs, listLogFilters };
