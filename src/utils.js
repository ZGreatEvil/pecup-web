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

// Everything user-facing is rendered in Jakarta time (WIB, UTC+7),
// explicitly — never in the server's local zone. Vercel runs functions in
// UTC, so relying on the default would show every timestamp 7 hours early
// and, worse, file a 6am order under the previous calendar day.
const TIMEZONE = 'Asia/Jakarta';

function formatDateID(dateInput) {
  // Treat a bare 'YYYY-MM-DD' as noon UTC so the WIB conversion can't slip
  // to the neighbouring day in either direction.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? new Date(dateInput + 'T12:00:00Z') : new Date(dateInput);
  return d.toLocaleDateString('id-ID', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeID(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleTimeString('id-ID', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeID(dateInput) {
  return `${formatShortDateID(dateInput)}, ${formatTimeID(dateInput)} WIB`;
}

function formatShortDateID(dateInput) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? new Date(dateInput + 'T12:00:00Z') : new Date(dateInput);
  return d.toLocaleDateString('id-ID', { timeZone: TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

// yyyy-mm-dd as it reads on a Jakarta wall clock (used for grouping and
// filtering orders by day). 'en-CA' is the locale that formats as YYYY-MM-DD.
function toDateKey(dateInput) {
  const d = new Date(dateInput);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
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

// The three order states, in the order they progress. 'selesai' is what
// earns a loyalty stamp (see customerAuth.loyaltyStatus).
const ORDER_STATUSES = [
  { value: 'menunggu', label: 'Menunggu Verifikasi', color: '#a15a1f', bg: 'oklch(94% 0.06 55)' },
  { value: 'diproses', label: 'Diproses', color: '#1f5aa1', bg: 'oklch(93% 0.05 245)' },
  { value: 'selesai', label: 'Selesai', color: '#3f7a42', bg: 'oklch(94% 0.05 152)' },
  // Cancelling returns the reserved cups to stock — without this state, a
  // fake transfer or a mistaken order would hold stock hostage forever.
  { value: 'dibatalkan', label: 'Dibatalkan', color: '#a13f3f', bg: '#f6dcdc' },
];

// Statuses that still hold stock. A cancelled order has already given it back.
const ACTIVE_ORDER_STATUSES = ['menunggu', 'diproses', 'selesai'];

function orderStatus(value) {
  return ORDER_STATUSES.find((s) => s.value === value) || ORDER_STATUSES[0];
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
  formatShortDateID,
  formatDateTimeID,
  formatTimeID,
  toDateKey,
  TIMEZONE,
  slugify,
  normalizeWhatsapp,
  formatWhatsapp,
  toDateOnly,
  ORDER_STATUSES,
  ACTIVE_ORDER_STATUSES,
  orderStatus,
};
