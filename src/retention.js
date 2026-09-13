// Data retention: keeps the shop inside the free storage tiers without ever
// throwing away a transaction.
//
// The orders themselves are the business record and are never deleted — at
// roughly 2 KB each they'd take a decade to matter. What actually fills up is
// the private Blob store holding payment-proof photos (phone cameras produce
// 2–4 MB files), and the activity log, which grows by rows rather than bytes.
// So:
//   proofs  — deleted once an order is older than `retention_proof_days`.
//             A proof exists to verify a transfer; that happens within days.
//             The order keeps its amount, items, status and date.
//   logs    — deleted past `retention_log_months`.
//
// Everything here is driven by settings a superadmin can change, and every
// step is safe to run twice.
const db = require('./db');
const settings = require('./settings');
const { list, del } = require('@vercel/blob');

const DEFAULT_PROOF_DAYS = 90;
const DEFAULT_LOG_MONTHS = 12;
// The sweep is idempotent, so the only cost of running it twice in a day is
// two wasted Blob listings. This guard keeps that from happening on every
// admin page load.
const MIN_HOURS_BETWEEN_RUNS = 20;

function proofsToken() {
  return process.env.PROOFS_BLOB_READ_WRITE_TOKEN || '';
}

async function policy() {
  const all = await settings.getAll();
  const days = Number(all.retention_proof_days);
  const months = Number(all.retention_log_months);
  return {
    // 0 means "keep forever" for both, which is a legitimate choice — a shop
    // that upgrades its plan may simply not want any of this running.
    proofDays: Number.isFinite(days) && days >= 0 ? Math.round(days) : DEFAULT_PROOF_DAYS,
    logMonths: Number.isFinite(months) && months >= 0 ? Math.round(months) : DEFAULT_LOG_MONTHS,
  };
}

// Every object currently in the proofs store, following pagination.
async function listAllProofBlobs(token) {
  const out = [];
  let cursor;
  do {
    const page = await list({ token, prefix: 'bukti-', cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  return out;
}

// Deletes proof files for orders older than `days`, and any orphaned upload
// of the same age (a checkout that failed after the file went up). Returns
// what it did rather than logging, so the caller decides how to report.
async function pruneProofs(days, { dryRun = false } = {}) {
  if (!days) return { skipped: 'retensi bukti transfer dimatikan', files: 0, orders: 0 };
  const token = proofsToken();
  if (!token) return { skipped: 'PROOFS_BLOB_READ_WRITE_TOKEN tidak diatur', files: 0, orders: 0 };

  const cutoffRows = await db.query(`select (now() - ($1 || ' days')::interval) as cutoff`, [String(days)]);
  const cutoff = new Date(cutoffRows[0].cutoff);

  const expired = await db.query(
    `select id, proof_filename from orders
     where proof_filename is not null and created_at < $1`,
    [cutoff]
  );
  const expiredPaths = new Set(expired.map((o) => o.proof_filename));

  // Anything still referenced by an order inside the window must survive.
  const keepRows = await db.query(
    `select proof_filename from orders
     where proof_filename is not null and created_at >= $1`,
    [cutoff]
  );
  const keep = new Set(keepRows.map((o) => o.proof_filename));

  const blobs = await listAllProofBlobs(token);
  const doomed = blobs.filter((b) => {
    if (keep.has(b.pathname)) return false;
    if (expiredPaths.has(b.pathname)) return true;
    // Orphan: no order points at it. Judge it by its own age.
    return new Date(b.uploadedAt) < cutoff;
  });

  if (dryRun) return { files: doomed.length, orders: expired.length, bytes: doomed.reduce((s, b) => s + (b.size || 0), 0) };

  let deleted = 0;
  let bytes = 0;
  for (const blob of doomed) {
    try {
      await del(blob.url, { token });
      deleted += 1;
      bytes += blob.size || 0;
    } catch (err) {
      console.error(`retention: gagal hapus ${blob.pathname}: ${err.message}`);
    }
  }
  // Clear the pointers even for files that failed to delete — a dangling
  // path renders as a broken image on the admin order page.
  if (expired.length) {
    await db.query(
      `update orders set proof_filename = null where id = any($1::bigint[])`,
      [expired.map((o) => Number(o.id))]
    );
  }
  return { files: deleted, orders: expired.length, bytes };
}

// Product videos are uploaded straight from the admin's browser BEFORE the
// product is saved, so an abandoned form — or a save that bounced, or a clip
// the admin changed their mind about — leaves a file in the public store that
// nothing points at. Nobody would ever find it to delete it by hand.
//
// Only clips with no product referencing them are touched, and only once
// they're a day old, so a video being uploaded right now is never swept out
// from under the admin filling in the form.
const ORPHAN_VIDEO_GRACE_MS = 24 * 60 * 60 * 1000;

async function pruneOrphanVideos({ dryRun = false, graceMs = ORPHAN_VIDEO_GRACE_MS } = {}) {
  const token = process.env.PRODUCTS_BLOB_READ_WRITE_TOKEN || '';
  if (!token) return { skipped: 'PRODUCTS_BLOB_READ_WRITE_TOKEN tidak diatur', files: 0 };

  const blobs = [];
  let cursor;
  do {
    const page = await list({ token, prefix: 'produk-video-', cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  if (!blobs.length) return { files: 0, bytes: 0 };

  // Every url any product points at, primary photo included.
  const rows = await db.query('select image, images from products');
  const referenced = new Set();
  for (const row of rows) {
    if (row.image) referenced.add(row.image);
    for (const url of row.images || []) referenced.add(url);
  }

  // graceMs is a parameter only so the deletion path can be tested without
  // waiting a day; the sweep itself always uses the full grace period.
  const cutoff = Date.now() - Math.max(0, Number(graceMs) || 0);
  const doomed = blobs.filter((b) => !referenced.has(b.url) && Date.parse(b.uploadedAt) < cutoff);
  if (dryRun) return { files: doomed.length, bytes: doomed.reduce((s, b) => s + (b.size || 0), 0) };

  let deleted = 0;
  let bytes = 0;
  for (const blob of doomed) {
    try {
      await del(blob.url, { token });
      deleted += 1;
      bytes += blob.size || 0;
    } catch (err) {
      console.error(`retention: gagal hapus ${blob.pathname}: ${err.message}`);
    }
  }
  return { files: deleted, bytes };
}

async function pruneLogs(months, { dryRun = false } = {}) {
  if (!months) return { skipped: 'retensi log dimatikan', rows: 0 };
  const where = `created_at < now() - ($1 || ' months')::interval`;
  if (dryRun) {
    const rows = await db.query(`select count(*)::int as n from admin_logs where ${where}`, [String(months)]);
    return { rows: Number(rows[0].n) || 0 };
  }
  const deleted = await db.query(`delete from admin_logs where ${where} returning id`, [String(months)]);
  return { rows: deleted.length };
}

// The whole sweep. `force` skips the once-a-day guard (the cron route and the
// CLI script both pass it); the lazy caller doesn't.
async function runRetention({ force = false, dryRun = false } = {}) {
  const { proofDays, logMonths } = await policy();

  if (!force && !dryRun) {
    const all = await settings.getAll({ fresh: true });
    const last = all.last_prune_at ? Date.parse(all.last_prune_at) : 0;
    if (last && Date.now() - last < MIN_HOURS_BETWEEN_RUNS * 60 * 60 * 1000) {
      return { ran: false, reason: 'sudah dijalankan hari ini' };
    }
    // Claimed before the work starts: two serverless invocations landing at
    // the same moment must not both sweep.
    await settings.setValue('last_prune_at', new Date().toISOString());
  }

  const proofs = await pruneProofs(proofDays, { dryRun });
  const logs = await pruneLogs(logMonths, { dryRun });
  // Not tied to a retention setting: an unreferenced clip isn't data anyone
  // chose to keep, it's a file left behind by an abandoned upload.
  const videos = await pruneOrphanVideos({ dryRun });

  if (!dryRun) await settings.setValue('last_prune_at', new Date().toISOString());
  return { ran: true, proofDays, logMonths, proofs, logs, videos };
}

module.exports = {
  runRetention,
  pruneProofs,
  pruneOrphanVideos,
  pruneLogs,
  policy,
  DEFAULT_PROOF_DAYS,
  DEFAULT_LOG_MONTHS,
};
