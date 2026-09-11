function formatRupiah(amount) {
  const n = Math.round(Number(amount) || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes text for use inside an HTML attribute value that is itself
// wrapped in double quotes (alias kept separate for readability at call sites).
const escapeAttr = escapeHtml;

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function generateOrderNumber(id, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `PC-${y}${m}${d}-${String(id).padStart(4, '0')}`;
}

function formatDateID(dateInput) {
  // Treat a bare 'YYYY-MM-DD' as a local calendar date (not UTC midnight),
  // so the weekday/day shown always matches the date key it was built from.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? new Date(dateInput + 'T00:00:00') : new Date(dateInput);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeID(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// yyyy-mm-dd in local time (used for grouping/filtering orders by day)
function toDateKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Accepts the shapes Indonesian shoppers actually type — 08xx…, 62 8xx…,
// +62 8xx… — with spaces, dots, dashes or parentheses anywhere, and returns
// the number in canonical 62xxxxxxxxx form. Returns null when the input
// isn't a plausible Indonesian mobile number, so free text can't get through.
function normalizeWhatsapp(raw) {
  const digits = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '');
  if (!digits) return null;
  let national;
  if (digits.startsWith('62')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  // Indonesian mobile numbers always start with 8, and run 9-12 digits once
  // the leading 0 / 62 is stripped.
  if (!/^8\d{8,11}$/.test(national)) return null;
  return '62' + national;
}

function formatWhatsapp(raw) {
  const normalized = normalizeWhatsapp(raw);
  if (!normalized) return String(raw === null || raw === undefined ? '' : raw);
  const national = normalized.slice(2);
  return '+62 ' + national.replace(/^(\d{3})(\d{3,4})(\d+)$/, '$1-$2-$3');
}

// A Postgres `date` column comes back as either a plain 'YYYY-MM-DD' string
// or a Date, depending on driver version. The driver builds that Date at
// *local* midnight, so it must be read back with local getters — using UTC
// getters lands on the previous day in any positive-offset zone (WIB
// included), which is exactly where this runs.
function toDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return toDateKey(d);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

module.exports = {
  formatRupiah,
  escapeHtml,
  escapeAttr,
  csvEscape,
  generateOrderNumber,
  formatDateID,
  formatTimeID,
  toDateKey,
  slugify,
  normalizeWhatsapp,
  formatWhatsapp,
  toDateOnly,
};
