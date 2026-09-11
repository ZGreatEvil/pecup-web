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

async function listAdminLogs(limit = 200) {
  return db.query('select * from admin_logs order by created_at desc limit $1', [limit]);
}

module.exports = { logAdminAction, listAdminLogs };
